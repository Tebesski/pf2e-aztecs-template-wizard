import {
   BEHAVIOR_CATALOG,
   COMMON_DC_SUGGESTIONS,
   CONSEQUENCE_TYPE_OPTIONS,
   SAVE_CONSEQUENCE_TYPE_OPTIONS,
   SAVE_OUTCOME_OPTIONS,
   TIME_UNITS,
   getConditionTypeOptions,
   sortByLocalizedLabel,
} from "../data.mjs"
import { escapeHTML, localize } from "../common/html.mjs"
import { readAutomation } from "./automation-storage.mjs"
import { computeExpressionPreview } from "./expression-preview.mjs"
import { CHOICE_SKILL_OPTIONS } from "./choice-renderers.mjs"
import {
   UUID_CACHE,
   damageRowHtml,
   validateRuleJson,
} from "./input-renderers.mjs"
export function defaultConsequence() {
   return {
      min: 1,
      max: 1,
      type: "damage",
      damages: [
         {
            diceCount: 1,
            dieSize: "d6",
            damageType: "fire",
            category: "normal",
         },
      ],
   }
}

export function seedConsequenceDefaults(c, type) {
   switch (type) {
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
      case "applyCondition":
      case "removeCondition":
         if (!c.condition || typeof c.condition !== "object") {
            c.condition = { slug: "frightened", value: 1 }
         }
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
      case "savingThrow":
         if (!c.save) c.save = "reflex"
         if (c.dc == null) c.dc = "15"
         if (!Array.isArray(c.consequences)) c.consequences = []
         break
      case "rollSkill":
         if (!c.skill) c.skill = "athletics"
         if (c.dc == null) c.dc = "15"
         if (!Array.isArray(c.consequences)) c.consequences = []
         break
   }
}

export function renderConsequenceList(field, value, itemContext = null) {
   const arr = Array.isArray(value) ? value : []
   const rows = arr
      .map((c, i) => consequenceRowHtml(c, i, itemContext))
      .join("")
   return `<div class="atw-consequence-list" data-atw-sprop="${field.key}">
    ${rows}
    <a data-action="add-consequence" class="atw-consequence-add">
      <i class="fa-solid fa-plus"></i>
      <span>${escapeHTML(localize("PF2EATW.Field.AddConsequence"))}</span>
    </a>
  </div>`
}

