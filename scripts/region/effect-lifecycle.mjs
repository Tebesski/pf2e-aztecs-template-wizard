import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { executeAsGM } from "../runtime/index.mjs"
import { getActiveTemplateShapeType, getRegionFootprint } from "./geometry.mjs"
import { tryDocumentFromUuid } from "./documents.mjs"
import {
   getTokenGeometry,
   normalizeLifecycleGeometry,
   tokenGeometryPayload,
   tokenGridSignature,
   tokenTrackingKey,
} from "./effect-lifecycle-geometry.mjs"
export function registerEffectLifecycleHooks() {
   Hooks.on("preUpdateToken", onPreUpdateTokenForEffectLifecycle)
   Hooks.on("updateToken", onUpdateTokenForEffectLifecycle)
   Hooks.on("refreshToken", onRefreshTokenForEffectLifecycle)
   Hooks.on("combatTurnChange", onCombatTurnChange)
   Hooks.on("combatTurn", onCombatLegacyTurn)
   Hooks.on("combatRound", onCombatLegacyRound)
   Hooks.on("pf2e.startTurn", onPf2eStartTurn)
   Hooks.on("pf2e.endTurn", onPf2eEndTurn)
   startEffectLifecycleTokenMonitor()
}
const COMBAT_TURN_TICK = new WeakMap()
const TOKEN_PRE_UPDATE_STATE = new Map()
const LIFECYCLE_CONTACT_STATE = new Map()
const LIFECYCLE_CATCHUP_TIMERS = new Map()
const REMOTE_LIFECYCLE_CATCHUP_TIMERS = new Map()
const REMOTE_LIFECYCLE_GEOMETRY = new Map()
const LIFECYCLE_DISPATCHING = new Set()
const LIFECYCLE_RECENT_DISPATCH = new Map()
const LIFECYCLE_TOKEN_CELLS = new Map()
const ADJACENT_TURN_RECENT = new Map()
const LIFECYCLE_MONITOR_INTERVAL_MS = 350
const ADJACENT_TURN_DEDUPE_MS = 300
const REMOTE_LIFECYCLE_GEOMETRY_MS = 2000
const LIFECYCLE_DUPLICATE_EVENT_MS = 900

export function isCurrentUserActiveGM() {
   const activeGM = game.users?.activeGM
   return !!game.user?.isGM && (!activeGM || activeGM.id === game.user.id)
}
let LIFECYCLE_MONITOR_TIMER = null

function lifecycleContactKey(region, tokenDoc) {
   const tokenKey = tokenTrackingKey(tokenDoc)
   if (!region?.uuid || !tokenKey) return null
   return `${region.uuid}|${tokenKey}`
}

function rememberLifecycleContact(region, tokenDoc, contact) {
   const key = lifecycleContactKey(region, tokenDoc)
   if (!key) return
   LIFECYCLE_CONTACT_STATE.set(key, {
      inside: !!contact?.inside,
      adjacent: !!contact?.adjacent,
   })
}

export function getRememberedLifecycleContact(region, tokenDoc) {
   const key = lifecycleContactKey(region, tokenDoc)
   return key ? (LIFECYCLE_CONTACT_STATE.get(key) ?? null) : null
}

export function forgetLifecycleContactsForRegion(regionUuid) {
   if (!regionUuid) return
   const prefix = `${regionUuid}|`
   for (const key of LIFECYCLE_CONTACT_STATE.keys()) {
      if (key.startsWith(prefix)) LIFECYCLE_CONTACT_STATE.delete(key)
   }
}

export function lifecycleAdjacentActive(region, contact, triggers) {
   if (!contact) return false
   if (contact.adjacent) return true
   if (!contact.inside) return false
   if (Array.isArray(triggers) && triggers.includes("whileWithin")) return false
   return getActiveTemplateShapeType(region) === "line"
}

