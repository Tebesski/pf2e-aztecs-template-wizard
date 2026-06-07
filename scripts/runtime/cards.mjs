import { MODULE_ID } from "../data.mjs"
import { executeAsGM } from "./socketlib.mjs"
import { extractSaveOutcome } from "./player-requests.mjs"
import {
   isCardInlineMessageConsequence,
   outcomeClass,
   outcomeResultColor,
   outcomeLabel,
   renderRollDiceRowDetails,
   renderSkillRowDetails,
   resolveRuntimeNumber,
   rollDamageConsequence,
   rollSkillForCard,
   rollResultColor,
   skillKeyForCard,
} from "./card-helpers.mjs"
import {
   SAVE_OUTCOME_CLASSES,
   applyCardDamageToTarget,
   applyCardHealingToTarget,
   cleanupRuntimeConsequencesForTarget,
   gmApplyRuntimeConsequences,
   gmPersistCardMessage,
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
   "atw-roll-dice-apply-healing",
   "atw-roll-skill",
   "atw-reroll-skill",
   "atw-apply-damage",
   "atw-apply-healing",
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
            else if (action === "atw-roll-dice-apply-healing")
               await onRollDiceCardApplyHealing(btn, card, msg, cardFlag)
            else if (action === "atw-roll-skill")
               await onSkillCardRoll(btn, card, msg, cardFlag)
            else if (action === "atw-reroll-skill")
               await onSkillCardRoll(btn, card, msg, cardFlag, true)
            else if (action === "atw-apply-damage")
               await onMTCardApplyDamage(btn, card, msg, cardFlag)
            else if (action === "atw-apply-healing")
               await onMTCardApplyHealing(btn, card, msg, cardFlag)
            else if (action === "atw-ping-target") await onMTCardPing(btn)
            else if (action === "atw-reroll-save")
               await onMTCardRerollSave(btn, card, msg, cardFlag)
         } catch (e) {
            undefined
         }
      },
      true,
   )
   document.addEventListener("contextmenu", onCardResultContextMenu, true)
}

async function onCardResultContextMenu(ev) {
   const result = ev.target.closest?.(
      ".atw-mtcard .degree:not(.hidden), .atw-mtcard .atw-roll-result, .atw-mtcard .atw-nested-check-result strong",
   )
   if (!result) return
   const card = result.closest(".atw-mtcard")
   const msgLi = result.closest("[data-message-id]")
   const messageId = msgLi?.dataset.messageId
   if (!card || !messageId) return
   const msg = game.messages.get(messageId)
   const cardFlag = msg?.getFlag?.(MODULE_ID, "card")
   if (!msg || !cardFlag) return
   ev.preventDefault()
   ev.stopPropagation()

   const directControl = result.closest("[data-action]")
   const nested = result.closest(".atw-nested-check-result")
   const row = result.closest(".target-row")
   let btn = null
   let handler = null
   if (nested) {
      btn = nested.querySelector(".atw-roll-reroll[data-action]")
      if (btn?.dataset.action === "atw-reroll-dice-save") {
         handler = () => onRollDiceCardSave(btn, card, msg, cardFlag, true, { heroPoint: true })
      } else if (btn?.dataset.action === "atw-reroll-dice-skill") {
         handler = () => onRollDiceCardSkill(btn, card, msg, cardFlag, true, { heroPoint: true })
      }
   } else if (directControl?.classList?.contains("atw-mtcard-roll-save")) {
      btn = directControl
      handler = () => onMTCardRollSave(btn, card, msg, cardFlag, true, { heroPoint: true })
   } else if (row?.querySelector(".atw-roll-dice-roll")) {
      btn = row.querySelector(".atw-roll-dice-roll")
      handler = () => onRollDiceCardRoll(btn, card, msg, cardFlag, true, { heroPoint: true })
   } else if (row?.querySelector(".atw-roll-skill")) {
      btn = row.querySelector(".atw-roll-skill")
      handler = () => onSkillCardRoll(btn, card, msg, cardFlag, true, { heroPoint: true })
   }
   if (!btn || !handler) return
   if (CARD_TARGET_OWNER_ACTIONS.has(btn.dataset.action) && !(await canOperateCardTarget(btn))) {
      ui.notifications?.warn(
         "You can only use Template Wizard card controls for actors you own.",
      )
      return
   }
   try {
      await handler()
   } catch (e) {
      undefined
   }
}

