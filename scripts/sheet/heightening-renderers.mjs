import {
   DAMAGE_CATEGORY_OPTIONS,
   DAMAGE_DIE_OPTIONS,
   GRANT_TRIGGER_OPTIONS,
   TARGET_OPTIONS,
   TIME_UNITS,
   TEMPLATE_SHAPE_TYPE_OPTIONS,
   BEHAVIOR_CATALOG,
   COMMON_DC_SUGGESTIONS,
   defaultTileAttachment,
   getConditionTypeOptions,
   getDamageTypeOptions,
   normalizeTileAttachments,
   resolveOptions,
} from "../data.mjs"
import { escapeHTML, localize } from "../common/html.mjs"
import {
   lookupConditionDoc,
   damageRowHtml,
   renderFilePicker,
   renderLightEditor,
   renderSoundEditor,
   renderUuidInput,
   ruleElementRowHtml,
   restrictionRowHtml,
   tileListRowHtml,
} from "./input-renderers.mjs"
import {
   choiceRowHtml,
   defaultChoice,
} from "./choice-renderers.mjs"
import {
   consequenceRowHtml,
   defaultConsequence,
   defaultSaveConsequence,
   saveConsequenceRowHtml,
} from "./consequence-renderers.mjs"
import {
   availableHeightenActions,
   coerceHeightenActionsForMode,
   normalizeHeightenRules,
} from "../heightening.mjs"

export function renderHeightenList(entry) {
   return renderHeightenListForAutomation(entry, null)
}

export function renderHeightenListForAutomation(entry, automation = null) {
   const rules = normalizeHeightenRules(entry)
   const rows = rules
      .map((rule, index) => heightenRuleHtml(entry, rule, index, automation))
      .join("")
   return `<div class="atw-heighten-list">
      ${rows}
      <a data-action="add-heighten-rule" class="atw-heighten-add">
         <i class="fa-solid fa-plus"></i>
         <span>Heightened</span>
      </a>
   </div>`
}

export function renderExpirationHeightenList(automation) {
   const rules = normalizeHeightenRules(automation?.expiration ?? {})
   const rows = rules
      .map((rule, index) => expirationHeightenRuleHtml(rule, index))
      .join("")
   const collapsed = rules.length ? "" : "atw-accordion-collapsed"
   const chevron = rules.length ? "fa-chevron-up" : "fa-chevron-down"
   return `<div class="atw-expiration-heighten atw-accordion ${collapsed}">
      <div class="atw-accordion-header" data-action="toggle-expiration-heighten">
         <i class="fa-solid ${chevron} atw-accordion-chevron"></i>
         <span>Heighten</span>
      </div>
      <div class="atw-accordion-body">
         ${rows}
         <a data-action="add-expiration-heighten-rule" class="atw-heighten-add">
            <i class="fa-solid fa-plus"></i>
            <span>Heightened</span>
         </a>
      </div>
   </div>`
}

function expirationHeightenRuleHtml(rule, index) {
   const collapsed = rule.collapsed !== false ? "atw-accordion-collapsed" : ""
   const sourceOptions = [
      { value: "item", label: "Item" },
      { value: "placer", label: "Placer" },
   ]
   const modeOptions = [
      { value: "every", label: "Every N levels" },
      { value: "on", label: "On N level" },
   ]
   const action = Array.isArray(rule.actions)
      ? rule.actions.find((candidate) => candidate?.type === "setExpiration") ??
        rule.actions[0] ??
        {}
      : {}
   const amount = Number.isFinite(Number(action.amount))
      ? Math.max(0, Number(action.amount))
      : 1
   const unitOptions = [
      ...["rounds", "minutes", "hours", "days"].map((value) => ({
         value,
         label: TIME_UNITS[value]?.label ?? value,
      })),
      { value: "unlimited", label: "PF2EATW.Unit.Unlimited" },
   ]
   return `<div class="atw-expiration-heighten-rule atw-accordion ${collapsed}" data-expiration-heighten-index="${index}">
      <div class="atw-accordion-header" data-action="toggle-expiration-heighten-rule">
         <i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"} atw-accordion-chevron"></i>
         <span>${escapeHTML(heightenRuleTitle(rule))}</span>
         <a class="atw-heighten-remove" data-action="remove-expiration-heighten-rule">
            <i class="fa-solid fa-trash"></i>
         </a>
      </div>
      <div class="atw-accordion-body">
         <div class="atw-heighten-condition">
            ${selectValue(modeOptions, rule.mode ?? "every", "atw-expiration-heighten-mode")}
            <span>${rule.mode === "on" ? "On" : "Every"}</span>
            <input type="number" min="1" step="1" class="atw-expiration-heighten-value" value="${Number(rule.value) || 1}">
            <span>${rule.mode === "on" ? "level of" : "levels of"}</span>
            ${selectValue(sourceOptions, rule.source ?? "item", "atw-expiration-heighten-source")}
         </div>
         <div class="atw-heighten-action atw-expiration-heighten-action">
            <div class="atw-heighten-action-head">
               <strong>Modify time</strong>
            </div>
            <div class="atw-heighten-action-body atw-heighten-expiration-editor">
               <input type="number" min="0" step="1" class="atw-expiration-heighten-amount" value="${amount}">
               ${selectValue(unitOptions, action.unit ?? "minutes", "atw-expiration-heighten-unit")}
            </div>
         </div>
      </div>
   </div>`
}

