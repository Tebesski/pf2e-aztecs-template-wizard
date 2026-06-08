import {
   dispatchConsequenceBodySource,
   interpolatePathsSource,
   resolveNumberSource,
} from "./actions.mjs"
export function savingThrowScriptSource({
   save,
   dc,
   basicSave,
   basicDamages,
   extraRollOptions,
   consequences,
   target,
   sourceItemUuid,
   flavor,
}) {
   const SAVE = JSON.stringify(save)
   const DC_EXPR = JSON.stringify(String(dc))
   const BASIC_SAVE = JSON.stringify(!!basicSave)
   const BASIC_DAMAGES = JSON.stringify(
      Array.isArray(basicDamages) ? basicDamages : [],
   )
   const EXTRA_ROLL_OPTIONS = JSON.stringify(
      Array.isArray(extraRollOptions) ? extraRollOptions : [],
   )
   const CONSEQUENCES = JSON.stringify(consequences)
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const FLAVOR = JSON.stringify(flavor)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const SAVE = ${SAVE};
const DC_EXPR = ${DC_EXPR};
const BASIC_SAVE = ${BASIC_SAVE};
const BASIC_DAMAGES = ${BASIC_DAMAGES};
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
const __useTH = !!__api?.queueTargetHelperSave;
if (__useTH) {
  const __damageSource = (BASIC_SAVE && Array.isArray(BASIC_DAMAGES) && BASIC_DAMAGES.length > 0)
    ? BASIC_DAMAGES
    : (() => {
        const dmgConsq = (CONSEQUENCES ?? []).find(c => c?.type === "damage" && Array.isArray(c.damages) && c.damages.length > 0);
        return dmgConsq ? dmgConsq.damages : [];
      })();
  const damageFormula = Array.isArray(__damageSource) && __damageSource.length > 0
    ? __damageSource.map(d => {
        const n = Number(d.diceCount) || 0;
        const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : "";
        const base = n > 0 && die ? n + die : (n > 0 ? String(n) : "1d6");
        const type = d.damageType ?? "untyped";
        const cat = d.category && d.category !== "normal" ? "," + d.category : "";
        return \`\${base}[\${type}\${cat}]\`;
      }).join(",")
    : "";
  try {
    __api.queueTargetHelperSave({
      tokenDoc: token.document ?? token,
      actor: token.actor,
      save: SAVE,
      dc,
      item: srcItem,
      flavor: FLAVOR,
      basicSave: BASIC_SAVE,
      damageFormula,
      consequences: CONSEQUENCES,
      regionUuid: region?.uuid ?? null,
      extraRollOptions: EXTRA_ROLL_OPTIONS
    });
  } catch (e) { undefined; }
  return;
}
let outcome = null;
try {
  outcome = await __api.requestPlayerSave({
    actor: token.actor,
    save: SAVE,
    dc,
    item: srcItem,
    extraRollOptions: rollOptions,
    flavor: FLAVOR
  });
} catch (e) {
  undefined;
  return;
}
if (!outcome) return;
if (BASIC_SAVE && Array.isArray(BASIC_DAMAGES) && BASIC_DAMAGES.length > 0) {
  const mult = outcome === "criticalSuccess" ? 0
             : outcome === "success"         ? 0.5
             : outcome === "failure"         ? 1
             : outcome === "criticalFailure" ? 2 : 0;
  if (mult > 0) {
    await __dealBasicSaveDamage(BASIC_DAMAGES, mult, token, srcItem, rollOptions);
  }
}

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
      const __title = "Template Wizard — Save Consequence";
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
      if (confirmed) await __dispatchSaveGrantFamily(__grantFamily, token, srcItem, region);
    } else {
      await __dispatchSaveGrantFamily(__grantFamily, token, srcItem, region);
    }
  } catch (e) {
    undefined;
  }
}
for (const c of __other) {
  try {
    if (promptForApply && c.type !== "scrollingText" && c.type !== "chatMessage" && c.type !== "sendChatMessage") {
      const actorName = token.actor.name ?? token.name ?? "this actor";
      const __title = "Template Wizard — Save Consequence";
      const __outcomeFriendly = ({
        criticalSuccess: "Critical Success",
        success: "Success",
        failure: "Failure",
        criticalFailure: "Critical Failure"
      })[outcome] ?? outcome;
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
    undefined;
  }
}

async function __dispatchSaveGrantFamily(consList, token, srcItem, region) {
  const grants = [];
  const grantLinks = [];
  let parentDuration = { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" };
  for (const c of consList) {
    if (parentDuration.unit === "unlimited" && c.duration?.enabled) {
      const allowed = new Set(["rounds", "minutes", "hours", "days"]);
      const u = allowed.has(c.duration.unit) ? c.duration.unit : "rounds";
      parentDuration = {
        value: Math.max(1, Number(c.duration.amount) || 1),
        unit: u, sustained: false, expiry: "turn-start"
      };
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
    && (i.flags?.[MODULE_ID]?.triggerGroupKey ?? "") === "saveConsequence"
  ) ?? [];
  const baseName = (srcItem?.name ? \`Effect: \${srcItem.name}\` : "Effect: Save consequence");
  const num = sameSource.length + 1;
  const parentName = num > 1 ? \`\${baseName} (\${num})\` : baseName;
  const description = "<ul>" + grantLinks.join("") + "</ul>";
  const parent = {
    type: "effect",
    name: parentName,
    img: srcItem?.img || "icons/svg/aura.svg",
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
        sourceItemUuid: srcItem?.uuid ?? null,
        triggerGroupKey: "saveConsequence"
      }
    }
  };
  await token.actor.createEmbeddedDocuments("Item", [parent]);
}

async function __dealBasicSaveDamage(damages, mult, token, srcItem, rollOpts) {
  const parts = [];
  for (const d of damages) {
    const count = Number(d.diceCount) || 0;
    if (count <= 0 || !d.damageType) continue;
    const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : null;
    const tags = [d.damageType];
    if (d.category && d.category !== "normal") tags.push(d.category);
    const tagStr = "[" + tags.join(",") + "]";
    const term = die ? \`\${count}\${die}\${tagStr}\` : \`\${count}\${tagStr}\`;
    parts.push(mult === 1 ? term : \`(\${term})*\${mult}\`);
  }
  if (!parts.length) return;
  const formula = parts.join(",");
  const DR = CONFIG.Dice?.rolls?.find(r => r.name === "DamageRoll") ?? Roll;
  let damageRoll;
  try {
    damageRoll = await new DR(formula, {}, { rollOptions: rollOpts }).evaluate({ allowInteractive: false });
  } catch (_e) {
    damageRoll = await new Roll(formula).evaluate({ allowInteractive: false });
  }
  const speaker = ChatMessage.getSpeaker({ token: token.object });
  const __priorTargets = new Set(game.user.targets);
  try { game.user.updateTokenTargets([token.object?.id ?? token.id]); } catch (_e) {}
  await damageRoll.toMessage({ speaker, flavor: \`\${FLAVOR}: Basic Save damage\` }, { rollMode: game.settings.get("core", "rollMode") });
  try { game.user.updateTokenTargets(Array.from(__priorTargets).map(t => t.id)); } catch (_e) {}
  let autoApply = false;
  try { autoApply = game.settings.get(MODULE_ID, "applyDamageAutomatically"); } catch (_e) {}
  if (autoApply && typeof token.actor.applyDamage === "function") {
    try { await token.actor.applyDamage({ damage: damageRoll, token: token.object }); } catch (_e) {}
  }
}

${resolveNumberSource()}

${dispatchConsequenceBodySource()}

${interpolatePathsSource()}
`
}