export function actorHasLifecycleState(actor, region, triggerGroupKey) {
   if (!actor || !region?.uuid || !triggerGroupKey) return false
   const hasParent = actor.items?.some?.(
      (i) =>
         i.flags?.[MODULE_ID]?.isParentEffect &&
         i.flags?.[MODULE_ID]?.appliedByRegion === region.uuid &&
         i.flags?.[MODULE_ID]?.triggerGroupKey === triggerGroupKey &&
         i.flags?.[MODULE_ID]?.effectLifecycle,
   )
   if (hasParent) return true
   const removals = actor.flags?.[MODULE_ID]?.reversibleRemovals
   return !!removals?.[region.uuid]?.[triggerGroupKey]
}

export function regionBehaviorList(region) {
   return Array.from(region?.behaviors ?? [])
}

function rememberRemoteLifecycleGeometry(tokenDoc, geometry) {
   const normalized = normalizeLifecycleGeometry(geometry)
   if (!normalized) return null
   const key = tokenTrackingKey(tokenDoc)
   if (!key) return normalized
   REMOTE_LIFECYCLE_GEOMETRY.set(key, {
      geometry: normalized,
      expiresAt: Date.now() + REMOTE_LIFECYCLE_GEOMETRY_MS,
   })
   return normalized
}

function recentRemoteLifecycleGeometry(tokenDoc) {
   const key = tokenTrackingKey(tokenDoc)
   if (!key) return null
   const entry = REMOTE_LIFECYCLE_GEOMETRY.get(key)
   if (!entry) return null
   if (Date.now() > entry.expiresAt) {
      REMOTE_LIFECYCLE_GEOMETRY.delete(key)
      return null
   }
   return entry.geometry
}

function regionHasEffectLifecycle(region) {
   return regionBehaviorList(region).some((behavior) => {
      if (behavior.disabled || behavior.type !== "executeScript") return false
      const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
      return (
         Array.isArray(triggers) &&
         (triggers.includes("whileAdjacent") ||
            triggers.includes("whileWithin"))
      )
   })
}

function sceneHasEffectLifecycleRegions(scene) {
   return Array.from(scene?.regions ?? []).some((region) =>
      regionHasEffectLifecycle(region),
   )
}

function startEffectLifecycleTokenMonitor() {
   if (LIFECYCLE_MONITOR_TIMER) return
   LIFECYCLE_MONITOR_TIMER = setInterval(() => {
      scanEffectLifecycleTokenPositions().catch((e) => {
         console.warn(`[${MODULE_ID}] lifecycle token monitor failed`, e)
      })
   }, LIFECYCLE_MONITOR_INTERVAL_MS)
}

async function scanEffectLifecycleTokenPositions() {
   if (!globalThis.canvas?.ready) return
   const isActiveGM = isCurrentUserActiveGM()
   if (game.user?.isGM && !isActiveGM) return
   const scene = canvas.scene
   if (isActiveGM && !sceneHasEffectLifecycleRegions(scene)) return

   const currentKeys = new Set()
   const tokens = canvas.tokens?.placeables?.length
      ? canvas.tokens.placeables
      : Array.from(scene.tokens ?? [])
   for (const tokenDoc of tokens) {
      if (!isActiveGM && !canRequestLifecycleCatchup(tokenDoc)) continue
      const key = tokenTrackingKey(tokenDoc)
      if (!key) continue
      currentKeys.add(key)
      const signature = tokenGridSignature(tokenDoc, scene)
      const prior = LIFECYCLE_TOKEN_CELLS.get(key)
      if (prior === signature) continue
      LIFECYCLE_TOKEN_CELLS.set(key, signature)
      scheduleLifecycleCatchupForToken(
         tokenDoc,
         prior ? "canvas-monitor" : "canvas-monitor-initial",
      )
   }

   for (const key of Array.from(LIFECYCLE_TOKEN_CELLS.keys())) {
      if (!currentKeys.has(key)) LIFECYCLE_TOKEN_CELLS.delete(key)
   }
}

function shouldHandleCombatTick(combat, tag) {
   if (!combat) return false
   const seen = COMBAT_TURN_TICK.get(combat) ?? new Set()
   if (seen.has(tag)) return false
   seen.add(tag)
   COMBAT_TURN_TICK.set(combat, seen)

   setTimeout(() => {
      const s = COMBAT_TURN_TICK.get(combat)
      if (s) s.delete(tag)
   }, 100)
   return true
}

