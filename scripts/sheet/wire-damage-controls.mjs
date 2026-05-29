import { getDamageTypeVisual } from "../data.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   damageRowHtml,
   refreshDamageList,
} from "./renderers.mjs"

export function wireDamageControls($tab, item) {
   $tab.on(
      "change input",
      ".atw-damage-list .atw-damage-row input, .atw-damage-list .atw-damage-row select",
      async (ev) => {
         const el = ev.currentTarget
         const row = el.closest(".atw-damage-row")
         const wrap = el.closest(".atw-damage-list")
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
         while (arr.length <= idx) arr.push({})
         const cur = { ...arr[idx] }
         if (el.classList.contains("atw-damage-count"))
            cur.diceCount = Math.max(0, Number(el.value) || 0)
         else if (el.classList.contains("atw-damage-die"))
            cur.dieSize = el.value
         else if (el.classList.contains("atw-damage-type"))
            cur.damageType = el.value
         else if (el.classList.contains("atw-damage-category"))
            cur.category = el.value
         else if (el.classList.contains("atw-damage-extra-toggle-input")) {
            cur.extraRollOptionsEnabled = el.checked
         } else if (el.classList.contains("atw-damage-extra"))
            cur.extraRollOptions = el.value
         arr[idx] = cur
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)

         if (el.classList.contains("atw-damage-type")) {
            const iconEl = row.querySelector(".atw-damage-icon")
            if (iconEl) {
               const visual = getDamageTypeVisual(cur.damageType)
               iconEl.className = `fa-solid ${visual.icon} atw-damage-icon`
               iconEl.style.color = visual.color
            }
         }

         if (el.classList.contains("atw-damage-extra-toggle-input")) {
            row.outerHTML = damageRowHtml(cur, idx)
         }
      },
   )

   $tab.on(
      "click",
      ".atw-damage-list [data-action='add-damage']",
      async (ev) => {
         ev.preventDefault()
         const wrap = ev.currentTarget.closest(".atw-damage-list")
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
         arr.push({
            diceCount: 1,
            dieSize: "d6",
            damageType: "fire",
            category: "normal",
         })
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshDamageList(wrap, item)
      },
   )

   $tab.on(
      "click",
      ".atw-damage-list [data-action='remove-damage']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-damage-row")
         const wrap = ev.currentTarget.closest(".atw-damage-list")
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
         refreshDamageList(wrap, item)
      },
   )
}
