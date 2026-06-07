import {
   coerceHeightenActionsForMode,
   defaultHeightenAction,
   defaultHeightenRule,
   normalizeHeightenRules,
} from "../heightening.mjs"
import {
   BEHAVIOR_CATALOG,
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
   resolveUuidIntoRow,
   updateRuleRowBadge,
} from "./renderers.mjs"

export function wireHeighteningControls($tab, $html, item, sheet, refreshPanel) {
   $tab.on("click", "[data-action='toggle-behavior-fields']", async (ev) => {
      ev.preventDefault()
      const li = ev.currentTarget.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const block = ev.currentTarget.closest(".atw-behavior-fields")
      const willCollapse = !block.classList.contains("atw-accordion-collapsed")
      block.classList.toggle("atw-accordion-collapsed", willCollapse)
      const icon = ev.currentTarget.querySelector("i")
      if (icon) {
         icon.classList.toggle("fa-chevron-up", !willCollapse)
         icon.classList.toggle("fa-chevron-down", willCollapse)
      }
      const automation = readAutomation(item)
      const entry = automation.behaviors.find((behavior) => behavior.id === id)
      if (!entry) return
      entry.fieldsCollapsed = willCollapse
      await saveAutomation(item, automation)
   })

   $tab.on("click", "[data-action='toggle-expiration-heighten']", (ev) => {
      ev.preventDefault()
      const block = ev.currentTarget.closest(".atw-expiration-heighten")
      if (!block) return
      const willCollapse = !block.classList.contains("atw-accordion-collapsed")
      block.classList.toggle("atw-accordion-collapsed", willCollapse)
      const icon = ev.currentTarget.querySelector("i")
      if (icon) {
         icon.classList.toggle("fa-chevron-up", !willCollapse)
         icon.classList.toggle("fa-chevron-down", willCollapse)
      }
   })

   $tab.on("click", "[data-action='add-expiration-heighten-rule']", async (ev) => {
      ev.preventDefault()
      const automation = readAutomation(item)
      automation.expiration ??= { enabled: true, amount: 1, unit: "minutes" }
      automation.expiration.heighten = normalizeHeightenRules(automation.expiration)
      const rule = defaultHeightenRule()
      rule.actions = [defaultHeightenAction("setExpiration")]
      rule.collapsed = false
      automation.expiration.heighten.push(rule)
      await saveAutomation(item, automation)
      refreshPanelKeepingScroll($html, item, sheet, refreshPanel, ev.currentTarget, () =>
         expandExpirationHeighten($html),
      )
   })

   $tab.on("click", "[data-action='remove-expiration-heighten-rule']", async (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const ruleState = findExpirationRule(item, ev.currentTarget)
      if (!ruleState) return
      ruleState.rules.splice(ruleState.ruleIndex, 1)
      await saveAutomation(item, ruleState.automation)
      refreshPanelKeepingScroll($html, item, sheet, refreshPanel, ev.currentTarget)
   })

   $tab.on("click", "[data-action='toggle-expiration-heighten-rule']", async (ev) => {
      if (ev.target.closest("[data-action='remove-expiration-heighten-rule']")) return
      ev.preventDefault()
      const ruleState = findExpirationRule(item, ev.currentTarget)
      if (!ruleState) return
      const willCollapse = !ruleState.ruleEl.classList.contains("atw-accordion-collapsed")
      ruleState.ruleEl.classList.toggle("atw-accordion-collapsed", willCollapse)
      const icon = ev.currentTarget.querySelector("i")
      if (icon) {
         icon.classList.toggle("fa-chevron-up", !willCollapse)
         icon.classList.toggle("fa-chevron-down", willCollapse)
      }
      ruleState.rule.collapsed = willCollapse
      await saveAutomation(item, ruleState.automation)
   })

   $tab.on(
      "change input",
      ".atw-expiration-heighten-mode, .atw-expiration-heighten-value, .atw-expiration-heighten-source, " +
         ".atw-expiration-heighten-amount, .atw-expiration-heighten-unit",
      async (ev) => {
         const ruleState = findExpirationRule(item, ev.currentTarget)
         if (!ruleState) return
         readExpirationHeightenRule(ruleState.ruleEl, ruleState.rule)
         await saveAutomation(item, ruleState.automation)
         if (
            ev.currentTarget.classList.contains("atw-expiration-heighten-mode") ||
            ev.currentTarget.classList.contains("atw-expiration-heighten-unit")
         ) {
            refreshPanelKeepingScroll($html, item, sheet, refreshPanel, ev.currentTarget, () =>
               expandExpirationHeighten($html),
            )
         }
      },
   )

   $tab.on("click", "[data-action='add-heighten-rule']", async (ev) => {
      ev.preventDefault()
      const li = ev.currentTarget.closest(".atw-behavior")
      const entryState = findEntry(item, li)
      if (!entryState) return
      entryState.entry.heighten = normalizeHeightenRules(entryState.entry)
      entryState.entry.heighten.push(defaultHeightenRule())
      await saveAutomation(item, entryState.automation)
      refreshPanelKeepingScroll($html, item, sheet, refreshPanel, ev.currentTarget)
   })

   $tab.on("click", "[data-action='remove-heighten-rule']", async (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const ruleEl = ev.currentTarget.closest(".atw-heighten-rule")
      const li = ev.currentTarget.closest(".atw-behavior")
      const entryState = findEntry(item, li)
      if (!entryState || !ruleEl) return
      const index = Number(ruleEl.dataset.heightenIndex)
      entryState.entry.heighten = normalizeHeightenRules(entryState.entry)
      entryState.entry.heighten.splice(index, 1)
      await saveAutomation(item, entryState.automation)
      refreshPanelKeepingScroll($html, item, sheet, refreshPanel, ev.currentTarget)
   })

   $tab.on("click", "[data-action='toggle-heighten-rule']", async (ev) => {
      if (ev.target.closest("[data-action='remove-heighten-rule']")) return
      ev.preventDefault()
      const ruleEl = ev.currentTarget.closest(".atw-heighten-rule")
      const li = ev.currentTarget.closest(".atw-behavior")
      const entryState = findEntry(item, li)
      if (!entryState || !ruleEl) return
      const index = Number(ruleEl.dataset.heightenIndex)
      const willCollapse = !ruleEl.classList.contains("atw-accordion-collapsed")
      ruleEl.classList.toggle("atw-accordion-collapsed", willCollapse)
      const icon = ev.currentTarget.querySelector("i")
      if (icon) {
         icon.classList.toggle("fa-chevron-up", !willCollapse)
         icon.classList.toggle("fa-chevron-down", willCollapse)
      }
      entryState.entry.heighten = normalizeHeightenRules(entryState.entry)
      if (entryState.entry.heighten[index]) {
         entryState.entry.heighten[index].collapsed = willCollapse
         await saveAutomation(item, entryState.automation)
      }
   })

   $tab.on(
      "change input",
      ".atw-heighten-mode, .atw-heighten-value, .atw-heighten-source",
      async (ev) => {
         const ruleState = findRule(item, ev.currentTarget)
         if (!ruleState) return
         const { rule, ruleEl, automation } = ruleState
         rule.mode = ruleEl.querySelector(".atw-heighten-mode")?.value ?? "every"
         rule.value = Math.max(
            1,
            Number(ruleEl.querySelector(".atw-heighten-value")?.value) || 1,
         )
         rule.source =
            ruleEl.querySelector(".atw-heighten-source")?.value === "placer"
               ? "placer"
               : "item"
         if (ev.currentTarget.classList.contains("atw-heighten-mode")) {
            rule.actions = coerceHeightenActionsForMode(
               ruleState.entry,
               rule.actions,
               rule.mode,
            )
         }
         await saveAutomation(item, automation)
         if (ev.currentTarget.classList.contains("atw-heighten-mode")) {
            refreshPanel($html, item, sheet)
         }
      },
   )

   $tab.on("click", "[data-action='add-heighten-action']", async (ev) => {
      ev.preventDefault()
      const ruleState = findRule(item, ev.currentTarget)
      if (!ruleState) return
      const type =
         ruleState.ruleEl.querySelector(".atw-heighten-action-picker")?.value ??
         "increaseTemplateSize"
      ruleState.rule.actions ??= []
      ruleState.rule.actions.push(defaultHeightenAction(type, ruleState.entry))
      ruleState.rule.collapsed = false
      await saveAutomation(item, ruleState.automation)
      refreshPanel($html, item, sheet)
   })

   $tab.on("click", "[data-action='remove-heighten-action']", async (ev) => {
      ev.preventDefault()
      const actionState = findAction(item, ev.currentTarget)
      if (!actionState) return
      actionState.rule.actions.splice(actionState.actionIndex, 1)
      actionState.rule.collapsed = false
      await saveAutomation(item, actionState.automation)
      refreshPanel($html, item, sheet)
   })

   $tab.on("change", ".atw-heighten-action-type", async (ev) => {
      const actionState = findAction(item, ev.currentTarget)
      if (!actionState) return
      const next = defaultHeightenAction(ev.currentTarget.value, actionState.entry)
      next.id = actionState.action.id
      actionState.rule.actions[actionState.actionIndex] = next
      actionState.rule.collapsed = false
      await saveAutomation(item, actionState.automation)
      refreshPanel($html, item, sheet)
   })

   $tab.on(
      "change input",
         ".atw-heighten-action-field, .atw-heighten-action-amount, .atw-heighten-action-value, " +
         ".atw-heighten-damage-count, .atw-heighten-damage-die, .atw-heighten-damage-category, .atw-heighten-damage-type, .atw-heighten-damage-index, " +
         ".atw-heighten-shape-index, .atw-heighten-shape-type, .atw-heighten-shape-size, .atw-heighten-shape-width, .atw-heighten-shape-inner, " +
         ".atw-heighten-iwr-type, .atw-heighten-duration-amount, .atw-heighten-duration-unit, " +
         ".atw-heighten-saving-save, .atw-heighten-saving-dc, .atw-heighten-basic-damage-list .atw-damage-count, .atw-heighten-basic-damage-list .atw-damage-die, .atw-heighten-basic-damage-list .atw-damage-type, .atw-heighten-basic-damage-list .atw-damage-category, .atw-heighten-basic-damage-list .atw-damage-extra, " +
         ".atw-heighten-condition-slug, .atw-heighten-condition-value, .atw-heighten-dice-count, .atw-heighten-dice-size, " +
         ".atw-heighten-extra-roll-option, .atw-heighten-tag-value, " +
         ".atw-heighten-movement-preset, .atw-heighten-movement-custom, .atw-heighten-tile-index, .atw-heighten-tile-editor .atw-tile-shape-select, " +
         ".atw-heighten-field-editor .atw-file-picker-input, .atw-heighten-field-editor .atw-uuid-input, .atw-heighten-rule-index, .atw-heighten-rule-element-editor .atw-rule-textarea, " +
         ".atw-heighten-choice-index, .atw-heighten-consequence-index, " +
         ".atw-heighten-choice-editor .atw-choice-kind, .atw-heighten-choice-editor .atw-choice-save, .atw-heighten-choice-editor .atw-choice-skill, .atw-heighten-choice-editor .atw-choice-lore, .atw-heighten-choice-editor .atw-choice-dc, " +
         ".atw-heighten-consequence-editor .atw-consequence-min, .atw-heighten-consequence-editor .atw-consequence-max, .atw-heighten-consequence-editor .atw-consequence-type, .atw-heighten-consequence-editor .atw-save-consequence-outcome, " +
         ".atw-heighten-consequence-editor .atw-damage-count, .atw-heighten-consequence-editor .atw-damage-die, .atw-heighten-consequence-editor .atw-damage-type, .atw-heighten-consequence-editor .atw-damage-category, .atw-heighten-consequence-editor .atw-damage-extra, " +
         ".atw-heighten-consequence-editor .atw-consequence-heal-amount, .atw-heighten-consequence-editor .atw-consequence-heal-type, .atw-heighten-consequence-editor .atw-consequence-move-direction, .atw-heighten-consequence-editor .atw-consequence-move-distance, " +
         ".atw-heighten-consequence-editor .atw-consequence-uuid, .atw-heighten-consequence-editor .atw-consequence-condslug, .atw-heighten-consequence-editor .atw-consequence-condvalue, .atw-heighten-consequence-editor .atw-cons-rule-textarea, " +
         ".atw-heighten-consequence-editor .atw-consequence-text, .atw-heighten-consequence-editor .atw-consequence-color, .atw-heighten-consequence-editor .atw-consequence-privateToGm, .atw-heighten-consequence-editor .atw-consequence-blindToGm, " +
         ".atw-heighten-consequence-editor .atw-consequence-duration-enabled, .atw-heighten-consequence-editor .atw-consequence-duration-amount, .atw-heighten-consequence-editor .atw-consequence-duration-unit, " +
         ".atw-heighten-consequence-editor .atw-consequence-saveType, .atw-heighten-consequence-editor .atw-consequence-saveDC, .atw-heighten-consequence-editor .atw-consequence-skillType, .atw-heighten-consequence-editor .atw-consequence-skillLore, .atw-heighten-consequence-editor .atw-consequence-skillDC, " +
         ".atw-heighten-restriction-index, .atw-heighten-restriction-editor .atw-restriction-kind, .atw-heighten-restriction-editor .atw-restriction-slug, .atw-heighten-restriction-editor .atw-restriction-roll-options, .atw-heighten-restriction-editor .atw-restriction-skill-select, .atw-heighten-restriction-editor .atw-restriction-lore",
      async (ev) => {
         if (
            ev.currentTarget.closest(
               ".atw-heighten-choice-editor, .atw-heighten-consequence-editor, .atw-heighten-choice-remove, .atw-heighten-consequence-remove, " +
                  ".atw-heighten-field-editor, .atw-heighten-rule-element-editor, .atw-heighten-tile-editor, .atw-heighten-basic-damage-list, .atw-heighten-restriction-editor",
            )
         ) {
            ev.stopImmediatePropagation()
         }
         const actionState = findAction(item, ev.currentTarget)
         if (!actionState) return
         readActionForm(
            actionState.actionEl,
            actionState.action,
            actionState.entry,
            ev.currentTarget,
         )
         actionState.rule.collapsed = false
         await saveAutomation(item, actionState.automation)
         if (ev.currentTarget.classList.contains("atw-uuid-input")) {
            const wrap = ev.currentTarget.closest(".atw-uuid-input-wrap")
            const value = ev.currentTarget.value?.trim() ?? ""
            if (wrap) resolveUuidIntoRow(value, wrap)
         }
         if (
            ev.currentTarget.classList.contains("atw-heighten-shape-type") ||
            ev.currentTarget.classList.contains("atw-heighten-shape-index") ||
            ev.currentTarget.classList.contains("atw-heighten-action-field") ||
            ev.currentTarget.classList.contains("atw-heighten-movement-preset") ||
            ev.currentTarget.classList.contains("atw-heighten-tile-index") ||
            ev.currentTarget.classList.contains("atw-heighten-rule-index") ||
            ev.currentTarget.classList.contains("atw-heighten-saving-save") ||
            ev.currentTarget.classList.contains("atw-heighten-condition-slug") ||
            ev.currentTarget.classList.contains("atw-choice-kind") ||
            ev.currentTarget.classList.contains("atw-choice-skill") ||
            ev.currentTarget.classList.contains("atw-consequence-type") ||
            ev.currentTarget.classList.contains("atw-consequence-skillType") ||
            ev.currentTarget.classList.contains("atw-restriction-kind") ||
            ev.currentTarget.classList.contains("atw-restriction-skill-select") ||
            ev.currentTarget.classList.contains("atw-heighten-consequence-index")
         ) {
            refreshPanel($html, item, sheet)
         }
      },
   )

   $tab.on(
      "click",
      ".atw-heighten-action [data-action='open-tile-editor'], " +
         ".atw-heighten-action [data-action='open-sound-editor'], " +
         ".atw-heighten-action [data-action='open-light-editor']",
      async (ev) => {
         ev.preventDefault()
         ev.stopImmediatePropagation()
         const actionState = findAction(item, ev.currentTarget)
         if (!actionState) return
         readActionForm(
            actionState.actionEl,
            actionState.action,
            actionState.entry,
            ev.currentTarget,
         )
         actionState.rule.collapsed = false
         await saveAutomation(item, actionState.automation)
         const options = {
            heightenIndex: actionState.ruleIndex,
            heightenActionIndex: actionState.actionIndex,
         }
         const fieldKey = actionState.action.fieldKey ?? ""
         const actionName = ev.currentTarget.dataset.action
         if (actionName === "open-tile-editor") {
            await openTileEditor(item, actionState.entry.id, fieldKey, options)
         } else if (actionName === "open-sound-editor") {
            await openSceneObjectEditor(
               "sound",
               item,
               actionState.entry.id,
               fieldKey,
               options,
            )
         } else {
            await openSceneObjectEditor(
               "light",
               item,
               actionState.entry.id,
               fieldKey,
               options,
            )
         }
         refreshPanel($html, item, sheet)
      },
   )

   $tab.on(
      "click",
      ".atw-heighten-field-editor [data-action='open-file-picker']",
      async (ev) => {
         ev.preventDefault()
         ev.stopImmediatePropagation()
         const actionState = findAction(item, ev.currentTarget)
         if (!actionState) return
         const wrap = ev.currentTarget.closest(".atw-file-picker")
         const input = wrap?.querySelector(".atw-file-picker-input")
         const FP =
            foundry.applications?.apps?.FilePicker?.implementation ??
            foundry.applications?.apps?.FilePicker ??
            globalThis.FilePicker
         if (!FP || !input) {
            ui.notifications?.warn("FilePicker is not available in this Foundry build.")
            return
         }
         try {
            const picker = new FP({
               type: wrap.dataset.fpType ?? "any",
               current: input.value ?? "",
               callback: async (path) => {
                  input.value = path
                  actionState.action.value = path
                  actionState.rule.collapsed = false
                  await saveAutomation(item, actionState.automation)
                  refreshPanel($html, item, sheet)
               },
            })
            picker.render(true)
         } catch (e) {
            undefined
         }
      },
   )

   $tab.on(
      "click",
      ".atw-heighten-rule-element-editor [data-action='format-rule'], " +
         ".atw-heighten-rule-element-editor [data-action='remove-rule']",
      async (ev) => {
         ev.preventDefault()
         ev.stopImmediatePropagation()
         if (ev.currentTarget.dataset.action === "remove-rule") return
         const row = ev.currentTarget.closest(".atw-rule-row")
         const textarea = row?.querySelector(".atw-rule-textarea")
         const actionState = findAction(item, ev.currentTarget)
         if (!row || !textarea || !actionState) return
         try {
            textarea.value = JSON.stringify(JSON.parse(textarea.value), null, 2)
         } catch (_e) {}
         updateRuleRowBadge(row, textarea.value)
         readActionForm(actionState.actionEl, actionState.action, actionState.entry)
         actionState.rule.collapsed = false
         await saveAutomation(item, actionState.automation)
      },
   )

   $tab.on(
      "click",
      ".atw-heighten-choice-editor [data-action='remove-choice'], " +
         ".atw-heighten-consequence-editor > .atw-consequence-row > .atw-consequence-head [data-action='remove-consequence'], " +
         ".atw-heighten-consequence-editor > .atw-save-consequence-row > .atw-consequence-head [data-action='remove-save-consequence']",
      (ev) => {
         ev.preventDefault()
         ev.stopImmediatePropagation()
      },
   )

   $tab.on(
      "click",
      ".atw-heighten-basic-damage-list [data-action='add-damage'], .atw-heighten-basic-damage-list [data-action='remove-damage']",
      async (ev) => {
         ev.preventDefault()
         ev.stopImmediatePropagation()
         const actionState = findAction(item, ev.currentTarget)
         if (!actionState) return
         readActionForm(actionState.actionEl, actionState.action, actionState.entry)
         if (!Array.isArray(actionState.action.damages)) {
            actionState.action.damages = []
         }
         if (ev.currentTarget.dataset.action === "add-damage") {
            actionState.action.damages.push(defaultDamage())
         } else {
            const index = Number(ev.currentTarget.closest(".atw-damage-row")?.dataset.index)
            if (Number.isFinite(index)) actionState.action.damages.splice(index, 1)
         }
         actionState.rule.collapsed = false
         await saveAutomation(item, actionState.automation)
         refreshPanel($html, item, sheet)
      },
   )

   $tab.on(
      "click",
      ".atw-heighten-consequence-editor [data-action='add-damage'], .atw-heighten-consequence-editor [data-action='remove-damage'], " +
         ".atw-heighten-consequence-editor [data-action='add-cons-rule'], .atw-heighten-consequence-editor [data-action='remove-cons-rule'], " +
         ".atw-heighten-consequence-editor [data-action='add-nested-save-consequence'], .atw-heighten-consequence-editor .atw-nested-save-list [data-action='remove-save-consequence']",
      async (ev) => {
         ev.preventDefault()
         ev.stopImmediatePropagation()
         const actionState = findAction(item, ev.currentTarget)
         if (!actionState) return
         readActionForm(actionState.actionEl, actionState.action, actionState.entry)
         mutateConsequenceActionFromClick(actionState.action, ev.currentTarget)
         actionState.rule.collapsed = false
         await saveAutomation(item, actionState.automation)
         refreshPanel($html, item, sheet)
      },
   )
}

