import { TARGET_OPTIONS, TRIGGER_OPTIONS } from "./constants.mjs"

export function rollOptionFilterFields() {
   return [
      {
         key: "rollOptions",
         type: "text",
         label: "PF2EATW.Field.RollOptions",
         hint: "PF2EATW.Field.RollOptionsHint",
         placeholder: "PF2EATW.Field.RollOptionsPlaceholder",
         default: "",
      },
      {
         key: "rollOptionsExclude",
         type: "text",
         label: "PF2EATW.Field.RollOptionsExclude",
         hint: "PF2EATW.Field.RollOptionsExcludeHint",
         placeholder: "PF2EATW.Field.RollOptionsExcludePlaceholder",
         default: "",
      },
   ]
}

export function actorExclusionFields() {
   return [
      ...rollOptionFilterFields(),
      {
         key: "ignoredBy",
         type: "uuidList",
         label: "PF2EATW.Field.IgnoredBy",
         hint: "PF2EATW.Field.IgnoredByHint",
         default: [""],
      },
   ]
}

export function triggerTargetFields(
   defaultTriggers = ["tokenEnter"],
   triggerOptions = TRIGGER_OPTIONS,
) {
   return [
      {
         key: "triggers",
         type: "tagPicker",
         label: "PF2EATW.Field.Triggers",
         addPrompt: "PF2EATW.Field.AddTrigger",
         options: triggerOptions,
         default: defaultTriggers,
         emptyFallback: defaultTriggers,
         tooltip: "PF2EATW.Tooltip.TriggersDefault",
      },
      {
         key: "target",
         type: "tagPicker",
         label: "PF2EATW.Field.Target",
         addPrompt: "PF2EATW.Field.AddTarget",
         hint: "PF2EATW.Field.TargetHint",
         options: TARGET_OPTIONS,
         default: ["all"],
         emptyFallback: ["all"],
         tooltip: "PF2EATW.Tooltip.TargetDefault",
      },
      ...actorExclusionFields(),
   ]
}
