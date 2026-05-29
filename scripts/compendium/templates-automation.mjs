import { defaultAutomation } from "../data.mjs"

export function isTemplateAutomation(value) {
   return !!(
      value &&
      typeof value === "object" &&
      Array.isArray(value.behaviors)
   )
}

export function cloneAutomation(value) {
   return foundry.utils.deepClone(value)
}

export function cloneBehaviorWithFreshIds(entry) {
   const cloned = foundry.utils.deepClone(entry)
   if (cloned && typeof cloned === "object")
      cloned.id = foundry.utils.randomID()
   return cloned
}

export function cloneTemplateShapeWithFreshIds(templateShape) {
   const cloned = foundry.utils.deepClone(templateShape ?? { shapes: [] })
   if (Array.isArray(cloned.shapes)) {
      cloned.shapes = cloned.shapes.map((shape) => ({
         ...shape,
         id: foundry.utils.randomID(),
      }))
   }
   return cloned
}

export function mergeAutomationOntoItem(current, incoming) {
   const base = foundry.utils.mergeObject(defaultAutomation(), current ?? {}, {
      inplace: false,
      insertKeys: true,
      overwrite: true,
   })
   const add = foundry.utils.mergeObject(defaultAutomation(), incoming ?? {}, {
      inplace: false,
      insertKeys: true,
      overwrite: true,
   })

   base.enabled = !!(base.enabled || add.enabled)
   base.behaviors = [
      ...(Array.isArray(base.behaviors) ? base.behaviors : []),
      ...(Array.isArray(add.behaviors)
         ? add.behaviors.map(cloneBehaviorWithFreshIds)
         : []),
   ]

   const baseShapes = Array.isArray(base.templateShape?.shapes)
      ? foundry.utils.deepClone(base.templateShape.shapes)
      : []
   const addShapes = Array.isArray(add.templateShape?.shapes)
      ? cloneTemplateShapeWithFreshIds(add.templateShape).shapes
      : []
   base.templateShape = {
      ...(base.templateShape ?? {}),
      shapes: [...baseShapes, ...addShapes],
   }

   base.label = current?.label ?? base.label ?? ""
   return base
}
