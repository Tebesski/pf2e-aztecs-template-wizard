import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { requestPlayerChoiceDialog } from "../runtime/index.mjs"
import { readAutomation } from "../sheet/automation-storage.mjs"
import { escapeHTML, renderModuleTemplate } from "../common/html.mjs"
import {
   clearRegionFootprintCache,
   computeRegionBounds,
   findTileAttachmentConfig,
   getActiveTemplateShapeType,
   getRegionFootprint,
   tileAttachmentAppliesToShape,
   tileDataForBounds,
} from "./geometry.mjs"
import { createAttachedLights, soundPlacement } from "./attached-media.mjs"
import { activeDialogUserIdForRegion } from "./dialog-users.mjs"
import { tryFromUuid } from "./documents.mjs"
import { isCurrentUserActiveGM } from "./effect-lifecycle.mjs"
import {
   liveEmbeddedUpdates,
   sortWallsForSync,
   spawnDestroyableWallActors,
   syncDestroyableWallActorsForEntry,
} from "./destroyable-walls.mjs"
function wallsFromBoundary(footprint, region, entry) {
   const settings = entry.system ?? {}
   const restriction = {
      move: Number(settings.move ?? 20),
      light: Number(settings.light ?? 20),
      sight: Number(settings.sight ?? 20),
      sound: Number(settings.sound ?? 20),
      dir: Number(settings.dir ?? 0),
   }
   const out = []
   for (const edge of footprint.boundaryEdges) {
      const a = edge.a,
         b = edge.b
      if (a.x === b.x && a.y === b.y) continue
      out.push({
         c: [a.x, a.y, b.x, b.y],
         ...restriction,
         flags: {
            [FLAG_SCOPE]: {
               managed: true,
               attachedToRegion: region.uuid,
               attachmentId: entry.id ?? null,
            },
         },
      })
   }
   return out
}

function filterWallsToSide(walls, bounds, side, region = null) {
   const sideNormal = sideNormalForRegion(region, side)
   if (sideNormal) {
      const normalFiltered = walls.filter((w) => {
         const [x1, y1, x2, y2] = w.c
         const dx = x2 - x1
         const dy = y2 - y1
         const len = Math.hypot(dx, dy)
         if (len <= 0) return false
         const outward = { x: dy / len, y: -dx / len }
         return outward.x * sideNormal.x + outward.y * sideNormal.y > 0.5
      })
      if (normalFiltered.length > 0) return normalFiltered
   }

   const eps = 1.0
   const onSide = (x, y) => {
      if (side === "top") return Math.abs(y - bounds.y) <= eps
      if (side === "bottom")
         return Math.abs(y - (bounds.y + bounds.height)) <= eps
      if (side === "left") return Math.abs(x - bounds.x) <= eps
      if (side === "right")
         return Math.abs(x - (bounds.x + bounds.width)) <= eps
      return false
   }
   return walls.filter((w) => {
      const [x1, y1, x2, y2] = w.c
      return onSide(x1, y1) && onSide(x2, y2)
   })
}

function sideNormalForRegion(region, side) {
   const shape = region?.shapes?.[0]
   if (shape?.type !== "rectangle" && shape?.type !== "line") return null
   const rotation = (Number(shape.rotation ?? 0) * Math.PI) / 180
   const cos = Math.cos(rotation)
   const sin = Math.sin(rotation)
   if (side === "top") return { x: sin, y: -cos }
   if (side === "bottom") return { x: -sin, y: cos }
   if (side === "left") return { x: -cos, y: -sin }
   if (side === "right") return { x: cos, y: sin }
   return null
}

