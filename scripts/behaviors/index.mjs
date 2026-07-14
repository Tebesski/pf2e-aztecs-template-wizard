import {
   FLAG_SCOPE,
   MODULE_ID,
   getMovementActionOptions,
   BEHAVIOR_CATALOG,
} from "../data.mjs"
import {
   WIZARD_META_KEYS,
   deriveEvents,
   extractMeta,
   parseRollOptions,
   parseUuidList,
   wrapActorFilterSource,
} from "./behavior-meta.mjs"
import {
   parentGroupScriptSource,
   effectLifecycleGroupScriptSource,
} from "./script-sources/lifecycle.mjs"
import {
   dealDamageScriptSource,
   displayScrollingTextScriptSource,
   executeMacroScriptSource,
   healScriptSource,
   moveTargetsScriptSource,
   restrictActionsScriptSource,
   sendChatMessageScriptSource,
   addIRWScriptSource,
} from "./script-sources/actions.mjs"
import {
   rollDiceScriptSource,
   savingThrowScriptSource,
   rollSkillScriptSource,
   choiceSetScriptSource,
} from "./script-sources/rolls.mjs"

export function normalizeBehaviorType(type) {
   const cfg = globalThis.CONFIG?.RegionBehavior?.dataModels
   if (!cfg) return type
   if (type in cfg) return type
   for (const prefix of ["pf2e.", "core."]) {
      const k = `${prefix}${type}`
      if (k in cfg) return k
   }
   const found = Object.keys(cfg).find(
      (k) => k === type || k.endsWith(`.${type}`),
   )
   return found ?? type
}

const toNumber = (v, fallback) => {
   const n = Number(v)
   return Number.isFinite(n) ? n : fallback
}

const EVENT_AWARE_TYPES = new Set(["executeScript", "executeMacro"])

const GRANT_TYPES = new Set([
   "applyActiveEffect",
   "addCondition",
   "applyRuleElement",
])
const REMOVAL_TYPES = new Set(["removeEffect", "removeCondition"])
const EFFECT_LIFECYCLE_TYPES = new Set([...GRANT_TYPES, ...REMOVAL_TYPES])
const LIFECYCLE_TRIGGER_KEYS = new Set(["whileAdjacent", "whileWithin"])
const RESTRICT_LIFECYCLE_TRIGGER_KEYS = new Set(["whileAdjacent", "whileWithin"])

function normalizeRestrictRuntimeTriggers(entry) {
   if (entry?.type !== "restrictActions") return
   if (!entry.system || typeof entry.system !== "object") entry.system = {}
   if (entry.system.duration?.enabled) return
   const triggers = Array.isArray(entry.system.triggers)
      ? entry.system.triggers
      : []
   const valid = triggers.filter((trigger) =>
      RESTRICT_LIFECYCLE_TRIGGER_KEYS.has(trigger),
   )
   entry.system.triggers = valid.length ? valid : ["whileWithin"]
}

function normalizeCondition(c) {
   if (typeof c === "string") return { slug: c, value: 1 }
   if (c && typeof c === "object") {
      return { slug: c.slug ?? "", value: Number(c.value) || 1 }
   }
   return { slug: "", value: 1 }
}

