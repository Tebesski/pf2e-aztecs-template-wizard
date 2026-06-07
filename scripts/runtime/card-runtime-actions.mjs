import { MODULE_ID } from "../data.mjs"
import { getRegionFootprint } from "../region/geometry.mjs"
import { enrichChatContent, escapeHTML, resolveRuntimeNumber } from "./card-helpers.mjs"
export const SAVE_OUTCOME_CLASSES = [
   "critical-failure",
   "failure",
   "success",
   "critical-success",
]
const RESTRICTION_EFFECT_LOCKS = new Set()

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
      undefined
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
         undefined
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

export async function applyCardHealingToTarget(targetUuid, healing, multiplier = 1) {
   const tokenDoc = await fromUuid(targetUuid)
   if (!tokenDoc?.actor) return false
   const actor = tokenDoc.actor
   const scale = Math.max(0, Number(multiplier) || 1)
   const amount = Math.max(0, Math.floor((Number(healing?.total ?? healing?.amount) || 0) * scale))
   if (amount <= 0) return false
   if (typeof actor.applyDamage === "function") {
      try {
         await actor.applyDamage({
            damage: -amount,
            token: tokenDoc.object ?? tokenDoc,
         })
         return true
      } catch (_e) {}
   }
   const current = Number(foundry.utils.getProperty(actor, "system.attributes.hp.value"))
   const max = Number(foundry.utils.getProperty(actor, "system.attributes.hp.max"))
   if (!Number.isFinite(current) || !Number.isFinite(max)) return false
   await actor.update({
      "system.attributes.hp.value": Math.min(max, current + amount),
   })
   return true
}

export async function moveTokenByRegionVector(tokenDoc, region, direction, feet) {
   if (!tokenDoc?.update || !region) return false
   const distance = Math.max(0, Number(feet) || 0)
   if (distance <= 0) return false
   const center = regionCenter(region)
   const { gridSize, gridDistance } = movementGridMetrics(tokenDoc, region)
   const tokenWidth = tokenWidthPx(tokenDoc, gridSize)
   const tokenHeight = tokenHeightPx(tokenDoc, gridSize)
   const tokenCenter = {
      x: Number(tokenDoc.x) + tokenWidth / 2,
      y: Number(tokenDoc.y) + tokenHeight / 2,
   }
   if (!center || !Number.isFinite(tokenCenter.x) || !Number.isFinite(tokenCenter.y)) return false
   let dx = tokenCenter.x - center.x
   let dy = tokenCenter.y - center.y
   const length = Math.hypot(dx, dy)
   if (length <= 0) return false
   dx /= length
   dy /= length
   const pixels = (distance / gridDistance) * gridSize
   const sign = direction === "toward" ? -1 : 1
   const buildNext = (moveSign) => {
      const next = {
         x: Number(tokenDoc.x) + dx * pixels * moveSign,
         y: Number(tokenDoc.y) + dy * pixels * moveSign,
      }
      next.x = Math.round(next.x / gridSize) * gridSize
      next.y = Math.round(next.y / gridSize) * gridSize
      return next
   }
   const distanceFromCenter = (position) =>
      Math.hypot(
         position.x + tokenWidth / 2 - center.x,
         position.y + tokenHeight / 2 - center.y,
      )
   const beforeDistance = distanceFromCenter({
      x: Number(tokenDoc.x),
      y: Number(tokenDoc.y),
   })
   let next = buildNext(sign)
   let afterDistance = distanceFromCenter(next)
   const opposite = buildNext(-sign)
   const oppositeDistance = distanceFromCenter(opposite)
   if (direction === "toward") {
      if (afterDistance > beforeDistance && oppositeDistance < afterDistance) next = opposite
   } else if (afterDistance < beforeDistance && oppositeDistance > afterDistance) {
      next = opposite
   }
   const best = bestSnappedMovement({
      current: { x: Number(tokenDoc.x), y: Number(tokenDoc.y) },
      center,
      tokenWidth,
      tokenHeight,
      gridSize,
      pixels,
      desired: { x: dx * sign, y: dy * sign },
      direction,
   })
   if (best) next = best
   afterDistance = distanceFromCenter(next)
   if (direction === "toward" && afterDistance >= beforeDistance) return false
   if (direction !== "toward" && afterDistance <= beforeDistance) return false
   await tokenDoc.update(next)
   return true
}

