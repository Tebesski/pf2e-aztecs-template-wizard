import { MODULE_ID, DAMAGE_TYPE_VISUAL } from "../data.mjs"
import { requestPlayerChoiceDialog } from "./player-requests.mjs"
import { isTargetHelperEnabled } from "./card-queue-state.mjs"
import { queueSkillCheckCard } from "./skill-card-queue.mjs"
import {
   escapeHTML,
   getItemDescriptionHTML,
} from "./card-helpers.mjs"

export { isTargetHelperEnabled } from "./card-queue-state.mjs"
export { queueDamageCard } from "./damage-card-queue.mjs"
export { queueHealCard } from "./heal-card-queue.mjs"
export { queueSkillCheckCard } from "./skill-card-queue.mjs"

const TARGET_HELPER_QUEUE = new Map()
const ROLL_DICE_QUEUE = new Map()

export function queueRollDiceCard({
   tokenDoc,
   actor,
   formula,
   item,
   flavor,
   consequences,
   regionUuid,
}) {
   if (!isTargetHelperEnabled()) return false
   if (!tokenDoc || !actor || !formula) return false
   if (game.user.id !== game.users.activeGM?.id) return true

   const key = [
      "rollDice",
      item?.uuid ?? "noitem",
      regionUuid ?? "noregion",
      formula,
   ].join("|")
   let bucket = ROLL_DICE_QUEUE.get(key)
   if (!bucket) {
      bucket = {
         formula,
         item,
         flavor,
         consequences: Array.isArray(consequences) ? consequences : [],
         regionUuid: regionUuid ?? null,
         tokens: new Map(),
         timer: null,
      }
      ROLL_DICE_QUEUE.set(key, bucket)
   }
   bucket.tokens.set(tokenDoc.id ?? tokenDoc.uuid, tokenDoc)
   if (bucket.timer) clearTimeout(bucket.timer)
   bucket.timer = setTimeout(() => flushRollDiceBucket(key), 100)
   return true
}

async function flushRollDiceBucket(key) {
   const bucket = ROLL_DICE_QUEUE.get(key)
   if (!bucket) return
   ROLL_DICE_QUEUE.delete(key)

   try {
      const tokenDocs = Array.from(bucket.tokens.values())
      if (!tokenDocs.length) return
      const flavor = bucket.flavor || bucket.item?.name || "Dice Roll"
      const itemImg = bucket.item?.img || "icons/svg/d20.svg"
      const descriptionHTML = await getItemDescriptionHTML(bucket.item)
      const descriptionBlock = descriptionHTML
         ? `<section class="card-content atw-mtcard-description" data-auto-collapse>
        ${descriptionHTML}
      </section>`
         : ""
      const rows = tokenDocs
         .map((td) => {
            const tName = td.name ?? td.actor?.name ?? "Token"
            return `<div class="target-row atw-mtcard-target-row atw-roll-dice-target-row"
                   data-target-uuid="${escapeHTML(td.uuid)}"
                   data-rolled="false"
                   style="transition: filter 0.3s;">
        <hr>
        <div class="target-header">
          <span class="name">
            <i class="fa-solid fa-ghost"></i>
            ${escapeHTML(tName)}
          </span>
          <span class="controls" data-tooltip-class="pf2e">
            <a class="roll atw-roll-dice-roll"
               data-action="atw-roll-dice"
               data-tooltip="Roll ${escapeHTML(bucket.formula)}">
              <i class="fa-solid fa-dice-d20 die"></i>
              <span class="degree show hidden" style="cursor:pointer;"></span>
            </a>
            <a class="atw-roll-reroll hidden"
               data-action="atw-reroll-dice"
               title="Reroll">
              <i class="fa-solid fa-rotate-right fa-fw"></i>
            </a>
            <hr>
            <a class="atw-mtcard-ping" data-action="atw-ping-target" title="Ping Token">
              <i class="fa-solid fa-fw fa-signal-stream"></i>
            </a>
          </span>
        </div>
        <section class="card-content atw-roll-dice-row-details hidden"></section>
      </div>`
         })
         .join("")

      const content = `<div class="pf2e chat-card item-card atw-mtcard atw-roll-dice-card">
      <header class="card-header flexrow">
        <img src="${escapeHTML(itemImg)}" alt="${escapeHTML(flavor)}">
        <h3>${escapeHTML(flavor)}</h3>
      </header>
      ${descriptionBlock}
      <section class="card-content">
        <p><strong>Roll:</strong> <span class="dice-formula">${escapeHTML(bucket.formula)}</span></p>
      </section>
      <div class="pf2e-toolbelt-target-targetRows atw-target-targetRows atw-mtcard-targets">
        ${rows}
      </div>
    </div>`

      await ChatMessage.create({
         author: game.user.id,
         speaker: bucket.item?.actor
            ? ChatMessage.getSpeaker({ actor: bucket.item.actor })
            : { alias: flavor },
         content,
         flags: {
            pf2e: {
               origin: bucket.item?.uuid
                  ? { uuid: bucket.item.uuid }
                  : undefined,
            },
            [MODULE_ID]: {
               rollDiceCard: true,
               tokenUuids: tokenDocs.map((td) => td.uuid),
               rollDiceState: [],
               card: {
                  kind: "rollDice",
                  formula: bucket.formula,
                  flavor,
                  sourceItemUuid: bucket.item?.uuid ?? null,
                  regionUuid: bucket.regionUuid ?? null,
                  consequences: bucket.consequences,
               },
            },
         },
      })
   } catch (e) {
      undefined
   }
}

