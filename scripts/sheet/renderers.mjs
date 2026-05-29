import {
   BEHAVIOR_CATALOG,
   TIME_UNITS,
   REGION_VISIBILITY_OPTIONS,
   REGION_HIGHLIGHT_MODE_OPTIONS,
   defaultAdvanced,
   defaultTemplateShape,
   defaultShapeVariant,
   TEMPLATE_SHAPE_TYPE_OPTIONS,
   resolveOptions,
} from "../data.mjs"
import { escapeHTML, localize } from "../common/html.mjs"
import { readAutomation } from "./automation-storage.mjs"
import {
   checkDependency,
   computeExpressionPreview,
} from "./expression-preview.mjs"
export {
   checkDependency,
   computeExpressionPreview,
} from "./expression-preview.mjs"
import {
   renderTagPicker,
   renderIrwTagList,
   renderUuidList,
   renderUuidInput,
   renderTagInput,
   renderConditionPicker,
   renderDamageList,
   renderTileEditor,
   renderTileList,
   renderSoundEditor,
   renderLightEditor,
   renderFilePicker,
   renderDiceFormula,
   renderDuration,
   renderExtraRollOptions,
   renderRuleElementList,
} from "./input-renderers.mjs"
import { renderChoiceList } from "./choice-renderers.mjs"
import {
   renderConsequenceList,
   renderSaveConsequenceList,
} from "./consequence-renderers.mjs"
export {
   defaultConsequence,
   seedConsequenceDefaults,
   renderConsequenceList,
   consequenceRowHtml,
   consequenceDurationHtml,
   consequenceBodyHtml,
   refreshConsequenceList,
   defaultSaveConsequence,
   renderSaveConsequenceList,
   saveConsequenceRowHtml,
   refreshSaveConsequenceList,
} from "./consequence-renderers.mjs"
export {
   CHOICE_KIND_OPTIONS,
   CHOICE_SAVE_OPTIONS,
   defaultChoice,
   renderChoiceList,
   choiceRowHtml,
   refreshChoiceList,
} from "./choice-renderers.mjs"
export {
   UUID_CACHE,
   UUID_RESOLVING,
   renderTagPicker,
   refreshTagPicker,
   renderIrwTagList,
   refreshIrwTagList,
   renderUuidList,
   resolveUuidIntoRow,
   uuidRowHtml,
   updateUuidRowDom,
   refreshUuidList,
   bootstrapUuidResolutions,
   renderUuidInput,
   refreshUuidInput,
   renderTagInput,
   refreshTagInput,
   normalizeConditionValue,
   lookupConditionDoc,
   renderConditionPicker,
   refreshConditionPicker,
   damageRowHtml,
   renderDamageList,
   refreshDamageList,
   renderTileEditor,
   renderTileList,
   tileListRowHtml,
   isVideoSrc,
   refreshTileEditor,
   refreshTileList,
   renderSoundEditor,
   refreshSoundEditor,
   renderLightEditor,
   refreshLightEditor,
   renderFilePicker,
   renderDiceFormula,
   renderDuration,
   renderExtraRollOptions,
   validateRuleJson,
   renderRuleElementList,
   ruleElementRowHtml,
   refreshRuleElementList,
   updateRuleRowBadge,
} from "./input-renderers.mjs"
export function renderTabContent(item) {
   const automation = readAutomation(item)
   const labelPlaceholder = escapeHTML(item.name ?? "")
   const isUnlimited = automation.expiration.unit === "unlimited"
   const units =
      Object.entries(TIME_UNITS)
         .map(
            ([k, v]) =>
               `<option value="${k}" ${automation.expiration.unit === k ? "selected" : ""}>` +
               `${localize(v.label)}</option>`,
         )
         .join("") +
      `<option value="unlimited" ${isUnlimited ? "selected" : ""}>${localize("PF2EATW.Unit.Unlimited")}</option>`

   const catalog = BEHAVIOR_CATALOG.slice()
      .sort((a, b) => localize(a.label).localeCompare(localize(b.label)))
      .map((b) => `<option value="${b.type}">${localize(b.label)}</option>`)
      .join("")

   const rows = (automation.behaviors ?? [])
      .map((entry) => behaviorRowHtml(entry, item))
      .join("")

   return `
    <section class="atw-section">
      <div class="atw-row atw-row-actions">
        <a data-action="atw-export">
          <i class="fa-solid fa-file-export"></i> ${localize("PF2EATW.IO.Export")}
        </a>
        <a data-action="atw-import">
          <i class="fa-solid fa-file-import"></i> ${localize("PF2EATW.IO.Import")}
        </a>
      </div>
      <div class="atw-row atw-row-actions">
        <a data-action="atw-save-to-compendium">
          <i class="fa-solid fa-bookmark"></i> ${localize("PF2EATW.Compendium.Save")}
        </a>
        <a data-action="atw-import-from-compendium">
          <i class="fa-solid fa-book-open"></i> ${localize("PF2EATW.Compendium.ImportFrom")}
        </a>
      </div>
      <label class="atw-row atw-row-toggle">
        <input type="checkbox" data-atw-path="enabled" ${automation.enabled ? "checked" : ""}>
        <span>${localize("PF2EATW.AutomationEnabled")}</span>
      </label>
      <label class="atw-row">
        <span class="atw-row-label">${localize("PF2EATW.Label")}</span>
        <input type="text" data-atw-path="label"
               value="${escapeHTML(automation.label ?? "")}"
               placeholder="${labelPlaceholder}">
      </label>
      ${renderTemplateShapesInline(automation)}
    </section>

    <fieldset class="atw-section">
      <legend>${localize("PF2EATW.Expiration")}</legend>
      <label class="atw-row atw-row-toggle">
        <input type="checkbox" data-atw-path="expiration.enabled"
               ${automation.expiration.enabled ? "checked" : ""}>
        <span>${localize("PF2EATW.ExpirationEnabled")}
          <i class="fa-solid fa-circle-info atw-tooltip-icon"
             data-tooltip="${escapeHTML(localize("PF2EATW.Tooltip.RegionExpiration"))}"></i>
        </span>
      </label>
      <div class="atw-row atw-expiration ${automation.expiration.enabled ? "" : "atw-disabled"}">
        <input type="number" data-atw-path="expiration.amount"
               min="0" step="1" value="${automation.expiration.amount}"
               ${isUnlimited ? 'style="display:none"' : ""}>
        <select data-atw-path="expiration.unit">${units}</select>
      </div>
    </fieldset>

    ${renderAdvancedSection(automation)}

    <fieldset class="atw-section atw-behaviors-section">
      <legend class="atw-behaviors-legend">${localize("PF2EATW.Behaviors")}</legend>
      <div class="atw-add-row">
        <select class="atw-behavior-picker" data-role="behavior-type">${catalog}</select>
        <a data-action="add-behavior"
           data-tooltip="${localize("PF2EATW.AddBehavior")}">
          <i class="fa-solid fa-plus"></i>
        </a>
      </div>
      <ul class="atw-behavior-list">${rows}</ul>
    </fieldset>
  `
}

