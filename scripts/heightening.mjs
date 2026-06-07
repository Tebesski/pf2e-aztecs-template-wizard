import {
   BEHAVIOR_CATALOG,
   FLAG_SCOPE,
   defaultShapeVariant,
   defaultTileAttachment,
   normalizeTileAttachments,
} from "./data.mjs"

const RECENT_SPELL_CASTS = new Map()
const RECENT_SPELL_CAST_MAX_AGE_MS = 10 * 60 * 1000

const DAMAGE_ACTIONS = new Set([
   "increaseDamage",
   "decreaseDamage",
   "addDamage",
   "setDamageType",
])

const SAVING_THROW_ACTIONS = new Set([
   "setSavingThrow",
   "setBasicDamage",
   "increaseBasicDamage",
])

const LIST_ACTIONS = new Set([
   "addTrigger",
   "removeTrigger",
   "addTarget",
   "removeTarget",
   "addRollOption",
   "removeRollOption",
   "addRollOptionExclude",
   "removeRollOptionExclude",
   "addIgnoredBy",
   "removeIgnoredBy",
])

const FIELD_ACTIONS = new Set([
   "setField",
   "setMovementCost",
   "setTile",
   "increaseHealing",
   "decreaseHealing",
   "setHealingType",
   "increaseField",
   "decreaseField",
   "setDuration",
   "setCondition",
   "setDiceFormula",
   "setRuleElement",
   "addExtraRollOption",
   "removeExtraRollOption",
   "addTagValue",
   "removeTagValue",
   "setSound",
   "setLight",
   "addRestriction",
   "removeRestriction",
])

const CHOICE_ACTIONS = new Set([
   "addChoice",
   "removeChoice",
])

const CONSEQUENCE_ACTIONS = new Set([
   "addConsequence",
   "removeConsequence",
   "modifyConsequence",
])

const IWR_ACTIONS = new Set([
   "addIWR",
   "removeIWR",
   "increaseIWR",
   "decreaseIWR",
])

const SHAPE_ACTIONS = new Set([
   "increaseTemplateSize",
   "decreaseTemplateSize",
   "setTemplateShape",
   "addTemplateShape",
])

const INCREMENTAL_ACTIONS = new Set([
   "increaseDamage",
   "decreaseDamage",
   "addDamage",
   "increaseTemplateSize",
   "decreaseTemplateSize",
   "increaseField",
   "decreaseField",
   "increaseHealing",
   "decreaseHealing",
   "increaseIWR",
   "decreaseIWR",
   "increaseBasicDamage",
])

const ONE_OFF_ACTIONS = new Set([
   "setField",
   "setMovementCost",
   "setTile",
   "setHealingType",
   "setDamageType",
   "setTemplateShape",
   "addTemplateShape",
   "addTrigger",
   "removeTrigger",
   "addTarget",
   "removeTarget",
   "addRollOption",
   "removeRollOption",
   "addRollOptionExclude",
   "removeRollOptionExclude",
   "addIgnoredBy",
   "removeIgnoredBy",
   "addIWR",
   "removeIWR",
   "setDuration",
   "setCondition",
   "setDiceFormula",
   "setRuleElement",
   "addExtraRollOption",
   "removeExtraRollOption",
   "addTagValue",
   "removeTagValue",
   "setSound",
   "setLight",
   "addRestriction",
   "removeRestriction",
   "setSavingThrow",
   "setBasicDamage",
   "addChoice",
   "removeChoice",
   "addConsequence",
   "removeConsequence",
   "modifyConsequence",
   "setExpiration",
])

const HEIGHTEN_ACTION_MODES = {
   every: INCREMENTAL_ACTIONS,
   on: ONE_OFF_ACTIONS,
}

export function defaultHeightenRule() {
   return {
      id: foundry.utils.randomID(),
      collapsed: false,
      mode: "every",
      value: 1,
      source: "item",
      actions: [],
   }
}