async function promptSingleWallSide(
   itemName,
   { userId = null, actor = null } = {},
) {
   const title =
      game.i18n.localize("PF2EATW.SingleWall.DialogTitle") ||
      "Single Wall вЂ” Pick Side"
   const prompt = (
      game.i18n.localize("PF2EATW.SingleWall.DialogPrompt") ||
      "Place the wall on which side of the region?"
   ).replace("{name}", escapeHTML(itemName ?? ""))
   const choices = [
      {
         label: "Top",
         value: "top",
         icon: '<i class="fa-solid fa-arrow-up"></i>',
      },
      {
         label: "Left",
         value: "left",
         icon: '<i class="fa-solid fa-arrow-left"></i>',
      },
      {
         label: "Right",
         value: "right",
         icon: '<i class="fa-solid fa-arrow-right"></i>',
      },
      {
         label: "Bottom",
         value: "bottom",
         icon: '<i class="fa-solid fa-arrow-down"></i>',
      },
   ]
   const content = await renderModuleTemplate("dialogs/single-wall-side.hbs", {
      prompt,
   })

   return await requestPlayerChoiceDialog({
      actor,
      userId,
      title,
      content,
      choices,
      cancelValue: null,
      hideChoiceButtons: true,
   })
}

export async function createAttachedWalls(region, wallEntries) {
   const scene = region.parent
   if (!scene) return
   const footprint = getRegionFootprint(region)
   if (footprint.boundaryEdges.length === 0) return

   const allEntryCreates = []
   for (const entry of wallEntries) {
      let walls = wallsFromBoundary(footprint, region, entry)
      let singleWallSide = null
      if (entry.system?.singleWall) {
         let itemName = "Wall"
         let sourceItem = null
         try {
            const managed = region.getFlag(FLAG_SCOPE, "managed")
            if (managed?.itemUuid) {
               sourceItem = await tryFromUuid(managed.itemUuid)
               if (sourceItem?.name) itemName = sourceItem.name
            }
         } catch (_e) {}
         const side = await promptSingleWallSide(itemName, {
            userId: activeDialogUserIdForRegion(region, sourceItem),
            actor: sourceItem?.actor ?? null,
         })
         if (!side) continue
         singleWallSide = side
         walls = filterWallsToSide(walls, footprint.bounds, side, region)
      }
      if (walls.length === 0) continue
      for (let i = 0; i < walls.length; i++) {
         const flags = (walls[i].flags ??= {})
         const scope = (flags[FLAG_SCOPE] ??= {})
         scope.wallIndex = i
         if (singleWallSide) scope.singleWallSide = singleWallSide
      }
      allEntryCreates.push({ entry, walls })
   }

   if (allEntryCreates.length === 0) return

   const flatCreates = allEntryCreates.flatMap((g) => g.walls)
   let createdWalls = []
   try {
      createdWalls = await scene.createEmbeddedDocuments("Wall", flatCreates)
   } catch (e) {
      console.error(`[${MODULE_ID}] Failed to create attached walls`, e)
      return
   }

   for (const { entry } of allEntryCreates) {
      if (!entry.system?.destroyable) continue
      const ownedWalls = createdWalls.filter(
         (w) => w.flags?.[FLAG_SCOPE]?.attachmentId === (entry.id ?? null),
      )
      if (ownedWalls.length === 0) continue
      await spawnDestroyableWallActors(region, scene, entry, ownedWalls)
   }
}

export async function onUpdateRegion(region, changes, options, userId) {
   if (!isCurrentUserActiveGM()) return
   if (!region.getFlag(FLAG_SCOPE, "managed")) return
   if (!("shapes" in changes) && !("elevation" in changes)) return

   clearRegionFootprintCache(region)
   await syncAttachedTiles(region)
   await syncAttachedSounds(region)
   await syncAttachedLights(region)
   await syncAttachedWallsInPlace(region)
}

export async function syncAttachedWalls(region) {
   const scene = region.parent
   if (!scene) return
   const existing = scene.walls.filter(
      (w) => w.flags?.[FLAG_SCOPE]?.attachedToRegion === region.uuid,
   )
   if (!existing.length) return

   const managed = region.getFlag(FLAG_SCOPE, "managed")
   const item = managed?.itemUuid ? await tryFromUuid(managed.itemUuid) : null
   const automation = item ? readAutomation(item) : null
   const wallEntries = (automation?.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "attachWalls",
   )

   try {
      await scene.deleteEmbeddedDocuments(
         "Wall",
         existing.map((w) => w.id),
      )
   } catch (e) {
      console.warn(
         `[${MODULE_ID}] Failed to delete existing attached walls for resync`,
         e,
      )
   }
   if (wallEntries.length) {
      await createAttachedWalls(region, wallEntries)
   }
}

