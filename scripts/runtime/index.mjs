import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { installMultiTargetCardListeners } from "./cards.mjs"
import {
   installPlayerSaveSocket,
   requestPlayerChoiceDialog,
   requestPlayerSave,
   requestPlayerSkillRoll,
} from "./player-requests.mjs"
import { installSustainHooks } from "./sustain.mjs"

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
   gmApplyCardHealing,
   gmApplyRestrictionEffect,
   gmPersistCardMessage,
   applyRestrictionEffectToToken,
   moveTokenByRegionVector,
} from "./card-runtime-actions.mjs"
export {
   queueTargetHelperSave,
   queueTargetHelperChoice,
   queueRollDiceCard,
   queueDamageCard,
   queueHealCard,
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
   installRestrictionHooks()
   installRegionDeletionGuard()
   installPlayerSaveSocket()
   installGrantDurationSync()
   installSustainHooks()
   installMultiTargetCardListeners()
}

function installRestrictionHooks() {
   installSpellRestrictionPatch()
   installActionMacroRestrictionPatch()

   Hooks.on("preUpdateToken", (token, changed) => {
      if (!changed || (changed.x === undefined && changed.y === undefined)) return
      const actor = token?.actor
      if (!actorHasRestriction(actor, { kind: "move" })) return
      ui.notifications?.warn(`${actor?.name ?? "This actor"} is restricted from moving.`)
      return false
   })

   Hooks.on("preUpdateItem", (item, changed) => {
      if (!isResourceSpendUpdate(item, changed)) return
      const action = makeItemUseRestrictionContext(item)
      if (!actorHasRestriction(item.actor, action)) return
      ui.notifications?.warn(`${item.actor?.name ?? "This actor"} is restricted from using ${item.name ?? "that item"}.`)
      return false
   })

   Hooks.on("preCreateChatMessage", (message, data) => {
      const context = classifyChatAction(message, data)
      if (!context?.actor || !context.kind) return
      if (!actorHasRestriction(context.actor, context)) return
      ui.notifications?.warn(`${context.actor.name} is restricted from that action.`)
      return false
   })
}

function installActionMacroRestrictionPatch() {
   const api = game.pf2e
   if (!api?.rollActionMacro || api.__atwRestrictActionMacroPatched) return
   const originalRollActionMacro = api.rollActionMacro
   api.rollActionMacro = async function atwRestrictedRollActionMacro(args = {}) {
      const actor = resolveRestrictionMacroActor(args.actorUUID)
      const action = makeActionMacroRestrictionContext(actor, args)
      if (actorHasRestriction(actor, action)) {
         ui.notifications?.warn(`${actor?.name ?? "This actor"} is restricted from that action.`)
         return null
      }
      return originalRollActionMacro.call(this, args)
   }
   Object.defineProperty(api, "__atwRestrictActionMacroPatched", { value: true })
}

function installSpellRestrictionPatch() {
   const SpellcastingEntry =
      CONFIG.PF2E?.Item?.documentClasses?.spellcastingEntry ??
      CONFIG.Item?.documentClasses?.spellcastingEntry ??
      null
   const prototype = SpellcastingEntry?.prototype
   if (!prototype?.cast || prototype.__atwRestrictCastPatched) return
   const originalCast = prototype.cast
   prototype.cast = async function atwRestrictedCast(spell, options = {}) {
      const actor = this.actor ?? spell?.actor
      const context = makeSpellRestrictionContext(actor, spell, options)
      if (actorHasRestriction(actor, context)) {
         ui.notifications?.warn(`${actor?.name ?? "This actor"} is restricted from casting ${spell?.name ?? "that spell"}.`)
         return false
      }
      return originalCast.call(this, spell, options)
   }
   Object.defineProperty(prototype, "__atwRestrictCastPatched", { value: true })
}

function makeSpellRestrictionContext(actor, spell, options = {}) {
   const rollOptions = new Set([
      ...arrayValues(options.rollOptions),
      ...arrayValues(options.options),
      ...arrayValues(spell?.getRollOptions?.("item")),
      ...arrayValues(spell?.getRollOptions?.("spell")),
   ])
   return {
      actor,
      kind: "spell",
      slug: String(spell?.slug ?? spell?.system?.slug ?? ""),
      rollOptions,
   }
}

function resolveRestrictionMacroActor(actorUuid) {
   if (actorUuid && typeof fromUuidSync === "function") {
      try {
         const doc = fromUuidSync(actorUuid)
         if (doc?.documentName === "Actor") return doc
         if (doc?.actor) return doc.actor
      } catch (_e) {}
   }
   return game.user?.character ?? canvas?.tokens?.controlled?.[0]?.actor ?? null
}