export function defaultHeightenAction(type, entry = null) {
   const damageField = firstFieldOfType(entry, "damageList")?.key ?? "damages"
   switch (type) {
      case "increaseDamage":
      case "decreaseDamage":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: damageField,
            amount: 1,
         }
      case "addDamage":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: damageField,
            damage: {
               diceCount: 1,
               dieSize: "d6",
               damageType: "fire",
               category: "normal",
            },
         }
      case "setDamageType":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: damageField,
            damageIndex: 0,
            damageType: "fire",
         }
      case "setSavingThrow":
         return {
            id: foundry.utils.randomID(),
            type,
            save: ["fortitude", "reflex", "will"].includes(entry?.system?.save)
               ? entry.system.save
               : "reflex",
            dc: String(entry?.system?.dc ?? "15"),
         }
      case "setBasicDamage":
         return {
            id: foundry.utils.randomID(),
            type,
            damages: normalizeDamageRowsForAction(entry?.system?.basicDamages),
         }
      case "increaseBasicDamage":
         return {
            id: foundry.utils.randomID(),
            type,
            amount: 1,
         }
      case "setField": {
         const field = firstEditableField(entry)
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: field?.key ?? "",
            value: "",
         }
      }
      case "increaseHealing":
      case "decreaseHealing":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: "amount",
            amount: 5,
         }
      case "setHealingType":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: "healingType",
            value: ["untyped", "vitality", "void"].includes(entry?.system?.healingType)
               ? entry.system.healingType
               : "untyped",
         }
      case "setMovementCost":
         return {
            id: foundry.utils.randomID(),
            type,
            preset: ["difficult", "greaterDifficult", "custom"].includes(entry?.system?.preset)
               ? entry.system.preset
               : "difficult",
            customCost: Math.max(1, Number(entry?.system?.customCost) || 2),
         }
      case "setTile": {
         const fieldKey = firstFieldOfType(entry, "tileList")?.key ?? "tiles"
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            tileIndex: 0,
            tileAttachment: defaultTileAttachmentAction(entry, fieldKey, 0),
         }
      }
      case "setDuration":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: firstFieldOfType(entry, "duration")?.key ?? "duration",
            duration: { enabled: true, amount: 1, unit: "rounds" },
         }
      case "setCondition": {
         const fieldKey = firstFieldOfType(entry, "conditionPicker")?.key ?? "condition"
         const current = entry?.system?.[fieldKey]
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            condition: {
               slug: current?.slug ?? "frightened",
               value: Math.max(1, Number(current?.value) || 1),
            },
         }
      }
      case "setDiceFormula": {
         const fieldKey = firstFieldOfType(entry, "diceFormula")?.key ?? "dice"
         const current = entry?.system?.[fieldKey]
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            dice: {
               diceCount: Math.max(1, Number(current?.diceCount) || 1),
               dieSize: Math.max(2, Number(current?.dieSize) || 20),
            },
         }
      }
      case "setRuleElement": {
         const fieldKey = firstFieldOfType(entry, "ruleElementList")?.key ?? "rules"
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            ruleIndex: 0,
            rule: firstRuleElementValue(entry, fieldKey, 0),
         }
      }
      case "addExtraRollOption":
      case "removeExtraRollOption": {
         const fieldKey = firstFieldOfType(entry, "extraRollOptions")?.key ?? "extraRollOptions"
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            value: firstExtraRollOptionValue(entry, fieldKey, type),
         }
      }
      case "addTagValue":
      case "removeTagValue": {
         const field = firstGenericTagField(entry)
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: field?.key ?? "",
            value: firstTagActionValue(entry, field, type),
         }
      }
      case "setSound": {
         const fieldKey = firstFieldOfType(entry, "soundEditor")?.key ?? "sound"
         const current = entry?.system?.[fieldKey] ?? {}
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            sound: foundry.utils.deepClone(current),
         }
      }
      case "setLight": {
         const fieldKey = firstFieldOfType(entry, "lightEditor")?.key ?? "light"
         const current = entry?.system?.[fieldKey] ?? {}
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            light: foundry.utils.deepClone(current),
         }
      }
      case "addRestriction":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: firstFieldOfType(entry, "restrictionList")?.key ?? "restrictions",
            restriction: {
               kind: "spell",
               slug: "",
               rollOptions: "",
               skill: "athletics",
               lore: "",
            },
         }
      case "removeRestriction":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: firstFieldOfType(entry, "restrictionList")?.key ?? "restrictions",
            restrictionIndex: 0,
         }
      case "setExpiration":
         return {
            id: foundry.utils.randomID(),
            type,
            amount: 1,
            unit: "minutes",
         }
      case "addChoice":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: firstFieldOfType(entry, "choiceList")?.key ?? "choices",
            choice: defaultChoiceAction(),
         }
      case "removeChoice":
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: firstFieldOfType(entry, "choiceList")?.key ?? "choices",
            choiceIndex: 0,
         }
      case "addConsequence": {
         const field = firstConsequenceField(entry)
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: field?.key ?? "consequences",
            consequence: defaultConsequenceForField(field),
         }
      }
      case "removeConsequence": {
         const field = firstConsequenceField(entry)
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: field?.key ?? "consequences",
            consequenceIndex: 0,
         }
      }
      case "modifyConsequence": {
         const field = firstConsequenceField(entry)
         const fieldKey = field?.key ?? "consequences"
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey,
            consequenceIndex: 0,
            consequence: foundry.utils.deepClone(
               firstConsequenceValue(entry, fieldKey) ?? defaultConsequenceForField(field),
            ),
         }
      }
      case "increaseField":
      case "decreaseField": {
         const field = firstNumericField(entry)
         return {
            id: foundry.utils.randomID(),
            type,
            fieldKey: field?.key ?? "",
            amount: 1,
         }
      }
      case "addIWR":
      case "removeIWR":
      case "increaseIWR":
      case "decreaseIWR":
         return {
            id: foundry.utils.randomID(),
            type,
            ...firstIwrActionDefaults(entry, type),
            amount: 5,
         }
      case "addTrigger":
      case "removeTrigger":
         return { id: foundry.utils.randomID(), type, value: "tokenEnter" }
      case "addTarget":
      case "removeTarget":
         return { id: foundry.utils.randomID(), type, value: "all" }
      case "addRollOption":
      case "removeRollOption":
      case "addRollOptionExclude":
      case "removeRollOptionExclude":
      case "addIgnoredBy":
      case "removeIgnoredBy":
         return { id: foundry.utils.randomID(), type, value: "" }
      case "increaseTemplateSize":
      case "decreaseTemplateSize":
         return { id: foundry.utils.randomID(), type, amount: 5 }
      case "setTemplateShape":
         return {
            id: foundry.utils.randomID(),
            type,
            shapeIndex: 0,
            shape: defaultShapeVariant(),
         }
      case "addTemplateShape":
         return {
            id: foundry.utils.randomID(),
            type,
            shape: defaultShapeVariant(),
         }
      default:
         return { id: foundry.utils.randomID(), type: "increaseTemplateSize", amount: 5 }
   }
}

export function availableHeightenActions(entry, mode = "every") {
   const fields = fieldsForEntry(entry)
   let out = [
      { value: "increaseTemplateSize", label: "Increase template size" },
      { value: "decreaseTemplateSize", label: "Decrease template size" },
      { value: "setTemplateShape", label: "Change template shape" },
      { value: "addTemplateShape", label: "Add template shape" },
   ]
   if (entry?.type === "savingThrow") {
      out.push(
         { value: "setSavingThrow", label: "Modify saving throw" },
         { value: "setBasicDamage", label: "Modify Basic Damage" },
         { value: "increaseBasicDamage", label: "Increase Basic Damage" },
      )
   } else if (fields.some((field) => field.type === "damageList")) {
      out.unshift(
         { value: "increaseDamage", label: "Increase damage" },
         { value: "decreaseDamage", label: "Decrease damage" },
         { value: "addDamage", label: "Add damage" },
         { value: "setDamageType", label: "Modify damage type" },
      )
   }
   if (entry?.type === "heal") {
      out.unshift(
         { value: "increaseHealing", label: "Increase healing" },
         { value: "decreaseHealing", label: "Decrease healing" },
         { value: "setHealingType", label: "Change healing type" },
      )
   }
   if (entry?.type === "restrictActions") {
      out.push(
         { value: "addRestriction", label: "Add restriction" },
         { value: "removeRestriction", label: "Remove restriction" },
      )
   }
   if (entry?.type !== "modifyMovementCost" && fields.some(isNumericField)) {
      out.push(
         { value: "increaseField", label: "Increase behaviour value" },
         { value: "decreaseField", label: "Decrease behaviour value" },
      )
   }
   if (fields.some(isIwrField)) {
      out.push(
         { value: "increaseIWR", label: "Increase IWR" },
         { value: "decreaseIWR", label: "Decrease IWR" },
         { value: "addIWR", label: "Add IWR" },
         { value: "removeIWR", label: "Remove IWR" },
      )
   }
   if (fields.some((field) => field.type === "duration")) {
      out.push({ value: "setDuration", label: "Change duration" })
   }
   if (fields.some((field) => field.type === "conditionPicker")) {
      out.push({ value: "setCondition", label: "Change condition" })
   }
   if (fields.some((field) => field.type === "diceFormula")) {
      out.push({ value: "setDiceFormula", label: "Change dice formula" })
   }
   if (fields.some((field) => field.type === "extraRollOptions")) {
      out.push(
         { value: "addExtraRollOption", label: "Add appended roll option" },
         { value: "removeExtraRollOption", label: "Remove appended roll option" },
      )
   }
   if (fields.some((field) => field.type === "tileList")) {
      out.push({ value: "setTile", label: "Modify behaviour" })
   }
   if (fields.some(isGenericTagField)) {
      const addLabel =
         entry?.type === "modifyMovementCost"
            ? "Add Movement Type"
            : "Add list entry"
      const removeLabel =
         entry?.type === "modifyMovementCost"
            ? "Remove Movement Type"
            : "Remove list entry"
      out.push(
         { value: "addTagValue", label: addLabel },
         { value: "removeTagValue", label: removeLabel },
      )
   }
   if (fields.some((field) => field.type === "soundEditor")) {
      out.push({ value: "setSound", label: "Modify behaviour" })
   }
   if (fields.some((field) => field.type === "lightEditor")) {
      out.push({ value: "setLight", label: "Modify behaviour" })
   }
   if (fields.some((field) => field.type === "ruleElementList")) {
      out.push({ value: "setRuleElement", label: "Change Rule Element" })
   }
   if (entry?.type === "modifyMovementCost") {
      out.push({ value: "setMovementCost", label: "Modify behaviour" })
   } else if (
      entry?.type !== "applyRuleElement" &&
      entry?.type !== "savingThrow" &&
      fields.some(isSimpleEditableField)
   ) {
      out.push({
         value: "setField",
         label:
            entry?.type === "applyActiveEffect"
               ? "Change Active Effect"
               : "Modify behaviour",
      })
   }
   if (fields.some((field) => field.type === "choiceList")) {
      out.push(
         { value: "addChoice", label: "Add Choice" },
         { value: "removeChoice", label: "Remove Choice" },
      )
   }
   if (fields.some(isConsequenceField)) {
      out.push(
         { value: "addConsequence", label: "Add Consequence" },
         { value: "removeConsequence", label: "Remove Consequence" },
         { value: "modifyConsequence", label: "Modify Consequence" },
      )
   }
   if (fields.some((field) => field.key === "triggers")) {
      out.push(
         { value: "addTrigger", label: "Add trigger" },
         { value: "removeTrigger", label: "Remove trigger" },
      )
   }
   if (fields.some((field) => field.key === "target")) {
      out.push(
         { value: "addTarget", label: "Add target" },
         { value: "removeTarget", label: "Remove target" },
      )
   }
   if (fields.some((field) => field.key === "rollOptions")) {
      out.push(
         { value: "addRollOption", label: "Add Must have roll option" },
         { value: "removeRollOption", label: "Remove Must have roll option" },
      )
   }
   if (fields.some((field) => field.key === "rollOptionsExclude")) {
      out.push(
         { value: "addRollOptionExclude", label: "Add Must not have roll option" },
         { value: "removeRollOptionExclude", label: "Remove Must not have roll option" },
      )
   }
   if (fields.some((field) => field.key === "ignoredBy")) {
      out.push(
         { value: "addIgnoredBy", label: "Add Ignored by" },
         { value: "removeIgnoredBy", label: "Remove Ignored by" },
      )
   }
   const allowed = heightenActionSetForMode(mode)
   out = out.filter((option) => allowed.has(option.value))
   return out.length
      ? out
      : [{ value: "increaseTemplateSize", label: "Increase template size" }]
}