function resolveCombatStateTokens(scene, stateOrCombatant, combat = null) {
   if (!stateOrCombatant || !scene) return []
   if (typeof stateOrCombatant.tokenId === "string") {
      const token = scene.tokens.get(stateOrCombatant.tokenId)
      return token ? [token] : []
   }
   if (typeof stateOrCombatant.combatantId === "string") {
      const combatant = combat?.combatants?.get?.(stateOrCombatant.combatantId)
      return resolveCombatantTokens(scene, combatant)
   }
   return resolveCombatantTokens(scene, stateOrCombatant)
}

function resolveCombatantTokens(scene, combatantOrToken) {
   if (!combatantOrToken || !scene) return []
   const tokens = []
   const add = (tokenLike) => {
      const tokenDoc = resolveSceneToken(scene, tokenLike)
      if (tokenDoc) tokens.push(tokenDoc)
   }
   if (Array.isArray(combatantOrToken.tokens)) {
      for (const token of combatantOrToken.tokens) add(token)
   }
   add(combatantOrToken.token)
   add(combatantOrToken)
   return uniqueTokenDocuments(tokens)
}

function resolveSceneToken(scene, tokenLike) {
   if (!tokenLike) return null
   const doc = tokenLike.document ?? tokenLike
   if (doc.parent === scene && doc.id) return doc
   if (typeof doc.id === "string") return scene.tokens.get(doc.id) ?? null
   if (typeof tokenLike.tokenId === "string")
      return scene.tokens.get(tokenLike.tokenId) ?? null
   return null
}

function uniqueTokenDocuments(tokens) {
   const out = []
   const seen = new Set()
   for (const token of tokens) {
      const key = token?.uuid ?? token?.id
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(token)
   }
   return out
}

function shouldDispatchAdjacentTurn(region, behavior, tokenDoc, eventName) {
   const key = [
      region?.uuid ?? region?.id,
      behavior?.id,
      tokenDoc?.uuid ?? tokenDoc?.id,
      eventName,
   ].join("|")
   const now = Date.now()
   const prior = ADJACENT_TURN_RECENT.get(key) ?? 0
   if (now - prior < ADJACENT_TURN_DEDUPE_MS) return false
   ADJACENT_TURN_RECENT.set(key, now)
   setTimeout(() => {
      if (ADJACENT_TURN_RECENT.get(key) === now)
         ADJACENT_TURN_RECENT.delete(key)
   }, ADJACENT_TURN_DEDUPE_MS + 50)
   return true
}

async function onCombatTurnChange(combat, prior, current) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!shouldHandleCombatTick(combat, "turnChange")) return
   const scene = combat?.scene ?? game.scenes.get(combat?.sceneId)
   if (!scene) return

   const priorTokenDocs = resolveCombatStateTokens(scene, prior, combat)
   const currentTokenDocs = resolveCombatStateTokens(scene, current, combat)

   await dispatchCombatTurnTriggers(scene, priorTokenDocs, currentTokenDocs)
}

async function onCombatLegacyTurn(combat, updateData, updateOptions) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!shouldHandleCombatTick(combat, "legacyTurn")) return
   const scene = combat?.scene ?? game.scenes.get(combat?.sceneId)
   if (!scene) return

   const turns = combat?.turns ?? []
   const newTurn = updateData?.turn ?? combat?.turn ?? 0
   const oldTurn = combat?.previous?.turn ?? Math.max(0, newTurn - 1)
   const priorCombatant = turns[oldTurn]
   const currentCombatant = turns[newTurn]
   const priorTokenDocs = resolveCombatantTokens(scene, priorCombatant)
   const currentTokenDocs = resolveCombatantTokens(scene, currentCombatant)

   await dispatchCombatTurnTriggers(scene, priorTokenDocs, currentTokenDocs)
}

async function onCombatLegacyRound(combat, updateData, updateOptions) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!shouldHandleCombatTick(combat, "legacyRound")) return
}