export function consequenceRowHtml(c, idx, itemContext = null) {
   const cur = c ?? {}
   const min = Number.isFinite(Number(cur.min)) ? cur.min : 1
   const max = Number.isFinite(Number(cur.max)) ? cur.max : 1
   const type = cur.type ?? "damage"
   const typeOpts = sortByLocalizedLabel(CONSEQUENCE_TYPE_OPTIONS)
      .map(
         (o) =>
            `<option value="${escapeHTML(o.value)}" ${o.value === type ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
      )
      .join("")

   return `<div class="atw-consequence-row" data-index="${idx}">
    <div class="atw-consequence-head">
      <input type="number" class="atw-consequence-min" min="0" step="1" value="${escapeHTML(String(min))}">
      <span class="atw-consequence-dash">-</span>
      <input type="number" class="atw-consequence-max" min="0" step="1" value="${escapeHTML(String(max))}">
      <select class="atw-consequence-type">${typeOpts}</select>
      <a data-action="remove-consequence" class="atw-consequence-remove">
        <i class="fa-solid fa-minus"></i>
      </a>
    </div>
    <div class="atw-consequence-body">
      ${consequenceBodyHtml(cur, itemContext)}
    </div>
  </div>`
}

export function consequenceDurationHtml(c) {
   const cur =
      c.duration && typeof c.duration === "object"
         ? c.duration
         : { enabled: false, amount: 1, unit: "rounds" }
   const enabled = !!cur.enabled
   const amount = Math.max(1, Number(cur.amount) || 1)
   const unit = cur.unit ?? "rounds"
   const units = ["rounds", "minutes", "hours", "days"]
   const unitOpts = units
      .map(
         (u) =>
            `<option value="${u}" ${u === unit ? "selected" : ""}>${escapeHTML(localize(TIME_UNITS[u]?.label ?? u))}</option>`,
      )
      .join("")
   return `<div class="atw-consequence-duration">
    <label class="atw-inline-checkbox">
      <input type="checkbox" class="atw-consequence-duration-enabled" ${enabled ? "checked" : ""}>
      <span>${escapeHTML(localize("PF2EATW.Duration.Enabled"))}</span>
    </label>
    <div class="atw-duration-amount ${enabled ? "" : "atw-disabled"}">
      <input type="number" class="atw-consequence-duration-amount" min="1" step="1" value="${amount}">
      <select class="atw-consequence-duration-unit">${unitOpts}</select>
    </div>
  </div>`
}

export function consequenceBodyHtml(c, itemContext = null) {
   const type = c?.type ?? "damage"
   switch (type) {
      case "damage": {
         const damages = Array.isArray(c.damages) ? c.damages : []
         const rows = damages.map((d, i) => damageRowHtml(d, i)).join("")
         return `<div class="atw-damage-list atw-consequence-damages">
        ${rows}
        <a data-action="add-damage" class="atw-damage-add">
          <i class="fa-solid fa-plus"></i>
          <span>${escapeHTML(localize("PF2EATW.Field.AddDamage"))}</span>
        </a>
      </div>`
      }
      case "applyEffect":
      case "removeEffect": {
         const uuid = (c.uuid ?? "").trim()
         const cached = uuid ? UUID_CACHE.get(uuid) : null
         const iconSrc = cached?.img ?? "icons/svg/mystery-man.svg"
         const linkHtml = cached
            ? `<a class="atw-uuid-link" data-uuid="${escapeHTML(uuid)}">${escapeHTML(cached.name)}</a>`
            : uuid
              ? `<span class="atw-uuid-link atw-uuid-invalid">${localize("PF2EATW.UuidList.Invalid")}</span>`
              : `<span class="atw-uuid-link atw-uuid-empty"></span>`

         const durHtml =
            c.type === "applyEffect" ? consequenceDurationHtml(c) : ""
         return `<div class="atw-consequence-effect">
        <div class="atw-consequence-uuid-wrap">
          <img class="atw-uuid-icon" src="${iconSrc}" alt="">
          <input type="text" class="atw-consequence-uuid atw-uuid-input"
                 value="${escapeHTML(c.uuid ?? "")}"
                 placeholder="${escapeHTML(localize("PF2EATW.UuidList.Placeholder"))}">
          ${linkHtml}
        </div>
        ${durHtml}
      </div>`
      }
      case "applyCondition": {
         const cond =
            c.condition && typeof c.condition === "object"
               ? c.condition
               : { slug: "frightened", value: 1 }
         const opts = getConditionTypeOptions()
            .map(
               (o) =>
                  `<option value="${escapeHTML(o.value)}" ${o.value === cond.slug ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
            )
            .join("")
         const condDoc =
            globalThis.game?.pf2e?.ConditionManager?.conditions?.get?.(
               cond.slug,
            ) ?? null
         const isValued = condDoc?.system?.value?.isValued ?? false
         const valueInput = isValued
            ? `<input type="number" class="atw-consequence-condvalue" min="1" step="1" value="${escapeHTML(String(cond.value ?? 1))}">`
            : ""
         const iconImg = condDoc?.img ?? "icons/svg/mystery-man.svg"
         return `<div class="atw-consequence-condition-wrap">
        <div class="atw-consequence-condition">
          <img class="atw-condition-icon-img" src="${escapeHTML(iconImg)}"
               alt="" data-condition-slug="${escapeHTML(cond.slug ?? "")}">
          <select class="atw-consequence-condslug">${opts}</select>
          ${valueInput}
        </div>
        ${consequenceDurationHtml(c)}
      </div>`
      }
      case "removeCondition": {
         const cond =
            c.condition && typeof c.condition === "object"
               ? c.condition
               : { slug: c.slug ?? "frightened", value: 1 }
         const slug = cond.slug ?? "frightened"
         const opts = getConditionTypeOptions()
            .map(
               (o) =>
                  `<option value="${escapeHTML(o.value)}" ${o.value === slug ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
            )
            .join("")
         const condDoc =
            globalThis.game?.pf2e?.ConditionManager?.conditions?.get?.(slug) ??
            null
         const isValued = condDoc?.system?.value?.isValued ?? false
         const valueInput = isValued
            ? `<input type="number" class="atw-consequence-condvalue" min="1" step="1"
                  value="${escapeHTML(String(cond.value ?? 1))}"
                  title="${escapeHTML(localize("PF2EATW.Field.RemoveConditionStepsTooltip"))}">`
            : ""
         const iconImg = condDoc?.img ?? "icons/svg/mystery-man.svg"
         return `<div class="atw-consequence-condition-wrap">
        <div class="atw-consequence-condition">
          <img class="atw-condition-icon-img" src="${escapeHTML(iconImg)}"
               alt="" data-condition-slug="${escapeHTML(slug)}">
          <select class="atw-consequence-condslug">${opts}</select>
          ${valueInput}
        </div>
      </div>`
      }
      case "applyRuleElement": {
         const rules = Array.isArray(c.rules) ? c.rules : []
         const rows = rules
            .map((r, i) => {
               const val =
                  r && typeof r === "object"
                     ? JSON.stringify(r, null, 2)
                     : (r ?? "")
               const v = validateRuleJson(val)
               const badge = v.valid
                  ? `<span class="atw-rule-badge atw-rule-valid"><i class="fa-solid fa-check"></i></span>`
                  : `<span class="atw-rule-badge atw-rule-invalid"
                   data-tooltip="${escapeHTML(localize(v.message))}"
              ><i class="fa-solid fa-triangle-exclamation"></i></span>`
               return `<div class="atw-cons-rule-row" data-index="${i}">
          <div class="atw-rule-header">
            ${badge}
            <a data-action="remove-cons-rule" class="atw-rule-remove">
              <i class="fa-solid fa-minus"></i>
            </a>
          </div>
          <textarea class="atw-cons-rule-textarea" rows="4"
                    spellcheck="false">${escapeHTML(val)}</textarea>
        </div>`
            })
            .join("")
         return `<div class="atw-consequence-rules">
        ${rows}
        <a data-action="add-cons-rule" class="atw-rule-add">
          <i class="fa-solid fa-plus"></i>
          <span>${escapeHTML(localize("PF2EATW.RuleElement.Add"))}</span>
        </a>
        ${consequenceDurationHtml(c)}
      </div>`
      }
      case "executeMacro": {
         const uuid = (c.uuid ?? "").trim()
         const cached = uuid ? UUID_CACHE.get(uuid) : null
         const iconSrc = cached?.img ?? "icons/svg/dice-target.svg"
         const linkHtml = cached
            ? `<a class="atw-uuid-link" data-uuid="${escapeHTML(uuid)}">${escapeHTML(cached.name)}</a>`
            : uuid
              ? `<span class="atw-uuid-link atw-uuid-invalid">${localize("PF2EATW.UuidList.Invalid")}</span>`
              : `<span class="atw-uuid-link atw-uuid-empty"></span>`
         return `<div class="atw-consequence-uuid-wrap">
        <img class="atw-uuid-icon" src="${iconSrc}" alt="">
        <input type="text" class="atw-consequence-uuid atw-uuid-input"
               value="${escapeHTML(c.uuid ?? "")}"
               placeholder="Macro.xxxxxxxx OR Compendium...">
        ${linkHtml}
      </div>`
      }
      case "sendChatMessage":
         return `<div class="atw-consequence-chat">
        <textarea class="atw-consequence-text atw-consequence-chat-text" rows="3"
          placeholder="${escapeHTML(localize("PF2EATW.Field.ChatMessagePlaceholder"))}">${escapeHTML(c.text ?? "")}</textarea>
        <label class="atw-inline-checkbox">
          <input type="checkbox" class="atw-consequence-privateToGm" ${c.privateToGm ? "checked" : ""}>
          <span>${escapeHTML(localize("PF2EATW.Field.PrivateToGm"))}</span>
        </label>
        <label class="atw-inline-checkbox">
          <input type="checkbox" class="atw-consequence-blindToGm" ${c.blindToGm ? "checked" : ""}>
          <span>${escapeHTML(localize("PF2EATW.Field.BlindToGm"))}</span>
        </label>
      </div>`
      case "savingThrow": {
         const saveOpts = [
            { value: "fortitude", label: "PF2EATW.Save.Fortitude" },
            { value: "reflex", label: "PF2EATW.Save.Reflex" },
            { value: "will", label: "PF2EATW.Save.Will" },
         ]
         const saveSelect = saveOpts
            .map(
               (o) =>
                  `<option value="${o.value}" ${o.value === (c.save ?? "reflex") ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
            )
            .join("")
         const nestedRows = (
            Array.isArray(c.consequences) ? c.consequences : []
         )
            .map((sc, i) => saveConsequenceRowHtml(sc, i, itemContext))
            .join("")
         const dcListId = `atw-consequence-save-dc-${foundry.utils.randomID(6)}`
         const dcSuggestOpts = COMMON_DC_SUGGESTIONS.map(
            (s) =>
               `<option value="${escapeHTML(s.value)}">${escapeHTML(localize(s.label))}</option>`,
         ).join("")
         const dcValue = String(c.dc ?? "15")
         const exprPreview = computeExpressionPreview(dcValue, itemContext)
         return `<div class="atw-consequence-savingthrow">
        <div class="atw-row">
          <span class="atw-row-label">${escapeHTML(localize("PF2EATW.Field.SaveType"))}</span>
          <select class="atw-consequence-saveType">${saveSelect}</select>
        </div>
        <div class="atw-row">
          <span class="atw-row-label">${escapeHTML(localize("PF2EATW.Field.DC"))}</span>
          <div class="atw-expression-wrap">
            <input type="text" class="atw-expression-input atw-consequence-saveDC"
                   list="${dcListId}"
                   value="${escapeHTML(dcValue)}"
                   placeholder="15  or  @placer.system.attributes.classOrSpellDC.value">
            <datalist id="${dcListId}">${dcSuggestOpts}</datalist>
            <span class="atw-expression-preview"${exprPreview === "" ? " hidden" : ""}>${escapeHTML(exprPreview)}</span>
          </div>
        </div>
        <div class="atw-save-consequence-list atw-nested-save-list">
          ${nestedRows}
          <a data-action="add-nested-save-consequence" class="atw-consequence-add">
            <i class="fa-solid fa-plus"></i>
            <span>${escapeHTML(localize("PF2EATW.Field.AddConsequence"))}</span>
          </a>
        </div>
      </div>`
      }
      case "rollSkill": {
         const skill = c.skill ?? "athletics"
         const skillSelect = sortByLocalizedLabel(CHOICE_SKILL_OPTIONS)
            .map(
               (o) =>
                  `<option value="${escapeHTML(o.value)}" ${o.value === skill ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
            )
            .join("")
         const loreHtml =
            skill === "lore"
               ? `<input type="text" class="atw-consequence-skillLore"
                  placeholder="${escapeHTML(localize("PF2EATW.Field.LoreNamePlaceholder"))}"
                  value="${escapeHTML(String(c.lore ?? ""))}">`
               : ""
         const nestedRows = (
            Array.isArray(c.consequences) ? c.consequences : []
         )
            .map((sc, i) => saveConsequenceRowHtml(sc, i, itemContext))
            .join("")
         const dcListId = `atw-consequence-skill-dc-${foundry.utils.randomID(6)}`
         const dcSuggestOpts = COMMON_DC_SUGGESTIONS.map(
            (s) =>
               `<option value="${escapeHTML(s.value)}">${escapeHTML(localize(s.label))}</option>`,
         ).join("")
         const dcValue = String(c.dc ?? "15")
         const exprPreview = computeExpressionPreview(dcValue, itemContext)
         return `<div class="atw-consequence-rollskill">
        <div class="atw-row">
          <span class="atw-row-label">${escapeHTML(localize("PF2EATW.Field.SkillType"))}</span>
          <select class="atw-consequence-skillType">${skillSelect}</select>
          ${loreHtml}
        </div>
        <div class="atw-row">
          <span class="atw-row-label">${escapeHTML(localize("PF2EATW.Field.DC"))}</span>
          <div class="atw-expression-wrap">
            <input type="text" class="atw-expression-input atw-consequence-skillDC"
                   list="${dcListId}"
                   value="${escapeHTML(dcValue)}"
                   placeholder="15  or  @placer.system.attributes.classOrSpellDC.value">
            <datalist id="${dcListId}">${dcSuggestOpts}</datalist>
            <span class="atw-expression-preview"${exprPreview === "" ? " hidden" : ""}>${escapeHTML(exprPreview)}</span>
          </div>
        </div>
        <div class="atw-save-consequence-list atw-nested-save-list">
          ${nestedRows}
          <a data-action="add-nested-save-consequence" class="atw-consequence-add">
            <i class="fa-solid fa-plus"></i>
            <span>${escapeHTML(localize("PF2EATW.Field.AddConsequence"))}</span>
          </a>
        </div>
      </div>`
      }
      case "scrollingText":
         return `<div class="atw-consequence-scrolling">
        <input type="text" class="atw-consequence-text"
               value="${escapeHTML(c.text ?? "")}"
               placeholder="${escapeHTML(localize("PF2EATW.Field.ScrollingText"))}">
        <input type="color" class="atw-consequence-color" value="${escapeHTML(c.color ?? "#ffffff")}">
      </div>`
      default:
         return ""
   }
}

export function refreshConsequenceList(wrapEl, item) {
   const li = wrapEl.closest(".atw-behavior")
   if (!li) return
   const id = li.dataset.id
   const fieldKey = wrapEl.dataset.atwSprop
   const a = readAutomation(item)
   const entry = a.behaviors.find((b) => b.id === id)
   if (!entry) return
   const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
   const field = def?.fields.find((f) => f.key === fieldKey)
   if (!field) return
   wrapEl.outerHTML = renderConsequenceList(
      field,
      entry.system?.[fieldKey] ?? [],
      item,
   )
}

export function defaultSaveConsequence() {
   return {
      outcome: "failure",
      type: "damage",
      damages: [
         {
            diceCount: 1,
            dieSize: "d6",
            damageType: "fire",
            category: "normal",
         },
      ],
   }
}

export function renderSaveConsequenceList(field, value, itemContext = null) {
   const arr = Array.isArray(value) ? value : []
   const rows = arr
      .map((c, i) => saveConsequenceRowHtml(c, i, itemContext))
      .join("")
   return `<div class="atw-save-consequence-list" data-atw-sprop="${field.key}">
    ${rows}
    <a data-action="add-save-consequence" class="atw-consequence-add">
      <i class="fa-solid fa-plus"></i>
      <span>${escapeHTML(localize("PF2EATW.Field.AddConsequence"))}</span>
    </a>
  </div>`
}

export function saveConsequenceRowHtml(c, idx, itemContext = null) {
   const cur = c ?? {}
   const outcome = cur.outcome ?? "failure"
   const type = cur.type ?? "damage"
   const outcomeOpts = SAVE_OUTCOME_OPTIONS.map(
      (o) =>
         `<option value="${escapeHTML(o.value)}" ${o.value === outcome ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
   ).join("")

   const typeOpts = sortByLocalizedLabel(SAVE_CONSEQUENCE_TYPE_OPTIONS)
      .map(
         (o) =>
            `<option value="${escapeHTML(o.value)}" ${o.value === type ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
      )
      .join("")
   return `<div class="atw-save-consequence-row" data-index="${idx}">
    <div class="atw-consequence-head">
      <select class="atw-save-consequence-outcome">${outcomeOpts}</select>
      <select class="atw-consequence-type">${typeOpts}</select>
      <a data-action="remove-save-consequence" class="atw-consequence-remove">
        <i class="fa-solid fa-minus"></i>
      </a>
    </div>
    <div class="atw-consequence-body">
      ${consequenceBodyHtml(cur, itemContext)}
    </div>
  </div>`
}

export function refreshSaveConsequenceList(wrapEl, item) {
   const li = wrapEl.closest(".atw-behavior")
   if (!li) return
   const id = li.dataset.id
   const fieldKey = wrapEl.dataset.atwSprop
   const a = readAutomation(item)
   const entry = a.behaviors.find((b) => b.id === id)
   if (!entry) return
   const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
   const field = def?.fields.find((f) => f.key === fieldKey)
   if (!field) return
   wrapEl.outerHTML = renderSaveConsequenceList(
      field,
      entry.system?.[fieldKey] ?? [],
      item,
   )
}
