import {
   FLAG_SCOPE,
   MODULE_ID,
   SUPPORTED_ITEM_TYPES,
   defaultAutomation,
} from "../data.mjs"
import { escapeHTML, localize, renderModuleTemplate } from "../common/html.mjs"
import {
   promptForAutomationJson,
   promptForImportJson,
   promptForSlug,
} from "./templates-dialogs.mjs"
import { confirmDelete, confirmHtml } from "./confirm-dialogs.mjs"
import { isTemplateAutomation } from "./templates-automation.mjs"
export { confirmDelete, confirmHtml } from "./confirm-dialogs.mjs"
export {
   cloneAutomation,
   cloneBehaviorWithFreshIds,
   cloneTemplateShapeWithFreshIds,
   isTemplateAutomation,
   mergeAutomationOntoItem,
} from "./templates-automation.mjs"
export { promptForImportJson, promptForSlug } from "./templates-dialogs.mjs"
const COMPENDIUM_SETTING = "templatesCompendium"

function getTemplatesCompendium() {
   try {
      const raw = game.settings.get(MODULE_ID, COMPENDIUM_SETTING)
      if (Array.isArray(raw)) return raw
      if (typeof raw === "string" && raw.trim()) {
         const parsed = JSON.parse(raw)
         if (Array.isArray(parsed)) return parsed
      }
   } catch (_e) {}
   return []
}

async function setTemplatesCompendium(entries) {
   if (!Array.isArray(entries)) entries = []
   await game.settings.set(MODULE_ID, COMPENDIUM_SETTING, entries)
   if (game.ready && canAutoAssignTemplates()) {
      reconcileTemplatesCompendiumAssignments({
         entries,
         reason: "templates-compendium-updated",
      }).catch((e) =>
         console.warn(`[${MODULE_ID}] auto-assign reconcile failed`, e),
      )
   }
}

export async function promptForCompendiumImport() {
   const rows = getTemplatesCompendium()
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry && isTemplateAutomation(entry.automation))
      .map(({ entry, index }) => ({
         entry,
         id: entry.id ? String(entry.id) : `entry-${index}`,
      }))
   if (rows.length === 0) {
      ui.notifications?.warn(localize("PF2EATW.Compendium.ImportEmpty"))
      return null
   }

   const title = localize("PF2EATW.Compendium.ImportFrom")
   const selectEntries = rows
      .slice()
      .sort((a, b) =>
         String(a.entry.name ?? "").localeCompare(String(b.entry.name ?? "")),
      )
      .map((row) => {
         const entry = row.entry
         const label = `${entry.name ?? "Untitled"}${entry.slug ? ` (${entry.slug})` : ""}`
         return { id: row.id, label }
      })
   const content = await renderModuleTemplate("dialogs/compendium-import.hbs", {
      entries: selectEntries,
      templateLabel: localize("PF2EATW.Compendium.TemplateLabel"),
      replaceLabel: localize("PF2EATW.Compendium.ImportModeReplace"),
      appendLabel: localize("PF2EATW.Compendium.ImportModeAppend"),
      hint: localize("PF2EATW.Compendium.ImportModeHint"),
   })

   const readResult = (root) => {
      const id = root.querySelector(".atw-compendium-import-id")?.value ?? ""
      const mode =
         root.querySelector("input[name='atw-compendium-import-mode']:checked")
            ?.value ?? "replace"
      const row = rows.find((e) => e.id === id)
      return row ? { entry: row.entry, mode } : null
   }

   const DV2 = foundry?.applications?.api?.DialogV2
   if (DV2?.wait) {
      return await new Promise((resolve) => {
         DV2.wait({
            window: { title },
            content,
            buttons: [
               {
                  action: "import",
                  label: localize("PF2EATW.Compendium.ImportButton"),
                  default: true,
                  callback: (_e, _b, dlg) => resolve(readResult(dlg.element)),
               },
               {
                  action: "cancel",
                  label: "Cancel",
                  callback: () => resolve(null),
               },
            ],
            rejectClose: false,
            modal: true,
            close: () => resolve(null),
         }).catch(() => resolve(null))
      })
   }

   return await new Promise((resolve) => {
      new Dialog({
         title,
         content,
         buttons: {
            import: {
               label: localize("PF2EATW.Compendium.ImportButton"),
               callback: (html) => {
                  resolve(readResult(html[0]))
               },
            },
            cancel: { label: "Cancel", callback: () => resolve(null) },
         },
         default: "import",
         close: () => resolve(null),
      }).render(true)
   })
}