function heightenRuleHtml(entry, rule, index, automation = null) {
   const collapsed = rule.collapsed !== false ? "atw-accordion-collapsed" : ""
   const modeOptions = [
      { value: "every", label: "Every N levels" },
      { value: "on", label: "On N level" },
   ]
      .map(
         (option) =>
            `<option value="${option.value}" ${rule.mode === option.value ? "selected" : ""}>${option.label}</option>`,
      )
      .join("")
   const sourceOptions = [
      { value: "item", label: "Item" },
      { value: "placer", label: "Placer" },
   ]
      .map(
         (option) =>
            `<option value="${option.value}" ${rule.source === option.value ? "selected" : ""}>${option.label}</option>`,
      )
      .join("")
   const prefix = rule.mode === "on" ? "On" : "Every"
   const middle = rule.mode === "on" ? "level of" : "levels of"
   const actions = coerceHeightenActionsForMode(
      entry,
      Array.isArray(rule.actions) ? rule.actions : [],
      rule.mode ?? "every",
   )
   const title = heightenRuleTitle(rule)
   return `<div class="atw-heighten-rule atw-accordion ${collapsed}" data-heighten-index="${index}">
      <div class="atw-accordion-header" data-action="toggle-heighten-rule">
         <i class="fa-solid ${collapsed ? "fa-chevron-down" : "fa-chevron-up"} atw-accordion-chevron"></i>
         <span>${escapeHTML(title)}</span>
         <a class="atw-heighten-remove" data-action="remove-heighten-rule">
            <i class="fa-solid fa-trash"></i>
         </a>
      </div>
      <div class="atw-accordion-body">
         <div class="atw-heighten-condition">
            <select class="atw-heighten-mode">${modeOptions}</select>
            <span>${prefix}</span>
            <input type="number" min="1" step="1" class="atw-heighten-value" value="${Number(rule.value) || 1}">
            <span>${middle}</span>
            <select class="atw-heighten-source">${sourceOptions}</select>
         </div>
         <div class="atw-heighten-actions">
            ${actions.map((action, actionIndex) => heightenActionHtml(entry, action, actionIndex, rule, automation)).join("")}
            <div class="atw-heighten-action-add-row">
               <select class="atw-heighten-action-picker">${heightenActionOptions(entry, "", rule.mode)}</select>
               <a data-action="add-heighten-action" class="atw-heighten-action-add">
                  <i class="fa-solid fa-plus"></i>
                  <span>Add modifier</span>
               </a>
            </div>
         </div>
      </div>
   </div>`
}

function heightenRuleTitle(rule) {
   const value = Math.max(1, Number(rule.value) || 1)
   if (rule.mode === "on") return `Heightened (On ${ordinal(value)} level)`
   return `Heightened (Every ${value} ${value === 1 ? "level" : "levels"})`
}

function ordinal(value) {
   const n = Number(value) || 0
   const suffix =
      n % 100 >= 11 && n % 100 <= 13
         ? "th"
         : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")
   return `${n}${suffix}`
}

function heightenActionOptions(entry, selected = "", mode = "every") {
   const options = availableHeightenActions(entry, mode)
   return options
      .map(
         (option) =>
            `<option value="${option.value}" ${selected === option.value ? "selected" : ""}>${escapeHTML(option.label)}</option>`,
      )
      .join("")
}

function heightenActionHtml(entry, action, index, rule, automation = null) {
   return `<div class="atw-heighten-action" data-heighten-action-index="${index}">
      <div class="atw-heighten-action-head">
         <select class="atw-heighten-action-type">${heightenActionOptions(entry, action.type, rule?.mode ?? "every")}</select>
         <a data-action="remove-heighten-action" class="atw-heighten-action-remove">
            <i class="fa-solid fa-minus"></i>
         </a>
      </div>
      <div class="atw-heighten-action-body">
         ${heightenActionBodyHtml(entry, action, automation)}
      </div>
   </div>`
}

