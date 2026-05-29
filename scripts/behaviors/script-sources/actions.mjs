export function dealDamageScriptSource({
   damages,
   target,
   sourceItemUuid,
   flavor,
}) {
   const DAMAGES = JSON.stringify(damages)
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const FLAVOR = JSON.stringify(flavor)

   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const DAMAGES = ${DAMAGES};
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
const parts = [];
for (const d of DAMAGES) {
  if (!d?.damageType) continue;
  const count = Number(d.diceCount) || 0;
  if (count <= 0) continue;
  const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : null;
  const tags = [d.damageType];
  if (d.category && d.category !== "normal") tags.push(d.category);
  const tagStr = "[" + tags.join(",") + "]";
  if (die) parts.push(\`\${count}\${die}\${tagStr}\`);
  else parts.push(\`\${count}\${tagStr}\`);
}
if (parts.length === 0) return;
const formula = parts.join(",");
let rollOptions = [];
try {
  if (srcItem?.getRollOptions) {
    rollOptions = (srcItem.getRollOptions("item") ?? []).slice();
  }
} catch (_e) {}
for (const d of DAMAGES) {
  if (!d?.extraRollOptionsEnabled) continue;
  const extras = String(d.extraRollOptions ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  for (const e of extras) rollOptions.push(e);
}
if (__api?.queueDamageCard) {
  try {
    const queued = __api.queueDamageCard({
      tokenDoc: token.document ?? token,
      actor: token.actor,
      formula,
      rollOptions,
      item: srcItem,
      flavor: FLAVOR,
      regionUuid: region?.uuid ?? null
    });
    if (queued) return;
  } catch (e) {
    console.warn("[atw] damage card queue failed", e);
  }
}
const DamageRollCtor = CONFIG.Dice?.rolls?.find(r => r.name === "DamageRoll") ?? Roll;
let damageRoll;
try {
  damageRoll = await new DamageRollCtor(formula, {}, { rollOptions }).evaluate({ allowInteractive: false });
} catch (e1) {
  try {
    damageRoll = await new Roll(formula).evaluate({ allowInteractive: false });
  } catch (e2) {
    console.error("[atw] damage roll failed", e1, e2);
    return;
  }
}
const speaker = ChatMessage.getSpeaker({ token: token.object });
const __priorTargets = new Set(game.user.targets);
try {
  game.user.updateTokenTargets([token.object?.id ?? token.id]);
} catch (_e) {}

const __md = await damageRoll.toMessage(
  { speaker, flavor: FLAVOR },
  { create: false, rollMode: game.settings.get("core", "rollMode") }
);
if (__md) {
  const __targetUuid = (token.document ?? token)?.uuid;
  const __actorUuid = token.actor?.uuid;
  foundry.utils.mergeObject(__md, {
    flags: {
      pf2e: {
        context: { type: "damage-roll", target: { token: __targetUuid, actor: __actorUuid } },
        target: { token: __targetUuid, actor: __actorUuid },
        origin: srcItem?.uuid ? { uuid: srcItem.uuid } : undefined
      }
    }
  });
  await ChatMessage.create(__md);
}
try {
  game.user.updateTokenTargets(Array.from(__priorTargets).map(t => t.id));
} catch (_e) {}

let autoApply = false;
try { autoApply = game.settings.get(MODULE_ID, "applyDamageAutomatically"); } catch (_e) {}
if (autoApply && typeof token.actor.applyDamage === "function") {
  try {
    await token.actor.applyDamage({ damage: damageRoll, token: token.object });
  } catch (_e) {}
}
`
}

export function displayScrollingTextScriptSource({ text, color, fontSize }) {
   const TEXT = JSON.stringify(text)
   const COLOR = JSON.stringify(color)
   const FONT = JSON.stringify(fontSize)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const TEXT = ${TEXT};
const COLOR = ${COLOR};
const FONT_SIZE = ${FONT};
const __api = game.modules.get(MODULE_ID)?.api;
if (__api?.isRegionDeleting?.(region?.uuid)) return;
const token = event.data?.token;
if (!token) return;
const obj = token.object;
if (!obj) return;
const interface_ = canvas.interface ?? canvas.controls;
const center = obj.center ?? { x: obj.x + obj.w/2, y: obj.y + obj.h/2 };
try {
  if (interface_?.createScrollingText) {
    interface_.createScrollingText(center, TEXT, {
      anchor: CONST.TEXT_ANCHOR_POINTS?.CENTER ?? 1,
      direction: CONST.TEXT_ANCHOR_POINTS?.TOP ?? 0,
      fontSize: FONT_SIZE,
      fill: COLOR,
      stroke: 0x000000,
      strokeThickness: 4,
      jitter: 0.25
    });
  }
} catch (_e) {}
`
}

export function executeMacroScriptSource({ uuid }) {
   const UUID = JSON.stringify(uuid)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const UUID = ${UUID};
const __api = game.modules.get(MODULE_ID)?.api;
if (__api?.isRegionDeleting?.(region?.uuid)) return;
const token = event.data?.token;
const actor = token?.actor;
if (!UUID) return;
if (game.user.id !== game.users.activeGM?.id) return;
let macro = null;
try { macro = await fromUuid(UUID); } catch (_e) {}
if (!macro?.execute) return;
await macro.execute({ event, region, scene, behavior, token, actor });
`
}

export function sendChatMessageScriptSource({
   text,
   target,
   rollMode,
   sourceItemUuid,
}) {
   const TEXT = JSON.stringify(text)
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const ROLL_MODE = JSON.stringify(rollMode || "publicroll")
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const TEXT = ${TEXT};
const TARGET_GROUPS = ${TARGET};
const SOURCE_ITEM_UUID = ${SRC_UUID};
const ROLL_MODE = ${ROLL_MODE};
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
const speaker = ChatMessage.getSpeaker({ token: token.object });
let content = interpolatePaths(TEXT, {
  actor: token.actor,
  token: token.document ?? token,
  region,
  sourceItem: srcItem,
  placer: srcItem?.actor ?? null
});
content = await enrichChatContent(content, srcItem);
const msgData = { speaker, content };
if (ROLL_MODE && ROLL_MODE !== "publicroll") {
  if (typeof ChatMessage.applyRollMode === "function") {
    ChatMessage.applyRollMode(msgData, ROLL_MODE);
  } else if (ROLL_MODE === "gmroll" || ROLL_MODE === "blindroll") {
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
    msgData.whisper = gmIds;
    if (ROLL_MODE === "blindroll") msgData.blind = true;
  }
}
await ChatMessage.create(msgData);

${interpolatePathsSource()}
${enrichChatContentSource()}
`
}

export function addIRWScriptSource({
   immunities,
   resistances,
   weaknesses,
   target,
   sourceItemUuid,
   label,
}) {
   const IMM = JSON.stringify(immunities)
   const RES = JSON.stringify(resistances)
   const WKN = JSON.stringify(weaknesses)
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const LABEL = JSON.stringify(label)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const IMMUNITIES = ${IMM};
const RESISTANCES = ${RES};
const WEAKNESSES = ${WKN};
const TARGET_GROUPS = ${TARGET};
const SOURCE_ITEM_UUID = ${SRC_UUID};
const LABEL = ${LABEL};
const __api = game.modules.get(MODULE_ID)?.api;
if (__api?.isRegionDeleting?.(region?.uuid)) return;
const token = event.data?.token;
if (!token?.actor) return;
if (game.user.id !== game.users.activeGM?.id) return;

const FROM_TAG = \`atw:irw:\${behavior?.id ?? region?.id ?? ""}\`;

let srcItem = null;
if (SOURCE_ITEM_UUID) {
  try { srcItem = await fromUuid(SOURCE_ITEM_UUID); } catch (_e) {}
}

const evName = event?.name ?? "";
if (evName.includes("exit") || evName === "tokenExit" || evName === "TOKEN_EXIT") {
  const ours = token.actor.items.filter(i =>
    i.type === "effect"
    && i.getFlag?.(MODULE_ID, "fromAddIRW") === FROM_TAG
  );
  if (ours.length) {
    try {
      await token.actor.deleteEmbeddedDocuments("Item", ours.map(e => e.id));
    } catch (e) { console.warn("[atw] failed removing addIRW effect", e); }
  }
  return;
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
const existing = token.actor.items.find(i =>
  i.type === "effect" && i.getFlag?.(MODULE_ID, "fromAddIRW") === FROM_TAG
);
if (existing) return;
const rules = [];
const descParts = [];
for (const dt of IMMUNITIES) {
  rules.push({ key: "Immunity", type: dt });
  descParts.push(\`<li>Immunity: \${dt}</li>\`);
}
for (const r of RESISTANCES) {
  if (!r?.type) continue;
  const v = Math.max(1, Number(r.value) || 1);
  rules.push({ key: "Resistance", type: r.type, value: v });
  descParts.push(\`<li>Resistance \${v}: \${r.type}</li>\`);
}
for (const w of WEAKNESSES) {
  if (!w?.type) continue;
  const v = Math.max(1, Number(w.value) || 1);
  rules.push({ key: "Weakness", type: w.type, value: v });
  descParts.push(\`<li>Weakness \${v}: \${w.type}</li>\`);
}
if (rules.length === 0) return;

const parent = {
  type: "effect",
  name: \`\${LABEL}: IWR\`,
  img: srcItem?.img || "icons/svg/aura.svg",
  system: {
    rules,
    duration: { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" },
    start: { value: 0, initiative: null },
    description: { value: \`<ul>\${descParts.join("")}</ul>\` },
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
      fromAddIRW: FROM_TAG
    }
  }
};
await token.actor.createEmbeddedDocuments("Item", [parent]);
`
}

export function interpolatePathsSource() {
   return `
function interpolatePaths(template, scope) {
  return String(template).replace(/@([a-zA-Z_][\\w]*(?:\\.[a-zA-Z_][\\w]*)*)/g, (full, expr) => {
    const parts = expr.split(".");
    const root = parts.shift();
    let cur = scope[root];
    if (cur === undefined || cur === null) return full;
    for (const p of parts) {
      if (cur == null) return full;
      cur = cur[p];
    }
    if (cur === undefined || cur === null) return full;
    if (typeof cur === "object") {
      try { return JSON.stringify(cur); } catch (_e) { return full; }
    }
    return String(cur);
  });
}
`
}

export function enrichChatContentSource() {
   return `
async function enrichChatContent(content, relativeTo) {
  const editor =
    globalThis.CONFIG?.ux?.TextEditor ??
    globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
    globalThis.foundry?.applications?.ux?.TextEditor ??
    globalThis.TextEditor;
  if (!editor?.enrichHTML) return String(content ?? "");
  try {
    return await editor.enrichHTML(String(content ?? ""), {
      async: true,
      relativeTo,
      rollData: relativeTo?.getRollData?.() ?? {}
    });
  } catch (_e) {
    return String(content ?? "");
  }
}
`
}

export function resolveNumberSource() {
   return `
function resolveNumber(input, scope) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (input == null) return 0;
  const str = String(input).trim();
  if (str === "") return 0;
  const substituted = str.replace(/@([a-zA-Z_][\\w]*(?:\\.[a-zA-Z_][\\w]*)*)/g, (full, expr) => {
    const parts = expr.split(".");
    let cur = scope[parts.shift()];
    for (const p of parts) {
      if (cur == null) return "0";
      cur = cur[p];
    }
    if (cur == null) return "0";
    const n = Number(cur);
    return Number.isFinite(n) ? String(n) : "0";
  });
  const direct = Number(substituted);
  if (Number.isFinite(direct)) return direct;
  if (/^[\\d\\s+\\-*/().]+$/.test(substituted)) {
    try {
      const v = Function("\\"use strict\\"; return (" + substituted + ");")();
      return Number.isFinite(Number(v)) ? Number(v) : 0;
    } catch (_e) { return 0; }
  }
  return 0;
}
`
}

export function dispatchConsequenceBodySource() {
   return `
function __consequenceDcLabel(c) {
  const raw = String(c?.dc ?? "15");
  const __placer = srcItem?.actor ?? null;
  const __scope = {
    actor: __placer,
    token: token.document ?? token,
    region,
    sourceItem: srcItem,
    placer: __placer,
    target: token.actor
  };
  const resolved = resolveNumber(raw, __scope);
  return resolved ? String(resolved) : raw;
}

function __describeConsequenceForPrompt(c) {
  if (!c || !c.type) return "consequence";
  switch (c.type) {
    case "damage": {
      const ds = Array.isArray(c.damages) ? c.damages : [];
      if (ds.length === 0) return "Deal damage";
      const parts = ds.map(d => {
        const n = Number(d.diceCount) || 0;
        const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : "";
        const t = d.damageType ?? "untyped";
        return n > 0 ? \`\${n}\${die} \${t}\` : t;
      });
      return \`Deal damage (\${parts.join(", ")})\`;
    }
    case "applyEffect":      return c.uuid ? \`Apply effect (\${String(c.uuid).split(".").pop()})\` : "Apply effect";
    case "applyCondition":   return \`Apply condition: \${(c.condition?.slug) ?? "?"}\${(c.condition?.value) ? " " + c.condition.value : ""}\`;
    case "removeEffect":     return c.uuid ? \`Remove effect (\${String(c.uuid).split(".").pop()})\` : "Remove effect";
    case "removeCondition":  return \`Remove condition: \${(c.condition?.slug) ?? c.slug ?? "?"}\`;
    case "applyRuleElement": return c.label ? \`Apply rule element: \${c.label}\` : "Apply rule element";
    case "executeMacro":     return "Execute macro";
    case "savingThrow":      return \`Saving throw: \${c.save ?? "?"} DC \${__consequenceDcLabel(c)}\`;
    case "rollSkill":        return \`Roll skill: \${c.skill ?? c.lore ?? "?"} DC \${__consequenceDcLabel(c)}\`;
    case "scrollingText":    return "Scrolling text";
    case "chatMessage":
    case "sendChatMessage":  return "Send chat message";
    default: return c.type;
  }
}

${enrichChatContentSource()}

async function dispatchConsequence(c, token, srcItem, region, rollTotal) {
  switch (c.type) {
    case "damage": {
      const damages = Array.isArray(c.damages) ? c.damages : [];
      if (damages.length === 0) return;
      const parts = [];
      for (const d of damages) {
        const count = Number(d.diceCount) || 0;
        if (count <= 0 || !d.damageType) continue;
        const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : null;
        const tags = [d.damageType];
        if (d.category && d.category !== "normal") tags.push(d.category);
        const tagStr = "[" + tags.join(",") + "]";
        parts.push(die ? \`\${count}\${die}\${tagStr}\` : \`\${count}\${tagStr}\`);
      }
      if (!parts.length) return;
      const formula = parts.join(",");
      let rollOptions = [];
      try { rollOptions = srcItem?.getRollOptions?.("item") ?? []; } catch (_e) {}
      const DR = CONFIG.Dice?.rolls?.find(r => r.name === "DamageRoll") ?? Roll;
      let damageRoll;
      try {
        damageRoll = await new DR(formula, {}, { rollOptions }).evaluate({ allowInteractive: false });
      } catch (_e) {
        damageRoll = await new Roll(formula).evaluate({ allowInteractive: false });
      }
      const speaker = ChatMessage.getSpeaker({ token: token.object });
      const __priorTargets = new Set(game.user.targets);
      try { game.user.updateTokenTargets([token.object?.id ?? token.id]); } catch (_e) {}
      const __md = await damageRoll.toMessage(
        { speaker, flavor: "Save consequence damage" },
        { create: false, rollMode: game.settings.get("core", "rollMode") }
      );
      if (__md) {
        const __targetUuid = (token.document ?? token)?.uuid;
        const __actorUuid = token.actor?.uuid;
        foundry.utils.mergeObject(__md, {
          flags: {
            pf2e: {
              context: { type: "damage-roll", target: { token: __targetUuid, actor: __actorUuid } },
              target: { token: __targetUuid, actor: __actorUuid },
              origin: srcItem?.uuid ? { uuid: srcItem.uuid } : undefined
            }
          }
        });
        try { await ChatMessage.create(__md); } catch (_e) {}
      }
      try { game.user.updateTokenTargets(Array.from(__priorTargets).map(t => t.id)); } catch (_e) {}
      let autoApply = false;
      try { autoApply = game.settings.get(MODULE_ID, "applyDamageAutomatically"); } catch (_e) {}
      if (autoApply && typeof token.actor.applyDamage === "function") {
        try { await token.actor.applyDamage({ damage: damageRoll, token: token.object }); } catch (_e) {}
      }
      return;
    }
    case "applyEffect":
    case "applyCondition":
    case "applyRuleElement": {
      let grantUuid = null;
      let grantValue = null;
      const rules = [];
      if (c.type === "applyEffect") {
        if (!c.uuid) return;
        grantUuid = c.uuid;
      } else if (c.type === "applyCondition") {
        const slug = c.condition?.slug ?? c.slug;
        if (!slug) return;
        const cond = game.pf2e?.ConditionManager?.conditions?.get?.(slug);
        if (!cond) return;
        grantUuid = cond.uuid;
        if (cond.system?.value?.isValued) grantValue = Number(c.condition?.value ?? c.value) || 1;
      } else {
        const list = Array.isArray(c.rules) ? c.rules : [];
        for (const r of list) {
          if (typeof r === "string") { try { rules.push(JSON.parse(r)); } catch (_e) {} }
          else if (r && typeof r === "object") rules.push(r);
        }
        if (rules.length === 0) return;
      }
      if (grantUuid) {
        const rule = { key: "GrantItem", uuid: grantUuid, allowDuplicate: false, onDeleteActions: { grantee: "detach" } };
        if (grantValue !== null) rule.alterations = [{ mode: "override", property: "badge-value", value: grantValue }];
        rules.push(rule);
      }
      let saveDur = { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" };
      if (c.duration && c.duration.enabled) {
        const allowed = new Set(["rounds", "minutes", "hours", "days"]);
        const u = allowed.has(c.duration.unit) ? c.duration.unit : "rounds";
        saveDur = { value: Math.max(1, Number(c.duration.amount) || 1), unit: u, sustained: false, expiry: "turn-start" };
      }
      const parent = {
        type: "effect",
        name: "Effect: Save consequence",
        img: srcItem?.img || "icons/svg/aura.svg",
        system: {
          rules,
          duration: saveDur,
          start: { value: 0, initiative: null },
          description: { value: "" },
          traits: { value: [], rarity: "common" },
          level: { value: 1 },
          tokenIcon: { show: true },
          unidentified: false
        },
        flags: { [MODULE_ID]: { isParentEffect: true, appliedByRegion: region?.uuid ?? null } }
      };
      await token.actor.createEmbeddedDocuments("Item", [parent]);
      return;
    }
    case "removeEffect": {
      const uuid = c.uuid;
      if (!uuid) return;
      const matches = token.actor.items.filter(i => [i.sourceId, i._stats?.compendiumSource, i.flags?.core?.sourceId].includes(uuid));
      if (matches.length) await token.actor.deleteEmbeddedDocuments("Item", matches.map(m => m.id));
      return;
    }
    case "removeCondition": {
      const slug = c.condition?.slug ?? c.slug;
      if (!slug) return;
      const steps = Number(c.condition?.value ?? c.value);
      if (Number.isFinite(steps) && steps > 0 && typeof token.actor.decreaseCondition === "function") {
        for (let i = 0; i < steps; i++) {
          await token.actor.decreaseCondition(slug);
        }
      } else if (typeof token.actor.decreaseCondition === "function") {
        await token.actor.decreaseCondition(slug, { forceRemove: true });
      } else {
        const matches = token.actor.items.filter(i => i.type === "condition" && i.system?.slug === slug);
        if (matches.length) await token.actor.deleteEmbeddedDocuments("Item", matches.map(m => m.id));
      }
      return;
    }
    case "executeMacro": {
      if (!c.uuid) return;
      const macro = await fromUuid(c.uuid);
      if (macro?.execute) await macro.execute({ token, actor: token.actor, region });
      return;
    }
    case "chatMessage": {
      const text = c.text ?? "";
      if (!text) return;
      const speaker = ChatMessage.getSpeaker({ token: token.object });
      await ChatMessage.create({ speaker, content: text });
      return;
    }
    case "sendChatMessage": {
      const raw = c.text ?? "";
      if (!raw) return;
      const speaker = ChatMessage.getSpeaker({ token: token.object });
      let content = interpolatePaths(raw, { actor: token.actor, token: token.document ?? token, region, sourceItem: srcItem, placer: srcItem?.actor ?? null });
      content = await enrichChatContent(content, srcItem);
      let mode = "publicroll";
      if (c.blindToGm)   mode = "blindroll";
      else if (c.privateToGm) mode = "gmroll";
      const msgData = { speaker, content };
      if (mode !== "publicroll") {
        if (typeof ChatMessage.applyRollMode === "function") {
          ChatMessage.applyRollMode(msgData, mode);
        } else {
          const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
          msgData.whisper = gmIds;
          if (mode === "blindroll") msgData.blind = true;
        }
      }
      await ChatMessage.create(msgData);
      return;
    }
    case "addIRW": {
      if (!c.irwType || !c.damageType) return;
      const ruleKey = c.irwType === "immunity" ? "Immunity" : (c.irwType === "weakness" ? "Weakness" : "Resistance");
      const rule = { key: ruleKey, type: c.damageType };
      if (c.irwType !== "immunity") rule.value = Number(c.value) || 5;
      const parent = {
        type: "effect",
        name: \`Effect: \${ruleKey} \${c.damageType}\`,
        img: srcItem?.img || "icons/svg/aura.svg",
        system: {
          rules: [rule],
          duration: { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" },
          start: { value: 0, initiative: null },
          description: { value: "" },
          traits: { value: [], rarity: "common" },
          level: { value: 1 },
          tokenIcon: { show: true },
          unidentified: false
        },
        flags: { [MODULE_ID]: { isParentEffect: true, appliedByRegion: region?.uuid ?? null } }
      };
      await token.actor.createEmbeddedDocuments("Item", [parent]);
      return;
    }
    case "scrollingText": {
      const text = c.text ?? "";
      if (!text) return;
      const obj = token.object;
      if (!obj) return;
      const interface_ = canvas.interface ?? canvas.controls;
      const center = obj.center ?? { x: obj.x + obj.w/2, y: obj.y + obj.h/2 };
      try {
        interface_?.createScrollingText?.(center, text, {
          anchor: CONST.TEXT_ANCHOR_POINTS?.CENTER ?? 1,
          direction: CONST.TEXT_ANCHOR_POINTS?.TOP ?? 0,
          fontSize: c.fontSize ?? 28,
          fill: c.color ?? "#ffffff",
          stroke: 0x000000,
          strokeThickness: 4,
          jitter: 0.25
        });
      } catch (_e) {}
      return;
    }
  }
}
`
}