export async function saveAutomationToCompendium(item, automation, info) {
   const slug = info?.slug ?? ""
   const name = info?.name || item?.name || "Untitled"
   const entries = getTemplatesCompendium()

   if (slug) {
      const existingIdx = entries.findIndex((e) => e.slug === slug)
      if (existingIdx >= 0) {
         const overwrite = await confirmHtml(
            localize("PF2EATW.Compendium.SlugConflictTitle"),
            `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", slug))}</p>`,
            false,
         )
         if (!overwrite) return false
         entries[existingIdx] = {
            id: entries[existingIdx].id ?? foundry.utils.randomID(),
            slug,
            name,
            automation: foundry.utils.deepClone(automation),
         }
      } else {
         entries.push({
            id: foundry.utils.randomID(),
            slug,
            name,
            automation: foundry.utils.deepClone(automation),
         })
      }
   } else {
      entries.push({
         id: foundry.utils.randomID(),
         slug: "",
         name,
         automation: foundry.utils.deepClone(automation),
      })
   }
   await setTemplatesCompendium(entries)
   return true
}

export class TemplatesCompendiumApp extends (foundry.applications?.api
   ?.ApplicationV2 ?? Application) {
   static DEFAULT_OPTIONS = {
      id: "atw-templates-compendium",
      tag: "div",
      window: {
         title: "PF2EATW.Compendium.AppTitle",
         icon: "fa-solid fa-book-sparkles",
         resizable: true,
      },
      position: { width: 720, height: 600 },
      actions: {
         "atw-delete": TemplatesCompendiumApp._onDelete,
         "atw-edit": TemplatesCompendiumApp._onEdit,
         "atw-edit-json": TemplatesCompendiumApp._onEditJson,
         "atw-export": TemplatesCompendiumApp._onExport,
         "atw-bulk-export": TemplatesCompendiumApp._onBulkExport,
         "atw-bulk-import": TemplatesCompendiumApp._onBulkImport,
         "atw-new-blank": TemplatesCompendiumApp._onNewBlank,
         "atw-import-one": TemplatesCompendiumApp._onImportOne,
      },
   }

   async _renderHTML(_context, _options) {
      const entries = getTemplatesCompendium()
      return renderModuleTemplate("apps/templates-compendium.hbs", {
         empty: entries.length === 0,
         entries: entries.map((entry) => ({
            id: entry.id ?? "",
            name: entry.name ?? "",
            slug: entry.slug ?? "",
            behaviorCount: entry.automation?.behaviors?.length ?? 0,
         })),
         newBlankLabel: localize("PF2EATW.Compendium.NewBlank"),
         addNewLabel: localize("PF2EATW.Compendium.AddNew"),
         bulkExportLabel: localize("PF2EATW.Compendium.BulkExport"),
         bulkImportLabel: localize("PF2EATW.Compendium.BulkImport"),
         nameLabel: localize("PF2EATW.Compendium.NameLabel"),
         slugLabel: localize("PF2EATW.Compendium.SlugLabel"),
         behaviorCountLabel: localize("PF2EATW.Compendium.BehaviorCount"),
         emptyLabel: localize("PF2EATW.Compendium.Empty"),
         editTooltip: localize("PF2EATW.Compendium.EditTooltip"),
         editAutomationTooltip: localize(
            "PF2EATW.Compendium.EditAutomationTooltip",
         ),
         exportTooltip: localize("PF2EATW.Compendium.ExportOneTooltip"),
         deleteTooltip: localize("PF2EATW.Compendium.DeleteTooltip"),
      })
   }

   _replaceHTML(html, content, _options) {
      if (typeof html === "string") content.innerHTML = html
      else content.replaceChildren(html)
   }

   static async _onDelete(_event, target) {
      const tr = target.closest("tr[data-id]")
      if (!tr) return
      const id = tr.dataset.id
      const entries = getTemplatesCompendium()
      const idx = entries.findIndex((e) => e.id === id)
      if (idx < 0) return
      const entry = entries[idx]
      const ok = await confirmDelete(
         `${entry.name}${entry.slug ? ` (${entry.slug})` : ""}`,
      )
      if (!ok) return
      entries.splice(idx, 1)
      await setTemplatesCompendium(entries)
      this.render({ force: true })
   }

   static async _onEdit(_event, target) {
      const tr = target.closest("tr[data-id]")
      if (!tr) return
      const id = tr.dataset.id
      const entries = getTemplatesCompendium()
      const idx = entries.findIndex((e) => e.id === id)
      if (idx < 0) return
      const entry = entries[idx]
      const info = await promptForSlug({
         name: entry.name,
         system: { slug: entry.slug },
      })
      if (info === null) return

      if (info.slug) {
         const collision = entries.findIndex(
            (e) => e.id !== id && e.slug === info.slug,
         )
         if (collision >= 0) {
            const overwrite = await confirmHtml(
               localize("PF2EATW.Compendium.SlugConflictTitle"),
               `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", info.slug))}</p>`,
               false,
            )
            if (!overwrite) return
            entries.splice(collision, 1)
         }
      }
      entries[idx] = {
         ...entry,
         name: info.name || entry.name,
         slug: info.slug,
      }
      await setTemplatesCompendium(entries)
      this.render({ force: true })
   }

   static async _onEditJson(_event, target) {
      const tr = target.closest("tr[data-id]")
      if (!tr) return
      const id = tr.dataset.id
      const entries = getTemplatesCompendium()
      const idx = entries.findIndex((e) => e.id === id)
      if (idx < 0) return
      const entry = entries[idx]
      const json = await promptForAutomationJson(entry.automation, {
         title: `${localize("PF2EATW.Compendium.EditAutomation")} — ${entry.name ?? "Template"}`,
      })
      if (!json) return
      let parsed
      try {
         parsed = JSON.parse(json)
      } catch (_e) {
         ui.notifications?.error("Invalid JSON.")
         return
      }
      const automation =
         parsed?.automation && isTemplateAutomation(parsed.automation)
            ? parsed.automation
            : parsed
      if (!isTemplateAutomation(automation)) {
         ui.notifications?.error(
            "That JSON does not contain Template Wizard automation.",
         )
         return
      }
      entries[idx] = { ...entry, automation }
      await setTemplatesCompendium(entries)
      this.render({ force: true })
   }

   static async _onExport(_event, target) {
      const tr = target.closest("tr[data-id]")
      if (!tr) return
      const id = tr.dataset.id
      const entry = getTemplatesCompendium().find((e) => e.id === id)
      if (!entry) return
      const json = JSON.stringify(entry, null, 2)
      const safe = (entry.slug || entry.name || "template").replace(
         /[^\w-]+/g,
         "-",
      )
      const filename = `atw-template-${safe}.json`
      const fn =
         foundry.utils?.saveDataToFile ??
         (typeof saveDataToFile === "function" ? saveDataToFile : null)
      if (fn) fn(json, "application/json", filename)
      else {
         await navigator.clipboard?.writeText(json)
         ui.notifications?.info("Copied to clipboard.")
      }
   }

   static async _onBulkExport(_event, _target) {
      const entries = getTemplatesCompendium()
      const json = JSON.stringify(entries, null, 2)
      const fn =
         foundry.utils?.saveDataToFile ??
         (typeof saveDataToFile === "function" ? saveDataToFile : null)
      if (fn) fn(json, "application/json", "atw-templates-compendium.json")
      else {
         await navigator.clipboard?.writeText(json)
         ui.notifications?.info("Copied to clipboard.")
      }
   }

   static async _onBulkImport(_event, _target) {
      const json = await promptForImportJson()
      if (!json) return
      let parsed
      try {
         parsed = JSON.parse(json)
      } catch (_e) {
         ui.notifications?.error("Invalid JSON.")
         return
      }
      if (!Array.isArray(parsed)) {
         ui.notifications?.error("Expected an array of template entries.")
         return
      }
      const overwrite = await confirmDelete(
         localize("PF2EATW.Compendium.BulkImportReplace"),
      )
      if (!overwrite) return

      const sanitized = parsed
         .filter(
            (e) =>
               e &&
               typeof e === "object" &&
               e.automation &&
               Array.isArray(e.automation.behaviors),
         )
         .map((e) => ({
            id: e.id ?? foundry.utils.randomID(),
            slug: String(e.slug ?? "").toLowerCase(),
            name: String(e.name ?? "Untitled"),
            automation: e.automation,
         }))
      await setTemplatesCompendium(sanitized)
      this.render({ force: true })
   }

   static async _onNewBlank(_event, _target) {
      const info = await promptForSlug({
         name: localize("PF2EATW.Compendium.NewBlankDefaultName"),
         system: { slug: "" },
      })
      if (info === null) return
      const entries = getTemplatesCompendium()
      const slug = String(info.slug ?? "").toLowerCase()
      if (slug) {
         const collision = entries.findIndex((e) => e.slug === slug)
         if (collision >= 0) {
            const overwrite = await confirmHtml(
               localize("PF2EATW.Compendium.SlugConflictTitle"),
               `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", slug))}</p>`,
               false,
            )
            if (!overwrite) return
            entries.splice(collision, 1)
         }
      }
      const automation = defaultAutomation()
      automation.label = info.name || ""
      entries.push({
         id: foundry.utils.randomID(),
         slug,
         name: info.name || localize("PF2EATW.Compendium.NewBlankDefaultName"),
         automation,
      })
      await setTemplatesCompendium(entries)
      this.render({ force: true })
   }

   static async _onImportOne(_event, _target) {
      const json = await promptForImportJson()
      if (!json) return
      let parsed
      try {
         parsed = JSON.parse(json)
      } catch (_e) {
         ui.notifications?.error("Invalid JSON.")
         return
      }
      if (!parsed || typeof parsed !== "object") return

      let entry
      if (parsed.automation && Array.isArray(parsed.automation.behaviors)) {
         entry = {
            id: parsed.id ?? foundry.utils.randomID(),
            slug: String(parsed.slug ?? "").toLowerCase(),
            name: String(parsed.name ?? "Imported"),
            automation: parsed.automation,
         }
      } else if (Array.isArray(parsed.behaviors)) {
         entry = {
            id: foundry.utils.randomID(),
            slug: "",
            name: "Imported",
            automation: parsed,
         }
      } else {
         ui.notifications?.error("Couldn't recognize the JSON as a template.")
         return
      }
      const entries = getTemplatesCompendium()

      if (entry.slug) {
         const collision = entries.findIndex((e) => e.slug === entry.slug)
         if (collision >= 0) {
            const overwrite = await confirmHtml(
               localize("PF2EATW.Compendium.SlugConflictTitle"),
               `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", entry.slug))}</p>`,
               false,
            )
            if (!overwrite) return
            entries.splice(collision, 1)
         }
      }
      entries.push(entry)
      await setTemplatesCompendium(entries)
      this.render({ force: true })
   }
}

