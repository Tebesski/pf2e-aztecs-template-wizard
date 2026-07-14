import { resolveTriggerToEvent } from "../data.mjs"

export const WIZARD_META_KEYS = new Set([
   "triggers",
   "target",
   "includePlacer",
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
   if (s.includePlacer !== undefined) meta.includePlacer = s.includePlacer !== false
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
      target: Array.isArray(s.target) ? s.target.slice() : [],
      includePlacer: s.includePlacer !== false,
   }
}

export function wrapActorFilterSource(source, entry, item = null) {
   const meta = actorFilterMeta(entry)
   const targetGroups = meta.target.filter((t) => typeof t === "string" && t.trim())
   const filtersTargets =
      targetGroups.length > 0 && !targetGroups.includes("all")
   if (
      meta.rollOptions.length === 0 &&
      meta.rollOptionsExclude.length === 0 &&
      meta.ignoredBy.length === 0 &&
      !filtersTargets &&
      meta.includePlacer !== false
   )
      return source
   const have = JSON.stringify(meta.rollOptions)
   const not = JSON.stringify(meta.rollOptionsExclude)
   const ignoredBy = JSON.stringify(meta.ignoredBy)
   const targets = JSON.stringify(targetGroups)
   const includePlacer = JSON.stringify(meta.includePlacer !== false)
   const sourceItemUuid = JSON.stringify(item?.uuid ?? null)
   return `const __ATW_MUST_HAVE_ROLL_OPTIONS = ${have};
const __ATW_MUST_NOT_HAVE_ROLL_OPTIONS = ${not};
const __ATW_IGNORED_BY = ${ignoredBy};
const __ATW_TARGET_GROUPS = ${targets};
const __ATW_INCLUDE_PLACER = ${includePlacer};
const __ATW_SOURCE_ITEM_UUID = ${sourceItemUuid};
const __atwFilterToken = event?.data?.token;
const __atwFilterActor = __atwFilterToken?.actor;
const __atwLifecycleExitEvent = ["atwAdjacentExit", "atwWithinExit", "tokenExit", "TOKEN_EXIT", "tokenMoveOut", "TOKEN_MOVE_OUT"].includes(String(event?.name ?? ""));
if (__atwFilterActor && !__atwLifecycleExitEvent) {
  let __atwSourceItem = null;
  if (__ATW_SOURCE_ITEM_UUID) {
    try { __atwSourceItem = await fromUuid(__ATW_SOURCE_ITEM_UUID); } catch (_e) {}
  }
  const __atwPlacerActor = __atwSourceItem?.actor ?? null;
  if (__ATW_INCLUDE_PLACER === false && __atwSameActor(__atwPlacerActor, __atwFilterActor)) return;
  if (Array.isArray(__ATW_TARGET_GROUPS) && __ATW_TARGET_GROUPS.length > 0 && !__ATW_TARGET_GROUPS.includes("all")) {
    const __atwPlacerToken = __atwPlacerActor?.getActiveTokens?.()[0];
    const __atwPlacerDisp = __atwPlacerToken?.document?.disposition;
    const __atwTokenDoc = __atwFilterToken?.document ?? __atwFilterToken;
    const __atwTokenDisp = __atwTokenDoc?.disposition ?? 1;
    const __atwPlacerDispResolved = (__atwPlacerDisp === undefined || __atwPlacerDisp === null) ? 1 : __atwPlacerDisp;
    const __atwIsAlly = __atwPlacerDispResolved === __atwTokenDisp;
    if (__ATW_TARGET_GROUPS.includes("allies") && !__atwIsAlly) return;
    if (__ATW_TARGET_GROUPS.includes("enemies") && __atwIsAlly) return;
  }
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
function __atwSameActor(a, b) {
  if (!a || !b) return false;
  const aIds = [a.uuid, a.id].filter(Boolean);
  const bIds = [b.uuid, b.id].filter(Boolean);
  return aIds.some(id => bIds.includes(id));
}
${source}`
}
