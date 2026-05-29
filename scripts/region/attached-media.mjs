import { FLAG_SCOPE, MODULE_ID, normalizeTileAttachments } from "../data.mjs"
import {
   computeRegionBounds,
   tileDataForBounds,
   tileAttachmentAppliesToShape,
   getActiveTemplateShapeType,
   getRegionFootprint,
   footprintCornerPoints,
   smallestEnclosingCircle,
   distanceToNearestBoundaryEdge,
} from "./geometry.mjs"
export async function createAttachedTiles(region, tileEntries) {
   const scene = region.parent
   if (!scene) return
   const footprint = getRegionFootprint(region)
   const bounds = footprint.bounds ?? computeRegionBounds(region)
   if (!bounds) return

   const creates = []
   const activeShapeType = getActiveTemplateShapeType(region)
   for (const entry of tileEntries) {
      const tileRows = normalizeTileAttachments(entry.system)
         .map((row, index) => ({ row, index }))
         .filter(
            ({ row }) =>
               row.tile?.texture?.src &&
               tileAttachmentAppliesToShape(row, activeShapeType),
         )
      const scale = entry.system.scale ?? 1
      const preserve = !!entry.system.preserveAspectRatio
      for (const { row, index: tileIndex } of tileRows) {
         const template = row.tile ?? {}
         const dims = tileDataForBounds(template, bounds, scale, preserve)

         const data = {
            x: dims.x,
            y: dims.y,
            width: dims.width,
            height: dims.height,
            texture: dims.texture,
            sort: Number(template.sort) || 0,
            hidden: !!template.hidden,
            locked: !!template.locked,
            restrictions: template.restrictions ?? {
               light: false,
               weather: false,
            },
            occlusion: template.occlusion ?? { mode: 1, alpha: 0 },
            video: template.video ?? { loop: true, autoplay: true, volume: 0 },
            elevation:
               typeof template.elevation === "number" ? template.elevation : 0,
            flags: {
               [FLAG_SCOPE]: {
                  managed: true,
                  attachedToRegion: region.uuid,
                  attachmentId: entry.id ?? null,
                  tileAttachmentId: row.id ?? null,
                  tileAttachmentIndex: tileIndex,
                  tileShape: row.shape ?? "all",
               },
            },
         }
         creates.push(data)
      }
   }
   if (!creates.length) return
   try {
      await scene.createEmbeddedDocuments("Tile", creates)
   } catch (e) {
      console.error(`[${MODULE_ID}] Failed to create attached tiles`, e)
   }
}

export function singleCircle(region) {
   const shapes = region.shapes ?? []
   if (shapes.length !== 1) return null
   const s = shapes[0]
   if (s?.type !== "circle") return null
   const r = Number(s.radius)
   if (!Number.isFinite(r) || r <= 0) return null
   return { cx: Number(s.x ?? 0), cy: Number(s.y ?? 0), r }
}

export function pointInsideRegion(region, point, bounds) {
   if (typeof region.testPoint === "function") {
      try {
         const r = region.testPoint(point)
         return r === 2
      } catch (_e) {}
   }
   return (
      bounds &&
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
   )
}

export function getRegionPolygons(region) {
   const result = []
   const tree = region.polygonTree
   if (tree) {
      const visit = (node) => {
         if (!node) return
         if (!node.isHole) {
            const flat = Array.isArray(node.points)
               ? node.points
               : Array.isArray(node.polygon?.points)
                 ? node.polygon.points
                 : Array.isArray(node.polygon)
                   ? node.polygon
                   : null
            if (flat && flat.length >= 6) {
               const pts = []
               for (let i = 0; i + 1 < flat.length; i += 2) {
                  pts.push({ x: Number(flat[i]), y: Number(flat[i + 1]) })
               }
               if (pts.length >= 3) result.push(pts)
            }
         }
         const children = node.children ?? []
         for (const c of children) visit(c)
      }
      visit(tree)
      if (result.length > 0) return result
   }

   for (const shape of region.shapes ?? []) {
      const approx = approxShapeToPolygon(shape)
      if (approx) result.push(approx)
   }
   return result
}

function approxShapeToPolygon(shape) {
   const x = Number(shape.x ?? 0)
   const y = Number(shape.y ?? 0)
   if (shape.type === "rectangle") {
      const w = Number(shape.width ?? 0),
         h = Number(shape.height ?? 0)
      return [
         { x, y },
         { x: x + w, y },
         { x: x + w, y: y + h },
         { x, y: y + h },
      ]
   }
   if (shape.type === "circle" || shape.type === "ellipse") {
      const rx = Number(shape.radiusX ?? shape.radius ?? (shape.width ?? 0) / 2)
      const ry = Number(
         shape.radiusY ?? shape.radius ?? (shape.height ?? 0) / 2,
      )
      const seg = 32
      const out = []
      for (let i = 0; i < seg; i++) {
         const a = (i / seg) * Math.PI * 2
         out.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry })
      }
      return out
   }
   if (shape.type === "polygon" && Array.isArray(shape.points)) {
      const out = []
      for (let i = 0; i + 1 < shape.points.length; i += 2) {
         out.push({
            x: Number(shape.points[i]),
            y: Number(shape.points[i + 1]),
         })
      }
      return out.length >= 3 ? out : null
   }
   return null
}

