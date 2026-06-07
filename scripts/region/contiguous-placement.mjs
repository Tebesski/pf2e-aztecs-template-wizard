import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { readAutomation } from "../sheet/automation-storage.mjs"
import { executeAsGM } from "../runtime/index.mjs"
import { clearRegionFootprintCache } from "./geometry.mjs"
import { tryDocumentFromUuid, tryFromUuid } from "./documents.mjs"

const CONTIGUOUS_PLACEMENT_SESSIONS = new Set()
export function normalizeContiguousConfig(automation) {
   const cfg = automation?.contiguous
   const count = Math.max(1, Math.floor(Number(cfg?.count) || 1))
   return { enabled: !!cfg?.enabled, count }
}

export async function startContiguousPlacementChain(
   region,
   item,
   total,
   { finalizeAsGM = false, applyAutomationToRegion = null } = {},
) {
   const sessionId = foundry.utils.randomID()
   const flagData = {
      sessionId,
      pending: true,
      primary: true,
      index: 1,
      total,
      itemUuid: item.uuid,
   }
   if (finalizeAsGM && !game.user?.isGM) {
      try {
         await executeAsGM("markContiguousPrimary", {
            regionUuid: region.uuid,
            flagData,
         })
      } catch (e) {
         undefined
         try {
            await region.setFlag(FLAG_SCOPE, "contiguousPlacement", flagData)
         } catch (_e) {}
      }
   } else {
      await region.setFlag(FLAG_SCOPE, "contiguousPlacement", flagData)
   }

   setTimeout(() => {
      runContiguousPlacementChain(
         region.uuid,
         item.uuid,
         total,
         sessionId,
         { finalizeAsGM, applyAutomationToRegion },
      ).catch((e) => {
         undefined
      })
   }, 50)
}

async function runContiguousPlacementChain(
   primaryRegionUuid,
   itemUuid,
   total,
   sessionId,
   { finalizeAsGM = false, applyAutomationToRegion = null } = {},
) {
   if (CONTIGUOUS_PLACEMENT_SESSIONS.has(sessionId)) return
   CONTIGUOUS_PLACEMENT_SESSIONS.add(sessionId)
   try {
      const primary = await fromUuid(primaryRegionUuid)
      const item = await tryFromUuid(itemUuid)
      if (!primary?.parent || !item) return
      const automation = readAutomation(item)
      const placedRegions = [primary]
      const baseData = regionDataForContiguousPlacement(
         primary,
         itemUuid,
         sessionId,
         total,
      )
      if (typeof canvas.regions?.placeRegion !== "function") {
         await finalizeContiguousPlacement(
            placedRegions,
            item,
            automation,
            sessionId,
            { finalizeAsGM, applyAutomationToRegion },
         )
         return
      }

      for (let index = 2; index <= total; index++) {
         const data = contiguousPlacementDataForIndex(
            baseData,
            itemUuid,
            sessionId,
            index,
            total,
         )
         let placed = null
         try {
            placed = await canvas.regions.placeRegion(data)
         } catch (e) {
            if (!isPlacementCancellation(e)) {
               undefined
            }
         }
         const placedRegion = regionDocumentFromPlacementResult(placed)
         if (placedRegion?.parent) placedRegions.push(placedRegion)
      }

      await finalizeContiguousPlacement(
         placedRegions,
         item,
         automation,
         sessionId,
         { finalizeAsGM, applyAutomationToRegion },
      )
   } finally {
      CONTIGUOUS_PLACEMENT_SESSIONS.delete(sessionId)
   }
}

function regionDataForContiguousPlacement(region, itemUuid, sessionId, total) {
   const data = region.toObject
      ? region.toObject()
      : foundry.utils.deepClone(region)
   delete data._id
   delete data._stats
   delete data.behaviors
   return contiguousPlacementDataForIndex(data, itemUuid, sessionId, 1, total)
}

function contiguousPlacementDataForIndex(
   source,
   itemUuid,
   sessionId,
   index,
   total,
) {
   const data = foundry.utils.deepClone(source)
   delete data._id
   delete data._stats
   delete data.behaviors
   data.flags ??= {}
   data.flags[FLAG_SCOPE] ??= {}
   delete data.flags[FLAG_SCOPE].managed
   data.flags[FLAG_SCOPE].originUuid = itemUuid
   data.flags[FLAG_SCOPE].contiguousPlacement = {
      sessionId,
      pending: true,
      primary: false,
      index,
      total,
      itemUuid,
   }
   return data
}

