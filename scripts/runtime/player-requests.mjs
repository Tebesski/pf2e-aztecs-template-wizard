import { MODULE_ID } from "../data.mjs"

const SOCKET_CHANNEL = `module.${MODULE_ID}`
const PENDING_SAVES = new Map()
export function installPlayerSaveSocket() {
   if (!globalThis.game?.socket) return
   game.socket.on(SOCKET_CHANNEL, async (data) => {
      if (!data || typeof data !== "object") return
      if (data.type === "requestSave" && data.userId === game.user.id) {
         await handleSaveRequest(data)
      } else if (
         data.type === "saveResult" &&
         data.requesterId === game.user.id
      ) {
         const entry = PENDING_SAVES.get(data.requestId)
         if (entry) {
            clearTimeout(entry.timeout)
            PENDING_SAVES.delete(data.requestId)
            entry.resolve(data.outcome ?? null)
         }
      } else if (
         data.type === "requestSkillRoll" &&
         data.userId === game.user.id
      ) {
         await handleSkillRollRequest(data)
      } else if (
         data.type === "skillResult" &&
         data.requesterId === game.user.id
      ) {
         const entry = PENDING_SAVES.get(data.requestId)
         if (entry) {
            clearTimeout(entry.timeout)
            PENDING_SAVES.delete(data.requestId)
            entry.resolve(data.outcome ?? null)
         }
      } else if (
         data.type === "requestChoiceDialog" &&
         data.userId === game.user.id
      ) {
         await handleChoiceDialogRequest(data)
      } else if (
         data.type === "choiceDialogResult" &&
         data.requesterId === game.user.id
      ) {
         const entry = PENDING_SAVES.get(data.requestId)
         if (entry) {
            clearTimeout(entry.timeout)
            PENDING_SAVES.delete(data.requestId)
            entry.resolve(data.value ?? null)
         }
      }
   })
}

function findActiveNonGmOwner(actor, preferredUserId = null) {
   if (preferredUserId) {
      const preferred = game.users.get(preferredUserId)
      if (preferred?.active && !preferred.isGM) return preferred
   }
   const ownership = actor?.ownership ?? {}
   for (const [uid, level] of Object.entries(ownership)) {
      if (uid === "default") continue
      if (Number(level) < 3) continue
      const u = game.users.get(uid)
      if (u?.active && !u.isGM) return u
   }
   return null
}

async function showChoiceDialog({
   title,
   content,
   choices,
   cancelValue = null,
   cancelLabel = null,
   hideChoiceButtons = false,
   modal = true,
}) {
   const options = Array.isArray(choices) ? choices : []
   if (!options.length) return cancelValue
   const windowTitle = title || "Template Wizard"
   const html = content || ""
   const choiceValueAt = (index) => {
      const choice = options[Number(index)]
      return choice ? (choice.value ?? Number(index)) : cancelValue
   }
   const bindContentChoiceButtons = (root, done, closeDialog = null) => {
      try {
         const el = root?.querySelector ? root : root?.[0]
         el?.querySelectorAll?.("[data-atw-choice-index]")?.forEach((btn) => {
            btn.addEventListener("click", (ev) => {
               ev.preventDefault()
               done(choiceValueAt(btn.dataset.atwChoiceIndex))
               try {
                  closeDialog?.()
               } catch (_e) {}
            })
         })
      } catch (_e) {}
   }

   const DV2 = foundry?.applications?.api?.DialogV2
   if (DV2?.wait) {
      return await new Promise((resolve) => {
         let settled = false
         const done = (value) => {
            if (settled) return
            settled = true
            resolve(value)
         }
         const buttons = hideChoiceButtons
            ? []
            : options.map((choice, i) => ({
                 action: `choice-${i}`,
                 label: choice.label ?? String(choice.value ?? i),
                 icon: choice.icon ?? undefined,
                 default: !!choice.default,
                 callback: () => done(choice.value ?? i),
              }))
         buttons.push({
            action: "cancel",
            label: cancelLabel || game.i18n?.localize?.("Cancel") || "Cancel",
            callback: () => done(cancelValue),
         })
         DV2.wait({
            window: { title: windowTitle },
            content: html,
            buttons,
            rejectClose: false,
            modal: !!modal,
            render: (_event, dlg) => {
               bindContentChoiceButtons(
                  dlg?.element ?? dlg,
                  done,
                  () => dlg?.close?.(),
               )
            },
            close: () => done(cancelValue),
         }).catch(() => done(cancelValue))
      })
   }

   if (typeof Dialog !== "undefined") {
      return await new Promise((resolve) => {
         let settled = false
         const done = (value) => {
            if (settled) return
            settled = true
            resolve(value)
         }
         const buttons = {}
         if (!hideChoiceButtons) {
            for (let i = 0; i < options.length; i++) {
               const choice = options[i]
               buttons[`choice${i}`] = {
                  label: choice.label ?? String(choice.value ?? i),
                  icon: choice.icon ?? undefined,
                  callback: () => done(choice.value ?? i),
               }
            }
         }
         buttons.cancel = {
            label: cancelLabel || game.i18n?.localize?.("Cancel") || "Cancel",
            callback: () => done(cancelValue),
         }
         const dlg = new Dialog({
            title: windowTitle,
            content: html,
            buttons,
            default:
               !hideChoiceButtons && options.findIndex((c) => c.default) >= 0
                  ? `choice${options.findIndex((c) => c.default)}`
                  : "cancel",
            render: (jq) => {
               bindContentChoiceButtons(jq, done, () => dlg.close?.())
            },
            close: () => done(cancelValue),
         })
         dlg.render(true)
      })
   }

   return cancelValue
}

