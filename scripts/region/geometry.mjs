import { MODULE_ID } from "../data.mjs"
import { getRegionPolygons, distSqPointToSegment } from "./attached-media.mjs"
import { getWizardShapeOverride } from "./template-shapes.mjs"
import { computeRegionBounds } from "./tile-geometry.mjs"
export {
   circle2,
   circle3,
   inCircle,
   smallestEnclosingCircle,
} from "./enclosing-circle.mjs"
export {
   getActiveTemplateShapeType,
   getAutomationForRegion,
   getWizardShapeOverride,
   getWizardShapeVariant,
   shapeTypeFromRegion,
   templateVariantMatchesPlaced,
} from "./template-shapes.mjs"

export {
   computeRegionBounds,
   findTileAttachmentConfig,
   tileAttachmentAppliesToShape,
   tileDataForBounds,
} from "./tile-geometry.mjs"

const FOOTPRINT_CACHE = new WeakMap()

export function clearRegionFootprintCache(region) {
   if (region) FOOTPRINT_CACHE.delete(region)
}

export function cellKey(col, row) {
   return col + ":" + row
}

export function buildRegionPointTester(region) {
   const polys = getRegionPolygons(region)
   if (polys.length > 0) {
      return (p) => pointInPolygons(p, polys)
   }

   if (typeof region.testPoint === "function") {
      return (p) => {
         try {
            const r = region.testPoint(p)
            return r === true || r === 2
         } catch (_e) {
            return false
         }
      }
   }
   return (_) => false
}

export function pointInPolygons(point, polys) {
   let inside = false
   for (const poly of polys) {
      let polyInside = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
         const xi = poly[i].x,
            yi = poly[i].y
         const xj = poly[j].x,
            yj = poly[j].y
         const denom = yj - yi || 1e-12
         const intersect =
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / denom + xi
         if (intersect) polyInside = !polyInside
      }
      if (polyInside) inside = !inside
   }
   return inside
}

export function segmentsIntersect(p1, p2, p3, p4) {
   const d1 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
   const d2 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x)
   const d3 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)
   const d4 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x)
   if (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
   )
      return true

   if (d1 === 0 && onSegment(p1, p2, p3)) return true
   if (d2 === 0 && onSegment(p1, p2, p4)) return true
   if (d3 === 0 && onSegment(p3, p4, p1)) return true
   if (d4 === 0 && onSegment(p3, p4, p2)) return true
   return false
}
export function onSegment(a, b, p) {
   return (
      Math.min(a.x, b.x) <= p.x &&
      p.x <= Math.max(a.x, b.x) &&
      Math.min(a.y, b.y) <= p.y &&
      p.y <= Math.max(a.y, b.y)
   )
}

export function cellOverlapsRegion(polys, x, y, size) {
   const cellCorners = [
      { x: x, y: y },
      { x: x + size, y: y },
      { x: x + size, y: y + size },
      { x: x, y: y + size },
   ]

   const inset = 0.001
   const insetCorners = [
      { x: x + inset, y: y + inset },
      { x: x + size - inset, y: y + inset },
      { x: x + size - inset, y: y + size - inset },
      { x: x + inset, y: y + size - inset },
   ]
   for (const c of insetCorners) {
      if (pointInPolygons(c, polys)) return true
   }

   for (const poly of polys) {
      for (const v of poly) {
         if (v.x > x && v.x < x + size && v.y > y && v.y < y + size) return true
      }
   }

   for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
         const a = poly[i]
         const b = poly[(i + 1) % poly.length]

         for (let e = 0; e < 4; e++) {
            const c1 = cellCorners[e]
            const c2 = cellCorners[(e + 1) % 4]
            if (segmentsIntersect(a, b, c1, c2)) return true
         }
      }
   }
   return false
}

export function cellIsInRegion(test, x, y, size) {
   const inset = Math.max(1, size * 0.02)
   const usable = size - 2 * inset
   for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
         const px = x + inset + (usable * col) / 4
         const py = y + inset + (usable * row) / 4
         if (test({ x: px, y: py })) return true
      }
   }
   return false
}

