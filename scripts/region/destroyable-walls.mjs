import { FLAG_SCOPE, MODULE_ID } from "../data.mjs"
import { sourceItemForRegion } from "../compendium/template-entry-item.mjs"

async function tryFromUuid(uuid) {
   if (!uuid) return null
   try {
      return await fromUuid(uuid)
   } catch (_e) {
      return null
   }
}
const CLEANED_DESTROYABLE_WALL_ACTORS = new Set()
const PENDING_DESTROYABLE_WALL_ACTOR_CLEANUPS = new Map()
const RUNNING_DESTROYABLE_WALL_ACTOR_CLEANUPS = new Set()

export function liveEmbeddedUpdates(parent, collectionName, updates) {
   const collection = parent?.[collectionName]
   if (!collection?.has) return []
   return (updates ?? []).filter((u) => u?._id && collection.has(u._id))
}

async function safelyDeleteDocuments(documents) {
   for (const doc of documents ?? []) {
      if (!doc?.id || !doc.parent) continue
      try {
         const collection = doc.parent?.[doc.collectionName]
         if (collection?.has && !collection.has(doc.id)) continue
         await doc.delete()
      } catch (_e) {}
   }
}

function scheduleDestroyableWallActorCleanup(actor) {
   if (!actor?.id) return
   if (PENDING_DESTROYABLE_WALL_ACTOR_CLEANUPS.has(actor.id)) return
   const timer = setTimeout(async () => {
      PENDING_DESTROYABLE_WALL_ACTOR_CLEANUPS.delete(actor.id)
      const fresh = game.actors?.get?.(actor.id) ?? actor
      await cleanupDestroyableWallActor(fresh)
   }, 750)
   PENDING_DESTROYABLE_WALL_ACTOR_CLEANUPS.set(actor.id, timer)
}

export async function onDeleteActorForDestroyableWalls(actor, options, userId) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!actor?.flags?.[MODULE_ID]?.isDestroyableWallActor) return

   if (CLEANED_DESTROYABLE_WALL_ACTORS.has(actor.id)) {
      CLEANED_DESTROYABLE_WALL_ACTORS.delete(actor.id)
      return
   }

   try {
      const wallIds = actor.flags?.[MODULE_ID]?.wallIds ?? []
      for (const scene of game.scenes) {
         const wallsToDelete = scene.walls.filter((w) => wallIds.includes(w.id))
         await safelyDeleteDocuments(wallsToDelete)
         const tokensToDelete = scene.tokens.filter(
            (t) =>
               t.flags?.[MODULE_ID]?.isDestroyableWallToken &&
               t.flags?.[MODULE_ID]?.actorId === actor.id,
         )
         await safelyDeleteDocuments(tokensToDelete)
      }
   } catch (e) {
      undefined
   }
}

export async function onDeleteTokenForDestroyableWalls(token, options, userId) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!token?.flags?.[MODULE_ID]?.isDestroyableWallToken) return
   const actorId = token.flags?.[MODULE_ID]?.actorId ?? token.actor?.id ?? null
   await cleanupDestroyableWallActorById(actorId)
}

export async function onDeleteWallForDestroyableWalls(wall, options, userId) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   const actorId = wall?.flags?.[MODULE_ID]?.destroyableActorId ?? null
   if (!actorId) return
   await cleanupDestroyableWallActorById(actorId)
}

async function cleanupDestroyableWallActorById(actorId) {
   if (!actorId) return
   if (RUNNING_DESTROYABLE_WALL_ACTOR_CLEANUPS.has(actorId)) return
   const actor = game.actors?.get?.(actorId)
   if (!actor?.flags?.[MODULE_ID]?.isDestroyableWallActor) return
   await cleanupDestroyableWallActor(actor)
}

function wallMidpoint(wall) {
   const [x1, y1, x2, y2] = wall.c
   return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}