async function handleChoiceDialogRequest(data) {
   let value = null
   try {
      value = await showChoiceDialog({
         title: data.title,
         content: data.content,
         choices: data.choices,
         cancelValue: data.cancelValue ?? null,
         cancelLabel: data.cancelLabel ?? null,
         hideChoiceButtons: !!data.hideChoiceButtons,
         modal: data.modal !== false,
      })
   } catch (e) {
      undefined
   }
   game.socket.emit(SOCKET_CHANNEL, {
      type: "choiceDialogResult",
      requestId: data.requestId,
      requesterId: data.requesterId,
      value,
   })
}

export async function requestPlayerChoiceDialog({
   actor = null,
   userId = null,
   title,
   content,
   choices,
   cancelValue = null,
   cancelLabel = null,
   hideChoiceButtons = false,
   modal = true,
   timeoutMs = 120000,
}) {
   const target = findActiveNonGmOwner(actor, userId)
   if (!target) {
      return await showChoiceDialog({
         title,
         content,
         choices,
         cancelValue,
         cancelLabel,
         hideChoiceButtons,
         modal,
      })
   }

   const requestId = foundry.utils.randomID()
   const promise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
         if (PENDING_SAVES.has(requestId)) {
            PENDING_SAVES.delete(requestId)
            ui.notifications?.warn(`Choice request timed out for ${target.name}.`)
            resolve(cancelValue)
         }
      }, timeoutMs)
      PENDING_SAVES.set(requestId, { resolve, timeout })
   })

   game.socket.emit(SOCKET_CHANNEL, {
      type: "requestChoiceDialog",
      requestId,
      userId: target.id,
      requesterId: game.user.id,
      title,
      content,
      choices: Array.isArray(choices) ? choices : [],
      cancelValue,
      cancelLabel,
      hideChoiceButtons,
      modal,
   })
   return await promise
}

export function extractSaveOutcome(result) {
   if (!result) return null

   if (typeof result === "string") return result

   const degreeOfSuccess =
      result.degreeOfSuccess?.value ?? result.degreeOfSuccess
   if (typeof degreeOfSuccess === "number") {
      return (
         ["criticalFailure", "failure", "success", "criticalSuccess"][
            degreeOfSuccess
         ] ?? null
      )
   }

   if (result.options?.outcome) return result.options.outcome
   if (result.outcome) return result.outcome

   const fromFlags = result.flags?.pf2e?.context?.outcome
   if (fromFlags) return fromFlags

   if (typeof result.degree === "number") {
      return (
         ["criticalFailure", "failure", "success", "criticalSuccess"][
            result.degree
         ] ?? null
      )
   }
   return null
}

async function handleSaveRequest(data) {
   try {
      const actor = await fromUuid(data.actorUuid)
      if (!actor?.saves?.[data.save]?.roll) {
         game.socket.emit(SOCKET_CHANNEL, {
            type: "saveResult",
            requestId: data.requestId,
            requesterId: data.requesterId,
            outcome: null,
         })
         return
      }
      const item = data.sourceItemUuid
         ? await fromUuid(data.sourceItemUuid)
         : null
      const rollOpts = Array.isArray(data.extraRollOptions)
         ? data.extraRollOptions
         : []
      const result = await actor.saves[data.save].roll({
         dc: { value: Number(data.dc) || 15 },
         item: item ?? undefined,
         extraRollOptions: rollOpts,
         flavor: data.flavor,
      })
      const outcome = extractSaveOutcome(result)
      game.socket.emit(SOCKET_CHANNEL, {
         type: "saveResult",
         requestId: data.requestId,
         requesterId: data.requesterId,
         outcome,
      })
   } catch (e) {
      undefined
      game.socket.emit(SOCKET_CHANNEL, {
         type: "saveResult",
         requestId: data.requestId,
         requesterId: data.requesterId,
         outcome: null,
      })
   }
}