export function renderAdvancedSection(automation) {
   const adv = automation.advanced ?? defaultAdvanced()
   const contiguous =
      automation.contiguous && typeof automation.contiguous === "object"
         ? automation.contiguous
         : { enabled: false, count: 2 }
   const contiguousCount = Math.max(1, Number(contiguous.count) || 2)
   const visOpts = REGION_VISIBILITY_OPTIONS.map(
      (o) =>
         `<option value="${o.value}" ${Number(o.value) === Number(adv.visibility) ? "selected" : ""}>` +
         `${localize(o.label)}</option>`,
   ).join("")

   let hlCurrent = adv.highlightMode ?? "coverage"
   if (typeof hlCurrent === "number")
      hlCurrent = ["shapes", "coverage"][hlCurrent] ?? "coverage"
   if (hlCurrent === "shape" || hlCurrent === "placeables") hlCurrent = "shapes"
   if (hlCurrent !== "shapes" && hlCurrent !== "coverage")
      hlCurrent = "coverage"
   const hlOpts = REGION_HIGHLIGHT_MODE_OPTIONS.map(
      (o) =>
         `<option value="${escapeHTML(String(o.value))}" ${String(o.value) === hlCurrent ? "selected" : ""}>` +
         `${localize(o.label)}</option>`,
   ).join("")

   const overrideGridHtml = adv.enabled
      ? `
      <div class="atw-advanced-grid">
        <label class="atw-row">
          <span class="atw-row-label">${localize("PF2EATW.AdvancedField.Color")}</span>
          <input type="color" data-atw-path="advanced.color" value="${escapeHTML(adv.color ?? "#a728cc")}">
        </label>
        <label class="atw-row">
          <span class="atw-row-label">${localize("PF2EATW.AdvancedField.Visibility")}</span>
          <select data-atw-path="advanced.visibility" data-atw-path-type="number">${visOpts}</select>
        </label>
        <label class="atw-row">
          <span class="atw-row-label">${localize("PF2EATW.AdvancedField.HighlightMode")}</span>
          <select data-atw-path="advanced.highlightMode">${hlOpts}</select>
        </label>
        <label class="atw-row atw-row-toggle">
          <input type="checkbox" data-atw-path="advanced.displayMeasurements" ${adv.displayMeasurements ? "checked" : ""}>
          <span>${localize("PF2EATW.AdvancedField.DisplayMeasurements")}</span>
        </label>
      </div>`
      : ""

   return `<div class="atw-section atw-advanced atw-accordion atw-accordion-collapsed">
    <a class="atw-accordion-header" data-action="toggle-accordion">
      <i class="fa-solid fa-chevron-down atw-accordion-chevron"></i>
      <span>${localize("PF2EATW.Advanced")}</span>
    </a>
    <div class="atw-accordion-body">
      <label class="atw-row atw-row-toggle">
        <input type="checkbox" data-atw-path="attachable"
               ${automation.attachable ? "checked" : ""}>
        <span>${localize("PF2EATW.Attachable")}</span>
      </label>
      <p class="atw-hint">${localize("PF2EATW.AttachableHint")}</p>
      <div class="atw-row atw-contiguous-row">
        <label class="atw-contiguous-toggle">
          <input type="checkbox" data-atw-path="contiguous.enabled"
                 ${contiguous.enabled ? "checked" : ""}>
          <span>${localize("PF2EATW.Contiguous")}</span>
        </label>
        <input type="number" min="1" step="1" data-atw-path="contiguous.count"
               aria-label="${localize("PF2EATW.Contiguous")}"
               class="atw-contiguous-count" value="${contiguousCount}"
               ${contiguous.enabled ? "" : "disabled"}>
      </div>
      <p class="atw-hint">${localize("PF2EATW.ContiguousHint")}</p>
      <label class="atw-row atw-row-toggle">
        <input type="checkbox" data-atw-path="advanced.enabled"
               ${adv.enabled ? "checked" : ""}>
        <span>${localize("PF2EATW.AdvancedEnabled")}</span>
      </label>
      ${overrideGridHtml}
    </div>
  </div>`
}

