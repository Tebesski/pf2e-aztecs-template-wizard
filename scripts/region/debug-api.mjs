import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import {
   actorHasLifecycleState,
   getRememberedLifecycleContact,
   lifecycleAdjacentActive,
   runBehaviorScript,
   tokenRegionContact,
} from "./effect-lifecycle.mjs"
import {
   clearRegionFootprintCache,
   getActiveTemplateShapeType,
   getRegionFootprint,
} from "./geometry.mjs"
import { getRegionPolygons } from "./attached-media.mjs"

function resolveRegion(region) {
   if (region) return region
   return (
      canvas.scene?.regions?.find((candidate) =>
         candidate.getFlag(FLAG_SCOPE, "managed"),
      ) ?? null
   )
}

function resolveTokenDocument(token) {
   if (token?.document) return token.document
   if (token?.actor && token?.parent) return token
   if (typeof token === "string") return canvas.scene?.tokens?.get(token) ?? null
   const controlled = canvas.tokens?.controlled?.[0]?.document
   if (controlled) return controlled
   const targeted = game.user?.targets?.values?.().next?.().value?.document
   return targeted ?? null
}

export function debugAdjacentLifecycle(token = null, region = null) {
   const tokenDoc = resolveTokenDocument(token)
   const resolvedRegion = resolveRegion(region)
   if (!resolvedRegion || !tokenDoc) return null

   clearRegionFootprintCache(resolvedRegion)
   const footprint = getRegionFootprint(resolvedRegion)
   const contact = tokenRegionContact(resolvedRegion, tokenDoc)
   const behaviors = (resolvedRegion.behaviors ?? [])
      .filter((behavior) => behavior.type === "executeScript")
      .map((behavior) => {
         const flags = behavior.flags?.[FLAG_SCOPE] ?? {}
         const triggers = flags.triggers ?? []
         const groupKey = flags.triggerGroupKey ?? ""
         return {
            id: behavior.id,
            disabled: !!behavior.disabled,
            events: behavior.system?.events ?? [],
            behaviorType: flags.behaviorType,
            triggers,
            triggerGroupKey: groupKey,
            wantsAdjacent:
               Array.isArray(triggers) && triggers.includes("whileAdjacent"),
            activeNow: lifecycleAdjacentActive(resolvedRegion, contact, triggers),
            actorHasLifecycleState: actorHasLifecycleState(
               tokenDoc.actor,
               resolvedRegion,
               groupKey,
            ),
         }
      })
   const actorEffects =
      tokenDoc.actor?.items
         ?.filter(
            (item) =>
               item.flags?.[MODULE_ID]?.isParentEffect &&
               item.flags?.[MODULE_ID]?.appliedByRegion === resolvedRegion.uuid,
         )
         .map((item) => ({
            id: item.id,
            name: item.name,
            triggerGroupKey: item.flags?.[MODULE_ID]?.triggerGroupKey,
            effectLifecycle: !!item.flags?.[MODULE_ID]?.effectLifecycle,
         })) ?? []

   return {
      activeGM: game.users?.activeGM?.id,
      currentUser: game.user?.id,
      isCurrentUserActiveGM: game.user?.id === game.users?.activeGM?.id,
      region: {
         id: resolvedRegion.id,
         uuid: resolvedRegion.uuid,
         shapeType: getActiveTemplateShapeType(resolvedRegion),
         shapes: resolvedRegion.shapes,
         footprintCells: footprint.cells.length,
         bounds: footprint.bounds,
      },
      token: {
         id: tokenDoc.id,
         name: tokenDoc.name,
         x: tokenDoc.x,
         y: tokenDoc.y,
         width: tokenDoc.width,
         height: tokenDoc.height,
         actor: tokenDoc.actor?.name,
      },
      contact,
      behaviors,
      actorEffects,
      rememberedContact: getRememberedLifecycleContact(resolvedRegion, tokenDoc),
   }
}

export async function debugTriggerAdjacentLifecycle(token = null, region = null) {
   const tokenDoc = resolveTokenDocument(token)
   const resolvedRegion = resolveRegion(region)
   if (!resolvedRegion || !tokenDoc) return null

   const contact = tokenRegionContact(resolvedRegion, tokenDoc)
   const behaviors = (resolvedRegion.behaviors ?? []).filter((behavior) => {
      if (behavior.disabled || behavior.type !== "executeScript") return false
      const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
      return Array.isArray(triggers) && triggers.includes("whileAdjacent")
   })
   const itemSnapshot = () =>
      tokenDoc.actor?.items?.map((item) => ({
         id: item.id,
         name: item.name,
         type: item.type,
         triggerGroupKey: item.flags?.[MODULE_ID]?.triggerGroupKey,
         appliedByRegion: item.flags?.[MODULE_ID]?.appliedByRegion,
         effectLifecycle: !!item.flags?.[MODULE_ID]?.effectLifecycle,
         isParentEffect: !!item.flags?.[MODULE_ID]?.isParentEffect,
      })) ?? []
   const beforeItems = itemSnapshot()
   const dispatches = []
   for (const behavior of behaviors) {
      const result = await runBehaviorScript(
         resolvedRegion,
         behavior,
         tokenDoc,
         "atwAdjacentEnter",
      )
      dispatches.push({
         behaviorId: behavior.id,
         behaviorType: behavior.flags?.[FLAG_SCOPE]?.behaviorType,
         triggers: behavior.flags?.[FLAG_SCOPE]?.triggers ?? [],
         result,
      })
   }
   const afterItems = itemSnapshot()
   const createdItems = afterItems.filter(
      (after) => !beforeItems.some((before) => before.id === after.id),
   )
   return {
      contact,
      behaviorCount: behaviors.length,
      dispatches,
      beforeItems,
      afterItems,
      createdItems,
   }
}

export function debugFootprint(region) {
   const resolvedRegion = resolveRegion(region)
   if (!resolvedRegion) return null
   clearRegionFootprintCache(resolvedRegion)
   return getRegionFootprint(resolvedRegion)
}

export function debugRegionPolygons(region) {
   const resolvedRegion = resolveRegion(region)
   return resolvedRegion ? getRegionPolygons(resolvedRegion) : null
}
