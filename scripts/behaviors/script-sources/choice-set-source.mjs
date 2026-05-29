import {
   dispatchConsequenceBodySource,
   interpolatePathsSource,
   resolveNumberSource,
} from "./actions.mjs"
export function choiceSetScriptSource({
   choices,
   consequences,
   target,
   sourceItemUuid,
   flavor,
}) {
   const CHOICES = JSON.stringify(choices)
   const CONSEQUENCES = JSON.stringify(
      Array.isArray(consequences) ? consequences : [],
   )
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const FLAVOR = JSON.stringify(flavor)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const CHOICES = ${CHOICES};
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

if (!Array.isArray(CHOICES) || CHOICES.length === 0) return;
const __useTH = !!__api?.queueTargetHelperChoice;
if (__useTH) {
  try {
    __api.queueTargetHelperChoice({
      behaviorId: behavior?.id ?? null,
      regionUuid: region?.uuid ?? null,
      tokenDoc: token.document ?? token,
      choices: CHOICES,
      sourceItemUuid: SOURCE_ITEM_UUID,
      flavor: FLAVOR,
      consequences: CONSEQUENCES
    });
  } catch (e) { console.warn("[atw] Target Helper choice queue failed", e); }
  return;
}
const __placer = srcItem?.actor ?? null;
const __scope = {
  actor: __placer, token: token.document ?? token, region,
  sourceItem: srcItem, placer: __placer, target: token.actor
};
const SKILL_LABELS = {
  acrobatics: "Acrobatics", arcana: "Arcana", athletics: "Athletics",
  crafting: "Crafting", deception: "Deception", diplomacy: "Diplomacy",
  intimidation: "Intimidation", medicine: "Medicine", nature: "Nature",
  occultism: "Occultism", performance: "Performance", religion: "Religion",
  society: "Society", stealth: "Stealth", survival: "Survival",
  thievery: "Thievery", perception: "Perception", lore: "Lore"
};
const SAVE_LABELS = { fortitude: "Fortitude", reflex: "Reflex", will: "Will" };
const buttons = CHOICES.map((c, i) => {
  let label;
  const displayDc = resolveNumber(String(c.dc ?? "15"), __scope) || 15;
  if (c.kind === "skill") {
    const skName = c.skill === "lore" && c.lore
      ? c.lore
      : (SKILL_LABELS[c.skill] ?? c.skill ?? "?");
    label = \`\${skName} (DC \${displayDc})\`;
  } else {
    label = \`\${SAVE_LABELS[c.save] ?? c.save ?? "?"} save (DC \${displayDc})\`;
  }
  return { action: "atw-c-" + i, label, default: i === 0 };
});
let chosenIdx = -1;
try {
  const __title = FLAVOR ? \`Template Wizard — \${FLAVOR}\` : "Template Wizard — Choice";
  const __content = \`<p>Choose how to respond:</p>\`;
  const DV2 = foundry?.applications?.api?.DialogV2;
  if (__api?.requestPlayerChoiceDialog) {
    chosenIdx = await __api.requestPlayerChoiceDialog({
      actor: token.actor,
      title: __title,
      content: __content,
      choices: buttons.map((b, i) => ({ label: b.label, value: i, default: b.default })),
      cancelValue: -1
    });
  } else if (DV2?.wait) {
    chosenIdx = await new Promise((resolve) => {
      const buttonsCfg = buttons.map((b, i) => ({
        action: b.action, label: b.label, default: b.default,
        callback: () => resolve(i)
      }));
      buttonsCfg.push({ action: "cancel", label: "Cancel", callback: () => resolve(-1) });
      DV2.wait({
        window: { title: __title }, content: __content,
        buttons: buttonsCfg, rejectClose: false, modal: true,
        close: () => resolve(-1)
      }).catch(() => resolve(-1));
    });
  } else if (typeof Dialog !== "undefined") {
    chosenIdx = await new Promise((resolve) => {
      const btnObj = {};
      for (let i = 0; i < buttons.length; i++) {
        btnObj["c" + i] = { label: buttons[i].label, callback: () => resolve(i) };
      }
      btnObj.cancel = { label: "Cancel", callback: () => resolve(-1) };
      new Dialog({ title: __title, content: __content, buttons: btnObj, close: () => resolve(-1) }).render(true);
    });
  }
} catch (e) {
  console.error("[atw] choiceSet dialog failed", e);
  return;
}
if (chosenIdx < 0 || chosenIdx >= CHOICES.length) return;
const chosen = CHOICES[chosenIdx];
const dc = resolveNumber(String(chosen.dc ?? "15"), __scope) || 15;
let rollOptions = [];
try { rollOptions = (srcItem?.getRollOptions?.("item") ?? []).slice(); } catch (_e) {}

let outcome = null;
try {
  if (chosen.kind === "skill") {
    let skillKey = chosen.skill || "athletics";
    if (skillKey === "lore" && chosen.lore) {
      skillKey = String(chosen.lore).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }
    outcome = await __api.requestPlayerSkillRoll({
      actor: token.actor, skill: skillKey, dc,
      item: srcItem, extraRollOptions: rollOptions, flavor: FLAVOR
    });
  } else {
    outcome = await __api.requestPlayerSave({
      actor: token.actor, save: chosen.save || "reflex", dc,
      item: srcItem, extraRollOptions: rollOptions, flavor: FLAVOR
    });
  }
} catch (e) {
  console.error("[atw] choiceSet roll failed", e);
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
      const __title = "Template Wizard — Choice Consequence";
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
      if (confirmed) await __dispatchChoiceGrantFamily(__grantFamily, token, srcItem, region);
    } else {
      await __dispatchChoiceGrantFamily(__grantFamily, token, srcItem, region);
    }
  } catch (e) {
    console.error("[atw] choice grant-family dispatch failed", e);
  }
}

for (const c of __other) {
  try {
    if (promptForApply && c.type !== "scrollingText" && c.type !== "chatMessage" && c.type !== "sendChatMessage") {
      const actorName = token.actor.name ?? token.name ?? "this actor";
      const __title = "Template Wizard — Choice Consequence";
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
    console.error("[atw] choice consequence dispatch failed", c, e);
  }
}

async function __dispatchChoiceGrantFamily(consList, token, srcItem, region) {
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
    && (i.flags?.[MODULE_ID]?.triggerGroupKey ?? "") === "choiceConsequence"
  ) ?? [];
  const baseName = (srcItem?.name ? \`Effect: \${srcItem.name}\` : "Effect: Choice consequence");
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
      triggerGroupKey: "choiceConsequence"
    }}
  };
  await token.actor.createEmbeddedDocuments("Item", [parent]);
}

${resolveNumberSource()}

${dispatchConsequenceBodySource()}

${interpolatePathsSource()}
`
}
