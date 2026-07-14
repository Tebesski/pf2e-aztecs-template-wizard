import {
   FLAG_SCOPE,
   BEHAVIOR_CATALOG,
   defaultAutomation,
   defaultAdvanced,
   defaultWallRestriction,
   shapeVariantsFromSpell,
   normalizeTileAttachments,
} from "../data.mjs"
import { normalizeHeightenRules } from "../heightening.mjs"
export function normalizeAutomation(raw, item = null) {
   if (!raw) {
      const fresh = defaultAutomation()
      fresh.templateShape = { shapes: shapeVariantsFromSpell(item) }
      return fresh
   }
   const merged = foundry.utils.mergeObject(defaultAutomation(), raw, {
      inplace: false,
      insertKeys: true,
      overwrite: true,
   })
   merged.behaviors = Array.isArray(raw.behaviors) ? raw.behaviors : []

   if (!raw.advanced) merged.advanced = defaultAdvanced()
   if (!merged.contiguous || typeof merged.contiguous !== "object") {
      merged.contiguous = { enabled: false, count: 2 }
   } else {
      merged.contiguous.enabled = !!merged.contiguous.enabled
      merged.contiguous.count = Math.max(
         1,
         Number(merged.contiguous.count) || 2,
      )
   }
   if (!merged.placementRange || typeof merged.placementRange !== "object") {
      merged.placementRange = { enabled: false, max: 0 }
   } else {
      merged.placementRange.enabled = !!merged.placementRange.enabled
      merged.placementRange.max = Math.max(
         0,
         Number(merged.placementRange.max) || 0,
      )
   }
   if (!merged.expiration || typeof merged.expiration !== "object") {
      merged.expiration = {
         enabled: true,
         amount: 1,
         unit: "minutes",
         currentTurnEnd: false,
         sustained: false,
         sustain: { amount: 1, unit: "minutes" },
      }
   }
   if (merged.expiration.unit === "unlimited") {
      merged.expiration.enabled = false
      merged.expiration.unit = "minutes"
      if (!Number.isFinite(Number(merged.expiration.amount))) {
         merged.expiration.amount = 1
      }
   }
   if (merged.expiration.unit === "seconds") {
      merged.expiration.amount = Math.max(
         1,
         Math.ceil((Number(merged.expiration.amount) || 1) / 6),
      )
      merged.expiration.unit = "rounds"
   }
   if (!EXPIRATION_UNIT_VALUES.has(merged.expiration.unit)) {
      merged.expiration.unit = "minutes"
   }
   merged.expiration.enabled = !!merged.expiration.enabled
   merged.expiration.amount = Math.max(
      1,
      Math.floor(Number(merged.expiration.amount) || 1),
   )
   merged.expiration.currentTurnEnd = !!merged.expiration.currentTurnEnd
   merged.expiration.sustained = !!merged.expiration.sustained
   merged.expiration.sustain = normalizeSustainLimit(merged.expiration.sustain)
   merged.expiration.heighten = normalizeHeightenRules(merged.expiration)

   merged.wallRestriction = normalizeWallRestriction(merged.wallRestriction)

   if (!raw.templateShape) {
      merged.templateShape = { shapes: shapeVariantsFromSpell(item) }
   } else if (!Array.isArray(raw.templateShape.shapes)) {
      if (raw.templateShape.type) {
         merged.templateShape = {
            shapes: [
               {
                  id: foundry.utils.randomID(),
                  type: raw.templateShape.type,
                  size: raw.templateShape.size ?? 15,
                  width: raw.templateShape.width ?? 5,
                  innerRadius: raw.templateShape.innerRadius ?? 5,
               },
            ],
         }
      } else {
         merged.templateShape = { shapes: shapeVariantsFromSpell(item) }
      }
   }

   for (const entry of merged.behaviors) {
      if (!entry) continue
      entry.tag = String(entry.tag ?? "")
      if (!entry.system) continue
      entry.heighten = normalizeHeightenRules(entry)
      const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
      const hasTargetField = def?.fields?.some((field) => field.key === "target")
      if (hasTargetField && entry.system.includePlacer === undefined) {
         entry.system.includePlacer = true
      }

      if (
         entry.system.extraRollOptions !== undefined &&
         typeof entry.system.extraRollOptions !== "object"
      ) {
         const value = String(entry.system.extraRollOptions ?? "")
         entry.system.extraRollOptions = { enabled: true, value }
      } else if (
         entry.system.extraRollOptions === undefined &&
         entry.system.extraRollOptionsEnabled !== undefined
      ) {
         entry.system.extraRollOptions = {
            enabled: true,
            value: "",
         }
      }
      if (entry.system.extraRollOptionsEnabled !== undefined) {
         delete entry.system.extraRollOptionsEnabled
      }

      if (entry.type === "attachTile") {
         const tiles = normalizeTileAttachments(entry.system)
         entry.system.tiles = tiles
         if (entry.system.tile !== undefined) delete entry.system.tile
         if (entry.system.tileShape !== undefined) delete entry.system.tileShape
      }

      const migrateConsList = (list) => {
         if (!Array.isArray(list)) return list
         return list.flatMap((c) => {
            if (!c || typeof c !== "object") return [c]
            if (c.type === "chatMessage")
               return [{ ...c, type: "sendChatMessage" }]
            if (c.type === "addIRW") {
               return [
                  {
                     type: "sendChatMessage",
                     text: `[migrated addIRW: ${c.irwType ?? ""} ${c.damageType ?? ""}${c.value ? " " + c.value : ""} — please reconfigure as a top-level Apply IRW behavior]`,
                  },
               ]
            }

            if (
               (c.type === "savingThrow" || c.type === "rollSkill") &&
               Array.isArray(c.consequences)
            ) {
               return [{ ...c, consequences: migrateConsList(c.consequences) }]
            }
            return [c]
         })
      }
      if (Array.isArray(entry.system.consequences)) {
         entry.system.consequences = migrateConsList(entry.system.consequences)
      }
   }

   if (merged.advanced) {
      let hl = merged.advanced.highlightMode
      if (typeof hl === "number") hl = ["shapes", "coverage"][hl] ?? "coverage"
      if (hl === "shape" || hl === "placeables") hl = "shapes"
      if (hl !== "shapes" && hl !== "coverage") hl = "coverage"
      merged.advanced.highlightMode = hl
   }

   return merged
}

