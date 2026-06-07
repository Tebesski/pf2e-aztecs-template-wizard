import {
   BEHAVIOR_CATALOG,
   coerceFieldValue,
} from "../data.mjs"
import { readAutomation, saveAutomation } from "./automation-storage.mjs"
import {
   renderTabContent,
   renderAdvancedSection,
   computeExpressionPreview,
   bootstrapUuidResolutions,
} from "./renderers.mjs"
import { TAB_CLASS } from "./tab-constants.mjs"
import { wireTemplateShapeControls } from "./wire-template-shapes.mjs"
import { wireChoiceControls } from "./wire-choices.mjs"
import { wireSaveConsequenceControls } from "./wire-save-consequences.mjs"
import { wireUuidAndTagControls } from "./wire-uuid-tags.mjs"
import { wireConditionControls } from "./wire-condition-controls.mjs"
import { wireDamageControls } from "./wire-damage-controls.mjs"
import { wireMediaControls } from "./wire-media-controls.mjs"
import { wireFieldControls } from "./wire-field-controls.mjs"
import { wireConsequenceControls } from "./wire-consequence-controls.mjs"
import { wireHeighteningControls } from "./wire-heightening-controls.mjs"
import {
   wireAutomationImportExportControls,
   wireBehaviorListControls,
} from "./wire-panel-actions.mjs"
export function wireTab($html, item, sheet, renderOptions = {}) {
   const $tab = $html.find(`.${TAB_CLASS}`)
   if (!$tab.length) return

   for (const evName of ["change", "input"]) {
      $tab[0].addEventListener(evName, (ev) => ev.stopPropagation(), false)
   }
   $tab[0].addEventListener(
      "submit",
      (ev) => {
         ev.preventDefault()
         ev.stopPropagation()
      },
      false,
   )

   $tab.on("change input", "[data-atw-path]", async (ev) => {
      const el = ev.currentTarget
      if (el.closest(".atw-behavior")) return
      const path = el.dataset.atwPath
      if (!path) return

      const wantNumber = el.dataset.atwPathType === "number"
      if (path === "contiguous.count") {
         const raw = String(el.value ?? "").trim()
         if (raw === "" && ev.type === "input") return
         const parsed = Math.floor(Number(raw))
         if (!Number.isFinite(parsed)) return
         const value = Math.max(1, parsed)
         if (ev.type !== "input") el.value = value
         const a = readAutomation(item)
         foundry.utils.setProperty(a, path, value)
         await saveAutomation(item, a)
         return
      }
      const value =
         el.type === "checkbox"
            ? el.checked
            : el.type === "number"
              ? Number(el.value)
              : wantNumber
                ? Number(el.value)
                : el.value
      const a = readAutomation(item)
      foundry.utils.setProperty(a, path, value)
      await saveAutomation(item, a)

      if (path === "expiration.enabled") {
         $tab.find(".atw-expiration").toggleClass("atw-disabled", !el.checked)
      }
      if (path === "expiration.unit") {
         const amountEl = $tab
            .find('[data-atw-path="expiration.amount"]')
            .get(0)
         if (amountEl)
            amountEl.style.display = el.value === "unlimited" ? "none" : ""
      }
      if (path === "advanced.enabled") {
         const sectionEl = $tab.find(".atw-advanced").get(0)
         if (sectionEl) {
            const wasOpen = !sectionEl.classList.contains(
               "atw-accordion-collapsed",
            )
            const fragment = document
               .createRange()
               .createContextualFragment(renderAdvancedSection(a))
            sectionEl.replaceWith(fragment)
            if (wasOpen)
               $tab.find(".atw-advanced").removeClass("atw-accordion-collapsed")
         }
      }
      if (path === "contiguous.enabled") {
         const input = $tab.find('[data-atw-path="contiguous.count"]').get(0)
         if (input) input.disabled = !el.checked
      }
      if (path === "placementRange.enabled") {
         const input = $tab.find('[data-atw-path="placementRange.max"]').get(0)
         if (input) input.disabled = !el.checked
      }
   })

   wireTemplateShapeControls($tab, item)

   $tab.on("change", "[data-atw-bprop]", async (ev) => {
      const el = ev.currentTarget
      const li = el.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (!entry) return
      entry[el.dataset.atwBprop] =
         el.type === "checkbox" ? el.checked : el.value
      await saveAutomation(item, a)
   })

   const COMPOUND_WIDGET_SELECTOR =
      ".atw-tag-picker, .atw-uuid-list-wrap, .atw-tag-input, .atw-uuid-input-wrap, .atw-condition-picker, .atw-damage-list, .atw-tile-list, .atw-file-picker, .atw-dice-formula, .atw-duration, .atw-extra-roll-options, .atw-rule-list, .atw-consequence-list, .atw-save-consequence-list, .atw-choice-list, .atw-irw-tag-list, .atw-restriction-list"

   $tab.on(
      "change input",
      `[data-atw-sprop]:not(.atw-tag-picker):not(.atw-uuid-list-wrap):not(.atw-tag-input):not(.atw-uuid-input-wrap):not(.atw-condition-picker):not(.atw-damage-list):not(.atw-tile-list):not(.atw-file-picker):not(.atw-dice-formula):not(.atw-duration):not(.atw-extra-roll-options):not(.atw-rule-list):not(.atw-consequence-list):not(.atw-save-consequence-list):not(.atw-choice-list):not(.atw-irw-tag-list):not(.atw-restriction-list)`,
      async (ev) => {
         const el = ev.currentTarget

         if (
            el.closest(COMPOUND_WIDGET_SELECTOR) &&
            !el.matches("[data-atw-sprop]")
         )
            return
         if (el !== ev.target && el.closest(COMPOUND_WIDGET_SELECTOR)) return

         const li = el.closest(".atw-behavior")
         if (!li) return
         const id = li.dataset.id
         const a = readAutomation(item)
         const entry = a.behaviors.find((b) => b.id === id)
         if (!entry) return

         const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
         const key = el.dataset.atwSprop
         const field = def?.fields.find((f) => f.key === key)

         let value =
            el.type === "checkbox"
               ? el.checked
               : el.type === "number"
                 ? Number(el.value)
                 : el.type === "range"
                   ? Number(el.value)
                   : el.value
         if (field) value = coerceFieldValue(field, value)

         foundry.utils.setProperty(entry.system, key, value)

         if (field?.mutuallyExclusiveWith && value === true) {
            const partnerKey = field.mutuallyExclusiveWith
            foundry.utils.setProperty(entry.system, partnerKey, false)

            const partnerEl = li.querySelector(
               `[data-atw-sprop="${CSS.escape(partnerKey)}"]`,
            )
            if (partnerEl && partnerEl.type === "checkbox")
               partnerEl.checked = false
         }

         if (el.type === "range") {
            const out = el.parentElement.querySelector(".atw-range-out")
            if (out) {
               const n = Number(el.value)
               if (el.dataset.displayAs === "percent") {
                  out.textContent = `${n >= 0 ? "+" : ""}${Math.round(n * 100)}%`
               } else {
                  out.textContent = el.value
               }
            }
         }

         if (
            (field?.type === "expression" ||
               field?.type === "expressionWithSuggestions") &&
            el.classList.contains("atw-expression-input")
         ) {
            const preview = computeExpressionPreview(el.value, item)
            const out = el.parentElement?.querySelector(
               ".atw-expression-preview",
            )
            if (out) {
               out.textContent = preview
               out.toggleAttribute("hidden", preview === "")
            }
         }

         const affectsVisibility = def?.fields?.some(
            (f) =>
               (f.dependsOn && key in f.dependsOn) ||
               (f.showWhen && f.showWhen.field === key),
         )
            await saveAutomation(item, a)
         if (affectsVisibility) refreshPanel($html, item, sheet, renderOptions)
      },
   )

   wireAutomationImportExportControls($tab, $html, item, sheet, (root, doc, app) =>
      refreshPanel(root, doc, app, renderOptions),
   )

   wireBehaviorListControls($tab, $html, item, sheet, (root, doc, app) =>
      refreshPanel(root, doc, app, renderOptions),
   )

   wireHeighteningControls($tab, $html, item, sheet, (root, doc, app) =>
      refreshPanel(root, doc, app, renderOptions),
   )

   wireUuidAndTagControls($tab, item)

   wireConditionControls($tab, item)

   wireDamageControls($tab, item)

   wireMediaControls($tab, item)

   wireFieldControls($tab, item)

   wireConsequenceControls($tab, item)

   wireSaveConsequenceControls($tab, item)

   wireChoiceControls($tab, item)

   $tab.on("click", "a.atw-uuid-link[data-uuid]", async (ev) => {
      ev.preventDefault()
      const uuid = ev.currentTarget.dataset.uuid
      const doc = await fromUuid(uuid).catch(() => null)
      if (doc?.sheet) doc.sheet.render(true)
   })

   setTimeout(() => bootstrapUuidResolutions(item), 0)
}

function refreshPanel($html, item, sheet, renderOptions = {}) {
   const $tab = $html.find(`.${TAB_CLASS}`)
   if (!$tab.length) return
   const body = $tab.closest(".sheet-body, .tab-body")[0]
   const bodyScroll = body?.scrollTop ?? 0
   const tabScroll = $tab[0].scrollTop
   $tab[0].innerHTML = renderTabContent(item, renderOptions)
   $tab[0].scrollTop = tabScroll
   if (body) body.scrollTop = bodyScroll
   setTimeout(() => bootstrapUuidResolutions(item), 0)
}