function heightenActionBodyHtml(entry, action, automation = null) {
   switch (action.type) {
      case "increaseDamage":
      case "decreaseDamage":
         return `${fieldSelect(entry, action.fieldKey, "damageList")}
            <label class="atw-heighten-inline">Dice
               <input type="number" min="0" step="1" class="atw-heighten-action-amount" value="${Number(action.amount) || 0}">
            </label>`
      case "addDamage":
         return `${fieldSelect(entry, action.fieldKey, "damageList")}
            ${heightenDamageHtml(action.damage ?? {})}`
      case "setDamageType":
         return `${fieldSelect(entry, action.fieldKey, "damageList")}
            ${damageEntrySelect(entry, action)}
            ${selectValue(getDamageTypeOptions(), action.damageType ?? "fire", "atw-heighten-damage-type")}`
      case "setSavingThrow":
         return savingThrowActionEditor(action)
      case "setBasicDamage":
         return basicDamageActionEditor(action)
      case "increaseBasicDamage":
         return `<label class="atw-heighten-inline">Dice
            <input type="number" min="0" step="1" class="atw-heighten-action-amount" value="${Number(action.amount) || 0}">
         </label>`
      case "setField":
         return `${editableFieldSelect(entry, action.fieldKey)}
            ${fieldValueEditor(entry, action)}`
      case "increaseHealing":
      case "decreaseHealing":
         return `<label class="atw-heighten-inline">Amount
            <input type="number" min="0" step="1" class="atw-heighten-action-amount" value="${Number(action.amount) || 0}">
         </label>`
      case "setHealingType":
         return `${selectValue(
            [
               { value: "untyped", label: "Untyped" },
               { value: "vitality", label: "Vitality" },
               { value: "void", label: "Void" },
            ],
            action.value ?? "untyped",
            "atw-heighten-action-value",
         )}`
      case "setMovementCost":
         return movementCostEditor(action)
      case "setDuration":
         return `${fieldSelect(entry, action.fieldKey, "duration")}
            ${durationEditor(action.duration ?? {})}`
      case "setCondition":
         return `${fieldSelect(entry, action.fieldKey, "conditionPicker")}
            ${conditionEditor(action.condition ?? {})}`
      case "setDiceFormula":
         return `${fieldSelect(entry, action.fieldKey, "diceFormula")}
            ${diceFormulaEditor(action.dice ?? {})}`
      case "addExtraRollOption":
      case "removeExtraRollOption":
         return extraRollOptionEditor(entry, action)
      case "addTagValue":
      case "removeTagValue":
         return tagValueEditor(entry, action)
      case "setTile":
         return tileActionEditor(entry, action)
      case "setSound":
         return `${fieldSelect(entry, action.fieldKey, "soundEditor")}
            ${sceneObjectEditor("sound", action)}`
      case "setLight":
         return `${fieldSelect(entry, action.fieldKey, "lightEditor")}
            ${sceneObjectEditor("light", action)}`
      case "setRuleElement":
         return ruleElementActionEditor(entry, action)
      case "addRestriction":
      case "removeRestriction":
         return restrictionActionEditor(entry, action)
      case "addChoice":
      case "removeChoice":
         return choiceActionEditor(entry, action)
      case "addConsequence":
      case "removeConsequence":
      case "modifyConsequence":
         return consequenceActionEditor(entry, action)
      case "increaseField":
      case "decreaseField":
         return `${numericFieldSelect(entry, action.fieldKey)}
            <label class="atw-heighten-inline">Amount
               <input type="number" min="0" step="0.05" class="atw-heighten-action-amount" value="${Number(action.amount) || 0}">
            </label>`
      case "addIWR":
      case "removeIWR":
      case "increaseIWR":
      case "decreaseIWR":
         return iwrEditor(entry, action)
      case "addTrigger":
      case "removeTrigger":
         return selectValue(GRANT_TRIGGER_OPTIONS, action.value, "atw-heighten-action-value")
      case "addTarget":
      case "removeTarget":
         return selectValue(TARGET_OPTIONS, action.value, "atw-heighten-action-value")
      case "addRollOption":
      case "removeRollOption":
      case "addRollOptionExclude":
      case "removeRollOptionExclude":
         return `<input type="text" class="atw-heighten-action-value" value="${escapeHTML(action.value ?? "")}" placeholder="comma-separated roll options">`
      case "addIgnoredBy":
      case "removeIgnoredBy":
         return `<input type="text" class="atw-heighten-action-value" value="${escapeHTML(action.value ?? "")}" placeholder="Actor or item UUID">`
      case "increaseTemplateSize":
      case "decreaseTemplateSize":
         return `<label class="atw-heighten-inline">Feet
            <input type="number" min="0" step="1" class="atw-heighten-action-amount" value="${Number(action.amount) || 0}">
         </label>`
      case "setTemplateShape":
         return `<div class="atw-heighten-shape-replace">
            <span>Replace</span>
            ${definedShapeSelect(automation, action.shapeIndex)}
            <span class="atw-heighten-defined-shape-size">${escapeHTML(definedShapeSize(automation, action.shapeIndex))}</span>
            <span class="atw-heighten-shape-arrow">-&gt;</span>
            ${heightenShapeHtml(action.shape ?? {}, { compact: true })}
         </div>`
      case "addTemplateShape":
         return heightenShapeHtml(action.shape ?? {})
      default:
         return ""
   }
}