export function heightenActionAllowedForMode(action, mode) {
   if (!action?.type) return false
   return heightenActionSetForMode(mode).has(action.type)
}

export function coerceHeightenActionsForMode(entry, actions, mode = "every") {
   const allowed = heightenActionSetForMode(mode)
   const source = Array.isArray(actions) ? actions : []
   if (!source.length) return []
   const valid = source.filter((action) => action && allowed.has(action.type))
   if (valid.length) return valid
   const first = availableHeightenActions(entry, mode)[0]?.value ?? "increaseTemplateSize"
   return [defaultHeightenAction(first, entry)]
}

export function normalizeHeightenRules(entry) {
   if (!entry || !Array.isArray(entry.heighten)) return []
   return entry.heighten
      .filter((rule) => rule && typeof rule === "object")
      .map((rule) => ({
         id: rule.id ? String(rule.id) : foundry.utils.randomID(),
         collapsed: rule.collapsed !== false,
         mode: rule.mode === "on" ? "on" : "every",
         value: Math.max(1, Number(rule.value) || 1),
         source: rule.source === "placer" ? "placer" : "item",
         actions: Array.isArray(rule.actions)
            ? rule.actions
                 .filter((action) => action && typeof action === "object")
                 .map((action) => ({
                    id: action.id ? String(action.id) : foundry.utils.randomID(),
                    ...foundry.utils.deepClone(action),
                 }))
            : [],
      }))
}

export function resolveAutomationHeightening(
   automation,
   item,
   { region = null } = {},
) {
   const resolved = foundry.utils.deepClone(automation ?? {})
   resolved.behaviors = Array.isArray(resolved.behaviors)
      ? resolved.behaviors
      : []
   const spellHeightening = spellCastHeightening(item, { region })
   const context = {
      item,
      spellHeightening,
      itemLevel: itemLevel(item, { spellHeightening }),
      placerLevel: placerLevel(item),
   }

   for (const entry of resolved.behaviors) {
      const rules = normalizeHeightenRules(entry)
      if (!rules.length) continue
      for (const rule of rules) {
         const applications = heightenApplications(rule, context)
         if (applications <= 0) continue
         for (const action of rule.actions ?? []) {
            if (!heightenActionAllowedForMode(action, rule.mode)) continue
            applyHeightenAction(resolved, entry, action, applications)
         }
      }
   }

   const expirationRules = normalizeHeightenRules(resolved.expiration)
   for (const rule of expirationRules) {
      const applications = heightenApplications(rule, context)
      if (applications <= 0) continue
      for (const action of rule.actions ?? []) {
         if (action?.type !== "setExpiration") continue
         applyExpirationHeightening(resolved, action)
      }
   }

   return resolved
}

function heightenActionSetForMode(mode) {
   return HEIGHTEN_ACTION_MODES[mode === "on" ? "on" : "every"]
}

export function heightenApplications(rule, context) {
   const level = heightenRuleLevel(rule, context)
   const threshold = Math.max(1, Number(rule.value) || 1)
   if (rule.mode === "on") return level >= threshold ? 1 : 0
   return Math.max(0, Math.floor(level / threshold))
}

function heightenRuleLevel(rule, context) {
   if (rule.source === "placer") return context.placerLevel
   if (rule.mode === "on" && context.spellHeightening?.castRank !== null) {
      const castRank = Number(context.spellHeightening?.castRank)
      if (Number.isFinite(castRank)) return castRank
   }
   return context.itemLevel
}

export function itemLevel(item, { spellHeightening = null } = {}) {
   if (isSpellItem(item)) {
      if (spellHeightening?.levels !== null && spellHeightening?.levels !== undefined) {
         return Math.max(0, Number(spellHeightening.levels) || 0)
      }
      return 0
   }
   const candidates = [
      item?.system?.level?.value,
      item?.system?.level,
      item?.level,
      item?.rank,
   ]
   return positiveNumber(candidates, 0)
}

export function registerSpellCastHeighteningCapture() {
   if (!globalThis.document?.addEventListener) return
   if (globalThis.__atwSpellCastHeighteningCapture) return
   globalThis.__atwSpellCastHeighteningCapture = true
   document.addEventListener("click", recordSpellCastFromEvent, true)
}

export function spellCastHeighteningForItemUuid(itemUuid) {
   if (!itemUuid) return null
   cleanupRecentSpellCasts()
   return RECENT_SPELL_CASTS.get(itemUuid) ?? null
}

export function spellCastHeightening(item, { region = null } = {}) {
   const flagged = spellCastHeighteningFromRegion(region)
   if (flagged) return completeSpellCastHeightening(flagged, item)

   const keys = spellCastKeysForItem(item)
   cleanupRecentSpellCasts()
   for (const key of keys) {
      const recent = RECENT_SPELL_CASTS.get(key)
      if (recent) return completeSpellCastHeightening(recent, item)
   }

   return completeSpellCastHeightening(spellCastHeighteningFromRecentChat(item), item)
}

