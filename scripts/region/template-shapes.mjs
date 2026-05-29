import { FLAG_SCOPE } from "../data.mjs"

export function getAutomationForRegion(region, providedAutomation = null) {
   if (providedAutomation) return providedAutomation
   const managed = region.getFlag(FLAG_SCOPE, "managed")
   if (!managed?.itemUuid) return null
   let item = null
   try {
      const fn = globalThis.fromUuidSync
      if (typeof fn === "function") item = fn(managed.itemUuid)
   } catch (_e) {}
   return item?.getFlag?.(FLAG_SCOPE, "automation") ?? null
}

export function templateVariantMatchesPlaced(v, placedType) {
   if (!v?.type || !placedType) return false
   if (placedType === "cone") return v.type === "cone"
   if (placedType === "circle")
      return v.type === "circle" || v.type === "emanation" || v.type === "ring"
   if (placedType === "rectangle")
      return v.type === "rectangle" || v.type === "line"
   if (placedType === "ellipse") return v.type === "ellipse"
   if (placedType === "ring") return v.type === "ring"
   return v.type === placedType
}

export function shapeTypeFromRegion(region) {
   const placedType = region.shapes?.[0]?.type ?? null
   if (placedType === "cone") return "cone"
   if (placedType === "circle") return "circle"
   if (placedType === "rectangle") return "rectangle"
   if (placedType === "ellipse") return "ellipse"
   if (placedType === "ring") return "ring"
   return null
}

export function getWizardShapeVariant(region, providedAutomation = null) {
   const automation = getAutomationForRegion(region, providedAutomation)
   const ts = automation?.templateShape
   const variants = Array.isArray(ts?.shapes) ? ts.shapes : []
   if (variants.length === 0) return null

   const placedType = region.shapes?.[0]?.type ?? null

   if (placedType === "circle") {
      const ring = variants.find((v) => v?.type === "ring")
      if (ring) return ring
   }

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
   const anchorX = Number(firstShape?.x ?? 0)
   const anchorY = Number(firstShape?.y ?? 0)
   const rotation = Number(firstShape?.rotation ?? 0)

   const sizePx = Number(chosen.size ?? 15) * pxPerDistance
   switch (chosen.type) {
      case "circle":
      case "emanation":
         return {
            type: "circle",
            x: anchorX,
            y: anchorY,
            radius: sizePx,
            hole: false,
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