function regionDocumentFromPlacementResult(result) {
   if (!result) return null
   if (Array.isArray(result)) {
      for (const entry of result) {
         const doc = regionDocumentFromPlacementResult(entry)
         if (doc) return doc
      }
      return null
   }
   if (result.documentName === "Region") return result
   if (result.document?.documentName === "Region") return result.document
   return null
}

function isPlacementCancellation(error) {
   const message = String(error?.message ?? error ?? "").toLowerCase()
   return (
      message.includes("cancel") ||
      message.includes("abort") ||
      message.includes("skip")
   )
}

async function finalizeContiguousPlacement(
   regions,
   item,
   automation,
   sessionId,
   { finalizeAsGM = false, applyAutomationToRegion = null } = {},
) {
   if (finalizeAsGM && !game.user?.isGM) {
      try {
         await executeAsGM("finalizeContiguousPlacement", {
            regionUuids: regions.map((region) => region?.uuid).filter(Boolean),
            itemUuid: item?.uuid ?? null,
            sessionId,
         })
         return
      } catch (e) {
         undefined
      }
   }
   const liveRegions = []
   const seen = new Set()
   for (const region of regions) {
      const current =
         region?.uuid && typeof fromUuidSync === "function"
            ? fromUuidSync(region.uuid)
            : region
      if (!current?.parent || seen.has(current.id)) continue
      const flag = current.getFlag(FLAG_SCOPE, "contiguousPlacement")
      if (sessionId) {
         if (flag?.sessionId !== sessionId) continue
         if (flag?.itemUuid && item?.uuid && flag.itemUuid !== item.uuid)
            continue
      }
      seen.add(current.id)
      liveRegions.push(current)
   }
   if (!liveRegions.length) return

   const primary = liveRegions[0]
   const scene = primary.parent
   const shapes = liveRegions.flatMap((region) =>
      Array.from(region.shapes ?? []).map(cleanShapeData),
   )
   if (!shapes.length) return

   const forcedDeletion = foundry.data?.operators?.ForcedDeletion
   const updateData = forcedDeletion
      ? {
           shapes,
           flags: { [FLAG_SCOPE]: { contiguousPlacement: forcedDeletion } },
        }
      : { shapes }
   await primary.update(updateData, { render: false })
   if (!forcedDeletion) await primary.unsetFlag(FLAG_SCOPE, "contiguousPlacement")
   clearRegionFootprintCache(primary)

   const extraIds = liveRegions
      .slice(1)
      .filter((region) => region.id && region.parent === scene)
      .map((region) => region.id)
   if (extraIds.length) {
      await scene.deleteEmbeddedDocuments("Region", extraIds)
   }

   if (typeof applyAutomationToRegion === "function") {
      await applyAutomationToRegion(primary, item, automation)
   }
}

function cleanShapeData(shape) {
   const data = shape?.toObject
      ? shape.toObject()
      : foundry.utils.deepClone(shape)
   delete data._id
   delete data._stats
   return data
}

export async function gmMarkContiguousPrimary(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const region = payload.regionUuid
      ? await tryDocumentFromUuid(payload.regionUuid)
      : null
   if (!region?.parent) return { ok: false, reason: "missing-region" }
   const flagData = payload.flagData ?? {}
   if (!flagData.sessionId || !flagData.itemUuid)
      return { ok: false, reason: "invalid-payload" }
   const item = await tryFromUuid(flagData.itemUuid)
   const automation = item ? readAutomation(item) : null
   const contiguous = normalizeContiguousConfig(automation)
   if (!automation?.enabled || !contiguous.enabled || contiguous.count <= 1) {
      return { ok: false, reason: "not-contiguous" }
   }
   await region.setFlag(
      FLAG_SCOPE,
      "contiguousPlacement",
      flagData,
   )
   return { ok: true }
}

export async function gmFinalizeContiguousPlacement(
   payload = {},
   { applyAutomationToRegion = null } = {},
) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const item = payload.itemUuid ? await tryFromUuid(payload.itemUuid) : null
   if (!item) return { ok: false, reason: "missing-item" }
   const automation = readAutomation(item)
   if (!automation?.enabled) return { ok: false, reason: "disabled" }
   const regions = []
   for (const uuid of payload.regionUuids ?? []) {
      const region = await tryDocumentFromUuid(uuid)
      if (region?.parent) regions.push(region)
   }
   await finalizeContiguousPlacement(
      regions,
      item,
      automation,
      payload.sessionId,
      { finalizeAsGM: false, applyAutomationToRegion },
   )
   return { ok: true, count: regions.length }
}