const EXPIRATION_UNIT_VALUES = new Set(["rounds", "minutes", "hours", "days"])

function normalizeSustainLimit(raw) {
   const value = raw && typeof raw === "object" ? raw : {}
   let unit = String(value.unit ?? "minutes")
   let amount = Math.max(1, Math.floor(Number(value.amount) || 1))
   if (unit === "seconds") {
      amount = Math.max(1, Math.ceil(amount / 6))
      unit = "rounds"
   }
   if (!EXPIRATION_UNIT_VALUES.has(unit)) unit = "minutes"
   return { amount, unit }
}

function normalizeWallRestriction(raw) {
   const base = defaultWallRestriction()
   const value = raw && typeof raw === "object" ? raw : {}
   const type = ["darkness", "light", "move", "sight", "sound"].includes(
      value.type,
   )
      ? value.type
      : base.type
   return {
      enabled: !!value.enabled,
      type,
      priority: Math.max(0, Math.floor(Number(value.priority) || 0)),
   }
}

export function readAutomation(item) {
   return normalizeAutomation(item.getFlag(FLAG_SCOPE, "automation"), item)
}

export async function saveAutomation(item, automation) {
   const normalized = normalizeAutomation(automation, item)
   await item.update(
      { [`flags.${FLAG_SCOPE}.automation`]: normalized },
      { render: false },
   )
}
