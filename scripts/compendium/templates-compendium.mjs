import {
   FLAG_SCOPE,
   MODULE_ID,
   SUPPORTED_ITEM_TYPES,
} from "../data.mjs"
import { escapeHTML, localize, renderModuleTemplate } from "../common/html.mjs"
import {
   promptForImportFile,
} from "./templates-dialogs.mjs"
import { confirmDelete, confirmHtml } from "./confirm-dialogs.mjs"
import { isTemplateAutomation } from "./templates-automation.mjs"
import { TemplateEntryEditorApp } from "./template-entry-editor.mjs"
import { normalizeAutomation } from "../sheet/automation-storage.mjs"
import { canSaveTemplatesToCompendium } from "../settings/player-template-access.mjs"
import { executeAsGM } from "../runtime/socketlib.mjs"
import {
   normalizeEntrySlug,
   sanitizeTemplateEntry,
} from "./template-entry-item.mjs"
export { confirmDelete, confirmHtml } from "./confirm-dialogs.mjs"
export {
   cloneAutomation,
   cloneBehaviorWithFreshIds,
   cloneTemplateShapeWithFreshIds,
   isTemplateAutomation,
   mergeAutomationOntoItem,
} from "./templates-automation.mjs"
export {
   promptForImportFile,
   promptForImportJson,
   promptForSlug,
} from "./templates-dialogs.mjs"
const COMPENDIUM_SETTING = "templatesCompendium"

export function getTemplatesCompendium() {
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

export async function setTemplatesCompendium(entries) {
   if (!Array.isArray(entries)) entries = []
   await game.settings.set(MODULE_ID, COMPENDIUM_SETTING, entries)
   if (game.ready && canAutoAssignTemplates()) {
      reconcileTemplatesCompendiumAssignments({
         entries,
         reason: "templates-compendium-updated",
      }).catch((e) =>
         undefined,
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
         const label = `${entry.name ?? localize("PF2EATW.Compendium.Untitled")}${entry.slug ? ` (${entry.slug})` : ""}`
         return { id: row.id, label }
      })
   const content = await renderModuleTemplate("dialogs/compendium-import.hbs", {
      entries: selectEntries,
      templateLabel: localize("PF2EATW.Compendium.TemplateLabel"),
      replaceLabel: localize("PF2EATW.Compendium.ImportModeReplace"),
      appendLabel: localize("PF2EATW.Compendium.ImportModeAppend"),
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
            position: { width: 380 },
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
                  label: localize("PF2EATW.IO.Cancel"),
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
            cancel: {
               label: localize("PF2EATW.IO.Cancel"),
               callback: () => resolve(null),
            },
         },
         default: "import",
         close: () => resolve(null),
      }, { width: 380 }).render(true)
   })
}

export async function saveAutomationToCompendium(item, automation, info) {
   const slug = info?.slug ?? ""
   const name = info?.name || item?.name || localize("PF2EATW.Compendium.Untitled")
   const cleanAutomation = normalizeAutomation(automation, item)

   if (!game.user?.isGM) {
      let overwriteSlug = false
      if (slug) {
         const entries = getTemplatesCompendium()
         const existingIdx = entries.findIndex((e) => e.slug === slug)
         if (existingIdx >= 0) {
            overwriteSlug = await confirmHtml(
               localize("PF2EATW.Compendium.SlugConflictTitle"),
               `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", slug))}</p>`,
               false,
            )
            if (!overwriteSlug) return false
         }
      }
      const result = await executeAsGM("saveAutomationToCompendium", {
         userId: game.user.id,
         slug,
         name,
         automation: cleanAutomation,
         overwriteSlug,
      })
      return !!result?.ok
   }

   return saveAutomationRecord({
      slug,
      name,
      automation: cleanAutomation,
      confirmSlugConflict: true,
   })
}

export async function gmSaveAutomationToCompendium(payload = {}) {
   if (!game.user?.isGM) return { ok: false, reason: "not-gm" }
   const requester = payload.userId ? game.users?.get?.(payload.userId) : null
   if (!canSaveTemplatesToCompendium(requester)) {
      return { ok: false, reason: "not-allowed" }
   }
   const cleanAutomation = normalizeAutomation(payload.automation ?? null)
   const ok = await saveAutomationRecord({
      slug: normalizeEntrySlug(payload.slug),
      name: String(payload.name || localize("PF2EATW.Compendium.Untitled")),
      automation: cleanAutomation,
      overwriteSlug: !!payload.overwriteSlug,
      confirmSlugConflict: false,
   })
   return ok ? { ok: true } : { ok: false, reason: "save-failed" }
}

