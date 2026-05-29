import {
   MODULE_ID,
   defaultTileAttachment,
   normalizeTileAttachments,
} from "../data.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   openSceneObjectEditor,
   openTileEditor,
} from "./scene-object-editor.mjs"
import {
   refreshLightEditor,
   refreshSoundEditor,
   refreshTileEditor,
   refreshTileList,
} from "./renderers.mjs"

export function wireMediaControls($tab, item) {
   $tab.on("click", ".atw-tile-list [data-action='add-tile']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-tile-list")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const rows = normalizeTileAttachments(entry.system?.[fieldKey])
      if (rows.length === 0) rows.push(defaultTileAttachment())
      rows.push(defaultTileAttachment())
      foundry.utils.setProperty(entry.system, fieldKey, rows)
      await saveAutomation(item, a)
      refreshTileList(wrap, item)
   })

   $tab.on(
      "click",
      ".atw-tile-list [data-action='remove-tile']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-tile-row")
         const wrap = ev.currentTarget.closest(".atw-tile-list")
         if (!row || !wrap) return
         const idx = Number(row.dataset.index)
         const li = wrap.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = wrap.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const rows = normalizeTileAttachments(entry.system?.[fieldKey])
         rows.splice(idx, 1)
         foundry.utils.setProperty(entry.system, fieldKey, rows)
         await saveAutomation(item, a)
         refreshTileList(wrap, item)
      },
   )

   $tab.on("change", ".atw-tile-list .atw-tile-shape-select", async (ev) => {
      const select = ev.currentTarget
      const row = select.closest(".atw-tile-row")
      const wrap = select.closest(".atw-tile-list")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const rows = normalizeTileAttachments(entry.system?.[fieldKey])
      while (rows.length <= idx) rows.push(defaultTileAttachment())
      rows[idx] = { ...rows[idx], shape: select.value || "all" }
      foundry.utils.setProperty(entry.system, fieldKey, rows)
      await saveAutomation(item, a)
   })

   $tab.on("click", "[data-action='open-tile-editor']", async (ev) => {
      ev.preventDefault()
      const tileRow = ev.currentTarget.closest(".atw-tile-row")
      const tileList = ev.currentTarget.closest(".atw-tile-list")
      if (tileRow && tileList) {
         const li = tileList.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = tileList.dataset.atwSprop
         const index = Number(tileRow.dataset.index)
         await openTileEditor(item, id, fieldKey, { index })
         const freshWrap = $tab[0].querySelector(
            `.atw-behavior[data-id="${CSS.escape(id)}"] .atw-tile-list[data-atw-sprop="${CSS.escape(fieldKey)}"]`,
         )
         if (freshWrap) refreshTileList(freshWrap, item)
         return
      }

      const wrap = ev.currentTarget.closest(".atw-tile-editor")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      await openTileEditor(item, id, fieldKey)

      const freshWrap = $tab[0].querySelector(
         `.atw-behavior[data-id="${CSS.escape(id)}"] .atw-tile-editor[data-atw-sprop="${CSS.escape(fieldKey)}"]`,
      )
      if (freshWrap) refreshTileEditor(freshWrap, item)
   })

   $tab.on("click", "[data-action='open-sound-editor']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-sound-editor")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      await openSceneObjectEditor("sound", item, id, fieldKey)
      const freshWrap = $tab[0].querySelector(
         `.atw-behavior[data-id="${CSS.escape(id)}"] .atw-sound-editor[data-atw-sprop="${CSS.escape(fieldKey)}"]`,
      )
      if (freshWrap) refreshSoundEditor(freshWrap, item)
   })

   $tab.on("click", "[data-action='open-light-editor']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-light-editor")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      await openSceneObjectEditor("light", item, id, fieldKey)
      const freshWrap = $tab[0].querySelector(
         `.atw-behavior[data-id="${CSS.escape(id)}"] .atw-light-editor[data-atw-sprop="${CSS.escape(fieldKey)}"]`,
      )
      if (freshWrap) refreshLightEditor(freshWrap, item)
   })

   $tab.on("change", ".atw-file-picker .atw-file-picker-input", async (ev) => {
      const input = ev.currentTarget
      const wrap = input.closest(".atw-file-picker")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      foundry.utils.setProperty(entry.system, fieldKey, input.value)
      await saveAutomation(item, a)
   })

   $tab.on("click", "[data-action='open-file-picker']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-file-picker")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const fpType = wrap.dataset.fpType ?? "any"
      const input = wrap.querySelector(".atw-file-picker-input")
      const current = input?.value ?? ""

      const FP =
         foundry.applications?.apps?.FilePicker?.implementation ??
         foundry.applications?.apps?.FilePicker ??
         globalThis.FilePicker
      if (!FP) {
         ui.notifications?.warn(
            "FilePicker is not available in this Foundry build.",
         )
         return
      }
      try {
         const fp = new FP({
            type: fpType,
            current,
            callback: async (path) => {
               if (input) input.value = path
               const a = readAutomation(item)
               const entry = a.behaviors.find((b) => b.id === id)
               if (!entry) return
               foundry.utils.setProperty(entry.system, fieldKey, path)
               await saveAutomation(item, a)
            },
         })
         fp.render(true)
      } catch (e) {
         console.error(`[${MODULE_ID}] FilePicker failed to open`, e)
      }
   })
}
