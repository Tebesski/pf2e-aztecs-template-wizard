import { buildBehaviorDataList } from "./behaviors/index.mjs"
import {
   FLAG_SCOPE,
   MODULE_ID,
   TIME_UNITS,
   normalizeTileAttachments,
} from "./data.mjs"
import { readAutomation } from "./sheet/automation-storage.mjs"
import { resolveAutomationHeightening } from "./heightening.mjs"
import { sourceItemForRegion } from "./compendium/template-entry-item.mjs"
import { trackRegion } from "./tracker.mjs"
import {
   executeAsGM,
   isRegionDeleting,
   markRegionDeleting,
} from "./runtime/index.mjs"

import {
   applyLifecycleInitialStates,
   isCurrentUserActiveGM,
   regionBehaviorList,
   registerEffectLifecycleHooks,
   scheduleLifecycleInitialStateCatchup,
   forgetLifecycleContactsForRegion,
} from "./region/effect-lifecycle.mjs"
import {
   getRegionFootprint,
} from "./region/geometry.mjs"
import {
   createAttachedTiles,
   createAttachedSounds,
   createAttachedLights,
} from "./region/attached-media.mjs"
import {
   createAttachedWalls,
   promptAttachRegionToToken,
   onUpdateRegion,
} from "./region/attached-sync.mjs"
import {
   gmFinalizeContiguousPlacement as gmFinalizeContiguousPlacementImpl,
   normalizeContiguousConfig,
   startContiguousPlacementChain as startContiguousPlacementChainImpl,
} from "./region/contiguous-placement.mjs"
import { tryDocumentFromUuid, tryFromUuid } from "./region/documents.mjs"
import {
   onDeleteActorForDestroyableWalls,
   onDeleteTokenForDestroyableWalls,
   onDeleteWallForDestroyableWalls,
   spawnConstructActorsForWalls,
   onUpdateActorForDestroyableWalls,
   cleanupDestroyableWallActor,
} from "./region/destroyable-walls.mjs"
export { spawnConstructActorsForWalls } from "./region/destroyable-walls.mjs"
export { gmMarkContiguousPrimary } from "./region/contiguous-placement.mjs"
export { gmCatchupEffectLifecycleForToken } from "./region/effect-lifecycle.mjs"
export {
   debugAdjacentLifecycle,
   debugFootprint,
   debugRegionPolygons,
   debugTriggerAdjacentLifecycle,
} from "./region/debug-api.mjs"
export function registerRegionHandler() {
   Hooks.on("createRegion", onCreateRegion)
   Hooks.on("updateRegion", onUpdateRegion)
   Hooks.on("deleteRegion", onDeleteRegion)
   Hooks.on("preDeleteRegion", onPreDeleteRegion)
   registerEffectLifecycleHooks()

   Hooks.on("updateActor", onUpdateActorForDestroyableWalls)
   Hooks.on("deleteActor", onDeleteActorForDestroyableWalls)
   Hooks.on("deleteToken", onDeleteTokenForDestroyableWalls)
   Hooks.on("deleteWall", onDeleteWallForDestroyableWalls)
}

function startContiguousPlacementChain(region, item, total, options = {}) {
   return startContiguousPlacementChainImpl(region, item, total, {
      ...options,
      applyAutomationToRegion,
   })
}

export async function gmFinalizeContiguousPlacement(payload = {}) {
   return gmFinalizeContiguousPlacementImpl(payload, {
      applyAutomationToRegion,
   })
}
export async function gmApplyRegionAutomation(regionUuid, options = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const region = regionUuid ? await tryDocumentFromUuid(regionUuid) : null
   if (!region?.parent) {
      return { ok: false, reason: "missing-region" }
   }
   const applied = await applyRegionAutomationDocument(region, {
      allowContiguous: !!options.allowContiguous,
      itemUuid: options.itemUuid ?? null,
      ownerUserId: options.ownerUserId ?? null,
   })
   return applied ? { ok: true } : { ok: false, reason: "not-applicable" }
}

