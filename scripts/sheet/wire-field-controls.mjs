import { BEHAVIOR_CATALOG } from "../data.mjs"
import { localize } from "../common/html.mjs"
import { confirmDelete } from "../compendium/templates-compendium.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   renderExtraRollOptions,
   refreshRuleElementList,
   updateRuleRowBadge,
} from "./renderers.mjs"

export function wireFieldControls($tab, item) {
   $tab.on("change input", ".atw-dice-formula input", async (ev) => {
      const input = ev.currentTarget
      const wrap = input.closest(".atw-dice-formula")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const cur =
         entry.system?.[fieldKey] && typeof entry.system[fieldKey] === "object"
            ? { ...entry.system[fieldKey] }
            : { diceCount: 1, dieSize: 20 }
      if (input.classList.contains("atw-dice-count")) {
         cur.diceCount = Math.max(1, Number(input.value) || 1)
      } else if (input.classList.contains("atw-dice-size")) {
         cur.dieSize = Math.max(2, Number(input.value) || 20)
      }
      foundry.utils.setProperty(entry.system, fieldKey, cur)
      await saveAutomation(item, a)
   })

   $tab.on(
      "change input",
      ".atw-duration input, .atw-duration select",
      async (ev) => {
         const input = ev.currentTarget
         const wrap = input.closest(".atw-duration")
         if (!wrap) return
         const li = wrap.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const fieldKey = wrap.dataset.atwSprop
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return
         const cur =
            entry.system?.[fieldKey] &&
            typeof entry.system[fieldKey] === "object"
               ? { ...entry.system[fieldKey] }
               : { enabled: false, amount: 1, unit: "rounds" }
         if (input.classList.contains("atw-duration-enabled")) {
            cur.enabled = input.checked

            const amountWrap = wrap.querySelector(".atw-duration-amount")
            if (amountWrap)
               amountWrap.classList.toggle("atw-disabled", !input.checked)
         } else if (input.classList.contains("atw-duration-value")) {
            cur.amount = Math.max(1, Number(input.value) || 1)
         } else if (input.classList.contains("atw-duration-unit")) {
            cur.unit = input.value
         }
         foundry.utils.setProperty(entry.system, fieldKey, cur)
         await saveAutomation(item, a)
      },
   )

   $tab.on("change input", ".atw-extra-roll-options input", async (ev) => {
      const input = ev.currentTarget
      const wrap = input.closest(".atw-extra-roll-options")
      if (!wrap) return
      const li = wrap.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      const cur =
         entry.system?.[fieldKey] && typeof entry.system[fieldKey] === "object"
            ? { ...entry.system[fieldKey] }
            : { enabled: false, value: "" }
      if (input.classList.contains("atw-extra-roll-options-enabled")) {
         cur.enabled = input.checked
      } else if (input.classList.contains("atw-extra-roll-options-input")) {
         cur.value = input.value
      }
      foundry.utils.setProperty(entry.system, fieldKey, cur)
      await saveAutomation(item, a)

      if (input.classList.contains("atw-extra-roll-options-enabled")) {
         const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
         const field = def?.fields.find((f) => f.key === fieldKey)
         if (field) {
            wrap.outerHTML = renderExtraRollOptions(field, cur)
         }
      }
   })

   $tab.on("click", ".atw-rule-list [data-action='add-rule']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-rule-list")
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
      arr.push('{\n  "key": ""\n}')
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      refreshRuleElementList(wrap, item)
   })

   $tab.on(
      "click",
      ".atw-rule-list [data-action='remove-rule']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-rule-row")
         const wrap = ev.currentTarget.closest(".atw-rule-list")
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
         if (!(await confirmDelete("rule element"))) return
         arr.splice(idx, 1)
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshRuleElementList(wrap, item)
      },
   )

   $tab.on("input", ".atw-rule-list .atw-rule-textarea", (ev) => {
      const ta = ev.currentTarget
      const row = ta.closest(".atw-rule-row")
      if (row) updateRuleRowBadge(row, ta.value)
   })
   $tab.on("change", ".atw-rule-list .atw-rule-textarea", async (ev) => {
      const ta = ev.currentTarget
      const row = ta.closest(".atw-rule-row")
      const wrap = ta.closest(".atw-rule-list")
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
      arr[idx] = ta.value
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
   })

   $tab.on(
      "click",
      ".atw-rule-list [data-action='format-rule']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-rule-row")
         const wrap = ev.currentTarget.closest(".atw-rule-list")
         if (!row || !wrap) return
         const ta = row.querySelector(".atw-rule-textarea")
         if (!ta) return
         try {
            const obj = JSON.parse(ta.value)
            ta.value = JSON.stringify(obj, null, 2)

            ta.dispatchEvent(new Event("change", { bubbles: true }))
            updateRuleRowBadge(row, ta.value)
         } catch (_e) {
            ui.notifications?.warn(localize("PF2EATW.RuleElement.InvalidJson"))
         }
      },
   )
}