export async function requestPlayerSave({
   actor,
   save,
   dc,
   item,
   extraRollOptions = [],
   flavor,
}) {
   if (!actor?.saves?.[save]?.roll) return null

   let target = null
   const ownership = actor.ownership ?? {}
   for (const [uid, level] of Object.entries(ownership)) {
      if (uid === "default") continue
      if (level < 3) continue
      const u = game.users.get(uid)
      if (u?.active && !u.isGM) {
         target = u
         break
      }
   }
   if (!target) {

      try {
         const result = await actor.saves[save].roll({
            dc: { value: Number(dc) || 15 },
            item: item ?? undefined,
            extraRollOptions: extraRollOptions ?? [],
            flavor,
         })
         return extractSaveOutcome(result)
      } catch (e) {
         undefined
         return null
      }
   }

   const requestId = foundry.utils.randomID()
   const promise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
         if (PENDING_SAVES.has(requestId)) {
            PENDING_SAVES.delete(requestId)
            ui.notifications?.warn(`Save request timed out for ${actor.name}.`)
            resolve(null)
         }
      }, 120000)
      PENDING_SAVES.set(requestId, { resolve, timeout })
   })
   game.socket.emit(SOCKET_CHANNEL, {
      type: "requestSave",
      requestId,
      userId: target.id,
      requesterId: game.user.id,
      actorUuid: actor.uuid,
      save,
      dc: Number(dc) || 15,
      sourceItemUuid: item?.uuid ?? null,
      extraRollOptions: Array.isArray(extraRollOptions) ? extraRollOptions : [],
      flavor: flavor ?? null,
   })
   ui.notifications?.info(
      `Waiting for ${target.name} to roll ${actor.name}'s ${save} save…`,
   )
   return await promise
}

async function handleSkillRollRequest(data) {
   try {
      const actor = await fromUuid(data.actorUuid)
      const stat = actor?.skills?.[data.skillKey]
      if (!stat?.roll) {
         game.socket.emit(SOCKET_CHANNEL, {
            type: "skillResult",
            requestId: data.requestId,
            requesterId: data.requesterId,
            outcome: null,
         })
         return
      }
      const item = data.sourceItemUuid
         ? await fromUuid(data.sourceItemUuid)
         : null
      const rollOpts = Array.isArray(data.extraRollOptions)
         ? data.extraRollOptions
         : []
      const result = await stat.roll({
         dc: { value: Number(data.dc) || 15 },
         item: item ?? undefined,
         extraRollOptions: rollOpts,
         flavor: data.flavor,
      })
      const outcome = extractSaveOutcome(result)
      game.socket.emit(SOCKET_CHANNEL, {
         type: "skillResult",
         requestId: data.requestId,
         requesterId: data.requesterId,
         outcome,
      })
   } catch (e) {
      undefined
      game.socket.emit(SOCKET_CHANNEL, {
         type: "skillResult",
         requestId: data.requestId,
         requesterId: data.requesterId,
         outcome: null,
      })
   }
}

export async function requestPlayerSkillRoll({
   actor,
   skill,
   dc,
   item,
   extraRollOptions = [],
   flavor,
}) {
   if (!actor?.skills?.[skill]?.roll) {

      if (actor?.skills) {
         const candidates = Object.entries(actor.skills)
         const match = candidates.find(([k]) => k === skill)
         if (!match) {
            ui.notifications?.warn(
               `Actor "${actor?.name}" has no "${skill}" skill.`,
            )
            return null
         }
      } else {
         return null
      }
   }
   let target = null
   const ownership = actor.ownership ?? {}
   for (const [uid, level] of Object.entries(ownership)) {
      if (uid === "default") continue
      if (level < 3) continue
      const u = game.users.get(uid)
      if (u?.active && !u.isGM) {
         target = u
         break
      }
   }
   if (!target) {

      try {
         const result = await actor.skills[skill].roll({
            dc: { value: Number(dc) || 15 },
            item: item ?? undefined,
            extraRollOptions: extraRollOptions ?? [],
            flavor,
         })
         return extractSaveOutcome(result)
      } catch (e) {
         undefined
         return null
      }
   }
   const requestId = foundry.utils.randomID()
   const promise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
         if (PENDING_SAVES.has(requestId)) {
            PENDING_SAVES.delete(requestId)
            ui.notifications?.warn(`Skill request timed out for ${actor.name}.`)
            resolve(null)
         }
      }, 120000)
      PENDING_SAVES.set(requestId, { resolve, timeout })
   })
   game.socket.emit(SOCKET_CHANNEL, {
      type: "requestSkillRoll",
      requestId,
      userId: target.id,
      requesterId: game.user.id,
      actorUuid: actor.uuid,
      skillKey: skill,
      dc: Number(dc) || 15,
      sourceItemUuid: item?.uuid ?? null,
      extraRollOptions: Array.isArray(extraRollOptions) ? extraRollOptions : [],
      flavor: flavor ?? null,
   })
   ui.notifications?.info(
      `Waiting for ${target.name} to roll ${actor.name}'s ${skill}…`,
   )
   return await promise
}
