import { MODULE_ID, DAMAGE_TYPE_VISUAL } from "../data.mjs"
async function enrichChatContent(content, relativeTo = null) {
   const editor =
      globalThis.CONFIG?.ux?.TextEditor ??
      globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
      globalThis.foundry?.applications?.ux?.TextEditor ??
      globalThis.TextEditor
   if (!editor?.enrichHTML) return String(content ?? "")
   try {
      return await editor.enrichHTML(String(content ?? ""), {
         async: true,
         relativeTo,
         rollData: relativeTo?.getRollData?.() ?? {},
      })
   } catch (_e) {
      return String(content ?? "")
   }
}

async function renderRollDiceRowDetails(row, cardFlag, state) {
   const detail = row.querySelector(".atw-roll-dice-row-details")
   if (!detail) return
   const matchedIndexes = Array.isArray(state.matchedIndexes)
      ? state.matchedIndexes
      : []
   const matched = matchedIndexes
      .map((i) => ({ c: cardFlag.consequences?.[i], i }))
      .filter((x) => x.c)
   const formula = cardFlag.formula || "1d20"
   const lines = []
   const resultTooltip = "Roll result"
   lines.push(
      `<p><strong>Result:</strong> <span class="atw-roll-result" style="color:${escapeHTML(rollResultColor(state.total, formula, state.d20))};" title="${escapeHTML(resultTooltip)}" data-tooltip="${escapeHTML(resultTooltip)}">${escapeHTML(state.total ?? "")}</span></p>`,
   )
   if (!matched.length) lines.push("<p>No matching consequence.</p>")
   else {
      lines.push(`<div class="atw-card-consequences">`)
      for (const { c, i } of matched) {
         lines.push(`<section class="atw-card-consequence">`)
         if (isCardInlineMessageConsequence(c)) {
            lines.push(await inlineChatConsequenceHTML(c, row, cardFlag))
            lines.push(`</section>`)
            continue
         }
         lines.push(`<p class="atw-card-consequence-title">${escapeHTML(describeRollDiceConsequence(c, row, cardFlag))}</p>`)
         if (c.type === "savingThrow") {
            const saveState = state.saveOutcomes?.[i]
            if (saveState) {
               lines.push(
                  `<div class="atw-nested-check-result ${escapeHTML(outcomeClass(saveState.outcome))}">
                     <strong style="color:${escapeHTML(outcomeResultColor(saveState.outcome, saveState.d20))};" title="${escapeHTML(outcomeLabel(saveState.outcome))}" data-tooltip="${escapeHTML(outcomeLabel(saveState.outcome))}">${escapeHTML(saveState.total)}</strong>
                     <span>${escapeHTML(outcomeLabel(saveState.outcome))}</span>
                     <a class="atw-roll-reroll"
                        data-action="atw-reroll-dice-save"
                        data-consequence-index="${i}"
                        title="Reroll">
                        <i class="fa-solid fa-rotate-right fa-fw"></i>
                     </a>
                   </div>`,
               )
               for (const dmg of saveState.damageRolls ?? []) {
                  lines.push(rollDiceDamageBlock(dmg))
               }
               for (const heal of saveState.healingEntries ?? []) {
                  lines.push(rollDiceHealingBlock(heal))
               }
               const nestedInline = matchingOutcomeConsequences(
                  c.consequences,
                  saveState.outcome,
               ).filter(isCardInlineMessageConsequence)
               for (const inline of nestedInline) {
                  lines.push(await inlineChatConsequenceHTML(inline, row, cardFlag))
               }
            } else {
               lines.push(`<div style="margin:4px 0 6px 12px;">
                  <a class="roll atw-roll-dice-save" data-action="atw-roll-dice-save" data-consequence-index="${i}">
                    <i class="fa-solid fa-shield-halved"></i>
                    <i class="fa-solid fa-dice-d20 die"></i>
                    <span>${escapeHTML(saveLabelForKey(c.save) + " Save")}</span>
                  </a>
               </div>`)
            }
         } else if (c.type === "rollSkill") {
            const skillState = state.skillOutcomes?.[i]
            if (skillState) {
               lines.push(
                  `<div class="atw-nested-check-result ${escapeHTML(outcomeClass(skillState.outcome))}">
                     <strong style="color:${escapeHTML(outcomeResultColor(skillState.outcome, skillState.d20))};" title="${escapeHTML(outcomeLabel(skillState.outcome))}" data-tooltip="${escapeHTML(outcomeLabel(skillState.outcome))}">${escapeHTML(skillState.total)}</strong>
                     <span>${escapeHTML(outcomeLabel(skillState.outcome))}</span>
                     <a class="atw-roll-reroll"
                        data-action="atw-reroll-dice-skill"
                        data-consequence-index="${i}"
                        title="Reroll">
                        <i class="fa-solid fa-rotate-right fa-fw"></i>
                     </a>
                   </div>`,
               )
               for (const dmg of skillState.damageRolls ?? []) {
                  lines.push(rollDiceDamageBlock(dmg))
               }
               for (const heal of skillState.healingEntries ?? []) {
                  lines.push(rollDiceHealingBlock(heal))
               }
               const nestedInline = matchingOutcomeConsequences(
                  c.consequences,
                  skillState.outcome,
               ).filter(isCardInlineMessageConsequence)
               for (const inline of nestedInline) {
                  lines.push(await inlineChatConsequenceHTML(inline, row, cardFlag))
               }
            } else {
               lines.push(`<div style="margin:4px 0 6px 12px;">
                  <a class="roll atw-roll-dice-skill" data-action="atw-roll-dice-skill" data-consequence-index="${i}">
                    <i class="fa-solid fa-dice-d20 die"></i>
                    <span>${escapeHTML(skillLabelForKey(skillKeyForCard(c.skill, c.lore)) + " Check")}</span>
                  </a>
               </div>`)
            }
         }
         lines.push(`</section>`)
      }
      lines.push("</div>")
   }
   for (const dmg of state.damageRolls ?? []) {
      lines.push(rollDiceDamageBlock(dmg))
   }
   for (const heal of state.healingEntries ?? []) {
      lines.push(rollDiceHealingBlock(heal))
   }
   detail.innerHTML = lines.join("")
   detail.classList.remove("hidden")
}