export function regionCentroid(region, polys, bounds) {
   if (!polys || polys.length === 0) {
      return {
         x: bounds.x + bounds.width / 2,
         y: bounds.y + bounds.height / 2,
      }
   }
   let sx = 0,
      sy = 0,
      sw = 0
   for (const poly of polys) {
      let area2 = 0
      let cx = 0,
         cy = 0
      for (let i = 0; i < poly.length; i++) {
         const a = poly[i]
         const b = poly[(i + 1) % poly.length]
         const cross = a.x * b.y - b.x * a.y
         area2 += cross
         cx += (a.x + b.x) * cross
         cy += (a.y + b.y) * cross
      }
      const w = Math.abs(area2) / 2
      if (w > 0) {
         sx += (cx / (3 * area2)) * w
         sy += (cy / (3 * area2)) * w
         sw += w
      }
   }
   if (sw === 0) {
      return {
         x: bounds.x + bounds.width / 2,
         y: bounds.y + bounds.height / 2,
      }
   }
   return { x: sx / sw, y: sy / sw }
}

export function distSqPointToSegment(p, a, b) {
   const dx = b.x - a.x,
      dy = b.y - a.y
   const len2 = dx * dx + dy * dy
   if (len2 === 0) {
      const ax = p.x - a.x,
         ay = p.y - a.y
      return ax * ax + ay * ay
   }
   let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
   t = Math.max(0, Math.min(1, t))
   const cx = a.x + t * dx,
      cy = a.y + t * dy
   const ex = p.x - cx,
      ey = p.y - cy
   return ex * ex + ey * ey
}

export function distanceToNearestEdge(point, polys) {
   let best = Infinity
   for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
         const a = poly[i]
         const b = poly[(i + 1) % poly.length]
         const d2 = distSqPointToSegment(point, a, b)
         if (d2 < best) best = d2
      }
   }
   return Math.sqrt(best)
}

export function maxDistanceToVertices(center, polys) {
   let best = 0
   for (const poly of polys) {
      for (const v of poly) {
         const dx = v.x - center.x,
            dy = v.y - center.y
         const d = Math.hypot(dx, dy)
         if (d > best) best = d
      }
   }
   return best
}

export function soundPlacement(region) {
   const scene = region.parent
   const gridSize = scene?.grid?.size ?? 100
   const gridDistance = scene?.grid?.distance ?? 5

   const footprint = getRegionFootprint(region)
   if (footprint.cells.length > 0) {
      const corners = footprintCornerPoints(footprint)
      const sec = smallestEnclosingCircle(corners)
      if (sec) {
         const radiusInDistance = (sec.r / gridSize) * gridDistance
         return { x: sec.x, y: sec.y, radius: radiusInDistance }
      }
   }

   const bounds = computeRegionBounds(region)
   if (!bounds) return null
   const cx = bounds.x + bounds.width / 2
   const cy = bounds.y + bounds.height / 2
   const halfDiagPx = Math.hypot(bounds.width, bounds.height) / 2
   return {
      x: cx,
      y: cy,
      radius: (halfDiagPx / gridSize) * gridDistance,
   }
}

