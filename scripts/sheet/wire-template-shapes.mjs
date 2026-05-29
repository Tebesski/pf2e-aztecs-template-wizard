import {
   defaultTemplateShape,
   defaultShapeVariant,
} from "../data.mjs"
import { confirmDelete } from "../compendium/templates-compendium.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import { renderTemplateShapesInline } from "./renderers.mjs"

export function wireTemplateShapeControls($tab, item) {
   const refreshTemplateShapes = (a) => {
      const wrap = $tab.find(".atw-template-shapes").get(0)
      if (!wrap) return
      const replacement = document
         .createRange()
         .createContextualFragment(renderTemplateShapesInline(a))
      wrap.replaceWith(replacement)
   }

   $tab.on("click", "[data-action='add-template-shape']", async (ev) => {
      ev.preventDefault()
      const a = readAutomation(item)
      if (!a.templateShape || !Array.isArray(a.templateShape.shapes)) {
         a.templateShape = defaultTemplateShape()
      }
      a.templateShape.shapes.push(defaultShapeVariant())
      await saveAutomation(item, a)
      refreshTemplateShapes(a)
   })

   $tab.on("click", "[data-action='remove-template-shape']", async (ev) => {
      ev.preventDefault()
      const row = ev.currentTarget.closest(".atw-template-shape-row")
      if (!row) return
      const idx = Number(row.dataset.index)
      const a = readAutomation(item)
      if (!a.templateShape || !Array.isArray(a.templateShape.shapes)) return
      if (a.templateShape.shapes.length <= 1) return
      const variant = a.templateShape.shapes[idx]
      if (!(await confirmDelete(variant?.type ?? "shape variant"))) return
      a.templateShape.shapes.splice(idx, 1)
      await saveAutomation(item, a)
      refreshTemplateShapes(a)
   })

   $tab.on(
      "change",
      ".atw-template-shape-row .atw-template-shape-type",
      async (ev) => {
         const sel = ev.currentTarget
         const row = sel.closest(".atw-template-shape-row")
         if (!row) return
         const idx = Number(row.dataset.index)
         const a = readAutomation(item)
         if (!a.templateShape) a.templateShape = defaultTemplateShape()
         if (!Array.isArray(a.templateShape.shapes))
            a.templateShape.shapes = [defaultShapeVariant()]
         const v = a.templateShape.shapes[idx]
         if (!v) return
         v.type = sel.value
         await saveAutomation(item, a)
         refreshTemplateShapes(a)
      },
   )

   $tab.on(
      "change input",
      ".atw-template-shape-row .atw-template-shape-size, " +
         ".atw-template-shape-row .atw-template-shape-width, " +
         ".atw-template-shape-row .atw-template-shape-innerR",
      async (ev) => {
         const el = ev.currentTarget
         const row = el.closest(".atw-template-shape-row")
         if (!row) return
         const idx = Number(row.dataset.index)
         const a = readAutomation(item)
         if (!a.templateShape) a.templateShape = defaultTemplateShape()
         if (!Array.isArray(a.templateShape.shapes))
            a.templateShape.shapes = [defaultShapeVariant()]
         const v = a.templateShape.shapes[idx]
         if (!v) return
         const n = Math.max(1, Number(el.value) || 1)
         if (el.classList.contains("atw-template-shape-size")) v.size = n
         else if (el.classList.contains("atw-template-shape-width")) v.width = n
         else if (el.classList.contains("atw-template-shape-innerR"))
            v.innerRadius = n
         await saveAutomation(item, a)
      },
   )
}