async function renderSkillRowDetails(row, cardFlag, state) {
   const detail = row.querySelector(".atw-skill-row-details")
   if (!detail) return
   const consequences = Array.isArray(cardFlag.consequences)
      ? cardFlag.consequences
      : []
   const matchedIndexes = Array.isArray(state.matchedIndexes)
      ? state.matchedIndexes
      : []
   const matched = matchedIndexes
      .map((i) => consequences[i])
      .filter(Boolean)
   const lines = []
   const inline = matched.filter(isCardInlineMessageConsequence)
   if (inline.length) {
      lines.push(`<div class="atw-card-consequences">`)
      for (const c of inline) {
         lines.push(`<section class="atw-card-consequence">`)
         lines.push(await inlineChatConsequenceHTML(c, row, cardFlag))
         lines.push(`</section>`)
      }
      lines.push(`</div>`)
   }
   for (const dmg of state.damageRolls ?? []) {
      lines.push(rollDiceDamageBlock(dmg))
   }
   for (const heal of state.healingEntries ?? []) {
      lines.push(rollDiceHealingBlock(heal))
   }
   detail.innerHTML = lines.join("")
   detail.classList.toggle("hidden", lines.length === 0)
}

function rollDiceHealingBlock(heal) {
   const type = ["untyped", "vitality", "void"].includes(heal.healingType)
      ? heal.healingType
      : "untyped"
   const vis = DAMAGE_TYPE_VISUAL[type] ?? DAMAGE_TYPE_VISUAL.untyped
   return `<section class="atw-mtcard-damage card-content">
      <div class="dice-formula" style="background:transparent;border:none;box-shadow:none;padding:0;text-align:left;">
        <div style="display:flex;align-items:center;margin-bottom:2px;gap:6px;">
            <span><i class="fa-solid ${escapeHTML(vis.icon)}" style="color:${escapeHTML(vis.color)};margin-right:4px;"></i>
            <strong>${escapeHTML(heal.total ?? 0)}</strong>
            <span style="text-transform:capitalize;margin-left:2px;">${escapeHTML(type)}</span></span>
        </div>
        <div style="display:flex;justify-content:flex-end;align-items:center;margin-top:4px;padding-top:4px;border-top:1px dashed rgba(0,0,0,0.15);">
          <span style="color:var(--rnt-accent, #c34);font-weight:bold;font-size:1.15em;">Total: ${escapeHTML(heal.total ?? 0)}</span>
        </div>
      </div>
      <section class="damage-application small atw-mtcard-apply" style="transition:filter 0.3s;">
        <button type="button" data-action="atw-roll-dice-apply-healing" data-healing-id="${escapeHTML(heal.id)}" data-multiplier="1">
          <i class="fa-solid fa-heart-pulse fa-fw"></i><span class="label">Heal</span>
        </button>
        <button type="button" class="half-damage" data-action="atw-roll-dice-apply-healing" data-healing-id="${escapeHTML(heal.id)}" data-multiplier="0.5">
          <i class="fa-solid fa-heart-pulse fa-fw"></i><span class="label">Half</span>
        </button>
        <button type="button" data-action="atw-roll-dice-apply-healing" data-healing-id="${escapeHTML(heal.id)}" data-multiplier="2">
          <img src="systems/pf2e/icons/damage/double.svg"><span class="label">Double</span>
        </button>
      </section>
   </section>`
}

