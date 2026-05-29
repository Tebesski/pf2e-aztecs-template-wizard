import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   refreshIrwTagList,
   refreshTagPicker,
   refreshTagInput,
   refreshUuidList,
   resolveUuidIntoRow,
} from "./renderers.mjs"

export function wireUuidAndTagControls($tab, item) {
   $tab.on("change", ".atw-uuid-input", async (ev) => {
      const input = ev.currentTarget
      const row = input.closest(".atw-uuid-row")
      const wrap = input.closest(".atw-uuid-list-wrap")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      while (arr.length <= idx) arr.push("")
      arr[idx] = input.value
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)

      resolveUuidIntoRow(input.value.trim(), row)
   })

   $tab[0].addEventListener(
      "drop",
      async (ev) => {
         const input = ev.target.closest?.(".atw-uuid-input")
         if (!input) return
         let data
         try {
            data = JSON.parse(ev.dataTransfer.getData("text/plain"))
         } catch {
            return
         }
         if (data?.type !== "Item" || !data.uuid) return
         ev.preventDefault()
         input.value = data.uuid
         input.dispatchEvent(new Event("change", { bubbles: true }))
      },
      false,
   )

   const getFoundryDropData = (ev) => {
      const editor =
         globalThis.CONFIG?.ux?.TextEditor ??
         globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
         globalThis.foundry?.applications?.ux?.TextEditor ??
         globalThis.TextEditor
      try {
         if (editor?.getDragEventData) return editor.getDragEventData(ev)
      } catch (_e) {}
      const raw = ev.dataTransfer?.getData("text/plain") ?? ""
      if (!raw) return null
      try {
         return JSON.parse(raw)
      } catch (_e) {
         return null
      }
   }

   const droppedDocumentLink = async (data) => {
      if (!data || (data.type !== "Item" && data.documentName !== "Item"))
         return null
      const uuid = data.uuid ?? (data.id ? `Item.${data.id}` : "")
      if (!uuid) return null
      let label = data.name ?? ""
      if (!label) {
         try {
            label = (await fromUuid(uuid))?.name ?? ""
         } catch (_e) {}
      }
      label = String(label || uuid.split(".").at(-1) || "Item").replace(
         /[{}]/g,
         "",
      )
      return `@UUID[${uuid}]{${label}}`
   }

   $tab[0].addEventListener(
      "dragover",
      (ev) => {
         const textarea = ev.target.closest?.(
            "textarea.atw-consequence-chat-text",
         )
         if (!textarea) return
         ev.preventDefault()
      },
      false,
   )

   $tab[0].addEventListener(
      "drop",
      async (ev) => {
         const textarea = ev.target.closest?.(
            "textarea.atw-consequence-chat-text",
         )
         if (!textarea) return
         const data = getFoundryDropData(ev)
         const link = await droppedDocumentLink(data)
         if (!link) return
         ev.preventDefault()
         const start = textarea.selectionStart ?? textarea.value.length
         const end = textarea.selectionEnd ?? start
         textarea.setRangeText(link, start, end, "end")
         textarea.dispatchEvent(new Event("input", { bubbles: true }))
         textarea.dispatchEvent(new Event("change", { bubbles: true }))
      },
      false,
   )

   $tab.on("click", "[data-action='add-uuid']", async (ev) => {
      const wrap = ev.currentTarget.closest(".atw-uuid-list-wrap")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      arr.push("")
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      refreshUuidList(wrap, item)
   })

   $tab.on("click", "[data-action='remove-uuid']", async (ev) => {
      const row = ev.currentTarget.closest(".atw-uuid-row")
      const wrap = ev.currentTarget.closest(".atw-uuid-list-wrap")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      arr.splice(idx, 1)
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      refreshUuidList(wrap, item)
   })

   $tab.on("change", ".atw-uuid-input-wrap .atw-uuid-input", async (ev) => {
      const input = ev.currentTarget
      const wrap = input.closest(".atw-uuid-input-wrap")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const value = input.value.trim()
      foundry.utils.setProperty(entry.system, fieldKey, value)
      await saveAutomation(item, a)

      resolveUuidIntoRow(value, wrap)
   })

   const addTagInputTag = async (wrap, rawValue) => {
      const value = (rawValue ?? "").trim()
      if (!value) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      if (!arr.includes(value)) arr.push(value)
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      refreshTagInput(wrap, item)
   }

   $tab.on("keydown", ".atw-tag-input .atw-tag-input-field", (ev) => {
      if (ev.key !== "Enter") return
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-tag-input")
      if (!wrap) return
      addTagInputTag(wrap, ev.currentTarget.value)
   })

   $tab.on("click", ".atw-tag-input [data-action='add-taginput']", (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-tag-input")
      if (!wrap) return
      const fld = wrap.querySelector(".atw-tag-input-field")
      addTagInputTag(wrap, fld?.value)
   })

   $tab.on(
      "click",
      ".atw-tag-input [data-action='remove-taginput-tag']",
      async (ev) => {
         ev.preventDefault()
         const tag = ev.currentTarget.closest(".atw-tag")
         const wrap = ev.currentTarget.closest(".atw-tag-input")
         if (!tag || !wrap) return
         const value = tag.dataset.value
         const li = wrap.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = wrap.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const arr = Array.isArray(entry.system?.[fieldKey])
            ? entry.system[fieldKey].filter((x) => x !== value)
            : []
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshTagInput(wrap, item)
      },
   )

   $tab.on("change", ".atw-tag-picker .atw-tag-select", async (ev) => {
      const select = ev.currentTarget
      const value = select.value
      if (!value) return
      const picker = select.closest(".atw-tag-picker")
      const li = picker.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = picker.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey]
         : []
      if (!arr.includes(value)) arr.push(value)
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      refreshTagPicker(picker, item)
   })

   $tab.on(
      "click",
      ".atw-tag-picker [data-action='remove-tag']",
      async (ev) => {
         ev.preventDefault()
         const tag = ev.currentTarget.closest(".atw-tag")
         const picker = ev.currentTarget.closest(".atw-tag-picker")
         if (!tag || !picker) return
         const removeValue = tag.dataset.value
         const li = picker.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = picker.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const arr = Array.isArray(entry.system?.[fieldKey])
            ? entry.system[fieldKey].filter((x) => x !== removeValue)
            : []
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshTagPicker(picker, item)
      },
   )

   $tab.on("change", ".atw-irw-tag-list .atw-irw-tag-select", async (ev) => {
      const sel = ev.currentTarget
      const type = sel.value
      if (!type) return
      const wrap = sel.closest(".atw-irw-tag-list")
      if (!wrap) return
      const valInp = wrap.querySelector(".atw-irw-tag-input-value")
      const value = Math.max(1, Number(valInp?.value) || 5)
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      arr.push({ type, value })
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)

      sel.value = ""
      refreshIrwTagList(wrap, item)
   })

   $tab.on(
      "click",
      ".atw-irw-tag-list [data-action='remove-irw-tag']",
      async (ev) => {
         ev.preventDefault()
         const tag = ev.currentTarget.closest(".atw-irw-tag")
         const wrap = ev.currentTarget.closest(".atw-irw-tag-list")
         if (!tag || !wrap) return
         const idx = Number(tag.dataset.index)
         const li = wrap.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = wrap.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const arr = Array.isArray(entry.system?.[fieldKey])
            ? entry.system[fieldKey].slice()
            : []
         arr.splice(idx, 1)
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshIrwTagList(wrap, item)
      },
   )
}
