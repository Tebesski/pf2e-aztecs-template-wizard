import {
   dispatchConsequenceBodySource,
   interpolatePathsSource,
   resolveNumberSource,
} from "./actions.mjs"
export function rollSkillScriptSource({
   skill,
   lore,
   dc,
   extraRollOptions,
   consequences,
   target,
   sourceItemUuid,
   flavor,
}) {
   const SKILL = JSON.stringify(skill)
   const LORE = JSON.stringify(lore)
   const DC_EXPR = JSON.stringify(String(dc))
   const EXTRA_ROLL_OPTIONS = JSON.stringify(
      Array.isArray(extraRollOptions) ? extraRollOptions : [],
   )
   const CONSEQUENCES = JSON.stringify(consequences)
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const FLAVOR = JSON.stringify(flavor)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const SKILL = ${SKILL};
const LORE = ${LORE};
const DC_EXPR = ${DC_EXPR};
const EXTRA_ROLL_OPTIONS = ${EXTRA_ROLL_OPTIONS};
const CONSEQUENCES = ${CONSEQUENCES};
const TARGET_GROUPS = ${TARGET};
const SOURCE_ITEM_UUID = ${SRC_UUID};
const FLAVOR = ${FLAVOR};
const __api = game.modules.get(MODULE_ID)?.api;
if (__api?.isRegionDeleting?.(region?.uuid)) return;
const token = event.data?.token;
if (!token?.actor) return;
if (game.user.id !== game.users.activeGM?.id) return;

let srcItem = null;
if (SOURCE_ITEM_UUID) {
  try { srcItem = await fromUuid(SOURCE_ITEM_UUID); } catch (_e) {}
}
if (Array.isArray(TARGET_GROUPS) && TARGET_GROUPS.length > 0 && !TARGET_GROUPS.includes("all")) {
  const placerToken = srcItem?.actor?.getActiveTokens?.()[0];
  const placerDisp = placerToken?.document?.disposition;
  const __tokenDoc = token?.document ?? token;
  const tokenDisp = __tokenDoc?.disposition ?? 1;
  const __placerDispResolved = (placerDisp === undefined || placerDisp === null) ? 1 : placerDisp;
  const isAlly = __placerDispResolved === tokenDisp;
  if (TARGET_GROUPS.includes("allies") && !isAlly) return;
  if (TARGET_GROUPS.includes("enemies") && isAlly) return;
}
const __placer = srcItem?.actor ?? null;
const __scope = {
  actor: __placer,
  token: token.document ?? token,
  region,
  sourceItem: srcItem,
  placer: __placer,
  target: token.actor
};
const dc = resolveNumber(DC_EXPR, __scope) || 15;

let rollOptions = [];
try { rollOptions = (srcItem?.getRollOptions?.("item") ?? []).slice(); } catch (_e) {}
for (const ro of EXTRA_ROLL_OPTIONS) if (ro) rollOptions.push(ro);
let skillKey = SKILL;
if (SKILL === "lore" && LORE) {
  skillKey = String(LORE).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

if (__api?.queueSkillCheckCard) {
  try {
    const queued = __api.queueSkillCheckCard({
      tokenDoc: token.document ?? token,
      actor: token.actor,
      skill: skillKey,
      dc,
      item: srcItem,
      flavor: FLAVOR,
      extraRollOptions: rollOptions,
      consequences: CONSEQUENCES,
      regionUuid: region?.uuid ?? null
    });
    if (queued) return;
  } catch (e) {
    console.warn("[atw] skill-check card queue failed", e);
  }
}

let outcome = null;
try {
  outcome = await __api.requestPlayerSkillRoll({
    actor: token.actor,
    skill: skillKey,
    dc,
    item: srcItem,
    extraRollOptions: rollOptions,
    flavor: FLAVOR
  });
} catch (e) {
  console.error("[atw] requestPlayerSkillRoll failed", e);
  return;
}
if (!outcome) return;

let promptForApply = false;
try { promptForApply = game.settings.get(MODULE_ID, "promptGmForApply"); } catch (_e) {}
const __matching = CONSEQUENCES.filter(c => (c?.outcome ?? "failure") === outcome);
const __grantFamily = __matching.filter(c =>
  c.type === "applyEffect" || c.type === "applyCondition" || c.type === "applyRuleElement"
);
const __other = __matching.filter(c =>
  !(c.type === "applyEffect" || c.type === "applyCondition" || c.type === "applyRuleElement")
);

if (__grantFamily.length > 0) {
  try {
    if (promptForApply) {
      const actorName = token.actor.name ?? token.name ?? "this actor";
      const __title = "Template Wizard — Skill Consequence";
      const __outcomeFriendly = ({ criticalSuccess: "Critical Success", success: "Success", failure: "Failure", criticalFailure: "Critical Failure" })[outcome] ?? outcome;
      const __list = __grantFamily.map(c => "<li>" + __describeConsequenceForPrompt(c) + "</li>").join("");
      const __content = \`<p>Apply to <strong>\${actorName}</strong> on <em>\${__outcomeFriendly}</em>:</p><ul>\${__list}</ul>\`;
      const confirmed = await (async () => {
        const DV2 = foundry?.applications?.api?.DialogV2;
        if (DV2?.confirm) {
          try { return await DV2.confirm({ window: { title: __title }, content: __content, rejectClose: false, modal: true }); }
          catch (_e) { return false; }
        }
        try { return await Dialog.confirm({ title: __title, content: __content, defaultYes: true }); }
        catch (_e) { return false; }
      })();
      if (confirmed) await __dispatchSkillGrantFamily(__grantFamily, token, srcItem, region);
    } else {
      await __dispatchSkillGrantFamily(__grantFamily, token, srcItem, region);
    }
  } catch (e) {
    console.error("[atw] skill grant-family dispatch failed", e);
  }
}

for (const c of __other) {
  try {
    if (promptForApply && c.type !== "scrollingText" && c.type !== "chatMessage" && c.type !== "sendChatMessage") {
      const actorName = token.actor.name ?? token.name ?? "this actor";
      const __title = "Template Wizard — Skill Consequence";
      const __outcomeFriendly = ({ criticalSuccess: "Critical Success", success: "Success", failure: "Failure", criticalFailure: "Critical Failure" })[outcome] ?? outcome;
      const __consFriendly = __describeConsequenceForPrompt(c);
      const __content = \`<p>Apply <strong>\${__consFriendly}</strong> to <strong>\${actorName}</strong> on <em>\${__outcomeFriendly}</em>?</p>\`;
      const confirmed = await (async () => {
        const DV2 = foundry?.applications?.api?.DialogV2;
        if (DV2?.confirm) {
          try { return await DV2.confirm({ window: { title: __title }, content: __content, rejectClose: false, modal: true }); }
          catch (_e) { return false; }
        }
        try { return await Dialog.confirm({ title: __title, content: __content, defaultYes: true }); }
        catch (_e) { return false; }
      })();
      if (!confirmed) continue;
    }
    await dispatchConsequence(c, token, srcItem, region, 0);
  } catch (e) {
    console.error("[atw] skill consequence dispatch failed", c, e);
  }
}

async function __dispatchSkillGrantFamily(consList, token, srcItem, region) {
  const grants = [];
  const grantLinks = [];
  let parentDuration = { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" };
  for (const c of consList) {
    if (parentDuration.unit === "unlimited" && c.duration?.enabled) {
      const allowed = new Set(["rounds", "minutes", "hours", "days"]);
      const u = allowed.has(c.duration.unit) ? c.duration.unit : "rounds";
      parentDuration = { value: Math.max(1, Number(c.duration.amount) || 1), unit: u, sustained: false, expiry: "turn-start" };
    }
    if (c.type === "applyRuleElement") {
      const rules = Array.isArray(c.rules) ? c.rules : [];
      for (const r of rules) {
        try {
          const obj = typeof r === "string" ? JSON.parse(r) : r;
          if (obj && typeof obj === "object") grants.push(obj);
        } catch (_e) {}
      }
      const lbl = c.label || ("rule element" + (rules.length === 1 ? "" : "s"));
      grantLinks.push("<li><em>" + lbl + " (" + rules.length + ")</em></li>");
    } else if (c.type === "applyCondition") {
      const slug = c.condition?.slug;
      if (!slug) continue;
      const cond = game.pf2e?.ConditionManager?.conditions?.get?.(slug);
      if (!cond) continue;
      const rule = { key: "GrantItem", uuid: cond.uuid, allowDuplicate: false, onDeleteActions: { grantee: "detach" } };
      if (cond.system?.value?.isValued) {
        const v = Number(c.condition?.value) || 1;
        rule.alterations = [{ mode: "override", property: "badge-value", value: v }];
      }
      grants.push(rule);
      grantLinks.push("<li>@UUID[" + cond.uuid + "]{" + cond.name + "}</li>");
    } else if (c.type === "applyEffect") {
      if (!c.uuid) continue;
      let name = c.uuid;
      try { const doc = await fromUuid(c.uuid); name = doc?.name ?? c.uuid; } catch (_e) {}
      grants.push({ key: "GrantItem", uuid: c.uuid, allowDuplicate: false, onDeleteActions: { grantee: "detach" } });
      grantLinks.push("<li>@UUID[" + c.uuid + "]{" + name + "}</li>");
    }
  }
  if (grants.length === 0) return;
  const sameSource = token.actor.items?.filter(i =>
    i.flags?.[MODULE_ID]?.isParentEffect
    && i.flags?.[MODULE_ID]?.sourceItemUuid === (srcItem?.uuid ?? null)
    && (i.flags?.[MODULE_ID]?.triggerGroupKey ?? "") === "skillConsequence"
  ) ?? [];
  const baseName = (srcItem?.name ? \`Effect: \${srcItem.name}\` : "Effect: Skill consequence");
  const num = sameSource.length + 1;
  const parentName = num > 1 ? \`\${baseName} (\${num})\` : baseName;
  const description = "<ul>" + grantLinks.join("") + "</ul>";
  const parent = {
    type: "effect", name: parentName,
    img: srcItem?.img || "icons/svg/aura.svg",
    system: {
      rules: grants, duration: parentDuration,
      start: { value: 0, initiative: null },
      description: { value: description },
      traits: { value: [], rarity: "common" },
      level: { value: 1 }, tokenIcon: { show: true }, unidentified: false
    },
    flags: { [MODULE_ID]: {
      isParentEffect: true,
      appliedByRegion: region?.uuid ?? null,
      sourceItemUuid: srcItem?.uuid ?? null,
      triggerGroupKey: "skillConsequence"
    }}
  };
  await token.actor.createEmbeddedDocuments("Item", [parent]);
}

${resolveNumberSource()}

${dispatchConsequenceBodySource()}

${interpolatePathsSource()}
`
}
