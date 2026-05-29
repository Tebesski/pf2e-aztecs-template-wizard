import { MODULE_ID } from "../data.mjs"
import { executeAsGM } from "./socketlib.mjs"
import { extractSaveOutcome } from "./player-requests.mjs"
import {
   isCardInlineMessageConsequence,
   outcomeColor,
   renderRollDiceRowDetails,
   renderSkillRowDetails,
   resolveRuntimeNumber,
   rollDamageConsequence,
   rollSkillForCard,
   rollTotalColor,
   skillKeyForCard,
} from "./card-helpers.mjs"
import {
   SAVE_OUTCOME_CLASSES,
   applyCardDamageToTarget,
   cleanupRuntimeConsequencesForTarget,
   gmApplyRuntimeConsequences,
} from "./card-runtime-actions.mjs"

const CARD_TARGET_OWNER_ACTIONS = new Set([
   "atw-roll-save",
   "atw-reroll-save",
   "atw-roll-dice",
   "atw-reroll-dice",
   "atw-roll-dice-save",
   "atw-reroll-dice-save",
   "atw-roll-dice-skill",
   "atw-reroll-dice-skill",
   "atw-roll-dice-apply-damage",
   "atw-roll-skill",
   "atw-reroll-skill",
   "atw-apply-damage",
])

export function installMultiTargetCardListeners() {
   if (typeof document === "undefined") return
   if (window.__ATW_MTCARD_LISTENER_INSTALLED) return
   window.__ATW_MTCARD_LISTENER_INSTALLED = true
   document.addEventListener(
      "click",
      async (ev) => {
         const action = ev.target.closest?.("[data-action]")?.dataset?.action
         if (!action || !action.startsWith("atw-")) return
         const btn = ev.target.closest("[data-action]")
         const card = btn.closest(".atw-mtcard")
         if (!card) return
         const msgLi = btn.closest("[data-message-id]")
         const messageId = msgLi?.dataset.messageId
         if (!messageId) return
         const msg = game.messages.get(messageId)
         if (!msg) return
         const cardFlag = msg.getFlag?.(MODULE_ID, "card")
         if (!cardFlag) return
         ev.preventDefault()
         ev.stopPropagation()
         if (
            CARD_TARGET_OWNER_ACTIONS.has(action) &&
            !(await canOperateCardTarget(btn))
         ) {
            ui.notifications?.warn(
               "You can only use Template Wizard card controls for actors you own.",
            )
            return
         }
         try {
            if (action === "atw-roll-save")
               await onMTCardRollSave(btn, card, msg, cardFlag)
            else if (action === "atw-roll-dice")
               await onRollDiceCardRoll(btn, card, msg, cardFlag)
            else if (action === "atw-reroll-dice")
               await onRollDiceCardRoll(btn, card, msg, cardFlag, true)
            else if (action === "atw-roll-dice-save")
               await onRollDiceCardSave(btn, card, msg, cardFlag)
            else if (action === "atw-reroll-dice-save")
               await onRollDiceCardSave(btn, card, msg, cardFlag, true)
            else if (action === "atw-roll-dice-skill")
               await onRollDiceCardSkill(btn, card, msg, cardFlag)
            else if (action === "atw-reroll-dice-skill")
               await onRollDiceCardSkill(btn, card, msg, cardFlag, true)
            else if (action === "atw-roll-dice-apply-damage")
               await onRollDiceCardApplyDamage(btn, card, msg, cardFlag)
            else if (action === "atw-roll-skill")
               await onSkillCardRoll(btn, card, msg, cardFlag)
            else if (action === "atw-reroll-skill")
               await onSkillCardRoll(btn, card, msg, cardFlag, true)
            else if (action === "atw-apply-damage")
               await onMTCardApplyDamage(btn, card, msg, cardFlag)
            else if (action === "atw-ping-target") await onMTCardPing(btn)
            else if (action === "atw-reroll-save")
               await onMTCardRerollSave(btn, card, msg, cardFlag)
         } catch (e) {
            console.error(
               `[${MODULE_ID}] multi-target card action ${action} failed`,
               e,
            )
         }
      },
      true,
   )
}

async function canOperateCardTarget(btn) {
   if (game.user?.isGM) return true
   const targetUuid = btn.closest(".target-row")?.dataset?.targetUuid
   if (!targetUuid) return false
   const tokenDoc = await fromUuid(targetUuid).catch(() => null)
   const actor = tokenDoc?.actor
   return !!actor?.testUserPermission?.(game.user, "OWNER")
}