function makeActionMacroRestrictionContext(actor, args = {}) {
   const type = String(args.type ?? "")
   const item = args.itemId ? actor?.items?.get?.(args.itemId) : null
   const rollOptions = new Set(actionRollOptionsFromItem(item))
   let kind = itemRestrictionKind(item)
   let slug = normalizeItemSlug(item) || String(args.slug ?? "")
   if (["strike", "area-fire", "auto-fire", "blast"].includes(type)) {
      kind = "strike"
      if (type === "blast") {
         slug = "elemental-blast"
         rollOptions.add("action:elemental-blast")
         if (args.elementTrait) rollOptions.add(`element:${args.elementTrait}`)
      }
   }
   if (slug) rollOptions.add(`slug:${slug}`)
   return { actor, kind, slug, rollOptions }
}

function makeItemUseRestrictionContext(item) {
   const kind = itemRestrictionKind(item)
   const slug = normalizeItemSlug(item)
   const rollOptions = new Set(actionRollOptionsFromItem(item))
   if (slug) rollOptions.add(`slug:${slug}`)
   return { actor: item?.actor, kind, slug, rollOptions }
}

function itemRestrictionKind(item) {
   if (!item) return null
   if (item.type === "spell") return "spell"
   if (["weapon", "melee"].includes(item.type)) return "strike"
   if (["consumable", "equipment", "armor", "backpack", "treasure"].includes(item.type)) {
      return "item"
   }
   return "ability"
}

function normalizeItemSlug(item) {
   return String(
      item?.slug ??
         item?.system?.slug ??
         item?.system?.slug?.value ??
         "",
   )
}

function actionRollOptionsFromItem(item) {
   const options = [
      ...arrayValues(item?.getRollOptions?.("item")),
      ...arrayValues(item?.getRollOptions?.("parent")),
      ...arrayValues(item?.getRollOptions?.("self")),
   ]
   const slug = normalizeItemSlug(item)
   if (slug) options.push(`item:slug:${slug}`, `slug:${slug}`)
   return options
}

function classifyChatAction(message, data = {}) {
   const pf2eFlags =
      foundry.utils.getProperty(data, "flags.pf2e") ??
      message?.flags?.pf2e ??
      {}
   const context = pf2eFlags.context ?? {}
   const speaker = data.speaker ?? message?.speaker ?? {}
   const actor =
      resolveActorFromContext(context) ??
      game.actors?.get?.(speaker.actor) ??
      canvas?.tokens?.get?.(speaker.token)?.actor ??
      null
   if (!actor) return null
   const itemUuid =
      context.item?.uuid ??
      context.origin?.item?.uuid ??
      pf2eFlags.origin?.uuid ??
      pf2eFlags.origin?.itemUuid ??
      null
   let item = null
   if (itemUuid && typeof fromUuidSync === "function") {
      try {
         item = fromUuidSync(itemUuid)
      } catch (_e) {}
   }
   if (!item && context.identifier) {
      const itemId = String(context.identifier).split(".")[0]
      item = actor.items?.get?.(itemId) ?? null
   }
   const identifierSlug = String(context.identifier ?? "").split(".")[1] ?? ""
   const itemSlug = String(
      item?.slug ??
         item?.system?.slug ??
         context.item?.slug ??
         context.slug ??
         identifierSlug ??
         "",
   )
   const rollOptions = new Set([
      ...arrayValues(context.options),
      ...arrayValues(context.rollOptions),
      ...arrayValues(pf2eFlags.rollOptions),
      ...arrayValues(item?.getRollOptions?.("item")),
      ...actionRollOptionsFromItem(item),
   ])
   const actionSlug = String(context.action ?? "").trim()
   if (actionSlug) rollOptions.add(`action:${actionSlug}`)
   const type = String(context.type ?? "")
   const statistic = resolveStatisticSlug(context, rollOptions, actor)
   let kind = null
   if (actionSlug === "elemental-blast" || rollOptions.has("action:elemental-blast")) {
      kind = "strike"
   } else if (
      actionSlug === "strike" ||
      type.includes("strike") ||
      (type.includes("attack") && ["weapon", "melee"].includes(item?.type))
   ) {
      kind = "strike"
   } else if (
      type.includes("skill") ||
      actor.skills?.[statistic] ||
      statistic === "perception"
   ) {
      kind = "skill"
   } else if (item?.type === "spell" || type.includes("spell")) {
      kind = "spell"
   } else if (["consumable", "equipment", "armor", "weapon", "backpack", "treasure"].includes(item?.type)) {
      kind = "item"
   } else if (item) {
      kind = "ability"
   }
   const slug = kind === "strike" && rollOptions.has("action:elemental-blast")
      ? "elemental-blast"
      : itemSlug
   return { actor, kind, slug, rollOptions, skill: statistic }
}