function readableActionLabel(value) {
   return String(value ?? "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (letter) => letter.toUpperCase())
}

function editableFieldSelect(entry, selected) {
   const fields = behaviorFields(entry).filter(isSimpleEditableField)
   if (fields.length <= 1) {
      return `<input type="hidden" class="atw-heighten-action-field" value="${escapeHTML(fields[0]?.key ?? selected ?? "")}">`
   }
   return `<select class="atw-heighten-action-field">
      ${fields
         .map(
            (field) =>
               `<option value="${escapeHTML(field.key)}" ${field.key === selected ? "selected" : ""}>${escapeHTML(localize(field.label))}</option>`,
         )
         .join("")}
   </select>`
}

function numericFieldSelect(entry, selected) {
   const fields = behaviorFields(entry).filter(isNumericField)
   if (fields.length <= 1) {
      return `<input type="hidden" class="atw-heighten-action-field" value="${escapeHTML(fields[0]?.key ?? selected ?? "")}">`
   }
   return `<select class="atw-heighten-action-field">
      ${fields
         .map(
            (field) =>
               `<option value="${escapeHTML(field.key)}" ${field.key === selected ? "selected" : ""}>${escapeHTML(localize(field.label))}</option>`,
         )
         .join("")}
   </select>`
}

function isNumericField(field) {
   return Boolean(
      field?.key &&
         (field.type === "number" || field.type === "range"),
   )
}

function isSimpleEditableField(field) {
   if (["rollOptions", "rollOptionsExclude"].includes(field?.key)) return false
   return Boolean(
      field?.key &&
         [
            "text",
            "textarea",
            "uuidInput",
            "filePicker",
            "expressionWithSuggestions",
            "select",
            "boolean",
            "number",
            "range",
            "color",
         ].includes(field.type),
   )
}

function fieldValueEditor(entry, action) {
   const field = behaviorFields(entry).find((candidate) => candidate.key === action.fieldKey)
   const value = action.value ?? ""
   if (!field) {
      return `<span class="atw-heighten-note">No editable field selected.</span>`
   }
   if (field.type === "select") {
      const options = resolveOptions(field)
      if (Array.isArray(options)) {
         return selectValue(options, value || field.default, "atw-heighten-action-value")
      }
   }
   if (field.type === "boolean") {
      return selectValue(
         [
            { value: "true", label: "True" },
            { value: "false", label: "False" },
         ],
         String(value || field.default || false),
         "atw-heighten-action-value",
      )
   }
   if (isNumericField(field)) {
      if (field.type === "range") {
         const min = field.min ?? 0
         const max = field.max ?? 1
         const step = field.step ?? 0.05
         const current = value !== "" && value !== undefined ? value : field.default ?? min
         return `<div class="atw-heighten-field-editor atw-heighten-range-editor">
            <input type="range" min="${escapeHTML(min)}" max="${escapeHTML(max)}" step="${escapeHTML(step)}" class="atw-heighten-action-value atw-heighten-range-value" value="${escapeHTML(current)}">
            <output>${escapeHTML(current)}</output>
         </div>`
      }
      return `<input type="number" step="${escapeHTML(field.step ?? 1)}" class="atw-heighten-action-value" value="${escapeHTML(value)}">`
   }
   if (field.type === "color") {
      return `<input type="color" class="atw-heighten-action-value" value="${escapeHTML(value || field.default || "#ffffff")}">`
   }
   if (field.type === "textarea") {
      return `<textarea class="atw-heighten-action-value" rows="3" placeholder="New text">${escapeHTML(value)}</textarea>`
   }
   if (field.type === "uuidInput") {
      return `<div class="atw-heighten-field-editor atw-heighten-uuid-editor">
         ${renderUuidInput({ ...field, key: "heightenUuid" }, value)}
      </div>`
   }
   if (field.type === "filePicker") {
      return `<div class="atw-heighten-field-editor atw-heighten-file-editor">
         ${renderFilePicker({ ...field, key: "heightenFile" }, value)}
      </div>`
   }
   if (["text", "expressionWithSuggestions"].includes(field.type)) {
      return `<input type="text" class="atw-heighten-action-value" value="${escapeHTML(value)}">`
   }
   return `<span class="atw-heighten-note">Use a specific modifier for this field.</span>`
}

function movementCostEditor(action) {
   const preset = ["difficult", "greaterDifficult", "custom"].includes(action.preset)
      ? action.preset
      : "difficult"
   const options = [
      { value: "custom", label: "Custom multiplier" },
      { value: "difficult", label: "Difficult" },
      { value: "greaterDifficult", label: "Greater Difficult" },
   ]
   return `<div class="atw-heighten-movement-cost">
      ${selectValue(options, preset, "atw-heighten-movement-preset")}
      ${
         preset === "custom"
            ? `<label class="atw-heighten-inline">Multiplier
                  <input type="number" min="1" step="0.5" class="atw-heighten-movement-custom" value="${Math.max(1, Number(action.customCost) || 2)}">
               </label>`
            : ""
      }
   </div>`
}

function durationEditor(duration) {
   const current = duration && typeof duration === "object" ? duration : {}
   const amount = Math.max(1, Number(current.amount) || 1)
   const unit = current.unit ?? "rounds"
   const unitOptions = ["rounds", "minutes", "hours", "days"].map((value) => ({
      value,
      label: TIME_UNITS[value]?.label ?? value,
   }))
   return `<div class="atw-heighten-duration">
      <input type="number" min="1" step="1" class="atw-heighten-duration-amount" value="${amount}">
      ${selectValue(unitOptions, unit, "atw-heighten-duration-unit")}
   </div>`
}

function conditionEditor(condition) {
   const current = condition && typeof condition === "object" ? condition : {}
   const slug = current.slug ?? "frightened"
   const doc = lookupConditionDoc(slug)
   const img = doc?.img ?? "icons/svg/skull.svg"
   const uuid = doc?.uuid ?? ""
   const isValued = doc?.system?.value?.isValued ?? false
   const valueInput = isValued
      ? `<label class="atw-heighten-inline">Value
            <input type="number" min="1" step="1" class="atw-heighten-condition-value" value="${Math.max(1, Number(current.value) || 1)}">
         </label>`
      : ""
   return `<div class="atw-heighten-condition-editor">
      <a class="atw-condition-icon" data-uuid="${escapeHTML(uuid)}">
         <img src="${escapeHTML(img)}" alt="">
      </a>
      ${selectValue(getConditionTypeOptions(), slug, "atw-heighten-condition-slug")}
      ${valueInput}
   </div>`
}

function diceFormulaEditor(dice) {
   const current = dice && typeof dice === "object" ? dice : {}
   return `<div class="atw-heighten-dice-formula">
      <input type="number" min="1" step="1" class="atw-heighten-dice-count" value="${Math.max(1, Number(current.diceCount) || 1)}">
      <span>d</span>
      <input type="number" min="2" step="1" class="atw-heighten-dice-size" value="${Math.max(2, Number(current.dieSize) || 20)}">
   </div>`
}

function extraRollOptionEditor(entry, action) {
   const fieldMarkup = fieldSelect(entry, action.fieldKey, "extraRollOptions")
   if (action.type === "removeExtraRollOption") {
      const options = extraRollOptionChoices(entry, action.fieldKey)
      return `<div class="atw-heighten-extra-roll-option-editor">
         ${fieldMarkup}
         ${selectValue(options, action.value ?? options[0]?.value ?? "", "atw-heighten-extra-roll-option")}
      </div>`
   }
   return `<div class="atw-heighten-extra-roll-option-editor">
      ${fieldMarkup}
      <input type="text" class="atw-heighten-extra-roll-option" value="${escapeHTML(action.value ?? "")}" placeholder="trait:fire">
   </div>`
}

function savingThrowActionEditor(action) {
   const listId = `atw-heighten-save-dc-${escapeHTML(action.id ?? foundry.utils.randomID())}`
   const suggestions = COMMON_DC_SUGGESTIONS.map(
      (suggestion) =>
         `<option value="${escapeHTML(suggestion.value)}">${escapeHTML(localize(suggestion.label))}</option>`,
   ).join("")
   return `<div class="atw-heighten-saving-throw">
      ${selectValue(
         [
            { value: "fortitude", label: "Fortitude" },
            { value: "reflex", label: "Reflex" },
            { value: "will", label: "Will" },
         ],
         action.save ?? "reflex",
         "atw-heighten-saving-save",
      )}
      <div class="atw-expression-wrap">
         <input type="text"
                class="atw-expression-input atw-heighten-saving-dc"
                list="${listId}"
                value="${escapeHTML(action.dc ?? "15")}"
                placeholder="15 or @placer.system.attributes.spellDC.value">
         <datalist id="${listId}">${suggestions}</datalist>
      </div>
   </div>`
}

function basicDamageActionEditor(action) {
   const rows = Array.isArray(action.damages) && action.damages.length
      ? action.damages
      : [{ diceCount: 1, dieSize: "d6", damageType: "fire", category: "normal" }]
   return `<div class="atw-heighten-basic-damage-list atw-damage-list">
      ${rows.map((row, index) => damageRowHtml(row, index)).join("")}
      <a data-action="add-damage" class="atw-damage-add">
         <i class="fa-solid fa-plus"></i>
         <span>Add damage</span>
      </a>
   </div>`
}

function extraRollOptionChoices(entry, fieldKey) {
   const current = splitValues(entry?.system?.[fieldKey]?.value ?? entry?.system?.[fieldKey])
   if (!current.length) return [{ value: "", label: "None defined", disabled: true }]
   return current.map((value) => ({ value, label: value }))
}

function splitValues(value) {
   if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean)
   return String(value ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
}

function tagValueEditor(entry, action) {
   const fields = behaviorFields(entry).filter(isGenericTagField)
   const selectedField = fields.find((field) => field.key === action.fieldKey) ?? fields[0]
   const fieldMarkup = fields.length <= 1
      ? `<input type="hidden" class="atw-heighten-action-field" value="${escapeHTML(selectedField?.key ?? action.fieldKey ?? "")}">`
      : `<select class="atw-heighten-action-field">
            ${fields
               .map(
                  (field) =>
                     `<option value="${escapeHTML(field.key)}" ${field.key === selectedField?.key ? "selected" : ""}>${escapeHTML(localize(field.label))}</option>`,
               )
               .join("")}
         </select>`
   const options = tagValueOptions(entry, selectedField, action)
   return `<div class="atw-heighten-tag-editor">
      ${fieldMarkup}
      ${selectValue(options, action.value ?? options[0]?.value ?? "", "atw-heighten-tag-value")}
   </div>`
}

function tagValueOptions(entry, field, action) {
   if (!field) return [{ value: "", label: "None defined", disabled: true }]
   if (action.type === "removeTagValue") {
      const current = Array.isArray(entry?.system?.[field.key]) ? entry.system[field.key] : []
      if (!current.length) return [{ value: "", label: "None defined", disabled: true }]
      const labels = new Map(resolveOptions(field).map((option) => [String(option.value), option.label]))
      return current.map((value) => ({
         value,
         label: labels.get(String(value)) ?? String(value),
      }))
   }
   return resolveOptions(field)
}

function tileActionEditor(entry, action) {
   const fieldKey =
      action.fieldKey ??
      behaviorFields(entry).find((field) => field.type === "tileList")?.key ??
      "tiles"
   const rows = normalizeTileAttachments(entry?.system?.[fieldKey])
   const choices = rows.length ? rows : [action.tileAttachment ?? defaultTileAttachment()]
   const selectedIndex = Math.max(0, Number(action.tileIndex) || 0)
   const selected = choices[selectedIndex] ?? choices[0] ?? defaultTileAttachment()
   const actionRow = action.tileAttachment && typeof action.tileAttachment === "object"
      ? {
           ...selected,
           ...action.tileAttachment,
           tile: action.tileAttachment.tile ?? selected.tile ?? {},
        }
      : selected
   return `<div class="atw-heighten-tile-action">
      <div class="atw-heighten-tile-selector">
         ${fieldSelect(entry, fieldKey, "tileList")}
         ${selectValue(tileAttachmentOptions(choices), selectedIndex, "atw-heighten-tile-index")}
      </div>
      <div class="atw-heighten-tile-editor">
         ${tileListRowHtml(actionRow, 0, false)}
      </div>
   </div>`
}

function tileAttachmentOptions(rows) {
   return rows.map((row, index) => ({
      value: index,
      label: tileAttachmentLabel(row, index),
   }))
}

function tileAttachmentLabel(row, index) {
   const src = row?.tile?.texture?.src
   const label = src ? src.split(/[/\\]/).pop() : "Tile"
   return `${index + 1}. ${label}`
}

function sceneObjectEditor(kind, action) {
   const field = {
      key: action.fieldKey ?? kind,
      label: kind,
   }
   if (kind === "sound") {
      return `<div class="atw-heighten-scene-object-editor atw-heighten-sound-config">
         ${renderSoundEditor(field, action.sound ?? {})}
      </div>`
   }
   return `<div class="atw-heighten-scene-object-editor atw-heighten-light-config">
      ${renderLightEditor(field, action.light ?? {})}
   </div>`
}

function ruleElementActionEditor(entry, action) {
   const fieldKey =
      action.fieldKey ??
      behaviorFields(entry).find((field) => field.type === "ruleElementList")?.key ??
      "rules"
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   const selectedIndex = Math.max(0, Number(action.ruleIndex) || 0)
   const value = action.rule ?? rows[selectedIndex] ?? '{\n  "key": ""\n}'
   return `<div class="atw-heighten-rule-element-editor">
      <div class="atw-heighten-rule-element-selector">
         ${fieldSelect(entry, fieldKey, "ruleElementList")}
         ${selectValue(ruleElementOptions(rows), selectedIndex, "atw-heighten-rule-index")}
      </div>
      ${ruleElementRowHtml(value, 0)}
   </div>`
}

function ruleElementOptions(rows) {
   if (!rows.length) return [{ value: 0, label: "New Rule Element" }]
   return rows.map((row, index) => ({
      value: index,
      label: ruleElementLabel(row, index),
   }))
}

function ruleElementLabel(row, index) {
   let key = ""
   if (row && typeof row === "object") {
      key = row.key ?? ""
   } else {
      try {
         key = JSON.parse(row)?.key ?? ""
      } catch (_e) {
         key = ""
      }
   }
   return `${index + 1}. ${key || "Rule Element"}`
}

function isGenericTagField(field) {
   if (!field?.key || field.type !== "tagPicker") return false
   if (["triggers", "target"].includes(field.key)) return false
   return !isIwrField(field)
}

function choiceActionEditor(entry, action) {
   const fieldMarkup = fieldSelect(entry, action.fieldKey, "choiceList")
   if (action.type === "removeChoice") {
      const options = choiceOptions(entry, action.fieldKey)
      return `<div class="atw-heighten-choice-remove">
         ${fieldMarkup}
         ${selectValue(options, action.choiceIndex ?? 0, "atw-heighten-choice-index")}
      </div>`
   }
   return `<div class="atw-heighten-choice-editor">
      ${fieldMarkup}
      ${choiceRowHtml(action.choice ?? defaultChoice(), 0)}
   </div>`
}

function consequenceActionEditor(entry, action) {
   const fields = consequenceFields(entry)
   const selectedField =
      fields.find((field) => field.key === action.fieldKey) ?? fields[0]
   const fieldMarkup = consequenceFieldSelect(fields, selectedField?.key ?? action.fieldKey)
   if (action.type === "removeConsequence") {
      const options = consequenceOptions(entry, selectedField?.key)
      return `<div class="atw-heighten-consequence-remove">
         ${fieldMarkup}
         ${selectValue(options, action.consequenceIndex ?? 0, "atw-heighten-consequence-index")}
      </div>`
   }
   const value =
      action.consequence ??
      currentConsequence(entry, selectedField?.key, action.consequenceIndex) ??
      defaultConsequenceForField(selectedField)
   const row = selectedField?.type === "saveConsequenceList"
      ? saveConsequenceRowHtml(value, 0, null)
      : consequenceRowHtml(value, 0, null)
   const selection =
      action.type === "modifyConsequence"
         ? selectValue(
              consequenceOptions(entry, selectedField?.key),
              action.consequenceIndex ?? 0,
              "atw-heighten-consequence-index",
           )
         : ""
   return `<div class="atw-heighten-consequence-editor" data-consequence-field-type="${escapeHTML(selectedField?.type ?? "consequenceList")}">
      <div class="atw-heighten-consequence-selector">
         ${fieldMarkup}
         ${selection}
      </div>
      ${row}
   </div>`
}

function restrictionActionEditor(entry, action) {
   const fieldKey =
      action.fieldKey ??
      behaviorFields(entry).find((field) => field.type === "restrictionList")?.key ??
      "restrictions"
   if (action.type === "removeRestriction") {
      return `<div class="atw-heighten-restriction-remove">
         ${fieldSelect(entry, fieldKey, "restrictionList")}
         ${selectValue(restrictionOptions(entry, fieldKey), action.restrictionIndex ?? 0, "atw-heighten-restriction-index")}
      </div>`
   }
   return `<div class="atw-heighten-restriction-editor">
      ${fieldSelect(entry, fieldKey, "restrictionList")}
      ${restrictionRowHtml(action.restriction ?? {}, 0, false)}
   </div>`
}

function restrictionOptions(entry, fieldKey) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   if (!rows.length) return [{ value: 0, label: "None defined", disabled: true }]
   return rows.map((row, index) => ({
      value: index,
      label: restrictionLabel(row, index),
   }))
}

