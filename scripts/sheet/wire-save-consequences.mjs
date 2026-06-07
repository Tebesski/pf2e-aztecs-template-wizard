import { confirmDelete } from "../compendium/templates-compendium.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   defaultSaveConsequence,
   refreshSaveConsequenceList,
} from "./renderers.mjs"

export function wireSaveConsequenceControls($tab, item) {
   const updateSaveConsequence = async (wrap, idx, mutator) => {
      const li = wrap.closest(".atw-behavior")
      if (!li) return null
      const beId = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === beId)
      if (!entry) return null
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      while (arr.length <= idx) arr.push(defaultSaveConsequence())
      arr[idx] = { ...arr[idx] }
      mutator(arr[idx])
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      return { entry, arr }
   }

   $tab.on(
      "click",
      ".atw-save-consequence-list[data-atw-sprop] [data-action='add-save-consequence']",
      async (ev) => {
         ev.preventDefault()
         const wrap = ev.currentTarget.closest(
            ".atw-save-consequence-list[data-atw-sprop]",
         )
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
         arr.push(defaultSaveConsequence())
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshSaveConsequenceList(wrap, item)
      },
   )

   $tab.on(
      "click",
      ".atw-save-consequence-list[data-atw-sprop] [data-action='remove-save-consequence']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-save-consequence-row")
         const wrap = ev.currentTarget.closest(
            ".atw-save-consequence-list[data-atw-sprop]",
         )
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
         const cons = arr[idx]
         const desc = `${cons?.outcome ?? "outcome"} → ${cons?.type ?? "consequence"}`
         if (!(await confirmDelete(desc))) return
         arr.splice(idx, 1)
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshSaveConsequenceList(wrap, item)
      },
   )

   $tab.on(
      "change",
      ".atw-save-consequence-list[data-atw-sprop] .atw-save-consequence-outcome",
      async (ev) => {
         const sel = ev.currentTarget
         const row = sel.closest(".atw-save-consequence-row")
         const wrap = sel.closest(".atw-save-consequence-list[data-atw-sprop]")
         if (!row || !wrap) return
         const idx = Number(row.dataset.index)
         await updateSaveConsequence(wrap, idx, (c) => {
            c.outcome = sel.value
         })
      },
   )

   $tab.on(
      "change",
      ".atw-save-consequence-list[data-atw-sprop] > .atw-save-consequence-row > .atw-consequence-head > .atw-consequence-type",
      async (ev) => {
         const sel = ev.currentTarget
         const row = sel.closest(".atw-save-consequence-row")
         const wrap = sel.closest(".atw-save-consequence-list[data-atw-sprop]")
         if (!row || !wrap) return
         const idx = Number(row.dataset.index)
         await updateSaveConsequence(wrap, idx, (c) => {
            c.type = sel.value

            switch (sel.value) {
               case "damage":
                  if (!Array.isArray(c.damages) || c.damages.length === 0) {
                     c.damages = [
                        {
                           diceCount: 1,
                           dieSize: "d6",
                           damageType: "fire",
                           category: "normal",
                        },
                     ]
                  }
                  break
               case "heal":
                  if (c.amount == null) c.amount = "5"
                  if (!["untyped", "vitality", "void"].includes(c.healingType)) {
                     c.healingType = "untyped"
                  }
                  break
               case "move":
                  if (!["toward", "away"].includes(c.direction)) c.direction = "away"
                  if (c.distance == null) c.distance = 5
                  break
               case "applyCondition":
               case "removeCondition":
                  if (!c.condition || typeof c.condition !== "object")
                     c.condition = { slug: "frightened", value: 1 }
                  break
               case "applyRuleElement":
                  if (!Array.isArray(c.rules)) c.rules = []
                  break
               case "scrollingText":
                  if (!c.color) c.color = "#ffffff"
                  break
               case "addIRW":
                  if (!c.irwType) c.irwType = "resistance"
                  if (!c.damageType) c.damageType = "fire"
                  if (c.value == null) c.value = 5
                  break
            }
         })
         refreshSaveConsequenceList(wrap, item)
      },
   )
}
