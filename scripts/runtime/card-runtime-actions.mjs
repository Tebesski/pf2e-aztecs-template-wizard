import { MODULE_ID } from "../data.mjs"
import { enrichChatContent } from "./card-helpers.mjs"
export const SAVE_OUTCOME_CLASSES = [
   "critical-failure",
   "failure",
   "success",
   "critical-success",
]

export async function cleanupRuntimeConsequencesForTarget(targetUuid, messageId) {
   if (!targetUuid || !messageId) return 0
   const tokenDoc = await fromUuid(targetUuid)
   const actor = tokenDoc?.actor
   if (!actor) return 0
   const toDelete = actor.items
      .filter((i) => i.getFlag(MODULE_ID, "mtCardMessageId") === messageId)
      .map((i) => i.id)
   if (!toDelete.length) return 0
   await actor.deleteEmbeddedDocuments("Item", toDelete)
   return toDelete.length
}

export async function gmCleanupRuntimeConsequences(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   try {
      const count = await cleanupRuntimeConsequencesForTarget(
         payload.targetUuid,
         payload.messageId,
      )
      return { ok: true, count }
   } catch (e) {
      console.warn(`[${MODULE_ID}] MTcard consequence cleanup failed`, e)
      return { ok: false, reason: "cleanup-failed" }
   }
}

export async function gmApplyRuntimeConsequences(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const tDoc = await fromUuid(payload.targetUuid)
   if (!tDoc?.actor) return { ok: false, reason: "missing-token" }
   let region = null
   if (payload.regionUuid) {
      try {
         region = await fromUuid(payload.regionUuid)
      } catch (_e) {}
   }
   const consequences = Array.isArray(payload.consequences)
      ? payload.consequences
      : []
   let count = 0
   for (const c of consequences) {
      try {
         await applyRuntimeConsequence(
            c,
            tDoc,
            payload.sourceItemUuid ?? null,
            payload.flavor ?? null,
            region,
            payload.messageId ?? null,
         )
         count += 1
      } catch (e) {
         console.warn(`[${MODULE_ID}] MTcard consequence dispatch failed`, e)
      }
   }
   return { ok: true, count }
}

export async function applyCardDamageToTarget(targetUuid, dmg, multiplier) {
   const tDoc = await fromUuid(targetUuid)
   if (!tDoc?.actor) return false
   const actor = tDoc.actor
   const scaleMultiplier = Number(multiplier)
   if (!Number.isFinite(scaleMultiplier) || !dmg) return false

   let damageRoll = null
   try {
      const parsed = JSON.parse(dmg.rollJSON)
      damageRoll = Roll.fromData(parsed)

      if (scaleMultiplier !== 1) {
         const scale = (val) => Math.max(0, Math.floor(val * scaleMultiplier))
         damageRoll._total = scale(damageRoll._total)
         if (Array.isArray(damageRoll.instances)) {
            for (const inst of damageRoll.instances) {
               inst._total = scale(inst._total)
            }
         }
      }
   } catch (_e) {}

   if (damageRoll) {
      await actor.applyDamage?.({
         damage: damageRoll,
         token: tDoc.object,
      })
   } else {
      await actor.applyDamage?.({
         damage: Math.max(
            0,
            Math.floor((Number(dmg.total) || 0) * scaleMultiplier),
         ),
         token: tDoc.object,
      })
   }
   return true
}

export async function gmApplyCardDamage(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   try {
      const ok = await applyCardDamageToTarget(
         payload.targetUuid,
         payload.damageRoll,
         payload.multiplier,
      )
      return ok
         ? { ok: true }
         : { ok: false, reason: "damage-not-applied" }
   } catch (e) {
      console.warn(`[${MODULE_ID}] applyDamage failed`, e)
      return { ok: false, reason: "apply-failed" }
   }
}