function refreshPanelKeepingScroll(
   $html,
   item,
   sheet,
   refreshPanel,
   anchor,
   afterRefresh = null,
) {
   const scrollable = nearestScrollable(anchor)
   const scrollTop = scrollable?.scrollTop ?? 0
   const scrollLeft = scrollable?.scrollLeft ?? 0
   const windowX = globalThis.scrollX ?? 0
   const windowY = globalThis.scrollY ?? 0
   refreshPanel($html, item, sheet)
   afterRefresh?.()
   restoreScroll(scrollable, scrollTop, scrollLeft, windowX, windowY)
   globalThis.requestAnimationFrame?.(() =>
      restoreScroll(scrollable, scrollTop, scrollLeft, windowX, windowY),
   )
}

function nearestScrollable(anchor) {
   const doc = globalThis.document
   for (let node = anchor?.parentElement; node; node = node.parentElement) {
      const style = globalThis.getComputedStyle?.(node)
      if (!style) continue
      const overflow = `${style.overflow} ${style.overflowY}`
      if (/(auto|scroll)/.test(overflow) && node.scrollHeight > node.clientHeight) {
         return node
      }
   }
   return doc?.scrollingElement ?? null
}

function restoreScroll(scrollable, scrollTop, scrollLeft, windowX, windowY) {
   if (scrollable) {
      scrollable.scrollTop = scrollTop
      scrollable.scrollLeft = scrollLeft
   }
   globalThis.scrollTo?.(windowX, windowY)
}