async function canOperateCardTarget(btn) {
   if (game.user?.isGM) return true
   const targetUuid = btn.closest(".target-row")?.dataset?.targetUuid
   if (!targetUuid) return false
   const tokenDoc = await fromUuid(targetUuid).catch(() => null)
   const actor = tokenDoc?.actor
   return !!actor?.testUserPermission?.(game.user, "OWNER")
}

async function onMTCardRollSave(btn, card, msg, cardFlag, isReroll = false, options = {}) {
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
    if (options.heroPoint && !hasHeroPoint(actor)) return

    const saveRoll = await saveStat.roll({
      dc: { value: dc },
      createMessage: false,
      extraRollOptions: cardFlag.basicSave ? ["damaging-effect"] : [],
    })
    if (!saveRoll) return
    if (options.heroPoint && !(await spendHeroPoint(actor))) return
    await presentCardRoll(saveRoll)

   const d20 = d20TotalFromRoll(saveRoll)

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
         undefined
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
      const label = outcomeLabel(outcomeKeyForDegree(dos))
      degree.style.color = outcomeResultColor(outcomeKeyForDegree(dos), d20)
      degree.title = label
      degree.dataset.tooltip = label
      btn.title = label
      btn.dataset.tooltip = label

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
            undefined
         }
      }
   }

   await persistCardContent(msg, card, targetUuid)
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
      undefined
   }

   const apply = btn.closest(".damage-application")
   if (apply) {
      apply.style.filter = "blur(1px) opacity(0.55)"
   }
   await persistCardContent(msg, card, targetUuid)
}

async function onMTCardApplyHealing(btn, card, msg, cardFlag) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const healing = cardFlag.healing
   if (!healing) return
   const multiplier = Number(btn.dataset.multiplier ?? 1) || 1

   if (game.user.isGM) {
      await applyCardHealingToTarget(targetUuid, healing, multiplier)
   } else {
      await executeAsGM("applyCardHealing", {
         targetUuid,
         healing,
         multiplier,
      })
   }

   const apply = btn.closest(".damage-application")
   if (apply) {
      apply.style.filter = "blur(1px) opacity(0.55)"
   }
   await persistCardContent(msg, card, targetUuid)
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

function d20TotalFromRoll(roll) {
   const dice = Array.isArray(roll?.dice) ? roll.dice : []
   const d20 = dice.find((die) => Number(die?.faces) === 20)
   if (!d20) return null
   const direct = Number(d20.total)
   if (Number.isFinite(direct)) return direct
   const result = d20.results?.find?.((r) => r.active !== false)
   const value = Number(result?.result)
   return Number.isFinite(value) ? value : null
}

function outcomeKeyForDegree(degree) {
   return (
      {
         0: "criticalFailure",
         1: "failure",
         2: "success",
         3: "criticalSuccess",
      }[degree] ?? "failure"
   )
}

async function spendHeroPoint(actor) {
   const path = heroPointPath(actor)
   const current = Number(path ? foundry.utils.getProperty(actor, path) : NaN)
   if (!path || !Number.isFinite(current) || current <= 0) {
      ui.notifications?.warn(`${actor?.name ?? "This actor"} has no Hero Points.`)
      return false
   }
   try {
      await actor.update({ [path]: Math.max(0, current - 1) })
      return true
   } catch (error) {
      undefined
      ui.notifications?.warn("Template Wizard could not spend a Hero Point for this actor.")
      return false
   }
}

function hasHeroPoint(actor) {
   const path = heroPointPath(actor)
   const current = Number(path ? foundry.utils.getProperty(actor, path) : NaN)
   if (path && Number.isFinite(current) && current > 0) return true
   ui.notifications?.warn(`${actor?.name ?? "This actor"} has no Hero Points.`)
   return false
}

function heroPointPath(actor) {
   const candidates = [
      "system.resources.heroPoints.value",
      "system.resources.hero.value",
      "system.heroPoints.value",
      "system.attributes.heroPoints.value",
   ]
   for (const path of candidates) {
      const value = Number(foundry.utils.getProperty(actor, path))
      if (Number.isFinite(value)) return path
   }
   return null
}