export function registerTemplatesCompendiumHooks() {
   Hooks.on("createItem", onCreateItemForAutoAssign)
   Hooks.on("createActor", onCreateActorForAutoAssign)
   Hooks.once("ready", () => {
      if (!canAutoAssignTemplates()) return
      setTimeout(() => {
         reconcileTemplatesCompendiumAssignments({ reason: "ready" }).catch(
            (e) => {
               console.warn(`[${MODULE_ID}] auto-assign reconcile failed`, e)
            },
         )
      }, 500)
   })
}

async function onCreateItemForAutoAssign(item, options, userId) {
   if (!canAutoAssignTemplates()) return
   try {
      await autoAssignTemplateToItem(item, { reason: "create-item" })
   } catch (e) {
      console.warn(`[${MODULE_ID}] auto-assign failed`, e)
   }
}

function onCreateActorForAutoAssign(actor) {
   if (!canAutoAssignTemplates()) return
   setTimeout(() => {
      reconcileActorItems(actor, { reason: "create-actor" }).catch((e) => {
         console.warn(`[${MODULE_ID}] auto-assign actor reconcile failed`, e)
      })
   }, 500)
}

function canAutoAssignTemplates() {
   if (!game.user?.isGM) return false
   const activeGM = game.users?.activeGM
   return !activeGM || game.user.id === activeGM.id
}

