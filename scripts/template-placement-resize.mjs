import { MODULE_ID } from "./data.mjs"
import { executeAsGM } from "./runtime/index.mjs"
import { spellCastHeighteningForItemUuid } from "./heightening.mjs"
import { readAutomation } from "./sheet/automation-storage.mjs"

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
      data = attachSpellCastHeightening(data)
      if (!shouldPatchPlacement(data)) {
         return original.call(this, data, options)
      }

      const state = {
         lastRightClick: null,
         pendingShrink: null,
         range: await placementRangeStateFor(data),
      }
      const userPreSkip = options.preSkip
      const userPreConfirm = options.preConfirm
      const wrappedOptions = {
         ...options,
         preConfirm: (args) => {
            ACTIVE_RESIZE_ARGS = args ?? ACTIVE_RESIZE_ARGS
            updatePlacementRangeState(args, state.range)
            if (isPlacementOutOfRange(state.range)) {
               warnOutOfRange(state.range)
               return false
            }
            return userPreConfirm?.(args)
         },
         preSkip: (args) => {
            ACTIVE_RESIZE_ARGS = args ?? ACTIVE_RESIZE_ARGS
            if (args?.event?.button !== 2) {
               updatePlacementRangeState(args, state.range)
               if (isPlacementOutOfRange(state.range)) {
                  warnOutOfRange(state.range)
                  return false
               }
               if (state.range?.outOfRange) {
                  restorePlacementPreviewColor(args.document, state.range)
               }
               return userPreSkip?.(args)
            }
            if (!isRightClickResizeEnabled()) return userPreSkip?.(args)
            const allowed = userPreSkip?.(args)
            if (allowed === false) return false
            handleRightClickResize(args, state)
            updatePlacementRangeState(args, state.range)
            return false
         },
      }
      let onMoveHandler = wrapPlacementMove(options.onMove, state.range)
      Object.defineProperty(wrappedOptions, "onMove", {
         configurable: true,
         enumerable: true,
         get: () => onMoveHandler,
         set: (fn) => {
            onMoveHandler = wrapPlacementMove(fn, state.range)
         },
      })

      const removeWheelRotationFallback = installPlacementWheelRotationFallback()
      try {
         const result = await original.call(this, data, wrappedOptions)
         delegatePlacedTemplateAutomation(data, result)
         return result
      } finally {
         removeWheelRotationFallback()
         ACTIVE_RESIZE_ARGS = null
         clearPendingShrink(state)
         restorePlacementPreviewColor(state.range?.document, state.range)
         destroyPlacementRangeOverlay(state.range)
      }
   }
}

function attachSpellCastHeightening(data) {
   const itemUuid = extractPlacementItemUuid(data)
   const info = spellCastHeighteningForItemUuid(itemUuid)
   if (!info) return data
   const next = foundry.utils.deepClone(data ?? {})
   next.flags ??= {}
   next.flags[MODULE_ID] ??= {}
   next.flags[MODULE_ID].spellCastHeightening = foundry.utils.deepClone(info)
   return next
}

function wrapPlacementMove(fn, rangeState = null) {
   return (args) => {
      ACTIVE_RESIZE_ARGS = args ?? ACTIVE_RESIZE_ARGS
      const result = fn?.(args)
      updatePlacementRangeState(args, rangeState)
      return result
   }
}

function resizeActiveTemplatePlacement(direction) {
   if (!ACTIVE_RESIZE_ARGS) return false
   return resizePlacementShape(ACTIVE_RESIZE_ARGS, direction)
}

function installPlacementWheelRotationFallback() {
   const handler = (event) => {
      if (!ACTIVE_RESIZE_ARGS || (!event.shiftKey && !event.ctrlKey)) return
      if (
         !rotatePlacementShape(
            ACTIVE_RESIZE_ARGS,
            event.deltaY >= 0 ? 1 : -1,
            event.ctrlKey ? 15 : 5,
         )
      )
         return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
   }
   window.addEventListener("wheel", handler, { capture: true, passive: false })
   return () => window.removeEventListener("wheel", handler, { capture: true })
}

function isRightClickResizeEnabled() {
   try {
      return game.settings.get(MODULE_ID, "enableTemplateResizeRmb") !== false
   } catch (_e) {
      return true
   }
}

function shouldRestrictPlacementRange() {
   try {
      return game.settings.get(MODULE_ID, "restrictTemplatePlacementRange") !== false
   } catch (_e) {
      return true
   }
}