export async function syncAttachedWallsInPlace(region) {
   const scene = region.parent
   if (!scene) return
   const existing = scene.walls.filter(
      (w) => w.flags?.[FLAG_SCOPE]?.attachedToRegion === region.uuid,
   )
   if (!existing.length) return
   const footprint = getRegionFootprint(region)
   if (footprint.boundaryEdges.length === 0) return

   const managed = region.getFlag(FLAG_SCOPE, "managed")
   const item = managed?.itemUuid ? await tryFromUuid(managed.itemUuid) : null
   const automation = item ? readAutomation(item) : null
   const wallEntries = (automation?.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "attachWalls",
   )

   for (const entry of wallEntries) {
      const attachmentId = entry.id ?? null
      const owned = existing.filter(
         (w) => (w.flags?.[FLAG_SCOPE]?.attachmentId ?? null) === attachmentId,
      )
      if (!owned.length) continue

      let desired = wallsFromBoundary(footprint, region, entry)
      const side = entry.system?.singleWall
         ? owned.find((w) => w.flags?.[FLAG_SCOPE]?.singleWallSide)?.flags?.[
              FLAG_SCOPE
           ]?.singleWallSide
         : null
      if (entry.system?.singleWall) {
         if (!side) {
            console.warn(
               `[${MODULE_ID}] Cannot resync single-wall attachment without stored side; leaving existing walls in place.`,
            )
            continue
         }
         desired = filterWallsToSide(desired, footprint.bounds, side, region)
      }
      if (!desired.length) continue

      for (let i = 0; i < desired.length; i++) {
         const flags = (desired[i].flags ??= {})
         const scope = (flags[FLAG_SCOPE] ??= {})
         scope.wallIndex = i
         if (side) scope.singleWallSide = side
      }

      const sortedOwned = sortWallsForSync(owned)
      const sortedDesired = sortWallsForSync(desired)
      const updateCount = Math.min(sortedOwned.length, sortedDesired.length)
      const updates = []
      for (let i = 0; i < updateCount; i++) {
         const d = sortedDesired[i]
         updates.push({
            _id: sortedOwned[i].id,
            c: d.c,
            move: d.move,
            light: d.light,
            sight: d.sight,
            sound: d.sound,
            dir: d.dir,
            [`flags.${FLAG_SCOPE}.wallIndex`]: i,
            [`flags.${FLAG_SCOPE}.singleWallSide`]: side ?? null,
         })
      }
      const liveUpdates = liveEmbeddedUpdates(scene, "walls", updates)
      if (liveUpdates.length > 0) {
         try {
            await scene.updateEmbeddedDocuments("Wall", liveUpdates)
         } catch (e) {
            console.warn(`[${MODULE_ID}] Failed to update attached walls`, e)
         }
      }

      if (sortedOwned.length > sortedDesired.length) {
         const deletes = sortedOwned
            .slice(sortedDesired.length)
            .map((w) => w.id)
         try {
            await scene.deleteEmbeddedDocuments("Wall", deletes)
         } catch (e) {
            console.warn(
               `[${MODULE_ID}] Failed to remove extra attached walls`,
               e,
            )
         }
      } else if (sortedDesired.length > sortedOwned.length) {
         const creates = sortedDesired.slice(sortedOwned.length)
         try {
            await scene.createEmbeddedDocuments("Wall", creates)
         } catch (e) {
            console.warn(`[${MODULE_ID}] Failed to add new attached walls`, e)
         }
      }

      const currentOwned = scene.walls.filter(
         (w) =>
            w.flags?.[FLAG_SCOPE]?.attachedToRegion === region.uuid &&
            (w.flags?.[FLAG_SCOPE]?.attachmentId ?? null) === attachmentId,
      )
      await syncDestroyableWallActorsForEntry(
         region,
         scene,
         entry,
         currentOwned,
      )
   }
}