export function lineShapeMetrics(shape) {
   const x = Number(shape.x ?? 0)
   const y = Number(shape.y ?? 0)
   const length = Number(shape.length ?? shape.width ?? 0)
   const width = Number(shape.width ?? shape.height ?? 0)
   if (length <= 0 || width <= 0) return null
   const rotation = (Number(shape.rotation ?? 0) * Math.PI) / 180
   const cos = Math.cos(rotation)
   const sin = Math.sin(rotation)
   return { x, y, length, width, rotation, cos, sin }
}

export function lineShapeCorners(shape) {
   const m = lineShapeMetrics(shape)
   if (!m) return null
   const half = m.width / 2
   const sx = m.x
   const sy = m.y
   const ex = m.x + m.cos * m.length
   const ey = m.y + m.sin * m.length
   const nx = -m.sin
   const ny = m.cos
   return [
      { x: sx - nx * half, y: sy - ny * half },
      { x: ex - nx * half, y: ey - ny * half },
      { x: ex + nx * half, y: ey + ny * half },
      { x: sx + nx * half, y: sy + ny * half },
   ]
}

export function makeShapeContainsTest(shape) {
   if (!shape || !shape.type) return null

   switch (shape.type) {
      case "circle": {
         const cx = Number(shape.x ?? 0)
         const cy = Number(shape.y ?? 0)
         const r = Number(shape.radius ?? 0)
         const r2 = r * r + 0.001
         if (r <= 0) return null
         return (p) => {
            const dx = p.x - cx,
               dy = p.y - cy
            return dx * dx + dy * dy <= r2
         }
      }

      case "ring": {
         const cx = Number(shape.x ?? 0)
         const cy = Number(shape.y ?? 0)
         const r = Number(shape.radius ?? 0)
         const outerWidth = Number(shape.outerWidth ?? 0)
         const innerWidth = Number(shape.innerWidth ?? 0)
         if (r <= 0 || outerWidth <= 0) return null
         const rOuter = r + outerWidth / 2
         const rInner = Math.max(0, r - outerWidth / 2)
         const rInner2 = rInner * rInner
         const rOuter2 = rOuter * rOuter
         const rHole = innerWidth > 0 ? innerWidth : 0
         const rHole2 = rHole * rHole
         return (p) => {
            const dx = p.x - cx,
               dy = p.y - cy
            const d2 = dx * dx + dy * dy
            return (
               d2 <= rOuter2 + 0.001 &&
               d2 >= rInner2 - 0.001 &&
               d2 >= rHole2 - 0.001
            )
         }
      }

      case "ellipse": {
         const cx = Number(shape.x ?? 0)
         const cy = Number(shape.y ?? 0)
         const rx = Number(
            shape.radiusX ?? shape.radius ?? (shape.width ?? 0) / 2,
         )
         const ry = Number(
            shape.radiusY ?? shape.radius ?? (shape.height ?? 0) / 2,
         )
         if (rx <= 0 || ry <= 0) return null
         const rotation = (Number(shape.rotation ?? 0) * Math.PI) / 180
         const cosR = Math.cos(-rotation)
         const sinR = Math.sin(-rotation)
         return (p) => {
            const dx = p.x - cx,
               dy = p.y - cy

            const lx = dx * cosR - dy * sinR
            const ly = dx * sinR + dy * cosR
            const ex = lx / rx
            const ey = ly / ry
            return ex * ex + ey * ey <= 1.001
         }
      }

      case "rectangle": {
         const x = Number(shape.x ?? 0)
         const y = Number(shape.y ?? 0)
         const w = Number(shape.width ?? 0)
         const h = Number(shape.height ?? 0)
         if (w <= 0 || h <= 0) return null
         const rotation = (Number(shape.rotation ?? 0) * Math.PI) / 180
         if (Math.abs(rotation) < 1e-6) {
            return (p) =>
               p.x >= x - 0.001 &&
               p.x <= x + w + 0.001 &&
               p.y >= y - 0.001 &&
               p.y <= y + h + 0.001
         }

         const cx = x + w / 2,
            cy = y + h / 2
         const cosR = Math.cos(-rotation)
         const sinR = Math.sin(-rotation)
         return (p) => {
            const dx = p.x - cx,
               dy = p.y - cy
            const lx = dx * cosR - dy * sinR + cx
            const ly = dx * sinR + dy * cosR + cy
            return (
               lx >= x - 0.001 &&
               lx <= x + w + 0.001 &&
               ly >= y - 0.001 &&
               ly <= y + h + 0.001
            )
         }
      }

      case "line": {
         const m = lineShapeMetrics(shape)
         if (!m) return null
         const half = m.width / 2
         return (p) => {
            const dx = p.x - m.x
            const dy = p.y - m.y
            const along = dx * m.cos + dy * m.sin
            const cross = -dx * m.sin + dy * m.cos
            return (
               along >= -0.001 &&
               along <= m.length + 0.001 &&
               cross >= -half - 0.001 &&
               cross <= half + 0.001
            )
         }
      }

      case "cone": {
         const cx = Number(shape.x ?? 0)
         const cy = Number(shape.y ?? 0)
         const r = Number(shape.radius ?? 0)
         if (r <= 0) return null
         const r2 = r * r + 0.001
         const rotationRad = (Number(shape.rotation ?? 0) * Math.PI) / 180
         const halfAngleRad = ((Number(shape.angle ?? 90) / 2) * Math.PI) / 180
         const cosHalf = Math.cos(halfAngleRad)
         const dirX = Math.cos(rotationRad)
         const dirY = Math.sin(rotationRad)
         const curvature = shape.curvature ?? "round"

         return (p) => {
            const vx = p.x - cx,
               vy = p.y - cy
            const d2 = vx * vx + vy * vy
            if (d2 > r2) return false
            if (d2 < 0.001) return true

            const dot = vx * dirX + vy * dirY
            const d = Math.sqrt(d2)
            if (dot < d * cosHalf - 0.001) return false

            if (curvature === "flat") {
               const proj = dot
               if (proj > r * cosHalf + 0.001) return false
            }
            return true
         }
      }

      case "polygon": {
         const flat = Array.isArray(shape.points) ? shape.points : []
         if (flat.length < 6) return null
         const poly = []
         for (let i = 0; i + 1 < flat.length; i += 2) {
            poly.push({ x: Number(flat[i]), y: Number(flat[i + 1]) })
         }
         if (poly.length < 3) return null
         return (p) => pointInPolygons(p, [poly])
      }

      default:
         return null
   }
}