export function placerLevel(item) {
   const actor = item?.actor ?? game.user?.character ?? null
   const candidates = [
      actor?.level,
      actor?.system?.details?.level?.value,
      actor?.system?.attributes?.level?.value,
      actor?.system?.level?.value,
      actor?.system?.level,
   ]
   return positiveNumber(candidates, 0)
}

function recordSpellCastFromEvent(event) {
   const area = event.target?.closest?.("[data-effect-area][data-item-uuid]")
   if (!area) return
   const card = area.closest?.(".pf2e.chat-card.item-card[data-cast-rank]")
   if (!card) return
   const castRank = numberOrNull(card.dataset.castRank)
   if (castRank === null) return
   const itemUuid = area.dataset.itemUuid
   const actorId = card.dataset.actorId ?? null
   const itemId = card.dataset.itemId ?? null
   const baseRank = baseRankFromCastCard(card)
   const info = normalizeSpellCastHeightening({
      castRank,
      baseRank,
      actorId,
      itemId,
      itemUuid,
      source: "chat-click",
   })
   if (!info) return
   for (const key of spellCastKeys({ itemUuid, actorId, itemId })) {
      RECENT_SPELL_CASTS.set(key, info)
   }
}

function spellCastHeighteningFromRegion(region) {
   const direct = region?.getFlag?.(FLAG_SCOPE, "spellCastHeightening")
   const normalized = normalizeSpellCastHeightening({
      ...(direct ?? {}),
      source: direct?.source ?? "region-flag",
   })
   if (normalized) return normalized

   const flags = region?.flags ?? {}
   for (const namespace of Object.values(flags)) {
      const found = findCastInfoInObject(namespace)
      if (found) return found
   }
   return null
}

function spellCastHeighteningFromRecentChat(item) {
   if (!isSpellItem(item)) return null
   const actorId = item?.actor?.id ?? null
   const itemId = item?.id ?? null
   const source = Array.isArray(game.messages?.contents)
      ? game.messages.contents
      : Array.from(game.messages ?? [])
   const messages = source.slice().reverse().slice(0, 50)
   for (const message of messages) {
      const info = spellCastHeighteningFromMessage(message, { actorId, itemId })
      if (info) return info
   }
   return null
}

function spellCastHeighteningFromMessage(message, { actorId = null, itemId = null } = {}) {
   const content = message?.content
   if (!content || !globalThis.document?.createElement) return null
   const wrap = document.createElement("div")
   wrap.innerHTML = content
   const cards = Array.from(
      wrap.querySelectorAll(".pf2e.chat-card.item-card[data-cast-rank]"),
   )
   for (const card of cards) {
      if (actorId && card.dataset.actorId && card.dataset.actorId !== actorId) continue
      if (itemId && card.dataset.itemId && card.dataset.itemId !== itemId) continue
      const castRank = numberOrNull(card.dataset.castRank)
      if (castRank === null) continue
      const info = normalizeSpellCastHeightening({
         castRank,
         baseRank: baseRankFromCastCard(card),
         actorId: card.dataset.actorId ?? actorId,
         itemId: card.dataset.itemId ?? itemId,
         source: "recent-chat",
      })
      if (info) return info
   }
   return null
}

function findCastInfoInObject(value) {
   if (!value || typeof value !== "object") return null
   const direct = normalizeSpellCastHeightening({
      castRank: value.castRank ?? value.cast_rank ?? value.rank,
      baseRank: value.baseRank ?? value.base_rank,
      levels: value.levels ?? value.heightenLevels ?? value.heightenedLevels,
      actorId: value.actorId ?? value.actor,
      itemId: value.itemId ?? value.item,
      itemUuid: value.itemUuid ?? value.uuid,
      source: "region-flags",
   })
   if (direct) return direct
   for (const child of Object.values(value)) {
      const found = findCastInfoInObject(child)
      if (found) return found
   }
   return null
}

function baseRankFromCastCard(card) {
   const footerText = card.querySelector("footer")?.textContent ?? ""
   const baseMatch = footerText.match(/Base:\s*(\d+)/i)
   const footerBase = numberOrNull(baseMatch?.[1])
   if (footerBase !== null) return footerBase
   return null
}

function normalizeSpellCastHeightening(source) {
   const castRank = numberOrNull(source?.castRank)
   const baseRank = numberOrNull(source?.baseRank)
   const levels = numberOrNull(source?.levels)
   const resolvedLevels =
      levels !== null
         ? Math.max(0, levels)
         : castRank !== null && baseRank !== null
           ? Math.max(0, castRank - baseRank)
           : null
   if (castRank === null && resolvedLevels === null) return null
   return {
      castRank,
      baseRank,
      levels: resolvedLevels,
      actorId: source?.actorId ? String(source.actorId) : null,
      itemId: source?.itemId ? String(source.itemId) : null,
      itemUuid: source?.itemUuid ? String(source.itemUuid) : null,
      source: source?.source ? String(source.source) : null,
      capturedAt: Number(source?.capturedAt) || Date.now(),
   }
}

function completeSpellCastHeightening(info, item) {
   if (!info) return null
   if (info.levels !== null && info.levels !== undefined) return info
   const castRank = numberOrNull(info.castRank)
   const baseRank = numberOrNull(info.baseRank) ?? baseSpellRank(item)
   if (castRank === null || baseRank === null) return info
   return {
      ...info,
      baseRank,
      levels: Math.max(0, castRank - baseRank),
   }
}

function baseSpellRank(item) {
   if (!isSpellItem(item)) return null
   const candidates = [
      item?.system?.level?.value,
      item?.system?.level,
      item?.system?.rank?.value,
      item?.system?.rank,
      item?.level,
      item?.rank,
   ]
   for (const candidate of candidates) {
      const number = numberOrNull(candidate)
      if (number !== null) return number
   }
   return null
}

function spellCastKeysForItem(item) {
   return spellCastKeys({
      itemUuid: item?.uuid,
      actorId: item?.actor?.id,
      itemId: item?.id,
   })
}

function spellCastKeys({ itemUuid = null, actorId = null, itemId = null } = {}) {
   return [
      itemUuid,
      actorId && itemId ? `${actorId}:${itemId}` : null,
      itemId ? `item:${itemId}` : null,
   ].filter(Boolean)
}

function cleanupRecentSpellCasts() {
   const cutoff = Date.now() - RECENT_SPELL_CAST_MAX_AGE_MS
   for (const [key, value] of RECENT_SPELL_CASTS) {
      if ((Number(value?.capturedAt) || 0) < cutoff) RECENT_SPELL_CASTS.delete(key)
   }
}

function isSpellItem(item) {
   return item?.type === "spell"
}

function numberOrNull(value) {
   if (value === null || value === undefined || value === "") return null
   const number = Number(value)
   return Number.isFinite(number) ? number : null
}

function positiveNumber(candidates, fallback) {
   for (const value of candidates) {
      const number = Number(value)
      if (Number.isFinite(number) && number >= 0) return number
   }
   return fallback
}

function fieldsForEntry(entry) {
   const def = BEHAVIOR_CATALOG.find((behavior) => behavior.type === entry?.type)
   return def?.fields ?? []
}

