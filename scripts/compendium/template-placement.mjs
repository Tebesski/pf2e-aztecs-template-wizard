import { FLAG_SCOPE } from "../data.mjs"
import {
   compendiumEntryOriginUuid,
   createTemplateEntryItem,
   makeTemplateEntryFlag,
   sanitizeTemplateEntry,
} from "./template-entry-item.mjs"
import { resolveAutomationHeightening } from "../heightening.mjs"

const SHAPE_ICONS = {
   circle: "fa-circle",
   emanation: "fa-arrows-to-circle",
   line: "fa-grip-lines",
   ring: "fa-ring",
   square: "fa-square",
   cone: "fa-triangle",
}

export function shapeLabel(type) {
   const normalized = type === "circle" ? "burst" : String(type ?? "template")
   return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function shapeSizeLabel(variant) {
   const type = variant?.type ?? "circle"
   const size = Number(variant?.size ?? 0)
   const width = Number(variant?.width ?? 0)
   const innerRadius = Number(variant?.innerRadius ?? 0)
   if (type === "line" && width > 0) return `${size} ft x ${width} ft`
   if (type === "ring" && innerRadius > 0) {
      return `${innerRadius} ft / ${size} ft`
   }
   return `${size} ft`
}

export function templateShapeBadges(automation) {
   const shapes = Array.isArray(automation?.templateShape?.shapes)
      ? automation.templateShape.shapes
      : []
   return shapes.map((shape, index) => ({
      index,
      label: shapeLabel(shape?.type),
      size: shapeSizeLabel(shape),
      icon: SHAPE_ICONS[shape?.type] ?? "fa-ruler-combined",
   }))
}

function feetToPixels(value) {
   const gridSize = canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100
   const gridDistance =
      canvas?.grid?.distance ?? canvas?.dimensions?.distance ?? 5
   return (Number(value) || 0) * (gridSize / gridDistance)
}

function mousePosition() {
   const mouse = canvas?.mousePosition
   if (mouse && Number.isFinite(mouse.x) && Number.isFinite(mouse.y)) {
      return { x: mouse.x, y: mouse.y }
   }
   const dimensions = canvas?.dimensions
   return {
      x: Number(dimensions?.sceneX ?? 0) + Number(dimensions?.width ?? 0) / 2,
      y: Number(dimensions?.sceneY ?? 0) + Number(dimensions?.height ?? 0) / 2,
   }
}

function activeTokenSource() {
   const token = canvas?.tokens?.controlled?.[0]?.document
   if (!token) return null
   return {
      type: "token",
      width: Number(token.width ?? 1),
      height: Number(token.height ?? 1),
      x: Number(token.x ?? 0),
      y: Number(token.y ?? 0),
      shape: foundry.utils.deepClone(token.shape ?? {}),
   }
}

function supportsNativeEmanationShape() {
   return !!globalThis.foundry?.data?.BaseShapeData?.TYPES?.emanation
}

function defaultTokenShape() {
   return globalThis.CONST?.TOKEN_SHAPES?.RECTANGLE_1 ?? 4
}

function tokenBaseAtPoint(x, y) {
   const gridSize = canvas?.grid?.size ?? canvas?.dimensions?.size ?? 100
   return {
      type: "token",
      x: Math.round(Number(x ?? 0) - gridSize / 2),
      y: Math.round(Number(y ?? 0) - gridSize / 2),
      width: 1,
      height: 1,
      shape: defaultTokenShape(),
   }
}

export function shapeDataFromVariant(variant) {
   const { x, y } = mousePosition()
   const type = variant?.type ?? "circle"
   const size = feetToPixels(variant?.size ?? 15)
   switch (type) {
      case "cone":
         return { type: "cone", angle: 90, radius: size, x, y }
      case "line":
         return {
            type: "line",
            length: size,
            width: feetToPixels(variant?.width ?? 5),
            x,
            y,
         }
      case "ring": {
         const innerRadius = feetToPixels(variant?.innerRadius ?? 5)
         const band =
            innerRadius > 0 ? Math.max(1, size - innerRadius) : feetToPixels(5)
         return {
            type: "ring",
            radius: size - band / 2,
            innerWidth: 0,
            outerWidth: band,
            x,
            y,
         }
      }
      case "square":
         return {
            type: "rectangle",
            width: size,
            height: size,
            x: x - size / 2,
            y: y - size / 2,
         }
      case "emanation":
         if (supportsNativeEmanationShape()) {
            return {
               type: "emanation",
               base: tokenBaseAtPoint(x, y),
               radius: size,
               gridBased: true,
            }
         }
         return { type: "circle", radius: size, x, y }
      case "circle":
      default:
         return { type: "circle", radius: size, x, y }
   }
}

export function variantsForAutomation(automation) {
   const shapes = Array.isArray(automation?.templateShape?.shapes)
      ? automation.templateShape.shapes
      : []
   return shapes.length ? shapes : [{ type: "circle", size: 15, width: 5 }]
}

export function resolvedAutomationForTemplateEntry(entry) {
   const clean = sanitizeTemplateEntry(entry)
   const item = createTemplateEntryItem(clean, { editable: false })
   return resolveAutomationHeightening(clean.automation, item)
}

export function placeTemplateEntryVariant(entry, variantIndex = 0) {
   if (!canvas?.ready || !canvas.regions?.placeRegion) {
      ui.notifications?.warn("Open a scene before placing a template.")
      return false
   }
   const clean = sanitizeTemplateEntry(entry)
   const resolvedAutomation = resolvedAutomationForTemplateEntry(clean)
   const variants = variantsForAutomation(resolvedAutomation)
   const variant =
      variants[Math.max(0, Number(variantIndex) || 0)] ?? variants[0]
   const shape = shapeDataFromVariant(variant)
   if (!shape) return false
   const pf2eAreaShape = variant?.type === "circle" ? "burst" : variant?.type
   canvas.regions.placeRegion({
      name: clean.name || "Template",
      shapes: [shape],
      color: game.user.color?.toString?.() ?? "#a728cc",
      highlightMode: "coverage",
      displayMeasurements: true,
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      flags: {
         [FLAG_SCOPE]: {
            compendiumEntry: makeTemplateEntryFlag(clean),
            originUuid: compendiumEntryOriginUuid(clean),
            placementRange: resolvedAutomation.placementRange ?? undefined,
         },
         pf2e: { areaShape: pf2eAreaShape },
      },
   })
   return true
}
