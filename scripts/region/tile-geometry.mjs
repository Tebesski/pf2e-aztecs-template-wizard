import { normalizeTileAttachments } from "../data.mjs"

export function computeRegionBounds(region) {
   const objB = region.object?.bounds
   if (objB && Number.isFinite(objB.width) && objB.width > 0) {
      return { x: objB.x, y: objB.y, width: objB.width, height: objB.height }
   }

   const shapes = region.shapes ?? []
   if (!shapes.length) return null
   let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
   for (const shape of shapes) {
      const nativeBounds = shapeBoundsFromNative(shape)
      if (nativeBounds) {
         if (nativeBounds.x < minX) minX = nativeBounds.x
         if (nativeBounds.y < minY) minY = nativeBounds.y
         if (nativeBounds.x + nativeBounds.width > maxX)
            maxX = nativeBounds.x + nativeBounds.width
         if (nativeBounds.y + nativeBounds.height > maxY)
            maxY = nativeBounds.y + nativeBounds.height
         continue
      }
      const x = Number(shape.x ?? 0),
         y = Number(shape.y ?? 0)
      const t = shape.type
      if (t === "rectangle") {
         const w = Number(shape.width ?? 0),
            h = Number(shape.height ?? 0)
         if (x < minX) minX = x
         if (y < minY) minY = y
         if (x + w > maxX) maxX = x + w
         if (y + h > maxY) maxY = y + h
      } else if (t === "circle") {
         const r = Number(shape.radius ?? 0)
         if (x - r < minX) minX = x - r
         if (y - r < minY) minY = y - r
         if (x + r > maxX) maxX = x + r
         if (y + r > maxY) maxY = y + r
      } else if (t === "ellipse") {
         const rx = Number(shape.radiusX ?? (shape.width ?? 0) / 2)
         const ry = Number(shape.radiusY ?? (shape.height ?? 0) / 2)
         if (x - rx < minX) minX = x - rx
         if (y - ry < minY) minY = y - ry
         if (x + rx > maxX) maxX = x + rx
         if (y + ry > maxY) maxY = y + ry
      } else if (t === "polygon") {
         const pts = shape.points ?? []
         for (let i = 0; i + 1 < pts.length; i += 2) {
            const px = Number(pts[i]),
               py = Number(pts[i + 1])
            if (px < minX) minX = px
            if (py < minY) minY = py
            if (px > maxX) maxX = px
            if (py > maxY) maxY = py
         }
      }
   }
   if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
   return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function shapeBoundsFromNative(shape) {
   const bounds = shape?.bounds
   if (
      !bounds ||
      !Number.isFinite(Number(bounds.x)) ||
      !Number.isFinite(Number(bounds.y)) ||
      !Number.isFinite(Number(bounds.width)) ||
      !Number.isFinite(Number(bounds.height)) ||
      Number(bounds.width) <= 0 ||
      Number(bounds.height) <= 0
   )
      return null
   return {
      x: Number(bounds.x),
      y: Number(bounds.y),
      width: Number(bounds.width),
      height: Number(bounds.height),
   }
}

export function tileDataForBounds(
   tileTemplate,
   bounds,
   scale,
   preserveAspectRatio = false,
) {
   const s = Math.max(0.1, Math.min(1, Number(scale) || 1))
   let w = bounds.width * s
   let h = bounds.height * s

   if (preserveAspectRatio) {
      const srcW = Number(tileTemplate?.width) || 0
      const srcH = Number(tileTemplate?.height) || 0
      const srcAspect = srcW > 0 && srcH > 0 ? srcW / srcH : 1
      if (w >= h) {
         h = w / srcAspect
      } else {
         w = h * srcAspect
      }
   }

   const x = bounds.x + (bounds.width - w) / 2
   const y = bounds.y + (bounds.height - h) / 2

   const texture = {
      src: tileTemplate?.texture?.src ?? "",
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      offsetX: 0,
      offsetY: 0,
      tint: tileTemplate?.texture?.tint ?? null,
      alphaThreshold: tileTemplate?.texture?.alphaThreshold ?? 0,
      fit: "fill",
   }
   return { x, y, width: w, height: h, texture }
}

export function tileAttachmentAppliesToShape(tileConfig, activeShapeType) {
   const shape = tileConfig?.shape ?? "all"
   return shape === "all" || !activeShapeType || shape === activeShapeType
}

export function findTileAttachmentConfig(entry, tileId, tileIndex) {
   const rows = normalizeTileAttachments(entry?.system)
   if (tileId) {
      const byId = rows.find((row) => row.id === tileId)
      if (byId) return byId
   }
   if (Number.isInteger(tileIndex) && rows[tileIndex]) return rows[tileIndex]
   return rows[0] ?? null
}