function firstFieldOfType(entry, type) {
   return fieldsForEntry(entry).find((field) => field.type === type) ?? null
}

function firstEditableField(entry) {
   return fieldsForEntry(entry).find(isSimpleEditableField) ?? null
}

function firstNumericField(entry) {
   return fieldsForEntry(entry).find(isNumericField) ?? null
}

function firstIwrField(entry) {
   return fieldsForEntry(entry).find(isIwrField) ?? null
}

function firstGenericTagField(entry) {
   return fieldsForEntry(entry).find(isGenericTagField) ?? null
}

function isNumericField(field) {
   return Boolean(
      field?.key &&
         (field.type === "number" || field.type === "range"),
   )
}

function isSimpleEditableField(field) {
   if (["rollOptions", "rollOptionsExclude"].includes(field?.key)) return false
   return Boolean(
      field?.key &&
         [
            "text",
            "textarea",
            "uuidInput",
            "filePicker",
            "expressionWithSuggestions",
            "select",
            "boolean",
            "number",
            "range",
            "color",
         ].includes(field.type),
   )
}

function isIwrField(field) {
   const key = String(field?.key ?? "").toLowerCase()
   return Boolean(
      field?.key &&
         (field.type === "irwTagList" ||
            key.includes("immunit") ||
            key.includes("resistance") ||
            key.includes("weakness")),
   )
}

function isGenericTagField(field) {
   if (!field?.key || field.type !== "tagPicker") return false
   if (["triggers", "target"].includes(field.key)) return false
   return !isIwrField(field)
}

function firstTagActionValue(entry, field, type) {
   if (!field?.key) return ""
   if (type === "removeTagValue") {
      const current = Array.isArray(entry?.system?.[field.key]) ? entry.system[field.key] : []
      return String(current[0] ?? "")
   }
   const options = resolveFieldOptions(field)
   return String(options[0]?.value ?? "")
}

function firstExtraRollOptionValue(entry, fieldKey, type) {
   const values = splitValues(entry?.system?.[fieldKey]?.value ?? entry?.system?.[fieldKey])
   return type === "removeExtraRollOption" ? values[0] ?? "" : ""
}

function firstIwrActionDefaults(entry, actionType) {
   const fields = fieldsForEntry(entry).filter(isIwrField)
   const preferExisting = actionType !== "addIWR"
   for (const field of fields) {
      const values = iwrValuesForField(entry, field.key)
      if (preferExisting && values.length) {
         return { fieldKey: field.key, damageType: values[0] }
      }
   }
   const field = fields[0]
   return {
      fieldKey: field?.key ?? "resistances",
      damageType: preferExisting
         ? iwrValuesForField(entry, field?.key)[0] ?? ""
         : "fire",
   }
}

function iwrValuesForField(entry, fieldKey) {
   if (!fieldKey) return []
   const value = entry?.system?.[fieldKey]
   if (Array.isArray(value)) {
      return value
         .map((row) => String(typeof row === "string" ? row : row?.type ?? "").trim())
         .filter(Boolean)
   }
   return []
}

function resolveFieldOptions(field) {
   const options = typeof field?.options === "function" ? field.options() : field?.options
   return Array.isArray(options) ? options : []
}

function applyHeightenAction(automation, entry, action, applications) {
   if (!action?.type) return
   if (action.type === "setExpiration") {
      applyExpirationHeightening(automation, action)
      return
   }
   if (DAMAGE_ACTIONS.has(action.type)) {
      applyDamageHeightening(entry, action, applications)
      return
   }
   if (SAVING_THROW_ACTIONS.has(action.type)) {
      applySavingThrowHeightening(entry, action, applications)
      return
   }
   if (FIELD_ACTIONS.has(action.type)) {
      applyFieldHeightening(entry, action, applications)
      return
   }
   if (CHOICE_ACTIONS.has(action.type)) {
      applyChoiceHeightening(entry, action)
      return
   }
   if (CONSEQUENCE_ACTIONS.has(action.type)) {
      applyConsequenceHeightening(entry, action)
      return
   }
   if (IWR_ACTIONS.has(action.type)) {
      applyIwrHeightening(entry, action, applications)
      return
   }
   if (LIST_ACTIONS.has(action.type)) {
      applyListHeightening(entry, action, applications)
      return
   }
   if (SHAPE_ACTIONS.has(action.type)) {
      applyShapeHeightening(automation, action, applications)
   }
}

function applySavingThrowHeightening(entry, action, applications = 1) {
   if (entry?.type !== "savingThrow") return
   entry.system ??= {}
   if (action.type === "setSavingThrow") {
      if (["fortitude", "reflex", "will"].includes(action.save)) {
         entry.system.save = action.save
      }
      entry.system.dc = String(action.dc ?? entry.system.dc ?? "15")
      return
   }
   if (action.type === "setBasicDamage") {
      entry.system.basicSave = true
      entry.system.basicDamages = normalizeDamageRowsForAction(action.damages)
      return
   }
   if (action.type === "increaseBasicDamage") {
      const amount = Math.max(0, Number(action.amount) || 0) * applications
      if (amount <= 0) return
      const rows = normalizeDamageRowsForAction(entry.system.basicDamages)
      entry.system.basicDamages = rows.map((row) => ({
         ...row,
         diceCount: Math.max(0, Number(row.diceCount ?? 0) + amount),
      }))
      entry.system.basicSave = entry.system.basicDamages.length > 0
   }
}

function applyDamageHeightening(entry, action, applications) {
   const key = action.fieldKey || firstFieldOfType(entry, "damageList")?.key
   if (!key) return
   const rows = Array.isArray(entry.system?.[key]) ? entry.system[key] : []
   if (action.type === "addDamage") {
      const addition = foundry.utils.deepClone(action.damage ?? {})
      const addedDice = Math.max(0, Number(addition.diceCount) || 0) * applications
      if (addedDice <= 0) return
      addition.diceCount = addedDice
      const next = rows.map((row) => ({ ...row }))
      const existing = next.find((row) => damageRowsStack(row, addition))
      if (existing) {
         existing.diceCount =
            Math.max(0, Number(existing.diceCount) || 0) + addedDice
      } else {
         next.push(addition)
      }
      entry.system[key] = next
      return
   }
   if (action.type === "setDamageType") {
      const index = Math.max(0, Number(action.damageIndex) || 0)
      entry.system[key] = rows.map((row, rowIndex) =>
         rowIndex === index
            ? { ...row, damageType: String(action.damageType || row.damageType || "fire") }
            : row,
      )
      return
   }
   const sign = action.type === "decreaseDamage" ? -1 : 1
   const amount = Math.max(0, Number(action.amount) || 0) * applications * sign
   entry.system[key] = rows.map((row) => ({
      ...row,
      diceCount: Math.max(0, Number(row?.diceCount ?? 0) + amount),
   }))
}