async function onPf2eStartTurn(combatant, encounter, userId) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   const scene = encounter?.scene ?? game.scenes.get(combatant?.sceneId)
   if (!scene) return
   const currentTokenDocs = resolveCombatantTokens(scene, combatant)
   await dispatchCombatTurnTriggers(scene, [], currentTokenDocs)
}

async function onPf2eEndTurn(combatant, encounter, userId) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   const scene = encounter?.scene ?? game.scenes.get(combatant?.sceneId)
   if (!scene) return
   const priorTokenDocs = resolveCombatantTokens(scene, combatant)
   await dispatchCombatTurnTriggers(scene, priorTokenDocs, [])
}

async function dispatchCombatTurnTriggers(
   scene,
   priorTokenDocs,
   currentTokenDocs,
) {
   priorTokenDocs = Array.isArray(priorTokenDocs)
      ? priorTokenDocs
      : priorTokenDocs
        ? [priorTokenDocs]
        : []
   currentTokenDocs = Array.isArray(currentTokenDocs)
      ? currentTokenDocs
      : currentTokenDocs
        ? [currentTokenDocs]
        : []
   for (const region of scene.regions) {
      const behaviors = regionBehaviorList(region)
      if (!behaviors.length) continue
      for (const behavior of behaviors) {
         if (behavior.disabled) continue
         if (behavior.type !== "executeScript") continue
         const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
         if (!Array.isArray(triggers)) continue

         const skipInsideForEnd = triggers.includes("tokenTurnEnd")
         const skipInsideForStart = triggers.includes("tokenTurnStart")

         if (triggers.includes("tokenAdjacentTurnEnd")) {
            for (const priorTokenDoc of priorTokenDocs) {
               await maybeDispatchAdjacentTurn(
                  region,
                  behavior,
                  priorTokenDoc,
                  "tokenTurnEnd",
                  skipInsideForEnd,
               )
            }
         }
         if (triggers.includes("tokenAdjacentTurnStart")) {
            for (const currentTokenDoc of currentTokenDocs) {
               await maybeDispatchAdjacentTurn(
                  region,
                  behavior,
                  currentTokenDoc,
                  "tokenTurnStart",
                  skipInsideForStart,
               )
            }
         }
      }
   }
}

async function maybeDispatchAdjacentTurn(
   region,
   behavior,
   tokenDoc,
   eventName,
   skipInside = false,
) {
   try {
      const scene = region.parent
      if (!scene) return
      const contact = tokenRegionContact(region, tokenDoc)
      if (contact.inside && skipInside) return
      const touches = contact.inside || contact.adjacent
      if (!touches) return
      if (!shouldDispatchAdjacentTurn(region, behavior, tokenDoc, eventName)) {
         return
      }

      const AsyncFunction = (async () => {}).constructor
      const src = behavior.system?.source
      if (!src) return
      let fn
      try {
         fn = new AsyncFunction("event", "region", "scene", "behavior", src)
      } catch (e) {
         console.warn(`[${MODULE_ID}] adjacent-turn script compile failed`, e)
         return
      }
      const syntheticEvent = { name: eventName, data: { token: tokenDoc } }
      try {
         await fn(syntheticEvent, region, scene, behavior)
      } catch (e) {
         console.warn(`[${MODULE_ID}] adjacent-turn script threw`, e)
      }
   } catch (e) {
      console.warn(`[${MODULE_ID}] maybeDispatchAdjacentTurn failed`, e)
   }
}

function isTokenGeometryUpdate(changes) {
   return ["x", "y", "width", "height"].some((k) =>
      Object.prototype.hasOwnProperty.call(changes ?? {}, k),
   )
}

export function tokenRegionContact(region, tokenDoc, override = null) {
   const footprint = getRegionFootprint(region)
   if (!footprint || footprint.cells.length === 0)
      return { inside: false, adjacent: false }
   const cellSet = footprint.cellSet
   const gridSize = footprint.gridSize
   const geometry = getTokenGeometry(tokenDoc, override)
   const tx = geometry.x
   const ty = geometry.y
   const w = geometry.width
   const h = geometry.height
   const baseCol = Math.floor(tx / gridSize)
   const baseRow = Math.floor(ty / gridSize)
   let inside = false
   for (let dr = 0; dr < h && !inside; dr++) {
      for (let dc = 0; dc < w && !inside; dc++) {
         if (cellSet.has(baseCol + dc + ":" + (baseRow + dr))) inside = true
      }
   }
   let adjacent = false
   if (!inside) {
      outer: for (let dr = -1; dr <= h; dr++) {
         for (let dc = -1; dc <= w; dc++) {
            if (cellSet.has(baseCol + dc + ":" + (baseRow + dr))) {
               adjacent = true
               break outer
            }
         }
      }
   }
   return { inside, adjacent }
}