export function renderTemplateShapesInline(automation) {
   const ts = automation.templateShape ?? defaultTemplateShape()
   const variants =
      Array.isArray(ts.shapes) && ts.shapes.length
         ? ts.shapes
         : [defaultShapeVariant()]
   const rows = variants
      .map((v, i) => templateShapeRowHtml(v, i, variants.length))
      .join("")
   return `<div class="atw-template-shapes">
    ${rows}
    <a class="atw-template-shape-add" data-action="add-template-shape">
      <i class="fa-solid fa-plus"></i>
      <span>${localize("PF2EATW.TemplateShape.AddVariant")}</span>
    </a>
  </div>`
}

export function templateShapeRowHtml(v, idx, total) {
   const typeOpts = TEMPLATE_SHAPE_TYPE_OPTIONS.map(
      (o) =>
         `<option value="${o.value}" ${o.value === v.type ? "selected" : ""}>${localize(o.label)}</option>`,
   ).join("")
   const showWidth = v.type === "rectangle" || v.type === "line"
   const showInnerR = v.type === "ring"
   const sizeLabel =
      v.type === "rectangle"
         ? "PF2EATW.TemplateShape.Length"
         : "PF2EATW.TemplateShape.Size"
   const removeBtn =
      total > 1
         ? `<a class="atw-template-shape-remove" data-action="remove-template-shape"
          data-tooltip="${localize("PF2EATW.TemplateShape.RemoveVariant")}">
         <i class="fa-solid fa-minus"></i>
       </a>`
         : ""

   return `<div class="atw-template-shape-row" data-index="${idx}">
    <label class="atw-row">
      <span class="atw-row-label">${localize("PF2EATW.TemplateShape.Type")}</span>
      <select class="atw-template-shape-type">${typeOpts}</select>
    </label>
    <label class="atw-row">
      <span class="atw-row-label">${localize(sizeLabel)}</span>
      <input type="number" min="1" step="1" class="atw-template-shape-size"
             value="${Number(v.size ?? 15)}">
    </label>
    ${
       showWidth
          ? `
    <label class="atw-row">
      <span class="atw-row-label">${localize("PF2EATW.TemplateShape.Width")}</span>
      <input type="number" min="1" step="1" class="atw-template-shape-width"
             value="${Number(v.width ?? 5)}">
    </label>`
          : ""
    }
    ${
       showInnerR
          ? `
    <label class="atw-row">
      <span class="atw-row-label">${localize("PF2EATW.TemplateShape.InnerRadius")}</span>
      <input type="number" min="1" step="1" class="atw-template-shape-innerR"
             value="${Number(v.innerRadius ?? 5)}">
    </label>`
          : ""
    }
    ${removeBtn}
  </div>`
}

