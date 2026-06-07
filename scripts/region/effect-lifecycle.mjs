import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { executeAsGM } from "../runtime/index.mjs"
import {
   getActiveTemplateShapeType,
   getRegionFootprint,
   getWizardShapeOverride,
} from "./geometry.mjs"
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
   Hooks.on("pf2e.startTurn", onPf2eStartTurn)
   Hooks.on("pf2e.endTurn", onPf2eEndTurn)
   startEffectLifecycleTokenMonitor()
}
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

function debugTurn(_label, _payload = {}) {}

function debugLifecycle(label, payload = {}) {
   if (!globalThis.atwDebugLifecycle && !globalThis.atwDebugContact) return
   console.info(`[atw lifecycle] ${label}`, payload)
}

function debugContact(label, payload = {}) {
   if (!globalThis.atwDebugContact && !globalThis.atwDebugLifecycle) return
   console.info(`[atw contact] ${label}`, payload)
}

function tokenDebug(tokenDoc) {
   const doc = tokenDoc?.document ?? tokenDoc
   return doc
      ? {
           id: doc.id,
           uuid: doc.uuid,
           name: doc.name,
           actor: doc.actor?.name,
           x: doc.x,
           y: doc.y,
           width: doc.width,
           height: doc.height,
        }
      : null
}

function combatantDebug(combatant) {
   return combatant
      ? {
           id: combatant.id,
           tokenId: combatant.tokenId,
           actor: combatant.actor?.name,
           token: combatant.token?.name,
           turn: combatant.parent?.turn,
           round: combatant.parent?.round,
        }
      : null
}

function behaviorDebug(behavior) {
   const flags = behavior?.flags?.[FLAG_SCOPE] ?? {}
   return behavior
      ? {
           id: behavior.id,
           type: behavior.type,
           disabled: !!behavior.disabled,
           events: behavior.system?.events ?? [],
           behaviorType: flags.behaviorType,
           triggers: flags.triggers ?? [],
           triggerGroupKey: flags.triggerGroupKey ?? "",
           hasSource: !!behavior.system?.source,
        }
      : null
}

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

function lifecycleWithinActive(contact, triggers) {
   return !!contact?.inside && Array.isArray(triggers) && triggers.includes("whileWithin")
}

function lifecycleBehaviorActive(region, contact, triggers) {
   return (
      lifecycleWithinActive(contact, triggers) ||
      (Array.isArray(triggers) &&
         triggers.includes("whileAdjacent") &&
         lifecycleAdjacentActive(region, contact, triggers))
   )
}

function lifecycleEnterEvent(region, contact, triggers) {
   if (lifecycleWithinActive(contact, triggers)) return "tokenEnter"
   if (
      Array.isArray(triggers) &&
      triggers.includes("whileAdjacent") &&
      lifecycleAdjacentActive(region, contact, triggers)
   )
      return "atwAdjacentEnter"
   return null
}

function lifecycleExitEvent(triggers) {
   return Array.isArray(triggers) && triggers.includes("whileWithin")
      ? "atwWithinExit"
      : "atwAdjacentExit"
}

function lifecycleTriggerGroupKey(behavior, triggers) {
   return (
      behavior.flags?.[FLAG_SCOPE]?.triggerGroupKey ??
      ((Array.isArray(triggers) ? triggers.slice().sort().join("|") : "") ||
         "default")
   )
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
   const hasRestriction = actor.items?.some?.((i) => {
      const flags = i.flags?.[MODULE_ID] ?? {}
      return (
         flags.restrictionEffect &&
         flags.appliedByRegion === region.uuid &&
         (flags.effectLifecycle || !flags.triggerGroupKey) &&
         (!flags.triggerGroupKey || flags.triggerGroupKey === triggerGroupKey)
      )
   })
   if (hasParent || hasRestriction) return true
   const removals = actor.flags?.[MODULE_ID]?.reversibleRemovals
   return !!removals?.[region.uuid]?.[triggerGroupKey]
}

export function regionBehaviorList(region) {
   return collectionValues(region?.behaviors)
}

function isExecuteScriptBehavior(behavior) {
   const type = String(behavior?.type ?? "")
   return type === "executeScript" || type.endsWith(".executeScript")
}