function normalizeTemplateSlug(slug) {
   return String(slug ?? "")
      .trim()
      .toLowerCase()
}

function itemTemplateSlug(item) {
   return normalizeTemplateSlug(item?.system?.slug ?? item?.slug ?? "")
}

function hasAutomationFlag(item) {
   const existing = item?.getFlag?.(FLAG_SCOPE, "automation")
   return !!(existing && typeof existing === "object")
}

function templatesBySlug(entries = getTemplatesCompendium()) {
   const bySlug = new Map()
   for (const entry of Array.isArray(entries) ? entries : []) {
      const slug = normalizeTemplateSlug(entry?.slug)
      if (
         !slug ||
         !entry?.automation ||
         !Array.isArray(entry.automation.behaviors)
      )
         continue
      bySlug.set(slug, entry)
   }
   return bySlug
}

export async function autoAssignTemplateToItem(
   item,
   { entries = null, bySlug = null, reason = "auto" } = {},
) {
   if (!canAutoAssignTemplates()) return false
   if (!item || !SUPPORTED_ITEM_TYPES.has(item.type)) return false
   if (hasAutomationFlag(item)) return false

   const slug = itemTemplateSlug(item)
   if (!slug) return false
   const lookup = bySlug ?? templatesBySlug(entries ?? getTemplatesCompendium())
   const match = lookup.get(slug)
   if (!match) return false

   await item.setFlag(
      FLAG_SCOPE,
      "automation",
      foundry.utils.deepClone(match.automation),
   )
   return true
}