function restrictionLabel(row, index) {
   if (row?.kind === "skill") {
      const skill = row.skill === "lore" ? row.lore || "lore" : row.skill || "skill"
      return `${index + 1}. ${skill}`
   }
   const filter = row?.slug || row?.rollOptions || ""
   return `${index + 1}. ${row?.kind || "restriction"}${filter ? ` - ${filter}` : ""}`
}

function consequenceFieldSelect(fields, selected) {
   if (fields.length <= 1) {
      return `<input type="hidden" class="atw-heighten-action-field" value="${escapeHTML(fields[0]?.key ?? selected ?? "")}">`
   }
   return `<select class="atw-heighten-action-field">
      ${fields
         .map(
            (field) =>
               `<option value="${escapeHTML(field.key)}" ${field.key === selected ? "selected" : ""}>${escapeHTML(localize(field.label))}</option>`,
         )
         .join("")}
   </select>`
}

function consequenceFields(entry) {
   return behaviorFields(entry).filter(
      (field) => field.type === "consequenceList" || field.type === "saveConsequenceList",
   )
}

function defaultConsequenceForField(field) {
   return field?.type === "saveConsequenceList"
      ? defaultSaveConsequence()
      : defaultConsequence()
}

function choiceOptions(entry, fieldKey) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   if (!rows.length) return [{ value: 0, label: "None defined", disabled: true }]
   return rows.map((row, index) => ({
      value: index,
      label: choiceLabel(row, index),
   }))
}