function groupWallsByLength(walls, scene, feetPerActor) {
   const gridDistance = scene?.grid?.distance ?? 5
   const gridSize = scene?.grid?.size ?? 100
   const pxPerFoot = gridSize / gridDistance
   const thresholdPx = Math.max(1, feetPerActor * pxPerFoot)
   const eps = 1
   const groups = []
   const segments = []
   const fallback = []

   for (let i = 0; i < walls.length; i++) {
      const w = walls[i]
      const [x1, y1, x2, y2] = w.c
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len <= 0) continue
      const horizontal = Math.abs(y1 - y2) <= eps
      const vertical = Math.abs(x1 - x2) <= eps
      if (!horizontal && !vertical) {
         fallback.push({ wall: w, len, index: i })
         continue
      }
      const orientation = horizontal ? "h" : "v"
      const line = horizontal ? (y1 + y2) / 2 : (x1 + x2) / 2
      const start = horizontal ? Math.min(x1, x2) : Math.min(y1, y2)
      const end = horizontal ? Math.max(x1, x2) : Math.max(y1, y2)
      segments.push({ wall: w, len, orientation, line, start, end, index: i })
   }

   const runKeys = new Set(
      segments.map((seg) => `${seg.orientation}:${Math.round(seg.line)}`),
   )
   if (runKeys.size > 1) {
      const projected = makeProjectedGroups([...segments, ...fallback])
      if (projected.length > 0) return projected
   }

   segments.sort(
      (a, b) =>
         a.orientation.localeCompare(b.orientation) ||
         a.line - b.line ||
         a.start - b.start ||
         a.index - b.index,
   )

   let run = []
   for (const seg of segments) {
      const last = run[run.length - 1]
      const sameRun =
         last &&
         last.orientation === seg.orientation &&
         Math.abs(last.line - seg.line) <= eps &&
         seg.start <= last.end + eps
      if (!sameRun) {
         pushRun(run)
         run = []
      }
      run.push(seg)
   }
   pushRun(run)

   if (fallback.length > 0) pushFallback(fallback)
   return groups

   function pushRun(segs) {
      if (!segs.length) return
      let acc = []
      let accLen = 0
      for (const seg of segs) {
         acc.push(seg)
         accLen += seg.len
         if (accLen >= thresholdPx) {
            groups.push(makeAxisGroup(acc))
            acc = []
            accLen = 0
         }
      }
      if (acc.length > 0) groups.push(makeAxisGroup(acc))
   }

   function makeAxisGroup(segs) {
      const total = segs.reduce((sum, seg) => sum + seg.len, 0)
      let target = total / 2
      let chosen = segs[0]
      for (const seg of segs) {
         if (target <= seg.len) {
            chosen = seg
            break
         }
         target -= seg.len
      }
      const pos = chosen.start + Math.max(0, Math.min(chosen.len, target))
      const center =
         chosen.orientation === "h"
            ? { x: pos, y: chosen.line }
            : { x: chosen.line, y: pos }
      return { walls: segs.map((seg) => seg.wall), center }
   }

   function pushFallback(segs) {
      let acc = []
      let accLen = 0
      for (const seg of segs) {
         acc.push(seg.wall)
         accLen += seg.len
         if (accLen >= thresholdPx) {
            groups.push(makeFallbackGroup(acc))
            acc = []
            accLen = 0
         }
      }
      if (acc.length > 0) groups.push(makeFallbackGroup(acc))
   }

   function makeFallbackGroup(ws) {
      let cx = 0
      let cy = 0
      let total = 0
      for (const w of ws) {
         const [x1, y1, x2, y2] = w.c
         const len = Math.hypot(x2 - x1, y2 - y1)
         const m = wallMidpoint(w)
         cx += m.x * len
         cy += m.y * len
         total += len
      }
      return {
         walls: ws,
         center: { x: cx / Math.max(1, total), y: cy / Math.max(1, total) },
      }
   }

   function makeProjectedGroups(segs) {
      const usable = segs.filter((seg) => seg?.wall && seg.len > 0)
      if (!usable.length) return []

      let nx = 0
      let ny = 0
      for (const seg of usable) {
         const [x1, y1, x2, y2] = seg.wall.c
         const dx = x2 - x1
         const dy = y2 - y1
         const len = Math.hypot(dx, dy)
         if (len <= 0) continue
         nx += (dy / len) * len
         ny += (-dx / len) * len
      }
      const nLen = Math.hypot(nx, ny)
      if (nLen <= 0.001) return []
      nx /= nLen
      ny /= nLen
      const tx = -ny
      const ty = nx

      const projected = usable.map((seg) => {
         const [x1, y1, x2, y2] = seg.wall.c
         const p1 = { x: x1, y: y1 }
         const p2 = { x: x2, y: y2 }
         const p1Projection = p1.x * tx + p1.y * ty
         const p2Projection = p2.x * tx + p2.y * ty
         const startPoint = p1Projection <= p2Projection ? p1 : p2
         const endPoint = p1Projection <= p2Projection ? p2 : p1
         return {
            ...seg,
            startPoint,
            endPoint,
            projection: Math.min(p1Projection, p2Projection),
         }
      })
      projected.sort((a, b) => a.projection - b.projection)

      const out = []
      let bucket = []
      let bucketLen = 0
      for (const seg of projected) {
         bucket.push(seg)
         bucketLen += seg.len
         if (bucketLen >= thresholdPx) {
            out.push(makeProjectedGroup(bucket))
            bucket = []
            bucketLen = 0
         }
      }
      if (bucket.length > 0) out.push(makeProjectedGroup(bucket))
      return out

      function makeProjectedGroup(bucketSegs) {
         const total = bucketSegs.reduce((sum, seg) => sum + seg.len, 0)
         let target = total / 2
         let chosen = bucketSegs[0]
         for (const seg of bucketSegs) {
            if (target <= seg.len) {
               chosen = seg
               break
            }
            target -= seg.len
         }
         const t =
            chosen.len > 0 ? Math.max(0, Math.min(1, target / chosen.len)) : 0
         return {
            walls: bucketSegs.map((seg) => seg.wall),
            center: {
               x:
                  chosen.startPoint.x +
                  (chosen.endPoint.x - chosen.startPoint.x) * t,
               y:
                  chosen.startPoint.y +
                  (chosen.endPoint.y - chosen.startPoint.y) * t,
            },
         }
      }
   }
}

