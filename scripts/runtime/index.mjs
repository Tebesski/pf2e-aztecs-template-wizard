import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { installMultiTargetCardListeners } from "./cards.mjs"
import {
   installPlayerSaveSocket,
   requestPlayerChoiceDialog,
   requestPlayerSave,
   requestPlayerSkillRoll,
} from "./player-requests.mjs"

export {
   requestPlayerChoiceDialog,
   requestPlayerSave,
   requestPlayerSkillRoll,
}
export { setSocketlibSocket, executeAsGM } from "./socketlib.mjs"
export {
   gmApplyRuntimeConsequences,
   gmCleanupRuntimeConsequences,
   gmApplyCardDamage,
} from "./card-runtime-actions.mjs"
export {
   queueTargetHelperSave,
   queueTargetHelperChoice,
   queueRollDiceCard,
   queueDamageCard,
   queueSkillCheckCard,
   isTargetHelperEnabled,
} from "./card-queues.mjs"

let installed = false
const DELETING_REGIONS = new Set()

export function markRegionDeleting(uuid) {
   if (!uuid) return
   DELETING_REGIONS.add(uuid)

   setTimeout(() => DELETING_REGIONS.delete(uuid), 10000)
}

export function isRegionDeleting(uuid) {
   return !!uuid && DELETING_REGIONS.has(uuid)
}

export function installRuntimeHooks() {
   if (installed) return
   installed = true
   installIgnoredByHook()
   installRegionDeletionGuard()
   installPlayerSaveSocket()
   installGrantDurationSync()
   installMultiTargetCardListeners()
}

function installGrantDurationSync() {
   Hooks.on("createItem", (item) => {
      if (!item?.flags?.[MODULE_ID]?.isParentEffect) return
      setTimeout(() => syncGrantedItemDuration(item).catch((e) => {
         console.warn(`[${MODULE_ID}] grant duration sync failed`, e)
      }), 100)
   })
}

async function syncGrantedItemDuration(parentEffect, attempt = 0) {
   if (!game.user?.isGM) return
   const parent =
      parentEffect?.uuid && typeof fromUuidSync === "function"
         ? fromUuidSync(parentEffect.uuid)
         : parentEffect
   const actor = parent?.actor
   if (!parent || !actor || parent.type !== "effect") return

   const grants = parent.flags?.pf2e?.itemGrants ?? null
   if (!grants || Object.keys(grants).length === 0) {
      if (attempt < 4) {
         setTimeout(() => {
            syncGrantedItemDuration(parentEffect, attempt + 1).catch((e) => {
               console.warn(`[${MODULE_ID}] grant duration sync failed`, e)
            })
         }, 150)
      }
      return
   }

   const parentUpdates = {}
   for (const [flag, grant] of Object.entries(grants)) {
      if (grant?.onDelete === "restrict") {
         parentUpdates[`flags.pf2e.itemGrants.${flag}.onDelete`] = "detach"
      }
   }
   if (Object.keys(parentUpdates).length) {
      await parent.update(parentUpdates, { render: false })
   }

   const duration = parent.system?.duration
   const hasLimitedDuration =
      duration &&
      duration.unit &&
      duration.unit !== "unlimited" &&
      Number(duration.value) > 0
   if (!hasLimitedDuration) return

   const updates = []
   for (const grant of Object.values(grants)) {
      const child = actor.items.get(grant?.id)
      if (!child || !["condition", "effect"].includes(child.type)) continue
      const update = {
         _id: child.id,
         system: {
            duration: foundry.utils.deepClone(duration),
            start: foundry.utils.deepClone(
               parent.system?.start ?? { value: game.time.worldTime, initiative: null },
            ),
         },
      }
      if (child.flags?.pf2e?.grantedBy?.onDelete === "restrict") {
         update.flags = { pf2e: { grantedBy: { onDelete: "cascade" } } }
      }
      updates.push(update)
   }
   if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates, { render: false })
   }
}

function installRegionDeletionGuard() {
   Hooks.on("preDeleteRegion", (region) => {
      markRegionDeleting(region.uuid)
   })
}

function installIgnoredByHook() {
   const dm = globalThis.CONFIG?.RegionBehavior?.dataModels ?? {}

   const candidates = ["modifyMovementCost", "core.modifyMovementCost"]
   let cls = null
   for (const k of candidates) {
      if (dm[k]?.prototype?._getTerrainEffects) {
         cls = dm[k]
         break
      }
   }
   if (!cls) {
      console.warn(
         `[${MODULE_ID}] modifyMovementCost._getTerrainEffects not found ` +
            `— ignoredBy will not be enforced. Available types: ` +
            Object.keys(dm).join(", "),
      )
      return
   }

   const original = cls.prototype._getTerrainEffects
   cls.prototype._getTerrainEffects = function patchedGetTerrainEffects(
      token,
      segment,
      options,
   ) {
      try {
         const behavior = this.parent ?? this.behavior
         const flags = behavior?.flags?.[FLAG_SCOPE]
         const mustHave = Array.isArray(flags?.rollOptions)
            ? flags.rollOptions.filter((u) => typeof u === "string" && u.trim())
            : []
         const mustNotHave = Array.isArray(flags?.rollOptionsExclude)
            ? flags.rollOptionsExclude.filter((u) => typeof u === "string" && u.trim())
            : []
         const ignoredBy = Array.isArray(flags?.ignoredBy)
            ? flags.ignoredBy.filter((u) => typeof u === "string" && u.trim())
            : null

         if (token?.actor && (mustHave.length || mustNotHave.length)) {
            const actorOptions = new Set(token.actor.getRollOptions?.() ?? [])
            for (const option of mustHave) {
               if (!actorOptions.has(option)) return []
            }
            for (const option of mustNotHave) {
               if (actorOptions.has(option)) return []
            }
         }

         if (
            ignoredBy?.length &&
            token?.actor &&
            actorHasAny(token.actor, ignoredBy)
         ) {
            return []
         }
      } catch (e) {
         console.error(
            `[${MODULE_ID}] ignoredBy hook threw, falling through`,
            e,
         )
      }
      return original.call(this, token, segment, options)
   }
}

function actorHasAny(actor, uuids) {
   const targets = new Set(uuids)
   for (const item of actor.items ?? []) {
      const candidates = [
         item.uuid,
         item.sourceId,
         item._stats?.compendiumSource,
         item.flags?.core?.sourceId,
         item.system?.compendiumSource,
         item.system?.source?.uuid,
      ]
      for (const c of candidates) {
         if (c && targets.has(c)) return true
      }
   }
   return false
}