export async function runBehaviorScript(region, behavior, tokenDoc, eventName) {
   if (!region || !behavior || !tokenDoc) {
      return { ok: false, reason: "missing region, behavior, or token" }
   }
   const scene = region.parent
   const src = behavior.system?.source
   if (!scene || !src) return { ok: false, reason: "missing scene or source" }
   const AsyncFunction = (async () => {}).constructor
   let fn
   try {
      fn = new AsyncFunction("event", "region", "scene", "behavior", src)
   } catch (e) {
      console.warn(`[${MODULE_ID}] effect lifecycle script compile failed`, e)
      return { ok: false, reason: "compile failed", error: e }
   }
   try {
      await fn(
         { name: eventName, data: { token: tokenDoc } },
         region,
         scene,
         behavior,
      )
      return { ok: true, eventName }
   } catch (e) {
      console.warn(`[${MODULE_ID}] effect lifecycle script threw`, e)
      return { ok: false, reason: "script threw", error: e }
   }
}

async function dispatchLifecycleScript(region, behavior, tokenDoc, eventName) {
   const tokenKey = tokenTrackingKey(tokenDoc)
   const groupKey =
      behavior.flags?.[FLAG_SCOPE]?.triggerGroupKey ??
      behavior.id ??
      "lifecycle"
   const key = `${region?.uuid ?? ""}|${tokenKey ?? ""}|${groupKey}`
   if (LIFECYCLE_DISPATCHING.has(key)) return { ok: false, reason: "busy" }
   const recent = LIFECYCLE_RECENT_DISPATCH.get(key)
   const now = Date.now()
   if (
      recent?.eventName === eventName &&
      now - recent.time < LIFECYCLE_DUPLICATE_EVENT_MS
   ) {
      return { ok: false, reason: "duplicate" }
   }
   LIFECYCLE_DISPATCHING.add(key)
   try {
      const result = await runBehaviorScript(
         region,
         behavior,
         tokenDoc,
         eventName,
      )
      if (result?.ok) {
         LIFECYCLE_RECENT_DISPATCH.set(key, { eventName, time: Date.now() })
      }
      return result
   } finally {
      LIFECYCLE_DISPATCHING.delete(key)
   }
}

function scheduleLifecycleCatchupForToken(tokenDoc, reason = "token-update") {
   if (!game.user?.isGM) {
      scheduleRemoteLifecycleCatchupForToken(tokenDoc, reason)
      return
   }
   const key = tokenTrackingKey(tokenDoc)
   if (!key) return
   const prior = LIFECYCLE_CATCHUP_TIMERS.get(key)
   if (prior) clearTimeout(prior)
   const timer = setTimeout(() => {
      LIFECYCLE_CATCHUP_TIMERS.delete(key)
      catchupEffectLifecycleForToken(tokenDoc, reason).catch((e) => {
         console.warn(`[${MODULE_ID}] lifecycle catch-up failed`, e)
      })
   }, 100)
   LIFECYCLE_CATCHUP_TIMERS.set(key, timer)
}