function wallSortValue(wall) {
   const [x1, y1, x2, y2] = wall.c ?? [0, 0, 0, 0]
   const horizontal = Math.abs(y1 - y2) <= 1
   const vertical = Math.abs(x1 - x2) <= 1
   const orientation = horizontal ? 0 : vertical ? 1 : 2
   const line = horizontal ? (y1 + y2) / 2 : vertical ? (x1 + x2) / 2 : 0
   const start = horizontal
      ? Math.min(x1, x2)
      : vertical
        ? Math.min(y1, y2)
        : Math.min(x1, x2, y1, y2)
   const midX = (x1 + x2) / 2
   const midY = (y1 + y2) / 2
   return { orientation, line, start, midX, midY }
}

export function sortWallsForSync(walls) {
   return walls.slice().sort((a, b) => {
      const av = wallSortValue(a)
      const bv = wallSortValue(b)
      return (
         av.orientation - bv.orientation ||
         av.line - bv.line ||
         av.start - bv.start ||
         av.midY - bv.midY ||
         av.midX - bv.midX
      )
   })
}

function numberedWallActorSort(a, b) {
   const suffix = (actor) => {
      const match = String(actor?.name ?? "").match(/\((\d+)\)\s*$/)
      return match ? Number(match[1]) : 1
   }
   return (
      suffix(a) - suffix(b) ||
      String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
   )
}