function shouldDrawPlacementRangeLine() {
   try {
      return game.settings.get(MODULE_ID, "drawTemplatePlacementRangeLine") !== false
   } catch (_e) {
      return true
   }
}

function isPlacementOutOfRange(state) {
   return !!(state?.outOfRange && shouldRestrictPlacementRange())
}

function placementRangeLineColor() {
   try {
      return String(game.settings.get(MODULE_ID, "templatePlacementRangeLineColor") || "#ffcc33")
   } catch (_e) {
      return "#ffcc33"
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
         undefined
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

async function placementRangeStateFor(data) {
   const config =
      normalizePlacementRange(data?.flags?.[MODULE_ID]?.placementRange) ??
      (await placementRangeFromOrigin(data))
   if (!config) return null
   const placer = await placerPointForPlacement(data)
   if (!placer) return null
   return {
      maxFeet: config.max,
      placer,
      currentFeet: 0,
      outOfRange: false,
      originalColor: null,
      overlay: null,
      graphics: null,
      text: null,
      lastWarn: 0,
   }
}

async function placementRangeFromOrigin(data) {
   const itemUuid = extractPlacementItemUuid(data)
   if (!itemUuid) return null
   const item = await fromUuid(itemUuid).catch(() => null)
   if (!item?.getFlag) return null
   return normalizePlacementRange(readAutomation(item)?.placementRange)
}

function normalizePlacementRange(value) {
   if (!value || typeof value !== "object" || !value.enabled) return null
   const max = Number(value.max)
   if (!Number.isFinite(max) || max <= 0) return null
   return { max }
}

async function placerPointForPlacement(data) {
   const itemUuid = extractPlacementItemUuid(data)
   const item = itemUuid ? await fromUuid(itemUuid).catch(() => null) : null
   const actor = item?.actor ?? null
   const controlled = canvas?.tokens?.controlled ?? []
   const token =
      (actor
         ? controlled.find((tokenPlaceable) => tokenPlaceable.document?.actor?.id === actor.id)
         : controlled[0]) ??
      (actor
         ? canvas?.tokens?.placeables?.find((tokenPlaceable) => tokenPlaceable.document?.actor?.id === actor.id)
         : controlled[0])
   return tokenDocumentCenter(token?.document)
}

function tokenDocumentCenter(token) {
   if (!token) return null
   const gridSize = sceneGridSize()
   return {
      x: Number(token.x ?? 0) + Math.max(1, Number(token.width ?? 1)) * gridSize / 2,
      y: Number(token.y ?? 0) + Math.max(1, Number(token.height ?? 1)) * gridSize / 2,
   }
}

function updatePlacementRangeState(args, state) {
   if (!state || !args?.shape) return
   const target = placementTargetPoint(args.shape)
   if (!target) return
   const feet = pixelsToFeet(Math.hypot(target.x - state.placer.x, target.y - state.placer.y))
   state.currentFeet = feet
   state.outOfRange = feet > state.maxFeet
   tintPlacementPreview(args.document, state)
   updatePlacementRangeOverlay(state, target)
}

function placementTargetPoint(shape) {
   const type = shape?.type
   const x = Number(shape?.x ?? 0)
   const y = Number(shape?.y ?? 0)
   if (!Number.isFinite(x) || !Number.isFinite(y)) return null
   if (type === "cone" || type === "line") return { x, y }
   if (type === "rectangle") {
      return {
         x: x + (Number(shape.width ?? 0) || 0) / 2,
         y: y + (Number(shape.height ?? 0) || 0) / 2,
      }
   }
   return { x, y }
}

function tintPlacementPreview(document, state) {
   if (!document) return
   state.document = document
   if (state.originalColor === null) {
      state.originalColor = document.color ?? document._source?.color ?? "#a728cc"
   }
   document.updateSource?.({
      color: state.outOfRange ? "#ff3030" : state.originalColor,
   })
   document.object?.renderFlags?.set?.({
      refresh: true,
      refreshState: true,
      refreshShapes: true,
   })
}

function restorePlacementPreviewColor(document, state) {
   if (!document || !state || state.originalColor === null) return
   document.updateSource?.({ color: state.originalColor })
   document.object?.renderFlags?.set?.({
      refresh: true,
      refreshState: true,
      refreshShapes: true,
   })
}

function updatePlacementRangeOverlay(state, target) {
   if (!shouldDrawPlacementRangeLine()) {
      destroyPlacementRangeOverlay(state)
      return
   }
   ensurePlacementRangeOverlay(state)
   if (!state.graphics || !state.text) return
   const color = state.outOfRange ? "#ff3030" : placementRangeLineColor()
   const colorNumber = colorStringToNumber(color)
   state.graphics.clear()
   drawDashedLine(state.graphics, state.placer, target, colorNumber)
   const mid = {
      x: (state.placer.x + target.x) / 2,
      y: (state.placer.y + target.y) / 2,
   }
   state.text.text = `${formatCurrentFeet(state.currentFeet)} ft. / ${formatFeet(state.maxFeet)} ft.`
   state.text.style.fill = colorNumber
   state.text.x = mid.x + 8
   state.text.y = mid.y - 18
}

function ensurePlacementRangeOverlay(state) {
   if (state.overlay || !globalThis.PIXI) return
   const overlay = new PIXI.Container()
   const graphics = new PIXI.Graphics()
   const text = new PIXI.Text("", {
      fill: colorStringToNumber(placementRangeLineColor()),
      fontSize: 18,
      fontFamily: "Signika, sans-serif",
      stroke: 0x000000,
      strokeThickness: 4,
   })
   overlay.addChild(graphics)
   overlay.addChild(text)
   ;(canvas?.interface ?? canvas?.controls ?? canvas?.stage)?.addChild?.(overlay)
   state.overlay = overlay
   state.graphics = graphics
   state.text = text
}

function destroyPlacementRangeOverlay(state) {
   if (!state?.overlay) return
   state.overlay.destroy({ children: true })
   state.overlay = null
   state.graphics = null
   state.text = null
}

function drawDashedLine(graphics, start, end, color) {
   const dash = 18
   const gap = 10
   const dx = end.x - start.x
   const dy = end.y - start.y
   const length = Math.hypot(dx, dy)
   if (length <= 0) return
   graphics.lineStyle(3, color, 0.95)
   for (let at = 0; at < length; at += dash + gap) {
      const from = at / length
      const to = Math.min(length, at + dash) / length
      graphics.moveTo(start.x + dx * from, start.y + dy * from)
      graphics.lineTo(start.x + dx * to, start.y + dy * to)
   }
}

function colorStringToNumber(color) {
   const normalized = String(color ?? "#ffcc33").trim().replace(/^#/, "")
   const parsed = Number.parseInt(normalized.length === 3
      ? normalized.split("").map((char) => char + char).join("")
      : normalized,
   16)
   return Number.isFinite(parsed) ? parsed : 0xffcc33
}

function formatFeet(value) {
   const rounded = Math.round(Number(value ?? 0) * 10) / 10
   return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function formatCurrentFeet(value) {
   const feet = Number(value ?? 0)
   if (!Number.isFinite(feet)) return "0"
   const increment = Math.max(1, sceneGridDistance())
   return String(Math.floor(feet / increment) * increment)
}

function pixelsToFeet(pixels) {
   return Number(pixels ?? 0) * sceneGridDistance() / sceneGridSize()
}

function sceneGridSize() {
   return Number(canvas?.scene?.grid?.size ?? canvas?.grid?.size ?? canvas?.dimensions?.size) || 100
}

function sceneGridDistance() {
   return Number(canvas?.scene?.grid?.distance ?? canvas?.grid?.distance ?? canvas?.dimensions?.distance) || 5
}

function warnOutOfRange(state) {
   const now = Date.now()
   if (now - Number(state.lastWarn ?? 0) < 1000) return
   state.lastWarn = now
   ui.notifications?.warn(
      `Template is out of range (${formatCurrentFeet(state.currentFeet)} ft. / ${formatFeet(state.maxFeet)} ft.).`,
   )
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

function rotatePlacementShape(args, direction, stepDegrees) {
   const shape = args?.shape
   const document = args?.document
   if (!shape || !document || !canRotateShape(shape)) return false
   const current = Number(shape.rotation ?? 0)
   const step = Number(stepDegrees) || 15
   const next = normalizeDegrees(
      (Number.isFinite(current) ? current : 0) + direction * step,
   )
   shape.updateSource({ rotation: next })
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

function canRotateShape(shape) {
   return ["cone", "ellipse", "line", "rectangle"].includes(shape?.type)
}

function normalizeDegrees(value) {
   const degrees = Number(value) || 0
   return ((degrees % 360) + 360) % 360
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