export function queueTargetHelperSave({
   tokenDoc,
   actor,
   save,
   dc,
   item,
   flavor,
   basicSave,
   damageFormula,
   consequences,
   regionUuid,
   extraRollOptions = [],
}) {
   if (!isTargetHelperEnabled()) return false
   if (!tokenDoc || !actor) return false
   if (game.user.id !== game.users.activeGM?.id) return true

   const key = [
      item?.uuid ?? "noitem",
      save ?? "?",
      String(dc ?? "?"),
      basicSave ? "b" : "n",
   ].join("|")
   let bucket = TARGET_HELPER_QUEUE.get(key)
   if (!bucket) {
      bucket = {
         save,
         dc,
         item,
         flavor,
         basicSave,
         damageFormula,
         consequences: Array.isArray(consequences) ? consequences : [],
         regionUuid: regionUuid ?? null,
         extraRollOptions: Array.isArray(extraRollOptions)
            ? extraRollOptions
            : [],
         tokens: new Map(),
         timer: null,
      }
      TARGET_HELPER_QUEUE.set(key, bucket)
   }
   bucket.tokens.set(tokenDoc.id ?? tokenDoc.uuid, tokenDoc)
   if (bucket.timer) clearTimeout(bucket.timer)
   bucket.timer = setTimeout(() => flushTargetHelperBucket(key), 100)
   return true
}