async function reconcileActorItems(
   actor,
   { entries = null, bySlug = null, reason = "actor" } = {},
) {
   if (!actor?.items) return { scanned: 0, applied: 0 }
   const lookup = bySlug ?? templatesBySlug(entries ?? getTemplatesCompendium())
   let scanned = 0
   let applied = 0
   for (const item of actor.items) {
      scanned += 1
      if (await autoAssignTemplateToItem(item, { bySlug: lookup, reason }))
         applied += 1
   }
   return { scanned, applied }
}

export async function reconcileTemplatesCompendiumAssignments({
   entries = null,
   reason = "manual",
} = {}) {
   if (!canAutoAssignTemplates()) return { scanned: 0, applied: 0 }
   const lookup = templatesBySlug(entries ?? getTemplatesCompendium())
   if (lookup.size === 0) return { scanned: 0, applied: 0 }

   const seen = new Set()
   const items = []
   const addItem = (item) => {
      if (!item) return
      const key = item.uuid ?? item.id
      if (!key || seen.has(key)) return
      seen.add(key)
      items.push(item)
   }

   for (const item of game.items ?? []) addItem(item)
   for (const actor of game.actors ?? []) {
      for (const item of actor.items ?? []) addItem(item)
   }
   for (const token of canvas?.tokens?.placeables ?? []) {
      for (const item of token.actor?.items ?? []) addItem(item)
   }

   let scanned = 0
   let applied = 0
   for (const item of items) {
      scanned += 1
      if (await autoAssignTemplateToItem(item, { bySlug: lookup, reason }))
         applied += 1
   }
   return { scanned, applied }
}
