import {
   BEHAVIOR_CATALOG,
   sortByLocalizedLabel,
   COMMON_DC_SUGGESTIONS,
} from "../data.mjs"
import { escapeHTML, localize } from "../common/html.mjs"
import { readAutomation } from "./automation-storage.mjs"
export const CHOICE_KIND_OPTIONS = [
   { value: "save", label: "PF2EATW.Choice.KindSave" },
   { value: "skill", label: "PF2EATW.Choice.KindSkill" },
]
export const CHOICE_SAVE_OPTIONS = [
   { value: "fortitude", label: "PF2EATW.Save.Fortitude" },
   { value: "reflex", label: "PF2EATW.Save.Reflex" },
   { value: "will", label: "PF2EATW.Save.Will" },
]
export const CHOICE_SKILL_OPTIONS = [
   { value: "acrobatics", label: "PF2EATW.Skill.Acrobatics" },
   { value: "arcana", label: "PF2EATW.Skill.Arcana" },
   { value: "athletics", label: "PF2EATW.Skill.Athletics" },
   { value: "crafting", label: "PF2EATW.Skill.Crafting" },
   { value: "deception", label: "PF2EATW.Skill.Deception" },
   { value: "diplomacy", label: "PF2EATW.Skill.Diplomacy" },
   { value: "intimidation", label: "PF2EATW.Skill.Intimidation" },
   { value: "medicine", label: "PF2EATW.Skill.Medicine" },
   { value: "nature", label: "PF2EATW.Skill.Nature" },
   { value: "occultism", label: "PF2EATW.Skill.Occultism" },
   { value: "performance", label: "PF2EATW.Skill.Performance" },
   { value: "religion", label: "PF2EATW.Skill.Religion" },
   { value: "society", label: "PF2EATW.Skill.Society" },
   { value: "stealth", label: "PF2EATW.Skill.Stealth" },
   { value: "survival", label: "PF2EATW.Skill.Survival" },
   { value: "thievery", label: "PF2EATW.Skill.Thievery" },
   { value: "perception", label: "PF2EATW.Skill.Perception" },
   { value: "lore", label: "PF2EATW.Skill.Lore" },
]

export function defaultChoice() {
   return {
      kind: "save",
      save: "reflex",
      skill: "athletics",
      lore: "",
      dc: "15",
   }
}

export function renderChoiceList(field, value) {
   const arr = Array.isArray(value) ? value : []
   const rows = arr.map((c, i) => choiceRowHtml(c, i)).join("")
   return `<div class="atw-choice-list" data-atw-sprop="${field.key}">
    ${rows}
    <a data-action="add-choice" class="atw-consequence-add">
      <i class="fa-solid fa-plus"></i>
      <span>${escapeHTML(localize("PF2EATW.Choice.Add"))}</span>
    </a>
  </div>`
}

export function choiceRowHtml(c, idx) {
   const cur = c ?? {}
   const kind = cur.kind ?? "save"
   const kindOpts = CHOICE_KIND_OPTIONS.map(
      (o) =>
         `<option value="${escapeHTML(o.value)}" ${o.value === kind ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
   ).join("")

   let statHtml = ""
   if (kind === "save") {
      const sv = cur.save ?? "reflex"
      const saveOpts = sortByLocalizedLabel(CHOICE_SAVE_OPTIONS)
         .map(
            (o) =>
               `<option value="${escapeHTML(o.value)}" ${o.value === sv ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
         )
         .join("")
      statHtml = `<select class="atw-choice-save">${saveOpts}</select>`
   } else {
      const sk = cur.skill ?? "athletics"
      const skillOpts = sortByLocalizedLabel(CHOICE_SKILL_OPTIONS)
         .map(
            (o) =>
               `<option value="${escapeHTML(o.value)}" ${o.value === sk ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
         )
         .join("")
      statHtml = `<select class="atw-choice-skill">${skillOpts}</select>`
      if (sk === "lore") {
         statHtml += `<input type="text" class="atw-choice-lore"
                          placeholder="magic-lore"
                          value="${escapeHTML(String(cur.lore ?? ""))}">`
      }
   }

   const dcListId = `atw-choice-dc-${idx}-${foundry.utils.randomID(6)}`
   const dcSuggestOpts = COMMON_DC_SUGGESTIONS.map(
      (s) =>
         `<option value="${escapeHTML(s.value)}">${escapeHTML(localize(s.label))}</option>`,
   ).join("")

   return `<div class="atw-choice-row" data-index="${idx}">
    <div class="atw-choice-head">
      <select class="atw-choice-kind">${kindOpts}</select>
      ${statHtml}
      <input type="text" class="atw-choice-dc"
             list="${dcListId}"
             value="${escapeHTML(String(cur.dc ?? 15))}"
             placeholder="15 or @placer.system.attributes.spellDC.value"
             title="${escapeHTML(localize("PF2EATW.Field.DC"))}">
      <datalist id="${dcListId}">${dcSuggestOpts}</datalist>
      <a data-action="remove-choice" class="atw-consequence-remove">
        <i class="fa-solid fa-minus"></i>
      </a>
    </div>
  </div>`
}

export function refreshChoiceList(wrapEl, item) {
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
   const value = entry.system?.[fieldKey] ?? []
   wrapEl.outerHTML = renderChoiceList(field, value)
}