function rollDiceDamageBlock(dmg) {
   const instances = Array.isArray(dmg.instances) ? dmg.instances : []
   const rerollButton = dmg.rerollAction
      ? `<button type="button"
            data-action="${escapeHTML(dmg.rerollAction)}"
            ${dmg.consequenceIndex !== undefined ? `data-consequence-index="${escapeHTML(dmg.consequenceIndex)}"` : ""}
            title="[Click] Reroll the triggering check.">
          <i class="fa-solid fa-rotate-right fa-fw"></i><span class="label">Reroll</span>
        </button>`
      : ""
   const rows = instances
      .map((inst) => {
         const vis = DAMAGE_TYPE_VISUAL[inst.type] ?? DAMAGE_TYPE_VISUAL.untyped
         return `<div style="display:flex;align-items:center;margin-bottom:2px;gap:6px;">
            <span><i class="fa-solid ${escapeHTML(vis.icon)}" style="color:${escapeHTML(vis.color)};margin-right:4px;"></i>
            <strong>${escapeHTML(inst.formula)}</strong>
            <span style="text-transform:capitalize;margin-left:2px;">${escapeHTML(inst.type)}</span></span>
            <strong>= ${escapeHTML(inst.total)}</strong>
         </div>`
      })
      .join("")
   return `<section class="atw-mtcard-damage card-content">
      <div class="dice-formula" style="background:transparent;border:none;box-shadow:none;padding:0;text-align:left;">
        ${rows}
        <div style="display:flex;justify-content:flex-end;align-items:center;margin-top:4px;padding-top:4px;border-top:1px dashed rgba(0,0,0,0.15);">
          <span style="color:var(--rnt-accent, #c34);font-weight:bold;font-size:1.15em;">Total: ${escapeHTML(dmg.total)}</span>
        </div>
      </div>
      <section class="damage-application small atw-mtcard-apply" style="transition:filter 0.3s;">
        <button type="button" data-action="atw-roll-dice-apply-damage" data-damage-id="${escapeHTML(dmg.id)}" data-multiplier="1">
          <i class="fa-solid fa-heart-crack fa-fw"></i><span class="label">Damage</span>
        </button>
        <button type="button" class="half-damage" data-action="atw-roll-dice-apply-damage" data-damage-id="${escapeHTML(dmg.id)}" data-multiplier="0.5">
          <i class="fa-solid fa-heart-crack fa-fw"></i><span class="label">Half</span>
        </button>
        <button type="button" data-action="atw-roll-dice-apply-damage" data-damage-id="${escapeHTML(dmg.id)}" data-multiplier="2">
          <img src="systems/pf2e/icons/damage/double.svg"><span class="label">Double</span>
        </button>
        ${rerollButton}
      </section>
   </section>`
}

function renderSharedDamageBlock(dmg, title = "Damage") {
   const instances = Array.isArray(dmg.instances) ? dmg.instances : []
   const rows = instances
      .map((inst) => {
         const vis = DAMAGE_TYPE_VISUAL[inst.type] ?? DAMAGE_TYPE_VISUAL.untyped
         const isFlat = !/[dD+\-*/]/.test(String(inst.formula))
         const showTotal =
            !isFlat && String(inst.formula).trim() !== String(inst.total).trim()
         return `<div style="display:flex;align-items:center;margin-bottom:2px;gap:6px;">
                 <span>
                   <i class="fa-solid ${escapeHTML(vis.icon)}" style="color:${escapeHTML(vis.color)};margin-right:4px;"></i>
                   <span style="font-weight:600;">${escapeHTML(inst.formula)}</span>
                   <span style="text-transform:capitalize;margin-left:2px;">${escapeHTML(inst.type)}</span>
                 </span>
                 ${showTotal ? `<span style="font-weight:bold;">= ${escapeHTML(inst.total)}</span>` : ""}
               </div>`
      })
      .join("")
   return `<section class="atw-mtcard-damage card-content">
           <div style="font-weight:700;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,0.15);margin-bottom:4px;font-size:1.05em;">${escapeHTML(title)}</div>
           <div class="dice-formula" style="background:transparent;border:none;box-shadow:none;padding:0;text-align:left;">
             ${rows}
             <div style="display:flex;justify-content:flex-end;align-items:center;margin-top:4px;padding-top:4px;border-top:1px dashed rgba(0,0,0,0.15);">
               <span style="color:var(--rnt-accent, #c34);font-weight:bold;font-size:1.15em;">Total: ${escapeHTML(dmg.total)}</span>
             </div>
           </div>
         </section>`
}