async function onMTCardRollSave(btn, card, msg, cardFlag, isReroll = false) {
   const row = btn.closest(".target-row")
   if (!row) return
   if (!isReroll && row.dataset.rolled === "true") return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return
   const actor = tDoc.actor
   if (!game.user.isGM && !actor.testUserPermission?.(game.user, "OWNER"))
      return
   const statistic = cardFlag.save
   const dc = Number(cardFlag.dc) || 15

   const saveStat = actor.saves?.[statistic]
   if (!saveStat?.roll) return

   const saveRoll = await saveStat.roll({
      dc: { value: dc },
      createMessage: false,
      extraRollOptions: cardFlag.basicSave ? ["damaging-effect"] : [],
   })
   if (!saveRoll) return

   const d20 = saveRoll.dice?.[0]?.total

   if (isReroll) {
      try {
         if (game.user.isGM) {
            await cleanupRuntimeConsequencesForTarget(targetUuid, msg.id)
         } else {
            await executeAsGM("cleanupRuntimeConsequences", {
               targetUuid,
               messageId: msg.id,
            })
         }
      } catch (e) {
         console.warn(
            `[${MODULE_ID}] Failed to clean up previous consequences on reroll`,
            e,
         )
      }
      row.classList.remove("crit-success-row")
      const apply = row.querySelector(".damage-application")
      if (apply) {
         apply.classList.remove(
            "critical-success",
            "success",
            "failure",
            "critical-failure",
         )
         apply.style.filter = ""
      }
   }

   let dos = saveRoll.degreeOfSuccess?.value ?? saveRoll.degreeOfSuccess ?? 1

   if (d20 === 20) dos = 3
   else if (d20 === 1) dos = 0

   const dosLabel = SAVE_OUTCOME_CLASSES[dos] ?? "failure"
   row.dataset.rolled = "true"
   row.dataset.outcome = dosLabel
   if (dosLabel === "critical-success") {
      row.classList.add("crit-success-row")
   }

   const degree = btn.querySelector(".degree")
   if (degree) {
      degree.textContent = String(saveRoll.total)
      degree.classList.remove(
         "hidden",
         "nat20",
         "nat1",
         "critical-success",
         "success",
         "failure",
         "critical-failure",
      )
      degree.style.color = ""
      degree.classList.add("show", dosLabel)

      if (d20 === 20) {
         degree.classList.add("nat20")
         degree.style.color = "var(--color-text-success, #18520b)"
      } else if (d20 === 1) {
         degree.classList.add("nat1")
         degree.style.color = "var(--color-text-error, #b81a1a)"
      }

      const die = btn.querySelector(".die")
      if (die) die.classList.add("hidden")
   }

   const apply = row.querySelector(".damage-application")
   if (apply) {
      apply.classList.remove("hidden")
      apply.classList.add(dosLabel)
      apply.dataset.outcome = dosLabel
   }

   if (
      Array.isArray(cardFlag.consequences) &&
      cardFlag.consequences.length > 0
   ) {
      const outcomeKey = {
         0: "criticalFailure",
         1: "failure",
         2: "success",
         3: "criticalSuccess",
      }[dos]
      const matched = cardFlag.consequences.filter(
         (c) => c.outcome === outcomeKey,
      )
      if (matched.length) {
         const payload = {
            consequences: matched,
            targetUuid,
            sourceItemUuid: cardFlag.sourceItemUuid ?? null,
            flavor: cardFlag.flavor ?? null,
            regionUuid: cardFlag.regionUuid ?? null,
            messageId: msg.id,
         }
         try {
            if (game.user.isGM) await gmApplyRuntimeConsequences(payload)
            else await executeAsGM("applyRuntimeConsequences", payload)
         } catch (e) {
            console.warn(`[${MODULE_ID}] MTcard consequence dispatch failed`, e)
         }
      }
   }
}

async function onMTCardRerollSave(btn, card, msg, cardFlag) {
   const row = btn.closest(".target-row")
   if (!row) return
   const rollBtn = row.querySelector(".atw-mtcard-roll-save")
   if (!rollBtn) return

   await onMTCardRollSave(rollBtn, card, msg, cardFlag, true)
}