const BUILDERS = {
   adjustDarknessLevel(s) {
      return {
         mode: toNumber(s.mode, 0),
         modifier: toNumber(s.modifier, 0.5),
      }
   },

   modifyMovementCost(s) {
      let cost
      switch (s.preset) {
         case "greaterDifficult":
            cost = 3
            break
         case "custom":
            cost = toNumber(s.customCost, 2)
            break
         case "difficult":
         default:
            cost = 2
      }
      const checked = Array.isArray(s.actions) ? s.actions : []

      const actions =
         checked.length > 0
            ? checked
            : getMovementActionOptions().map((o) => o.value)
      if (actions.length === 0) return null
      const difficulties = {}
      for (const a of actions) difficulties[a] = cost
      return { difficulties }
   },

   defineSurface(s) {
      const env = Array.isArray(s.environment)
         ? s.environment.filter(Boolean)
         : []
      return { environment: env, mode: toNumber(s.mode, 0) }
   },

   environmentFeature(s) {
      return { difficultTerrain: s.difficultTerrain ?? "difficult" }
   },

   displayScrollingText(s) {
      if (!s.text) return null
      return {
         __overrideType: "executeScript",
         source: displayScrollingTextScriptSource({
            text: s.text,
            color: s.color || "#ffffff",
            fontSize: toNumber(s.fontSize, 28),
         }),
      }
   },

   executeScript(s) {
      return { source: s.source || "" }
   },

   executeMacro(s) {
      if (!s.uuid) return null
      return {
         __overrideType: "executeScript",
         source: executeMacroScriptSource({ uuid: s.uuid }),
      }
   },

   dealDamage(s, automation, item, fullEntry) {
      const damages = Array.isArray(s.damages) ? s.damages : []
      if (damages.length === 0) return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      return {
         __overrideType: "executeScript",
         source: dealDamageScriptSource({
            damages,
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Region Damage",
         }),
      }
   },

   heal(s, automation, item, fullEntry) {
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      return {
         __overrideType: "executeScript",
         source: healScriptSource({
            amount: s.amount ?? "5",
            healingType: s.healingType ?? "untyped",
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Region Healing",
         }),
      }
   },

   moveTargets(s, automation, item, fullEntry) {
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      return {
         __overrideType: "executeScript",
         source: moveTargetsScriptSource({
            direction: s.direction === "toward" ? "toward" : "away",
            distance: Math.max(0, Number(s.distance) || 0),
            target,
            sourceItemUuid: item?.uuid ?? null,
         }),
      }
   },

   restrictActions(s, automation, item, fullEntry) {
      const restrictions = Array.isArray(s.restrictions) ? s.restrictions : []
      if (!restrictions.length) return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      const triggers = Array.isArray(fullSystem.triggers)
         ? fullSystem.triggers.slice()
         : []
      const lifecycle = hasLifecycleTrigger(triggers) && !s.duration?.enabled
      return {
         __overrideType: "executeScript",
         source: restrictActionsScriptSource({
            restrictions,
            duration: s.duration ?? { enabled: false, amount: 1, unit: "rounds" },
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Restriction",
            triggerGroupKey: lifecycle ? triggerGroupKey(triggers) : "",
            lifecycle,
         }),
      }
   },

   rollDice(s, automation, item, fullEntry) {
      const dice = s.dice ?? {}
      const diceCount = Math.max(1, Number(dice.diceCount) || 1)
      const dieSize = Math.max(2, Number(dice.dieSize) || 20)
      const consequences = Array.isArray(s.consequences) ? s.consequences : []
      if (consequences.length === 0) return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      return {
         __overrideType: "executeScript",
         source: rollDiceScriptSource({
            diceCount,
            dieSize,
            consequences,
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Region Roll",
         }),
      }
   },

   savingThrow(s, automation, item, fullEntry) {
      const consequences = Array.isArray(s.consequences) ? s.consequences : []
      const basicSave = !!s.basicSave
      const basicDamages = Array.isArray(s.basicDamages) ? s.basicDamages : []

      if (consequences.length === 0 && !(basicSave && basicDamages.length > 0))
         return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]

      const ero =
         s.extraRollOptions && typeof s.extraRollOptions === "object"
            ? s.extraRollOptions
            : null
      const extraRollOptionsTags =
         ero && (ero.enabled || String(ero.value ?? "").trim())
            ? String(ero.value ?? "")
                 .split(",")
                 .map((x) => x.trim())
                 .filter(Boolean)
            : []
      return {
         __overrideType: "executeScript",
         source: savingThrowScriptSource({
            save: s.save || "reflex",

            dc:
               typeof s.dc === "string" || typeof s.dc === "number" ? s.dc : 15,
            basicSave,
            basicDamages,
            extraRollOptions: extraRollOptionsTags,
            consequences,
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Region Save",
         }),
      }
   },

   rollSkill(s, automation, item, fullEntry) {
      const consequences = Array.isArray(s.consequences) ? s.consequences : []
      if (consequences.length === 0) return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      const ero =
         s.extraRollOptions && typeof s.extraRollOptions === "object"
            ? s.extraRollOptions
            : null
      const extraRollOptionsTags =
         ero && (ero.enabled || String(ero.value ?? "").trim())
            ? String(ero.value ?? "")
                 .split(",")
                 .map((x) => x.trim())
                 .filter(Boolean)
            : []
      return {
         __overrideType: "executeScript",
         source: rollSkillScriptSource({
            skill: s.skill || "athletics",
            lore: String(s.lore ?? "").trim(),
            dc:
               typeof s.dc === "string" || typeof s.dc === "number" ? s.dc : 15,
            extraRollOptions: extraRollOptionsTags,
            consequences,
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Region Skill",
         }),
      }
   },

   choiceSet(s, automation, item, fullEntry) {
      const choices = Array.isArray(s.choices) ? s.choices : []
      if (choices.length === 0) return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      return {
         __overrideType: "executeScript",
         source: choiceSetScriptSource({
            choices,
            consequences: Array.isArray(s.consequences) ? s.consequences : [],
            target,
            sourceItemUuid: item?.uuid ?? null,
            flavor: automation?.label?.trim() || item?.name || "Choice",
         }),
      }
   },

   sendChatMessage(s, automation, item, fullEntry) {
      const text = String(s.text ?? "").trim()
      if (!text) return null
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      let rollMode = "publicroll"
      if (s.blindToGm) rollMode = "blindroll"
      else if (s.privateToGm) rollMode = "gmroll"
      return {
         __overrideType: "executeScript",
         source: sendChatMessageScriptSource({
            text,
            target,
            rollMode,
            sourceItemUuid: item?.uuid ?? null,
         }),
      }
   },

   addIRW(s, automation, item, fullEntry) {
      const immunities = Array.isArray(s.immunities) ? s.immunities : []
      const resistances = Array.isArray(s.resistances) ? s.resistances : []
      const weaknesses = Array.isArray(s.weaknesses) ? s.weaknesses : []

      if (
         immunities.length === 0 &&
         resistances.length === 0 &&
         weaknesses.length === 0
      ) {
         return null
      }
      const fullSystem = fullEntry?.system ?? {}
      const target =
         Array.isArray(fullSystem.target) && fullSystem.target.length
            ? fullSystem.target.slice()
            : ["all"]
      return {
         __overrideType: "executeScript",
         source: addIRWScriptSource({
            immunities,
            resistances,
            weaknesses,
            target,
            sourceItemUuid: item?.uuid ?? null,
            label: automation?.label?.trim() || item?.name || "Region Effect",
         }),
      }
   },
}