export function shapeBounds(shape) {
   if (!shape || !shape.type) return null

   switch (shape.type) {
      case "circle":
      case "cone": {
         const x = Number(shape.x ?? 0),
            y = Number(shape.y ?? 0)
         const r = Number(shape.radius ?? 0)
         if (r <= 0) return null
         return { x: x - r, y: y - r, width: r * 2, height: r * 2 }
      }
      case "ring": {
         const x = Number(shape.x ?? 0),
            y = Number(shape.y ?? 0)
         const r = Number(shape.radius ?? 0)
         const outerWidth = Number(shape.outerWidth ?? 0)
         const rOuter = r + outerWidth / 2
         if (rOuter <= 0) return null
         return {
            x: x - rOuter,
            y: y - rOuter,
            width: rOuter * 2,
            height: rOuter * 2,
         }
      }
      case "ellipse": {
         const x = Number(shape.x ?? 0),
            y = Number(shape.y ?? 0)
         const rx = Number(
            shape.radiusX ?? shape.radius ?? (shape.width ?? 0) / 2,
         )
         const ry = Number(
            shape.radiusY ?? shape.radius ?? (shape.height ?? 0) / 2,
         )
         if (rx <= 0 || ry <= 0) return null

         const m = Math.max(rx, ry)
         return { x: x - m, y: y - m, width: m * 2, height: m * 2 }
      }
      case "rectangle": {
         const x = Number(shape.x ?? 0),
            y = Number(shape.y ?? 0)
         const w = Number(shape.width ?? 0),
            h = Number(shape.height ?? 0)
         if (w <= 0 || h <= 0) return null
         const rotation = Number(shape.rotation ?? 0)
         if (Math.abs(rotation) < 1e-6) {
            return { x, y, width: w, height: h }
         }

         const cx = x + w / 2,
            cy = y + h / 2
         const half = Math.hypot(w, h) / 2
         return {
            x: cx - half,
            y: cy - half,
            width: half * 2,
            height: half * 2,
         }
      }
      case "line": {
         const corners = lineShapeCorners(shape)
         if (!corners) return null
         let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity
         for (const p of corners) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
         }
         return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }
      case "polygon": {
         const flat = Array.isArray(shape.points) ? shape.points : []
         if (flat.length < 4) return null
         let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity
         for (let i = 0; i + 1 < flat.length; i += 2) {
            const x = Number(flat[i]),
               y = Number(flat[i + 1])
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
         }
         if (!Number.isFinite(minX)) return null
         return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }
   }
   return null
}

