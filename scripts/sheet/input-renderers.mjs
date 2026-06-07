import {
   BEHAVIOR_CATALOG,
   DAMAGE_DIE_OPTIONS,
   DAMAGE_CATEGORY_OPTIONS,
   TIME_UNITS,
   TILE_SHAPE_FILTER_OPTIONS,
   defaultTileAttachment,
   normalizeTileAttachments,
   resolveOptions,
   getConditionTypeOptions,
   getDamageTypeOptions,
   getDamageTypeVisual,
} from "../data.mjs"
import { escapeHTML, localize } from "../common/html.mjs"
import { readAutomation } from "./automation-storage.mjs"
import {
   restrictShownTriggers,
   restrictTriggerOptions,
} from "./restrict-trigger-controls.mjs"
export function renderTagPicker(field, value, context = {}) {
   const selected = Array.isArray(value) ? value.slice() : []
   const resolved = resolveOptions(field)
   const allOpts = restrictTriggerOptions(
      { ...field, options: resolved },
      context,
   )
   const lookup = new Map(allOpts.map((o) => [o.value, o]))
   const shownSelected = restrictShownTriggers(
      { ...field, options: resolved },
      selected,
      context,
   )
   const available = allOpts.filter((o) => !shownSelected.includes(o.value))
   const promptKey = field.addPrompt ?? "PF2EATW.TagPicker.Add"

   const tags = shownSelected
      .map((v) => {
         const opt = lookup.get(v)
         const label = opt ? localize(opt.label) : v
         return (
            `<span class="atw-tag" data-value="${escapeHTML(v)}">` +
            `<span class="atw-tag-label">${escapeHTML(label)}</span>` +
            `<a class="atw-tag-remove" data-action="remove-tag" aria-label="Remove">` +
            `&times;</a>` +
            `</span>`
         )
      })
      .join("")

   const opts =
      `<option value="">${localize(promptKey)}</option>` +
      available
         .map(
            (o) =>
               `<option value="${escapeHTML(o.value)}">${localize(o.label)}</option>`,
         )
         .join("")

   return `<div class="atw-tag-picker" data-atw-sprop="${field.key}">
    <select class="atw-tag-select" data-action="add-tag">${opts}</select>
    <div class="atw-tag-list"${shownSelected.length === 0 ? " hidden" : ""}>${tags}</div>
  </div>`
}

export function refreshTagPicker(pickerEl, item) {
   const li = pickerEl.closest(".atw-behavior")
   if (!li) return
   const id = li.dataset.id
   const fieldKey = pickerEl.dataset.atwSprop
   const a = readAutomation(item)
   const entry = a.behaviors.find((b) => b.id === id)
   if (!entry) return
   const def = BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
   const field = def?.fields.find((f) => f.key === fieldKey)
   if (!field) return
   pickerEl.outerHTML = renderTagPicker(field, entry.system?.[fieldKey] ?? [], {
      behaviorType: entry.type,
      system: entry.system ?? {},
   })
}

export function renderIrwTagList(field, value) {
   const entries = Array.isArray(value) ? value.slice() : []
   const damageOpts = getDamageTypeOptions()
   const lookup = new Map(damageOpts.map((o) => [o.value, o]))
   const promptKey = field.addPrompt ?? "PF2EATW.IrwTag.Add"

   const tags = entries
      .map((e, i) => {
         const type = e?.type ?? ""
         const val = Number(e?.value ?? 0)
         const opt = lookup.get(type)
         const typeLabel = opt ? localize(opt.label) : type
         return `<span class="atw-irw-tag" data-index="${i}">
      <span class="atw-irw-tag-type">${escapeHTML(typeLabel)}</span>
      <span class="atw-irw-tag-value-static">${val}</span>
      <a class="atw-tag-remove" data-action="remove-irw-tag" aria-label="Remove">&times;</a>
    </span>`
      })
      .join("")

   const opts =
      `<option value="">${localize(promptKey)}</option>` +
      damageOpts
         .map(
            (o) =>
               `<option value="${escapeHTML(o.value)}">${localize(o.label)}</option>`,
         )
         .join("")

   return `<div class="atw-irw-tag-list" data-atw-sprop="${field.key}">
    <div class="atw-irw-tag-controls">
      <input type="number" class="atw-irw-tag-input-value" min="1" step="1" value="5">
      <select class="atw-irw-tag-select" data-action="add-irw-tag">${opts}</select>
    </div>
    <div class="atw-irw-tag-row"${entries.length === 0 ? " hidden" : ""}>${tags}</div>
  </div>`
}

