import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import { refreshConditionPicker } from "./renderers.mjs"

export function wireConditionControls($tab, item) {
   $tab.on(
      "change",
      ".atw-condition-picker .atw-condition-slug",
      async (ev) => {
         const select = ev.currentTarget
         const wrap = select.closest(".atw-condition-picker")
         if (!wrap) return
         const li = wrap.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = wrap.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const prev = entry.system?.[fieldKey]
         const prevVal =
            prev && typeof prev === "object" ? Number(prev.value) || 1 : 1
         foundry.utils.setProperty(entry.system, fieldKey, {
            slug: select.value,
            value: prevVal,
         })
         await saveAutomation(item, a)
         refreshConditionPicker(wrap, item)
      },
   )

   $tab.on(
      "change",
      ".atw-condition-picker .atw-condition-value",
      async (ev) => {
         const input = ev.currentTarget
         const wrap = input.closest(".atw-condition-picker")
         if (!wrap) return
         const li = wrap.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = wrap.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const prev = entry.system?.[fieldKey]
         const slug =
            prev && typeof prev === "object"
               ? prev.slug
               : typeof prev === "string"
                 ? prev
                 : ""
         const value = Math.max(1, Number(input.value) || 1)
         foundry.utils.setProperty(entry.system, fieldKey, { slug, value })
         await saveAutomation(item, a)
      },
   )

   $tab.on("click", ".atw-condition-picker .atw-condition-icon", async (ev) => {
      ev.preventDefault()
      const uuid = ev.currentTarget.dataset.uuid
      if (!uuid) return
      const doc = await fromUuid(uuid).catch(() => null)
      if (doc?.sheet) doc.sheet.render(true)
   })
}