function expandExpirationHeighten($html) {
   const block = $html.find(".atw-expiration-heighten").get(0)
   if (!block) return
   block.classList.remove("atw-accordion-collapsed")
   const icon = block.querySelector(".atw-accordion-header .atw-accordion-chevron")
   icon?.classList.remove("fa-chevron-down")
   icon?.classList.add("fa-chevron-up")
}

function findEntry(item, li) {
   if (!li) return null
   const automation = readAutomation(item)
   const entry = automation.behaviors.find((behavior) => behavior.id === li.dataset.id)
   return entry ? { automation, entry } : null
}

function findRule(item, element) {
   const li = element.closest(".atw-behavior")
   const ruleEl = element.closest(".atw-heighten-rule")
   const entryState = findEntry(item, li)
   if (!entryState || !ruleEl) return null
   entryState.entry.heighten = normalizeHeightenRules(entryState.entry)
   const ruleIndex = Number(ruleEl.dataset.heightenIndex)
   const rule = entryState.entry.heighten[ruleIndex]
   return rule
      ? { ...entryState, rule, ruleIndex, ruleEl }
      : null
}

function findAction(item, element) {
   const ruleState = findRule(item, element)
   const actionEl = element.closest(".atw-heighten-action")
   if (!ruleState || !actionEl) return null
   ruleState.rule.actions = coerceHeightenActionsForMode(
      ruleState.entry,
      ruleState.rule.actions,
      ruleState.rule.mode,
   )
   const actionIndex = Number(actionEl.dataset.heightenActionIndex)
   const action = ruleState.rule.actions[actionIndex]
   return action
      ? { ...ruleState, action, actionIndex, actionEl }
      : null
}