export function refreshIrwTagList(wrapEl, item) {
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
   wrapEl.outerHTML = renderIrwTagList(field, entry.system?.[fieldKey] ?? [])
}

export const UUID_CACHE = new Map()
export const UUID_RESOLVING = new Set()

export function renderUuidList(field, value) {
   const arr = Array.isArray(value) ? value : value ? [value] : [""]
   const rows = arr.map((uuid, i) => uuidRowHtml(uuid, i)).join("")
   return `<div class="atw-uuid-list-wrap" data-atw-sprop="${field.key}">
    <ul class="atw-uuid-list">${rows}</ul>
    <a data-action="add-uuid" class="atw-uuid-add">
      <i class="fa-solid fa-plus"></i>
      <span>${localize("PF2EATW.UuidList.Add")}</span>
    </a>
  </div>`
}

export function uuidRowHtml(uuid, idx) {
   const trimmed = (uuid ?? "").trim()
   const cached = trimmed ? UUID_CACHE.get(trimmed) : null
   const iconSrc = cached?.img ?? "icons/svg/mystery-man.svg"
   const linkHtml = cached
      ? `<a class="atw-uuid-link" data-uuid="${escapeHTML(trimmed)}">${escapeHTML(cached.name)}</a>`
      : trimmed
        ? `<span class="atw-uuid-link atw-uuid-invalid">${localize("PF2EATW.UuidList.Invalid")}</span>`
        : `<span class="atw-uuid-link atw-uuid-empty"></span>`
   return `<li class="atw-uuid-row" data-index="${idx}">
    <img class="atw-uuid-icon" src="${iconSrc}" alt="">
    <input type="text" class="atw-uuid-input"
           value="${escapeHTML(uuid ?? "")}"
           placeholder="${localize("PF2EATW.UuidList.Placeholder")}">
    ${linkHtml}
    <a data-action="remove-uuid" class="atw-uuid-remove">
      <i class="fa-solid fa-minus"></i>
    </a>
  </li>`
}

export async function resolveUuidIntoRow(uuid, rowEl) {
   if (!uuid || UUID_RESOLVING.has(uuid)) return
   UUID_RESOLVING.add(uuid)
   try {
      const doc = await fromUuid(uuid).catch(() => null)

      if (
         doc &&
         (doc.documentName === "Item" || doc.documentName === "Macro")
      ) {
         UUID_CACHE.set(uuid, {
            img: doc.img,
            name: doc.name,
            documentName: doc.documentName,
         })
         if (rowEl?.isConnected) updateUuidRowDom(rowEl, uuid)
      } else {
         UUID_CACHE.delete(uuid)
         if (rowEl?.isConnected) updateUuidRowDom(rowEl, uuid)
      }
   } finally {
      UUID_RESOLVING.delete(uuid)
   }
}

export function updateUuidRowDom(rowEl, uuid) {
   const cached = UUID_CACHE.get(uuid)
   const img = rowEl.querySelector(".atw-uuid-icon")
   const linkSlot = rowEl.querySelector(".atw-uuid-link")
   if (!img || !linkSlot) return
   if (cached) {
      img.src = cached.img
      linkSlot.outerHTML = `<a class="atw-uuid-link" data-uuid="${escapeHTML(uuid)}">${escapeHTML(cached.name)}</a>`
   } else {
      img.src = "icons/svg/mystery-man.svg"
      linkSlot.outerHTML = uuid
         ? `<span class="atw-uuid-link atw-uuid-invalid">${localize("PF2EATW.UuidList.Invalid")}</span>`
         : `<span class="atw-uuid-link atw-uuid-empty"></span>`
   }
}

