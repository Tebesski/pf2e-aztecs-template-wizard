import { MODULE_ID } from "./data.mjs"
import { executeAsGM } from "./runtime/index.mjs"

const PATCH_FLAG = "__atwTemplatePlacementResizePatched"
const DOUBLE_CLICK_FALLBACK_MS = 250
const DOUBLE_CLICK_DISTANCE_PX = 8
let ACTIVE_RESIZE_ARGS = null

export function registerTemplatePlacementResizeKeybindings() {
   game.keybindings.register(MODULE_ID, "shrinkTemplatePlacement", {
      name: "PF2EATW.Keybinding.ShrinkTemplate",
      editable: [{ key: "BracketLeft", modifiers: [] }],
      restricted: false,
      onDown: () => resizeActiveTemplatePlacement(-1),
   })
   game.keybindings.register(MODULE_ID, "growTemplatePlacement", {
      name: "PF2EATW.Keybinding.GrowTemplate",
      editable: [{ key: "BracketRight", modifiers: [] }],
      restricted: false,
      onDown: () => resizeActiveTemplatePlacement(1),
   })
}

export function installTemplatePlacementResize() {
   const RegionLayer = globalThis.foundry?.canvas?.layers?.RegionLayer
   const proto = RegionLayer?.prototype
   if (!proto || proto[PATCH_FLAG]) return
   const original = proto.placeRegion
   if (typeof original !== "function") return

   Object.defineProperty(proto, PATCH_FLAG, { value: true })
   proto.placeRegion = async function atwPlaceRegionWithResize(
      data,
      options = {},
   ) {
      if (!shouldPatchPlacement(data)) {
         return original.call(this, data, options)
      }

      const state = { lastRightClick: null, pendingShrink: null }
      const userPreSkip = options.preSkip
      const wrappedOptions = {
         ...options,
         preSkip: (args) => {
            ACTIVE_RESIZE_ARGS = args ?? ACTIVE_RESIZE_ARGS
            if (args?.event?.button !== 2) return userPreSkip?.(args)
            if (!isRightClickResizeEnabled()) return userPreSkip?.(args)
            const allowed = userPreSkip?.(args)
            if (allowed === false) return false
            handleRightClickResize(args, state)
            return false
         },
      }
      let onMoveHandler = wrapPlacementMove(options.onMove)
      Object.defineProperty(wrappedOptions, "onMove", {
         configurable: true,
         enumerable: true,
         get: () => onMoveHandler,
         set: (fn) => {
            onMoveHandler = wrapPlacementMove(fn)
         },
      })

      try {
         const result = await original.call(this, data, wrappedOptions)
         delegatePlacedTemplateAutomation(data, result)
         return result
      } finally {
         ACTIVE_RESIZE_ARGS = null
         clearPendingShrink(state)
      }
   }
}

function wrapPlacementMove(fn) {
   return (args) => {
      ACTIVE_RESIZE_ARGS = args ?? ACTIVE_RESIZE_ARGS
      return fn?.(args)
   }
}

function resizeActiveTemplatePlacement(direction) {
   if (!ACTIVE_RESIZE_ARGS) return false
   return resizePlacementShape(ACTIVE_RESIZE_ARGS, direction)
}

function isRightClickResizeEnabled() {
   try {
      return game.settings.get(MODULE_ID, "enableTemplateResizeRmb") !== false
   } catch (_e) {
      return true
   }
}

function shouldPatchPlacement(data) {
   const shapes = Array.isArray(data?.shapes) ? data.shapes : []
   if (!shapes.some((shape) => canResizeShape(shape))) return false

   return !!(
      data?.flags?.pf2e?.areaShape ||
      data?.displayMeasurements ||
      canvas.regions?.templateMode
   )
}

function delegatePlacedTemplateAutomation(data, result) {
   if (game.user?.isGM) return
   const region = regionDocumentFromPlacementResult(result)
   if (!region?.uuid) return
   const itemUuid = extractPlacementItemUuid(data)
   setTimeout(async () => {
      try {
         await executeAsGM("applyRegionAutomation", region.uuid, {
            allowContiguous: false,
            itemUuid,
            ownerUserId: game.user.id,
         })
      } catch (e) {
         console.warn(
            `[${MODULE_ID}] failed to delegate placed template automation to GM`,
            e,
         )
      }
   }, 350)
}

function regionDocumentFromPlacementResult(result) {
   if (!result) return null
   if (Array.isArray(result)) {
      for (const entry of result) {
         const doc = regionDocumentFromPlacementResult(entry)
         if (doc) return doc
      }
      return null
   }
   if (result.documentName === "Region") return result
   if (result.document?.documentName === "Region") return result.document
   return null
}

