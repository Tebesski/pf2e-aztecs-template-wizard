import {
   MODULE_ID,
   normalizeTileAttachments,
   defaultTileAttachment,
} from "../data.mjs"
import { localize } from "../common/html.mjs"
import { readAutomation } from "./automation-storage.mjs"
const SCENE_OBJECT_KINDS = {
   tile: {
      embeddedName: "Tile",
      collection: "tiles",
      closeHook: "closeTileConfig",
      noSceneMsg: "PF2EATW.Tile.NoScene",
      makeScratch(existing) {
         const existingTexture = existing.texture ?? {}
         const texture = {
            ...existingTexture,
            anchorX: 0,
            anchorY: 0,
            src: existingTexture.src ?? "",
         }
         return foundry.utils.mergeObject(
            {
               x: -1000000,
               y: -1000000,
               width: 100,
               height: 100,
               hidden: true,
               texture,
            },
            { ...existing, texture },
            { overwrite: true, recursive: true },
         )
      },
      cleanSaved(saved) {
         delete saved._id
         delete saved.x
         delete saved.y
         delete saved.width
         delete saved.height
         delete saved.hidden
         delete saved.sort

         if (saved.texture) {
            saved.texture.anchorX = 0
            saved.texture.anchorY = 0
         }
         return saved
      },
   },
   sound: {
      embeddedName: "AmbientSound",
      collection: "sounds",
      closeHook: "closeAmbientSoundConfig",
      noSceneMsg: "PF2EATW.Tile.NoScene",
      makeScratch(existing) {
         return foundry.utils.mergeObject(
            {
               x: -1000000,
               y: -1000000,
               radius: 20,
               hidden: true,
               path: existing.path ?? "",
            },
            existing,
            { overwrite: false, recursive: true },
         )
      },
      cleanSaved(saved) {
         delete saved._id
         delete saved.x
         delete saved.y
         delete saved.hidden

         return saved
      },
   },
   light: {
      embeddedName: "AmbientLight",
      collection: "lights",
      closeHook: "closeAmbientLightConfig",
      noSceneMsg: "PF2EATW.Tile.NoScene",
      makeScratch(existing) {
         return foundry.utils.mergeObject(
            {
               x: -1000000,
               y: -1000000,
               hidden: true,
               config: existing.config ?? { dim: 10, bright: 5 },
            },
            existing,
            { overwrite: false, recursive: true },
         )
      },
      cleanSaved(saved) {
         delete saved._id
         delete saved.x
         delete saved.y
         delete saved.hidden
         return saved
      },
   },
}