function findExpirationRule(item, element) {
   const ruleEl = element.closest(".atw-expiration-heighten-rule")
   if (!ruleEl) return null
   const automation = readAutomation(item)
   automation.expiration ??= { enabled: true, amount: 1, unit: "minutes" }
   const rules = normalizeHeightenRules(automation.expiration)
   automation.expiration.heighten = rules
   const ruleIndex = Number(ruleEl.dataset.expirationHeightenIndex)
   const rule = rules[ruleIndex]
   return rule
      ? { automation, rules, rule, ruleIndex, ruleEl }
      : null
}

function readExpirationHeightenRule(ruleEl, rule) {
   rule.mode =
      ruleEl.querySelector(".atw-expiration-heighten-mode")?.value === "on"
         ? "on"
         : "every"
   rule.value = Math.max(
      1,
      Number(ruleEl.querySelector(".atw-expiration-heighten-value")?.value) || 1,
   )
   rule.source =
      ruleEl.querySelector(".atw-expiration-heighten-source")?.value === "placer"
         ? "placer"
         : "item"
   rule.actions = Array.isArray(rule.actions) ? rule.actions : []
   let action = rule.actions.find((candidate) => candidate?.type === "setExpiration")
   if (!action) {
      action = defaultHeightenAction("setExpiration")
      rule.actions = [action]
   }
   action.type = "setExpiration"
   action.amount = Math.max(
      0,
      Number(ruleEl.querySelector(".atw-expiration-heighten-amount")?.value) || 0,
   )
   action.unit =
      ruleEl.querySelector(".atw-expiration-heighten-unit")?.value ?? "minutes"
}