export function pointInShapes(point, shapeTests) {
   let inAny = false
   let inHole = false
   for (const { test, hole } of shapeTests) {
      if (test(point)) {
         if (hole) inHole = true
         else inAny = true
      }
   }
   return inAny && !inHole
}

export function getRegionFootprintFromShapes(region, overrideShape) {
   const scene = region.parent
   if (!scene) return null
   const gridSize = scene.grid?.size ?? 100

   const shapes = overrideShape ? [overrideShape] : (region.shapes ?? [])
   if (shapes.length === 0) return null

   const shapeTests = []
   let minScanCol = Infinity,
      maxScanCol = -Infinity
   let minScanRow = Infinity,
      maxScanRow = -Infinity
   for (const shape of shapes) {
      const test = makeShapeContainsTest(shape)
      if (!test) continue
      shapeTests.push({ test, hole: shape.hole === true })
      if (!shape.hole) {
         const b = shapeBounds(shape)
         if (b) {
            const sCol = Math.floor(b.x / gridSize)
            const sRow = Math.floor(b.y / gridSize)
            const eCol = Math.ceil((b.x + b.width) / gridSize) + 1
            const eRow = Math.ceil((b.y + b.height) / gridSize) + 1
            if (sCol < minScanCol) minScanCol = sCol
            if (eCol > maxScanCol) maxScanCol = eCol
            if (sRow < minScanRow) minScanRow = sRow
            if (eRow > maxScanRow) maxScanRow = eRow
         }
      }
   }
   if (shapeTests.length === 0 || !Number.isFinite(minScanCol)) return null

   const cells = []
   const cellSet = new Set()
   for (let row = minScanRow; row < maxScanRow; row++) {
      for (let col = minScanCol; col < maxScanCol; col++) {
         const cx = col * gridSize + gridSize / 2
         const cy = row * gridSize + gridSize / 2
         if (pointInShapes({ x: cx, y: cy }, shapeTests)) {
            cells.push({ col, row })
            cellSet.add(cellKey(col, row))
         }
      }
   }
   if (cells.length === 0) return null

   let minCol = Infinity,
      maxCol = -Infinity,
      minRow = Infinity,
      maxRow = -Infinity
   for (const c of cells) {
      if (c.col < minCol) minCol = c.col
      if (c.col > maxCol) maxCol = c.col
      if (c.row < minRow) minRow = c.row
      if (c.row > maxRow) maxRow = c.row
   }
   const bounds = {
      x: minCol * gridSize,
      y: minRow * gridSize,
      width: (maxCol - minCol + 1) * gridSize,
      height: (maxRow - minRow + 1) * gridSize,
   }

   const boundaryEdges = []
   for (const { col, row } of cells) {
      const x = col * gridSize,
         y = row * gridSize
      if (!cellSet.has(cellKey(col, row - 1))) {
         boundaryEdges.push({ a: { x, y }, b: { x: x + gridSize, y } })
      }
      if (!cellSet.has(cellKey(col + 1, row))) {
         boundaryEdges.push({
            a: { x: x + gridSize, y },
            b: { x: x + gridSize, y: y + gridSize },
         })
      }
      if (!cellSet.has(cellKey(col, row + 1))) {
         boundaryEdges.push({
            a: { x: x + gridSize, y: y + gridSize },
            b: { x, y: y + gridSize },
         })
      }
      if (!cellSet.has(cellKey(col - 1, row))) {
         boundaryEdges.push({ a: { x, y: y + gridSize }, b: { x, y } })
      }
   }
   const boundaryPolygons = stitchEdgesToPolygons(boundaryEdges)

   return { cells, cellSet, gridSize, bounds, boundaryEdges, boundaryPolygons }
}