function collectionValues(collection) {
   if (!collection) return []
   if (Array.isArray(collection)) return collection.filter(Boolean)
   if (Array.isArray(collection.contents)) return collection.contents.filter(Boolean)
   if (typeof collection.values === "function") return Array.from(collection.values()).filter(Boolean)
   if (typeof collection[Symbol.iterator] === "function") return Array.from(collection).filter(Boolean)
   return Object.values(collection).filter((value) => value && typeof value === "object")
}

function sceneRegionList(scene) {
   const sceneRegions = collectionValues(scene?.regions)
   const canvasScene = canvas?.scene
   const useCanvasFallback =
      canvasScene && (!scene || canvasScene.id === scene.id || sceneRegions.length === 0)
   const canvasRegions =
      useCanvasFallback
         ? collectionValues(canvasScene.regions)
         : []
   const placeableRegions =
      useCanvasFallback
         ? collectionValues(canvas?.regions?.placeables).map((placeable) => placeable.document ?? placeable)
         : []
   const seen = new Set()
   const out = []
   for (const region of [...sceneRegions, ...canvasRegions, ...placeableRegions]) {
      const key = region?.uuid ?? region?.id
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(region)
   }
   return out
}

function sceneTokenList(scene) {
   const sceneTokens = collectionValues(scene?.tokens)
   const canvasScene = canvas?.scene
   const canvasTokens =
      canvasScene && (!scene || canvasScene.id === scene.id)
         ? collectionValues(canvasScene.tokens)
         : []
   const placeableTokens =
      canvasScene && (!scene || canvasScene.id === scene.id)
         ? collectionValues(canvas?.tokens?.placeables).map((placeable) => placeable.document ?? placeable)
         : []
   const seen = new Set()
   const out = []
   for (const token of [...sceneTokens, ...canvasTokens, ...placeableTokens]) {
      const key = token?.uuid ?? token?.id
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(token)
   }
   return out
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
      if (behavior.disabled || !isExecuteScriptBehavior(behavior)) return false
      const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
      return (
         Array.isArray(triggers) &&
         (triggers.includes("whileAdjacent") ||
            triggers.includes("whileWithin"))
      )
   })
}

function sceneHasEffectLifecycleRegions(scene) {
   return sceneRegionList(scene).some((region) =>
      regionHasEffectLifecycle(region),
   )
}