async function saveAutomationRecord({
   slug = "",
   name = localize("PF2EATW.Compendium.Untitled"),
   automation,
   overwriteSlug = false,
   confirmSlugConflict = true,
} = {}) {
   const entries = getTemplatesCompendium()

   if (slug) {
      const existingIdx = entries.findIndex((e) => e.slug === slug)
      if (existingIdx >= 0) {
         const overwrite =
            overwriteSlug ||
            (confirmSlugConflict
               ? await confirmHtml(
                    localize("PF2EATW.Compendium.SlugConflictTitle"),
                    `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", slug))}</p>`,
                    false,
                 )
               : false)
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
         "atw-export": TemplatesCompendiumApp._onExport,
         "atw-bulk-export": TemplatesCompendiumApp._onBulkExport,
         "atw-bulk-import": TemplatesCompendiumApp._onBulkImport,
         "atw-new-blank": TemplatesCompendiumApp._onNewBlank,
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
         bulkExportLabel: localize("PF2EATW.Compendium.BulkExport"),
         bulkImportLabel: localize("PF2EATW.IO.Import"),
         nameLabel: localize("PF2EATW.Compendium.NameLabel"),
         slugLabel: localize("PF2EATW.Compendium.SlugLabel"),
         behaviorCountLabel: localize("PF2EATW.Compendium.BehaviorCount"),
         emptyLabel: localize("PF2EATW.Compendium.Empty"),
         editTooltip: localize("PF2EATW.Compendium.EditTooltip"),
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
      new TemplateEntryEditorApp({
         entry,
         onSave: (updated) =>
            saveCompendiumEntryFromEditor(updated, {
               originalId: id,
               app: this,
            }),
      }).render({ force: true })
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
         ui.notifications?.info(localize("PF2EATW.IO.CopiedToClipboard"))
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
         ui.notifications?.info(localize("PF2EATW.IO.CopiedToClipboard"))
      }
   }

   static async _onBulkImport(_event, _target) {
      const json = await promptForImportFile()
      if (!json) return
      let parsed
      try {
         parsed = JSON.parse(json)
      } catch (_e) {
         ui.notifications?.error(localize("PF2EATW.IO.InvalidJson"))
         return
      }
      const sanitized = importedTemplateEntries(parsed)
      if (sanitized.length === 0) {
         ui.notifications?.error(localize("PF2EATW.Compendium.ExpectedEntries"))
         return
      }
      const current = getTemplatesCompendium()
      const collisions = importedSlugCollisions(current, sanitized)
      let replaceCollisions = false
      if (collisions.length > 0) {
         replaceCollisions = await confirmHtml(
            localize("PF2EATW.Compendium.ReplaceMatchingTitle"),
            collisionPromptHtml(collisions),
            false,
         )
      }
      const result = mergeImportedTemplateEntries(
         current,
         sanitized,
         replaceCollisions,
      )
      await setTemplatesCompendium(result.entries)
      ui.notifications?.info(importSummaryText(result))
      this.render({ force: true })
   }

   static async _onNewBlank(_event, _target) {
      new TemplateEntryEditorApp({
         entry: {
            name: localize("PF2EATW.Compendium.NewBlankDefaultName"),
            slug: "",
         },
         onSave: (entry) =>
            saveCompendiumEntryFromEditor(entry, {
               originalId: null,
               app: this,
            }),
      }).render({ force: true })
   }
}

function importedTemplateEntries(parsed) {
   const rows = Array.isArray(parsed) ? parsed : [parsed]
   return rows
      .filter(
         (entry) =>
            entry &&
            typeof entry === "object" &&
            entry.automation &&
            Array.isArray(entry.automation.behaviors),
      )
      .map((entry) =>
         sanitizeTemplateEntry({
            id: entry.id ?? foundry.utils.randomID(),
            slug: normalizeEntrySlug(entry.slug),
            name: String(entry.name ?? localize("PF2EATW.Compendium.Untitled")),
            automation: entry.automation,
         }),
      )
}

function importedSlugCollisions(existingEntries, importedEntries) {
   const existingSlugs = new Set(
      existingEntries
         .map((entry) => normalizeEntrySlug(entry?.slug))
         .filter(Boolean),
   )
   return importedEntries.filter((entry) => {
      const slug = normalizeEntrySlug(entry?.slug)
      return slug && existingSlugs.has(slug)
   })
}

function collisionPromptHtml(collisions) {
   const shown = collisions.slice(0, 20)
   const rows = shown
      .map(
         (entry) =>
            `<li><code>${escapeHTML(entry.slug)}</code> ${escapeHTML(entry.name ?? "")}</li>`,
      )
      .join("")
   const more =
      collisions.length > shown.length
         ? `<p>${escapeHTML(
              localize("PF2EATW.Compendium.ReplaceMatchingMore").replace(
                 "{count}",
                 String(collisions.length - shown.length),
              ),
           )}</p>`
         : ""
   return `<p>${escapeHTML(
      localize("PF2EATW.Compendium.ReplaceMatchingPrompt").replace(
         "{count}",
         String(collisions.length),
      ),
   )}</p>
      <p>${escapeHTML(localize("PF2EATW.Compendium.ReplaceMatchingChoice"))}</p>
      <ul>${rows}</ul>
      ${more}`
}