export function refreshUuidList(wrapEl, item) {
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
   wrapEl.outerHTML = renderUuidList(field, entry.system?.[fieldKey] ?? [])

   setTimeout(() => bootstrapUuidResolutions(item), 0)
}

export function bootstrapUuidResolutions(item) {
   for (const row of document.querySelectorAll(".atw-uuid-row")) {
      const input = row.querySelector(".atw-uuid-input")
      const uuid = input?.value?.trim()
      if (uuid && !UUID_CACHE.has(uuid)) resolveUuidIntoRow(uuid, row)
   }

   for (const wrap of document.querySelectorAll(".atw-uuid-input-wrap")) {
      const input = wrap.querySelector(".atw-uuid-input")
      const uuid = input?.value?.trim()
      if (uuid && !UUID_CACHE.has(uuid)) resolveUuidIntoRow(uuid, wrap)
   }

   for (const wrap of document.querySelectorAll(".atw-consequence-uuid-wrap")) {
      const input = wrap.querySelector(".atw-uuid-input")
      const uuid = input?.value?.trim()
      if (uuid && !UUID_CACHE.has(uuid)) resolveUuidIntoRow(uuid, wrap)
   }
}

export function renderUuidInput(field, value) {
   const uuid = (value ?? "").trim()
   const cached = uuid ? UUID_CACHE.get(uuid) : null
   const iconSrc = cached?.img ?? "icons/svg/mystery-man.svg"
   const linkHtml = cached
      ? `<a class="atw-uuid-link" data-uuid="${escapeHTML(uuid)}">${escapeHTML(cached.name)}</a>`
      : uuid
        ? `<span class="atw-uuid-link atw-uuid-invalid">${localize("PF2EATW.UuidList.Invalid")}</span>`
        : `<span class="atw-uuid-link atw-uuid-empty"></span>`
   return `<div class="atw-uuid-input-wrap" data-atw-sprop="${field.key}">
    <img class="atw-uuid-icon" src="${iconSrc}" alt="">
    <input type="text" class="atw-uuid-input"
           value="${escapeHTML(value ?? "")}"
           placeholder="${escapeHTML(field.placeholder ?? localize("PF2EATW.UuidList.Placeholder"))}">
    ${linkHtml}
  </div>`
}

export function refreshUuidInput(wrapEl, item) {
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
   wrapEl.outerHTML = renderUuidInput(field, entry.system?.[fieldKey] ?? "")
   setTimeout(() => bootstrapUuidResolutions(item), 0)
}

export function renderTagInput(field, value) {
   const arr = Array.isArray(value) ? value : []
   const tags = arr
      .map(
         (v) =>
            `<span class="atw-tag" data-value="${escapeHTML(v)}">` +
            `<span class="atw-tag-label">${escapeHTML(v)}</span>` +
            `<a class="atw-tag-remove" data-action="remove-taginput-tag" aria-label="Remove">&times;</a>` +
            `</span>`,
      )
      .join("")
   const ph = field.placeholder ? localize(field.placeholder) : ""
   return `<div class="atw-tag-input" data-atw-sprop="${field.key}">
    <div class="atw-tag-input-row">
      <input type="text" class="atw-tag-input-field" placeholder="${escapeHTML(ph)}">
      <a data-action="add-taginput" class="atw-tag-input-add">
        <i class="fa-solid fa-plus"></i>
      </a>
    </div>
    <div class="atw-tag-list">${tags}</div>
  </div>`
}

export function refreshTagInput(wrapEl, item) {
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
   wrapEl.outerHTML = renderTagInput(field, entry.system?.[fieldKey] ?? [])
}

const RESTRICTION_KIND_OPTIONS = [
   { value: "spell", label: "Casting spells" },
   { value: "strike", label: "Making Strikes" },
   { value: "move", label: "Moving token" },
   { value: "skill", label: "Rolling skills" },
   { value: "item", label: "Using items" },
   { value: "ability", label: "Using abilities" },
]