function resolveActorFromContext(context) {
   const candidates = [
      context.actor ? `Actor.${context.actor}` : null,
      context.origin?.actor,
      context.target?.actor,
   ].filter(Boolean)
   for (const uuid of candidates) {
      if (typeof uuid === "string" && !uuid.startsWith("Actor.")) continue
      try {
         const actor =
            typeof fromUuidSync === "function" ? fromUuidSync(uuid) : null
         if (actor?.documentName === "Actor") return actor
      } catch (_e) {}
   }
   return null
}

function resolveStatisticSlug(context, rollOptions, actor) {
   const direct = String(
      context.statistic?.slug ??
         context.statistic ??
         context.skill ??
         "",
   ).replace(/-check$/, "")
   if (direct) return direct
   for (const option of rollOptions) {
      const match = String(option).match(/^check:statistic:(.+)$/)
      if (match) return match[1]
   }
   for (const domain of arrayValues(context.domains)) {
      const value = String(domain).replace(/-check$/, "")
      if (actor?.skills?.[value] || value === "perception" || value.endsWith("-lore")) {
         return value
      }
   }
   return ""
}

function actorHasRestriction(actor, action) {
   if (!actor || !action?.kind) return false
   const restrictions = actorRestrictionEntries(actor)
   return restrictions.some((entry) => restrictionMatches(entry, action))
}

function actorRestrictionEntries(actor) {
   const entries = []
   for (const item of actor.items ?? []) {
      const flags = item.flags?.[MODULE_ID]
      if (!flags?.restrictionEffect) continue
      if (Array.isArray(flags.restrictions)) entries.push(...flags.restrictions)
   }
   return entries
}

function restrictionMatches(entry, action) {
   if (!entry || entry.kind !== action.kind) return false
   if (entry.kind === "skill") {
      const wanted = entry.skill === "lore" ? normalizeLoreSlug(entry.lore) : entry.skill
      if (wanted && action.skill !== wanted) return false
      return restrictionRollOptionsMatch(entry, action)
   }
   const slug = String(entry.slug ?? "").trim()
   if (slug && slug !== action.slug) return false
   return restrictionRollOptionsMatch(entry, action)
}

function restrictionRollOptionsMatch(entry, action) {
   const requiredOptions = splitRestrictionOptions(entry.rollOptions)
   if (requiredOptions.length) {
      for (const option of requiredOptions) {
         if (!action.rollOptions?.has?.(option)) return false
      }
   }
   return true
}

function isResourceSpendUpdate(item, changed) {
   if (!item?.actor || !changed) return false
   const paths = [
      "system.uses.value",
      "system.charges.value",
      "system.quantity",
      "system.frequency.value",
      "system.resources.value",
      "system.prepared.value",
      "system.spent",
      "system.badge.value",
   ]
   return paths.some((path) => valueDecreased(item, changed, path))
}

function valueDecreased(document, changed, path) {
   if (foundry.utils.getProperty(changed, path) === undefined) return false
   const previous = Number(foundry.utils.getProperty(document, path))
   const next = Number(foundry.utils.getProperty(changed, path))
   return Number.isFinite(previous) && Number.isFinite(next) && next < previous
}

function splitRestrictionOptions(value) {
   return String(value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
}

function arrayValues(value) {
   return Array.isArray(value) ? value.filter(Boolean).map(String) : []
}

function normalizeLoreSlug(value) {
   return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
}

function installGrantDurationSync() {
   Hooks.on("createItem", (item) => {
      if (!item?.flags?.[MODULE_ID]?.isParentEffect) return
      setTimeout(() => syncGrantedItemDuration(item).catch((e) => {
         undefined
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
               undefined
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
      const regionUuid = region?.uuid
      markRegionDeleting(regionUuid)
      if (game.user?.id === game.users?.activeGM?.id) {
         setTimeout(() => {
            cleanupRestrictionEffectsForRegionUuid(regionUuid).catch((e) => {
               undefined
            })
         }, 0)
      }
   })
}

async function cleanupRestrictionEffectsForRegionUuid(regionUuid) {
   if (!regionUuid || game.user?.id !== game.users?.activeGM?.id) return
   for (const actor of game.actors ?? []) {
      const ids = Array.from(actor.items ?? [])
         .filter((item) => {
            const flags = item.flags?.[MODULE_ID] ?? {}
            return flags.restrictionEffect && flags.appliedByRegion === regionUuid
         })
         .map((item) => item.id)
      if (ids.length) {
         await actor.deleteEmbeddedDocuments("Item", ids, { render: false })
      }
   }
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
      undefined
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
         undefined
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