function consequenceOptions(entry, fieldKey) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   if (!rows.length) return [{ value: 0, label: "None defined", disabled: true }]
   return rows.map((row, index) => ({
      value: index,
      label: consequenceLabel(row, index),
   }))
}

function currentConsequence(entry, fieldKey, index) {
   const rows = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   return rows[Math.max(0, Number(index) || 0)] ?? null
}

function choiceLabel(row, index) {
   const label =
      row?.kind === "skill"
         ? row.skill === "lore"
            ? row.lore || "Lore"
            : row.skill || "Skill"
         : row?.save || "Save"
   return `${index + 1}. ${label}`
}

function consequenceLabel(row, index) {
   const type = readableActionLabel(row?.type ?? "consequence")
   const outcome = row?.outcome ? `${outcomeDisplay(row.outcome)} - ` : ""
   const range = Number.isFinite(Number(row?.min)) || Number.isFinite(Number(row?.max))
      ? `${Number(row?.min) || 0}-${Number(row?.max) || 0} - `
      : ""
   return `${index + 1}. ${outcome}${range}${type}`
}

function outcomeDisplay(value) {
   return (
      {
         criticalSuccess: "Critical Success",
         success: "Success",
         failure: "Failure",
         criticalFailure: "Critical Failure",
      }[value] ?? readableActionLabel(value)
   )
}