async function onCreateRegion(region, options, userId) {
   if (region.getFlag(FLAG_SCOPE, "managed")) return
   if (region.getFlag(FLAG_SCOPE, "contiguousPlacement")?.pending) return

   const createdByCurrentUser = userId === game.user.id
   if (!game.user?.isGM) {
      if (!createdByCurrentUser) return
      const item = await resolveOriginItem(region)
      const automation = item ? readAutomation(item) : null
      const contiguous = normalizeContiguousConfig(automation)
      if (!automation?.enabled) {
         setTimeout(() => {
            executeAsGM("applyRegionAutomation", region.uuid, {
               allowContiguous: false,
               itemUuid: item?.uuid ?? null,
               ownerUserId: game.user.id,
            }).catch((e) => {
               undefined
            })
         }, 250)
         return
      }
      if (contiguous.enabled && contiguous.count > 1) {
         await startContiguousPlacementChain(region, item, contiguous.count, {
            finalizeAsGM: true,
         })
         return
      }
      setTimeout(() => {
         executeAsGM("applyRegionAutomation", region.uuid, {
            allowContiguous: false,
            itemUuid: item?.uuid ?? null,
            ownerUserId: game.user.id,
         }).catch((e) => {
            undefined
         })
      }, 250)
      return
   }

   if (!isCurrentUserActiveGM()) return
   if (!createdByCurrentUser) {
      setTimeout(() => {
         gmApplyRegionAutomation(region.uuid, {
            allowContiguous: false,
            ownerUserId: userId,
         }).catch((e) => {
            undefined
         })
      }, 300)
      return
   }

   await applyRegionAutomationDocument(region, { allowContiguous: true })
}

async function applyRegionAutomationDocument(
   region,
   { allowContiguous = true, itemUuid = null, ownerUserId = null } = {},
) {
   if (!region?.parent) return false
   if (region.getFlag(FLAG_SCOPE, "managed")) return false
   if (region.getFlag(FLAG_SCOPE, "contiguousPlacement")?.pending) return false

   const item = itemUuid
      ? (await tryFromUuid(itemUuid)) ?? (await resolveOriginItem(region))
      : await resolveOriginItem(region)
   if (!item) {
      return false
   }

   const automation = readAutomation(item)
   if (!automation?.enabled) {
      return false
   }
   if (ownerUserId && game.users?.get?.(ownerUserId)) {
      const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3
      try {
         await region.update(
            { [`ownership.${ownerUserId}`]: ownerLevel },
            { render: false },
         )
      } catch (e) {
         undefined
      }
   }
   if (itemUuid && !region.getFlag(FLAG_SCOPE, "originUuid")) {
      try {
         await region.setFlag(FLAG_SCOPE, "originUuid", item.uuid)
      } catch (_e) {}
   }
   const contiguous = normalizeContiguousConfig(automation)
   if (allowContiguous && contiguous.enabled && contiguous.count > 1) {
      await startContiguousPlacementChain(region, item, contiguous.count)
      return true
   }

   await applyAutomationToRegion(region, item, automation, { ownerUserId })
   return true
}

