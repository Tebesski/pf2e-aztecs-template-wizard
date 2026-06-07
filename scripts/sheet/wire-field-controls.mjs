import { localize } from "../common/html.mjs"
import { confirmDelete } from "../compendium/templates-compendium.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   defaultRestrictionEntry,
   normalizeRestrictionEntry,
   refreshRestrictionList,
   refreshTagPicker,
   refreshRuleElementList,
   updateRuleRowBadge,
} from "./renderers.mjs"
import { sanitizeRestrictTriggers } from "./restrict-trigger-controls.mjs"

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
         const restrictTriggerChanged = sanitizeRestrictTriggers(entry)
         await saveAutomation(item, a)
         if (restrictTriggerChanged || entry.type === "restrictActions") {
            const picker = li.querySelector(
               '.atw-tag-picker[data-atw-sprop="triggers"]',
            )
            if (picker) refreshTagPicker(picker, item)
         }
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
            : { enabled: true, value: "" }
      cur.enabled = true
      if (input.classList.contains("atw-extra-roll-options-input")) {
         cur.value = input.value
      }
      foundry.utils.setProperty(entry.system, fieldKey, cur)
      await saveAutomation(item, a)
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

   $tab.on("click", ".atw-restriction-list [data-action='add-restriction']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-restriction-list")
      const entryState = restrictionEntryState(item, wrap)
      if (!entryState) return
      const arr = Array.isArray(entryState.entry.system?.[entryState.fieldKey])
         ? entryState.entry.system[entryState.fieldKey].map(normalizeRestrictionEntry)
         : []
      arr.push(defaultRestrictionEntry())
      foundry.utils.setProperty(entryState.entry.system, entryState.fieldKey, arr)
      await saveAutomation(item, entryState.automation)
      refreshRestrictionList(wrap, item)
   })

   $tab.on("click", ".atw-restriction-list [data-action='remove-restriction']", async (ev) => {
      ev.preventDefault()
      const wrap = ev.currentTarget.closest(".atw-restriction-list")
      const row = ev.currentTarget.closest(".atw-restriction-row")
      const entryState = restrictionEntryState(item, wrap)
      if (!entryState || !row) return
      const index = Number(row.dataset.index)
      const arr = Array.isArray(entryState.entry.system?.[entryState.fieldKey])
         ? entryState.entry.system[entryState.fieldKey].map(normalizeRestrictionEntry)
         : []
      arr.splice(index, 1)
      foundry.utils.setProperty(entryState.entry.system, entryState.fieldKey, arr.length ? arr : [defaultRestrictionEntry()])
      await saveAutomation(item, entryState.automation)
      refreshRestrictionList(wrap, item)
   })

   $tab.on(
      "change input",
      ".atw-restriction-list .atw-restriction-kind, .atw-restriction-list .atw-restriction-slug, .atw-restriction-list .atw-restriction-roll-options, .atw-restriction-list .atw-restriction-skill-select, .atw-restriction-list .atw-restriction-lore",
      async (ev) => {
         const wrap = ev.currentTarget.closest(".atw-restriction-list")
         const entryState = restrictionEntryState(item, wrap)
         if (!entryState) return
         const rows = readRestrictionRows(wrap)
         foundry.utils.setProperty(entryState.entry.system, entryState.fieldKey, rows)
         await saveAutomation(item, entryState.automation)
         if (
            ev.currentTarget.classList.contains("atw-restriction-kind") ||
            ev.currentTarget.classList.contains("atw-restriction-skill-select")
         ) {
            refreshRestrictionList(wrap, item)
         }
      },
   )
}

function restrictionEntryState(item, wrap) {
   if (!wrap) return null
   const li = wrap.closest(".atw-behavior")
   if (!li) return null
   const id = li.dataset.id
   const fieldKey = wrap.dataset.atwSprop
   const automation = readAutomation(item)
   const entry = automation.behaviors.find((behavior) => behavior.id === id)
   if (!entry || !fieldKey) return null
   return { automation, entry, fieldKey }
}

function readRestrictionRows(wrap) {
   return Array.from(wrap.querySelectorAll(":scope > .atw-restriction-row")).map((row) =>
      normalizeRestrictionEntry({
         kind: row.querySelector(".atw-restriction-kind")?.value ?? "spell",
         slug: row.querySelector(".atw-restriction-slug")?.value ?? "",
         rollOptions: row.querySelector(".atw-restriction-roll-options")?.value ?? "",
         skill: row.querySelector(".atw-restriction-skill-select")?.value ?? "athletics",
         lore: row.querySelector(".atw-restriction-lore")?.value ?? "",
      }),
   )
}