function lightPlacements(region, template) {
   const scene = region.parent
   const gridSize = scene?.grid?.size ?? 100
   const gridDistance = scene?.grid?.distance ?? 5
   const footprint = getRegionFootprint(region)

   const tplCfg = template?.config ?? {}
   const userDim = Number(tplCfg.dim) || 0
   const userBright = Number(tplCfg.bright) || 0
   const DEFAULT_DIM_SQUARES = 1.5
   const DEFAULT_BRIGHT_RATIO = 0.5
   let nominalDimDistance, nominalBrightDistance
   if (userDim > 0) {
      nominalDimDistance = userDim
      nominalBrightDistance =
         userBright > 0 ? userBright : userDim * DEFAULT_BRIGHT_RATIO
   } else {
      nominalDimDistance = DEFAULT_DIM_SQUARES * gridDistance
      nominalBrightDistance = nominalDimDistance * DEFAULT_BRIGHT_RATIO
   }
   const brightDimRatio =
      nominalDimDistance > 0
         ? nominalBrightDistance / nominalDimDistance
         : DEFAULT_BRIGHT_RATIO

   if (footprint.cells.length === 0) {
      const bounds = computeRegionBounds(region)
      if (!bounds) return []
      return [
         {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
            config: { dim: nominalDimDistance, bright: nominalBrightDistance },
         },
      ]
   }

   const nominalRadiusPx = (nominalDimDistance / gridDistance) * gridSize

   const cellCenters = footprint.cells.map((c) => ({
      x: c.col * gridSize + gridSize / 2,
      y: c.row * gridSize + gridSize / 2,
   }))

   const candidateRadii = cellCenters.map((c) => {
      const clearance = distanceToNearestBoundaryEdge(c, footprint)
      return Math.max(0, Math.min(nominalRadiusPx, clearance))
   })

   const coverageSets = cellCenters.map((cand, idx) => {
      const r = candidateRadii[idx]
      if (r <= 0) return new Set()

      const r2 = r * r + 0.01
      const covered = new Set()
      for (let i = 0; i < cellCenters.length; i++) {
         const cc = cellCenters[i]
         const dx = cc.x - cand.x,
            dy = cc.y - cand.y
         if (dx * dx + dy * dy <= r2) covered.add(i)
      }
      return covered
   })

   const uncovered = new Set(cellCenters.map((_, i) => i))
   const chosenIndices = []
   const chosen = new Set()
   const MAX_LIGHTS = 20
   while (uncovered.size > 0 && chosenIndices.length < MAX_LIGHTS) {
      let bestIdx = -1,
         bestCount = 0,
         bestRadius = -1
      for (let i = 0; i < coverageSets.length; i++) {
         if (chosen.has(i)) continue
         let count = 0
         for (const ci of coverageSets[i]) {
            if (uncovered.has(ci)) count++
         }
         if (
            count > bestCount ||
            (count === bestCount && candidateRadii[i] > bestRadius)
         ) {
            bestCount = count
            bestIdx = i
            bestRadius = candidateRadii[i]
         }
      }
      if (bestIdx === -1 || bestCount === 0) break
      chosenIndices.push(bestIdx)
      chosen.add(bestIdx)
      for (const ci of coverageSets[bestIdx]) uncovered.delete(ci)
   }

   return chosenIndices.map((i) => {
      const r = candidateRadii[i]
      const dimDist = (r / gridSize) * gridDistance
      return {
         x: cellCenters[i].x,
         y: cellCenters[i].y,
         config: {
            dim: dimDist,
            bright: dimDist * brightDimRatio,
         },
      }
   })
}

export async function createAttachedSounds(region, soundEntries) {
   const scene = region.parent
   if (!scene) return
   const placement = soundPlacement(region)
   if (!placement) return

   const creates = []
   for (const entry of soundEntries) {
      const template = entry.system.sound ?? {}

      const boost = Number(entry.system?.radiusBoost)
      const factor = Number.isFinite(boost) ? Math.max(0.1, 1 + boost) : 1
      const radius = placement.radius * factor
      const data = foundry.utils.mergeObject(
         foundry.utils.deepClone(template),
         {
            x: placement.x,
            y: placement.y,
            radius,
            flags: {
               [FLAG_SCOPE]: {
                  managed: true,
                  attachedToRegion: region.uuid,
                  attachmentId: entry.id ?? null,
               },
            },
         },
         { overwrite: true, recursive: true },
      )
      delete data._id
      creates.push(data)
   }
   if (!creates.length) return
   try {
      await scene.createEmbeddedDocuments("AmbientSound", creates)
   } catch (e) {
      console.error(`[${MODULE_ID}] Failed to create attached sounds`, e)
   }
}

export async function createAttachedLights(region, lightEntries) {
   const scene = region.parent
   if (!scene) return

   const creates = []
   for (const entry of lightEntries) {
      const template = entry.system.light ?? {}
      const placements = lightPlacements(region, template)
      for (let i = 0; i < placements.length; i++) {
         const p = placements[i]
         const data = foundry.utils.mergeObject(
            foundry.utils.deepClone(template),
            {
               x: p.x,
               y: p.y,
               config: p.config,
               flags: {
                  [FLAG_SCOPE]: {
                     managed: true,
                     attachedToRegion: region.uuid,
                     attachmentId: entry.id ?? null,

                     lightCellIndex: i,
                  },
               },
            },
            { overwrite: true, recursive: true },
         )

         const cfg = data.config ?? {}
         const ang = Number(cfg.angle)
         if (!Number.isFinite(ang) || ang >= 359) {
            cfg.angle = 360
            data.config = cfg
         }
         delete data._id
         creates.push(data)
      }
   }
   if (!creates.length) return
   try {
      await scene.createEmbeddedDocuments("AmbientLight", creates)
   } catch (e) {
      console.error(`[${MODULE_ID}] Failed to create attached lights`, e)
   }
}
