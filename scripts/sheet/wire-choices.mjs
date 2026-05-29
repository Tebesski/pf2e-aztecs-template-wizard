import { confirmDelete } from "../compendium/templates-compendium.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   defaultChoice,
   refreshChoiceList,
} from "./renderers.mjs"

export function wireChoiceControls($tab, item) {
   const updateChoice = async (wrap, idx, mutator) => {
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
      while (arr.length <= idx) arr.push(defaultChoice())
      const c = { ...arr[idx] }
      mutator(c)
      arr[idx] = c
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
   }

   $tab.on(
      "click",
      ".atw-choice-list [data-action='add-choice']",
      async (ev) => {
         ev.preventDefault()
         const wrap = ev.currentTarget.closest(".atw-choice-list")
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
         arr.push(defaultChoice())
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshChoiceList(wrap, item)
      },
   )

   $tab.on(
      "click",
      ".atw-choice-list [data-action='remove-choice']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-choice-row")
         const wrap = ev.currentTarget.closest(".atw-choice-list")
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
         const c = arr[idx]
         const desc = `${c?.kind === "skill" ? (c?.skill === "lore" ? c?.lore : c?.skill) : c?.save} choice`
         if (!(await confirmDelete(desc))) return
         arr.splice(idx, 1)
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshChoiceList(wrap, item)
      },
   )

   $tab.on("change", ".atw-choice-list .atw-choice-kind", async (ev) => {
      const sel = ev.currentTarget
      const row = sel.closest(".atw-choice-row")
      const wrap = sel.closest(".atw-choice-list")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      await updateChoice(wrap, idx, (c) => {
         c.kind = sel.value
      })
      refreshChoiceList(wrap, item)
   })

   $tab.on("change", ".atw-choice-list .atw-choice-skill", async (ev) => {
      const sel = ev.currentTarget
      const row = sel.closest(".atw-choice-row")
      const wrap = sel.closest(".atw-choice-list")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      const prev = sel.dataset.previous ?? ""
      const becomesLore = sel.value === "lore"
      const wasLore = prev === "lore"
      await updateChoice(wrap, idx, (c) => {
         c.skill = sel.value
      })
      if (becomesLore !== wasLore) refreshChoiceList(wrap, item)
   })

   $tab.on("change", ".atw-choice-list .atw-choice-save", async (ev) => {
      const sel = ev.currentTarget
      const row = sel.closest(".atw-choice-row")
      const wrap = sel.closest(".atw-choice-list")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      await updateChoice(wrap, idx, (c) => {
         c.save = sel.value
      })
   })

   $tab.on("input change", ".atw-choice-list .atw-choice-lore", async (ev) => {
      const el = ev.currentTarget
      const row = el.closest(".atw-choice-row")
      const wrap = el.closest(".atw-choice-list")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      await updateChoice(wrap, idx, (c) => {
         c.lore = el.value
      })
   })

   $tab.on("input change", ".atw-choice-list .atw-choice-dc", async (ev) => {
      const el = ev.currentTarget
      const row = el.closest(".atw-choice-row")
      const wrap = el.closest(".atw-choice-list")
      if (!row || !wrap) return
      const idx = Number(row.dataset.index)
      await updateChoice(wrap, idx, (c) => {
         c.dc = el.value
      })
   })
}