async function onMTCardApplyDamage(btn, card, msg, cardFlag) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const multiplier = Number(btn.dataset.multiplier)
   if (!Number.isFinite(multiplier)) return
   const dmg = cardFlag.damageRoll
   if (!dmg) return

   try {
      if (game.user.isGM) {
         await applyCardDamageToTarget(targetUuid, dmg, multiplier)
      } else {
         await executeAsGM("applyCardDamage", {
            targetUuid,
            damageRoll: dmg,
            multiplier,
         })
      }
   } catch (e) {
      console.warn(`[${MODULE_ID}] applyDamage failed`, e)
   }

   const apply = btn.closest(".damage-application")
   if (apply) {
      apply.style.filter = "blur(1px) opacity(0.55)"
   }
   await persistCardContent(msg, card)
}

async function onMTCardPing(btn) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   const tObj = tDoc?.object ?? tDoc?.rendered
   if (!tObj) return
   try {
      canvas?.ping?.(tObj.center ?? { x: tDoc.x, y: tDoc.y })
   } catch (_e) {}
}

async function onMTCardRollAllNPC(card, msg, cardFlag) {
   if (!game.user.isGM) return
   const rows = Array.from(card.querySelectorAll(".atw-mtcard-target-row"))
   for (const row of rows) {
      if (row.dataset.rolled === "true") continue
      const tDoc = await fromUuid(row.dataset.targetUuid)
      if (!tDoc?.actor) continue
      if (tDoc.actor.hasPlayerOwner) continue
      const btn = row.querySelector(".atw-mtcard-roll-save")
      if (!btn) continue
      try {
         await onMTCardRollSave(btn, card, msg, cardFlag)
      } catch (_e) {}
   }
}

const ROLL_DICE_CLIENT_STATE = new Map()

async function onRollDiceCardRoll(btn, card, msg, cardFlag, isReroll = false) {
   const row = btn.closest(".target-row")
   if (!row || (!isReroll && row.dataset.rolled === "true")) return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return
   const formula = cardFlag.formula || "1d20"
   const roll = await new Roll(formula).evaluate({ allowInteractive: false })
   const total = Number(roll.total) || 0
   const matchedIndexes = (
      Array.isArray(cardFlag.consequences) ? cardFlag.consequences : []
   )
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
         const lo = Number(c.min ?? 1)
         const hi = Number(c.max ?? lo)
         return total >= Math.min(lo, hi) && total <= Math.max(lo, hi)
      })
      .map(({ i }) => i)

   row.dataset.rolled = "true"
   row.dataset.total = String(total)
   row.dataset.matchedIndexes = matchedIndexes.join(",")
   const rollBtn = row.querySelector(".atw-roll-dice-roll") ?? btn
   const degree = rollBtn.querySelector(".degree")
   if (degree) {
      degree.textContent = String(total)
      degree.style.color = rollTotalColor(total, formula)
      degree.classList.remove("hidden")
      rollBtn.querySelector(".die")?.classList.add("hidden")
   }
   row.querySelector(".atw-roll-reroll")?.classList.remove("hidden")

   const state = getRollDiceState(msg, targetUuid)
   state.total = total
   state.matchedIndexes = matchedIndexes
   state.damageRolls = []
   state.saveOutcomes = {}
   state.skillOutcomes = {}

   const matched = matchedIndexes.map((i) => cardFlag.consequences[i])
   const damageRolls = []
   for (let i = 0; i < matched.length; i++) {
      const c = matched[i]
      if (c?.type !== "damage") continue
      const damageRoll = await rollDamageConsequence(c)
      if (damageRoll) {
         damageRolls.push({
            id: foundry.utils.randomID(),
            consequenceIndex: matchedIndexes[i],
            rerollAction: "atw-reroll-dice",
            ...damageRoll,
         })
      }
   }
   state.damageRolls = damageRolls
   await setRollDiceState(msg, targetUuid, state)

   const immediate = matched.filter(
      (c) =>
         c?.type !== "damage" &&
         c?.type !== "savingThrow" &&
         c?.type !== "rollSkill" &&
         !isCardInlineMessageConsequence(c),
   )
   if (immediate.length) {
      const payload = {
         consequences: immediate,
         targetUuid,
         sourceItemUuid: cardFlag.sourceItemUuid ?? null,
         flavor: cardFlag.flavor ?? null,
         regionUuid: cardFlag.regionUuid ?? null,
         messageId: msg.id,
      }
      if (game.user.isGM) await gmApplyRuntimeConsequences(payload)
      else await executeAsGM("applyRuntimeConsequences", payload)
   }

   await renderRollDiceRowDetails(row, cardFlag, state)
   await persistRollDiceCard(msg, card, targetUuid, state)
}