function buildSingleBehaviorData(entry, automation, item) {
   if (!entry?.enabled) return null
   normalizeRestrictRuntimeTriggers(entry)
   const builder = BUILDERS[entry.type]
   if (!builder) {
      undefined
      return null
   }
   const cleanSystem = {}
   for (const [k, v] of Object.entries(entry.system ?? {})) {
      if (!WIZARD_META_KEYS.has(k)) cleanSystem[k] = v
   }
   let system = builder(cleanSystem, automation, item, entry)
   if (system === null) return null

   let effectiveType = entry.type
   if (system.__overrideType) {
      effectiveType = system.__overrideType
      delete system.__overrideType
   }

   if (effectiveType === "executeScript" && typeof system.source === "string") {
      system.source = wrapActorFilterSource(system.source, entry, item)
   }

   if (EVENT_AWARE_TYPES.has(effectiveType)) {

      const catalogDef = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
      const fallback =
         entry.events && entry.events.length
            ? entry.events
            : (catalogDef?.events ?? [])
      system.events = hasLifecycleTrigger(entry.system?.triggers)
         ? lifecycleEvents(entry.system.triggers)
         : deriveEvents(entry.system?.triggers, fallback)
   }
   const meta = extractMeta(entry)
   if (hasLifecycleTrigger(entry.system?.triggers)) {
      meta.triggerGroupKey = triggerGroupKey(entry.system.triggers)
   }

   return {
      type: normalizeBehaviorType(effectiveType),
      system,
      flags: {
         [FLAG_SCOPE]: {
            managed: true,
            automationId: automation.id ?? null,
            itemUuid: item?.uuid ?? null,
            behaviorType: entry.type,
            ...meta,
         },
      },
   }
}