async function applyAutomationToRegion(region, item, automation, options = {}) {
   if (!region?.parent) return
   if (region.getFlag(FLAG_SCOPE, "managed")) return
   automation = resolveAutomationHeightening(automation, item, { region })
   const deleteAfterPlacement = !automation.expiration?.enabled

   const behaviorData = buildBehaviorDataList(
      automation.behaviors,
      automation,
      item,
   )

   if (behaviorData.length) {
      try {
         await region.createEmbeddedDocuments("RegionBehavior", behaviorData)
      } catch (err) {
         undefined
         ui.notifications?.error(
            game.i18n.format("PF2EATW.Error.BehaviorCreate", {
               name: item.name,
            }),
         )
      }
   }

   const expSeconds =
      automation.expiration?.enabled &&
      automation.expiration?.unit !== "unlimited"
         ? expirationToSeconds(automation.expiration)
         : null

   const trackerName = automation.label?.trim() || item.name

   await region.setFlag(FLAG_SCOPE, "managed", {
      itemUuid: item.uuid,
      itemName: trackerName,
      ownerActorUuid: item.actor?.uuid ?? null,
      ownerUserId: options.ownerUserId ?? null,
      automationId: automation.id ?? null,
      placedAt: game.time.worldTime,
      expiresAt: expSeconds !== null ? game.time.worldTime + expSeconds : null,
      resolvedAutomation: foundry.utils.deepClone(automation),
   })

   if (expSeconds !== null) {
      trackRegion({
         regionUuid: region.uuid,
         itemName: trackerName,
         durationSeconds: expSeconds,
         placedAt: game.time.worldTime,
         sceneId: region.parent?.id ?? null,
      })
   }

   const tileEntries = (automation.behaviors ?? []).filter(
      (b) =>
         b?.enabled &&
         b.type === "attachTile" &&
         normalizeTileAttachments(b.system).some((t) => t.tile?.texture?.src),
   )
   if (tileEntries.length) {
      await createAttachedTiles(region, tileEntries)
   }

   const soundEntries = (automation.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "attachSound" && b.system?.sound?.path,
   )
   if (soundEntries.length) {
      await createAttachedSounds(region, soundEntries)
   }
   const lightEntries = (automation.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "attachLight",
   )
   if (lightEntries.length) {
      await createAttachedLights(region, lightEntries)
   }

   const wallEntries = (automation.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "attachWalls",
   )
   if (wallEntries.length) {
      await createAttachedWalls(region, wallEntries)
   }

   const playSoundEntries = (automation.behaviors ?? []).filter(
      (b) => b?.enabled && b.type === "playSound" && b.system?.src,
   )
   for (const entry of playSoundEntries) {
      const src = entry.system.src
      const volume = Math.max(
         0,
         Math.min(1, Number(entry.system.volume ?? 0.5)),
      )
      try {
         await foundry.audio.AudioHelper.play(
            { src, volume, autoplay: true, loop: false },
            true,
         )
      } catch (e) {
         try {
            await globalThis.AudioHelper?.play(
               { src, volume, autoplay: true, loop: false },
               true,
            )
         } catch (e2) {
            undefined
         }
      }
   }

   try {
      await applyEnterEventsForTokensInsideRegion(region, {
         includeTokenEnter: deleteAfterPlacement,
      })
   } catch (e) {
      undefined
   }

   try {
      await applyLifecycleInitialStates(region)
   } catch (e) {
      undefined
   }
   scheduleLifecycleInitialStateCatchup(region)

   if (automation.advanced?.enabled) {
      const adv = automation.advanced

      let hl = adv.highlightMode
      if (typeof hl === "number") hl = ["shapes", "coverage"][hl] ?? "coverage"
      if (hl === "shape" || hl === "placeables") hl = "shapes"
      if (hl !== "shapes" && hl !== "coverage") hl = "coverage"
      const update = {
         color: adv.color,
         visibility: Number(adv.visibility),
         highlightMode: hl,
         displayMeasurements: !!adv.displayMeasurements,
      }
      try {
         await region.update(update, { render: false })
      } catch (e) {
         undefined
         for (const [k, v] of Object.entries(update)) {
            try {
               await region.update({ [k]: v }, { render: false })
            } catch (e2) {
               undefined
            }
         }
      }
   }

   if (automation.attachable) {
      try {
         await promptAttachRegionToToken(region)
      } catch (e) {
         undefined
      }
   }

   if (deleteAfterPlacement) {
      await quietlyDeleteRegion(region)
   }
}