async function onRollDiceCardSave(btn, card, msg, cardFlag, isReroll = false) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return
   const consequenceIndex = Number(btn.dataset.consequenceIndex)
   const consequence = cardFlag.consequences?.[consequenceIndex]
   if (!consequence || consequence.type !== "savingThrow") return

   const actor = tDoc.actor
   const stat = consequence.save || "reflex"
   const saveStat = actor.saves?.[stat]
   if (!saveStat?.roll) return
   const srcItem = cardFlag.sourceItemUuid
      ? await fromUuid(cardFlag.sourceItemUuid).catch(() => null)
      : null
   const region = cardFlag.regionUuid
      ? await fromUuid(cardFlag.regionUuid).catch(() => null)
      : null
   const dc = resolveRuntimeNumber(consequence.dc ?? 15, {
      tokenDoc: tDoc,
      sourceItem: srcItem,
      region,
   })
   const saveRoll = await saveStat.roll({
      dc: { value: dc },
      item: srcItem ?? undefined,
      createMessage: false,
   })
   if (!saveRoll) return
   let dos = saveRoll.degreeOfSuccess?.value ?? saveRoll.degreeOfSuccess ?? 1
   const d20 = saveRoll.dice?.[0]?.total
   if (d20 === 20) dos = 3
   else if (d20 === 1) dos = 0
   const outcome = {
      0: "criticalFailure",
      1: "failure",
      2: "success",
      3: "criticalSuccess",
   }[dos]
   if (!outcome) return

   const nested = Array.isArray(consequence.consequences)
      ? consequence.consequences.filter(
           (c) => (c?.outcome ?? "failure") === outcome,
        )
      : []
   const state = getRollDiceState(msg, targetUuid)
   state.saveOutcomes ??= {}
   state.saveOutcomes[consequenceIndex] = {
      outcome,
      total: saveRoll.total,
      dc,
      save: stat,
      damageRolls: [],
   }

   const nestedDamageRolls = []
   for (const c of nested) {
      if (c?.type !== "damage") continue
      const damageRoll = await rollDamageConsequence(c)
      if (damageRoll) {
         nestedDamageRolls.push({
            id: foundry.utils.randomID(),
            consequenceIndex,
            rerollAction: "atw-reroll-dice-save",
            ...damageRoll,
         })
      }
   }
   state.saveOutcomes[consequenceIndex].damageRolls = nestedDamageRolls
   await setRollDiceState(msg, targetUuid, state)

   const immediate = nested.filter(
      (c) => c?.type !== "damage" && !isCardInlineMessageConsequence(c),
   )
   if (immediate.length) {
      const payload = {
         consequences: immediate,
         targetUuid,
         sourceItemUuid: cardFlag.sourceItemUuid ?? null,
         flavor: cardFlag.flavor ?? null,
         regionUuid: cardFlag.regionUuid ?? null,
         messageId: msg.id,
      }
      if (game.user.isGM) await gmApplyRuntimeConsequences(payload)
      else await executeAsGM("applyRuntimeConsequences", payload)
   }

   await renderRollDiceRowDetails(row, cardFlag, state)
   await persistRollDiceCard(msg, card, targetUuid, state)
}