function importSummaryText(result) {
   const total = result.added + result.replaced
   let message = localize("PF2EATW.Compendium.ImportSummary").replace(
      "{count}",
      String(total),
   )
   if (result.replaced) {
      message +=
         " " +
         localize("PF2EATW.Compendium.ImportSummaryReplaced").replace(
            "{count}",
            String(result.replaced),
         )
   }
   if (result.skipped) {
      message +=
         " " +
         localize("PF2EATW.Compendium.ImportSummarySkipped").replace(
            "{count}",
            String(result.skipped),
         )
   }
   return message
}

function mergeImportedTemplateEntries(existingEntries, importedEntries, replaceCollisions) {
   const entries = foundry.utils.deepClone(existingEntries)
   const bySlug = new Map()
   const usedIds = new Set()
   for (let index = 0; index < entries.length; index++) {
      const id = entries[index]?.id
      if (id) usedIds.add(String(id))
      const slug = normalizeEntrySlug(entries[index]?.slug)
      if (slug && !bySlug.has(slug)) bySlug.set(slug, index)
   }

   let added = 0
   let replaced = 0
   let skipped = 0
   for (const imported of importedEntries) {
      const clean = sanitizeTemplateEntry(imported)
      const slug = normalizeEntrySlug(clean.slug)
      const existingIndex = slug ? bySlug.get(slug) : undefined
      if (existingIndex !== undefined) {
         if (!replaceCollisions) {
            skipped += 1
            continue
         }
         clean.id = entries[existingIndex].id ?? clean.id
         entries[existingIndex] = clean
         usedIds.add(String(clean.id))
         replaced += 1
         continue
      }
      clean.id = uniqueTemplateEntryId(clean.id, usedIds)
      usedIds.add(String(clean.id))
      entries.push(clean)
      if (slug) bySlug.set(slug, entries.length - 1)
      added += 1
   }
   return { entries, added, replaced, skipped }
}

function uniqueTemplateEntryId(preferred, usedIds) {
   let id = preferred ? String(preferred) : foundry.utils.randomID()
   while (usedIds.has(id)) id = foundry.utils.randomID()
   return id
}

async function saveCompendiumEntryFromEditor(
   entry,
   { originalId = null, app = null } = {},
) {
   const clean = sanitizeTemplateEntry(entry)
   clean.slug = normalizeEntrySlug(clean.slug)
   const entries = getTemplatesCompendium()
   let index = originalId
      ? entries.findIndex((existing) => existing.id === originalId)
      : -1

   if (clean.slug) {
      const collision = entries.findIndex(
         (existing) =>
            existing.id !== originalId &&
            normalizeEntrySlug(existing.slug) === clean.slug,
      )
      if (collision >= 0) {
         const overwrite = await confirmHtml(
            localize("PF2EATW.Compendium.SlugConflictTitle"),
            `<p>${escapeHTML(localize("PF2EATW.Compendium.SlugConflict").replace("{slug}", clean.slug))}</p>`,
            false,
         )
         if (!overwrite) return false
         entries.splice(collision, 1)
         if (index > collision) index -= 1
      }
   }

   if (index >= 0) entries[index] = clean
   else entries.push(clean)
   await setTemplatesCompendium(entries)
   app?.render({ force: true })
   return true
}

export function registerTemplatesCompendiumHooks() {
   Hooks.on("createItem", onCreateItemForAutoAssign)
   Hooks.on("createActor", onCreateActorForAutoAssign)
   Hooks.once("ready", () => {
      if (!canAutoAssignTemplates()) return
      setTimeout(() => {
         reconcileTemplatesCompendiumAssignments({ reason: "ready" }).catch(
            (e) => {
               undefined
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
      undefined
   }
}

function onCreateActorForAutoAssign(actor) {
   if (!canAutoAssignTemplates()) return
   setTimeout(() => {
      reconcileActorItems(actor, { reason: "create-actor" }).catch((e) => {
         undefined
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

function isCompendiumItem(item) {
   if (!item) return false
   if (item.pack) return true
   if (item.compendium) return true
   const parentPack = item.parent?.pack ?? item.parent?.compendium
   return !!parentPack
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
   if (isCompendiumItem(item)) return false
   if (hasAutomationFlag(item)) return false

   const slug = itemTemplateSlug(item)
   if (!slug) return false
   const lookup = bySlug ?? templatesBySlug(entries ?? getTemplatesCompendium())
   const match = lookup.get(slug)
   if (!match) return false

   try {
      await item.setFlag(
         FLAG_SCOPE,
         "automation",
         normalizeAutomation(match.automation, item),
      )
   } catch (e) {
      if (String(e?.message ?? "").includes("locked compendium")) return false
      throw e
   }
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
