import { resolveTriggerToEvent } from "../data.mjs"

export const WIZARD_META_KEYS = new Set([
   "triggers",
   "target",
   "rollOptions",
   "rollOptionsExclude",
   "ignoredBy",
])

export function deriveEvents(triggers, fallback) {
   if (Array.isArray(triggers) && triggers.length > 0) {
      return triggers.map((t) => resolveTriggerToEvent(t)).filter(Boolean)
   }
   if (Array.isArray(fallback) && fallback.length > 0) {
      return fallback
         .map((e) => {
            if (typeof e !== "string") return null

            const resolved = resolveTriggerToEvent(e)
            return resolved ?? e
         })
         .filter(Boolean)
   }
   return []
}

export function parseRollOptions(value) {
   if (typeof value === "string") {
      return value
         .split(",")
         .map((t) => t.trim())
         .filter(Boolean)
   }
   if (Array.isArray(value)) {
      return value.filter((t) => typeof t === "string" && t.trim())
   }
   return []
}

export function extractMeta(entry) {
   const s = entry.system ?? {}
   const meta = {}
   if (Array.isArray(s.triggers)) meta.triggers = s.triggers.slice()
   if (Array.isArray(s.target)) meta.target = s.target.slice()
   const ro = parseRollOptions(s.rollOptions)
   if (ro.length) meta.rollOptions = ro
   const rox = parseRollOptions(s.rollOptionsExclude)
   if (rox.length) meta.rollOptionsExclude = rox
   if (Array.isArray(s.ignoredBy)) {
      meta.ignoredBy = s.ignoredBy.filter(
         (u) => typeof u === "string" && u.trim(),
      )
   }
   return meta
}

export function parseUuidList(value) {
   if (!Array.isArray(value)) return []
   return value.filter((u) => typeof u === "string" && u.trim())
}

export function actorFilterMeta(entry) {
   const s = entry?.system ?? {}
   return {
      rollOptions: parseRollOptions(s.rollOptions),
      rollOptionsExclude: parseRollOptions(s.rollOptionsExclude),
      ignoredBy: parseUuidList(s.ignoredBy),
   }
}

export function wrapActorFilterSource(source, entry) {
   const meta = actorFilterMeta(entry)
   if (
      meta.rollOptions.length === 0 &&
      meta.rollOptionsExclude.length === 0 &&
      meta.ignoredBy.length === 0
   )
      return source
   const have = JSON.stringify(meta.rollOptions)
   const not = JSON.stringify(meta.rollOptionsExclude)
   const ignoredBy = JSON.stringify(meta.ignoredBy)
   return `const __ATW_MUST_HAVE_ROLL_OPTIONS = ${have};
const __ATW_MUST_NOT_HAVE_ROLL_OPTIONS = ${not};
const __ATW_IGNORED_BY = ${ignoredBy};
const __atwFilterToken = event?.data?.token;
const __atwFilterActor = __atwFilterToken?.actor;
const __atwLifecycleExitEvent = ["atwAdjacentExit", "atwWithinExit", "tokenExit", "TOKEN_EXIT", "tokenMoveOut", "TOKEN_MOVE_OUT"].includes(String(event?.name ?? ""));
if (__atwFilterActor && !__atwLifecycleExitEvent) {
  const __atwActorOptions = new Set(__atwFilterActor.getRollOptions?.() ?? []);
  for (const ro of __ATW_MUST_HAVE_ROLL_OPTIONS) {
    if (!__atwActorOptions.has(ro)) return;
  }
  for (const ro of __ATW_MUST_NOT_HAVE_ROLL_OPTIONS) {
    if (__atwActorOptions.has(ro)) return;
  }
  if (__ATW_IGNORED_BY.length) {
    const __atwTargets = new Set(__ATW_IGNORED_BY);
    let __atwIgnored = false;
    for (const item of __atwFilterActor.items ?? []) {
      const candidates = [
        item.uuid,
        item.sourceId,
        item._stats?.compendiumSource,
        item.flags?.core?.sourceId,
        item.system?.compendiumSource,
        item.system?.source?.uuid
      ];
      if (candidates.some(c => c && __atwTargets.has(c))) {
        __atwIgnored = true;
        break;
      }
    }
    if (__atwIgnored) return;
  }
}
${source}`
}