const RESTRICTION_SKILL_OPTIONS = [
   { value: "acrobatics", label: "Acrobatics" },
   { value: "arcana", label: "Arcana" },
   { value: "athletics", label: "Athletics" },
   { value: "crafting", label: "Crafting" },
   { value: "deception", label: "Deception" },
   { value: "diplomacy", label: "Diplomacy" },
   { value: "intimidation", label: "Intimidation" },
   { value: "medicine", label: "Medicine" },
   { value: "nature", label: "Nature" },
   { value: "occultism", label: "Occultism" },
   { value: "performance", label: "Performance" },
   { value: "religion", label: "Religion" },
   { value: "society", label: "Society" },
   { value: "stealth", label: "Stealth" },
   { value: "survival", label: "Survival" },
   { value: "thievery", label: "Thievery" },
   { value: "perception", label: "Perception" },
   { value: "lore", label: "Custom Lore" },
]

export function defaultRestrictionEntry() {
   return {
      kind: "spell",
      slug: "",
      rollOptions: "",
      skill: "athletics",
      lore: "",
   }
}

export function normalizeRestrictionEntry(row) {
   const value = row && typeof row === "object" ? row : {}
   const kind = RESTRICTION_KIND_OPTIONS.some((option) => option.value === value.kind)
      ? value.kind
      : "spell"
   const skill = RESTRICTION_SKILL_OPTIONS.some((option) => option.value === value.skill)
      ? value.skill
      : "athletics"
   return {
      kind,
      slug: String(value.slug ?? ""),
      rollOptions: String(value.rollOptions ?? ""),
      skill,
      lore: String(value.lore ?? ""),
   }
}

export function renderRestrictionList(field, value) {
   const rows = Array.isArray(value) && value.length
      ? value.map(normalizeRestrictionEntry)
      : [defaultRestrictionEntry()]
   return `<div class="atw-restriction-list" data-atw-sprop="${field.key}">
      ${rows.map((row, index) => restrictionRowHtml(row, index, rows.length > 1)).join("")}
      <a data-action="add-restriction" class="atw-restriction-add">
         <i class="fa-solid fa-plus"></i>
         <span>Add restriction</span>
      </a>
   </div>`
}

export function restrictionRowHtml(row, index, canRemove = true) {
   const current = normalizeRestrictionEntry(row)
   const kindOptions = RESTRICTION_KIND_OPTIONS.map(
      (option) =>
         `<option value="${escapeHTML(option.value)}" ${option.value === current.kind ? "selected" : ""}>${escapeHTML(option.label)}</option>`,
   ).join("")
   const skillOptions = RESTRICTION_SKILL_OPTIONS.map(
      (option) =>
         `<option value="${escapeHTML(option.value)}" ${option.value === current.skill ? "selected" : ""}>${escapeHTML(option.label)}</option>`,
   ).join("")
   const showSlugFilters = ["spell", "strike", "item", "ability"].includes(current.kind)
   const showSkill = current.kind === "skill"
   const showLore = showSkill && current.skill === "lore"
   const remove = canRemove
      ? `<a data-action="remove-restriction" class="atw-restriction-remove">
            <i class="fa-solid fa-minus"></i>
         </a>`
      : ""
   const filters = showSlugFilters
      ? `<input type="text" class="atw-restriction-slug" value="${escapeHTML(current.slug)}" placeholder="slug">
         <input type="text" class="atw-restriction-roll-options" value="${escapeHTML(current.rollOptions)}" placeholder="roll options">`
      : ""
   const skill = showSkill
      ? `<select class="atw-restriction-skill-select">${skillOptions}</select>
         ${
            showLore
               ? `<input type="text" class="atw-restriction-lore" value="${escapeHTML(current.lore)}" placeholder="magic-lore">`
               : ""
         }
         <input type="text" class="atw-restriction-roll-options" value="${escapeHTML(current.rollOptions)}" placeholder="roll options">`
      : ""
   return `<div class="atw-restriction-row" data-index="${index}">
      <div class="atw-restriction-line">
         <select class="atw-restriction-kind">${kindOptions}</select>
         ${filters}
         ${skill}
         ${remove}
      </div>
   </div>`
}

export function refreshRestrictionList(wrapEl, item) {
   if (!wrapEl?.parentNode) return
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
   wrapEl.outerHTML = renderRestrictionList(field, entry.system?.[fieldKey] ?? [])
}