function damageEntrySelect(entry, action) {
   const key = action.fieldKey ?? "damages"
   const rows = Array.isArray(entry.system?.[key]) ? entry.system[key] : []
   const choices = rows.length ? rows : [{ diceCount: 1, dieSize: "d6", damageType: "fire" }]
   return `<select class="atw-heighten-damage-index">
      ${choices
         .map((row, index) => {
            const label = `${index + 1}. ${Number(row?.diceCount ?? 0) || 0}${row?.dieSize ?? ""} ${row?.damageType ?? "damage"}`
            return `<option value="${index}" ${Number(action.damageIndex ?? 0) === index ? "selected" : ""}>${escapeHTML(label)}</option>`
         })
         .join("")}
   </select>`
}

function definedShapeSelect(automation, selectedIndex) {
   const shapes = Array.isArray(automation?.templateShape?.shapes)
      ? automation.templateShape.shapes
      : []
   const rows = shapes.length ? shapes : [{ type: "circle", size: 15 }]
   return `<label class="atw-heighten-inline">Defined shape
      <select class="atw-heighten-shape-index">
         ${rows
            .map((shape, index) => {
               const label = shapeName(shape)
               return `<option value="${index}" ${Number(selectedIndex ?? 0) === index ? "selected" : ""}>${escapeHTML(label)}</option>`
            })
            .join("")}
      </select>
   </label>`
}

function shapeName(shape) {
   const type = shape?.type === "circle" ? "Burst" : String(shape?.type ?? "Shape")
   return `${type.charAt(0).toUpperCase()}${type.slice(1)}`
}

function definedShapeSize(automation, selectedIndex) {
   const shapes = Array.isArray(automation?.templateShape?.shapes)
      ? automation.templateShape.shapes
      : []
   const rows = shapes.length ? shapes : [{ type: "circle", size: 15 }]
   const shape = rows[Math.max(0, Number(selectedIndex) || 0)] ?? rows[0]
   const size = Number(shape?.size ?? 0)
   return size ? `${size} ft` : ""
}