function readActionForm(actionEl, action, entry = null, changedEl = null) {
   const field = actionEl.querySelector(".atw-heighten-action-field")?.value
   if (field !== undefined) action.fieldKey = field
   const amount = actionEl.querySelector(".atw-heighten-action-amount")?.value
   if (amount !== undefined) action.amount = Math.max(0, Number(amount) || 0)
   const value = actionEl.querySelector(".atw-heighten-action-value")?.value
   if (value !== undefined) action.value = value
   const rangeEditor = actionEl.querySelector(".atw-heighten-range-editor")
   if (rangeEditor) {
      const rangeValue = rangeEditor.querySelector(".atw-heighten-range-value")?.value
      if (rangeValue !== undefined) action.value = rangeValue
      const output = rangeEditor.querySelector("output")
      if (output) output.textContent = String(action.value ?? "")
   }
   const uuidValue = actionEl.querySelector(".atw-heighten-field-editor .atw-uuid-input")?.value
   if (uuidValue !== undefined) action.value = uuidValue
   const fileValue = actionEl.querySelector(".atw-heighten-field-editor .atw-file-picker-input")?.value
   if (fileValue !== undefined) action.value = fileValue
   const damage = actionEl.querySelector(".atw-heighten-damage")
   if (damage) {
      action.damage = {
         diceCount: Math.max(
            0,
            Number(damage.querySelector(".atw-heighten-damage-count")?.value) || 0,
         ),
         dieSize: damage.querySelector(".atw-heighten-damage-die")?.value ?? "d6",
         category:
            damage.querySelector(".atw-heighten-damage-category")?.value ??
            "normal",
         damageType:
            damage.querySelector(".atw-heighten-damage-type")?.value ?? "fire",
      }
   }
   const damageIndex = actionEl.querySelector(".atw-heighten-damage-index")?.value
   if (damageIndex !== undefined) {
      action.damageIndex = Math.max(0, Number(damageIndex) || 0)
   }
   const damageType = actionEl.querySelector(
      ":scope > .atw-heighten-action-body > .atw-heighten-damage-type",
   )?.value
   if (damageType !== undefined) action.damageType = damageType
   const iwrType = actionEl.querySelector(".atw-heighten-iwr-type")?.value
   if (iwrType !== undefined) action.damageType = iwrType
   if (
      ["removeIWR", "increaseIWR", "decreaseIWR"].includes(action.type) &&
      entry
   ) {
      const values = currentIwrValues(entry, action.fieldKey)
      if (!values.includes(action.damageType)) action.damageType = values[0] ?? ""
   }
   const duration = actionEl.querySelector(".atw-heighten-duration")
   if (duration) {
      action.duration = {
         enabled: true,
         amount: Math.max(
            1,
            Number(duration.querySelector(".atw-heighten-duration-amount")?.value) || 1,
         ),
         unit: duration.querySelector(".atw-heighten-duration-unit")?.value ?? "rounds",
      }
   }
   const savingThrow = actionEl.querySelector(".atw-heighten-saving-throw")
   if (savingThrow) {
      action.save =
         savingThrow.querySelector(".atw-heighten-saving-save")?.value ?? "reflex"
      action.dc = savingThrow.querySelector(".atw-heighten-saving-dc")?.value ?? "15"
   }
   const basicDamageList = actionEl.querySelector(".atw-heighten-basic-damage-list")
   if (basicDamageList) {
      action.damages = readDamageRows(basicDamageList)
   }
   const condition = actionEl.querySelector(".atw-heighten-condition-editor")
   if (condition) {
      const valueInput = condition.querySelector(".atw-heighten-condition-value")
      action.condition = {
         slug: condition.querySelector(".atw-heighten-condition-slug")?.value ?? "frightened",
         value: Math.max(
            1,
            Number(valueInput?.value) || 1,
         ),
      }
   }
   const dice = actionEl.querySelector(".atw-heighten-dice-formula")
   if (dice) {
      action.dice = {
         diceCount: Math.max(
            1,
            Number(dice.querySelector(".atw-heighten-dice-count")?.value) || 1,
         ),
         dieSize: Math.max(
            2,
            Number(dice.querySelector(".atw-heighten-dice-size")?.value) || 20,
         ),
      }
   }
   const tagValue = actionEl.querySelector(".atw-heighten-tag-value")?.value
   if (tagValue !== undefined) action.value = tagValue
   const extraRollOption = actionEl.querySelector(".atw-heighten-extra-roll-option")?.value
   if (extraRollOption !== undefined) action.value = extraRollOption
   if (action.type === "removeExtraRollOption" && entry) {
      const values = currentExtraRollOptions(entry, action.fieldKey)
      if (!values.includes(action.value)) action.value = values[0] ?? ""
   }
   if (action.type === "removeTagValue" && entry) {
      const values = currentTagValues(entry, action.fieldKey)
      if (!values.includes(action.value)) action.value = values[0] ?? ""
   }
   const fullSound = actionEl.querySelector(".atw-heighten-sound-config .atw-sound-editor")
   if (fullSound && !action.sound) {
      action.sound ??= {}
   }
   const fullLight = actionEl.querySelector(".atw-heighten-light-config .atw-light-editor")
   if (fullLight && !action.light) {
      action.light ??= {}
   }
   const tileEditor = actionEl.querySelector(".atw-heighten-tile-editor")
   if (tileEditor) {
      const tileIndex = actionEl.querySelector(".atw-heighten-tile-index")?.value
      action.tileIndex = Math.max(0, Number(tileIndex) || 0)
      const fieldKey = action.fieldKey ?? "tiles"
      const rows = entry ? normalizeTileAttachments(entry.system?.[fieldKey]) : []
      const base = rows[action.tileIndex] ?? action.tileAttachment ?? defaultTileAttachment()
      const carryExisting =
         changedEl?.classList?.contains("atw-heighten-tile-index") ||
         changedEl?.classList?.contains("atw-heighten-action-field")
            ? {}
            : action.tileAttachment ?? {}
      action.tileAttachment = {
         ...base,
         ...carryExisting,
         shape:
            tileEditor.querySelector(".atw-tile-shape-select")?.value ??
            carryExisting.shape ??
            base.shape ??
            "all",
      }
   }
   const ruleEditor = actionEl.querySelector(".atw-heighten-rule-element-editor")
   if (ruleEditor) {
      const ruleIndex = ruleEditor.querySelector(".atw-heighten-rule-index")?.value
      action.ruleIndex = Math.max(0, Number(ruleIndex) || 0)
      const textarea = ruleEditor.querySelector(".atw-rule-textarea")
      action.rule = textarea?.value ?? action.rule ?? '{\n  "key": ""\n}'
      if (
         entry &&
         (changedEl?.classList?.contains("atw-heighten-rule-index") ||
            changedEl?.classList?.contains("atw-heighten-action-field"))
      ) {
         const rows = Array.isArray(entry.system?.[action.fieldKey])
            ? entry.system[action.fieldKey]
            : []
         action.rule = rows[action.ruleIndex] ?? '{\n  "key": ""\n}'
      }
   }
   const movement = actionEl.querySelector(".atw-heighten-movement-cost")
   if (movement) {
      action.preset =
         movement.querySelector(".atw-heighten-movement-preset")?.value ?? "difficult"
      action.customCost = Math.max(
         1,
         Number(movement.querySelector(".atw-heighten-movement-custom")?.value) || 2,
      )
   }
   const choiceIndex = actionEl.querySelector(".atw-heighten-choice-index")?.value
   if (choiceIndex !== undefined) action.choiceIndex = Math.max(0, Number(choiceIndex) || 0)
   const choice = readChoiceAction(actionEl)
   if (choice) action.choice = choice
   const restrictionIndex = actionEl.querySelector(".atw-heighten-restriction-index")?.value
   if (restrictionIndex !== undefined) action.restrictionIndex = Math.max(0, Number(restrictionIndex) || 0)
   const restriction = readRestrictionAction(actionEl)
   if (restriction) action.restriction = restriction
   const consequenceIndex = actionEl.querySelector(".atw-heighten-consequence-index")?.value
   if (consequenceIndex !== undefined) {
      action.consequenceIndex = Math.max(0, Number(consequenceIndex) || 0)
   }
   const consequence = readConsequenceAction(actionEl)
   if (consequence) action.consequence = consequence
   if (
      entry &&
      changedEl &&
      action.type === "modifyConsequence" &&
      (changedEl.classList.contains("atw-heighten-action-field") ||
         changedEl.classList.contains("atw-heighten-consequence-index"))
   ) {
      action.consequence = currentConsequenceValue(
         entry,
         action.fieldKey,
         action.consequenceIndex,
      )
   }
   if (
      entry &&
      changedEl &&
      action.type === "addConsequence" &&
      changedEl.classList.contains("atw-heighten-action-field")
   ) {
      action.consequence = defaultConsequenceForField(entry, action.fieldKey)
   }
   const shape = actionEl.querySelector(".atw-heighten-shape")
   if (shape) {
         action.shape = {
            ...(action.shape ?? {}),
            type: shape.querySelector(".atw-heighten-shape-type")?.value ?? "circle",
         size: Math.max(
            1,
            Number(shape.querySelector(".atw-heighten-shape-size")?.value) || 15,
         ),
         width: Math.max(
            1,
            Number(shape.querySelector(".atw-heighten-shape-width")?.value) ||
               Number(action.shape?.width) ||
               5,
         ),
         innerRadius: Math.max(
            1,
            Number(shape.querySelector(".atw-heighten-shape-inner")?.value) ||
               Number(action.shape?.innerRadius) ||
               5,
         ),
      }
   }
   const shapeIndex = actionEl.querySelector(".atw-heighten-shape-index")?.value
   if (shapeIndex !== undefined) {
      action.shapeIndex = Math.max(0, Number(shapeIndex) || 0)
   }
}

