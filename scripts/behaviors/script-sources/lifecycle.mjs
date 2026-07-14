export function parentGroupScriptSource(ctx) {
   const {
      specs,
      parentBaseName,
      parentImg,
      sourceItemUuid,
      triggerGroupKey: groupKey,
   } = ctx

   const SPECS_JSON = JSON.stringify(specs)
   const PARENT_BASE = JSON.stringify(parentBaseName)
   const PARENT_IMG = JSON.stringify(parentImg)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const GROUP_KEY = JSON.stringify(groupKey)

   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const SPECS = ${SPECS_JSON};
const PARENT_BASE_NAME = ${PARENT_BASE};
const PARENT_IMG = ${PARENT_IMG};
const SOURCE_ITEM_UUID = ${SRC_UUID};
const TRIGGER_GROUP_KEY = ${GROUP_KEY};
const __api = game.modules.get(MODULE_ID)?.api;
if (__api?.isRegionDeleting?.(region?.uuid)) return;
const token = event.data?.token;
if (!token?.actor) return;
if (game.user.id !== game.users.activeGM?.id) return;
const sameRegion = token.actor.items?.find(i =>
  i.flags?.[MODULE_ID]?.isParentEffect &&
  i.flags?.[MODULE_ID]?.appliedByRegion === region?.uuid &&
  i.flags?.[MODULE_ID]?.triggerGroupKey === TRIGGER_GROUP_KEY
);
if (sameRegion) return;
let srcItem = null;
if (SOURCE_ITEM_UUID) {
  try { srcItem = await fromUuid(SOURCE_ITEM_UUID); } catch (_e) {}
}
const placerToken = srcItem?.actor?.getActiveTokens?.()[0];
const placerDisp = placerToken?.document?.disposition;
const __tokenDoc = token?.document ?? token;
const tokenDisp = __tokenDoc?.disposition ?? 1;
const __placerDispResolved = (placerDisp === undefined || placerDisp === null) ? 1 : placerDisp;
const isAlly = __placerDispResolved === tokenDisp;
const isPlacerActor = __atwSameActor(srcItem?.actor, token.actor);
const actorOpts = new Set(token.actor.getRollOptions?.() ?? []);
function __atwSameActor(a, b) {
  if (!a || !b) return false;
  const aIds = [a.uuid, a.id].filter(Boolean);
  const bIds = [b.uuid, b.id].filter(Boolean);
  return aIds.some(id => bIds.includes(id));
}
function actorHasAnyUuid(uuids) {
  if (!Array.isArray(uuids) || uuids.length === 0) return false;
  const targets = new Set(uuids);
  for (const item of token.actor.items ?? []) {
    const candidates = [
      item.uuid,
      item.sourceId,
      item._stats?.compendiumSource,
      item.flags?.core?.sourceId,
      item.system?.compendiumSource,
      item.system?.source?.uuid
    ];
    if (candidates.some(c => c && targets.has(c))) return true;
  }
  return false;
}
const grants = [];
const grantLinks = [];
for (const spec of SPECS) {
  if (spec.includePlacer === false && isPlacerActor) continue;
  if (Array.isArray(spec.target) && spec.target.length > 0 && !spec.target.includes("all")) {
    if (spec.target.includes("allies") && !isAlly) continue;
    if (spec.target.includes("enemies") && isAlly) continue;
  }
  if (Array.isArray(spec.rollOptions) && spec.rollOptions.length > 0) {
    let pass = true;
    for (const ro of spec.rollOptions) {
      if (!actorOpts.has(ro)) { pass = false; break; }
    }
    if (!pass) continue;
  }
  if (Array.isArray(spec.rollOptionsExclude) && spec.rollOptionsExclude.length > 0) {
    let pass = true;
    for (const ro of spec.rollOptionsExclude) {
      if (actorOpts.has(ro)) { pass = false; break; }
    }
    if (!pass) continue;
  }
  if (actorHasAnyUuid(spec.ignoredBy)) continue;
  let grantUuid = spec.uuid ?? null;
  let grantValue = null;
  let grantName = grantUuid;
  if (spec.kind === "rules" && Array.isArray(spec.rules)) {
    for (const r of spec.rules) {
      if (r && typeof r === "object") grants.push(r);
    }
    const lbl = spec.label || ("rule element" + (spec.rules.length === 1 ? "" : "s"));
    grantLinks.push(\`<li><em>\${lbl} (\${spec.rules.length})</em></li>\`);
    continue;
  }
  if (spec.kind === "condition") {
    const cond = game.pf2e?.ConditionManager?.conditions?.get?.(spec.conditionSlug);
    if (!cond) continue;
    grantUuid = cond.uuid;
    grantName = cond.name;
    if (cond.system?.value?.isValued) grantValue = Number(spec.conditionValue) || 1;
  } else if (grantUuid) {
    try {
      const doc = await fromUuid(grantUuid);
      grantName = doc?.name ?? grantUuid;
    } catch (_e) {}
  }
  if (!grantUuid) continue;
  const rule = {
    key: "GrantItem",
    uuid: grantUuid,
    allowDuplicate: false,
    onDeleteActions: { grantee: "detach" }
  };
  if (grantValue !== null && grantValue !== undefined) {
    rule.alterations = [{ mode: "override", property: "badge-value", value: grantValue }];
  }
  grants.push(rule);
  grantLinks.push(\`<li>@UUID[\${grantUuid}]{\${grantName}}</li>\`);
}
if (grants.length === 0) return;
const sameSource = token.actor.items?.filter(i =>
  i.flags?.[MODULE_ID]?.isParentEffect &&
  i.flags?.[MODULE_ID]?.sourceItemUuid === SOURCE_ITEM_UUID
) ?? [];
const num = sameSource.length + 1;
const parentName = num > 1 ? \`\${PARENT_BASE_NAME} (\${num})\` : PARENT_BASE_NAME;
const description = \`<ul>\${grantLinks.join("")}</ul>\`;
let promptForApply = false;
try { promptForApply = game.settings.get(MODULE_ID, "promptGmForApply"); } catch (_e) {}
if (promptForApply) {
  const actorName = token.actor.name ?? token.name ?? "this actor";
  const promptHtml = \`<p>Apply <strong>\${parentName}</strong> to <strong>\${actorName}</strong>?</p>\${description}\`;
  let enriched = promptHtml;
  try {
    enriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(promptHtml, { async: true });
  } catch (_e1) {
    try { enriched = await TextEditor.enrichHTML(promptHtml, { async: true }); } catch (_e2) {}
  }
  const confirmed = await (async () => {
    const DV2 = foundry?.applications?.api?.DialogV2;
    if (DV2?.confirm) {
      try { return await DV2.confirm({ window: { title: "Template Wizard — Apply Effects" }, content: enriched, rejectClose: false, modal: true }); }
      catch (_e) { return false; }
    }
    try { return await Dialog.confirm({title: "Template Wizard — Apply Effects",
    content: enriched,
    defaultYes: true}); }
    catch (_e) { return false; }
  })();
  if (!confirmed) return;
}
let parentDuration = { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" };
for (const spec of SPECS) {
  if (spec.includePlacer === false && isPlacerActor) continue;
  if (Array.isArray(spec.target) && spec.target.length > 0 && !spec.target.includes("all")) {
    if (spec.target.includes("allies") && !isAlly) continue;
    if (spec.target.includes("enemies") && isAlly) continue;
  }
  if (Array.isArray(spec.rollOptions) && spec.rollOptions.length > 0) {
    let pass = true;
    for (const ro of spec.rollOptions) if (!actorOpts.has(ro)) { pass = false; break; }
    if (!pass) continue;
  }
  if (Array.isArray(spec.rollOptionsExclude) && spec.rollOptionsExclude.length > 0) {
    let pass = true;
    for (const ro of spec.rollOptionsExclude) if (actorOpts.has(ro)) { pass = false; break; }
    if (!pass) continue;
  }
  if (actorHasAnyUuid(spec.ignoredBy)) continue;
  const d = spec.duration;
  if (d && d.unit && d.unit !== "unlimited") {
    parentDuration = { value: Number(d.value) || 1, unit: d.unit, sustained: false, expiry: d.expiry ?? "turn-start" };
    break;
  }
}
const parentEffectData = {
  type: "effect",
  name: parentName,
  img: PARENT_IMG,
  system: {
    rules: grants,
    duration: parentDuration,
    start: { value: 0, initiative: null },
    description: { value: description },
    traits: { value: [], rarity: "common" },
    level: { value: 1 },
    tokenIcon: { show: true },
    unidentified: false
  },
  flags: {
    [MODULE_ID]: {
      isParentEffect: true,
      appliedByRegion: region?.uuid ?? null,
      sourceItemUuid: SOURCE_ITEM_UUID,
      triggerGroupKey: TRIGGER_GROUP_KEY
    }
  }
};
await token.actor.createEmbeddedDocuments("Item", [parentEffectData]);
`
}

export function effectLifecycleGroupScriptSource(ctx) {
   const {
      specs,
      parentBaseName,
      parentImg,
      sourceItemUuid,
      triggerGroupKey: groupKey,
      triggers,
      lifecycle,
   } = ctx

   const SPECS_JSON = JSON.stringify(specs)
   const PARENT_BASE = JSON.stringify(parentBaseName)
   const PARENT_IMG = JSON.stringify(parentImg)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const GROUP_KEY = JSON.stringify(groupKey)
   const TRIGGERS_JSON = JSON.stringify(Array.isArray(triggers) ? triggers : [])
   const LIFECYCLE = JSON.stringify(!!lifecycle)

   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const SPECS = ${SPECS_JSON};
const PARENT_BASE_NAME = ${PARENT_BASE};
const PARENT_IMG = ${PARENT_IMG};
const SOURCE_ITEM_UUID = ${SRC_UUID};
const TRIGGER_GROUP_KEY = ${GROUP_KEY};
const LIFECYCLE_TRIGGERS = ${TRIGGERS_JSON};
const LIFECYCLE = ${LIFECYCLE};
const __api = game.modules.get(MODULE_ID)?.api;
if (__api?.isRegionDeleting?.(region?.uuid)) return;
const token = event.data?.token;
if (!token?.actor) return;
if (game.user.id !== game.users.activeGM?.id) return;
const actor = token.actor;
const eventName = String(event?.name ?? "");
const adjacentOnly = LIFECYCLE && LIFECYCLE_TRIGGERS.includes("whileAdjacent") && !LIFECYCLE_TRIGGERS.includes("whileWithin");
if (adjacentOnly && (eventName === "tokenEnter" || eventName === "tokenExit")) {
  return;
}
const isExit = LIFECYCLE && (
  eventName === "atwAdjacentExit" ||
  eventName.includes("Exit") ||
  eventName.includes("Out") ||
  eventName.includes("exit") ||
  eventName.includes("out")
);
let srcItem = null;
if (SOURCE_ITEM_UUID) {
  try { srcItem = await fromUuid(SOURCE_ITEM_UUID); } catch (_e) {}
}

function cloneSource(src) {
  const c = foundry.utils.deepClone(src);
  delete c._id;
  return c;
}

async function getRemovalStore() {
  const store = actor.getFlag?.(MODULE_ID, "reversibleRemovals");
  return store && typeof store === "object" ? foundry.utils.deepClone(store) : {};
}

async function saveRemovalStore(store) {
  if (store && Object.keys(store).length > 0) await actor.setFlag(MODULE_ID, "reversibleRemovals", store);
  else await actor.unsetFlag?.(MODULE_ID, "reversibleRemovals");
}

function specKey(spec) {
  if (spec.kind === "condition") return "condition:" + spec.conditionSlug;
  return "uuid:" + spec.uuid;
}

function effectMatches(item, uuid) {
  const candidates = [item.uuid, item.sourceId, item._stats?.compendiumSource, item.flags?.core?.sourceId];
  return candidates.includes(uuid);
}

function conditionMatches(item, slug) {
  return item.type === "condition" && (item.system?.slug === slug || item.slug === slug);
}

function resolveConditionGrant(slug) {
  if (!slug) return null;
  const manager = game.pf2e?.ConditionManager;
  let cond = null;
  try { cond = manager?.conditions?.get?.(slug) ?? null; } catch (_e) {}
  if (!cond && typeof manager?.getCondition === "function") {
    try {
      const maybe = manager.getCondition(slug);
      if (maybe && typeof maybe.then !== "function") cond = maybe;
    } catch (_e) {}
  }
  const uuid = cond?.uuid
    ?? cond?.sourceId
    ?? cond?._stats?.compendiumSource
    ?? cond?.flags?.core?.sourceId
    ?? \`Compendium.pf2e.conditionitems.Item.\${slug}\`;
  return {
    uuid,
    name: cond?.name ?? slug,
    valued: !!(cond?.system?.value?.isValued ?? cond?.value?.isValued)
  };
}

async function restoreRemovedItems() {
  const regionKey = region?.uuid ?? "unknown-region";
  const store = await getRemovalStore();
  const regionBucket = store[regionKey];
  const groupBucket = regionBucket?.[TRIGGER_GROUP_KEY];
  if (!groupBucket) return;
  const creates = [];
  for (const bucket of Object.values(groupBucket)) {
    const items = Array.isArray(bucket?.items) ? bucket.items : [];
    for (const source of items) creates.push(cloneSource(source));
  }
  if (creates.length > 0) {
    try { await actor.createEmbeddedDocuments("Item", creates); }
    catch (e) { undefined; }
  }
  delete regionBucket[TRIGGER_GROUP_KEY];
  if (Object.keys(regionBucket).length === 0) delete store[regionKey];
  await saveRemovalStore(store);
}

async function removeAppliedParents() {
  const ids = actor.items
    .filter(i =>
      i.flags?.[MODULE_ID]?.isParentEffect &&
      i.flags?.[MODULE_ID]?.appliedByRegion === region?.uuid &&
      i.flags?.[MODULE_ID]?.triggerGroupKey === TRIGGER_GROUP_KEY &&
      i.flags?.[MODULE_ID]?.effectLifecycle
    )
    .map(i => i.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
}

if (isExit) {
  await removeAppliedParents();
  await restoreRemovedItems();
  return;
}

const placerToken = srcItem?.actor?.getActiveTokens?.()[0];
const placerDisp = placerToken?.document?.disposition;
const __tokenDoc = token?.document ?? token;
const tokenDisp = __tokenDoc?.disposition ?? 1;
const __placerDispResolved = (placerDisp === undefined || placerDisp === null) ? 1 : placerDisp;
const isAlly = __placerDispResolved === tokenDisp;
const isPlacerActor = __atwSameActor(srcItem?.actor, actor);
const actorOpts = new Set(actor.getRollOptions?.() ?? []);
function __atwSameActor(a, b) {
  if (!a || !b) return false;
  const aIds = [a.uuid, a.id].filter(Boolean);
  const bIds = [b.uuid, b.id].filter(Boolean);
  return aIds.some(id => bIds.includes(id));
}
function actorHasAnyUuid(uuids) {
  if (!Array.isArray(uuids) || uuids.length === 0) return false;
  const targets = new Set(uuids);
  for (const item of actor.items ?? []) {
    const candidates = [
      item.uuid,
      item.sourceId,
      item._stats?.compendiumSource,
      item.flags?.core?.sourceId,
      item.system?.compendiumSource,
      item.system?.source?.uuid
    ];
    if (candidates.some(c => c && targets.has(c))) return true;
  }
  return false;
}

function passesSpec(spec) {
  if (spec.includePlacer === false && isPlacerActor) return false;
  if (Array.isArray(spec.target) && spec.target.length > 0 && !spec.target.includes("all")) {
    if (spec.target.includes("allies") && !isAlly) return false;
    if (spec.target.includes("enemies") && isAlly) return false;
  }
  if (Array.isArray(spec.rollOptions) && spec.rollOptions.length > 0) {
    for (const ro of spec.rollOptions) if (!actorOpts.has(ro)) return false;
  }
  if (Array.isArray(spec.rollOptionsExclude) && spec.rollOptionsExclude.length > 0) {
    for (const ro of spec.rollOptionsExclude) if (actorOpts.has(ro)) return false;
  }
  if (actorHasAnyUuid(spec.ignoredBy)) return false;
  return true;
}

async function removeSpec(spec) {
  if (spec.kind === "condition" && !LIFECYCLE) {
    const slug = spec.conditionSlug;
    if (!slug) return;
    const cond = game.pf2e?.ConditionManager?.conditions?.get?.(slug);
    const steps = Math.max(1, Number(spec.conditionValue) || 1);
    if (typeof actor.decreaseCondition === "function") {
      if (cond?.system?.value?.isValued) {
        for (let i = 0; i < steps; i++) await actor.decreaseCondition(slug);
      } else {
        await actor.decreaseCondition(slug, { forceRemove: true });
      }
      return;
    }
  }

  const matches = actor.items.filter(i => {
    if (spec.kind === "condition") return conditionMatches(i, spec.conditionSlug);
    return effectMatches(i, spec.uuid);
  });
  if (!matches.length) return;

  if (LIFECYCLE) {
    const regionKey = region?.uuid ?? "unknown-region";
    const store = await getRemovalStore();
    store[regionKey] ??= {};
    store[regionKey][TRIGGER_GROUP_KEY] ??= {};
    const key = specKey(spec);
    store[regionKey][TRIGGER_GROUP_KEY][key] ??= { items: [] };
    const bucket = store[regionKey][TRIGGER_GROUP_KEY][key];
    for (const item of matches) bucket.items.push(item.toObject());
    await saveRemovalStore(store);
  }

  await actor.deleteEmbeddedDocuments("Item", matches.map(i => i.id));
}

for (const spec of SPECS) {
  if (spec.action !== "remove") continue;
  if (!passesSpec(spec)) continue;
  await removeSpec(spec);
}

const applySpecs = SPECS.filter(s => s.action === "apply" && passesSpec(s));
if (applySpecs.length === 0) {
  return;
}
const sameRegion = actor.items?.find(i =>
  i.flags?.[MODULE_ID]?.isParentEffect &&
  i.flags?.[MODULE_ID]?.appliedByRegion === region?.uuid &&
  i.flags?.[MODULE_ID]?.triggerGroupKey === TRIGGER_GROUP_KEY
);
if (sameRegion) {
  return;
}

const grants = [];
const grantLinks = [];
let parentDuration = { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" };
for (const spec of applySpecs) {
  if (spec.kind === "rules" && Array.isArray(spec.rules)) {
    for (const r of spec.rules) if (r && typeof r === "object") grants.push(r);
    const lbl = spec.label || ("rule element" + (spec.rules.length === 1 ? "" : "s"));
    grantLinks.push(\`<li><em>\${lbl} (\${spec.rules.length})</em></li>\`);
  } else {
    let grantUuid = spec.uuid ?? null;
    let grantValue = null;
    let grantName = grantUuid;
    if (spec.kind === "condition") {
      const cond = resolveConditionGrant(spec.conditionSlug);
      if (!cond?.uuid) {
        continue;
      }
      grantUuid = cond.uuid;
      grantName = cond.name;
      if (cond.valued) grantValue = Number(spec.conditionValue) || 1;
    } else if (grantUuid) {
      try {
        const doc = await fromUuid(grantUuid);
        grantName = doc?.name ?? grantUuid;
      } catch (_e) {}
    }
    if (!grantUuid) continue;
    const rule = {
      key: "GrantItem",
      uuid: grantUuid,
      allowDuplicate: false,
      onDeleteActions: { grantee: "detach" }
    };
    if (grantValue !== null && grantValue !== undefined) {
      rule.alterations = [{ mode: "override", property: "badge-value", value: grantValue }];
    }
    grants.push(rule);
    grantLinks.push(\`<li>@UUID[\${grantUuid}]{\${grantName}}</li>\`);
  }
  const d = spec.duration;
  if (parentDuration.unit === "unlimited" && d && d.unit && d.unit !== "unlimited") {
    parentDuration = { value: Number(d.value) || 1, unit: d.unit, sustained: false, expiry: d.expiry ?? "turn-start" };
  }
}
if (grants.length === 0) {
  return;
}
const sameSource = actor.items?.filter(i =>
  i.flags?.[MODULE_ID]?.isParentEffect &&
  i.flags?.[MODULE_ID]?.sourceItemUuid === SOURCE_ITEM_UUID
) ?? [];
const num = sameSource.length + 1;
const parentName = num > 1 ? \`\${PARENT_BASE_NAME} (\${num})\` : PARENT_BASE_NAME;
const description = \`<ul>\${grantLinks.join("")}</ul>\`;
const parentEffectData = {
  type: "effect",
  name: parentName,
  img: PARENT_IMG,
  system: {
    rules: grants,
    duration: parentDuration,
    start: { value: 0, initiative: null },
    description: { value: description },
    traits: { value: [], rarity: "common" },
    level: { value: 1 },
    tokenIcon: { show: true },
    unidentified: false
  },
  flags: {
    [MODULE_ID]: {
      isParentEffect: true,
      appliedByRegion: region?.uuid ?? null,
      sourceItemUuid: SOURCE_ITEM_UUID,
      triggerGroupKey: TRIGGER_GROUP_KEY,
      effectLifecycle: LIFECYCLE
    }
  }
};
await actor.createEmbeddedDocuments("Item", [parentEffectData]);
`
}