async function applyRuntimeConsequence(
   c,
   tokenDoc,
   sourceItemUuid,
   flavor,
   region,
   messageId,
) {
   const actor = tokenDoc?.actor
   if (!actor) return
   let srcItem = null
   if (sourceItemUuid) {
      try {
         srcItem = await fromUuid(sourceItemUuid)
      } catch (_e) {}
   }

   switch (c.type) {
      case "damage": {
         const damages = Array.isArray(c.damages) ? c.damages : []
         if (damages.length === 0) return
         const parts = []
         for (const d of damages) {
            const count = Number(d.diceCount) || 0
            if (count <= 0 || !d.damageType) continue
            const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : null
            const tags = [d.damageType]
            if (d.category && d.category !== "normal") tags.push(d.category)
            const tagStr = "[" + tags.join(",") + "]"
            parts.push(die ? `${count}${die}${tagStr}` : `${count}${tagStr}`)
         }
         if (!parts.length) return
         const formula = parts.join(",")
         let rollOptions = []
         try {
            rollOptions = srcItem?.getRollOptions?.("item") ?? []
         } catch (_e) {}
         const DR =
            CONFIG.Dice?.rolls?.find((r) => r.name === "DamageRoll") ?? Roll
         let damageRoll
         try {
            damageRoll = await new DR(formula, {}, { rollOptions }).evaluate({
               allowInteractive: false,
            })
         } catch (_e) {
            try {
               damageRoll = await new Roll(formula).evaluate({
                  allowInteractive: false,
               })
            } catch (_e2) {
               return
            }
         }
         const speaker = ChatMessage.getSpeaker({
            token: tokenDoc.object ?? tokenDoc,
         })

         const __priorTargets = new Set(game.user.targets)
         try {
            game.user.updateTokenTargets([tokenDoc.id])
         } catch (_e) {}

         const messageData = damageRoll.toMessage(
            { speaker, flavor: `${flavor}: ${actor.name}` },
            { create: false, rollMode: game.settings.get("core", "rollMode") },
         )
         const md = await messageData
         if (md) {
            foundry.utils.mergeObject(md, {
               flags: {
                  pf2e: {
                     context: {
                        type: "damage-roll",
                        target: { token: tokenDoc.uuid, actor: actor.uuid },
                     },
                     target: { token: tokenDoc.uuid, actor: actor.uuid },
                     origin: sourceItemUuid
                        ? { uuid: sourceItemUuid }
                        : undefined,
                  },
               },
            })
            try {
               await ChatMessage.create(md)
            } catch (e) {
               console.warn(`[${MODULE_ID}] damage message create failed`, e)
            }
         }
         try {
            game.user.updateTokenTargets(
               Array.from(__priorTargets).map((t) => t.id),
            )
         } catch (_e) {}
         let autoApply = false
         try {
            autoApply = game.settings.get(MODULE_ID, "applyDamageAutomatically")
         } catch (_e) {}
         if (autoApply && typeof actor.applyDamage === "function") {
            try {
               await actor.applyDamage({
                  damage: damageRoll,
                  token: tokenDoc.object,
               })
            } catch (_e) {}
         }
         return
      }

      case "applyEffect":
      case "applyCondition":
      case "applyRuleElement": {

         let grantUuid = null
         let grantValue = null
         const rules = []
         if (c.type === "applyEffect") {
            if (!c.uuid) return
            grantUuid = c.uuid
         } else if (c.type === "applyCondition") {
            const slug = c.condition?.slug ?? c.slug
            if (!slug) return
            const cond = game.pf2e?.ConditionManager?.conditions?.get?.(slug)
            if (!cond) return
            grantUuid = cond.uuid
            if (cond.system?.value?.isValued) {
               grantValue = Number(c.condition?.value ?? c.value) || 1
            }
         } else {

            const list = Array.isArray(c.rules) ? c.rules : []
            for (const r of list) {
               if (typeof r === "string") {
                  try {
                     rules.push(JSON.parse(r))
                  } catch (_e) {}
               } else if (r && typeof r === "object") {
                  rules.push(r)
               }
            }
            if (rules.length === 0) return
         }
         if (grantUuid) {
            const rule = {
               key: "GrantItem",
               uuid: grantUuid,
               allowDuplicate: false,
               onDeleteActions: { grantee: "detach" },
            }
            if (grantValue !== null) {
               rule.alterations = [
                  {
                     mode: "override",
                     property: "badge-value",
                     value: grantValue,
                  },
               ]
            }
            rules.push(rule)
         }
         let dur = {
            value: -1,
            unit: "unlimited",
            sustained: false,
            expiry: "turn-start",
         }
         if (c.duration && c.duration.enabled) {
            const allowed = new Set(["rounds", "minutes", "hours", "days"])
            const u = allowed.has(c.duration.unit) ? c.duration.unit : "rounds"
            dur = {
               value: Math.max(1, Number(c.duration.amount) || 1),
               unit: u,
               sustained: false,
               expiry: "turn-start",
            }
         }
         const parent = {
            type: "effect",
            name: `${flavor}: ${c.type === "applyCondition" ? "Condition" : c.type === "applyEffect" ? "Effect" : "Rule"}`,
            img: srcItem?.img || "icons/svg/aura.svg",
            system: {
               rules,
               duration: dur,
               start: { value: 0, initiative: null },
               description: { value: "" },
               traits: { value: [], rarity: "common" },
               level: { value: 1 },
               tokenIcon: { show: true },
               unidentified: false,
            },
            flags: {
               [MODULE_ID]: {
                  isParentEffect: true,
                  appliedByRegion: region?.uuid ?? null,
                  sourceItemUuid,
                  mtCardMessageId: messageId,
               },
            },
         }
         try {
            await actor.createEmbeddedDocuments("Item", [parent])
         } catch (e) {
            console.warn(`[${MODULE_ID}] applyEffect/Condition/Rule failed`, e)
         }
         return
      }

      case "removeEffect": {
         const uuid = c.uuid
         if (!uuid) return
         const matches = actor.items.filter((i) =>
            [
               i.sourceId,
               i._stats?.compendiumSource,
               i.flags?.core?.sourceId,
            ].includes(uuid),
         )
         if (matches.length) {
            try {
               await actor.deleteEmbeddedDocuments(
                  "Item",
                  matches.map((m) => m.id),
               )
            } catch (_e) {}
         }
         return
      }

      case "removeCondition": {
         const slug = c.condition?.slug ?? c.slug
         if (!slug) return

         const steps = Number(c.condition?.value ?? c.value)
         try {
            if (
               Number.isFinite(steps) &&
               steps > 0 &&
               typeof actor.decreaseCondition === "function"
            ) {
               for (let i = 0; i < steps; i++) {
                  await actor.decreaseCondition(slug)
               }
            } else if (typeof actor.decreaseCondition === "function") {
               await actor.decreaseCondition(slug, { forceRemove: true })
            } else {
               const matches = actor.items.filter(
                  (i) => i.type === "condition" && i.system?.slug === slug,
               )
               if (matches.length) {
                  await actor.deleteEmbeddedDocuments(
                     "Item",
                     matches.map((m) => m.id),
                  )
               }
            }
         } catch (e) {
            console.warn(`[${MODULE_ID}] removeCondition failed`, e)
         }
         return
      }

      case "executeMacro": {
         if (!c.uuid) return
         try {
            const macro = await fromUuid(c.uuid)
            if (macro?.execute) {
               await macro.execute({
                  token: tokenDoc.object ?? null,
                  actor,
                  region: region ?? null,
               })
            }
         } catch (e) {
            console.warn(`[${MODULE_ID}] executeMacro failed`, e)
         }
         return
      }

      case "chatMessage":
      case "sendChatMessage": {
         const raw = c.text ?? ""
         if (!raw) return

         const scope = {
            actor,
            token: tokenDoc,
            region,
            sourceItem: srcItem,
            placer: srcItem?.actor ?? null,
         }
         let content = String(raw).replace(
            /@([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g,
            (_full, path) => {
               const parts = path.split(".")
               let cur = scope[parts.shift()]
               if (cur == null) return _full
               for (const p of parts) {
                  if (cur == null) return _full
                  cur = cur[p]
               }
               return cur == null ? _full : String(cur)
            },
         )
         content = await enrichChatContent(content, srcItem)
         const speaker = ChatMessage.getSpeaker({
            token: tokenDoc.object ?? tokenDoc,
         })
         const msgData = { speaker, content }
         let mode = "publicroll"
         if (c.blindToGm) mode = "blindroll"
         else if (c.privateToGm) mode = "gmroll"
         if (mode !== "publicroll") {
            if (typeof ChatMessage.applyRollMode === "function") {
               ChatMessage.applyRollMode(msgData, mode)
            } else {
               const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id)
               msgData.whisper = gmIds
               if (mode === "blindroll") msgData.blind = true
            }
         }
         try {
            await ChatMessage.create(msgData)
         } catch (_e) {}
         return
      }

      case "addIRW": {
         if (!c.irwType || !c.damageType) return
         const ruleKey =
            c.irwType === "immunity"
               ? "Immunity"
               : c.irwType === "weakness"
                 ? "Weakness"
                 : "Resistance"
         const rule = { key: ruleKey, type: c.damageType }
         if (c.irwType !== "immunity") rule.value = Number(c.value) || 5
         const parent = {
            type: "effect",
            name: `${flavor}: ${ruleKey} ${c.damageType}`,
            img: srcItem?.img || "icons/svg/aura.svg",
            system: {
               rules: [rule],
               duration: {
                  value: -1,
                  unit: "unlimited",
                  sustained: false,
                  expiry: "turn-start",
               },
               start: { value: 0, initiative: null },
               description: { value: "" },
               traits: { value: [], rarity: "common" },
               level: { value: 1 },
               tokenIcon: { show: true },
               unidentified: false,
            },
            flags: {
               [MODULE_ID]: {
                  isParentEffect: true,
                  appliedByRegion: region?.uuid ?? null,
                  mtCardMessageId: messageId,
               },
            },
         }
         try {
            await actor.createEmbeddedDocuments("Item", [parent])
         } catch (_e) {}
         return
      }

      case "scrollingText": {
         const text = c.text ?? ""
         if (!text) return
         const obj = tokenDoc.object
         if (!obj) return
         const interface_ = canvas.interface ?? canvas.controls
         const center = obj.center ?? {
            x: obj.x + (obj.w ?? 0) / 2,
            y: obj.y + (obj.h ?? 0) / 2,
         }
         try {
            interface_?.createScrollingText?.(center, text, {
               anchor: CONST.TEXT_ANCHOR_POINTS?.CENTER ?? 1,
               direction: CONST.TEXT_ANCHOR_POINTS?.TOP ?? 0,
               fontSize: c.fontSize ?? 28,
               fill: c.color ?? "#ffffff",
               stroke: 0x000000,
               strokeThickness: 4,
               jitter: 0.25,
            })
         } catch (_e) {}
         return
      }
   }
}