function readChoiceAction(actionEl) {
   const row = actionEl.querySelector(".atw-heighten-choice-editor .atw-choice-row")
   if (!row) return null
   const kind = row.querySelector(".atw-choice-kind")?.value === "skill" ? "skill" : "save"
   return {
      kind,
      save: row.querySelector(".atw-choice-save")?.value ?? "reflex",
      skill: row.querySelector(".atw-choice-skill")?.value ?? "athletics",
      lore: row.querySelector(".atw-choice-lore")?.value ?? "",
      dc: row.querySelector(".atw-choice-dc")?.value ?? "15",
   }
}

function readRestrictionAction(actionEl) {
   const row = actionEl.querySelector(".atw-heighten-restriction-editor .atw-restriction-row")
   if (!row) return null
   return {
      kind: row.querySelector(".atw-restriction-kind")?.value ?? "spell",
      slug: row.querySelector(".atw-restriction-slug")?.value ?? "",
      rollOptions: row.querySelector(".atw-restriction-roll-options")?.value ?? "",
      skill: row.querySelector(".atw-restriction-skill-select")?.value ?? "athletics",
      lore: row.querySelector(".atw-restriction-lore")?.value ?? "",
   }
}

function readConsequenceAction(actionEl) {
   const editor = actionEl.querySelector(".atw-heighten-consequence-editor")
   if (!editor) return null
   const row = Array.from(editor.children).find((child) =>
      child.matches?.(".atw-consequence-row, .atw-save-consequence-row"),
   )
   return row ? readConsequenceRow(row) : null
}