async function applyEnterEventsForTokensInsideRegion(
   region,
   { includeTokenEnter = false } = {},
) {
   const scene = region.parent
   if (!scene) return
   const footprint = getRegionFootprint(region)
   if (!footprint || footprint.cells.length === 0) return
   const cellSet = footprint.cellSet
   const gridSize = footprint.gridSize

   const insideTokens = []
   for (const tokenDoc of scene.tokens) {
      const tx = Number(tokenDoc.x ?? 0)
      const ty = Number(tokenDoc.y ?? 0)
      const w = Number(tokenDoc.width ?? 1)
      const h = Number(tokenDoc.height ?? 1)
      const baseCol = Math.floor(tx / gridSize)
      const baseRow = Math.floor(ty / gridSize)
      let inside = false
      for (let dr = 0; dr < h && !inside; dr++) {
         for (let dc = 0; dc < w && !inside; dc++) {
            if (cellSet.has(baseCol + dc + ":" + (baseRow + dr))) inside = true
         }
      }
      if (inside) insideTokens.push(tokenDoc)
   }
   if (!insideTokens.length) return

   const AsyncFunction = (async () => {}).constructor
   for (const behavior of regionBehaviorList(region)) {
      if (behavior.disabled) continue
      if (behavior.type !== "executeScript") continue
      const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
      if (!Array.isArray(triggers)) continue
      if (
         !triggers.includes("onPlace") &&
         !(includeTokenEnter && triggers.includes("tokenEnter"))
      )
         continue
      const src = behavior.system?.source
      if (!src) continue
      let fn
      try {
         fn = new AsyncFunction("event", "region", "scene", "behavior", src)
      } catch (e) {
         undefined
         continue
      }
      for (const tokenDoc of insideTokens) {
         const syntheticEvent = {
            name: "tokenEnter",
            data: { token: tokenDoc },
         }
         try {
            await fn(syntheticEvent, region, scene, behavior)
         } catch (e) {
            undefined
         }
      }
   }
}

async function restoreReversibleRemovalsForRegion(actor, regionUuid) {
   const store = actor.getFlag?.(MODULE_ID, "reversibleRemovals")
   const regionBucket = store?.[regionUuid]
   if (!regionBucket || typeof regionBucket !== "object") return
   const creates = []
   for (const groupBucket of Object.values(regionBucket)) {
      if (!groupBucket || typeof groupBucket !== "object") continue
      for (const bucket of Object.values(groupBucket)) {
         const items = Array.isArray(bucket?.items) ? bucket.items : []
         for (const source of items) {
            const copy = foundry.utils.deepClone(source)
            delete copy._id
            creates.push(copy)
         }
      }
   }
   if (creates.length) {
      try {
         await actor.createEmbeddedDocuments("Item", creates)
      } catch (e) {
         undefined
      }
   }
   const next = foundry.utils.deepClone(store)
   delete next[regionUuid]
   if (Object.keys(next).length)
      await actor.setFlag(MODULE_ID, "reversibleRemovals", next)
   else await actor.unsetFlag?.(MODULE_ID, "reversibleRemovals")
}

function onPreDeleteRegion(region, options, userId) {
   if (userId !== game.user.id) return
   if (game.user?.isGM) return
   if (!region?.getFlag?.(FLAG_SCOPE, "managed")) return
   if (isRegionDeleting(region.uuid)) return
   ui.notifications?.warn(
      "Only the GM can delete Template Wizard managed templates.",
   )
   return false
}

