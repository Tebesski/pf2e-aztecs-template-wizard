import { enrichChatContentSource, resolveNumberSource } from "./actions.mjs"
export function rollDiceScriptSource({
   diceCount,
   dieSize,
   consequences,
   target,
   sourceItemUuid,
   flavor,
}) {
   const DICE_COUNT = JSON.stringify(diceCount)
   const DIE_SIZE = JSON.stringify(dieSize)
   const CONSEQUENCES = JSON.stringify(consequences)
   const TARGET = JSON.stringify(target)
   const SRC_UUID = JSON.stringify(sourceItemUuid)
   const FLAVOR = JSON.stringify(flavor)
   return `const MODULE_ID = "pf2e-aztecs-template-wizard";
const DICE_COUNT = ${DICE_COUNT};
const DIE_SIZE = ${DIE_SIZE};
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

const formula = \`\${DICE_COUNT}d\${DIE_SIZE}\`;
if (__api?.queueRollDiceCard) {
  try {
    const queued = __api.queueRollDiceCard({
      tokenDoc: token.document ?? token,
      actor: token.actor,
      formula,
      item: srcItem,
      flavor: FLAVOR,
      consequences: CONSEQUENCES,
      regionUuid: region?.uuid ?? null
    });
    if (queued) return;
  } catch (e) {
    undefined;
  }
}
const roll = await new Roll(formula).evaluate({ allowInteractive: false });
const total = roll.total;
const speaker = ChatMessage.getSpeaker({ token: token.object });

const matched = CONSEQUENCES.filter(c => {
  const lo = Number(c.min ?? 1);
  const hi = Number(c.max ?? lo);
  return total >= Math.min(lo, hi) && total <= Math.max(lo, hi);
});

const __matchedRows = matched.length
  ? matched.map(c => \`<li>\${consequenceDescribe(c)}</li>\`).join("")
  : "<li>No matching consequence</li>";
const __rollCard = \`<div class="pf2e chat-card item-card atw-roll-card">
  <header class="card-header flexrow">
    <img src="\${srcItem?.img || "icons/svg/d20.svg"}" alt="\${FLAVOR}">
    <h3>\${FLAVOR}</h3>
  </header>
  <section class="card-content">
    <p><strong>Target:</strong> \${token.actor.name ?? token.name ?? "Token"}</p>
    <div class="dice-formula" style="text-align:center">\${formula}</div>
    <div class="dice-total" style="text-align:center;font-size:1.35em;font-weight:700">\${total}</div>
    <hr>
    <p><strong>Matched consequence\${matched.length === 1 ? "" : "s"}:</strong></p>
    <ul>\${__matchedRows}</ul>
  </section>
</div>\`;
await ChatMessage.create({
  speaker,
  content: __rollCard,
  rolls: [roll],
  flags: {
    pf2e: SOURCE_ITEM_UUID ? { origin: { uuid: SOURCE_ITEM_UUID } } : {},
    [MODULE_ID]: {
      rollDiceCard: true,
      sourceItemUuid: SOURCE_ITEM_UUID,
      regionUuid: region?.uuid ?? null,
      tokenUuid: token.document?.uuid ?? token.uuid ?? null,
      total,
      matched
    }
  }
});

let promptForApply = false;
try { promptForApply = game.settings.get(MODULE_ID, "promptGmForApply"); } catch (_e) {}
promptForApply = false;
const __grantFamily = matched.filter(c =>
  c.type === "applyEffect" || c.type === "applyCondition" || c.type === "applyRuleElement"
);
const __other = matched.filter(c =>
  !(c.type === "applyEffect" || c.type === "applyCondition" || c.type === "applyRuleElement")
);

if (__grantFamily.length > 0) {
  try {
    if (promptForApply) {
      const actorName = token.actor.name ?? token.name ?? "this actor";
      const __title = "Template Wizard — Roll Consequence";
      const __list = __grantFamily.map(c => "<li>" + consequenceDescribe(c) + "</li>").join("");
      const __content = \`<p>Apply to <strong>\${actorName}</strong> (rolled \${total}):</p><ul>\${__list}</ul>\`;
      const confirmed = await (async () => {
        const DV2 = foundry?.applications?.api?.DialogV2;
        if (DV2?.confirm) {
          try { return await DV2.confirm({ window: { title: __title }, content: __content, rejectClose: false, modal: true }); }
          catch (_e) { return false; }
        }
        try { return await Dialog.confirm({ title: __title, content: __content, defaultYes: true }); }
        catch (_e) { return false; }
      })();
      if (confirmed) await __dispatchRollGrantFamily(__grantFamily, token, srcItem, region, total);
    } else {
      await __dispatchRollGrantFamily(__grantFamily, token, srcItem, region, total);
    }
  } catch (e) {
    undefined;
  }
}

for (const cons of __other) {
  try {
    if (promptForApply && cons.type !== "scrollingText" && cons.type !== "chatMessage" && cons.type !== "sendChatMessage") {
      const consName = consequenceDescribe(cons);
      const actorName = token.actor.name ?? token.name ?? "this actor";
      const __title = "Template Wizard — Roll Consequence";
      const __content = \`<p>Apply <strong>\${consName}</strong> to <strong>\${actorName}</strong> (rolled \${total})?</p>\`;
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
    await dispatchConsequence(cons, token, srcItem, region, total);
  } catch (e) {
    undefined;
  }
}

async function __dispatchRollGrantFamily(consList, token, srcItem, region, rollTotal) {
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
    && (i.flags?.[MODULE_ID]?.triggerGroupKey ?? "") === "rollConsequence"
  ) ?? [];
  const baseName = (srcItem?.name ? \`Effect: \${srcItem.name}\` : \`Effect: Roll \${rollTotal}\`);
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
        triggerGroupKey: "rollConsequence"
      }
    }
  };
  await token.actor.createEmbeddedDocuments("Item", [parent]);
}

function consequenceDcLabel(c) {
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

function consequenceDescribe(c) {
  switch (c.type) {
    case "damage":
      if (Array.isArray(c.damages) && c.damages.length) {
        const parts = c.damages.map(d => {
          const n = Number(d.diceCount) || 0;
          const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : "";
          return n > 0 ? \`\${n}\${die} \${d.damageType ?? ""}\` : (d.damageType ?? "untyped");
        });
        return \`Deal damage (\${parts.join(", ")})\`;
      }
      return "Deal damage";
    case "applyEffect":
      return c.uuid ? \`Apply effect (\${String(c.uuid).split(".").pop()})\` : "Apply effect";
    case "applyCondition":
      return \`Apply condition: \${c.condition?.slug ?? "?"}\${c.condition?.value ? " " + c.condition.value : ""}\`;
    case "removeEffect":
      return c.uuid ? \`Remove effect (\${String(c.uuid).split(".").pop()})\` : "Remove effect";
    case "removeCondition":
      return \`Remove condition: \${c.condition?.slug ?? c.slug ?? "?"}\`;
    case "applyRuleElement":
      return c.label ? \`Apply rule element: \${c.label}\` : "Apply rule element";
    case "executeMacro": return "Execute macro";
    case "chatMessage":
    case "sendChatMessage": return "Send chat message";
    case "scrollingText": return "Scrolling text";
    case "savingThrow": return \`Saving throw: \${c.save ?? "?"} DC \${consequenceDcLabel(c)}\`;
    case "rollSkill": return \`Roll skill: \${c.skill ?? c.lore ?? "?"} DC \${consequenceDcLabel(c)}\`;
    default: return c.type ?? "consequence";
  }
}

${resolveNumberSource()}

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
        { speaker, flavor: "Roll consequence damage" },
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
          if (typeof r === "string") {
            try { rules.push(JSON.parse(r)); } catch (_e) {}
          } else if (r && typeof r === "object") {
            rules.push(r);
          }
        }
        if (rules.length === 0) return;
      }
      if (grantUuid) {
        const rule = { key: "GrantItem", uuid: grantUuid, allowDuplicate: false, onDeleteActions: { grantee: "detach" } };
        if (grantValue !== null) rule.alterations = [{ mode: "override", property: "badge-value", value: grantValue }];
        rules.push(rule);
      }
      let dur = { value: -1, unit: "unlimited", sustained: false, expiry: "turn-start" };
      if (c.duration && c.duration.enabled) {
        const allowed = new Set(["rounds", "minutes", "hours", "days"]);
        const u = allowed.has(c.duration.unit) ? c.duration.unit : "rounds";
        dur = { value: Math.max(1, Number(c.duration.amount) || 1), unit: u, sustained: false, expiry: "turn-start" };
      }
      const parent = {
        type: "effect",
        name: \`Effect: Roll \${rollTotal}\`,
        img: srcItem?.img || "icons/svg/aura.svg",
        system: {
          rules,
          duration: dur,
          start: { value: 0, initiative: null },
          description: { value: "" },
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
            fromRollConsequence: true
          }
        }
      };
      await token.actor.createEmbeddedDocuments("Item", [parent]);
      return;
    }
    case "removeEffect": {
      const uuid = c.uuid;
      if (!uuid) return;
      const matches = token.actor.items.filter(i => {
        const candidates = [i.sourceId, i._stats?.compendiumSource, i.flags?.core?.sourceId];
        return candidates.includes(uuid);
      });
      if (matches.length) {
        await token.actor.deleteEmbeddedDocuments("Item", matches.map(m => m.id));
      }
      return;
    }
    case "removeCondition": {
      const slug = c.condition?.slug ?? c.slug;
      if (!slug) return;
      if (typeof token.actor.decreaseCondition === "function") {
        await token.actor.decreaseCondition(slug, { forceRemove: true });
      } else {
        const matches = token.actor.items.filter(i => i.type === "condition" && i.system?.slug === slug);
        if (matches.length) {
          await token.actor.deleteEmbeddedDocuments("Item", matches.map(m => m.id));
        }
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
      let content = interpolatePaths(raw, {
        actor: token.actor,
        token: token.document ?? token,
        region,
        sourceItem: srcItem,
        placer: srcItem?.actor ?? null
      });
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
      const ruleKey = c.irwType === "immunity" ? "Immunity"
        : (c.irwType === "weakness" ? "Weakness" : "Resistance");
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
        flags: {
          [MODULE_ID]: {
            isParentEffect: true,
            appliedByRegion: region?.uuid ?? null,
            sourceItemUuid: SOURCE_ITEM_UUID,
            fromRollConsequence: true
          }
        }
      };
      await token.actor.createEmbeddedDocuments("Item", [parent]);
      return;
    }
    case "savingThrow": {
      const stat = c.save || "reflex";
      const __placer = srcItem?.actor ?? null;
      const __scope = {
        actor: __placer,
        token: token.document ?? token,
        region,
        sourceItem: srcItem,
        placer: __placer,
        target: token.actor
      };
      const dc = resolveNumber(String(c.dc ?? "15"), __scope) || 15;
      let result = null;
      try {
        if (__api?.requestPlayerSave) {
          result = await __api.requestPlayerSave({
            actor: token.actor,
            save: stat,
            dc,
            item: srcItem,
            extraRollOptions: [],
            flavor: FLAVOR
          });
        } else {
          const saveStat = token.actor?.saves?.[stat];
          if (!saveStat?.roll) return;
          const roll = await saveStat.roll({ dc: { value: dc }, item: srcItem ?? undefined, skipDialog: true });
          result = roll?.options?.outcome ?? roll?.outcome ?? null;
        }
      } catch (e) {
        undefined;
        return;
      }
      const outcome = typeof result === "string" ? result : (result?.options?.outcome ?? result?.outcome ?? null);
      if (!outcome) return;
      const subConsequences = Array.isArray(c.consequences) ? c.consequences : [];
      for (const sc of subConsequences) {
        const wanted = sc?.outcome ?? "failure";
        if (wanted !== outcome) continue;
        try { await dispatchConsequence(sc, token, srcItem, region, rollTotal); }
        catch (e) { undefined; }
      }
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
${enrichChatContentSource()}
`
}