function scheduleRemoteLifecycleCatchupForToken(
   tokenDoc,
   reason = "token-update",
) {
   if (!canRequestLifecycleCatchup(tokenDoc)) return
   const key = tokenTrackingKey(tokenDoc)
   if (!key) return
   const prior = REMOTE_LIFECYCLE_CATCHUP_TIMERS.get(key)
   if (prior) clearTimeout(prior)
   const tokenUuid = tokenDoc.document?.uuid ?? tokenDoc.uuid
   const geometry = tokenGeometryPayload(tokenDoc)
   const timer = setTimeout(() => {
      REMOTE_LIFECYCLE_CATCHUP_TIMERS.delete(key)
      executeAsGM(
         "catchupEffectLifecycleForToken",
         tokenUuid,
         `player-${reason}`,
         geometry,
      ).catch((e) => {
         console.warn(`[${MODULE_ID}] remote lifecycle catch-up failed`, e)
      })
   }, 100)
   REMOTE_LIFECYCLE_CATCHUP_TIMERS.set(key, timer)
}

function canRequestLifecycleCatchup(tokenDoc) {
   if (!tokenDoc || game.user?.isGM) return false
   const doc = tokenDoc.document ?? tokenDoc
   const actor = doc.actor ?? tokenDoc.actor
   if (!actor?.testUserPermission?.(game.user, "OWNER")) return false
   return true
}

export async function gmCatchupEffectLifecycleForToken(
   tokenUuid,
   reason = "socket-catch-up",
   geometryOverride = null,
) {
   if (!isCurrentUserActiveGM()) return { ok: false, reason: "not-active-gm" }
   const tokenDoc = await tryDocumentFromUuid(tokenUuid)
   if (!tokenDoc?.actor) return { ok: false, reason: "missing-token" }
   const geometry = rememberRemoteLifecycleGeometry(tokenDoc, geometryOverride)
   await catchupEffectLifecycleForToken(tokenDoc, reason, geometry)
   return { ok: true }
}

async function catchupEffectLifecycleForToken(
   tokenDoc,
   reason = "catch-up",
   geometryOverride = null,
) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   const scene = tokenDoc?.document?.parent ?? tokenDoc.parent ?? canvas.scene
   if (!scene) return
   const actor = tokenDoc.actor ?? tokenDoc.document?.actor
   const geometry =
      normalizeLifecycleGeometry(geometryOverride) ??
      recentRemoteLifecycleGeometry(tokenDoc)

   for (const region of scene.regions) {
      const behaviors = regionBehaviorList(region)
      if (!behaviors.length) continue
      const contact = tokenRegionContact(region, tokenDoc, geometry)
      rememberLifecycleContact(region, tokenDoc, contact)
      for (const behavior of behaviors) {
         if (behavior.disabled || behavior.type !== "executeScript") continue
         const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
         if (!Array.isArray(triggers) || !triggers.includes("whileAdjacent"))
            continue
         const groupKey = behavior.flags?.[FLAG_SCOPE]?.triggerGroupKey ?? ""
         const active = lifecycleAdjacentActive(region, contact, triggers)
         const hasLifecycleState = actorHasLifecycleState(
            actor,
            region,
            groupKey,
         )
         let eventName = null
         if (active && !hasLifecycleState) eventName = "atwAdjacentEnter"
         else if (!active && hasLifecycleState) eventName = "atwAdjacentExit"
         if (!eventName) continue
         await dispatchLifecycleScript(region, behavior, tokenDoc, eventName)
      }
   }
}

async function onPreUpdateTokenForEffectLifecycle(tokenDoc, changes) {
   if (!isTokenGeometryUpdate(changes)) return
   const key = tokenTrackingKey(tokenDoc)
   if (!key) return
   TOKEN_PRE_UPDATE_STATE.set(key, {
      x: tokenDoc.x,
      y: tokenDoc.y,
      width: tokenDoc.width,
      height: tokenDoc.height,
   })
}

