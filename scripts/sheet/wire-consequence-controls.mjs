import { getDamageTypeVisual } from "../data.mjs"
import { confirmDelete } from "../compendium/templates-compendium.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   bootstrapUuidResolutions,
   computeExpressionPreview,
   defaultConsequence,
   defaultSaveConsequence,
   refreshConsequenceList,
   refreshSaveConsequenceList,
   seedConsequenceDefaults,
   updateRuleRowBadge,
} from "./renderers.mjs"

export function wireConsequenceControls($tab, item) {
   const updateConsequence = async (wrap, idx, mutator) => {
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
      while (arr.length <= idx) arr.push(defaultConsequence())
      arr[idx] = { ...arr[idx] }
      mutator(arr[idx])
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      return { entry, arr }
   }

   const refreshOuterListForRow = (el) => {
      const wrap = el.closest(
         ".atw-consequence-list[data-atw-sprop], .atw-save-consequence-list[data-atw-sprop]",
      )
      if (!wrap) return
      if (wrap.classList.contains("atw-save-consequence-list")) {
         refreshSaveConsequenceList(wrap, item)
      } else {
         refreshConsequenceList(wrap, item)
      }
   }

   const updateInnerConsequence = async (el, mutator) => {
      const innerRow = el.closest(
         ".atw-consequence-row, .atw-save-consequence-row",
      )
      if (!innerRow) return null

      const wrap = el.closest(
         ".atw-consequence-list[data-atw-sprop], .atw-save-consequence-list[data-atw-sprop]",
      )
      if (!wrap) return null
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

      const directList = innerRow.parentElement?.closest(
         ".atw-consequence-list, .atw-save-consequence-list",
      )
      if (directList && !directList.hasAttribute("data-atw-sprop")) {
         const parentRow = directList.closest(
            ".atw-consequence-row, .atw-save-consequence-row",
         )
         if (!parentRow) return null
         const parentIdx = Number(parentRow.dataset.index)
         const nestedIdx = Number(innerRow.dataset.index)
         while (arr.length <= parentIdx) arr.push({})
         arr[parentIdx] = { ...arr[parentIdx] }
         if (!Array.isArray(arr[parentIdx].consequences))
            arr[parentIdx].consequences = []
         arr[parentIdx].consequences = arr[parentIdx].consequences.slice()
         while (arr[parentIdx].consequences.length <= nestedIdx) {
            arr[parentIdx].consequences.push({})
         }
         arr[parentIdx].consequences[nestedIdx] = {
            ...arr[parentIdx].consequences[nestedIdx],
         }
         mutator(arr[parentIdx].consequences[nestedIdx])
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         return { entry, arr }
      }

      const idx = Number(innerRow.dataset.index)
      while (arr.length <= idx) arr.push({})
      arr[idx] = { ...arr[idx] }
      mutator(arr[idx])
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      return { entry, arr }
   }

   const updateNestedSaveConsequenceList = async (el, mutator) => {
      const nestedList = el.closest(".atw-nested-save-list")
      if (!nestedList) return null
      const parentRow = nestedList.closest(
         ".atw-consequence-row, .atw-save-consequence-row",
      )
      const wrap = el.closest(
         ".atw-consequence-list[data-atw-sprop], .atw-save-consequence-list[data-atw-sprop]",
      )
      if (!parentRow || !wrap) return null
      const li = wrap.closest(".atw-behavior")
      if (!li) return null
      const beId = li.dataset.id
      const fieldKey = wrap.dataset.atwSprop
      const parentIdx = Number(parentRow.dataset.index)
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === beId)
      if (!entry) return null
      const arr = Array.isArray(entry.system?.[fieldKey])
         ? entry.system[fieldKey].slice()
         : []
      while (arr.length <= parentIdx) arr.push({})
      arr[parentIdx] = { ...arr[parentIdx] }
      const list = Array.isArray(arr[parentIdx].consequences)
         ? arr[parentIdx].consequences.slice()
         : []
      mutator(list, arr[parentIdx])
      arr[parentIdx].consequences = list
      foundry.utils.setProperty(entry.system, fieldKey, arr)
      await saveAutomation(item, a)
      return { entry, arr }
   }

   $tab.on(
      "click",
      ".atw-consequence-list[data-atw-sprop] > [data-action='add-consequence']",
      async (ev) => {
         ev.preventDefault()
         const wrap = ev.currentTarget.closest(
            ".atw-consequence-list[data-atw-sprop]",
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
         arr.push(defaultConsequence())
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshConsequenceList(wrap, item)
      },
   )

   $tab.on(
      "click",
      ".atw-consequence-list[data-atw-sprop] > .atw-consequence-row > .atw-consequence-head > [data-action='remove-consequence']",
      async (ev) => {
         ev.preventDefault()
         const row = ev.currentTarget.closest(".atw-consequence-row")
         const wrap = ev.currentTarget.closest(
            ".atw-consequence-list[data-atw-sprop]",
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
         const consType = arr[idx]?.type ?? "consequence"
         if (!(await confirmDelete(consType + " consequence"))) return
         arr.splice(idx, 1)
         foundry.utils.setProperty(entry.system, fieldKey, arr)
         await saveAutomation(item, a)
         refreshConsequenceList(wrap, item)
      },
   )

   $tab.on(
      "change input",
      ".atw-consequence-list[data-atw-sprop] > .atw-consequence-row > .atw-consequence-head > .atw-consequence-min, " +
         ".atw-consequence-list[data-atw-sprop] > .atw-consequence-row > .atw-consequence-head > .atw-consequence-max",
      async (ev) => {
         const el = ev.currentTarget
         const row = el.closest(".atw-consequence-row")
         const wrap = el.closest(".atw-consequence-list[data-atw-sprop]")
         if (!row || !wrap) return
         const idx = Number(row.dataset.index)
         await updateConsequence(wrap, idx, (c) => {
            if (el.classList.contains("atw-consequence-min"))
               c.min = Math.max(0, Number(el.value) || 0)
            else c.max = Math.max(0, Number(el.value) || 0)
         })
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-list[data-atw-sprop] > .atw-consequence-row > .atw-consequence-head > .atw-consequence-type",
      async (ev) => {
         const sel = ev.currentTarget
         const row = sel.closest(".atw-consequence-row")
         const wrap = sel.closest(".atw-consequence-list[data-atw-sprop]")
         if (!row || !wrap) return
         const idx = Number(row.dataset.index)
         await updateConsequence(wrap, idx, (c) => {
            c.type = sel.value
            seedConsequenceDefaults(c, sel.value)
         })
         refreshConsequenceList(wrap, item)
      },
   )

   $tab.on(
      "change input",
      ".atw-consequence-damages .atw-damage-row input, .atw-consequence-damages .atw-damage-row select",
      async (ev) => {
         const el = ev.currentTarget
         const dRow = el.closest(".atw-damage-row")
         if (!dRow) return
         const dIdx = Number(dRow.dataset.index)
         await updateInnerConsequence(el, (c) => {
            const damages = Array.isArray(c.damages) ? c.damages.slice() : []
            while (damages.length <= dIdx) damages.push({})
            const d = { ...damages[dIdx] }
            if (el.classList.contains("atw-damage-count"))
               d.diceCount = Math.max(0, Number(el.value) || 0)
            else if (el.classList.contains("atw-damage-die"))
               d.dieSize = el.value
            else if (el.classList.contains("atw-damage-type"))
               d.damageType = el.value
            else if (el.classList.contains("atw-damage-category"))
               d.category = el.value
            damages[dIdx] = d
            c.damages = damages
         })
         if (el.classList.contains("atw-damage-type")) {
            const iconEl = dRow.querySelector(".atw-damage-icon")
            if (iconEl) {
               const visual = getDamageTypeVisual(el.value)
               iconEl.className = `fa-solid ${visual.icon} atw-damage-icon`
               iconEl.style.color = visual.color
            }
         }
      },
   )

   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-heal-amount, .atw-save-consequence-row .atw-consequence-heal-amount, .atw-consequence-row .atw-consequence-heal-type, .atw-save-consequence-row .atw-consequence-heal-type",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.amount =
               el.closest(".atw-consequence-heal")?.querySelector(".atw-consequence-heal-amount")?.value ?? "5"
            c.healingType =
               el.closest(".atw-consequence-heal")?.querySelector(".atw-consequence-heal-type")?.value ?? "untyped"
         })
      },
   )

   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-move-direction, .atw-save-consequence-row .atw-consequence-move-direction, .atw-consequence-row .atw-consequence-move-distance, .atw-save-consequence-row .atw-consequence-move-distance",
      async (ev) => {
         const el = ev.currentTarget
         const wrap = el.closest(".atw-consequence-move")
         await updateInnerConsequence(el, (c) => {
            c.direction = wrap?.querySelector(".atw-consequence-move-direction")?.value ?? "away"
            c.distance = Math.max(
               0,
               Number(wrap?.querySelector(".atw-consequence-move-distance")?.value) || 0,
            )
         })
      },
   )

   $tab.on(
      "click",
      ".atw-consequence-damages [data-action='add-damage']",
      async (ev) => {
         ev.preventDefault()
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            const damages = Array.isArray(c.damages) ? c.damages.slice() : []
            damages.push({
               diceCount: 1,
               dieSize: "d6",
               damageType: "fire",
               category: "normal",
            })
            c.damages = damages
         })
         refreshOuterListForRow(el)
      },
   )
   $tab.on(
      "click",
      ".atw-consequence-damages [data-action='remove-damage']",
      async (ev) => {
         ev.preventDefault()
         const el = ev.currentTarget
         const dRow = el.closest(".atw-damage-row")
         if (!dRow) return
         const dIdx = Number(dRow.dataset.index)
         await updateInnerConsequence(el, (c) => {
            const damages = Array.isArray(c.damages) ? c.damages.slice() : []
            damages.splice(dIdx, 1)
            c.damages = damages
         })
         refreshOuterListForRow(el)
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-uuid, .atw-save-consequence-row .atw-consequence-uuid",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.uuid = el.value.trim()
         })
         refreshOuterListForRow(el)
         setTimeout(() => bootstrapUuidResolutions(item), 0)
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-condslug, .atw-save-consequence-row .atw-consequence-condslug",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            const prev =
               c.condition && typeof c.condition === "object"
                  ? c.condition
                  : { slug: "", value: 1 }
            c.condition = { slug: el.value, value: prev.value ?? 1 }
         })
         refreshOuterListForRow(el)
      },
   )
   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-condvalue, .atw-save-consequence-row .atw-consequence-condvalue",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            const prev =
               c.condition && typeof c.condition === "object"
                  ? c.condition
                  : { slug: "frightened", value: 1 }
            c.condition = {
               slug: prev.slug,
               value: Math.max(1, Number(el.value) || 1),
            }
         })
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-condslug-only, .atw-save-consequence-row .atw-consequence-condslug-only",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.slug = el.value
         })
      },
   )

   $tab.on(
      "click",
      ".atw-consequence-row [data-action='add-cons-rule'], .atw-save-consequence-row [data-action='add-cons-rule']",
      async (ev) => {
         ev.preventDefault()
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            const rules = Array.isArray(c.rules) ? c.rules.slice() : []
            rules.push('{\n  "key": ""\n}')
            c.rules = rules
         })
         refreshOuterListForRow(el)
      },
   )
   $tab.on(
      "click",
      ".atw-consequence-row [data-action='remove-cons-rule'], .atw-save-consequence-row [data-action='remove-cons-rule']",
      async (ev) => {
         ev.preventDefault()
         const el = ev.currentTarget
         const rRow = el.closest(".atw-cons-rule-row")
         if (!rRow) return
         const rIdx = Number(rRow.dataset.index)
         await updateInnerConsequence(el, (c) => {
            const rules = Array.isArray(c.rules) ? c.rules.slice() : []
            rules.splice(rIdx, 1)
            c.rules = rules
         })
         refreshOuterListForRow(el)
      },
   )
   $tab.on(
      "input",
      ".atw-consequence-row .atw-cons-rule-textarea, .atw-save-consequence-row .atw-cons-rule-textarea",
      (ev) => {
         const ta = ev.currentTarget
         const row = ta.closest(".atw-cons-rule-row")
         if (row) updateRuleRowBadge(row, ta.value)
      },
   )
   $tab.on(
      "change",
      ".atw-consequence-row .atw-cons-rule-textarea, .atw-save-consequence-row .atw-cons-rule-textarea",
      async (ev) => {
         const ta = ev.currentTarget
         const rRow = ta.closest(".atw-cons-rule-row")
         if (!rRow) return
         const rIdx = Number(rRow.dataset.index)
         await updateInnerConsequence(ta, (c) => {
            const rules = Array.isArray(c.rules) ? c.rules.slice() : []
            while (rules.length <= rIdx) rules.push("")
            rules[rIdx] = ta.value
            c.rules = rules
         })
      },
   )

   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-text, .atw-consequence-row .atw-consequence-color, .atw-save-consequence-row .atw-consequence-text, .atw-save-consequence-row .atw-consequence-color",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            if (el.classList.contains("atw-consequence-color"))
               c.color = el.value
            else c.text = el.value
         })
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-privateToGm, .atw-save-consequence-row .atw-consequence-privateToGm",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.privateToGm = el.checked
            if (el.checked) c.blindToGm = false
         })
         if (el.checked) {
            const blindEl = el
               .closest(".atw-consequence-chat")
               ?.querySelector(".atw-consequence-blindToGm")
            if (blindEl) blindEl.checked = false
         }
      },
   )
   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-blindToGm, .atw-save-consequence-row .atw-consequence-blindToGm",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.blindToGm = el.checked
            if (el.checked) c.privateToGm = false
         })
         if (el.checked) {
            const privateEl = el
               .closest(".atw-consequence-chat")
               ?.querySelector(".atw-consequence-privateToGm")
            if (privateEl) privateEl.checked = false
         }
      },
   )

   $tab.on("click", ".atw-condition-icon-img", async (ev) => {
      const img = ev.currentTarget
      const slug = img.dataset.conditionSlug
      if (!slug) return
      try {
         const cond = game.pf2e?.ConditionManager?.conditions?.get?.(slug)
         if (cond?.sheet?.render) cond.sheet.render(true)
      } catch (_e) {}
   })

   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-duration-enabled, " +
         ".atw-consequence-row .atw-consequence-duration-amount, " +
         ".atw-consequence-row .atw-consequence-duration-unit, " +
         ".atw-save-consequence-row .atw-consequence-duration-enabled, " +
         ".atw-save-consequence-row .atw-consequence-duration-amount, " +
         ".atw-save-consequence-row .atw-consequence-duration-unit",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            const cur =
               c.duration && typeof c.duration === "object"
                  ? { ...c.duration }
                  : { enabled: false, amount: 1, unit: "rounds" }
            if (el.classList.contains("atw-consequence-duration-enabled")) {
               cur.enabled = el.checked
            } else if (
               el.classList.contains("atw-consequence-duration-amount")
            ) {
               cur.amount = Math.max(1, Number(el.value) || 1)
            } else if (el.classList.contains("atw-consequence-duration-unit")) {
               cur.unit = el.value
            }
            c.duration = cur
         })

         if (el.classList.contains("atw-consequence-duration-enabled")) {
            const wrap = el.closest(".atw-consequence-duration")
            const amountWrap = wrap?.querySelector(".atw-duration-amount")
            if (amountWrap)
               amountWrap.classList.toggle("atw-disabled", !el.checked)
         }
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-irwType, .atw-save-consequence-row .atw-consequence-irwType",
      async (ev) => {
         const sel = ev.currentTarget
         await updateInnerConsequence(sel, (c) => {
            c.irwType = sel.value
         })

         refreshOuterListForRow(sel)
      },
   )
   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-irwDtype, .atw-save-consequence-row .atw-consequence-irwDtype",
      async (ev) => {
         const sel = ev.currentTarget
         await updateInnerConsequence(sel, (c) => {
            c.damageType = sel.value
         })
      },
   )
   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-irwValue, .atw-save-consequence-row .atw-consequence-irwValue",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.value = Math.max(1, Number(el.value) || 1)
         })
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-saveType",
      async (ev) => {
         const sel = ev.currentTarget
         await updateInnerConsequence(sel, (c) => {
            c.save = sel.value
         })
      },
   )
   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-saveDC",
      async (ev) => {
         const el = ev.currentTarget
         const preview = computeExpressionPreview(el.value, item)
         const out = el.parentElement?.querySelector(".atw-expression-preview")
         if (out) {
            out.textContent = preview
            out.toggleAttribute("hidden", preview === "")
         }
         await updateInnerConsequence(el, (c) => {
            c.dc = el.value
         })
      },
   )

   $tab.on(
      "change",
      ".atw-consequence-row .atw-consequence-skillType",
      async (ev) => {
         const sel = ev.currentTarget
         await updateInnerConsequence(sel, (c) => {
            c.skill = sel.value
            if (sel.value !== "lore") c.lore = ""
         })
         refreshOuterListForRow(sel)
      },
   )
   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-skillLore",
      async (ev) => {
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            c.lore = el.value
         })
      },
   )
   $tab.on(
      "change input",
      ".atw-consequence-row .atw-consequence-skillDC",
      async (ev) => {
         const el = ev.currentTarget
         const preview = computeExpressionPreview(el.value, item)
         const out = el.parentElement?.querySelector(".atw-expression-preview")
         if (out) {
            out.textContent = preview
            out.toggleAttribute("hidden", preview === "")
         }
         await updateInnerConsequence(el, (c) => {
            c.dc = el.value
         })
      },
   )

   $tab.on(
      "click",
      ".atw-consequence-row [data-action='add-nested-save-consequence']",
      async (ev) => {
         ev.preventDefault()
         const el = ev.currentTarget
         await updateInnerConsequence(el, (c) => {
            const list = Array.isArray(c.consequences)
               ? c.consequences.slice()
               : []
            list.push(defaultSaveConsequence())
            c.consequences = list
         })
         refreshOuterListForRow(el)
      },
   )

   $tab.on(
      "change",
      ".atw-nested-save-list > .atw-save-consequence-row > .atw-consequence-head > .atw-save-consequence-outcome",
      async (ev) => {
         const sel = ev.currentTarget
         await updateInnerConsequence(sel, (c) => {
            c.outcome = sel.value
         })
      },
   )

   $tab.on(
      "change",
      ".atw-nested-save-list > .atw-save-consequence-row > .atw-consequence-head > .atw-consequence-type",
      async (ev) => {
         const sel = ev.currentTarget
         await updateInnerConsequence(sel, (c) => {
            c.type = sel.value
            seedConsequenceDefaults(c, sel.value)
         })
         refreshOuterListForRow(sel)
      },
   )

   $tab.on(
      "click",
      ".atw-nested-save-list > .atw-save-consequence-row > .atw-consequence-head > [data-action='remove-save-consequence']",
      async (ev) => {
         ev.preventDefault()
         const el = ev.currentTarget
         const row = el.closest(".atw-save-consequence-row")
         if (!row) return
         const idx = Number(row.dataset.index)
         const desc =
            row.querySelector(".atw-consequence-type")?.value ?? "consequence"
         if (!(await confirmDelete(desc))) return
         await updateNestedSaveConsequenceList(el, (list) => {
            list.splice(idx, 1)
         })
         refreshOuterListForRow(el)
      },
   )
}