function applyFieldHeightening(entry, action, applications = 1) {
   if (action.type === "setMovementCost") {
      applyMovementCostHeightening(entry, action)
      return
   }
   if (["increaseHealing", "decreaseHealing", "setHealingType"].includes(action.type)) {
      applyHealingHeightening(entry, action, applications)
      return
   }
   if (["addRestriction", "removeRestriction"].includes(action.type)) {
      applyRestrictionHeightening(entry, action)
      return
   }
   const field = fieldsForEntry(entry).find((candidate) => candidate.key === action.fieldKey)
   if (!field) return
   entry.system ??= {}
   if (action.type === "increaseField" || action.type === "decreaseField") {
      if (!isNumericField(field)) return
      const sign = action.type === "decreaseField" ? -1 : 1
      const amount = Math.max(0, Number(action.amount) || 0) * applications * sign
      const current = Number(entry.system[field.key] ?? field.default ?? 0) || 0
      entry.system[field.key] = clampFieldNumber(current + amount, field)
      return
   }
   if (action.type === "setDuration") {
      entry.system[field.key] = normalizeDurationAction(action.duration)
      return
   }
   if (action.type === "setCondition") {
      entry.system[field.key] = normalizeConditionAction(action.condition)
      return
   }
   if (action.type === "setDiceFormula") {
      entry.system[field.key] = normalizeDiceAction(action.dice)
      return
   }
   if (action.type === "setTile") {
      applyTileHeightening(entry, field, action)
      return
   }
   if (action.type === "setRuleElement") {
      applyRuleElementHeightening(entry, field, action)
      return
   }
   if (action.type === "addExtraRollOption" || action.type === "removeExtraRollOption") {
      applyExtraRollOptionHeightening(entry, field, action)
      return
   }
   if (action.type === "addTagValue" || action.type === "removeTagValue") {
      applyTagValueHeightening(entry, field, action)
      return
   }
   if (action.type === "setSound") {
      entry.system[field.key] = normalizeSoundAction(action.sound)
      return
   }
   if (action.type === "setLight") {
      entry.system[field.key] = normalizeLightAction(action.light)
      return
   }
   entry.system[field.key] = parseFieldActionValue(action.value, field)
}

function applyHealingHeightening(entry, action, applications = 1) {
   if (entry?.type !== "heal") return
   entry.system ??= {}
   if (action.type === "setHealingType") {
      entry.system.healingType = ["untyped", "vitality", "void"].includes(action.value)
         ? action.value
         : "untyped"
      return
   }
   const sign = action.type === "decreaseHealing" ? -1 : 1
   const amount = Math.max(0, Number(action.amount) || 0) * applications * sign
   const current = Number(entry.system.amount)
   if (Number.isFinite(current)) {
      entry.system.amount = String(Math.max(0, current + amount))
   } else if (amount !== 0) {
      const op = amount >= 0 ? "+" : "-"
      entry.system.amount = `(${entry.system.amount ?? "0"}) ${op} ${Math.abs(amount)}`
   }
}

function applyRestrictionHeightening(entry, action) {
   if (entry?.type !== "restrictActions") return
   entry.system ??= {}
   const key = action.fieldKey || "restrictions"
   const rows = Array.isArray(entry.system[key])
      ? entry.system[key].map(normalizeRestrictionAction)
      : []
   if (action.type === "addRestriction") {
      rows.push(normalizeRestrictionAction(action.restriction))
   } else {
      const index = Math.max(0, Number(action.restrictionIndex) || 0)
      if (index < rows.length) rows.splice(index, 1)
   }
   entry.system[key] = rows
}

function applyMovementCostHeightening(entry, action) {
   if (entry?.type !== "modifyMovementCost") return
   entry.system ??= {}
   const preset = ["difficult", "greaterDifficult", "custom"].includes(action.preset)
      ? action.preset
      : "difficult"
   entry.system.preset = preset
   if (preset === "custom") {
      entry.system.customCost = Math.max(1, Number(action.customCost) || 2)
   }
}

function normalizeDurationAction(duration) {
   const value = duration && typeof duration === "object" ? duration : {}
   return {
      enabled: true,
      amount: Math.max(1, Number(value.amount) || 1),
      unit: ["rounds", "minutes", "hours", "days"].includes(value.unit)
         ? value.unit
         : "rounds",
   }
}

function normalizeConditionAction(condition) {
   const value = condition && typeof condition === "object" ? condition : {}
   return {
      slug: String(value.slug ?? "frightened"),
      value: Math.max(1, Number(value.value) || 1),
   }
}

function normalizeRestrictionAction(restriction) {
   const value = restriction && typeof restriction === "object" ? restriction : {}
   const kind = ["spell", "strike", "move", "skill", "item", "ability"].includes(value.kind)
      ? value.kind
      : "spell"
   const skill = [
      "acrobatics",
      "arcana",
      "athletics",
      "crafting",
      "deception",
      "diplomacy",
      "intimidation",
      "medicine",
      "nature",
      "occultism",
      "performance",
      "religion",
      "society",
      "stealth",
      "survival",
      "thievery",
      "perception",
      "lore",
   ].includes(value.skill)
      ? value.skill
      : "athletics"
   return {
      kind,
      slug: String(value.slug ?? ""),
      rollOptions: String(value.rollOptions ?? ""),
      skill,
      lore: String(value.lore ?? ""),
   }
}

function normalizeDiceAction(dice) {
   const value = dice && typeof dice === "object" ? dice : {}
   return {
      diceCount: Math.max(1, Number(value.diceCount) || 1),
      dieSize: Math.max(2, Number(value.dieSize) || 20),
   }
}

function normalizeSoundAction(sound) {
   const value = sound && typeof sound === "object" ? sound : {}
   return {
      ...foundry.utils.deepClone(value),
      path: String(value.path ?? ""),
      volume: Math.min(1, Math.max(0, Number(value.volume ?? 0.5) || 0)),
   }
}

function normalizeLightAction(light) {
   const value = light && typeof light === "object" ? light : {}
   return {
      ...foundry.utils.deepClone(value),
      config: {
         ...(value.config && typeof value.config === "object"
            ? foundry.utils.deepClone(value.config)
            : {}),
         dim: Math.max(0, Number(value.config?.dim ?? value.dim) || 0),
         bright: Math.max(0, Number(value.config?.bright ?? value.bright) || 0),
         color: String(value.config?.color ?? value.color ?? "#ffffff"),
         alpha: Math.min(
            1,
            Math.max(0, Number(value.config?.alpha ?? value.alpha ?? 0.5) || 0),
         ),
      },
   }
}

function applyTileHeightening(entry, field, action) {
   if (field?.type !== "tileList") return
   const rows = normalizeTileAttachments(entry.system?.[field.key])
   const index = Math.max(0, Number(action.tileIndex) || 0)
   while (rows.length <= index) rows.push(defaultTileAttachment())
   rows[index] = normalizeTileAttachmentAction(action.tileAttachment)
   entry.system[field.key] = rows
}

function applyRuleElementHeightening(entry, field, action) {
   if (field?.type !== "ruleElementList") return
   const rows = Array.isArray(entry.system?.[field.key]) ? entry.system[field.key].slice() : []
   const index = Math.max(0, Number(action.ruleIndex) || 0)
   while (rows.length <= index) rows.push('{\n  "key": ""\n}')
   rows[index] =
      action.rule && typeof action.rule === "object"
         ? foundry.utils.deepClone(action.rule)
         : String(action.rule ?? '{\n  "key": ""\n}')
   entry.system[field.key] = rows
}