function fieldSelect(entry, selected, type) {
   const fields = behaviorFields(entry).filter((field) => field.type === type)
   if (fields.length <= 1) {
      return `<input type="hidden" class="atw-heighten-action-field" value="${escapeHTML(fields[0]?.key ?? selected ?? "")}">`
   }
   return `<select class="atw-heighten-action-field">
      ${fields
         .map(
            (field) =>
               `<option value="${escapeHTML(field.key)}" ${field.key === selected ? "selected" : ""}>${escapeHTML(localize(field.label))}</option>`,
         )
         .join("")}
   </select>`
}

function behaviorFields(entry) {
   const def = BEHAVIOR_CATALOG.find((behavior) => behavior.type === entry?.type)
   return def?.fields ?? []
}

function selectValue(options, selected, className) {
   return `<select class="${className}">
      ${options
         .map(
            (option) =>
               `<option value="${escapeHTML(option.value)}" ${String(option.value) === String(selected) ? "selected" : ""} ${option.disabled ? "disabled" : ""}>${escapeHTML(localize(option.label))}</option>`,
         )
         .join("")}
   </select>`
}

function heightenDamageHtml(damage) {
   return `<div class="atw-heighten-damage">
      <input type="number" min="0" step="1" class="atw-heighten-damage-count" value="${Number(damage.diceCount ?? 1) || 1}">
      <span>d</span>
      ${selectValue(DAMAGE_DIE_OPTIONS, damage.dieSize ?? "d6", "atw-heighten-damage-die")}
      ${selectValue(DAMAGE_CATEGORY_OPTIONS, damage.category ?? "normal", "atw-heighten-damage-category")}
      ${selectValue(getDamageTypeOptions(), damage.damageType ?? "fire", "atw-heighten-damage-type")}
   </div>`
}

function iwrEditor(entry, action) {
   const fields = behaviorFields(entry).filter(isIwrField)
   const fieldOptions = fields.length
      ? fields.map((field) => ({ value: field.key, label: localize(field.label) }))
      : [
           { value: "immunities", label: "Immunities" },
           { value: "resistances", label: "Resistances" },
           { value: "weaknesses", label: "Weaknesses" },
        ]
   const selectedFieldKey = action.fieldKey ?? fieldOptions[0]?.value ?? "resistances"
   const showAmount = action.type !== "removeIWR" && !isImmunityKey(selectedFieldKey)
   const damageTypeOptions = iwrDamageTypeOptions(entry, selectedFieldKey, action.type)
   const selectedDamageType = damageTypeOptions.some(
      (option) => String(option.value) === String(action.damageType),
   )
      ? action.damageType
      : damageTypeOptions[0]?.value ?? ""
   return `<div class="atw-heighten-iwr">
      ${selectValue(fieldOptions, selectedFieldKey, "atw-heighten-action-field atw-heighten-iwr-kind")}
      ${selectValue(damageTypeOptions, selectedDamageType, "atw-heighten-iwr-type")}
      ${
         showAmount
            ? `<label class="atw-heighten-inline">Value
                  <input type="number" min="0" step="1" class="atw-heighten-action-amount atw-heighten-iwr-amount" value="${Number(action.amount) || 0}">
               </label>`
            : ""
      }
   </div>`
}

function iwrDamageTypeOptions(entry, fieldKey, actionType) {
   if (actionType === "addIWR") return getDamageTypeOptions()
   const current = Array.isArray(entry?.system?.[fieldKey]) ? entry.system[fieldKey] : []
   const values = current
      .map((row) => String(typeof row === "string" ? row : row?.type ?? "").trim())
      .filter(Boolean)
   if (!values.length) return [{ value: "", label: "None defined", disabled: true }]
   const labels = new Map(getDamageTypeOptions().map((option) => [String(option.value), option.label]))
   return values.map((value) => ({
      value,
      label: labels.get(value) ?? value,
   }))
}

function isIwrField(field) {
   const key = String(field?.key ?? "").toLowerCase()
   return Boolean(
      field?.key &&
         (field.type === "irwTagList" ||
            key.includes("immunit") ||
            key.includes("resistance") ||
            key.includes("weakness")),
   )
}

function isImmunityKey(key) {
   return String(key ?? "").toLowerCase().includes("immunit")
}

function heightenShapeHtml(shape, { compact = false } = {}) {
   const type = shape.type ?? "circle"
   const typeOptions = TEMPLATE_SHAPE_TYPE_OPTIONS.map(
      (option) =>
         `<option value="${escapeHTML(option.value)}" ${option.value === type ? "selected" : ""}>${escapeHTML(localize(option.label))}</option>`,
   ).join("")
   const showWidth = ["line", "rectangle"].includes(type)
   const showInner = type === "ring"
   return `<div class="atw-heighten-shape">
      <select class="atw-heighten-shape-type">${typeOptions}</select>
      <label class="atw-heighten-inline">${compact ? "" : "Size"} <input type="number" min="1" step="1" class="atw-heighten-shape-size" value="${Number(shape.size ?? 15) || 15}"> ft</label>
      ${
         showWidth
            ? `<label>Width <input type="number" min="1" step="1" class="atw-heighten-shape-width" value="${Number(shape.width ?? 5) || 5}"></label>`
            : ""
      }
      ${
         showInner
            ? `<label>Inner <input type="number" min="1" step="1" class="atw-heighten-shape-inner" value="${Number(shape.innerRadius ?? 5) || 5}"></label>`
            : ""
      }
   </div>`
}