export async function applyRestrictionEffectToToken({
   tokenDoc,
   restrictions,
   duration,
   sourceItemUuid,
   flavor,
   region,
   messageId,
   triggerGroupKey,
   effectLifecycle,
} = {}) {
   const actor = tokenDoc?.actor
   const entries = normalizeRestrictions(restrictions)
   if (!actor || !entries.length) return false
   const regionUuid = region?.uuid ?? null
   const sourceUuid = sourceItemUuid ?? null
   const groupKey = triggerGroupKey ?? ""
   const cardMessageId = messageId ?? null
   const lockKey = [
      actor.uuid ?? actor.id ?? "",
      regionUuid ?? "",
      sourceUuid ?? "",
      groupKey,
      cardMessageId ?? "",
   ].join("|")
   if (RESTRICTION_EFFECT_LOCKS.has(lockKey)) return false
   RESTRICTION_EFFECT_LOCKS.add(lockKey)
   try {
      let srcItem = null
      if (sourceUuid) srcItem = await fromUuid(sourceUuid).catch(() => null)
      const existingIds = actor.items
         .filter((item) => {
            const flags = item.flags?.[MODULE_ID] ?? {}
            return (
               flags.restrictionEffect === true &&
               (flags.appliedByRegion ?? null) === regionUuid &&
               (flags.sourceItemUuid ?? null) === sourceUuid &&
               (flags.mtCardMessageId ?? null) === cardMessageId &&
               (flags.triggerGroupKey ?? "") === groupKey
            )
         })
         .map((item) => item.id)
         .filter(Boolean)
      if (existingIds.length) await actor.deleteEmbeddedDocuments("Item", existingIds)
      const effect = {
         type: "effect",
         name: `Restricted: ${flavor || srcItem?.name || "Template"}`,
         img: srcItem?.img || "icons/svg/padlock.svg",
         system: {
            rules: [],
            duration: normalizeRuntimeDuration(duration),
            start: { value: 0, initiative: null },
            description: { value: restrictionDescription(entries) },
            traits: { value: [], rarity: "common" },
            level: { value: 1 },
            tokenIcon: { show: true },
            unidentified: false,
         },
         flags: {
            [MODULE_ID]: {
               isParentEffect: true,
               restrictionEffect: true,
               restrictions: entries,
               appliedByRegion: regionUuid,
               sourceItemUuid: sourceUuid,
               mtCardMessageId: cardMessageId,
               triggerGroupKey: groupKey,
               effectLifecycle: !!effectLifecycle,
            },
         },
      }
      await actor.createEmbeddedDocuments("Item", [effect])
      return true
   } finally {
      RESTRICTION_EFFECT_LOCKS.delete(lockKey)
   }
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
      undefined
      return { ok: false, reason: "apply-failed" }
   }
}

export async function gmApplyCardHealing(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   try {
      const ok = await applyCardHealingToTarget(
         payload.targetUuid,
         payload.healing,
         payload.multiplier,
      )
      return ok
         ? { ok: true }
         : { ok: false, reason: "healing-not-applied" }
   } catch (_e) {
      return { ok: false, reason: "apply-failed" }
   }
}

export async function gmApplyRestrictionEffect(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const tokenDoc = await fromUuid(payload.targetUuid).catch(() => null)
   let region = null
   if (payload.regionUuid) region = await fromUuid(payload.regionUuid).catch(() => null)
   const ok = await applyRestrictionEffectToToken({
      tokenDoc,
      restrictions: payload.restrictions,
      duration: payload.duration,
      sourceItemUuid: payload.sourceItemUuid ?? null,
      flavor: payload.flavor ?? null,
      region,
      messageId: payload.messageId ?? null,
      triggerGroupKey: payload.triggerGroupKey ?? "",
      effectLifecycle: !!payload.effectLifecycle,
   })
   return ok ? { ok: true } : { ok: false, reason: "restriction-not-applied" }
}