function extractGrantSpec(entry) {
   const s = entry.system ?? {}
   const target =
      Array.isArray(s.target) && s.target.length ? s.target.slice() : ["all"]
   const includePlacer = s.includePlacer !== false
   const rollOptions = parseRollOptions(s.rollOptions)
   const rollOptionsExclude = parseRollOptions(s.rollOptionsExclude)
   const ignoredBy = parseUuidList(s.ignoredBy)

   const duration = normalizeDurationConfig(s.duration)
   if (entry.type === "applyActiveEffect") {
      if (!s.uuid) return null
      return {
         kind: "uuid",
         uuid: String(s.uuid),
         target,
         includePlacer,
         rollOptions,
         rollOptionsExclude,
         ignoredBy,
         duration,
      }
   }
   if (entry.type === "addCondition") {
      const c = normalizeCondition(s.condition)
      if (!c.slug) return null
      return {
         kind: "condition",
         conditionSlug: c.slug,
         conditionValue: c.value,
         target,
         includePlacer,
         rollOptions,
         rollOptionsExclude,
         ignoredBy,
         duration,
      }
   }
   if (entry.type === "applyRuleElement") {
      const rules = Array.isArray(s.rules)
         ? s.rules
              .map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
              .filter(Boolean)
         : []
      if (rules.length === 0) return null
      const parsed = []
      for (const raw of rules) {
         try {
            const obj = JSON.parse(raw)
            if (obj && typeof obj === "object") parsed.push(obj)
         } catch (e) {
            undefined
         }
      }
      if (parsed.length === 0) return null
      const label =
         typeof s.label === "string" && s.label.trim()
            ? s.label.trim()
            : "Rule Element"
      return {
         kind: "rules",
         rules: parsed,
         target,
         includePlacer,
         rollOptions,
         rollOptionsExclude,
         ignoredBy,
         duration,
         label,
      }
   }
   return null
}

function extractEffectLifecycleSpec(entry) {
   const grant = extractGrantSpec(entry)
   if (grant) return { ...grant, action: "apply" }
   const s = entry.system ?? {}
   const target =
      Array.isArray(s.target) && s.target.length ? s.target.slice() : ["all"]
   const includePlacer = s.includePlacer !== false
   const rollOptions = parseRollOptions(s.rollOptions)
   const rollOptionsExclude = parseRollOptions(s.rollOptionsExclude)
   const ignoredBy = parseUuidList(s.ignoredBy)
   if (entry.type === "removeEffect") {
      if (!s.uuid) return null
      return {
         action: "remove",
         kind: "uuid",
         uuid: String(s.uuid),
         target,
         includePlacer,
         rollOptions,
         rollOptionsExclude,
         ignoredBy,
      }
   }
   if (entry.type === "removeCondition") {
      const c = normalizeCondition(s.condition)
      if (!c.slug) return null
      return {
         action: "remove",
         kind: "condition",
         conditionSlug: c.slug,
         conditionValue: c.value,
         target,
         includePlacer,
         rollOptions,
         rollOptionsExclude,
         ignoredBy,
      }
   }
   return null
}

function normalizeDurationConfig(cfg) {
   if (!cfg || !cfg.enabled) {
      return {
         value: -1,
         unit: "unlimited",
         sustained: false,
         expiry: "turn-start",
      }
   }
   const amount = Math.max(1, Number(cfg.amount) || 1)
   const allowedUnits = new Set(["rounds", "minutes", "hours", "days"])
   const unit = allowedUnits.has(cfg.unit) ? cfg.unit : "rounds"
   return { value: amount, unit, sustained: false, expiry: "turn-start" }
}

function triggerGroupKey(triggers) {
   return (
      (Array.isArray(triggers) ? triggers : []).slice().sort().join("|") ||
      "default"
   )
}

function hasLifecycleTrigger(triggers) {
   return Array.isArray(triggers) && triggers.some((t) => LIFECYCLE_TRIGGER_KEYS.has(t))
}

function lifecycleEvents(triggers) {
   if (!Array.isArray(triggers)) return []
   const events = []
   if (triggers.includes("whileWithin") || triggers.includes("whileAdjacent")) {
      for (const e of deriveEvents(["tokenEnter", "tokenExit"], [])) {
         if (!events.includes(e)) events.push(e)
      }
   }
   return events
}

function buildGrantGroupBehavior(entries, automation, item) {
   const specs = entries.map(extractGrantSpec).filter(Boolean)
   if (specs.length === 0) return null

   const triggers = entries[0]?.system?.triggers ?? ["tokenEnter"]
   const events = deriveEvents(triggers, ["tokenEnter"])
   const groupKey = triggerGroupKey(triggers)

   const label = automation?.label?.trim() || item?.name || "Template"
   const baseName = `Effect: ${label}`

   return {
      type: normalizeBehaviorType("executeScript"),
      system: {
         source: parentGroupScriptSource({
            specs,
            parentBaseName: baseName,
            parentImg: item?.img || "icons/svg/aura.svg",
            sourceItemUuid: item?.uuid ?? null,
            triggerGroupKey: groupKey,
         }),
         events,
      },
      flags: {
         [FLAG_SCOPE]: {
            managed: true,
            automationId: automation.id ?? null,
            itemUuid: item?.uuid ?? null,
            behaviorType: "grantGroup",
            triggers: triggers.slice(),
            triggerGroupKey: groupKey,
            grantCount: specs.length,
         },
      },
   }
}