function startEffectLifecycleTokenMonitor() {
   if (LIFECYCLE_MONITOR_TIMER) return
   LIFECYCLE_MONITOR_TIMER = setInterval(() => {
      scanEffectLifecycleTokenPositions().catch((e) => {
         undefined
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
      : sceneTokenList(scene)
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

function resolveCombatantTokens(scene, combatantOrToken) {
   if (!combatantOrToken || !scene) {
      debugTurn("resolve combatant tokens skipped", {
         hasCombatant: !!combatantOrToken,
         scene: scene?.id,
      })
      return []
   }
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
   const resolved = uniqueTokenDocuments(tokens)
   debugTurn("resolve combatant tokens", {
      combatant: combatantDebug(combatantOrToken),
      resolved: resolved.map(tokenDebug),
   })
   return resolved
}

function resolveSceneToken(scene, tokenLike) {
   if (!tokenLike) return null
   if (typeof tokenLike.tokenId === "string") {
      const token = getSceneToken(scene, tokenLike.tokenId)
      if (token) return token
   }
   const doc = tokenLike.document ?? tokenLike
   if (doc.parent === scene && doc.id) return doc
   if (doc !== tokenLike && typeof doc.tokenId === "string") {
      const token = getSceneToken(scene, doc.tokenId)
      if (token) return token
   }
   if (typeof doc.id === "string") return getSceneToken(scene, doc.id)
   return null
}

function getSceneToken(scene, id) {
   if (!id) return null
   const direct = scene?.tokens?.get?.(id)
   if (direct) return direct
   return sceneTokenList(scene).find((token) => token?.id === id) ?? null
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

function actorKeyForToken(tokenDoc) {
   const doc = tokenDoc?.document ?? tokenDoc
   const actor = doc?.actor
   return actor?.uuid ?? actor?.id ?? null
}

function resolveTokenForRegion(region, tokenDoc) {
   const scene = region?.parent
   const doc = tokenDoc?.document ?? tokenDoc
   if (!scene || !doc) return doc ?? tokenDoc
   if (doc.parent === scene) return doc
   const byId = getSceneToken(scene, doc.id)
   if (byId) return byId
   const actorKey = actorKeyForToken(doc)
   if (!actorKey) return doc
   return (
      sceneTokenList(scene).find((candidate) => actorKeyForToken(candidate) === actorKey) ??
      doc
   )
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
   if (now - prior < ADJACENT_TURN_DEDUPE_MS) {
      debugTurn("skip duplicate dispatch", {
         region: region?.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(tokenDoc),
         eventName,
      })
      return false
   }
   ADJACENT_TURN_RECENT.set(key, now)
   setTimeout(() => {
      if (ADJACENT_TURN_RECENT.get(key) === now)
         ADJACENT_TURN_RECENT.delete(key)
   }, ADJACENT_TURN_DEDUPE_MS + 50)
   return true
}

async function onPf2eStartTurn(combatant, encounter, userId) {
   debugTurn("hook pf2e.startTurn", {
      activeGM: game.users?.activeGM?.id,
      currentUser: game.user?.id,
      hookUser: userId,
      isActiveGM: isCurrentUserActiveGM(),
      combatant: combatantDebug(combatant),
      encounter: encounter?.id,
   })
   if (!isCurrentUserActiveGM()) return
   const scene = encounter?.scene ?? game.scenes.get(combatant?.sceneId) ?? canvas?.scene
   if (!scene) {
      debugTurn("pf2e.startTurn missing scene", {
         combatant: combatantDebug(combatant),
         sceneId: combatant?.sceneId,
         encounter: encounter?.id,
      })
      return
   }
   const currentTokenDocs = resolveCombatantTokens(scene, combatant)
   await dispatchCombatTurnTriggers(scene, [], currentTokenDocs)
}

async function onPf2eEndTurn(combatant, encounter, userId) {
   debugTurn("hook pf2e.endTurn", {
      activeGM: game.users?.activeGM?.id,
      currentUser: game.user?.id,
      hookUser: userId,
      isActiveGM: isCurrentUserActiveGM(),
      combatant: combatantDebug(combatant),
      encounter: encounter?.id,
   })
   if (!isCurrentUserActiveGM()) return
   const scene = encounter?.scene ?? game.scenes.get(combatant?.sceneId) ?? canvas?.scene
   if (!scene) {
      debugTurn("pf2e.endTurn missing scene", {
         combatant: combatantDebug(combatant),
         sceneId: combatant?.sceneId,
         encounter: encounter?.id,
      })
      return
   }
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
   debugTurn("dispatch combat turn triggers", {
      scene: scene?.id,
      regions: sceneRegionList(scene).length,
      sceneRegionCount: collectionValues(scene?.regions).length,
      canvasScene: canvas?.scene?.id,
      canvasRegionCount: sceneRegionList(canvas?.scene).length,
      priorTokens: priorTokenDocs.map(tokenDebug),
      currentTokens: currentTokenDocs.map(tokenDebug),
   })
   for (const region of sceneRegionList(scene)) {
      const behaviors = regionBehaviorList(region)
      debugTurn("inspect region turn behaviors", {
         region: region.uuid,
         name: region.name,
         managed: !!region.getFlag?.(FLAG_SCOPE, "managed"),
         behaviorCount: behaviors.length,
         behaviors: behaviors.map(behaviorDebug),
      })
      if (!behaviors.length) continue
      for (const behavior of behaviors) {
         if (behavior.disabled) {
            debugTurn("skip disabled behavior", {
               region: region.uuid,
               behavior: behaviorDebug(behavior),
            })
            continue
         }
         if (!isExecuteScriptBehavior(behavior)) {
            debugTurn("skip non-script behavior", {
               region: region.uuid,
               behavior: behaviorDebug(behavior),
            })
            continue
         }
         const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
         if (!Array.isArray(triggers)) {
            debugTurn("skip behavior without trigger array", {
               region: region.uuid,
               behavior: behaviorDebug(behavior),
               triggers,
            })
            continue
         }

         const skipInsideForEnd = triggers.includes("tokenTurnEnd")
         const skipInsideForStart = triggers.includes("tokenTurnStart")
         debugTurn("evaluate turn behavior", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            skipInsideForEnd,
            skipInsideForStart,
         })

         if (triggers.includes("tokenTurnEnd")) {
            for (const priorTokenDoc of priorTokenDocs) {
               await maybeDispatchInsideTurn(
                  region,
                  behavior,
                  priorTokenDoc,
                  "tokenTurnEnd",
               )
            }
         }
         if (triggers.includes("tokenTurnStart")) {
            for (const currentTokenDoc of currentTokenDocs) {
               await maybeDispatchInsideTurn(
                  region,
                  behavior,
                  currentTokenDoc,
                  "tokenTurnStart",
               )
            }
         }
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

async function maybeDispatchInsideTurn(region, behavior, tokenDoc, eventName) {
   try {
      const scene = region.parent
      if (!scene) {
         debugTurn("inside turn missing scene", {
            region: region?.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(tokenDoc),
            eventName,
         })
         return
      }
      const regionTokenDoc = resolveTokenForRegion(region, tokenDoc)
      const contact = tokenRegionContact(region, regionTokenDoc)
      debugTurn("inside turn contact", {
         region: region.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(regionTokenDoc),
         originalToken: tokenDebug(tokenDoc),
         eventName,
         contact,
      })
      if (!contact.inside) {
         debugTurn("inside turn skipped outside", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
            contact,
         })
         return
      }
      if (!shouldDispatchAdjacentTurn(region, behavior, regionTokenDoc, eventName)) {
         debugTurn("inside turn skipped dedupe", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
         return
      }

      const AsyncFunction = (async () => {}).constructor
      const src = behavior.system?.source
      if (!src) {
         debugTurn("inside turn missing source", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
         return
      }
      let fn
      try {
         fn = new AsyncFunction("event", "region", "scene", "behavior", src)
      } catch (e) {
         undefined
         return
      }
      const syntheticEvent = { name: eventName, data: { token: regionTokenDoc } }
      try {
         debugTurn("inside turn execute script", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
         await fn(syntheticEvent, region, scene, behavior)
         debugTurn("inside turn script completed", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
      } catch (e) {
         undefined
      }
   } catch (e) {
      undefined
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
      if (!scene) {
         debugTurn("adjacent turn missing scene", {
            region: region?.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(tokenDoc),
            eventName,
            skipInside,
         })
         return
      }
      const regionTokenDoc = resolveTokenForRegion(region, tokenDoc)
      const contact = tokenRegionContact(region, regionTokenDoc)
      debugTurn("adjacent turn contact", {
         region: region.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(regionTokenDoc),
         originalToken: tokenDebug(tokenDoc),
         eventName,
         skipInside,
         contact,
      })
      if (contact.inside && skipInside) {
         debugTurn("adjacent turn skipped inside handled elsewhere", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
            contact,
         })
         return
      }
      const touches = contact.inside || contact.adjacent
      if (!touches) {
         debugTurn("adjacent turn skipped no contact", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
            contact,
         })
         return
      }
      if (!shouldDispatchAdjacentTurn(region, behavior, regionTokenDoc, eventName)) {
         debugTurn("adjacent turn skipped dedupe", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
         return
      }

      const AsyncFunction = (async () => {}).constructor
      const src = behavior.system?.source
      if (!src) {
         debugTurn("adjacent turn missing source", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
         return
      }
      let fn
      try {
         fn = new AsyncFunction("event", "region", "scene", "behavior", src)
      } catch (e) {
         undefined
         return
      }
      const syntheticEvent = { name: eventName, data: { token: regionTokenDoc } }
      try {
         debugTurn("adjacent turn execute script", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
         await fn(syntheticEvent, region, scene, behavior)
         debugTurn("adjacent turn script completed", {
            region: region.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(regionTokenDoc),
            originalToken: tokenDebug(tokenDoc),
            eventName,
         })
      } catch (e) {
         undefined
      }
   } catch (e) {
      undefined
   }
}

function isTokenGeometryUpdate(changes) {
   return ["x", "y", "width", "height"].some((k) =>
      Object.prototype.hasOwnProperty.call(changes ?? {}, k),
   )
}

export function tokenRegionContact(region, tokenDoc, override = null) {
   const ringContact = tokenRingRegionContact(region, tokenDoc, override)
   if (ringContact) return ringContact
   const footprint = getRegionFootprint(region)
   if (!footprint || footprint.cells.length === 0)
      return { inside: false, adjacent: false }
   const { contact, geometry, tokenCells } = footprintTokenContact(
      tokenDoc,
      override,
      footprint,
   )
   debugContact("footprint", {
      region: regionContactDebug(region, footprint),
      token: tokenDebug(tokenDoc),
      geometry,
      tokenCells,
      contact,
   })
   return contact
}

function footprintTokenContact(tokenDoc, override, footprint) {
   const cellSet = footprint?.cellSet
   const gridSize = footprint?.gridSize
   const geometry = getTokenGeometry(tokenDoc, override)
   if (!cellSet || !gridSize) {
      return { contact: { inside: false, adjacent: false }, geometry, tokenCells: [] }
   }
   const tokenCells = tokenFootprintCells(geometry, gridSize)
   const inside = tokenCells.some((cell) => cellSet.has(cellKey(cell.col, cell.row)))
   let adjacent = false
   if (!inside) {
      outer: for (const cell of tokenCells) {
         for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
               if (dc === 0 && dr === 0) continue
               if (cellSet.has(cellKey(cell.col + dc, cell.row + dr))) {
                  adjacent = true
                  break outer
               }
            }
         }
      }
   }
   const contact = { inside, adjacent }
   return { contact, geometry, tokenCells }
}

function tokenFootprintCells(geometry, gridSize) {
   const x = Number(geometry.x)
   const y = Number(geometry.y)
   const width = Math.max(1, Number(geometry.width) || 1) * gridSize
   const height = Math.max(1, Number(geometry.height) || 1) * gridSize
   if (![x, y, width, height].every(Number.isFinite)) return []
   const epsilon = 0.01
   const startCol = Math.floor((x + epsilon) / gridSize)
   const endCol = Math.floor((x + width - epsilon) / gridSize)
   const startRow = Math.floor((y + epsilon) / gridSize)
   const endRow = Math.floor((y + height - epsilon) / gridSize)
   const cells = []
   for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
         cells.push({ col, row })
      }
   }
   return cells
}

function cellKey(col, row) {
   return col + ":" + row
}

function regionContactDebug(region, footprint = null) {
   const shape = firstRegionShape(region)
   return {
      id: region?.id,
      uuid: region?.uuid,
      name: region?.name,
      shape,
      activeShape: getActiveTemplateShapeType(region),
      footprintBounds: footprint?.bounds ?? null,
      footprintCells: footprint?.cells?.length ?? 0,
   }
}

function firstRegionShape(region) {
   const shapes = Array.isArray(region?.shapes)
      ? region.shapes
      : Array.isArray(region?.shapes?.contents)
        ? region.shapes.contents
        : []
   return shapes[0]?.toObject?.() ?? shapes[0] ?? null
}

function tokenRingRegionContact(region, tokenDoc, override = null) {
   if (getActiveTemplateShapeType(region) !== "ring") return null
   const footprint = getRegionFootprint(region)
   const ring = ringContactShape(region)
   const gridSize = footprint?.gridSize ?? region?.parent?.grid?.size ?? 100
   const geometry = getTokenGeometry(tokenDoc, override)
   if (!ring || !Number.isFinite(gridSize) || gridSize <= 0)
      return { inside: false, adjacent: false }
   return classifyRingGeometryContact(geometry, ring, gridSize)
}

function classifyRingGeometryContact(geometry, ring, gridSize) {
   const rect = tokenGeometryRect(geometry, gridSize)
   if (!rect) return { inside: false, adjacent: false }
   const edgeEpsilon = Math.max(0.5, gridSize * 0.005)
   const centerDistance = Math.hypot(rect.centerX - ring.x, rect.centerY - ring.y)
   if (
      centerDistance > ring.inner + edgeEpsilon &&
      centerDistance <= ring.outer + edgeEpsilon
   )
      return { inside: true, adjacent: false }
   if (centerDistance <= ring.inner + edgeEpsilon) {
      const maxDistance = maxDistanceFromPointToRectCorners(ring, rect)
      return {
         inside: false,
         adjacent: maxDistance >= ring.inner - gridSize / 2 - edgeEpsilon,
      }
   }
   const minDistance = distanceFromPointToRect(ring, rect)
   return {
      inside: false,
      adjacent: minDistance <= ring.outer + gridSize * 1.5 + edgeEpsilon,
   }
}

function tokenGeometryRect(geometry, gridSize) {
   const x = Number(geometry?.x)
   const y = Number(geometry?.y)
   const width = Math.max(0.01, Number(geometry?.width) || 1) * gridSize
   const height = Math.max(0.01, Number(geometry?.height) || 1) * gridSize
   if (![x, y, width, height].every(Number.isFinite)) return null
   return {
      x,
      y,
      width,
      height,
      right: x + width,
      bottom: y + height,
      centerX: x + width / 2,
      centerY: y + height / 2,
   }
}

function distanceFromPointToRect(point, rect) {
   const dx =
      point.x < rect.x ? rect.x - point.x : point.x > rect.right ? point.x - rect.right : 0
   const dy =
      point.y < rect.y ? rect.y - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0
   return Math.hypot(dx, dy)
}

function maxDistanceFromPointToRectCorners(point, rect) {
   return Math.max(
      Math.hypot(rect.x - point.x, rect.y - point.y),
      Math.hypot(rect.right - point.x, rect.y - point.y),
      Math.hypot(rect.x - point.x, rect.bottom - point.y),
      Math.hypot(rect.right - point.x, rect.bottom - point.y),
   )
}

function ringContactShape(region) {
   const shapes = []
   try {
      const overrideShape = getWizardShapeOverride(region)
      if (overrideShape) shapes.push(overrideShape)
   } catch (_e) {}
   const nativeShapes = Array.isArray(region?.shapes)
      ? region.shapes
      : Array.isArray(region?.shapes?.contents)
        ? region.shapes.contents
        : []
   shapes.push(...nativeShapes)
   for (const shape of shapes) {
      const ring = normalizeRingContactShape(shape?.toObject?.() ?? shape)
      if (ring) return ring
   }
   return null
}

function normalizeRingContactShape(shape) {
   if (shape?.type !== "ring") return null
   const x = Number(shape.x)
   const y = Number(shape.y)
   if (!Number.isFinite(x) || !Number.isFinite(y)) return null
   const radius = Number(shape.radius)
   const outerWidth = Number(shape.outerWidth)
   let inner = 0
   let outer = 0
   if (Number.isFinite(radius) && radius > 0 && Number.isFinite(outerWidth) && outerWidth > 0) {
      inner = Math.max(0, radius - outerWidth / 2)
      outer = radius + outerWidth / 2
   } else {
      outer = Number(shape.outerRadius ?? shape.radius ?? 0)
      inner = Number(shape.innerRadius ?? 0)
   }
   if (!Number.isFinite(inner)) inner = 0
   if (!Number.isFinite(outer) || outer <= 0) return null
   inner = Math.max(0, Math.min(inner, outer))
   return { x, y, inner, outer }
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
      undefined
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
      undefined
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
   if (LIFECYCLE_DISPATCHING.has(key)) {
      debugLifecycle("dispatch skipped busy", {
         eventName,
         region: region?.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(tokenDoc),
         groupKey,
      })
      return { ok: false, reason: "busy" }
   }
   const recent = LIFECYCLE_RECENT_DISPATCH.get(key)
   const now = Date.now()
   if (
      recent?.eventName === eventName &&
      now - recent.time < LIFECYCLE_DUPLICATE_EVENT_MS
   ) {
      debugLifecycle("dispatch skipped duplicate", {
         eventName,
         region: region?.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(tokenDoc),
         groupKey,
         elapsed: now - recent.time,
      })
      return { ok: false, reason: "duplicate" }
   }
   LIFECYCLE_DISPATCHING.add(key)
   try {
      debugLifecycle("dispatch start", {
         eventName,
         region: region?.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(tokenDoc),
         groupKey,
      })
      const result = await runBehaviorScript(
         region,
         behavior,
         tokenDoc,
         eventName,
      )
      if (result?.ok) {
         LIFECYCLE_RECENT_DISPATCH.set(key, { eventName, time: Date.now() })
      }
      debugLifecycle("dispatch result", {
         eventName,
         region: region?.uuid,
         behavior: behaviorDebug(behavior),
         token: tokenDebug(tokenDoc),
         groupKey,
         result,
      })
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
         undefined
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
         undefined
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
   if (!isCurrentUserActiveGM()) return
   const scene = tokenDoc?.document?.parent ?? tokenDoc.parent ?? canvas.scene
   if (!scene) return
   const actor = tokenDoc.actor ?? tokenDoc.document?.actor
   const geometry =
      normalizeLifecycleGeometry(geometryOverride) ??
      recentRemoteLifecycleGeometry(tokenDoc)

   for (const region of sceneRegionList(scene)) {
      const behaviors = regionBehaviorList(region)
      if (!behaviors.length) continue
      const contact = tokenRegionContact(region, tokenDoc, geometry)
      rememberLifecycleContact(region, tokenDoc, contact)
      for (const behavior of behaviors) {
         if (behavior.disabled || !isExecuteScriptBehavior(behavior)) continue
         const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
         if (
            !Array.isArray(triggers) ||
            (!triggers.includes("whileAdjacent") &&
               !triggers.includes("whileWithin"))
         )
            continue
         const groupKey = lifecycleTriggerGroupKey(behavior, triggers)
         const active = lifecycleBehaviorActive(region, contact, triggers)
         const hasLifecycleState = actorHasLifecycleState(
            actor,
            region,
            groupKey,
         )
         let eventName = null
         if (active && !hasLifecycleState) {
            eventName = lifecycleEnterEvent(region, contact, triggers)
         } else if (!active && hasLifecycleState) {
            eventName = lifecycleExitEvent(triggers)
         }
         debugLifecycle("catchup evaluate", {
            reason,
            region: region?.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(tokenDoc),
            contact,
            active,
            hasLifecycleState,
            eventName,
            groupKey,
         })
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
   if (!isCurrentUserActiveGM()) return
   if (!isTokenGeometryUpdate(changes)) return
   const scene = tokenDoc.parent ?? canvas.scene
   if (!scene) return
   const tokenKey = tokenTrackingKey(tokenDoc)
   const before = tokenKey
      ? (TOKEN_PRE_UPDATE_STATE.get(tokenKey) ?? null)
      : null
   if (tokenKey) TOKEN_PRE_UPDATE_STATE.delete(tokenKey)

   for (const region of sceneRegionList(scene)) {
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
         if (behavior.disabled || !isExecuteScriptBehavior(behavior)) continue
         const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
         if (
            !Array.isArray(triggers) ||
            (!triggers.includes("whileAdjacent") &&
               !triggers.includes("whileWithin"))
         )
            continue
         const groupKey = lifecycleTriggerGroupKey(behavior, triggers)
         const hasLifecycleState = actorHasLifecycleState(
            tokenDoc.actor,
            region,
            groupKey,
         )
         const beforeActive = beforeContact
            ? lifecycleBehaviorActive(region, beforeContact, triggers)
            : hasLifecycleState
         const afterActive = lifecycleBehaviorActive(region, afterContact, triggers)
         let eventName = null
         if (afterActive && !hasLifecycleState) {
            eventName = lifecycleEnterEvent(region, afterContact, triggers)
         } else if (beforeActive !== afterActive) {
            eventName = afterActive
               ? lifecycleEnterEvent(region, afterContact, triggers)
               : lifecycleExitEvent(triggers)
         }
         debugLifecycle("token update evaluate", {
            region: region?.uuid,
            behavior: behaviorDebug(behavior),
            token: tokenDebug(tokenDoc),
            beforeContact,
            afterContact,
            beforeActive,
            afterActive,
            hasLifecycleState,
            eventName,
            groupKey,
            changes: Object.keys(changes ?? {}),
            userId,
         })
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
      if (behavior.disabled || !isExecuteScriptBehavior(behavior)) continue
      const triggers = behavior.flags?.[FLAG_SCOPE]?.triggers ?? []
      if (!Array.isArray(triggers)) continue
      const wantsWithin = triggers.includes("whileWithin")
      const wantsAdjacent = triggers.includes("whileAdjacent")
      if (!wantsWithin && !wantsAdjacent) continue
      for (const tokenDoc of sceneTokenList(scene)) {
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
         undefined
      })
   }, 150)
}