function extractPlacementItemUuid(data) {
   const direct = data?.flags?.[MODULE_ID]?.originUuid
   if (isItemUuid(direct)) return direct
   const pf2eOrigin = data?.flags?.pf2e?.origin
   if (isItemUuid(pf2eOrigin?.uuid)) return pf2eOrigin.uuid
   if (isItemUuid(pf2eOrigin)) return pf2eOrigin
   for (const ns of Object.values(data?.flags ?? {})) {
      if (!ns || typeof ns !== "object") continue
      for (const key of ["sourceId", "itemUuid", "originUuid"]) {
         const value = ns[key]
         if (isItemUuid(value)) return value
      }
   }
   return null
}

function isItemUuid(value) {
   return (
      typeof value === "string" &&
      (value.startsWith("Item.") || value.includes(".Item."))
   )
}

function handleRightClickResize(args, state) {
   const now = performance.now()
   const point = eventPoint(args.event)
   const last = state.lastRightClick
   const doubleMs = getDoubleClickTimeMs()
   const isDouble =
      last &&
      now - last.time <= doubleMs &&
      pointDistance(point, last.point) <= DOUBLE_CLICK_DISTANCE_PX

   if (isDouble) {
      clearPendingShrink(state)
      state.lastRightClick = null
      resizePlacementShape(args, 1)
      return
   }

   clearPendingShrink(state)
   state.lastRightClick = { time: now, point }
   state.pendingShrink = setTimeout(() => {
      state.pendingShrink = null
      state.lastRightClick = null
      resizePlacementShape(args, -1)
   }, doubleMs + 20)
}

function clearPendingShrink(state) {
   if (!state?.pendingShrink) return
   clearTimeout(state.pendingShrink)
   state.pendingShrink = null
}

function getDoubleClickTimeMs() {
   return (
      globalThis.foundry.canvas.interaction.MouseInteractionManager
         ?.DOUBLE_CLICK_TIME_MS ??
      globalThis.foundry?.canvas?.interaction?.MouseInteractionManager
         ?.DOUBLE_CLICK_TIME_MS ??
      DOUBLE_CLICK_FALLBACK_MS
   )
}

function eventPoint(event) {
   const source = event?.nativeEvent ?? event
   return {
      x: Number(source?.clientX ?? source?.global?.x ?? 0),
      y: Number(source?.clientY ?? source?.global?.y ?? 0),
   }
}

function pointDistance(a, b) {
   return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))
}

function getResizeStepPixels() {
   let squares = 1
   try {
      squares = Number(
         game.settings.get(MODULE_ID, "templateResizeStepSquares"),
      )
   } catch (_e) {}
   if (!Number.isFinite(squares) || squares <= 0) squares = 1
   const gridSize =
      Number(
         canvas.scene?.grid?.size ??
            canvas.grid?.size ??
            canvas.dimensions?.size ??
            100,
      ) || 100
   return squares * gridSize
}

function canResizeShape(shape) {
   return [
      "circle",
      "cone",
      "ellipse",
      "emanation",
      "line",
      "rectangle",
      "ring",
   ].includes(shape?.type)
}

function resizePlacementShape(args, direction) {
   const shape = args?.shape
   const document = args?.document
   if (!shape || !document || !canResizeShape(shape)) return false

   const step = getResizeStepPixels()
   const delta = direction * step
   const update = resizedShapeUpdate(shape, delta, step)
   if (!update) return false

   shape.updateSource(update)
   const shapes = Array.from(document.shapes)
   const index = Number.isInteger(shape._index)
      ? shape._index
      : Math.max(0, shapes.length - 1)
   shapes[index] = shape
   document.updateSource({ shapes })
   document.updateShapeConstraints?.()
   document.object?.renderFlags?.set?.({ refreshShapes: true })
   return true
}

function resizedShapeUpdate(shape, delta, step) {
   switch (shape.type) {
      case "circle":
      case "cone":
      case "emanation":
         return { radius: nextSize(shape.radius, delta, step) }
      case "ellipse":
         return {
            radiusX: nextSize(shape.radiusX ?? shape.radius, delta, step),
            radiusY: nextSize(shape.radiusY ?? shape.radius, delta, step),
         }
      case "line":
         return { length: nextSize(shape.length, delta, step) }
      case "rectangle":
         return {
            width: nextSize(shape.width, delta, step),
            height: nextSize(shape.height, delta, step),
         }
      case "ring": {
         const outerWidth = Math.max(1, Number(shape.outerWidth ?? 0) || 1)
         return {
            radius: nextSize(
               shape.radius,
               delta,
               Math.max(step, outerWidth / 2),
            ),
         }
      }
      default:
         return null
   }
}

function nextSize(value, delta, minimum) {
   const current = Number(value ?? 0)
   const floor = Math.max(1, Number(minimum) || 1)
   return Math.max(floor, (Number.isFinite(current) ? current : floor) + delta)
}