export async function syncDestroyableWallActorsForEntry(
   region,
   scene,
   entry,
   walls,
) {
   if (!entry?.system?.destroyable || !scene || !walls.length) return
   const s = entry.system
   const actorSize = Math.max(1, Number(s.destroyableActorSize) || 10)
   const groups = groupWallsByLength(sortWallsForSync(walls), scene, actorSize)
   if (!groups.length) return

   const attachmentId = entry.id ?? null
   const actors = (game.actors ?? [])
      .filter(
         (a) =>
            a.flags?.[MODULE_ID]?.isDestroyableWallActor &&
            a.flags?.[MODULE_ID]?.attachedToRegion === region.uuid &&
            (a.flags?.[MODULE_ID]?.attachmentId ?? null) === attachmentId,
      )
      .sort(numberedWallActorSort)
   const tokensByActor = new Map(
      scene.tokens
         .filter(
            (t) =>
               t.flags?.[MODULE_ID]?.isDestroyableWallToken &&
               t.flags?.[MODULE_ID]?.attachedToRegion === region.uuid &&
               (t.flags?.[MODULE_ID]?.attachmentId ?? null) === attachmentId,
         )
         .map((t) => [t.flags?.[MODULE_ID]?.actorId, t]),
   )

   const count = Math.min(actors.length, groups.length)
   const wallUpdates = []
   const tokenUpdates = []
   for (let i = 0; i < count; i++) {
      const actor = game.actors?.get?.(actors[i]?.id) ?? actors[i]
      if (!actor || !game.actors?.get?.(actor.id)) continue
      const group = groups[i]
      const wallIds = group.walls.map((w) => w.id).filter(Boolean)
      try {
         await actor.update({ [`flags.${MODULE_ID}.wallIds`]: wallIds })
      } catch (_e) {}

      const token = tokensByActor.get(actor.id)
      if (token) {
         tokenUpdates.push({
            _id: token.id,
            x: group.center.x - scene.grid.size / 2,
            y: group.center.y - scene.grid.size / 2,
            [`flags.${MODULE_ID}.wallIds`]: wallIds,
         })
      }

      for (const wallId of wallIds) {
         wallUpdates.push({
            _id: wallId,
            [`flags.${MODULE_ID}.destroyableActorId`]: actor.id,
            [`flags.${MODULE_ID}.destroyableWallGroup`]: wallIds,
         })
      }
   }

   const liveTokenUpdates = liveEmbeddedUpdates(scene, "tokens", tokenUpdates)
   if (liveTokenUpdates.length > 0) {
      try {
         await scene.updateEmbeddedDocuments("Token", liveTokenUpdates)
      } catch (e) {
         undefined
      }
   }
   const liveWallUpdates = liveEmbeddedUpdates(scene, "walls", wallUpdates)
   if (liveWallUpdates.length > 0) {
      try {
         await scene.updateEmbeddedDocuments("Wall", liveWallUpdates)
      } catch (_e) {}
   }
}

function buildDestroyableActorData(config) {
   const hp = Math.max(1, Number(config.hp) || 30)
   const ac = Math.max(1, Number(config.ac) || 15)
   const hardness = Math.max(0, Number(config.hardness) || 0)
   const immunities = (
      Array.isArray(config.immunities) ? config.immunities : []
   )
      .filter(Boolean)
      .map((t) => ({ type: t }))
   const resistances = (
      Array.isArray(config.resistances) ? config.resistances : []
   )
      .filter((e) => e?.type)
      .map((e) => ({ type: e.type, value: Math.max(1, Number(e.value) || 1) }))
   const weaknesses = (
      Array.isArray(config.weaknesses) ? config.weaknesses : []
   )
      .filter((e) => e?.type)
      .map((e) => ({ type: e.type, value: Math.max(1, Number(e.value) || 1) }))

   const data = {
      name: config.name || "Wall",
      type: "npc",
      img: "icons/commodities/stone/paver-brick-brown.webp",
      system: {
         attributes: {
            hp: { value: hp, max: hp, temp: 0 },
            ac: { value: ac },
            hardness: { value: hardness },
            immunities,
            resistances,
            weaknesses,
         },
         traits: {
            value: ["construct"],
            rarity: "common",
            size: { value: "med" },
         },
         details: {
            level: { value: 0 },
            blurb: "",
            publicNotes: "",
            privateNotes: "",
         },
      },
   }

   if (
      config.strike &&
      Array.isArray(config.strike.damages) &&
      config.strike.damages.length > 0
   ) {
      const meleeItem = buildWallStrikeItem(config.strike, config.sourceItem)
      if (meleeItem) data.items = [meleeItem]
   }
   return data
}