function applyExpirationHeightening(automation, action) {
   automation.expiration ??= { enabled: true, amount: 1, unit: "minutes" }
   const unit = ["rounds", "minutes", "hours", "days", "unlimited"].includes(
      action.unit,
   )
      ? action.unit
      : "minutes"
   automation.expiration.enabled = true
   automation.expiration.unit = unit
   automation.expiration.amount =
      unit === "unlimited" ? 0 : Math.max(0, Number(action.amount) || 0)
}

function applyTagValueHeightening(entry, field, action) {
   const value = String(action.value ?? "").trim()
   if (!value) return
   const current = Array.isArray(entry.system?.[field.key]) ? entry.system[field.key].slice() : []
   entry.system[field.key] =
      action.type === "removeTagValue"
         ? current.filter((entryValue) => String(entryValue) !== value)
         : uniqueValues([...current, value])
}

function applyExtraRollOptionHeightening(entry, field, action) {
   const value = String(action.value ?? "").trim()
   if (!value) return
   const currentConfig =
      entry.system?.[field.key] && typeof entry.system[field.key] === "object"
         ? { ...entry.system[field.key] }
         : { enabled: false, value: String(entry.system?.[field.key] ?? "") }
   const current = splitValues(currentConfig.value)
   const next =
      action.type === "removeExtraRollOption"
         ? current.filter((entryValue) => entryValue !== value)
         : uniqueValues([...current, value])
   entry.system[field.key] = {
      ...currentConfig,
      enabled: next.length > 0,
      value: next.join(", "),
   }
}

function clampFieldNumber(value, field) {
   let next = Number.isFinite(value) ? value : 0
   if (Number.isFinite(Number(field.min))) next = Math.max(Number(field.min), next)
   if (Number.isFinite(Number(field.max))) next = Math.min(Number(field.max), next)
   return next
}

function parseFieldActionValue(value, field) {
   const raw = String(value ?? "").trim()
   if (field.valueType === "number" || field.type === "number" || field.type === "range") {
      const number = Number(raw)
      return Number.isFinite(number) ? number : 0
   }
   if (field.type === "boolean") return ["true", "1", "yes", "on"].includes(raw.toLowerCase())
   if (["tagPicker", "irwTagList", "damageList", "tileList", "ruleElementList", "choiceList", "consequenceList", "saveConsequenceList", "restrictionList"].includes(field.type)) {
      try {
         return JSON.parse(raw)
      } catch (_e) {
         return field.default ?? []
      }
   }
   if (["duration", "conditionPicker", "soundEditor", "lightEditor"].includes(field.type)) {
      try {
         return JSON.parse(raw)
      } catch (_e) {
         return field.default ?? {}
      }
   }
   return raw
}

function damageRowsStack(a, b) {
   return (
      String(a?.dieSize ?? "") === String(b?.dieSize ?? "") &&
      String(a?.damageType ?? "") === String(b?.damageType ?? "") &&
      String(a?.category ?? "normal") === String(b?.category ?? "normal") &&
      String(a?.extraRollOptions ?? "").trim() ===
         String(b?.extraRollOptions ?? "").trim()
   )
}

function applyListHeightening(entry, action, applications) {
   const map = {
      addTrigger: "triggers",
      removeTrigger: "triggers",
      addTarget: "target",
      removeTarget: "target",
      addRollOption: "rollOptions",
      removeRollOption: "rollOptions",
      addRollOptionExclude: "rollOptionsExclude",
      removeRollOptionExclude: "rollOptionsExclude",
      addIgnoredBy: "ignoredBy",
      removeIgnoredBy: "ignoredBy",
   }
   const key = map[action.type]
   if (!key) return
   const remove = action.type.startsWith("remove")
   const values = splitValues(action.value)
   if (!values.length) return
   if (key === "rollOptions" || key === "rollOptionsExclude") {
      const current = splitValues(entry.system?.[key])
      entry.system[key] = (remove
         ? current.filter((value) => !values.includes(value))
         : uniqueValues([...current, ...values])
      ).join(", ")
      return
   }
   const current = Array.isArray(entry.system?.[key]) ? entry.system[key].slice() : []
   if (!remove && key === "target" && values.some((value) => value !== "all")) {
      entry.system[key] = uniqueValues([
         ...current.filter((value) => String(value) !== "all"),
         ...values,
      ])
      return
   }
   entry.system[key] = remove
      ? current.filter((value) => !values.includes(String(value)))
      : uniqueValues([...current, ...values])
}

function applyChoiceHeightening(entry, action) {
   const field = fieldsForEntry(entry).find((candidate) => candidate.key === action.fieldKey)
   if (field?.type !== "choiceList") return
   entry.system ??= {}
   const rows = Array.isArray(entry.system[field.key]) ? entry.system[field.key].slice() : []
   if (action.type === "addChoice") {
      rows.push(normalizeChoiceAction(action.choice))
   } else {
      const index = Math.max(0, Number(action.choiceIndex) || 0)
      if (index < rows.length) rows.splice(index, 1)
   }
   entry.system[field.key] = rows
}

function applyConsequenceHeightening(entry, action) {
   const field = fieldsForEntry(entry).find((candidate) => candidate.key === action.fieldKey)
   if (!isConsequenceField(field)) return
   entry.system ??= {}
   const rows = Array.isArray(entry.system[field.key]) ? entry.system[field.key].slice() : []
   const normalized = normalizeConsequenceAction(action.consequence, field)
   if (action.type === "addConsequence") {
      rows.push(normalized)
   } else if (action.type === "removeConsequence") {
      const index = Math.max(0, Number(action.consequenceIndex) || 0)
      if (index < rows.length) rows.splice(index, 1)
   } else if (action.type === "modifyConsequence") {
      const index = Math.max(0, Number(action.consequenceIndex) || 0)
      if (index < rows.length) rows[index] = normalized
   }
   entry.system[field.key] = rows
}

function applyIwrHeightening(entry, action, applications) {
   const field = fieldsForEntry(entry).find((candidate) => candidate.key === action.fieldKey)
   const key = field?.key ?? "resistances"
   const damageType = String(action.damageType ?? action.value ?? "").trim()
   if (!damageType) return
   entry.system ??= {}
   if (isImmunityField(field, key)) {
      const current = Array.isArray(entry.system[key]) ? entry.system[key] : []
      if (action.type === "addIWR") {
         entry.system[key] = uniqueValues([...current, damageType])
      } else if (action.type === "removeIWR") {
         entry.system[key] = current.filter((value) => String(value) !== damageType)
      }
      return
   }

   const current = Array.isArray(entry.system[key])
      ? entry.system[key].map((row) => ({ ...row }))
      : []
   const index = current.findIndex((row) => String(row?.type ?? "") === damageType)
   const amount = Math.max(0, Number(action.amount) || 0) * applications
   if (action.type === "addIWR") {
      const value = Math.max(1, amount || 5)
      if (index >= 0) current[index].value = Math.max(1, Number(current[index].value) || 0) + value
      else current.push({ type: damageType, value })
   } else if (action.type === "removeIWR") {
      if (index >= 0) current.splice(index, 1)
   } else if (index >= 0) {
      const sign = action.type === "decreaseIWR" ? -1 : 1
      current[index].value = Math.max(0, (Number(current[index].value) || 0) + amount * sign)
   }
   entry.system[key] = current
}