export async function gmPersistCardMessage(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const messageId = String(payload.messageId ?? "")
   const content = typeof payload.content === "string" ? payload.content : null
   if (!messageId || !content) return { ok: false, reason: "invalid-payload" }

   const msg = game.messages?.get?.(messageId)
   if (!msg?.update) return { ok: false, reason: "missing-message" }
   if (!msg.getFlag?.(MODULE_ID, "card")) return { ok: false, reason: "not-atw-card" }

   const user = payload.userId ? game.users?.get?.(payload.userId) : null
   if (!user) return { ok: false, reason: "unknown-user" }
   if (!user?.isGM) {
      const targetUuid = String(payload.targetUuid ?? "")
      if (!targetUuid) return { ok: false, reason: "missing-target" }
      const tokenDoc = await fromUuid(targetUuid).catch(() => null)
      const actor = tokenDoc?.actor
      if (!actor?.testUserPermission?.(user, "OWNER")) {
         return { ok: false, reason: "not-owner" }
      }
   }

   const update = { content }
   if (Array.isArray(payload.rollDiceState)) {
      update[`flags.${MODULE_ID}.rollDiceState`] = payload.rollDiceState
   }

   try {
      await msg.update(update)
      return { ok: true }
   } catch (e) {
      undefined
      return { ok: false, reason: "update-failed" }
   }
}

function regionCenter(region) {
   const rectangleCenter = visibleRectangleCenter(region)
   if (rectangleCenter) return rectangleCenter
   const footprint = getRegionFootprint(region)
   const footprintBounds = footprint?.bounds
   if (footprintBounds) {
      const x = Number(footprintBounds.x)
      const y = Number(footprintBounds.y)
      const width = Number(footprintBounds.width)
      const height = Number(footprintBounds.height)
      if ([x, y, width, height].every(Number.isFinite)) {
         return { x: x + width / 2, y: y + height / 2, source: "footprint" }
      }
   }
   const bounds = region?.object?.bounds ?? region?.bounds
   if (bounds) {
      const x = Number(bounds.x)
      const y = Number(bounds.y)
      const width = Number(bounds.width)
      const height = Number(bounds.height)
      if ([x, y, width, height].every(Number.isFinite)) {
         return { x: x + width / 2, y: y + height / 2, source: "bounds" }
      }
   }
   const shapes = Array.isArray(region?.shapes)
      ? region.shapes
      : Array.isArray(region?.shapes?.contents)
        ? region.shapes.contents
        : []
   const points = []
   for (const shape of shapes) {
      const data = shape?.toObject?.() ?? shape
      const x = Number(data.x)
      const y = Number(data.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const width = Number(data.width ?? data.radius ?? data.size ?? 0)
      const height = Number(data.height ?? data.radius ?? data.size ?? 0)
      const length = Number(data.length ?? 0)
      points.push({
         x: x + Math.max(width, length) / 2,
         y: y + height / 2,
      })
   }
   if (!points.length) return null
   return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      source: "shapes",
   }
}

function visibleRectangleCenter(region) {
   const shape = firstRegionShape(region)
   if (shape?.type !== "rectangle") return null
   const bounds = region?.object?.bounds
   if (bounds) {
      const x = Number(bounds.x)
      const y = Number(bounds.y)
      const width = Number(bounds.width)
      const height = Number(bounds.height)
      if ([x, y, width, height].every(Number.isFinite)) {
         return { x: x + width / 2, y: y + height / 2, source: "visible-rectangle" }
      }
   }
   const x = Number(shape.x)
   const y = Number(shape.y)
   const width = Number(shape.width)
   const height = Number(shape.height)
   if (![x, y, width, height].every(Number.isFinite)) return null
   return { x: x + width / 2, y: y + height / 2, source: "rectangle-shape" }
}

function firstRegionShape(region) {
   const shapes = Array.isArray(region?.shapes)
      ? region.shapes
      : Array.isArray(region?.shapes?.contents)
        ? region.shapes.contents
        : []
   return shapes[0]?.toObject?.() ?? shapes[0] ?? null
}

function movementGridMetrics(tokenDoc, region) {
   const scene = tokenDoc?.parent ?? region?.parent ?? canvas?.scene
   const gridSize = Number(scene?.grid?.size ?? canvas?.grid?.size ?? 100) || 100
   const gridDistance = Number(scene?.grid?.distance ?? canvas?.scene?.grid?.distance ?? 5) || 5
   return { gridSize, gridDistance }
}