export function behaviorRowHtml(entry, item = null) {
   const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
   const collapsed = entry.collapsed ? "atw-collapsed" : ""

   const headerOf = (label, iconClass) => `
    <header class="atw-behavior-header">
      <i class="${iconClass} atw-behavior-icon"></i>
      <span class="atw-behavior-name">${label}</span>
      <input type="checkbox" data-atw-bprop="enabled" ${entry.enabled ? "checked" : ""}>
      <a data-action="remove-behavior">
        <i class="fa-solid fa-trash"></i>
      </a>
      <a data-action="toggle-collapse">
        <i class="fa-solid ${entry.collapsed ? "fa-chevron-down" : "fa-chevron-up"}"></i>
      </a>
    </header>`

   if (!def) {
      return `<li class="atw-behavior ${collapsed}" data-id="${entry.id}">
      ${headerOf(`Unknown: ${escapeHTML(entry.type)}`, "fa-solid fa-question-circle")}
    </li>`
   }

   const fieldsHtml = def.fields
      .map((f) => {
         const v = entry.system?.[f.key] ?? f.default
         const hide = f.dependsOn && !checkDependency(entry.system, f.dependsOn)
         return fieldHtml(f, v, hide, entry.system, item)
      })
      .join("")

   return `<li class="atw-behavior ${collapsed}" data-id="${entry.id}">
    ${headerOf(localize(def.label), def.icon)}
    <div class="atw-behavior-fields">${fieldsHtml}</div>
  </li>`
}