async function onRollDiceCardSkill(btn, card, msg, cardFlag, isReroll = false) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return
   const consequenceIndex = Number(btn.dataset.consequenceIndex)
   const consequence = cardFlag.consequences?.[consequenceIndex]
   if (!consequence || consequence.type !== "rollSkill") return

   const srcItem = cardFlag.sourceItemUuid
      ? await fromUuid(cardFlag.sourceItemUuid).catch(() => null)
      : null
   const region = cardFlag.regionUuid
      ? await fromUuid(cardFlag.regionUuid).catch(() => null)
      : null
   const dc = resolveRuntimeNumber(consequence.dc ?? 15, {
      tokenDoc: tDoc,
      sourceItem: srcItem,
      region,
   })
   const skillKey = skillKeyForCard(consequence.skill, consequence.lore)
   const result = await rollSkillForCard({
      actor: tDoc.actor,
      skill: skillKey,
      dc,
      item: srcItem,
      extraRollOptions: consequence.extraRollOptions ?? [],
      flavor: cardFlag.flavor ?? null,
   })
   const outcome = extractSaveOutcome(result)
   if (!outcome) return

   const nested = Array.isArray(consequence.consequences)
      ? consequence.consequences.filter(
           (c) => (c?.outcome ?? "failure") === outcome,
        )
      : []
   const state = getRollDiceState(msg, targetUuid)
   state.skillOutcomes ??= {}
   state.skillOutcomes[consequenceIndex] = {
      outcome,
      total: result?.total ?? "",
      dc,
      skill: skillKey,
      damageRolls: [],
   }

   const nestedDamageRolls = []
   for (const c of nested) {
      if (c?.type !== "damage") continue
      const damageRoll = await rollDamageConsequence(c)
      if (damageRoll) {
         nestedDamageRolls.push({
            id: foundry.utils.randomID(),
            consequenceIndex,
            rerollAction: "atw-reroll-dice-skill",
            ...damageRoll,
         })
      }
   }
   state.skillOutcomes[consequenceIndex].damageRolls = nestedDamageRolls
   await setRollDiceState(msg, targetUuid, state)

   const immediate = nested.filter(
      (c) => c?.type !== "damage" && !isCardInlineMessageConsequence(c),
   )
   if (immediate.length) {
      const payload = {
         consequences: immediate,
         targetUuid,
         sourceItemUuid: cardFlag.sourceItemUuid ?? null,
         flavor: cardFlag.flavor ?? null,
         regionUuid: cardFlag.regionUuid ?? null,
         messageId: msg.id,
      }
      if (game.user.isGM) await gmApplyRuntimeConsequences(payload)
      else await executeAsGM("applyRuntimeConsequences", payload)
   }

   await renderRollDiceRowDetails(row, cardFlag, state)
   await persistRollDiceCard(msg, card, targetUuid, state)
}

async function onSkillCardRoll(btn, card, msg, cardFlag, isReroll = false) {
   const row = btn.closest(".target-row")
   if (!row || (!isReroll && row.dataset.rolled === "true")) return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return

   const srcItem = cardFlag.sourceItemUuid
      ? await fromUuid(cardFlag.sourceItemUuid).catch(() => null)
      : null
   const region = cardFlag.regionUuid
      ? await fromUuid(cardFlag.regionUuid).catch(() => null)
      : null
   const dc = resolveRuntimeNumber(cardFlag.dc ?? 15, {
      tokenDoc: tDoc,
      sourceItem: srcItem,
      region,
   })
   const result = await rollSkillForCard({
      actor: tDoc.actor,
      skill: cardFlag.skill,
      dc,
      item: srcItem,
      extraRollOptions: cardFlag.extraRollOptions ?? [],
      flavor: cardFlag.flavor ?? null,
   })
   const outcome = extractSaveOutcome(result)
   if (!outcome) return

   const consequences = Array.isArray(cardFlag.consequences)
      ? cardFlag.consequences
      : []
   const matchedIndexes = consequences
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => (c?.outcome ?? "failure") === outcome)
      .map(({ i }) => i)

   row.dataset.rolled = "true"
   row.dataset.total = String(result?.total ?? "")
   row.dataset.outcome = outcome
   row.dataset.matchedIndexes = matchedIndexes.join(",")
   const rollBtn = row.querySelector(".atw-roll-skill") ?? btn
   const rollDegree = rollBtn.querySelector(".degree")
   if (rollDegree) {
      rollDegree.textContent = String(result?.total ?? "")
      rollDegree.style.color = outcomeColor(outcome)
      rollDegree.classList.remove("hidden")
      rollBtn.querySelector(".die")?.classList.add("hidden")
   }
   row.querySelector(".atw-roll-reroll")?.classList.remove("hidden")

   const state = getRollDiceState(msg, targetUuid)
   state.total = result?.total ?? ""
   state.outcome = outcome
   state.matchedIndexes = matchedIndexes
   state.damageRolls = []
   state.saveOutcomes = {}
   state.skillOutcomes = {}

   const matched = matchedIndexes.map((i) => consequences[i])
   for (const c of matched) {
      if (c?.type !== "damage") continue
      const damageRoll = await rollDamageConsequence(c)
      if (damageRoll) {
         state.damageRolls.push({
            id: foundry.utils.randomID(),
            rerollAction: "atw-reroll-skill",
            ...damageRoll,
         })
      }
   }
   await setRollDiceState(msg, targetUuid, state)

   const immediate = matched.filter(
      (c) => c?.type !== "damage" && !isCardInlineMessageConsequence(c),
   )
   if (immediate.length) {
      const payload = {
         consequences: immediate,
         targetUuid,
         sourceItemUuid: cardFlag.sourceItemUuid ?? null,
         flavor: cardFlag.flavor ?? null,
         regionUuid: cardFlag.regionUuid ?? null,
         messageId: msg.id,
      }
      if (game.user.isGM) await gmApplyRuntimeConsequences(payload)
      else await executeAsGM("applyRuntimeConsequences", payload)
   }

   await renderSkillRowDetails(row, cardFlag, state)
   await persistRollDiceCard(msg, card, targetUuid, state)
}

