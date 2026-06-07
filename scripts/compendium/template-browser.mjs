import { renderModuleTemplate } from "../common/html.mjs"
import { renderTabContent } from "../sheet/renderers.mjs"
import { getTemplatesCompendium } from "./templates-compendium.mjs"
import { isTemplateAutomation } from "./templates-automation.mjs"
import {
   createTemplateEntryItem,
   sanitizeTemplateEntry,
} from "./template-entry-item.mjs"
import {
   placeTemplateEntryVariant,
   resolvedAutomationForTemplateEntry,
   templateShapeBadges,
} from "./template-placement.mjs"

function searchableText(entry) {
   return [entry.name, entry.slug]
      .map((part) => String(part ?? "").toLowerCase())
      .join(" ")
}

function entriesForBrowser() {
   return getTemplatesCompendium()
      .filter((entry) => entry && isTemplateAutomation(entry.automation))
      .map((entry) => sanitizeTemplateEntry(entry))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

function entryView(entry) {
   const behaviorCount = entry.automation?.behaviors?.length ?? 0
   const resolvedAutomation = resolvedAutomationForTemplateEntry(entry)
   return {
      id: entry.id,
      name: entry.name,
      slug: entry.slug || "no-slug",
      search: searchableText(entry),
      behaviorCount: `${behaviorCount} ${behaviorCount === 1 ? "behavior" : "behaviors"}`,
      shapes: templateShapeBadges(resolvedAutomation),
   }
}

function findEntry(id) {
   return entriesForBrowser().find((entry) => entry.id === id) ?? null
}

export class TemplateBrowserApp extends (foundry.applications?.api
   ?.ApplicationV2 ?? Application) {
   static DEFAULT_OPTIONS = {
      id: "atw-template-browser",
      tag: "div",
      window: {
         title: "Template Automations",
         icon: "fa-solid fa-wand-magic-sparkles",
         resizable: true,
      },
      position: { width: 560, height: 680 },
      actions: {
         "atw-open-entry": TemplateBrowserApp._onOpenEntry,
         "atw-place-template": TemplateBrowserApp._onPlaceTemplate,
      },
   }

   async _renderHTML(_context, _options) {
      const entries = entriesForBrowser()
      return renderModuleTemplate("apps/template-browser.hbs", {
         empty: entries.length === 0,
         entries: entries.map(entryView),
         searchPlaceholder: "Search templates",
         emptyLabel: "No template automations saved.",
      })
   }

   _replaceHTML(html, content, _options) {
      if (typeof html === "string") content.innerHTML = html
      else content.replaceChildren(html)
      const search = content.querySelector(".atw-template-browser-search")
      search?.addEventListener("input", () => {
         const query = search.value.trim().toLowerCase()
         for (const row of content.querySelectorAll(
            ".atw-template-browser-entry",
         )) {
            row.hidden = query && !row.dataset.search.includes(query)
         }
      })
   }

   static async _onOpenEntry(_event, target) {
      const entry = findEntry(target.dataset.entryId)
      if (!entry) return
      new TemplateReaderApp({ entry }).render({ force: true })
   }

   static async _onPlaceTemplate(_event, target) {
      const entry = findEntry(target.dataset.entryId)
      if (!entry) return
      placeTemplateEntryVariant(entry, target.dataset.shapeIndex)
   }
}

export class TemplateReaderApp extends (foundry.applications?.api
   ?.ApplicationV2 ?? Application) {
   static DEFAULT_OPTIONS = {
      id: "atw-template-reader",
      tag: "div",
      window: {
         title: "Template Automation",
         icon: "fa-solid fa-wand-magic-sparkles",
         resizable: true,
      },
      position: { width: 720, height: 720 },
      actions: {
         "atw-place-template": TemplateReaderApp._onPlaceTemplate,
      },
   }

   constructor({ entry }, options = {}) {
      const clean = sanitizeTemplateEntry(entry)
      super({
         ...options,
         window: {
            ...TemplateReaderApp.DEFAULT_OPTIONS.window,
            ...(options.window ?? {}),
            title: clean.name,
         },
      })
      this.entry = clean
      this.item = createTemplateEntryItem(clean, { editable: false })
   }

   async _renderHTML(_context, _options) {
      return renderModuleTemplate("apps/template-reader.hbs", {
         name: this.entry.name,
         slug: this.entry.slug || "no-slug",
         shapes: templateShapeBadges(
            resolvedAutomationForTemplateEntry(this.entry),
         ),
         editorHtml: renderTabContent(this.item, { showItemActions: false }),
      })
   }

   _replaceHTML(html, content, _options) {
      if (typeof html === "string") content.innerHTML = html
      else content.replaceChildren(html)
      const body = content.querySelector(".atw-template-reader-body")
      body?.classList.add("atw-readonly")
      body
         ?.querySelectorAll("input, select, textarea, button")
         .forEach((input) => {
            input.disabled = true
         })
   }

   static async _onPlaceTemplate(_event, target) {
      placeTemplateEntryVariant(this.entry, target.dataset.shapeIndex)
   }
}

export function openTemplateBrowser() {
   new TemplateBrowserApp().render({ force: true })
}

export function registerTemplateBrowserControls() {
   Hooks.on("getSceneControlButtons", (controls) => {
      const tokens = Array.isArray(controls)
         ? controls.find((control) => control.name === "tokens")
         : controls.tokens
      if (!tokens?.tools) return
      const tool = {
         name: "atwTemplateBrowser",
         title: "Template Wizard",
         icon: "fa-solid fa-wand-magic-sparkles",
         button: true,
         visible: true,
         order: Object.keys(tokens.tools).length,
         onChange: () => openTemplateBrowser(),
      }
      if (Array.isArray(tokens.tools)) tokens.tools.push(tool)
      else tokens.tools.atwTemplateBrowser = tool
   })
}