export function normalizeConditionValue(value) {
   if (typeof value === "string") return { slug: value, value: 1 }
   if (value && typeof value === "object") {
      return { slug: value.slug ?? "", value: Number(value.value) || 1 }
   }
   return { slug: "", value: 1 }
}

export function lookupConditionDoc(slug) {
   if (!slug) return null
   const cm = globalThis.game?.pf2e?.ConditionManager
   return cm?.conditions?.get?.(slug) ?? null
}

export function renderConditionPicker(field, value) {
   const cur = normalizeConditionValue(value ?? field.default)
   const doc = lookupConditionDoc(cur.slug)
   const img = doc?.img ?? "icons/svg/skull.svg"
   const uuid = doc?.uuid ?? ""
   const isValued = doc?.system?.value?.isValued ?? false

   const opts = getConditionTypeOptions()
      .map(
         (o) =>
            `<option value="${escapeHTML(o.value)}" ${o.value === cur.slug ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
      )
      .join("")

   const valueInput = isValued
      ? `<input type="number" class="atw-condition-value" min="1" step="1" value="${escapeHTML(String(cur.value))}">`
      : ""

   return `<div class="atw-condition-picker" data-atw-sprop="${field.key}">
    <a class="atw-condition-icon" data-uuid="${escapeHTML(uuid)}">
      <img src="${escapeHTML(img)}" alt="">
    </a>
    <select class="atw-condition-slug">${opts}</select>
    ${valueInput}
  </div>`
}

export function refreshConditionPicker(wrapEl, item) {
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
   wrapEl.outerHTML = renderConditionPicker(field, entry.system?.[fieldKey])
}

export function damageRowHtml(d, idx) {
   const cur = d ?? {}
   const rollOptionsPlaceholder = customRollOptionsPlaceholder()
   const dieOpts = DAMAGE_DIE_OPTIONS.map(
      (o) =>
         `<option value="${escapeHTML(o.value)}" ${o.value === (cur.dieSize ?? "-") ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
   ).join("")
   const typeOpts = getDamageTypeOptions()
      .map(
         (o) =>
            `<option value="${escapeHTML(o.value)}" ${o.value === cur.damageType ? "selected" : ""}>${escapeHTML(localize(o.label))}</option>`,
      )
      .join("")
   const catOpts = DAMAGE_CATEGORY_OPTIONS.map(
      (o) =>
         `<option value="${escapeHTML(o.value)}" ${o.value === (cur.category ?? "normal") ? "selected" : ""}>${localize(o.label)}</option>`,
   ).join("")
   const visual = getDamageTypeVisual(cur.damageType)
   const extraValue = String(cur.extraRollOptions ?? "")

   return `<div class="atw-damage-row" data-index="${idx}">
    <div class="atw-damage-row-main">
      <input type="number" class="atw-damage-count" min="0" step="1" value="${escapeHTML(String(cur.diceCount ?? 0))}">
      <span class="atw-damage-d">d</span>
      <select class="atw-damage-die">${dieOpts}</select>
      <i class="fa-solid ${escapeHTML(visual.icon)} atw-damage-icon" style="color: ${escapeHTML(visual.color)}" aria-hidden="true"></i>
      <select class="atw-damage-type">${typeOpts}</select>
      <select class="atw-damage-category">${catOpts}</select>
      <a data-action="remove-damage" class="atw-damage-remove">
        <i class="fa-solid fa-minus"></i>
      </a>
    </div>
    <div class="atw-damage-extra-row">
      <span class="atw-extra-roll-options-label">Custom roll options</span>
      <input type="text" class="atw-damage-extra"
             placeholder="${escapeHTML(rollOptionsPlaceholder)}"
             value="${escapeHTML(extraValue)}">
    </div>
  </div>`
}

export function renderDamageList(field, value) {
   const arr = Array.isArray(value) ? value : []
   const rows = arr.map((d, i) => damageRowHtml(d, i)).join("")
   return `<div class="atw-damage-list" data-atw-sprop="${field.key}">
    ${rows}
    <a data-action="add-damage" class="atw-damage-add">
      <i class="fa-solid fa-plus"></i>
      <span>${localize("PF2EATW.Field.AddDamage")}</span>
    </a>
  </div>`
}

export function refreshDamageList(wrapEl, item) {
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
   wrapEl.outerHTML = renderDamageList(field, entry.system?.[fieldKey] ?? [])
}

export function renderTileEditor(field, value) {
   const data = value && typeof value === "object" ? value : {}
   const src = data.texture?.src || ""
   const preview = src
      ? isVideoSrc(src)
         ? `<video class="atw-tile-preview" src="${escapeHTML(src)}" autoplay loop muted playsinline></video>`
         : `<img class="atw-tile-preview" src="${escapeHTML(src)}" alt="">`
      : `<div class="atw-tile-preview atw-tile-preview-empty"><i class="fa-solid fa-image"></i></div>`
   const labelKey = src
      ? "PF2EATW.Field.ReconfigureTile"
      : "PF2EATW.Field.ConfigureTile"
   return `<div class="atw-tile-editor" data-atw-sprop="${field.key}">
    ${preview}
    <a data-action="open-tile-editor" class="atw-tile-editor-button">
      <i class="fa-solid fa-pen-to-square"></i>
      <span>${escapeHTML(localize(labelKey))}</span>
    </a>
  </div>`
}

export function renderTileList(field, value) {
   const rows = normalizeTileAttachments(value)
   const hasStoredRows = rows.length > 0
   const visibleRows = rows.length ? rows : [defaultTileAttachment()]
   return `<div class="atw-tile-list" data-atw-sprop="${field.key}">
    ${visibleRows.map((row, i) => tileListRowHtml(row, i, hasStoredRows)).join("")}
    <a data-action="add-tile" class="atw-tile-add">
      <i class="fa-solid fa-plus"></i>
      <span>${escapeHTML(localize("PF2EATW.Field.AddTile"))}</span>
    </a>
  </div>`
}

export function tileListRowHtml(row, idx, canRemove) {
   const data = row?.tile && typeof row.tile === "object" ? row.tile : {}
   const src = data.texture?.src || ""
   const preview = src
      ? isVideoSrc(src)
         ? `<video class="atw-tile-preview" src="${escapeHTML(src)}" autoplay loop muted playsinline></video>`
         : `<img class="atw-tile-preview" src="${escapeHTML(src)}" alt="">`
      : `<div class="atw-tile-preview atw-tile-preview-empty"><i class="fa-solid fa-image"></i></div>`
   const labelKey = src
      ? "PF2EATW.Field.ReconfigureTile"
      : "PF2EATW.Field.ConfigureTile"
   const shape = row?.shape ?? "all"
   const shapeOpts = TILE_SHAPE_FILTER_OPTIONS.map(
      (o) =>
         `<option value="${escapeHTML(o.value)}" ${String(o.value) === String(shape) ? "selected" : ""}>` +
         `${escapeHTML(localize(o.label))}</option>`,
   ).join("")
   const removeBtn = canRemove
      ? `<a data-action="remove-tile" class="atw-tile-remove" aria-label="Remove">
        <i class="fa-solid fa-trash"></i>
      </a>`
      : ""
   return `<div class="atw-tile-editor atw-tile-row" data-index="${idx}">
    ${preview}
    <a data-action="open-tile-editor" class="atw-tile-editor-button">
      <i class="fa-solid fa-pen-to-square"></i>
      <span>${escapeHTML(localize(labelKey))}</span>
    </a>
    <label class="atw-tile-shape-filter">
      <span>${escapeHTML(localize("PF2EATW.Field.TileShape"))}</span>
      <select class="atw-tile-shape-select">${shapeOpts}</select>
    </label>
    ${removeBtn}
  </div>`
}

export function isVideoSrc(src) {
   if (typeof src !== "string") return false
   const path = src.split("?")[0].toLowerCase()
   return (
      path.endsWith(".webm") ||
      path.endsWith(".mp4") ||
      path.endsWith(".m4v") ||
      path.endsWith(".ogv")
   )
}

export function refreshTileEditor(wrapEl, item) {
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
   wrapEl.outerHTML = renderTileEditor(field, entry.system?.[fieldKey])
}

export function refreshTileList(wrapEl, item) {
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
   wrapEl.outerHTML = renderTileList(field, entry.system?.[fieldKey] ?? [])
}

export function renderSoundEditor(field, value) {
   const data = value && typeof value === "object" ? value : {}
   const path = data.path || ""
   const has = !!path
   const labelKey = has
      ? "PF2EATW.Field.ReconfigureSound"
      : "PF2EATW.Field.ConfigureSound"
   const previewName = has ? path.split(/[/\\]/).pop() : ""
   return `<div class="atw-sound-editor" data-atw-sprop="${field.key}">
    <div class="atw-sound-preview ${has ? "" : "atw-sound-preview-empty"}">
      <i class="fa-solid fa-${has ? "music" : "volume-xmark"}"></i>
      <span class="atw-sound-preview-name">${escapeHTML(previewName)}</span>
    </div>
    <a data-action="open-sound-editor" class="atw-tile-editor-button">
      <i class="fa-solid fa-pen-to-square"></i>
      <span>${escapeHTML(localize(labelKey))}</span>
    </a>
  </div>`
}

export function refreshSoundEditor(wrapEl, item) {
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
   wrapEl.outerHTML = renderSoundEditor(field, entry.system?.[fieldKey])
}

export function renderLightEditor(field, value) {
   const data = value && typeof value === "object" ? value : {}
   const color = data.config?.color || "#ffffff"
   const dim = data.config?.dim ?? 0
   const bright = data.config?.bright ?? 0
   const has = dim > 0 || bright > 0
   const labelKey = has
      ? "PF2EATW.Field.ReconfigureLight"
      : "PF2EATW.Field.ConfigureLight"
   return `<div class="atw-light-editor" data-atw-sprop="${field.key}">
    <div class="atw-light-preview" style="background:${escapeHTML(has ? color : "transparent")}">
      <i class="fa-solid fa-${has ? "lightbulb" : "lightbulb-slash"}"></i>
    </div>
    <a data-action="open-light-editor" class="atw-tile-editor-button">
      <i class="fa-solid fa-pen-to-square"></i>
      <span>${escapeHTML(localize(labelKey))}</span>
    </a>
  </div>`
}

export function refreshLightEditor(wrapEl, item) {
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
   wrapEl.outerHTML = renderLightEditor(field, entry.system?.[fieldKey])
}

export function renderFilePicker(field, value) {
   const ph = field.placeholder ? localize(field.placeholder) : ""
   const fpType = field.filePickerType ?? "any"
   return `<div class="atw-file-picker" data-atw-sprop="${field.key}" data-fp-type="${escapeHTML(fpType)}">
    <input type="text" class="atw-file-picker-input"
           value="${escapeHTML(value ?? "")}"
           placeholder="${escapeHTML(ph)}">
    <a class="atw-file-picker-button" data-action="open-file-picker"
       data-tooltip="${escapeHTML(localize("PF2EATW.Field.BrowseFiles"))}">
      <i class="fa-solid fa-folder-open"></i>
    </a>
  </div>`
}

export function renderDiceFormula(field, value) {
   const cur =
      value && typeof value === "object" ? value : { diceCount: 1, dieSize: 20 }
   const count = Math.max(1, Number(cur.diceCount) || 1)
   const size = Math.max(2, Number(cur.dieSize) || 20)
   return `<div class="atw-dice-formula" data-atw-sprop="${field.key}">
    <input type="number" class="atw-dice-count" min="1" step="1" value="${escapeHTML(String(count))}">
    <span class="atw-dice-d">d</span>
    <input type="number" class="atw-dice-size" min="2" step="1" value="${escapeHTML(String(size))}">
  </div>`
}

export function renderDuration(field, value) {
   const cur = value && typeof value === "object" ? value : {}
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
   return `<div class="atw-duration" data-atw-sprop="${field.key}">
    <label class="atw-duration-toggle">
      <input type="checkbox" class="atw-duration-enabled" ${enabled ? "checked" : ""}>
      <span>${escapeHTML(localize("PF2EATW.Duration.Enabled"))}</span>
    </label>
    <div class="atw-duration-amount ${enabled ? "" : "atw-disabled"}">
      <input type="number" class="atw-duration-value" min="1" step="1" value="${amount}">
      <select class="atw-duration-unit">${unitOpts}</select>
    </div>
  </div>`
}

export function renderExtraRollOptions(field, value) {
   const cur =
      value && typeof value === "object" ? value : { enabled: true, value: "" }
   const text = String(cur.value ?? "")
   return `<div class="atw-extra-roll-options" data-atw-sprop="${field.key}">
    <span class="atw-extra-roll-options-label">Custom roll options</span>
    <input type="text" class="atw-extra-roll-options-input"
           placeholder="${escapeHTML(customRollOptionsPlaceholder())}"
           value="${escapeHTML(text)}">
  </div>`
}

function customRollOptionsPlaceholder() {
   return localize("PF2EATW.Field.RollOptionsExtraPlaceholder").replace(
      /^\s*e\.g\.\s*/i,
      "",
   )
}

export function validateRuleJson(raw) {
   if (typeof raw !== "string" || raw.trim() === "") {
      return { valid: false, message: "PF2EATW.RuleElement.Empty" }
   }
   try {
      const obj = JSON.parse(raw)
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
         return { valid: false, message: "PF2EATW.RuleElement.NotObject" }
      }
      if (typeof obj.key !== "string" || !obj.key) {
         return { valid: false, message: "PF2EATW.RuleElement.MissingKey" }
      }
      return { valid: true }
   } catch (e) {
      return {
         valid: false,
         message: e?.message ?? "PF2EATW.RuleElement.InvalidJson",
      }
   }
}

