import { FLAG_SCOPE } from "../data.mjs"
import { itemFromRegionEntry } from "../compendium/template-entry-item.mjs"

export function getAutomationForRegion(region, providedAutomation = null) {
   if (providedAutomation) return providedAutomation
   const managed = region.getFlag(FLAG_SCOPE, "managed")
   if (managed?.resolvedAutomation) return managed.resolvedAutomation
   if (!managed?.itemUuid) {
      return (
         itemFromRegionEntry(region, { editable: false })?.getFlag?.(
            FLAG_SCOPE,
            "automation",
         ) ?? null
      )
   }
   let item = null
   try {
      const fn = globalThis.fromUuidSync
      if (typeof fn === "function") item = fn(managed.itemUuid)
   } catch (_e) {}
   return (
      item?.getFlag?.(FLAG_SCOPE, "automation") ??
      itemFromRegionEntry(region, { editable: false })?.getFlag?.(
         FLAG_SCOPE,
         "automation",
      ) ??
      null
   )
}

export function templateVariantMatchesPlaced(v, placedType) {
   if (!v?.type || !placedType) return false
   if (placedType === "emanation") return v.type === "emanation"
   if (placedType === "cone") return v.type === "cone"
   if (placedType === "circle")
      return v.type === "circle" || v.type === "emanation"
   if (placedType === "square") return v.type === "square"
   if (placedType === "rectangle")
      return v.type === "square" || v.type === "rectangle" || v.type === "line"
   if (placedType === "ellipse") return v.type === "ellipse"
   if (placedType === "ring") return v.type === "ring"
   return v.type === placedType
}

export function shapeTypeFromRegion(region) {
   const placedType = region.shapes?.[0]?.type ?? null
   const areaShape = region.getFlag?.("pf2e", "areaShape")
   if (placedType === "emanation") return "emanation"
   if (placedType === "cone") return "cone"
   if (placedType === "circle") {
      if (areaShape === "emanation") return "emanation"
      return "circle"
   }
   if (placedType === "rectangle") {
      if (areaShape === "square") return "square"
      if (areaShape === "line") return "line"
      return "rectangle"
   }
   if (placedType === "ellipse") return "ellipse"
   if (placedType === "ring") return "ring"
   return null
}

export function getWizardShapeVariant(region, providedAutomation = null) {
   const automation = getAutomationForRegion(region, providedAutomation)
   const ts = automation?.templateShape
   const variants = Array.isArray(ts?.shapes) ? ts.shapes : []
   if (variants.length === 0) return null

   const placedType = shapeTypeFromRegion(region)

   return (
      variants.find((v) => templateVariantMatchesPlaced(v, placedType)) ??
      variants[0]
   )
}

export function getActiveTemplateShapeType(region, providedAutomation = null) {
   return (
      getWizardShapeVariant(region, providedAutomation)?.type ??
      shapeTypeFromRegion(region)
   )
}

export function getWizardShapeOverride(region, providedAutomation = null) {
   const chosen = getWizardShapeVariant(region, providedAutomation)
   if (!chosen) return null

   const scene = region.parent
   const gridSize = scene?.grid?.size ?? 100
   const gridDistance = scene?.grid?.distance ?? 5
   const pxPerDistance = gridSize / gridDistance
   const firstShape = region.shapes?.[0]
   const anchor =
      firstShape?.type === "emanation"
         ? (shapeOriginPoint(firstShape, gridSize) ?? {
              x: Number(firstShape?.x ?? 0),
              y: Number(firstShape?.y ?? 0),
           })
         : {
              x: Number(firstShape?.x ?? 0),
              y: Number(firstShape?.y ?? 0),
           }
   const anchorX = anchor.x
   const anchorY = anchor.y
   const rotation = Number(firstShape?.rotation ?? 0)

   const sizePx = Number(chosen.size ?? 15) * pxPerDistance
   switch (chosen.type) {
      case "circle":
         return {
            type: "circle",
            x: anchorX,
            y: anchorY,
            radius: sizePx,
            hole: false,
         }
      case "emanation": {
         const native = nativeEmanationOverride(firstShape, sizePx)
         if (native) return native
         return {
            type: "circle",
            x: anchorX,
            y: anchorY,
            radius: sizePx,
            hole: false,
         }
      }
      case "cone":
         return {
            type: "cone",
            x: anchorX,
            y: anchorY,
            radius: sizePx,
            angle: 90,
            rotation,
            curvature: "round",
            hole: false,
         }
      case "rectangle": {
         const widthPx = Number(chosen.width ?? 5) * pxPerDistance
         return {
            type: "rectangle",
            x: anchorX - sizePx / 2,
            y: anchorY - widthPx / 2,
            width: sizePx,
            height: widthPx,
            rotation,
            hole: false,
         }
      }
      case "square": {
         const width = Number(firstShape?.width ?? 0)
         const height = Number(firstShape?.height ?? 0)
         const centerX = width > 0 ? anchorX + width / 2 : anchorX
         const centerY = height > 0 ? anchorY + height / 2 : anchorY
         return {
            type: "rectangle",
            x: centerX - sizePx / 2,
            y: centerY - sizePx / 2,
            width: sizePx,
            height: sizePx,
            rotation,
            hole: false,
         }
      }
      case "line": {
         return null
      }
      case "ellipse":
         return {
            type: "ellipse",
            x: anchorX,
            y: anchorY,
            radiusX: sizePx,
            radiusY: sizePx,
            rotation,
            hole: false,
         }
      case "ring": {
         const innerR = Number(chosen.innerRadius ?? 0) * pxPerDistance

         const outerR = sizePx
         const band = innerR > 0 ? Math.max(1, outerR - innerR) : pxPerDistance
         const centerRadius = outerR - band / 2
         return {
            type: "ring",
            x: anchorX,
            y: anchorY,
            radius: centerRadius,
            innerWidth: 0,
            outerWidth: band,
            hole: false,
         }
      }
      default:
         return null
   }
}

function nativeEmanationOverride(shape, radius) {
   if (shape?.type !== "emanation") return null
   const clone = shape.clone?.()
   if (!clone?.updateSource) return null
   clone.updateSource({ radius })
   return clone
}

function shapeOriginPoint(shape, gridSize) {
   const origin = shape?.origin
   if (finitePoint(origin)) return { x: Number(origin.x), y: Number(origin.y) }

   if (shape?.type === "emanation") {
      return shapeOriginPoint(shape.base, gridSize)
   }

   if (shape?.type === "token") {
      const width = Math.max(1, Number(shape.width ?? 1))
      const height = Math.max(1, Number(shape.height ?? 1))
      return {
         x: Number(shape.x ?? 0) + (width * gridSize) / 2,
         y: Number(shape.y ?? 0) + (height * gridSize) / 2,
      }
   }

   return null
}

function finitePoint(point) {
   return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y))
}