function bestSnappedMovement({
   current,
   center,
   tokenWidth,
   tokenHeight,
   gridSize,
   pixels,
   desired,
   direction,
}) {
   const before = Math.hypot(
      current.x + tokenWidth / 2 - center.x,
      current.y + tokenHeight / 2 - center.y,
   )
   const maxSteps = Math.max(1, Math.ceil(pixels / gridSize))
   let best = null
   let bestDistance = before
   for (let xStep = -maxSteps; xStep <= maxSteps; xStep += 1) {
      for (let yStep = -maxSteps; yStep <= maxSteps; yStep += 1) {
         if (xStep === 0 && yStep === 0) continue
         const moveX = xStep * gridSize
         const moveY = yStep * gridSize
         if (moveX * desired.x + moveY * desired.y <= 0) continue
         const position = {
            x: current.x + moveX,
            y: current.y + moveY,
         }
         const nextDistance = Math.hypot(
            position.x + tokenWidth / 2 - center.x,
            position.y + tokenHeight / 2 - center.y,
         )
         if (direction === "toward") {
            if (nextDistance < bestDistance - 0.001) {
               best = position
               bestDistance = nextDistance
            }
         } else if (nextDistance > bestDistance + 0.001) {
            best = position
            bestDistance = nextDistance
         }
      }
   }
   return best
}

function tokenWidthPx(tokenDoc, gridSize) {
   return (Number(tokenDoc.width) || 1) * gridSize
}

function tokenHeightPx(tokenDoc, gridSize) {
   return (Number(tokenDoc.height) || 1) * gridSize
}

function normalizeRuntimeDuration(duration) {
   if (!duration?.enabled) {
      return {
         value: -1,
         unit: "unlimited",
         sustained: false,
         expiry: "turn-start",
      }
   }
   const unit = ["rounds", "minutes", "hours", "days"].includes(duration.unit)
      ? duration.unit
      : "rounds"
   return {
      value: Math.max(1, Number(duration.amount) || 1),
      unit,
      sustained: false,
      expiry: "turn-start",
   }
}

function normalizeRestrictions(restrictions) {
   const allowedKinds = new Set(["spell", "strike", "move", "skill", "item", "ability"])
   const allowedSkills = new Set([
      "acrobatics",
      "arcana",
      "athletics",
      "crafting",
      "deception",
      "diplomacy",
      "intimidation",
      "medicine",
      "nature",
      "occultism",
      "performance",
      "religion",
      "society",
      "stealth",
      "survival",
      "thievery",
      "perception",
      "lore",
   ])
   return (Array.isArray(restrictions) ? restrictions : [])
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
         const kind = allowedKinds.has(entry.kind) ? entry.kind : "spell"
         const skill = allowedSkills.has(entry.skill) ? entry.skill : "athletics"
         return {
            kind,
            slug: String(entry.slug ?? "").trim(),
            rollOptions: String(entry.rollOptions ?? "").trim(),
            skill,
            lore: String(entry.lore ?? "").trim(),
         }
      })
}

function restrictionDescription(entries) {
   if (!entries.length) return ""
   const labels = entries.map((entry) => {
      if (entry.kind === "skill") {
         const skill = entry.skill === "lore" ? entry.lore || "lore" : entry.skill
         return `Restrict ${skill}`
      }
      return `Restrict ${entry.kind}`
   })
   return `<ul>${labels.map((label) => `<li>${escapeHTML(label)}</li>`).join("")}</ul>`
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
               undefined
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

      case "heal": {
         const amount = resolveRuntimeNumber(c.amount ?? 5, {
            tokenDoc,
            sourceItem: srcItem,
            region,
         })
         await applyCardHealingToTarget(tokenDoc.uuid, { total: amount, healingType: c.healingType ?? "untyped" })
         return
      }

      case "move": {
         await moveTokenByRegionVector(
            tokenDoc,
            region,
            c.direction === "toward" ? "toward" : "away",
            c.distance ?? 5,
         )
         return
      }

      case "restrict": {
         await applyRestrictionEffectToToken({
            tokenDoc,
            restrictions: c.restrictions,
            duration: c.duration,
            sourceItemUuid,
            flavor,
            region,
            messageId,
         })
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
            undefined
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
            undefined
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
            undefined
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
            target: actor,
            targetToken: tokenDoc,
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
