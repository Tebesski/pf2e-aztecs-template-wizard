import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { requestPlayerChoiceDialog } from "./player-requests.mjs"

const SUSTAIN_RECENT = new Map()
const ONE_ACTION_ICON = "systems/pf2e/icons/actions/OneAction.webp"

function debugSustain(_label, _payload = {}) {}

function combatantDebug(combatant) {
   return combatant
      ? {
           id: combatant.id,
           tokenId: combatant.tokenId,
           actor: combatant.actor?.name,
           token: combatant.token?.name,
           round: combatant.parent?.round,
           turn: combatant.parent?.turn,
        }
      : null
}

function actorDebug(actor) {
   return actor
      ? {
           id: actor.id,
           uuid: actor.uuid,
           name: actor.name,
           ownership: actor.ownership,
        }
      : null
}

function managedDebug(managed) {
   return managed
      ? {
           itemUuid: managed.itemUuid,
           itemName: managed.itemName,
           ownerActorUuid: managed.ownerActorUuid,
           ownerUserId: managed.ownerUserId,
           placedAt: managed.placedAt,
           expiresAt: managed.expiresAt,
           sustained: !!managed.resolvedAutomation?.expiration?.sustained,
           expiration: managed.resolvedAutomation?.expiration,
        }
      : null
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

export function installSustainHooks() {
   Hooks.on("pf2e.startTurn", (combatant, encounter) => {
      debugSustain("hook pf2e.startTurn", {
         activeGM: game.users?.activeGM?.id,
         currentUser: game.user?.id,
         isActiveGM: isActiveGM(),
         combatant: combatantDebug(combatant),
         encounter: encounter?.id,
      })
      handleSustainTurnStart(combatant, encounter).catch((e) => {
         undefined
      })
   })
   Hooks.on("pf2e.endTurn", (combatant, encounter) => {
      debugSustain("hook pf2e.endTurn", {
         activeGM: game.users?.activeGM?.id,
         currentUser: game.user?.id,
         isActiveGM: isActiveGM(),
         combatant: combatantDebug(combatant),
         encounter: encounter?.id,
      })
      handleScheduledSustainTurnEnd(combatant, encounter).catch((e) => {
         undefined
      })
   })
}

async function handleSustainTurnStart(combatant, encounter) {
   debugSustain("handle turn start", {
      activeGM: game.users?.activeGM?.id,
      currentUser: game.user?.id,
      isActiveGM: isActiveGM(),
      combatant: combatantDebug(combatant),
      encounter: encounter?.id,
      scene: encounter?.scene?.id,
   })
   if (!isActiveGM()) {
      debugSustain("skip inactive gm", {
         activeGM: game.users?.activeGM?.id,
         currentUser: game.user?.id,
      })
      return
   }
   const actor = combatantActor(combatant)
   if (!actor) {
      debugSustain("skip missing actor", {
         combatant: combatantDebug(combatant),
      })
      return
   }
   const scene = encounter?.scene ?? game.scenes?.get?.(combatant?.sceneId) ?? canvas?.scene
   if (!scene) {
      debugSustain("skip missing scene regions", {
         actor: actorDebug(actor),
         combatant: combatantDebug(combatant),
         scene: scene?.id,
      })
      return
   }
   if (!shouldHandleSustain(actor, combatant, encounter, "start")) {
      debugSustain("skip duplicate sustain handling", {
         actor: actorDebug(actor),
         combatant: combatantDebug(combatant),
         encounter: encounter?.id,
         phase: "start",
      })
      return
   }

   debugSustain("scan regions", {
      actor: actorDebug(actor),
      scene: scene.id,
      regionCount: sceneRegionList(scene).length,
      rawRegionCollection: {
         hasRegions: !!scene.regions,
         hasContents: Array.isArray(scene.regions?.contents),
         contentCount: Array.isArray(scene.regions?.contents) ? scene.regions.contents.length : null,
         valuesCount:
            typeof scene.regions?.values === "function"
               ? Array.from(scene.regions.values()).length
               : null,
         canvasScene: canvas?.scene?.id,
         canvasRegionCount: sceneRegionList(canvas?.scene).length,
         usedCanvasFallback:
            !!canvas?.scene &&
            canvas.scene.id !== scene.id &&
            collectionValues(scene?.regions).length === 0,
      },
   })

   for (const region of sceneRegionList(scene)) {
      const managed = region.getFlag?.(FLAG_SCOPE, "managed")
      const automation = managed?.resolvedAutomation
      debugSustain("inspect region", {
         region: region.uuid,
         name: region.name,
         managed: managedDebug(managed),
      })
      if (!automation?.expiration?.sustained) {
         debugSustain("skip region not sustained", {
            region: region.uuid,
            managed: managedDebug(managed),
         })
         continue
      }
      const matchesActor = await managedRegionMatchesActor(managed, region, actor)
      if (!matchesActor) {
         debugSustain("skip region actor mismatch", {
            region: region.uuid,
            actor: actorDebug(actor),
            managed: managedDebug(managed),
         })
         continue
      }
      debugSustain("prompt sustain region", {
         region: region.uuid,
         actor: actorDebug(actor),
         managed: managedDebug(managed),
      })
      await promptSustainRegion(region, managed, actor, combatant)
   }
}

async function handleScheduledSustainTurnEnd(combatant, encounter) {
   debugSustain("handle scheduled turn end", {
      activeGM: game.users?.activeGM?.id,
      currentUser: game.user?.id,
      isActiveGM: isActiveGM(),
      combatant: combatantDebug(combatant),
      encounter: encounter?.id,
      scene: encounter?.scene?.id,
   })
   if (!isActiveGM()) {
      debugSustain("skip inactive gm", {
         activeGM: game.users?.activeGM?.id,
         currentUser: game.user?.id,
      })
      return
   }
   const actor = combatantActor(combatant)
   if (!actor) {
      debugSustain("skip missing actor", {
         combatant: combatantDebug(combatant),
      })
      return
   }
   const scene = encounter?.scene ?? game.scenes?.get?.(combatant?.sceneId) ?? canvas?.scene
   if (!scene) {
      debugSustain("skip missing scene regions", {
         actor: actorDebug(actor),
         combatant: combatantDebug(combatant),
         scene: scene?.id,
      })
      return
   }
   if (!shouldHandleSustain(actor, combatant, encounter, "end")) {
      debugSustain("skip duplicate sustain handling", {
         actor: actorDebug(actor),
         combatant: combatantDebug(combatant),
         encounter: encounter?.id,
         phase: "end",
      })
      return
   }
   for (const region of sceneRegionList(scene)) {
      const pending = region.getFlag?.(FLAG_SCOPE, "sustainDeleteAtTurnEnd")
      if (!sustainDeletionMatches(pending, actor, combatant, encounter)) continue
      debugSustain("delete scheduled unsustained region", {
         region: region.uuid,
         actor: actorDebug(actor),
         pending,
      })
      await cleanupSustainEffects(actor, region)
      await region.delete()
   }
}

function shouldHandleSustain(actor, combatant, encounter, phase) {
   const key = [
      encounter?.id ?? game.combat?.id ?? "combat",
      combatant?.id ?? combatant?.tokenId ?? actor?.uuid ?? actor?.id,
      phase ?? "turn",
   ].join("|")
   const now = Date.now()
   const recent = SUSTAIN_RECENT.get(key)
   if (recent && now - recent < 800) return false
   SUSTAIN_RECENT.set(key, now)
   setTimeout(() => {
      if (SUSTAIN_RECENT.get(key) === now) SUSTAIN_RECENT.delete(key)
   }, 1000)
   return true
}

function sustainDeletionMatches(pending, actor, combatant, encounter) {
   if (!pending || !actor) return false
   if (pending.actorUuid && pending.actorUuid !== actor.uuid) return false
   if (pending.combatId && pending.combatId !== (encounter?.id ?? game.combat?.id)) return false
   if (pending.combatantId && pending.combatantId !== combatant?.id) return false
   return true
}

async function promptSustainRegion(region, managed, actor, combatant) {
   const templateName = managed?.itemName || managed?.resolvedAutomation?.label || "Template"
   debugSustain("show sustain dialog", {
      region: region.uuid,
      templateName,
      actor: actorDebug(actor),
   })
   const value = await requestPlayerChoiceDialog({
      actor,
      title: `Sustain ${templateName}`,
      content: `<p>Sustain <strong>${escapeHTML(templateName)}</strong>?</p>`,
      choices: [
         { value: "sustain", label: "Sustain", default: true },
      ],
      cancelValue: "cancel",
      cancelLabel: "Don't Sustain",
      modal: false,
      timeoutMs: 120000,
   })
   debugSustain("sustain dialog result", {
      region: region.uuid,
      templateName,
      actor: actorDebug(actor),
      value,
   })
   if (value === "sustain") {
      await clearScheduledSustainDeletion(region)
      await applySustainEffect(actor, region, templateName, managed, combatant)
   } else {
      debugSustain("schedule unsustained region deletion", {
         region: region.uuid,
         templateName,
         actor: actorDebug(actor),
      })
      await cleanupSustainEffects(actor, region)
      await scheduleSustainDeletion(region, actor, combatant)
   }
}

async function scheduleSustainDeletion(region, actor, combatant) {
   if (!region?.setFlag) return
   await region.setFlag(FLAG_SCOPE, "sustainDeleteAtTurnEnd", {
      actorUuid: actor?.uuid ?? null,
      combatId: combatant?.parent?.id ?? game.combat?.id ?? null,
      combatantId: combatant?.id ?? null,
      round: combatant?.parent?.round ?? game.combat?.round ?? null,
      turn: combatant?.parent?.turn ?? game.combat?.turn ?? null,
   })
}

async function clearScheduledSustainDeletion(region) {
   if (!region?.setFlag) return
   await region.setFlag(FLAG_SCOPE, "sustainDeleteAtTurnEnd", null)
}

async function applySustainEffect(actor, region, templateName, managed, combatant) {
   debugSustain("apply sustain effect", {
      region: region.uuid,
      templateName,
      actor: actorDebug(actor),
      managed: managedDebug(managed),
      combatant: combatantDebug(combatant),
   })
   await cleanupSustainEffects(actor, region)
   await refreshSustainedRegionExpiration(region, managed)
   const effect = {
      type: "effect",
      name: `Sustained: ${templateName}`,
      img: ONE_ACTION_ICON,
      system: {
         rules: [],
         duration: { value: 1, unit: "rounds", sustained: false, expiry: "turn-start" },
         start: {
            value: game.time?.worldTime ?? 0,
            initiative: combatant?.initiative ?? null,
         },
         description: { value: `<p>Sustaining ${escapeHTML(templateName)}.</p>`, gm: "" },
         traits: { value: [], rarity: "common" },
         level: { value: 1 },
         tokenIcon: { show: true },
         unidentified: false,
      },
      flags: {
         [MODULE_ID]: {
            sustainEffect: true,
            sustainedRegion: region.uuid,
            sourceItemUuid: managed?.itemUuid ?? null,
         },
      },
   }
   await actor.createEmbeddedDocuments("Item", [effect], { render: false })
   debugSustain("created sustain effect", {
      region: region.uuid,
      templateName,
      actor: actorDebug(actor),
   })
}

async function refreshSustainedRegionExpiration(region, managed) {
   const placedAt = Number(managed?.placedAt)
   const expiresAt = Number(managed?.expiresAt)
   const duration = expiresAt - placedAt
   if (!region?.update || !Number.isFinite(duration) || duration <= 0) {
      debugSustain("skip expiration refresh", {
         region: region?.uuid,
         managed: managedDebug(managed),
         duration,
      })
      return
   }
   const now = game.time?.worldTime ?? 0
   debugSustain("refresh expiration", {
      region: region.uuid,
      duration,
      placedAt,
      expiresAt,
      nextPlacedAt: now,
      nextExpiresAt: now + duration,
   })
   await region.update(
      {
         [`flags.${FLAG_SCOPE}.managed.placedAt`]: now,
         [`flags.${FLAG_SCOPE}.managed.expiresAt`]: now + duration,
      },
      { render: false },
   )
}

async function cleanupSustainEffects(actor, region) {
   const existing = actor.items?.filter?.(
      (item) =>
         item.type === "effect" &&
         item.flags?.[MODULE_ID]?.sustainEffect &&
         item.flags?.[MODULE_ID]?.sustainedRegion === region.uuid,
   ) ?? []
   if (!existing.length) {
      debugSustain("no sustain effects to clean", {
         region: region.uuid,
         actor: actorDebug(actor),
      })
      return
   }
   debugSustain("cleanup sustain effects", {
      region: region.uuid,
      actor: actorDebug(actor),
      effects: existing.map((item) => ({ id: item.id, name: item.name })),
   })
   await actor.deleteEmbeddedDocuments("Item", existing.map((item) => item.id), {
      render: false,
   })
}

async function managedRegionMatchesActor(managed, region, actor) {
   if (!managed || !actor) {
      debugSustain("managed actor match missing data", {
         region: region?.uuid,
         managed: managedDebug(managed),
         actor: actorDebug(actor),
      })
      return false
   }
   const ownerActor = await ownerActorForManagedRegion(managed, region)
   if (ownerActor) {
      const matched = sameActor(actor, ownerActor)
      debugSustain("managed actor owner comparison", {
         region: region?.uuid,
         actor: actorDebug(actor),
         ownerActor: actorDebug(ownerActor),
         matched,
      })
      return matched
   }
   const ownerUser = managed.ownerUserId ? game.users?.get?.(managed.ownerUserId) : null
   if (ownerUser && actor.testUserPermission?.(ownerUser, "OWNER")) {
      debugSustain("managed owner user matched", {
         region: region?.uuid,
         actor: actorDebug(actor),
         ownerUserId: ownerUser.id,
      })
      return true
   }
   debugSustain("managed actor no match", {
      region: region?.uuid,
      actor: actorDebug(actor),
      managed: managedDebug(managed),
      ownerUserId: ownerUser?.id,
   })
   return false
}

async function ownerActorForManagedRegion(managed, region) {
   if (!managed && !region) return null
   managed ??= {}
   if (managed.ownerActorUuid) {
      const actor = await fromUuid(managed.ownerActorUuid).catch(() => null)
      if (actor) return actor
   }
   if (managed.itemUuid) {
      const item = await fromUuid(managed.itemUuid).catch(() => null)
      if (item?.actor) return item.actor
   }
   const originUuids = [
      region?.getFlag?.(FLAG_SCOPE, "originUuid"),
      region?.getFlag?.("pf2e", "origin")?.uuid,
   ].filter(Boolean)
   for (const uuid of originUuids) {
      const item = await fromUuid(uuid).catch(() => null)
      if (item?.actor) return item.actor
   }
   return null
}

function combatantActor(combatant) {
   return combatant?.actor ?? combatant?.token?.actor ?? combatant?.token?.document?.actor ?? null
}

function sameActor(left, right) {
   if (!left || !right) return false
   return left.uuid === right.uuid || left.id === right.id
}

function isActiveGM() {
   const activeGM = game.users?.activeGM
   return !!game.user?.isGM && (!activeGM || activeGM.id === game.user.id)
}

function escapeHTML(value) {
   const div = document.createElement("div")
   div.textContent = String(value ?? "")
   return div.innerHTML
}
