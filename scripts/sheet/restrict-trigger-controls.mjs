const LIFECYCLE_RESTRICT_TRIGGERS = ["whileWithin", "whileAdjacent"]

export function restrictTriggerOptions(field, context = {}) {
   const options = Array.isArray(field?.options) ? field.options : []
   if (
      context.behaviorType !== "restrictActions" ||
      field?.key !== "triggers" ||
      context.system?.duration?.enabled
   ) {
      return options
   }
   return options.filter((option) =>
      LIFECYCLE_RESTRICT_TRIGGERS.includes(option.value),
   )
}

export function restrictShownTriggers(field, selected, context = {}) {
   if (
      context.behaviorType !== "restrictActions" ||
      field?.key !== "triggers"
   ) {
      return selected
   }
   const allowed = restrictTriggerOptions(field, context).map((option) => option.value)
   const valid = selected.filter((trigger) => allowed.includes(trigger))
   if (
      !context.system?.duration?.enabled &&
      !valid.length
   ) {
      return ["whileWithin"]
   }
   return valid
}

export function sanitizeRestrictTriggers(entry) {
   if (entry?.type !== "restrictActions") return false
   if (entry.system?.duration?.enabled) return false
   if (!entry.system || typeof entry.system !== "object") entry.system = {}
   const triggers = Array.isArray(entry.system.triggers)
      ? entry.system.triggers
      : []
   const valid = triggers.filter((trigger) =>
      LIFECYCLE_RESTRICT_TRIGGERS.includes(trigger),
   )
   const next = valid.length ? valid : ["whileWithin"]
   const changed =
      triggers.length !== next.length ||
      triggers.some((trigger, index) => trigger !== next[index])
   if (changed) entry.system.triggers = next
   return changed
}