export function renderRuleElementList(field, value) {
   const arr = Array.isArray(value) ? value : []
   const rows = arr.map((raw, idx) => ruleElementRowHtml(raw, idx)).join("")
   return `<div class="atw-rule-list" data-atw-sprop="${field.key}">
    ${rows}
    <a data-action="add-rule" class="atw-rule-add">
      <i class="fa-solid fa-plus"></i>
      <span>${escapeHTML(localize("PF2EATW.RuleElement.Add"))}</span>
    </a>
  </div>`
}

export function ruleElementRowHtml(raw, idx) {
   const val =
      raw && typeof raw === "object"
         ? JSON.stringify(raw, null, 2)
         : (raw ?? "")
   const validation = validateRuleJson(val)
   const badge = validation.valid
      ? `<span class="atw-rule-badge atw-rule-valid"><i class="fa-solid fa-check"></i></span>`
      : `<span class="atw-rule-badge atw-rule-invalid"
             data-tooltip="${escapeHTML(localize(validation.message))}"
        ><i class="fa-solid fa-triangle-exclamation"></i></span>`
   return `<div class="atw-rule-row" data-index="${idx}">
    <div class="atw-rule-header">
      ${badge}
      <a data-action="format-rule" class="atw-rule-format"
         data-tooltip="${escapeHTML(localize("PF2EATW.RuleElement.Format"))}">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
      </a>
      <a data-action="remove-rule" class="atw-rule-remove">
        <i class="fa-solid fa-minus"></i>
      </a>
    </div>
    <textarea class="atw-rule-textarea" rows="6"
              spellcheck="false"
              placeholder="${escapeHTML(localize("PF2EATW.RuleElement.Placeholder"))}">${escapeHTML(val)}</textarea>
  </div>`
}

export function refreshRuleElementList(wrapEl, item) {
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
   wrapEl.outerHTML = renderRuleElementList(
      field,
      entry.system?.[fieldKey] ?? [],
   )
}

export function updateRuleRowBadge(rowEl, rawValue) {
   const v = validateRuleJson(rawValue)
   const slot = rowEl.querySelector(".atw-rule-badge")
   if (!slot) return
   if (v.valid) {
      slot.outerHTML = `<span class="atw-rule-badge atw-rule-valid"><i class="fa-solid fa-check"></i></span>`
   } else {
      slot.outerHTML = `<span class="atw-rule-badge atw-rule-invalid"
                           data-tooltip="${escapeHTML(localize(v.message))}"
                      ><i class="fa-solid fa-triangle-exclamation"></i></span>`
   }
}