async function onDeleteRegion(region, options, userId) {
   if (!isCurrentUserActiveGM()) return
   const scene = region.parent
   if (!scene) return
   const uuid = region.uuid
   forgetLifecycleContactsForRegion(uuid)

   try {
      const actorsToDelete = (game.actors ?? []).filter(
         (a) =>
            a.flags?.[MODULE_ID]?.isDestroyableWallActor &&
            a.flags?.[MODULE_ID]?.attachedToRegion === uuid,
      )
      for (const actor of actorsToDelete) {
         try {
            await cleanupDestroyableWallActor(actor)
         } catch (_e) {}
      }
   } catch (_e) {}

   const collections = [
      { name: "Tile", items: scene.tiles },
      { name: "AmbientSound", items: scene.sounds },
      { name: "AmbientLight", items: scene.lights },
      { name: "Wall", items: scene.walls },
   ]
   for (const { name, items } of collections) {
      const attached = items.filter(
         (d) => d.flags?.[FLAG_SCOPE]?.attachedToRegion === uuid,
      )
      if (!attached.length) continue
      try {
         await scene.deleteEmbeddedDocuments(
            name,
            attached.map((d) => d.id),
         )
      } catch (e) {
         undefined
      }
   }

   try {
      for (const tokenDoc of scene.tokens) {
         const actor = tokenDoc.actor
         if (!actor) continue
         const ours = actor.items.filter(
            (i) =>
               i.type === "effect" &&
               i.flags?.[MODULE_ID]?.appliedByRegion === uuid &&
               i.flags?.[MODULE_ID]?.fromAddIRW,
         )
         if (ours.length) {
            try {
               await actor.deleteEmbeddedDocuments(
                  "Item",
                  ours.map((e) => e.id),
               )
            } catch (e) {
               undefined
            }
         }
      }
   } catch (e) {
      undefined
   }

   try {
      for (const tokenDoc of scene.tokens) {
         const actor = tokenDoc.actor
         if (!actor) continue
         const lifecycleEffects = actor.items.filter(
            (i) =>
               i.type === "effect" &&
               i.flags?.[MODULE_ID]?.isParentEffect &&
               i.flags?.[MODULE_ID]?.appliedByRegion === uuid &&
               i.flags?.[MODULE_ID]?.effectLifecycle,
         )
         if (lifecycleEffects.length) {
            try {
               await actor.deleteEmbeddedDocuments(
                  "Item",
                  lifecycleEffects.map((e) => e.id),
               )
            } catch (e) {
               undefined
            }
         }
         await restoreReversibleRemovalsForRegion(actor, uuid)
      }
   } catch (e) {
      undefined
   }
}

async function resolveOriginItem(region) {
   const compendiumItem = await sourceItemForRegion(region, tryFromUuid)
   if (compendiumItem) return compendiumItem

   const ours = region.getFlag(FLAG_SCOPE, "originUuid")
   if (ours) return tryFromUuid(ours)

   const pf2eOrigin = region.getFlag("pf2e", "origin")
   if (pf2eOrigin?.uuid) return tryFromUuid(pf2eOrigin.uuid)

   const flags = region.flags ?? {}
   for (const ns of Object.values(flags)) {
      if (!ns || typeof ns !== "object") continue
      for (const key of ["sourceId", "itemUuid", "originUuid"]) {
         const v = ns[key]
         if (typeof v !== "string") continue
         if (v.startsWith("Item.") || v.includes(".Item.")) {
            return tryFromUuid(v)
         }
      }
   }
   return null
}

async function quietlyDeleteRegion(region) {
   if (!region) return
   markRegionDeleting(region.uuid)
   try {
      const ourIds =
         region.behaviors
            ?.filter((b) => b.flags?.[FLAG_SCOPE]?.managed && !b.disabled)
            .map((b) => b.id) ?? []
      if (ourIds.length) {
         const updates = ourIds.map((id) => ({ _id: id, disabled: true }))
         await region.updateEmbeddedDocuments("RegionBehavior", updates, {
            render: false,
         })
      }
   } catch (e) {
      undefined
   }
   try {
      await region.delete()
   } catch (e) {
      undefined
   }
}

export async function gmDeleteManagedRegion(regionUuid) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const region = await fromUuid(regionUuid).catch(() => null)
   await quietlyDeleteRegion(region)
   return { ok: true }
}

export async function deleteManagedRegion(regionUuid) {
   if (game.user?.isGM) return gmDeleteManagedRegion(regionUuid)
   return executeAsGM("deleteManagedRegion", regionUuid)
}

export function expirationToSeconds(expiration) {
   const def = TIME_UNITS[expiration.unit]
   if (!def) return Number(expiration.amount) || 0
   return Math.max(0, Number(expiration.amount) || 0) * def.toSeconds
}

export function registerExpirationSweep() {
   Hooks.on("updateWorldTime", async () => {
      if (!isCurrentUserActiveGM()) return
      const now = game.time.worldTime
      const regions = canvas.scene?.regions
      if (!regions) return
      for (const region of regions) {
         const flag = region.getFlag(FLAG_SCOPE, "managed")
         if (!flag?.expiresAt) continue
         if (now >= flag.expiresAt) {
            await quietlyDeleteRegion(region)
         }
      }
   })
}