function buildEffectLifecycleGroupBehavior(entries, automation, item, { lifecycle = false } = {}) {
   const specs = entries.map(extractEffectLifecycleSpec).filter(Boolean)
   if (specs.length === 0) return null

   const triggers = entries[0]?.system?.triggers ?? ["tokenEnter"]
   const events = lifecycle
      ? lifecycleEvents(triggers)
      : deriveEvents(triggers, ["tokenEnter"])
   const groupKey = triggerGroupKey(triggers)

   const label = automation?.label?.trim() || item?.name || "Template"
   const baseName = `Effect: ${label}`

   return {
      type: normalizeBehaviorType("executeScript"),
      system: {
         source: effectLifecycleGroupScriptSource({
            specs,
            parentBaseName: baseName,
            parentImg: item?.img || "icons/svg/aura.svg",
            sourceItemUuid: item?.uuid ?? null,
            triggerGroupKey: groupKey,
            triggers,
            lifecycle,
         }),
         events,
      },
      flags: {
         [FLAG_SCOPE]: {
            managed: true,
            automationId: automation.id ?? null,
            itemUuid: item?.uuid ?? null,
            behaviorType: lifecycle ? "effectLifecycleGroup" : "removalGroup",
            triggers: triggers.slice(),
            triggerGroupKey: groupKey,
            effectLifecycle: lifecycle,
            grantCount: specs.length,
         },
      },
   }
}

export function buildBehaviorDataList(entries, automation, item) {
   const result = []
   const grantGroups = new Map()
   const lifecycleGroups = new Map()
   const removalGroups = new Map()

   for (const entry of entries ?? []) {
      if (!entry?.enabled) continue

      if (
         entry.type === "attachTile" ||
         entry.type === "attachSound" ||
         entry.type === "attachLight" ||
         entry.type === "attachWalls" ||
         entry.type === "playSound"
      )
         continue

      if (EFFECT_LIFECYCLE_TYPES.has(entry.type) && hasLifecycleTrigger(entry.system?.triggers)) {
         const key = triggerGroupKey(entry.system?.triggers)
         if (!lifecycleGroups.has(key)) lifecycleGroups.set(key, [])
         lifecycleGroups.get(key).push(entry)
         continue
      }

      if (REMOVAL_TYPES.has(entry.type)) {
         const key = triggerGroupKey(entry.system?.triggers)
         if (!removalGroups.has(key)) removalGroups.set(key, [])
         removalGroups.get(key).push(entry)
         continue
      }

      if (GRANT_TYPES.has(entry.type)) {
         const key = triggerGroupKey(entry.system?.triggers)
         if (!grantGroups.has(key)) grantGroups.set(key, [])
         grantGroups.get(key).push(entry)
         continue
      }

      const data = buildSingleBehaviorData(entry, automation, item)
      if (data) result.push(data)
   }

   for (const groupEntries of grantGroups.values()) {
      const data = buildGrantGroupBehavior(groupEntries, automation, item)
      if (data) result.push(data)
   }

   for (const groupEntries of removalGroups.values()) {
      const data = buildEffectLifecycleGroupBehavior(groupEntries, automation, item, { lifecycle: false })
      if (data) result.push(data)
   }

   for (const groupEntries of lifecycleGroups.values()) {
      const data = buildEffectLifecycleGroupBehavior(groupEntries, automation, item, { lifecycle: true })
      if (data) result.push(data)
   }

   return result
}

export function buildBehaviorData(entry, automation, item) {
   if (EFFECT_LIFECYCLE_TYPES.has(entry?.type) && hasLifecycleTrigger(entry?.system?.triggers)) {
      return buildEffectLifecycleGroupBehavior([entry], automation, item, { lifecycle: true })
   }
   if (REMOVAL_TYPES.has(entry?.type)) {
      return buildEffectLifecycleGroupBehavior([entry], automation, item, { lifecycle: false })
   }
   if (GRANT_TYPES.has(entry?.type)) {
      return buildGrantGroupBehavior([entry], automation, item)
   }
   return buildSingleBehaviorData(entry, automation, item)
}