async function onUpdateTokenForEffectLifecycle(
   tokenDoc,
   changes,
   options,
   userId,
) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!isTokenGeometryUpdate(changes)) return
   const scene = tokenDoc.parent ?? canvas.scene
   if (!scene) return
   const tokenKey = tokenTrackingKey(tokenDoc)
   const before = tokenKey
      ? (TOKEN_PRE_UPDATE_STATE.get(tokenKey) ?? null)
      : null
   if (tokenKey) TOKEN_PRE_UPDATE_STATE.delete(tokenKey)

   for (const region of scene.regions) {
      const behaviors = regionBehaviorList(region)
      if (!behaviors.length) continue
      const rememberedContact = before
         ? null
         : getRememberedLifecycleContact(region, tokenDoc)
      const remoteGeometry = recentRemoteLifecycleGeometry(tokenDoc)
      const beforeContact = remoteGeometry
         ? rememberedContact
         : before
           ? tokenRegionContact(region, tokenDoc, before)
           : rememberedContact
      const afterContact = tokenRegionContact(region, tokenDoc, remoteGeometry)
      rememberLifecycleContact(region, tokenDoc, afterContact)
      for (const behavior of behaviors) {
         if (behavior.disabled || behavior.type !== "executeScript") continue
         const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
         if (!Array.isArray(triggers) || !triggers.includes("whileAdjacent"))
            continue
         const groupKey = behavior.flags?.[FLAG_SCOPE]?.triggerGroupKey ?? ""
         const hasLifecycleState = actorHasLifecycleState(
            tokenDoc.actor,
            region,
            groupKey,
         )
         const beforeAdjacent = beforeContact
            ? lifecycleAdjacentActive(region, beforeContact, triggers)
            : hasLifecycleState
         const afterAdjacent = lifecycleAdjacentActive(
            region,
            afterContact,
            triggers,
         )
         let eventName = null
         if (afterAdjacent && !hasLifecycleState) {
            eventName = "atwAdjacentEnter"
         } else if (beforeAdjacent !== afterAdjacent) {
            eventName = afterAdjacent ? "atwAdjacentEnter" : "atwAdjacentExit"
         }
         if (!eventName) continue
         await dispatchLifecycleScript(region, behavior, tokenDoc, eventName)
      }
   }
   scheduleLifecycleCatchupForToken(tokenDoc, "post-token-update")
}

function onRefreshTokenForEffectLifecycle(token) {
   const tokenDoc = token ?? null
   if (!tokenDoc) return
   const scene = tokenDoc.document?.parent ?? tokenDoc.parent ?? canvas.scene
   if (game.user?.isGM && !sceneHasEffectLifecycleRegions(scene)) return
   const key = tokenTrackingKey(tokenDoc)
   if (!key) return
   const signature = tokenGridSignature(tokenDoc, scene)
   const prior = LIFECYCLE_TOKEN_CELLS.get(key)
   if (prior === signature) return
   LIFECYCLE_TOKEN_CELLS.set(key, signature)
   scheduleLifecycleCatchupForToken(
      tokenDoc,
      prior ? "refresh-token" : "refresh-token-initial",
   )
}

export async function applyLifecycleInitialStates(region) {
   const scene = region.parent
   const behaviors = regionBehaviorList(region)
   if (!scene || !behaviors.length) return
   for (const behavior of behaviors) {
      if (behavior.disabled || behavior.type !== "executeScript") continue
      const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
      if (!Array.isArray(triggers)) continue
      const wantsWithin = triggers.includes("whileWithin")
      const wantsAdjacent = triggers.includes("whileAdjacent")
      if (!wantsWithin && !wantsAdjacent) continue
      for (const tokenDoc of scene.tokens) {
         const contact = tokenRegionContact(region, tokenDoc)
         rememberLifecycleContact(region, tokenDoc, contact)
         if (wantsWithin && contact.inside) {
            await dispatchLifecycleScript(
               region,
               behavior,
               tokenDoc,
               "tokenEnter",
            )
         } else if (
            wantsAdjacent &&
            lifecycleAdjacentActive(region, contact, triggers)
         ) {
            await dispatchLifecycleScript(
               region,
               behavior,
               tokenDoc,
               "atwAdjacentEnter",
            )
         }
      }
   }
}

export function scheduleLifecycleInitialStateCatchup(region) {
   const regionUuid = region?.uuid
   setTimeout(() => {
      const currentRegion =
         regionUuid && typeof fromUuidSync === "function"
            ? fromUuidSync(regionUuid)
            : region
      if (!currentRegion?.parent) return
      applyLifecycleInitialStates(currentRegion).catch((e) => {
         console.warn(
            `[${MODULE_ID}] delayed lifecycle initial dispatch failed`,
            e,
         )
      })
   }, 150)
}