async function onRollDiceCardApplyDamage(btn, card, msg, cardFlag) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const damageId = btn.dataset.damageId
   const multiplier = Number(btn.dataset.multiplier)
   if (!damageId || !Number.isFinite(multiplier)) return
   const state = getRollDiceState(msg, targetUuid)
   const damageRoll = findRollDiceDamageRoll(state, damageId)
   if (!damageRoll) return
   if (game.user.isGM) {
      await applyCardDamageToTarget(targetUuid, damageRoll, multiplier)
   } else {
      await executeAsGM("applyCardDamage", {
         targetUuid,
         damageRoll,
         multiplier,
      })
   }
   const apply = btn.closest(".damage-application")
   if (apply) apply.style.filter = "blur(1px) opacity(0.55)"
   await persistCardContent(msg, card)
}

function getRollDiceState(msg, targetUuid) {
   const clientKey = `${msg.id}|${targetUuid}`
   if (ROLL_DICE_CLIENT_STATE.has(clientKey)) {
      return foundry.utils.deepClone(ROLL_DICE_CLIENT_STATE.get(clientKey))
   }
   const all = msg.getFlag(MODULE_ID, "rollDiceState") ?? []
   const existing = all.find((s) => s.targetUuid === targetUuid)
   return existing
      ? foundry.utils.deepClone(existing)
      : {
           targetUuid,
           total: null,
           matchedIndexes: [],
           damageRolls: [],
           saveOutcomes: {},
           skillOutcomes: {},
        }
}

async function setRollDiceState(msg, targetUuid, state) {
   ROLL_DICE_CLIENT_STATE.set(
      `${msg.id}|${targetUuid}`,
      foundry.utils.deepClone(state),
   )
}

function buildRollDiceStateList(msg, targetUuid, state) {
   if (!game.user?.isGM) return
   const all = foundry.utils.deepClone(
      msg.getFlag(MODULE_ID, "rollDiceState") ?? [],
   )
   const idx = all.findIndex((s) => s.targetUuid === targetUuid)
   if (idx >= 0) all[idx] = state
   else all.push(state)
   return all
}

async function persistRollDiceCard(msg, card, targetUuid, state) {
   if (!game.user?.isGM || !msg?.update || !card?.outerHTML) return
   const all = buildRollDiceStateList(msg, targetUuid, state)
   const update = {
      content: card.outerHTML,
      [`flags.${MODULE_ID}.rollDiceState`]: all ?? [],
   }
   try {
      await msg.update(update, { render: false })
   } catch (e) {
      console.warn(`[${MODULE_ID}] card state persist failed`, e)
   }
}

async function persistCardContent(msg, card) {
   if (!game.user?.isGM || !msg?.update || !card?.outerHTML) return
   try {
      await msg.update({ content: card.outerHTML }, { render: false })
   } catch (e) {
      console.warn(`[${MODULE_ID}] card content persist failed`, e)
   }
}

function findRollDiceDamageRoll(state, damageId) {
   for (const dmg of state.damageRolls ?? []) {
      if (dmg.id === damageId) return dmg
   }
   for (const saveState of Object.values(state.saveOutcomes ?? {})) {
      for (const dmg of saveState.damageRolls ?? []) {
         if (dmg.id === damageId) return dmg
      }
   }
   for (const skillState of Object.values(state.skillOutcomes ?? {})) {
      for (const dmg of skillState.damageRolls ?? []) {
         if (dmg.id === damageId) return dmg
      }
   }
   return null
}