export function getRegionFootprint(region) {
   const cached = FOOTPRINT_CACHE.get(region)
   if (cached) return cached

   const scene = region.parent
   const gridSize = scene?.grid?.size ?? 100

   let result = null
   try {
      const override = getWizardShapeOverride(region)
      if (override) result = getRegionFootprintFromShapes(region, override)
   } catch (e) {
      console.warn(`[${MODULE_ID}] Wizard shape override failed`, e)
   }

   if (!result) {
      try {
         result = getRegionFootprintFromShapes(region)
      } catch (e) {
         console.warn(`[${MODULE_ID}] Shape-based footprint failed`, e)
      }
   }

   if (!result) {
      result = getRegionFootprintFromPolygons(region)
   }

   if (!result) {
      result = {
         cells: [],
         cellSet: new Set(),
         gridSize,
         bounds: null,
         boundaryEdges: [],
         boundaryPolygons: [],
      }
   }

   FOOTPRINT_CACHE.set(region, result)
   return result
}

export function getRegionFootprintFromPolygons(region) {
   const scene = region.parent
   const gridSize = scene?.grid?.size ?? 100

   const polyBounds = computeRegionBounds(region)
   if (!polyBounds) return null
   const margin = gridSize
   const startCol = Math.floor((polyBounds.x - margin) / gridSize)
   const startRow = Math.floor((polyBounds.y - margin) / gridSize)
   const endCol = Math.ceil(
      (polyBounds.x + polyBounds.width + margin) / gridSize,
   )
   const endRow = Math.ceil(
      (polyBounds.y + polyBounds.height + margin) / gridSize,
   )

   const polys = getRegionPolygons(region)
   const cells = []
   for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
         const cx = col * gridSize,
            cy = row * gridSize

         const center = { x: cx + gridSize / 2, y: cy + gridSize / 2 }
         if (
            polys.length > 0
               ? pointInPolygons(center, polys)
               : cellIsInRegion(
                    buildRegionPointTester(region),
                    cx,
                    cy,
                    gridSize,
                 )
         ) {
            cells.push({ col, row })
         }
      }
   }

   if (cells.length === 0) {
      console.warn(
         `[${MODULE_ID}] Footprint scan found 0 cells for region ${region.uuid}. polyBounds=`,
         polyBounds,
      )
      return null
   }

   let minCol = Infinity,
      maxCol = -Infinity,
      minRow = Infinity,
      maxRow = -Infinity
   for (const c of cells) {
      if (c.col < minCol) minCol = c.col
      if (c.col > maxCol) maxCol = c.col
      if (c.row < minRow) minRow = c.row
      if (c.row > maxRow) maxRow = c.row
   }
   const bounds = {
      x: minCol * gridSize,
      y: minRow * gridSize,
      width: (maxCol - minCol + 1) * gridSize,
      height: (maxRow - minRow + 1) * gridSize,
   }

   const cellSet = new Set(cells.map((c) => cellKey(c.col, c.row)))
   const boundaryEdges = []
   for (const { col, row } of cells) {
      const x = col * gridSize,
         y = row * gridSize
      if (!cellSet.has(cellKey(col, row - 1))) {
         boundaryEdges.push({ a: { x, y }, b: { x: x + gridSize, y } })
      }
      if (!cellSet.has(cellKey(col + 1, row))) {
         boundaryEdges.push({
            a: { x: x + gridSize, y },
            b: { x: x + gridSize, y: y + gridSize },
         })
      }
      if (!cellSet.has(cellKey(col, row + 1))) {
         boundaryEdges.push({
            a: { x: x + gridSize, y: y + gridSize },
            b: { x, y: y + gridSize },
         })
      }
      if (!cellSet.has(cellKey(col - 1, row))) {
         boundaryEdges.push({ a: { x, y: y + gridSize }, b: { x, y } })
      }
   }
   const boundaryPolygons = stitchEdgesToPolygons(boundaryEdges)

   return { cells, cellSet, gridSize, bounds, boundaryEdges, boundaryPolygons }
}