function buildWallStrikeItem(strike, sourceItem) {
   const name = String(strike.name || "Wall Slam")
   const damageRows = Array.isArray(strike.damages) ? strike.damages : []

   const placerActor = sourceItem?.actor ?? null
   let bonus = 10
   const raw = String(strike.attack ?? "10").trim()
   if (/^[\d\s+\-*/().]+$/.test(raw)) {
      try {
         bonus = Number(Function('"use strict"; return (' + raw + ");")()) || 10
      } catch (_e) {}
   } else if (placerActor) {
      const subbed = raw.replace(
         /@([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)/g,
         (full, path) => {
            const parts = path.split(".")
            let cur = null
            if (parts[0] === "placer" || parts[0] === "actor") cur = placerActor
            else return "0"
            for (let i = 1; i < parts.length; i++) {
               if (cur == null) return "0"
               cur = cur[parts[i]]
            }
            const n = Number(cur)
            return Number.isFinite(n) ? String(n) : "0"
         },
      )
      if (/^[\d\s+\-*/().]+$/.test(subbed)) {
         try {
            bonus =
               Number(Function('"use strict"; return (' + subbed + ");")()) ||
               10
         } catch (_e) {}
      }
   }

   const damageRolls = {}
   for (let i = 0; i < damageRows.length; i++) {
      const d = damageRows[i]
      const n = Number(d.diceCount) || 0
      const die = d.dieSize && d.dieSize !== "-" ? d.dieSize : ""
      const dmgStr = n > 0 && die ? `${n}${die}` : n > 0 ? String(n) : "1d6"
      const key = foundry.utils.randomID()
      damageRolls[key] = {
         damage: dmgStr,
         damageType: d.damageType ?? "bludgeoning",
         category: d.category && d.category !== "normal" ? d.category : null,
      }
   }
   return {
      name,
      type: "melee",
      img: "icons/commodities/stone/paver-brick-brown.webp",
      system: {
         bonus: { value: bonus },
         damageRolls,
         weaponType: { value: "melee" },
         attackEffects: { value: [] },
         rules: [],
         traits: { value: [], rarity: "common" },
         description: { value: "" },
      },
   }
}

export async function spawnConstructActorsForWalls(walls, config) {
   if (!Array.isArray(walls) || walls.length === 0) return []
   const scene = walls[0].parent
   if (!scene) return []
   const wallDocs = walls.filter((wall) => wall?.parent === scene && wall?.id)
   if (wallDocs.length === 0) return []

   const baseName = String(config.name || "Wall")
   const created = []
   for (let i = 0; i < wallDocs.length; i++) {
      const wall = wallDocs[i]
      const actorName =
         wallDocs.length === 1 ? baseName : `${baseName} (${i + 1})`
      const wallIds = [wall.id]
      try {
         const actorData = buildDestroyableActorData({
            ...config,
            name: actorName,
         })
         actorData.flags = foundry.utils.mergeObject(actorData.flags ?? {}, {
            [MODULE_ID]: {
               isDestroyableWallActor: true,
               attachedToRegion: null,
               attachmentId: null,
               wallIds,
            },
         })
         const actor = await Actor.create(actorData)
         if (!actor) continue
         created.push(actor)

         const center = wallMidpoint(wall)
         const tokenData = {
            actorId: actor.id,
            name: actorName,
            x: center.x - scene.grid.size / 2,
            y: center.y - scene.grid.size / 2,
            width: 1,
            height: 1,
            hidden: true,
            flags: {
               [MODULE_ID]: {
                  isDestroyableWallToken: true,
                  actorId: actor.id,
                  attachedToRegion: null,
                  attachmentId: null,
                  wallIds,
               },
            },
         }
         await scene.createEmbeddedDocuments("Token", [tokenData])

         try {
            const updates = wallIds
               .filter((wid) => scene.walls.get(wid))
               .map((wid) => ({
                  _id: wid,
                  [`flags.${MODULE_ID}.destroyableActorId`]: actor.id,
                  [`flags.${MODULE_ID}.destroyableWallGroup`]: wallIds,
               }))
            if (updates.length > 0) {
               await scene.updateEmbeddedDocuments("Wall", updates)
            }
         } catch (_e) {}
      } catch (e) {
         undefined
      }
   }
   return created
}

export async function spawnDestroyableWallActors(region, scene, entry, walls) {
   const s = entry.system
   const actorSize = Math.max(1, Number(s.destroyableActorSize) || 10)
   const groups = groupWallsByLength(walls, scene, actorSize)
   if (groups.length === 0) return

   let baseName = "Wall"
   let sourceItem = null
   try {
      sourceItem = await sourceItemForRegion(region, tryFromUuid)
      if (sourceItem?.name) baseName = sourceItem.name
   } catch (_e) {}

   const sharedConfig = {
      hp: Number(s.destroyableHP) || 30,
      ac: Number(s.destroyableAC) || 15,
      hardness: Number(s.destroyableHardness) || 0,
      immunities: Array.isArray(s.wallImmunities) ? s.wallImmunities : [],
      resistances: Array.isArray(s.wallResistances) ? s.wallResistances : [],
      weaknesses: Array.isArray(s.wallWeaknesses) ? s.wallWeaknesses : [],
      strike: s.wallHasStrike
         ? {
              name: s.wallStrikeName || `${baseName} Slam`,
              attack: s.wallStrikeAttack || "10",
              damages: Array.isArray(s.wallStrikeDamages)
                 ? s.wallStrikeDamages
                 : [],
           }
         : null,
      sourceItem,
   }

   for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      const actorName =
         groups.length === 1 ? baseName : `${baseName} (${i + 1})`
      const wallIds = g.walls.map((w) => w.id)
      try {
         const actorData = buildDestroyableActorData({
            ...sharedConfig,
            name: actorName,
         })
         actorData.flags = foundry.utils.mergeObject(actorData.flags ?? {}, {
            [MODULE_ID]: {
               isDestroyableWallActor: true,
               attachedToRegion: region.uuid,
               attachmentId: entry.id ?? null,
               wallIds,
            },
         })
         const actor = await Actor.create(actorData)
         if (!actor) continue

         const tokenData = {
            actorId: actor.id,
            name: actorName,
            x: g.center.x - scene.grid.size / 2,
            y: g.center.y - scene.grid.size / 2,
            width: 1,
            height: 1,
            hidden: true,
            flags: {
               [MODULE_ID]: {
                  isDestroyableWallToken: true,
                  actorId: actor.id,
                  attachedToRegion: region.uuid,
                  attachmentId: entry.id ?? null,
                  wallIds,
               },
            },
         }
         await scene.createEmbeddedDocuments("Token", [tokenData])

         try {
            const updates = wallIds
               .filter((wid) => scene.walls.get(wid))
               .map((wid) => ({
                  _id: wid,
                  [`flags.${MODULE_ID}.destroyableActorId`]: actor.id,
                  [`flags.${MODULE_ID}.destroyableWallGroup`]: wallIds,
               }))
            if (updates.length > 0) {
               await scene.updateEmbeddedDocuments("Wall", updates)
            }
         } catch (_e) {}
      } catch (e) {
         undefined
      }
   }
}