function isImmunityField(field, key) {
   return field?.type === "tagPicker" || String(key ?? "").toLowerCase().includes("immunit")
}

function applyShapeHeightening(automation, action, applications) {
   const shapeConfig = automation.templateShape ??= { shapes: [] }
   if (!Array.isArray(shapeConfig.shapes)) shapeConfig.shapes = []
   if (!shapeConfig.shapes.length) shapeConfig.shapes.push(defaultShapeVariant())
   if (action.type === "addTemplateShape") {
      for (let i = 0; i < applications; i++) {
         shapeConfig.shapes.push(normalizeShape(action.shape))
      }
      return
   }
   if (action.type === "setTemplateShape") {
      const index = Math.max(0, Number(action.shapeIndex) || 0)
      shapeConfig.shapes[index] = normalizeShape(action.shape)
      return
   }
   const sign = action.type === "decreaseTemplateSize" ? -1 : 1
   const amount = Math.max(0, Number(action.amount) || 0) * applications * sign
   shapeConfig.shapes = shapeConfig.shapes.map((shape) => ({
      ...shape,
      size: Math.max(1, Number(shape?.size ?? 1) + amount),
   }))
}

function normalizeShape(shape) {
   return {
      ...defaultShapeVariant(),
      ...(shape && typeof shape === "object" ? foundry.utils.deepClone(shape) : {}),
      id: shape?.id ? String(shape.id) : foundry.utils.randomID(),
      size: Math.max(1, Number(shape?.size ?? 15) || 15),
      width: Math.max(1, Number(shape?.width ?? 5) || 5),
      innerRadius: Math.max(1, Number(shape?.innerRadius ?? 5) || 5),
   }
}

function splitValues(value) {
   if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
   return String(value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
}

function uniqueValues(values) {
   return [...new Set(values.map((value) => String(value)).filter(Boolean))]
}

function firstConsequenceField(entry) {
   return fieldsForEntry(entry).find(isConsequenceField) ?? null
}

function isConsequenceField(field) {
   return field?.type === "consequenceList" || field?.type === "saveConsequenceList"
}

function defaultChoiceAction() {
   return {
      kind: "save",
      save: "reflex",
      skill: "athletics",
      lore: "",
      dc: "15",
   }
}

function defaultConsequenceForField(field) {
   if (field?.type === "saveConsequenceList") {
      return {
         outcome: "failure",
         type: "damage",
         damages: [defaultDamageAction()],
      }
   }
   return {
      min: 1,
      max: 1,
      type: "damage",
      damages: [defaultDamageAction()],
   }
}

function defaultDamageAction() {
   return {
      diceCount: 1,
      dieSize: "d6",
      damageType: "fire",
      category: "normal",
   }
}

function normalizeDamageRowsForAction(rows) {
   const source = Array.isArray(rows) && rows.length ? rows : [defaultDamageAction()]
   return source
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
         diceCount: Math.max(0, Number(row.diceCount) || 0),
         dieSize: String(row.dieSize ?? "d6"),
         damageType: String(row.damageType ?? "fire"),
         category: String(row.category ?? "normal"),
         extraRollOptions: String(row.extraRollOptions ?? ""),
      }))
}

function defaultTileAttachmentAction(entry = null, fieldKey = "tiles", index = 0) {
   const rows = normalizeTileAttachments(entry?.system?.[fieldKey])
   return normalizeTileAttachmentAction(rows[index] ?? defaultTileAttachment())
}

function normalizeTileAttachmentAction(value) {
   const [row] = normalizeTileAttachments([value])
   return row ?? defaultTileAttachment()
}

function firstRuleElementValue(entry, fieldKey, index) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   return rows[Math.max(0, Number(index) || 0)] ?? '{\n  "key": ""\n}'
}

function firstConsequenceValue(entry, fieldKey) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   return rows[0] ?? null
}

function normalizeChoiceAction(choice) {
   const value = choice && typeof choice === "object" ? choice : {}
   const kind = value.kind === "skill" ? "skill" : "save"
   return {
      kind,
      save: String(value.save ?? "reflex"),
      skill: String(value.skill ?? "athletics"),
      lore: String(value.lore ?? ""),
      dc: String(value.dc ?? "15"),
   }
}

function normalizeConsequenceAction(consequence, field) {
   const value =
      consequence && typeof consequence === "object"
         ? foundry.utils.deepClone(consequence)
         : defaultConsequenceForField(field)
   const saveField = field?.type === "saveConsequenceList"
   const type = String(value.type ?? "damage")
   const normalized = saveField
      ? {
           outcome: String(value.outcome ?? "failure"),
           type,
        }
      : {
           min: Math.max(0, Number(value.min) || 0),
           max: Math.max(0, Number(value.max) || 0),
           type,
        }
   if (type === "damage") {
      normalized.damages = Array.isArray(value.damages)
         ? value.damages.map((row) => foundry.utils.deepClone(row))
         : [defaultDamageAction()]
   }
   if (type === "heal") {
      normalized.amount = String(value.amount ?? "5")
      normalized.healingType = ["untyped", "vitality", "void"].includes(value.healingType)
         ? value.healingType
         : "untyped"
   }
   if (type === "move") {
      normalized.direction = value.direction === "toward" ? "toward" : "away"
      normalized.distance = Math.max(0, Number(value.distance) || 0)
   }
   if (["applyEffect", "removeEffect", "executeMacro"].includes(type)) {
      normalized.uuid = String(value.uuid ?? "")
   }
   if (["applyCondition", "removeCondition"].includes(type)) {
      normalized.condition = normalizeConditionAction(value.condition)
   }
   if (["applyEffect", "applyCondition", "applyRuleElement"].includes(type)) {
      normalized.duration = normalizeDurationAction(value.duration)
   }
   if (type === "applyRuleElement") {
      normalized.rules = Array.isArray(value.rules)
         ? value.rules.map((row) => foundry.utils.deepClone(row))
         : []
   }
   if (type === "sendChatMessage") {
      normalized.text = String(value.text ?? "")
      normalized.privateToGm = !!value.privateToGm
      normalized.blindToGm = !!value.blindToGm
   }
   if (type === "scrollingText") {
      normalized.text = String(value.text ?? "")
      normalized.color = String(value.color ?? "#ffffff")
      normalized.fontSize = Math.max(1, Number(value.fontSize) || 30)
   }
   if (type === "savingThrow") {
      normalized.save = String(value.save ?? "reflex")
      normalized.dc = String(value.dc ?? "15")
      normalized.consequences = Array.isArray(value.consequences)
         ? value.consequences.map((row) =>
              normalizeConsequenceAction(row, { type: "saveConsequenceList" }),
           )
         : []
   }
   if (type === "rollSkill") {
      normalized.skill = String(value.skill ?? "athletics")
      normalized.lore = String(value.lore ?? "")
      normalized.dc = String(value.dc ?? "15")
      normalized.consequences = Array.isArray(value.consequences)
         ? value.consequences.map((row) =>
              normalizeConsequenceAction(row, { type: "saveConsequenceList" }),
           )
         : []
   }
   return normalized
}