export function stitchEdgesToPolygons(edges) {
   if (edges.length === 0) return []

   const ptKey = (p) => `${Math.round(p.x)}:${Math.round(p.y)}`
   const remaining = new Map()
   for (const e of edges) {
      const k = ptKey(e.a)
      if (!remaining.has(k)) remaining.set(k, [])
      remaining.get(k).push(e)
   }
   const polys = []
   let safety = edges.length * 4
   while (remaining.size > 0 && safety-- > 0) {
      const firstKey = remaining.keys().next().value
      const firstList = remaining.get(firstKey)
      let edge = firstList.shift()
      if (firstList.length === 0) remaining.delete(firstKey)
      const poly = [edge.a]
      let next = edge.b
      let chainSafety = edges.length + 1
      while (chainSafety-- > 0) {
         const k = ptKey(next)
         const list = remaining.get(k)
         if (!list || list.length === 0) {
            poly.push(next)
            break
         }
         poly.push(next)
         edge = list.shift()
         if (list.length === 0) remaining.delete(k)
         next = edge.b

         if (
            Math.round(next.x) === Math.round(poly[0].x) &&
            Math.round(next.y) === Math.round(poly[0].y)
         ) {
            break
         }
      }
      if (poly.length >= 3) polys.push(poly)
   }
   return polys
}

export function pointInFootprint(point, footprint) {
   if (!footprint || footprint.cells.length === 0) return false
   const col = Math.floor(point.x / footprint.gridSize)
   const row = Math.floor(point.y / footprint.gridSize)
   return footprint.cellSet.has(cellKey(col, row))
}

export function distanceToNearestBoundaryEdge(point, footprint) {
   let best = Infinity
   for (const edge of footprint.boundaryEdges) {
      const d2 = distSqPointToSegment(point, edge.a, edge.b)
      if (d2 < best) best = d2
   }
   return Math.sqrt(best)
}

export function maxDistanceToCellCorners(center, footprint) {
   let best = 0
   const g = footprint.gridSize
   for (const { col, row } of footprint.cells) {
      const corners = [
         { x: col * g, y: row * g },
         { x: (col + 1) * g, y: row * g },
         { x: col * g, y: (row + 1) * g },
         { x: (col + 1) * g, y: (row + 1) * g },
      ]
      for (const c of corners) {
         const d = Math.hypot(c.x - center.x, c.y - center.y)
         if (d > best) best = d
      }
   }
   return best
}

export function footprintCornerPoints(footprint) {
   const g = footprint.gridSize
   const seen = new Set()
   const out = []
   for (const { col, row } of footprint.cells) {
      for (let dr = 0; dr <= 1; dr++) {
         for (let dc = 0; dc <= 1; dc++) {
            const x = (col + dc) * g,
               y = (row + dr) * g
            const key = x + ":" + y
            if (!seen.has(key)) {
               seen.add(key)
               out.push({ x, y })
            }
         }
      }
   }
   return out
}