export function fieldHtml(
   field,
   value,
   hidden = false,
   systemForShowWhen = null,
   itemContext = null,
) {
   if (field.showWhen && systemForShowWhen) {
      const ref = systemForShowWhen[field.showWhen.field]
      if (ref !== field.showWhen.equals) hidden = true
   }
   const id = `atw-f-${foundry.utils.randomID(6)}`
   const hide = hidden ? 'style="display:none"' : ""

   const tooltipIcon = field.tooltip
      ? ` <i class="fa-solid fa-circle-info atw-tooltip-icon" data-tooltip="${escapeHTML(localize(field.tooltip))}"></i>`
      : ""
   const label = `<label for="${id}">${localize(field.label)}${tooltipIcon}</label>`
   const hint = field.hint
      ? `<p class="atw-field-hint">${localize(field.hint)}</p>`
      : ""
   let input = ""

   switch (field.type) {
      case "text":
         input = `<input id="${id}" type="text" data-atw-sprop="${field.key}"
                 value="${escapeHTML(value ?? "")}"
                 placeholder="${escapeHTML(field.placeholder ? localize(field.placeholder) : "")}">`
         break
      case "expression": {
         const exprPreview = computeExpressionPreview(
            String(value ?? ""),
            itemContext,
         )
         input = `<div class="atw-expression-wrap">
        <input id="${id}" type="text" class="atw-expression-input" data-atw-sprop="${field.key}"
               value="${escapeHTML(String(value ?? ""))}"
               placeholder="${escapeHTML(field.placeholder ? localize(field.placeholder) : "15  or  @actor.system.attributes.classDC.value + 2")}">
        <span class="atw-expression-preview"${exprPreview === "" ? " hidden" : ""}>${escapeHTML(exprPreview)}</span>
      </div>`
         break
      }
      case "expressionWithSuggestions": {
         const exprPreview = computeExpressionPreview(
            String(value ?? ""),
            itemContext,
         )
         const suggestions = Array.isArray(field.suggestions)
            ? field.suggestions
            : []
         const listId = `${id}-datalist`
         const suggestOpts = suggestions
            .map(
               (s) =>
                  `<option value="${escapeHTML(s.value)}">${escapeHTML(localize(s.label))}</option>`,
            )
            .join("")
         input = `<div class="atw-expression-wrap">
        <input id="${id}" type="text" class="atw-expression-input" data-atw-sprop="${field.key}"
               list="${listId}"
               value="${escapeHTML(String(value ?? ""))}"
               placeholder="${escapeHTML(field.placeholder ? localize(field.placeholder) : "10  or  @placer.system.attributes.spellDC.value - 10")}">
        <datalist id="${listId}">${suggestOpts}</datalist>
        <span class="atw-expression-preview"${exprPreview === "" ? " hidden" : ""}>${escapeHTML(exprPreview)}</span>
      </div>`
         break
      }
      case "irwTagList":
         input = renderIrwTagList(field, value)
         break
      case "textarea":
         input = `<textarea id="${id}" data-atw-sprop="${field.key}"
                 rows="${field.rows ?? 4}">${escapeHTML(value ?? "")}</textarea>`
         break
      case "number":
         input = `<input id="${id}" type="number" data-atw-sprop="${field.key}"
                 min="${field.min ?? ""}" max="${field.max ?? ""}"
                 step="${field.step ?? 1}" value="${value ?? ""}">`
         break
      case "range": {
         const initial = Number(value ?? 0)
         const displayPct = field.displayAs === "percent"
         const display = displayPct
            ? `${initial >= 0 ? "+" : ""}${Math.round(initial * 100)}%`
            : String(initial)
         input = `<input id="${id}" type="range" data-atw-sprop="${field.key}"
                 min="${field.min ?? 0}" max="${field.max ?? 1}"
                 step="${field.step ?? 0.1}" value="${initial}"
                 data-display-as="${displayPct ? "percent" : "raw"}">
               <output class="atw-range-out">${display}</output>`
         break
      }
      case "color":
         input = `<input id="${id}" type="color" data-atw-sprop="${field.key}"
                 value="${value ?? "#ffffff"}">`
         break
      case "boolean":
         input = `<input id="${id}" type="checkbox" data-atw-sprop="${field.key}"
                 ${value ? "checked" : ""}>`
         break
      case "select": {
         const opts = resolveOptions(field)
         input =
            `<select id="${id}" data-atw-sprop="${field.key}">` +
            opts
               .map(
                  (o) =>
                     `<option value="${o.value}" ${String(o.value) === String(value) ? "selected" : ""}>` +
                     `${localize(o.label)}</option>`,
               )
               .join("") +
            `</select>`
         break
      }
      case "tagPicker":
         input = renderTagPicker(field, value)
         break
      case "uuidList":
         input = renderUuidList(field, value)
         break
      case "uuidInput":
         input = renderUuidInput(field, value)
         break
      case "tagInput":
         input = renderTagInput(field, value)
         break
      case "conditionPicker":
         input = renderConditionPicker(field, value)
         break
      case "damageList":
         input = renderDamageList(field, value)
         break
      case "tileEditor":
         input = renderTileEditor(field, value)
         break
      case "tileList":
         input = renderTileList(field, value)
         break
      case "soundEditor":
         input = renderSoundEditor(field, value)
         break
      case "lightEditor":
         input = renderLightEditor(field, value)
         break
      case "filePicker":
         input = renderFilePicker(field, value)
         break
      case "diceFormula":
         input = renderDiceFormula(field, value)
         break
      case "duration":
         input = renderDuration(field, value)
         break
      case "extraRollOptions":
         input = renderExtraRollOptions(field, value)
         break
      case "ruleElementList":
         input = renderRuleElementList(field, value)
         break
      case "consequenceList":
         input = renderConsequenceList(field, value, itemContext)
         break
      case "saveConsequenceList":
         input = renderSaveConsequenceList(field, value, itemContext)
         break
      case "choiceList":
         input = renderChoiceList(field, value)
         break
   }

   if (field.accordion) {
      return `<div class="atw-field atw-accordion atw-accordion-collapsed"
                 data-field-key="${field.key}" ${hide}>
      <a class="atw-accordion-header" data-action="toggle-accordion">
        <i class="fa-solid fa-chevron-down atw-accordion-chevron"></i>
        <span>${localize(field.label)}</span>
      </a>
      <div class="atw-accordion-body">${hint}${input}</div>
    </div>`
   }

   if (field.type === "boolean") {
      return `<div class="atw-field atw-field-inline" data-field-key="${field.key}" ${hide}>
      <label class="atw-inline-checkbox">${input}<span>${localize(field.label)}${tooltipIcon}</span></label>
      ${hint}
    </div>`
   }
   if (field.type === "extraRollOptions" || field.type === "duration") {
      return `<div class="atw-field" data-field-key="${field.key}" ${hide}>${input}${hint}</div>`
   }
   return `<div class="atw-field" data-field-key="${field.key}" ${hide}>${label}${input}${hint}</div>`
}