async function flushTargetHelperBucket(key) {
   const bucket = TARGET_HELPER_QUEUE.get(key)
   if (!bucket) return
   TARGET_HELPER_QUEUE.delete(key)

   try {
      const tokenDocs = Array.from(bucket.tokens.values())
      if (tokenDocs.length === 0) return

      try {
         const targetIds = tokenDocs.map((td) => td.id).filter(Boolean)
         game.user.updateTokenTargets(targetIds)
      } catch (_e) {}

      const flavor = bucket.flavor || bucket.item?.name || "Saving Throw"
      const dc = Number(bucket.dc) || 15
      const save = bucket.save || "reflex"
      const basicSave = !!bucket.basicSave

      let damageRollData = null
      if (bucket.damageFormula) {
         try {
            const DR =
               CONFIG.Dice?.rolls?.find((r) => r.name === "DamageRoll") ?? Roll
            let dRoll
            try {
               dRoll = await new DR(bucket.damageFormula, {}, {}).evaluate({
                  allowInteractive: false,
               })
            } catch (_e) {
               dRoll = await new Roll(bucket.damageFormula).evaluate({
                  allowInteractive: false,
               })
            }
            const instances = dRoll.instances
               ? dRoll.instances.map((i) => ({
                    formula:
                       i.head?.expression ?? i.formula.replace(/\[.*?\]/g, ""),
                    type: i.type ?? "untyped",
                    total: i.total,
                 }))
               : [
                    {
                       formula: bucket.damageFormula.replace(/\[.*?\]/g, ""),
                       type: "untyped",
                       total: dRoll.total,
                    },
                 ]

            damageRollData = {
               total: dRoll.total,
               formula: bucket.damageFormula,
               rollJSON: JSON.stringify(dRoll.toJSON()),
               instances,
            }
         } catch (e) {
            undefined
         }
      }

      const SAVE_LABELS = {
         fortitude: "Fortitude",
         reflex: "Reflex",
         will: "Will",
      }
      const SAVE_ICONS = {
         fortitude: "fa-solid fa-heart-pulse",
         reflex: "fa-solid fa-person-running",
         will: "fa-solid fa-brain",
      }
      const saveLabel = SAVE_LABELS[save] ?? save
      const saveIcon = SAVE_ICONS[save] ?? "fa-solid fa-shield"
      const itemImg = bucket.item?.img || "icons/svg/explosion.svg"
      const descriptionHTML = await getItemDescriptionHTML(bucket.item)
      const descriptionBlock = descriptionHTML
         ? `<section class="card-content atw-mtcard-description" data-auto-collapse>
        ${descriptionHTML}
      </section>`
         : ""

      const damageBlock = damageRollData
         ? `<section class="atw-mtcard-damage card-content">
           <div style="font-weight:700; padding-bottom:4px; border-bottom:1px solid rgba(0,0,0,0.15); margin-bottom:4px; font-size:1.05em;">Damage</div>
           <div class="dice-formula" style="background:transparent; border:none; box-shadow:none; padding:0; text-align:left;">
${damageRollData.instances
   .map((inst) => {
      const vis = DAMAGE_TYPE_VISUAL[inst.type] ?? DAMAGE_TYPE_VISUAL.untyped
      const isFlat = !/[dD+\-*/]/.test(String(inst.formula))
      const showTotal =
         !isFlat && String(inst.formula).trim() !== String(inst.total).trim()
      return `<div style="display:flex; align-items:center; margin-bottom:2px; gap:6px;">
                 <span>
                   <i class="fa-solid ${escapeHTML(vis.icon)}" style="color:${escapeHTML(vis.color)}; margin-right:4px;"></i>
                   <span style="font-weight:600;">${escapeHTML(inst.formula)}</span>
                   <span style="text-transform:capitalize; margin-left:2px;">${escapeHTML(inst.type)}</span>
                 </span>
                 ${showTotal ? `<span style="font-weight:bold;">= ${escapeHTML(inst.total)}</span>` : ""}
               </div>`
   })
   .join("")}
             <div style="display:flex; justify-content:flex-end; align-items:center; margin-top:4px; padding-top:4px; border-top:1px dashed rgba(0,0,0,0.15);">
               <span style="color:var(--rnt-accent, #c34); font-weight:bold; font-size:1.15em;">Total: ${escapeHTML(damageRollData.total)}</span>
             </div>
           </div>
         </section>`
         : ""

      const targetRows = tokenDocs
         .map((td) => {
            const tName = td.name ?? td.actor?.name ?? "Token"
            const tUuid = td.uuid
            return `<div class="target-row atw-mtcard-target-row"
                   data-target-uuid="${escapeHTML(tUuid)}"
                   data-rolled="false"
                   style="transition: filter 0.3s;">
        <hr>
        <div class="target-header">
          <span class="name">
            <i class="fa-solid fa-ghost"></i>
            ${escapeHTML(tName)}
          </span>
          <span class="controls" data-tooltip-class="pf2e">
            <a class="roll atw-mtcard-roll-save"
               data-action="atw-roll-save"
               data-statistic="${escapeHTML(save)}" data-dc="${dc}"
               data-basic="${basicSave ? "1" : "0"}"
               data-tooltip="${escapeHTML((basicSave ? "basic " : "") + saveLabel + " Saving Throw DC " + dc)}">
              <i class="save ${saveIcon}"></i>
              <i class="fa-solid fa-dice-d20 die"></i>
              <span class="degree show hidden" style="cursor:pointer;"></span>
            </a>
            <hr>
            <a class="atw-mtcard-ping" data-action="atw-ping-target" title="Ping Token">
              <i class="fa-solid fa-fw fa-signal-stream"></i>
            </a>
          </span>
        </div>
        ${
           damageRollData
              ? `
        <section class="damage-application small hidden atw-mtcard-apply" data-target-uuid="${escapeHTML(tUuid)}" style="transition: filter 0.3s;">
          <button type="button" data-action="atw-apply-damage" data-multiplier="1" title="[Click] Apply full damage to this target.">
            <i class="fa-solid fa-heart-crack fa-fw"></i><span class="label">Damage</span>
          </button>
          <button type="button" class="half-damage" data-action="atw-apply-damage" data-multiplier="0.5" title="[Click] Apply half damage to this target.">
            <i class="fa-solid fa-heart-crack fa-fw"></i><span class="label">Half</span>
          </button>
          <button type="button" data-action="atw-apply-damage" data-multiplier="2" title="[Click] Apply double damage to this target.">
            <img src="systems/pf2e/icons/damage/double.svg"><span class="label">Double</span>
          </button>
          <button type="button" data-action="atw-reroll-save" title="[Click] Reroll this saving throw.">
            <i class="fa-solid fa-rotate-right fa-fw"></i><span class="label">Reroll</span>
          </button>
        </section>`
              : ""
        }
      </div>`
         })
         .join("")

      const content = `<div class="pf2e chat-card item-card atw-mtcard">
      <header class="card-header flexrow">
        <img src="${escapeHTML(itemImg)}" alt="${escapeHTML(flavor)}">
        <h3>${escapeHTML(flavor)}</h3>
      </header>
      ${descriptionBlock}
      <section class="card-content">
        <p><strong>Defense:</strong> ${basicSave ? "basic " : ""}${escapeHTML(saveLabel)} &middot; <strong>DC ${dc}</strong></p>
      </section>
      ${damageBlock}
      <div class="pf2e-toolbelt-target-targetRows atw-target-targetRows atw-mtcard-targets">
        ${targetRows}
      </div>
    </div>`

      const chatData = {
         author: game.user.id,
         speaker: bucket.item?.actor
            ? ChatMessage.getSpeaker({ actor: bucket.item.actor })
            : { alias: flavor },
         content,
         flags: {
            pf2e: {
               origin: bucket.item?.uuid
                  ? { uuid: bucket.item.uuid }
                  : undefined,
            },
            [MODULE_ID]: {
               multiTargetCard: true,
               tokenUuids: tokenDocs.map((td) => td.uuid),

               card: {
                  save,
                  dc,
                  basicSave,
                  flavor,
                  sourceItemUuid: bucket.item?.uuid ?? null,
                  regionUuid: bucket.regionUuid ?? null,
                  consequences: Array.isArray(bucket.consequences)
                     ? bucket.consequences
                     : [],
                  damageRoll: damageRollData,
                  extraRollOptions: Array.isArray(bucket.extraRollOptions)
                     ? bucket.extraRollOptions
                     : [],
               },
            },
         },
      }
      await ChatMessage.create(chatData)
   } catch (e) {
      undefined
   }
}