function readConsequenceRow(row) {
   const saveRow = row.classList.contains("atw-save-consequence-row")
   const body = row.querySelector(":scope > .atw-consequence-body")
   const type = row.querySelector(":scope > .atw-consequence-head > .atw-consequence-type")?.value ?? "damage"
   const consequence = saveRow
      ? {
           outcome:
              row.querySelector(":scope > .atw-consequence-head > .atw-save-consequence-outcome")?.value ??
              "failure",
           type,
        }
      : {
           min: Math.max(
              0,
              Number(row.querySelector(":scope > .atw-consequence-head > .atw-consequence-min")?.value) || 0,
           ),
           max: Math.max(
              0,
              Number(row.querySelector(":scope > .atw-consequence-head > .atw-consequence-max")?.value) || 0,
           ),
           type,
        }
   Object.assign(consequence, readConsequenceBody(type, body))
   return consequence
}

function readConsequenceBody(type, body) {
   if (!body) return {}
   switch (type) {
      case "damage":
         return { damages: readDamageRows(body.querySelector(":scope > .atw-damage-list")) }
      case "heal":
         return {
            amount: body.querySelector(".atw-consequence-heal-amount")?.value ?? "5",
            healingType: body.querySelector(".atw-consequence-heal-type")?.value ?? "untyped",
         }
      case "move":
         return {
            direction: body.querySelector(".atw-consequence-move-direction")?.value ?? "away",
            distance: Math.max(
               0,
               Number(body.querySelector(".atw-consequence-move-distance")?.value) || 0,
            ),
         }
      case "applyEffect":
         return {
            uuid: body.querySelector(".atw-consequence-uuid")?.value?.trim() ?? "",
            duration: readConsequenceDuration(body),
         }
      case "removeEffect":
      case "executeMacro":
         return { uuid: body.querySelector(".atw-consequence-uuid")?.value?.trim() ?? "" }
      case "applyCondition":
         return {
            condition: readConsequenceCondition(body),
            duration: readConsequenceDuration(body),
         }
      case "removeCondition":
         return { condition: readConsequenceCondition(body) }
      case "applyRuleElement":
         return {
            rules: Array.from(body.querySelectorAll(":scope .atw-cons-rule-textarea")).map(
               (textarea) => textarea.value,
            ),
            duration: readConsequenceDuration(body),
         }
      case "sendChatMessage":
         return {
            text: body.querySelector(".atw-consequence-text")?.value ?? "",
            privateToGm: !!body.querySelector(".atw-consequence-privateToGm")?.checked,
            blindToGm: !!body.querySelector(".atw-consequence-blindToGm")?.checked,
         }
      case "savingThrow":
         return {
            save: body.querySelector(".atw-consequence-saveType")?.value ?? "reflex",
            dc: body.querySelector(".atw-consequence-saveDC")?.value ?? "15",
            consequences: readNestedSaveRows(body),
         }
      case "rollSkill":
         return {
            skill: body.querySelector(".atw-consequence-skillType")?.value ?? "athletics",
            lore: body.querySelector(".atw-consequence-skillLore")?.value ?? "",
            dc: body.querySelector(".atw-consequence-skillDC")?.value ?? "15",
            consequences: readNestedSaveRows(body),
         }
      case "scrollingText":
         return {
            text: body.querySelector(".atw-consequence-text")?.value ?? "",
            color: body.querySelector(".atw-consequence-color")?.value ?? "#ffffff",
         }
      default:
         return {}
   }
}