export async function onUpdateActorForDestroyableWalls(
   actor,
   changes,
   options,
   userId,
) {
   if (!game.user.isGM) return
   if (game.user.id !== game.users.activeGM?.id) return
   if (!actor?.flags?.[MODULE_ID]?.isDestroyableWallActor) return

   const newHp = foundry.utils.getProperty(
      changes,
      "system.attributes.hp.value",
   )
   if (newHp === undefined || newHp === null) return
   if (Number(newHp) > 0) return
   scheduleDestroyableWallActorCleanup(actor)
}

export async function cleanupDestroyableWallActor(actor) {
   if (!actor?.id) return
   if (RUNNING_DESTROYABLE_WALL_ACTOR_CLEANUPS.has(actor.id)) return
   RUNNING_DESTROYABLE_WALL_ACTOR_CLEANUPS.add(actor.id)
   try {
      const pending = PENDING_DESTROYABLE_WALL_ACTOR_CLEANUPS.get(actor.id)
      if (pending) {
         clearTimeout(pending)
         PENDING_DESTROYABLE_WALL_ACTOR_CLEANUPS.delete(actor.id)
      }
      const wallIds = actor.flags?.[MODULE_ID]?.wallIds ?? []

      CLEANED_DESTROYABLE_WALL_ACTORS.add(actor.id)

      for (const scene of game.scenes) {
         const tokensToDelete = scene.tokens.filter(
            (t) =>
               t.flags?.[MODULE_ID]?.isDestroyableWallToken &&
               t.flags?.[MODULE_ID]?.actorId === actor.id,
         )
         await safelyDeleteDocuments(tokensToDelete)
      }

      for (const scene of game.scenes) {
         const wallsToDelete = scene.walls.filter((w) => wallIds.includes(w.id))
         await safelyDeleteDocuments(wallsToDelete)
      }

      try {
         const fresh = game.actors?.get?.(actor.id) ?? actor
         if (fresh?.parent || game.actors?.get?.(actor.id)) await fresh.delete()
      } catch (_e) {}
   } catch (e) {
      undefined
      CLEANED_DESTROYABLE_WALL_ACTORS.delete(actor.id)
   } finally {
      RUNNING_DESTROYABLE_WALL_ACTOR_CLEANUPS.delete(actor.id)
   }
}