const TH_CHOICE_QUEUE = new Map()

function titleCaseWords(value) {
   return String(value ?? "")
      .replace(/[-_]+/g, " ")
      .trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function loreLabel(value) {
   const base = String(value ?? "")
      .replace(/[-_\s]*lore$/i, "")
      .replace(/[-_]+/g, " ")
      .trim()
   return `${titleCaseWords(base || "Custom")} (Lore)`
}

export function queueTargetHelperChoice({
   behaviorId,
   regionUuid,
   tokenDoc,
   choices,
   sourceItemUuid,
   flavor,
   consequences,
}) {
   if (!isTargetHelperEnabled()) return false
   if (!tokenDoc) return false
   if (game.user.id !== game.users.activeGM?.id) return true

   const tokenKey = tokenDoc.uuid ?? tokenDoc.id ?? foundry.utils.randomID()
   const key = `${regionUuid ?? "noregion"}|${behaviorId ?? "nobehavior"}|${tokenKey}`
   let bucket = TH_CHOICE_QUEUE.get(key)
   if (!bucket) {
      bucket = {
         choices,
         sourceItemUuid,
         flavor,
         consequences: Array.isArray(consequences) ? consequences : [],
         regionUuid: regionUuid ?? null,
         tokens: new Map(),
         timer: null,
      }
      TH_CHOICE_QUEUE.set(key, bucket)
   }
   bucket.tokens.set(tokenDoc.id ?? tokenDoc.uuid, tokenDoc)
   if (bucket.timer) clearTimeout(bucket.timer)
   bucket.timer = setTimeout(() => flushTargetHelperChoiceBucket(key), 200)
   return true
}

async function flushTargetHelperChoiceBucket(key) {
   const bucket = TH_CHOICE_QUEUE.get(key)
   if (!bucket) return
   TH_CHOICE_QUEUE.delete(key)

   try {
      const tokenDocs = Array.from(bucket.tokens.values())
      if (tokenDocs.length === 0) return
      const choices = Array.isArray(bucket.choices) ? bucket.choices : []
      if (choices.length === 0) return

      let srcItem = null
      if (bucket.sourceItemUuid) {
         try {
            srcItem = await fromUuid(bucket.sourceItemUuid)
         } catch (_e) {}
      }
      const SKILL_LABELS = {
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
         lore: "Lore",
      }
      const SAVE_LABELS = {
         fortitude: "Fortitude",
         reflex: "Reflex",
         will: "Will",
      }
      const placerActor = srcItem?.actor ?? null
      const resolveChoiceDc = (dcExpr, fallback = 15) => {
         if (typeof dcExpr === "number" && Number.isFinite(dcExpr))
            return dcExpr
         const str = String(dcExpr ?? fallback).trim()
         const direct = Number(str)
         if (Number.isFinite(direct)) return direct
         const subbed = str.replace(
            /@([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g,
            (_full, path) => {
               const parts = path.split(".")
               let cur = null
               if (parts[0] === "placer" || parts[0] === "actor")
                  cur = placerActor
               else return "0"
               for (let i = 1; i < parts.length; i++) {
                  if (cur == null) return "0"
                  cur = cur[parts[i]]
               }
               const n = Number(cur)
               return Number.isFinite(n) ? String(n) : "0"
            },
         )
         const subbedDirect = Number(subbed)
         if (Number.isFinite(subbedDirect)) return subbedDirect
         if (/^[\d\s+\-*/().]+$/.test(subbed)) {
            try {
               const value = Function(
                  '"use strict"; return (' + subbed + ");",
               )()
               const n = Number(value)
               if (Number.isFinite(n)) return n
            } catch (_e) {}
         }
         return fallback
      }

      const buttons = choices.map((c, i) => {
         let label
         const displayDc = resolveChoiceDc(c.dc ?? 15)
         if (c.kind === "skill") {
            const skName =
               c.skill === "lore" && c.lore
                  ? loreLabel(c.lore)
                  : (SKILL_LABELS[c.skill] ?? c.skill ?? "?")
            label = `${skName} (DC ${displayDc})`
         } else {
            label = `${SAVE_LABELS[c.save] ?? c.save ?? "?"} Save (DC ${displayDc})`
         }
         return { action: `atw-c-${i}`, label, default: i === 0, idx: i }
      })

      const title = bucket.flavor
         ? `Template Wizard — ${bucket.flavor}`
         : "Template Wizard — Choice"
      const tokenNames = tokenDocs
         .map((t) => t.name ?? t.actor?.name ?? "Token")
         .join(", ")
      const content = `<p>Choose how to respond for: <strong>${tokenNames}</strong></p>`

      let chosenIdx = -1
      const DV2 = foundry?.applications?.api?.DialogV2
      const dialogActor =
         tokenDocs.find((t) => t.actor?.hasPlayerOwner)?.actor ??
         srcItem?.actor ??
         tokenDocs[0]?.actor ??
         null
      if (dialogActor || srcItem?.actor) {
         chosenIdx = await requestPlayerChoiceDialog({
            actor: dialogActor,
            title,
            content,
            choices: buttons.map((b) => ({
               label: b.label,
               value: b.idx,
               default: b.default,
            })),
            cancelValue: -1,
         })
      } else if (DV2?.wait) {
         chosenIdx = await new Promise((resolve) => {
            const buttonsCfg = buttons.map((b) => ({
               action: b.action,
               label: b.label,
               default: b.default,
               callback: () => resolve(b.idx),
            }))
            buttonsCfg.push({
               action: "cancel",
               label: game.i18n?.localize?.("PF2EATW.IO.Cancel") ?? "Cancel",
               callback: () => resolve(-1),
            })
            DV2.wait({
               window: { title },
               content,
               buttons: buttonsCfg,
               rejectClose: false,
               modal: true,
               close: () => resolve(-1),
            }).catch(() => resolve(-1))
         })
      } else if (typeof Dialog !== "undefined") {
         chosenIdx = await new Promise((resolve) => {
            const btnObj = {}
            for (let i = 0; i < buttons.length; i++) {
               btnObj["c" + i] = {
                  label: buttons[i].label,
                  callback: () => resolve(i),
               }
            }
            btnObj.cancel = {
               label: game.i18n?.localize?.("PF2EATW.IO.Cancel") ?? "Cancel",
               callback: () => resolve(-1),
            }
            new Dialog({
               title,
               content,
               buttons: btnObj,
               close: () => resolve(-1),
            }).render(true)
         })
      }
      if (chosenIdx < 0 || chosenIdx >= choices.length) return
      const chosen = choices[chosenIdx]
      const dc = resolveChoiceDc(chosen.dc ?? 15)
      if (chosen.kind === "skill") {
         const skillKey =
            chosen.skill === "lore" && chosen.lore
               ? String(chosen.lore)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
               : chosen.skill || "athletics"
         let rollOptions = []
         try {
            rollOptions = srcItem?.getRollOptions?.("item") ?? []
         } catch (_e) {}
         for (const td of tokenDocs) {
            queueSkillCheckCard({
               tokenDoc: td,
               actor: td.actor,
               skill: skillKey,
               dc,
               item: srcItem,
               flavor: bucket.flavor || srcItem?.name || "Skill Check",
               extraRollOptions: Array.isArray(rollOptions)
                  ? rollOptions
                  : [],
               consequences: Array.isArray(bucket.consequences)
                  ? bucket.consequences
                  : [],
               regionUuid: bucket.regionUuid ?? null,
               queueKey: `${key}|choice-${chosenIdx}`,
            })
         }
         return
      }
      for (const td of tokenDocs) {
         queueTargetHelperSave({
            tokenDoc: td,
            actor: td.actor,
            save: chosen.save || "reflex",
            dc,
            item: srcItem,
            flavor: bucket.flavor || srcItem?.name || "Saving Throw",
            basicSave: false,
            damageFormula: "",
            consequences: Array.isArray(bucket.consequences)
               ? bucket.consequences
               : [],
            regionUuid: bucket.regionUuid ?? null,
         })
      }
   } catch (e) {
      undefined
   }
}