async function rollDamageConsequence(c) {
   const formula = damageConsequenceFormula(c)
   return rollDamageFormula(formula)
}

async function rollDamageFormula(formula, rollOptions = []) {
   if (!formula) return null
   try {
      const DR = CONFIG.Dice?.rolls?.find((r) => r.name === "DamageRoll") ?? Roll
      let roll
      try {
         roll = await new DR(formula, {}, { rollOptions }).evaluate({
            allowInteractive: false,
         })
      } catch (_e) {
         roll = await new Roll(formula).evaluate({ allowInteractive: false })
      }
      const instances = roll.instances
         ? roll.instances.map((i) => ({
              formula: i.head?.expression ?? i.formula.replace(/\[.*?\]/g, ""),
              type: i.type ?? "untyped",
              total: i.total,
           }))
         : [
              {
                 formula: formula.replace(/\[.*?\]/g, ""),
                 type: "untyped",
                 total: roll.total,
              },
           ]
      return {
         total: roll.total,
         formula,
         rollJSON: JSON.stringify(roll.toJSON()),
         instances,
      }
   } catch (e) {
      undefined
      return null
   }
}

function isCardInlineMessageConsequence(c) {
   return c?.type === "sendChatMessage" || c?.type === "chatMessage"
}

function matchingOutcomeConsequences(consequences, outcome) {
   return Array.isArray(consequences)
      ? consequences.filter((c) => (c?.outcome ?? "failure") === outcome)
      : []
}

async function inlineChatConsequenceHTML(c, row, cardFlag) {
   const raw = String(c?.text ?? "").trim()
   if (!raw) return `<div class="atw-inline-message muted">No message text.</div>`
   const { sourceItem, tokenDoc, region } = cardContext(row, cardFlag)
   const content = interpolateCardText(raw, {
      actor: tokenDoc?.actor ?? null,
      token: tokenDoc,
      region,
     sourceItem,
     placer: sourceItem?.actor ?? null,
     target: tokenDoc?.actor ?? null,
     targetToken: tokenDoc,
  })
   const enriched = await enrichChatContent(content, sourceItem)
   return `<div class="atw-inline-message">${enriched}</div>`
}