export function openSceneObjectEditor(
   kind,
   item,
   behaviorId,
   fieldKey,
   options = {},
) {
   const cfg = SCENE_OBJECT_KINDS[kind]
   if (!cfg) return Promise.resolve()

   return new Promise(async (resolve) => {
      const scene = canvas.scene
      if (!scene) {
         ui.notifications?.warn(localize(cfg.noSceneMsg))
         resolve()
         return
      }

      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === behaviorId)
      if (!entry) {
         resolve()
         return
      }
      const rowIndex = Number.isInteger(options.index) ? options.index : null
      const heightenAction = getHeightenAction(entry, options)
      const existing = heightenAction
         ? existingHeightenObject(kind, heightenAction)
         : rowIndex !== null
           ? foundry.utils.deepClone(
                normalizeTileAttachments(entry.system?.[fieldKey])[rowIndex]
                   ?.tile ?? {},
             )
           : entry.system?.[fieldKey] && typeof entry.system[fieldKey] === "object"
             ? foundry.utils.deepClone(entry.system[fieldKey])
             : {}

      const scratchData = cfg.makeScratch(existing)

      scratchData.x = -1000000
      scratchData.y = -1000000
      scratchData.hidden = true
      foundry.utils.setProperty(
         scratchData,
         `flags.${MODULE_ID}.isScratch`,
         true,
      )
      delete scratchData._id

      let scratch
      try {
         ;[scratch] = await scene.createEmbeddedDocuments(cfg.embeddedName, [
            scratchData,
         ])
      } catch (e) {
         undefined
         resolve()
         return
      }
      if (!scratch) {
         resolve()
         return
      }

      let resolved = false
      const finish = async () => {
         if (resolved) return
         resolved = true
         Hooks.off(cfg.closeHook, hookId)
         Hooks.off("closeApplicationV2", v2HookId)

         try {
            const fresh = scene[cfg.collection].get(scratch.id) ?? scratch
            let saved = fresh.toObject()
            saved = cfg.cleanSaved(saved)
            if (saved.flags?.[MODULE_ID]?.isScratch) {
               delete saved.flags[MODULE_ID].isScratch
               if (Object.keys(saved.flags[MODULE_ID]).length === 0) {
                  delete saved.flags[MODULE_ID]
               }
               if (Object.keys(saved.flags ?? {}).length === 0)
                  delete saved.flags
            }

            const a2 = readAutomation(item)
            const entry2 = a2.behaviors.find((b) => b.id === behaviorId)
            if (entry2) {
               const heightenAction2 = getHeightenAction(entry2, options)
               if (heightenAction2) {
                  persistHeightenObject(kind, heightenAction2, saved)
               } else if (rowIndex !== null) {
                  const rows = normalizeTileAttachments(
                     entry2.system?.[fieldKey],
                  )
                  while (rows.length <= rowIndex)
                     rows.push(defaultTileAttachment())
                  rows[rowIndex] = { ...rows[rowIndex], tile: saved }
                  foundry.utils.setProperty(entry2.system, fieldKey, rows)
                  if (entry2.system.tile !== undefined)
                     delete entry2.system.tile
                  if (entry2.system.tileShape !== undefined)
                     delete entry2.system.tileShape
               } else {
                  foundry.utils.setProperty(entry2.system, fieldKey, saved)
               }
               await item.update(
                  { [`flags.${MODULE_ID}.automation`]: a2 },
                  { render: false },
               )
            }
         } catch (e) {
            undefined
         }

         try {
            if (scene[cfg.collection].get(scratch.id)) {
               await scene.deleteEmbeddedDocuments(cfg.embeddedName, [
                  scratch.id,
               ])
            }
         } catch (_e) {}

         resolve()
      }

      const matches = (app) =>
         app?.document?.id === scratch.id || app?.object?.id === scratch.id
      const hookId = Hooks.on(cfg.closeHook, (app) => {
         if (matches(app)) finish()
      })
      const v2HookId = Hooks.on("closeApplicationV2", (app) => {
         if (matches(app)) finish()
      })

      try {
         scratch.sheet?.render(true)
      } catch (e) {
         undefined
         finish()
      }
   })
}

export function openTileEditor(item, behaviorId, fieldKey, options = {}) {
   return openSceneObjectEditor("tile", item, behaviorId, fieldKey, options)
}

function getHeightenAction(entry, options) {
   if (!Number.isInteger(options.heightenIndex)) return null
   if (!Number.isInteger(options.heightenActionIndex)) return null
   const rule = Array.isArray(entry.heighten)
      ? entry.heighten[options.heightenIndex]
      : null
   const action = Array.isArray(rule?.actions)
      ? rule.actions[options.heightenActionIndex]
      : null
   return action && typeof action === "object" ? action : null
}

function existingHeightenObject(kind, action) {
   if (kind === "tile") {
      const row =
         action.tileAttachment && typeof action.tileAttachment === "object"
            ? action.tileAttachment
            : {}
      return foundry.utils.deepClone(row.tile ?? {})
   }
   if (kind === "sound") {
      return foundry.utils.deepClone(action.sound ?? {})
   }
   if (kind === "light") {
      return foundry.utils.deepClone(action.light ?? {})
   }
   return {}
}

function persistHeightenObject(kind, action, saved) {
   if (kind === "tile") {
      const row =
         action.tileAttachment && typeof action.tileAttachment === "object"
            ? foundry.utils.deepClone(action.tileAttachment)
            : defaultTileAttachment()
      row.tile = saved
      action.tileAttachment = row
   } else if (kind === "sound") {
      action.sound = saved
   } else if (kind === "light") {
      action.light = saved
   }
}
