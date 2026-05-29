import {
   FLAG_SCOPE,
   defaultAutomation,
   defaultAdvanced,
   shapeVariantsFromSpell,
   normalizeTileAttachments,
} from "../data.mjs"
export function readAutomation(item) {
   const raw = item.getFlag(FLAG_SCOPE, "automation")
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
      if (!entry || !entry.system) continue

      if (
         entry.system.extraRollOptions !== undefined &&
         typeof entry.system.extraRollOptions !== "object"
      ) {
         const enabled = !!entry.system.extraRollOptionsEnabled
         const value = String(entry.system.extraRollOptions ?? "")
         entry.system.extraRollOptions = { enabled, value }
      } else if (
         entry.system.extraRollOptions === undefined &&
         entry.system.extraRollOptionsEnabled !== undefined
      ) {
         entry.system.extraRollOptions = {
            enabled: !!entry.system.extraRollOptionsEnabled,
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

export async function saveAutomation(item, automation) {
   await item.update(
      { [`flags.${FLAG_SCOPE}.automation`]: automation },
      { render: false },
   )
}