function interpolateCardText(raw, scope) {
   return String(raw ?? "").replace(
      /@([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g,
      (full, path) => {
         const parts = path.split(".")
         let cur = scope[parts.shift()]
         if (cur == null) return full
         for (const part of parts) {
            if (cur == null) return full
            cur = cur[part]
         }
         return cur == null ? full : String(cur)
      },
   )
}

function cardContext(row, cardFlag) {
   const getSync = (uuid) => {
      if (!uuid || typeof fromUuidSync !== "function") return null
      try {
         return fromUuidSync(uuid)
      } catch (_e) {
         return null
      }
   }
   return {
      tokenDoc: getSync(row?.dataset?.targetUuid),
      sourceItem: getSync(cardFlag?.sourceItemUuid),
      region: getSync(cardFlag?.regionUuid),
   }
}

function resolveConsequenceDcForCard(c, row, cardFlag) {
   const { tokenDoc, sourceItem, region } = cardContext(row, cardFlag)
   return resolveRuntimeNumber(c?.dc ?? 15, { tokenDoc, sourceItem, region })
}

function saveLabelForKey(save) {
   return (
      {
         fortitude: "Fortitude",
         reflex: "Reflex",
         will: "Will",
      }[save] ?? String(save ?? "Save")
   )
}

function outcomeLabel(outcome) {
   return (
      {
         criticalSuccess: "Critical Success",
         success: "Success",
         failure: "Failure",
         criticalFailure: "Critical Failure",
      }[outcome] ?? outcome ?? ""
   )
}

function outcomeClass(outcome) {
   return (
      {
         criticalSuccess: "critical-success",
         success: "success",
         failure: "failure",
         criticalFailure: "critical-failure",
      }[outcome] ?? ""
   )
}

function outcomeColor(outcome) {
   return (
      {
         criticalSuccess: "#15803d",
         success: "#287a31",
         failure: "#b45309",
         criticalFailure: "#b91c1c",
      }[outcome] ?? "var(--color-text-primary, currentColor)"
   )
}

function rollTotalColor(total, formula = "") {
   const n = Number(total)
   if (!Number.isFinite(n)) return "var(--color-text-primary, currentColor)"
   const normalizedFormula = String(formula ?? "").replace(/\s+/g, "").toLowerCase()
   if (normalizedFormula === "1d8") {
      return (
         {
            1: "#c62828",
            2: "#d97706",
            3: "#b58900",
            4: "#2e7d32",
            5: "#1565c0",
            6: "#4f46e5",
            7: "#7b1fa2",
            8: "#ad1457",
         }[n] ?? "var(--color-text-primary, currentColor)"
      )
   }
   const match = normalizedFormula.match(/^1d(\d+)$/)
   if (match) {
      const sides = Number(match[1])
      if (n === 1) return "#b91c1c"
      if (n === sides) return "#15803d"
      if (n <= Math.ceil(sides / 3)) return "#b45309"
      if (n >= Math.floor((sides * 2) / 3)) return "#287a31"
   }
   return "var(--color-text-hyperlink, #5e2ea0)"
}

function naturalD20Color(d20, fallback = "var(--color-text-primary, currentColor)") {
   const natural = Number(d20)
   if (natural === 20) return "#15803d"
   if (natural === 1) return "#b91c1c"
   return fallback
}

function outcomeResultColor(outcome, d20 = null) {
   return naturalD20Color(d20, outcomeColor(outcome))
}

function rollResultColor(total, formula = "", d20 = null) {
   return naturalD20Color(d20, rollTotalColor(total, formula))
}

function skillKeyForCard(skill, lore) {
   if (skill === "lore" && lore) {
      return String(lore)
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, "-")
         .replace(/^-+|-+$/g, "")
   }
   return skill || "athletics"
}

function titleCaseWords(value) {
   return String(value ?? "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function loreLabelForKey(skill) {
   const base = String(skill ?? "")
      .replace(/[-_\s]*lore$/i, "")
      .replace(/[-_]+/g, " ")
      .trim()
   return `${titleCaseWords(base || "Custom")} (Lore)`
}

function skillLabelForKey(skill) {
   const labels = {
      acrobatics: "Acrobatics",
      arcana: "Arcana",
      athletics: "Athletics",
      crafting: "Crafting",
      deception: "Deception",
      diplomacy: "Diplomacy",
      intimidation: "Intimidation",
      medicine: "Medicine",
      nature: "Nature",
      occultism: "Occultism",
      performance: "Performance",
      religion: "Religion",
      society: "Society",
      stealth: "Stealth",
      survival: "Survival",
      thievery: "Thievery",
      perception: "Perception",
   }
   const key = String(skill ?? "")
   if (key === "lore") return "Lore"
   if (/[-_\s]*lore$/i.test(key)) return loreLabelForKey(key)
   return labels[key] ?? titleCaseWords(key || "Skill")
}

async function rollSkillForCard({
   actor,
   skill,
   dc,
   item,
   extraRollOptions = [],
   flavor,
}) {
   const stat =
      skill === "perception"
         ? actor?.perception ?? actor?.skills?.perception
         : actor?.skills?.[skill]
   if (!stat?.roll) {
      ui.notifications?.warn(`Actor "${actor?.name}" has no "${skill}" skill.`)
      return null
   }
   return stat.roll({
      dc: { value: Number(dc) || 15 },
      item: item ?? undefined,
      extraRollOptions: Array.isArray(extraRollOptions)
         ? extraRollOptions
         : [],
      flavor,
      createMessage: false,
   })
}

function damageConsequenceFormula(c) {
   const damages = Array.isArray(c?.damages) ? c.damages : []
   const parts = []
   for (const d of damages) {
      const count = Number(d.diceCount) || 0
      if (count <= 0 || !d.damageType) continue
      const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : null
      const tags = [d.damageType]
      if (d.category && d.category !== "normal") tags.push(d.category)
      const tagStr = `[${tags.join(",")}]`
      parts.push(die ? `${count}${die}${tagStr}` : `${count}${tagStr}`)
   }
   return parts.join(",")
}

function describeRollDiceConsequence(c, row = null, cardFlag = null) {
   if (!c) return "Consequence"
   if (c.type === "damage") return "Damage"
   if (c.type === "heal") return `Heal (${c.amount ?? 0} ${c.healingType ?? "untyped"})`
   if (c.type === "move") return `Move ${c.direction === "toward" ? "toward centre" : "away from centre"} (${c.distance ?? 0} ft)`
   if (c.type === "savingThrow")
      return `${saveLabelForKey(c.save)} Save (DC ${resolveConsequenceDcForCard(c, row, cardFlag)})`
   if (c.type === "rollSkill")
      return `${skillLabelForKey(skillKeyForCard(c.skill, c.lore))} Check (DC ${resolveConsequenceDcForCard(c, row, cardFlag)})`
   if (c.type === "applyCondition")
      return `Apply condition: ${c.condition?.slug ?? c.slug ?? "?"}`
   if (c.type === "removeCondition")
      return `Remove condition: ${c.condition?.slug ?? c.slug ?? "?"}`
   if (c.type === "applyEffect") return "Apply effect"
   if (c.type === "removeEffect") return "Remove effect"
   if (c.type === "applyRuleElement") return "Apply rule element"
   if (c.type === "sendChatMessage" || c.type === "chatMessage")
      return "Send chat message"
   if (c.type === "executeMacro") return "Execute macro"
   if (c.type === "scrollingText") return "Scrolling text"
   return c.type ?? "Consequence"
}

function resolveRuntimeNumber(expr, { tokenDoc, sourceItem, region }) {
   if (typeof expr === "number" && Number.isFinite(expr)) return expr
   const raw = String(expr ?? "15").trim()
   const direct = Number(raw)
   if (Number.isFinite(direct)) return direct
   const scope = {
      actor: sourceItem?.actor ?? null,
      placer: sourceItem?.actor ?? null,
     sourceItem,
     token: tokenDoc,
     target: tokenDoc?.actor ?? null,
     targetToken: tokenDoc,
     region,
  }
   const substituted = raw.replace(
      /@([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g,
      (_full, path) => {
         const parts = path.split(".")
         let cur = scope[parts.shift()]
         for (const part of parts) {
            if (cur == null) return "0"
            cur = cur[part]
         }
         const n = Number(cur)
         return Number.isFinite(n) ? String(n) : "0"
      },
   )
   const substitutedDirect = Number(substituted)
   if (Number.isFinite(substitutedDirect)) return substitutedDirect
   if (/^[\d\s+\-*/().]+$/.test(substituted)) {
      try {
         const value = Function('"use strict"; return (' + substituted + ");")()
         const n = Number(value)
         if (Number.isFinite(n)) return n
      } catch (_e) {}
   }
   return 15
}

async function getItemDescriptionHTML(item) {
   const raw = item?.system?.description?.value ?? item?.description ?? ""
   if (!item || !String(raw).trim()) return ""

   if (typeof item.getDescription === "function") {
      try {
         const desc = await item.getDescription({
            async: true,
            secrets: false,
         })
         const value = String(desc?.value ?? "").trim()
         if (value) return value
      } catch (e) {
         undefined
      }
   }

   try {
      const editor =
         globalThis.CONFIG?.ux?.TextEditor ??
         globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
         globalThis.foundry?.applications?.ux?.TextEditor ??
         globalThis.TextEditor
      if (editor?.enrichHTML) {
         const rollData =
            typeof item.getRollData === "function" ? item.getRollData() : {}
         return String(
            await editor.enrichHTML(String(raw), {
               async: true,
               rollData,
               secrets: false,
            }),
         ).trim()
      }
   } catch (e) {
      undefined
   }

   return String(raw).trim()
}

function escapeHTML(s) {
   return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
}

export {
   damageConsequenceFormula,
   describeRollDiceConsequence,
   enrichChatContent,
   escapeHTML,
   getItemDescriptionHTML,
   inlineChatConsequenceHTML,
   isCardInlineMessageConsequence,
   matchingOutcomeConsequences,
   outcomeClass,
   outcomeColor,
   outcomeLabel,
   outcomeResultColor,
   renderRollDiceRowDetails,
   renderSharedDamageBlock,
   renderSkillRowDetails,
   resolveRuntimeNumber,
   rollDamageConsequence,
   rollDamageFormula,
   rollResultColor,
   rollSkillForCard,
   rollTotalColor,
   saveLabelForKey,
   skillKeyForCard,
   skillLabelForKey,
}