function readDamageRows(list) {
   if (!list) return []
   return Array.from(list.querySelectorAll(":scope > .atw-damage-row")).map((row) => ({
      diceCount: Math.max(0, Number(row.querySelector(".atw-damage-count")?.value) || 0),
      dieSize: row.querySelector(".atw-damage-die")?.value ?? "d6",
      damageType: row.querySelector(".atw-damage-type")?.value ?? "fire",
      category: row.querySelector(".atw-damage-category")?.value ?? "normal",
      extraRollOptions: row.querySelector(".atw-damage-extra")?.value ?? "",
   }))
}

function readConsequenceDuration(body) {
   const duration = body.querySelector(".atw-consequence-duration")
   if (!duration) return { enabled: false, amount: 1, unit: "rounds" }
   return {
      enabled: !!duration.querySelector(".atw-consequence-duration-enabled")?.checked,
      amount: Math.max(
         1,
         Number(duration.querySelector(".atw-consequence-duration-amount")?.value) || 1,
      ),
      unit: duration.querySelector(".atw-consequence-duration-unit")?.value ?? "rounds",
   }
}

function readConsequenceCondition(body) {
   return {
      slug: body.querySelector(".atw-consequence-condslug")?.value ?? "frightened",
      value: Math.max(1, Number(body.querySelector(".atw-consequence-condvalue")?.value) || 1),
   }
}

function readNestedSaveRows(body) {
   const list = body.querySelector(":scope .atw-nested-save-list")
   if (!list) return []
   return Array.from(list.querySelectorAll(":scope > .atw-save-consequence-row")).map(
      (row) => readConsequenceRow(row),
   )
}

function mutateConsequenceActionFromClick(action, element) {
   const target = targetConsequence(action, element)
   if (!target) return
   const actionName = element.dataset.action
   if (actionName === "add-damage") {
      target.damages = Array.isArray(target.damages) ? target.damages : []
      target.damages.push(defaultDamage())
   } else if (actionName === "remove-damage") {
      const index = Number(element.closest(".atw-damage-row")?.dataset.index)
      target.damages = Array.isArray(target.damages) ? target.damages : []
      if (Number.isFinite(index)) target.damages.splice(index, 1)
   } else if (actionName === "add-cons-rule") {
      target.rules = Array.isArray(target.rules) ? target.rules : []
      target.rules.push('{\n  "key": ""\n}')
   } else if (actionName === "remove-cons-rule") {
      const index = Number(element.closest(".atw-cons-rule-row")?.dataset.index)
      target.rules = Array.isArray(target.rules) ? target.rules : []
      if (Number.isFinite(index)) target.rules.splice(index, 1)
   } else if (actionName === "add-nested-save-consequence") {
      target.consequences = Array.isArray(target.consequences) ? target.consequences : []
      target.consequences.push(defaultSaveConsequence())
   } else if (actionName === "remove-save-consequence") {
      const row = element.closest(".atw-save-consequence-row")
      const nestedList = row?.parentElement?.closest(".atw-nested-save-list")
      if (!nestedList) return
      const index = Number(row.dataset.index)
      const parent = targetConsequence(action, nestedList)
      parent.consequences = Array.isArray(parent.consequences) ? parent.consequences : []
      if (Number.isFinite(index)) parent.consequences.splice(index, 1)
   }
}

function targetConsequence(action, element) {
   const nestedRow = element.closest(".atw-nested-save-list > .atw-save-consequence-row")
   if (nestedRow) {
      const index = Number(nestedRow.dataset.index)
      const parent = parentConsequence(action, nestedRow)
      const rows = Array.isArray(parent.consequences) ? parent.consequences : []
      return rows[index] ?? null
   }
   return action.consequence ?? null
}

function parentConsequence(action, element) {
   const parentRow = element.closest(".atw-consequence-row, .atw-save-consequence-row")
   if (!parentRow || !parentRow.classList.contains("atw-save-consequence-row")) {
      return action.consequence
   }
   const parentList = parentRow.parentElement?.closest(".atw-nested-save-list")
   if (!parentList) return action.consequence
   return action.consequence
}

function defaultDamage() {
   return {
      diceCount: 1,
      dieSize: "d6",
      damageType: "fire",
      category: "normal",
   }
}

function defaultSaveConsequence() {
   return {
      outcome: "failure",
      type: "damage",
      damages: [defaultDamage()],
   }
}

function currentConsequenceValue(entry, fieldKey, index) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   return foundry.utils.deepClone(rows[Math.max(0, Number(index) || 0)] ?? defaultConsequenceForField(entry, fieldKey))
}

function defaultConsequenceForField(entry, fieldKey) {
   const field = behaviorFields(entry).find((candidate) => candidate.key === fieldKey)
   if (field?.type === "saveConsequenceList") return defaultSaveConsequence()
   return {
      min: 1,
      max: 1,
      type: "damage",
      damages: [defaultDamage()],
   }
}

function behaviorFields(entry) {
   return BEHAVIOR_CATALOG.find((behavior) => behavior.type === entry?.type)?.fields ?? []
}

function currentIwrValues(entry, fieldKey) {
   const current = Array.isArray(entry?.system?.[fieldKey])
      ? entry.system[fieldKey]
      : []
   return current
      .map((row) => String(typeof row === "string" ? row : row?.type ?? "").trim())
      .filter(Boolean)
}

function currentTagValues(entry, fieldKey) {
   const current = Array.isArray(entry?.system?.[fieldKey])
      ? entry.system[fieldKey]
      : []
   return current.map((value) => String(value)).filter(Boolean)
}

function currentExtraRollOptions(entry, fieldKey) {
   const value = entry?.system?.[fieldKey]?.value ?? entry?.system?.[fieldKey]
   if (Array.isArray(value)) return value.map((entryValue) => String(entryValue).trim()).filter(Boolean)
   return String(value ?? "")
      .split(",")
      .map((entryValue) => entryValue.trim())
      .filter(Boolean)
}