async function presentCardRoll(roll) {
   if (!roll) return
   try {
      if (game.dice3d?.showForRoll) {
         await game.dice3d.showForRoll(roll, game.user, true, null, false)
      }
   } catch (e) {
      undefined
   }
   playDiceSound()
}

function playDiceSound() {
   const src = globalThis.CONFIG?.sounds?.dice
   if (!src) return
   try {
      const volume = Number(game.settings?.get?.("core", "globalInterfaceVolume"))
      const audioHelper =
         globalThis.foundry?.audio?.AudioHelper ?? globalThis.AudioHelper
      audioHelper?.play?.(
         {
            src,
            volume: Number.isFinite(volume) ? volume : 0.8,
            autoplay: true,
            loop: false,
         },
         true,
      )
   } catch (_e) {}
}

async function onRollDiceCardRoll(btn, card, msg, cardFlag, isReroll = false, options = {}) {
   const row = btn.closest(".target-row")
   if (!row || (!isReroll && row.dataset.rolled === "true")) return
   const targetUuid = row.dataset.targetUuid
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return
   if (options.heroPoint && !hasHeroPoint(tDoc.actor)) return
   const formula = cardFlag.formula || "1d20"
   const roll = await new Roll(formula).evaluate({ allowInteractive: false })
   if (options.heroPoint && !(await spendHeroPoint(tDoc.actor))) return
   await presentCardRoll(roll)
   const total = Number(roll.total) || 0
   const d20 = d20TotalFromRoll(roll)
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
      degree.style.color = rollResultColor(total, formula, d20)
      degree.title = "Roll result"
      degree.dataset.tooltip = "Roll result"
      degree.classList.remove("hidden")
      rollBtn.querySelector(".die")?.classList.add("hidden")
   }
   row.querySelector(".atw-roll-reroll")?.classList.remove("hidden")

   const state = getRollDiceState(msg, targetUuid)
   state.total = total
   state.d20 = d20
   state.matchedIndexes = matchedIndexes
   state.damageRolls = []
   state.healingEntries = []
   state.saveOutcomes = {}
   state.skillOutcomes = {}

   const matched = matchedIndexes.map((i) => cardFlag.consequences[i])
   const damageRolls = []
   const healingEntries = []
   for (let i = 0; i < matched.length; i++) {
      const c = matched[i]
      if (c?.type === "damage") {
         const damageRoll = await rollDamageConsequence(c)
         if (damageRoll) {
            damageRolls.push({
               id: foundry.utils.randomID(),
               consequenceIndex: matchedIndexes[i],
               rerollAction: "atw-reroll-dice",
               ...damageRoll,
            })
         }
      } else if (c?.type === "heal") {
         const healing = await healingEntryFromConsequence(c, targetUuid, cardFlag)
         if (healing) {
            healingEntries.push({
               ...healing,
               id: foundry.utils.randomID(),
               consequenceIndex: matchedIndexes[i],
            })
         }
      }
   }
   state.damageRolls = damageRolls
   state.healingEntries = healingEntries
   await setRollDiceState(msg, targetUuid, state)

   const immediate = matched.filter(
      (c) =>
         c?.type !== "damage" &&
         c?.type !== "heal" &&
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

async function onRollDiceCardSave(btn, card, msg, cardFlag, isReroll = false, options = {}) {
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
   if (options.heroPoint && !hasHeroPoint(actor)) return
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
   if (options.heroPoint && !(await spendHeroPoint(actor))) return
   await presentCardRoll(saveRoll)
   let dos = saveRoll.degreeOfSuccess?.value ?? saveRoll.degreeOfSuccess ?? 1
   const d20 = d20TotalFromRoll(saveRoll)
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
      d20,
      dc,
      save: stat,
      damageRolls: [],
      healingEntries: [],
   }

   const nestedDamageRolls = []
   const nestedHealingEntries = []
   for (const c of nested) {
      if (c?.type === "damage") {
         const damageRoll = await rollDamageConsequence(c)
         if (damageRoll) {
            nestedDamageRolls.push({
               id: foundry.utils.randomID(),
               consequenceIndex,
               rerollAction: "atw-reroll-dice-save",
               ...damageRoll,
            })
         }
      } else if (c?.type === "heal") {
         const healing = await healingEntryFromConsequence(c, targetUuid, cardFlag)
         if (healing) nestedHealingEntries.push({ ...healing, id: foundry.utils.randomID(), consequenceIndex })
      }
   }
   state.saveOutcomes[consequenceIndex].damageRolls = nestedDamageRolls
   state.saveOutcomes[consequenceIndex].healingEntries = nestedHealingEntries
   await setRollDiceState(msg, targetUuid, state)

   const immediate = nested.filter(
      (c) => c?.type !== "damage" && c?.type !== "heal" && !isCardInlineMessageConsequence(c),
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

async function onRollDiceCardSkill(btn, card, msg, cardFlag, isReroll = false, options = {}) {
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
   if (options.heroPoint && !hasHeroPoint(tDoc.actor)) return
   const skillKey = skillKeyForCard(consequence.skill, consequence.lore)
   const result = await rollSkillForCard({
      actor: tDoc.actor,
      skill: skillKey,
      dc,
      item: srcItem,
      extraRollOptions: consequence.extraRollOptions ?? [],
      flavor: cardFlag.flavor ?? null,
   })
   if (!result) return
   if (options.heroPoint && !(await spendHeroPoint(tDoc.actor))) return
   await presentCardRoll(result)
   const outcome = extractSaveOutcome(result)
   if (!outcome) return
   const d20 = d20TotalFromRoll(result)

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
      d20,
      dc,
      skill: skillKey,
      damageRolls: [],
      healingEntries: [],
   }

   const nestedDamageRolls = []
   const nestedHealingEntries = []
   for (const c of nested) {
      if (c?.type === "damage") {
         const damageRoll = await rollDamageConsequence(c)
         if (damageRoll) {
            nestedDamageRolls.push({
               id: foundry.utils.randomID(),
               consequenceIndex,
               rerollAction: "atw-reroll-dice-skill",
               ...damageRoll,
            })
         }
      } else if (c?.type === "heal") {
         const healing = await healingEntryFromConsequence(c, targetUuid, cardFlag)
         if (healing) nestedHealingEntries.push({ ...healing, id: foundry.utils.randomID(), consequenceIndex })
      }
   }
   state.skillOutcomes[consequenceIndex].damageRolls = nestedDamageRolls
   state.skillOutcomes[consequenceIndex].healingEntries = nestedHealingEntries
   await setRollDiceState(msg, targetUuid, state)

   const immediate = nested.filter(
      (c) => c?.type !== "damage" && c?.type !== "heal" && !isCardInlineMessageConsequence(c),
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

async function onSkillCardRoll(btn, card, msg, cardFlag, isReroll = false, options = {}) {
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
   if (options.heroPoint && !hasHeroPoint(tDoc.actor)) return
   const result = await rollSkillForCard({
      actor: tDoc.actor,
      skill: cardFlag.skill,
      dc,
      item: srcItem,
      extraRollOptions: cardFlag.extraRollOptions ?? [],
      flavor: cardFlag.flavor ?? null,
   })
   if (!result) return
   if (options.heroPoint && !(await spendHeroPoint(tDoc.actor))) return
   await presentCardRoll(result)
   const outcome = extractSaveOutcome(result)
   if (!outcome) return
   const d20 = d20TotalFromRoll(result)

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
      rollDegree.style.color = outcomeResultColor(outcome, d20)
      rollDegree.classList.remove(
         "critical-success",
         "success",
         "failure",
         "critical-failure",
      )
      const outcomeCssClass = outcomeClass(outcome)
      if (outcomeCssClass) rollDegree.classList.add(outcomeCssClass)
      rollDegree.title = outcomeLabel(outcome)
      rollDegree.dataset.tooltip = outcomeLabel(outcome)
      rollDegree.classList.remove("hidden")
      rollBtn.querySelector(".die")?.classList.add("hidden")
   }
   row.querySelector(".atw-roll-reroll")?.classList.remove("hidden")

   const state = getRollDiceState(msg, targetUuid)
   state.total = result?.total ?? ""
   state.d20 = d20
   state.outcome = outcome
   state.matchedIndexes = matchedIndexes
   state.damageRolls = []
   state.healingEntries = []
   state.saveOutcomes = {}
   state.skillOutcomes = {}

   const matched = matchedIndexes.map((i) => consequences[i])
   for (const c of matched) {
      if (c?.type === "damage") {
         const damageRoll = await rollDamageConsequence(c)
         if (damageRoll) {
            state.damageRolls.push({
               id: foundry.utils.randomID(),
               rerollAction: "atw-reroll-skill",
               ...damageRoll,
            })
         }
      } else if (c?.type === "heal") {
         const healing = await healingEntryFromConsequence(c, targetUuid, cardFlag)
         if (healing) state.healingEntries.push({ ...healing, id: foundry.utils.randomID() })
      }
   }
   await setRollDiceState(msg, targetUuid, state)

   const immediate = matched.filter(
      (c) => c?.type !== "damage" && c?.type !== "heal" && !isCardInlineMessageConsequence(c),
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
   await persistCardContent(msg, card, targetUuid)
}

async function onRollDiceCardApplyHealing(btn, card, msg, cardFlag) {
   const row = btn.closest(".target-row")
   if (!row) return
   const targetUuid = row.dataset.targetUuid
   const healingId = btn.dataset.healingId
   if (!healingId) return
   const state = getRollDiceState(msg, targetUuid)
   const healing = findRollDiceHealingEntry(state, healingId)
   if (!healing) return
   const multiplier = Number(btn.dataset.multiplier ?? 1) || 1
   if (game.user.isGM) {
      await applyCardHealingToTarget(targetUuid, healing, multiplier)
   } else {
      await executeAsGM("applyCardHealing", { targetUuid, healing, multiplier })
   }
   const apply = btn.closest(".damage-application")
   if (apply) apply.style.filter = "blur(1px) opacity(0.55)"
   await persistCardContent(msg, card, targetUuid)
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
           healingEntries: [],
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
   const all = foundry.utils.deepClone(
      msg.getFlag(MODULE_ID, "rollDiceState") ?? [],
   )
   const idx = all.findIndex((s) => s.targetUuid === targetUuid)
   if (idx >= 0) all[idx] = state
   else all.push(state)
   return all
}

async function persistRollDiceCard(msg, card, targetUuid, state) {
   if (!msg?.id || !card?.outerHTML) return
   const all = buildRollDiceStateList(msg, targetUuid, state)
   const payload = {
      messageId: msg.id,
      targetUuid,
      userId: game.user?.id ?? null,
      content: card.outerHTML,
      rollDiceState: all ?? [],
   }
   try {
      if (game.user?.isGM) await gmPersistCardMessage(payload)
      else await executeAsGM("persistCardMessage", payload)
   } catch (e) {
      undefined
   }
}

async function persistCardContent(msg, card, targetUuid = null) {
   if (!msg?.id || !card?.outerHTML) return
   const payload = {
      messageId: msg.id,
      targetUuid,
      userId: game.user?.id ?? null,
      content: card.outerHTML,
   }
   try {
      if (game.user?.isGM) await gmPersistCardMessage(payload)
      else await executeAsGM("persistCardMessage", payload)
   } catch (e) {
      undefined
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

function findRollDiceHealingEntry(state, healingId) {
   for (const healing of state.healingEntries ?? []) {
      if (healing.id === healingId) return healing
   }
   for (const saveState of Object.values(state.saveOutcomes ?? {})) {
      for (const healing of saveState.healingEntries ?? []) {
         if (healing.id === healingId) return healing
      }
   }
   for (const skillState of Object.values(state.skillOutcomes ?? {})) {
      for (const healing of skillState.healingEntries ?? []) {
         if (healing.id === healingId) return healing
      }
   }
   return null
}

async function healingEntryFromConsequence(consequence, targetUuid, cardFlag) {
   const tokenDoc = await fromUuid(targetUuid).catch(() => null)
   if (!tokenDoc?.actor) return null
   const sourceItem = cardFlag.sourceItemUuid
      ? await fromUuid(cardFlag.sourceItemUuid).catch(() => null)
      : null
   const region = cardFlag.regionUuid
      ? await fromUuid(cardFlag.regionUuid).catch(() => null)
      : null
   const total = Math.max(
      0,
      Math.floor(
         resolveRuntimeNumber(consequence.amount ?? 5, {
            tokenDoc,
            sourceItem,
            region,
         }),
      ),
   )
   if (total <= 0) return null
   return {
      total,
      healingType: ["untyped", "vitality", "void"].includes(consequence.healingType)
         ? consequence.healingType
         : "untyped",
   }
}