export async function syncAttachedTiles(region) {
   const scene = region.parent
   if (!scene) return
   const tiles = scene.tiles.filter(
      (t) => t.flags?.[FLAG_SCOPE]?.attachedToRegion === region.uuid,
   )
   if (!tiles.length) return

   const footprint = getRegionFootprint(region)
   const bounds = footprint.bounds ?? computeRegionBounds(region)
   if (!bounds) return

   const managed = region.getFlag(FLAG_SCOPE, "managed")
   const item = managed?.itemUuid ? await tryFromUuid(managed.itemUuid) : null
   const automation = item ? readAutomation(item) : null

   const updates = []
   const deletes = []
   const activeShapeType = getActiveTemplateShapeType(region, automation)
   for (const tile of tiles) {
      const flags = tile.flags?.[FLAG_SCOPE] ?? {}
      const attachId = flags.attachmentId
      const tileId = flags.tileAttachmentId ?? null
      const tileIndexValue = Number(flags.tileAttachmentIndex)
      const tileIndex = Number.isInteger(tileIndexValue) ? tileIndexValue : null
      const entry = automation?.behaviors?.find(
         (b) => b.id === attachId && b.type === "attachTile",
      )
      const row = findTileAttachmentConfig(entry, tileId, tileIndex)
      if (
         !entry ||
         !row?.tile?.texture?.src ||
         !tileAttachmentAppliesToShape(row, activeShapeType)
      ) {
         deletes.push(tile.id)
         continue
      }
      const scale = entry?.system?.scale ?? 1
      const template = row.tile
      const preserve = !!entry?.system?.preserveAspectRatio
      const dims = tileDataForBounds(template, bounds, scale, preserve)
      updates.push({
         _id: tile.id,
         x: dims.x,
         y: dims.y,
         width: dims.width,
         height: dims.height,
         texture: dims.texture,
      })
   }
   if (deletes.length) {
      try {
         await scene.deleteEmbeddedDocuments("Tile", deletes, { render: false })
      } catch (e) {
         console.error(
            `[${MODULE_ID}] Failed to delete stale attached tiles`,
            e,
         )
      }
   }
   if (updates.length) {
      try {
         await scene.updateEmbeddedDocuments("Tile", updates, { render: false })
      } catch (e) {
         console.error(`[${MODULE_ID}] Failed to sync attached tiles`, e)
      }
   }
}

export async function syncAttachedSounds(region) {
   const scene = region.parent
   if (!scene) return
   const sounds = scene.sounds.filter(
      (s) => s.flags?.[FLAG_SCOPE]?.attachedToRegion === region.uuid,
   )
   if (!sounds.length) return
   const placement = soundPlacement(region)
   if (!placement) return

   const managed = region.getFlag(FLAG_SCOPE, "managed")
   const item = managed?.itemUuid ? await tryFromUuid(managed.itemUuid) : null
   const automation = item ? readAutomation(item) : null

   const updates = sounds.map((sound) => {
      const attachId = sound.flags?.[FLAG_SCOPE]?.attachmentId
      const entry = automation?.behaviors?.find(
         (b) => b.id === attachId && b.type === "attachSound",
      )
      const boost = Number(entry?.system?.radiusBoost)
      const factor = Number.isFinite(boost) ? Math.max(0.1, 1 + boost) : 1
      return {
         _id: sound.id,
         x: placement.x,
         y: placement.y,
         radius: placement.radius * factor,
      }
   })
   if (updates.length) {
      try {
         await scene.updateEmbeddedDocuments("AmbientSound", updates, {
            render: false,
         })
      } catch (e) {
         console.error(`[${MODULE_ID}] Failed to sync attached sounds`, e)
      }
   }
}

export async function syncAttachedLights(region) {
   const scene = region.parent
   if (!scene) return
   const existing = scene.lights.filter(
      (l) => l.flags?.[FLAG_SCOPE]?.attachedToRegion === region.uuid,
   )
   if (!existing.length) return

   const managed = region.getFlag(FLAG_SCOPE, "managed")
   const item = managed?.itemUuid ? await tryFromUuid(managed.itemUuid) : null
   const automation = item ? readAutomation(item) : null
   const lightEntries = (automation?.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "attachLight",
   )

   try {
      await scene.deleteEmbeddedDocuments(
         "AmbientLight",
         existing.map((l) => l.id),
      )
   } catch (e) {
      console.warn(
         `[${MODULE_ID}] Failed to delete existing attached lights for resync`,
         e,
      )
   }
   if (lightEntries.length) {
      await createAttachedLights(region, lightEntries)
   }
}

export async function promptAttachRegionToToken(region) {
   const scene = region.parent
   if (!scene) return
   const footprint = getRegionFootprint(region)
   if (!footprint || footprint.cells.length === 0) return
   const cellSet = footprint.cellSet
   const gridSize = footprint.gridSize

   const candidates = []
   for (const tokenDoc of scene.tokens) {
      const tx = Number(tokenDoc.x ?? 0)
      const ty = Number(tokenDoc.y ?? 0)
      const w = Number(tokenDoc.width ?? 1)
      const h = Number(tokenDoc.height ?? 1)

      const baseCol = Math.floor(tx / gridSize)
      const baseRow = Math.floor(ty / gridSize)
      let inside = false
      let adjacent = false
      for (let dr = 0; dr < h; dr++) {
         for (let dc = 0; dc < w; dc++) {
            const c = baseCol + dc,
               r = baseRow + dr
            if (cellSet.has(c + ":" + r)) {
               inside = true
               break
            }

            for (let ar = -1; ar <= 1 && !adjacent; ar++) {
               for (let ac = -1; ac <= 1 && !adjacent; ac++) {
                  if (ar === 0 && ac === 0) continue
                  if (cellSet.has(c + ac + ":" + (r + ar))) adjacent = true
               }
            }
         }
         if (inside) break
      }
      if (inside || adjacent) {
         candidates.push({ doc: tokenDoc, inside })
      }
   }

   if (candidates.length === 0) {
      ui.notifications?.info(game.i18n.localize("PF2EATW.Attach.NoCandidates"))
      return
   }

   candidates.sort((a, b) => (b.inside ? 1 : 0) - (a.inside ? 1 : 0))
   const options = candidates
      .map((c) => {
         const label = `${c.doc.name}${c.inside ? " (inside)" : " (adjacent)"}`
         return `<option value="${c.doc.id}">${foundry.utils.escapeHTML?.(label) ?? label}</option>`
      })
      .join("")

   const title = game.i18n.localize("PF2EATW.Attach.DialogTitle")
   const prompt = game.i18n.localize("PF2EATW.Attach.DialogPrompt")
   const content = `<p>${prompt}</p>
    <div class="form-group">
      <select name="tokenId" style="width:100%">
        <option value="">вЂ” ${game.i18n.localize("PF2EATW.Attach.NoneOption")} вЂ”</option>
        ${options}
      </select>
    </div>`

   let sourceItem = null
   try {
      const managed = region.getFlag(FLAG_SCOPE, "managed")
      if (managed?.itemUuid) sourceItem = await tryFromUuid(managed.itemUuid)
   } catch (_e) {}
   const dialogUserId = activeDialogUserIdForRegion(region, sourceItem)
   const tokenId =
      dialogUserId || sourceItem?.actor?.hasPlayerOwner
         ? await requestPlayerChoiceDialog({
              actor: sourceItem?.actor ?? null,
              userId: dialogUserId,
              title,
              content: `<p>${prompt}</p>`,
              choices: [
                 {
                    label: game.i18n.localize("PF2EATW.Attach.NoneOption"),
                    value: null,
                 },
                 ...candidates.map((c) => ({
                    label: `${c.doc.name}${c.inside ? " (inside)" : " (adjacent)"}`,
                    value: c.doc.id,
                 })),
              ],
              cancelValue: null,
           })
         : await new Promise((resolve) => {
              new Dialog({
                 title,
                 content,
                 buttons: {
                    ok: {
                       label: game.i18n.localize("PF2EATW.Attach.Confirm"),
                       callback: (html) => {
                          const v = html.find('select[name="tokenId"]').val()
                          resolve(v || null)
                       },
                    },
                    cancel: {
                       label: game.i18n.localize("PF2EATW.Attach.Cancel"),
                       callback: () => resolve(null),
                    },
                 },
                 default: "ok",
                 close: () => resolve(null),
              }).render(true)
           })

   if (!tokenId) return

   try {
      await region.update({ attachment: { token: tokenId } }, { render: false })
   } catch (e) {
      console.warn(`[${MODULE_ID}] region.update attachment.token failed`, e)
   }
}
