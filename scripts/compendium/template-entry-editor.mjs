import { localize, renderModuleTemplate } from "../common/html.mjs"
import { renderTabContent } from "../sheet/renderers.mjs"
import { wireTab } from "../sheet/wire-tab.mjs"
import {
   createTemplateEntryItem,
   normalizeEntrySlug,
   sanitizeTemplateEntry,
} from "./template-entry-item.mjs"

export class TemplateEntryEditorApp extends (foundry.applications?.api
   ?.ApplicationV2 ?? Application) {
   static DEFAULT_OPTIONS = {
      id: "atw-template-entry-editor",
      tag: "div",
      window: {
         title: "PF2EATW.Compendium.TemplateAutomationTitle",
         icon: "fa-solid fa-wand-magic-sparkles",
         resizable: true,
      },
      position: { width: 760, height: 760 },
      actions: {
         "atw-save-entry": TemplateEntryEditorApp._onSave,
         "atw-close-entry": TemplateEntryEditorApp._onClose,
      },
   }

   constructor({ entry = null, onSave = null } = {}, options = {}) {
      const clean = sanitizeTemplateEntry(entry)
      super({
         ...options,
         window: {
            ...TemplateEntryEditorApp.DEFAULT_OPTIONS.window,
            ...(options.window ?? {}),
            title: entry
               ? localize("PF2EATW.Compendium.EditTemplateTitle").replace(
                    "{name}",
                    clean.name,
                 )
               : localize("PF2EATW.Compendium.NewTemplateTitle"),
         },
      })
      this.entry = clean
      this.onSave = onSave
      this.item = createTemplateEntryItem(clean, {
         editable: true,
         onChange: (next) => {
            this.entry = sanitizeTemplateEntry(next)
         },
      })
   }

   async _renderHTML(_context, _options) {
      return renderModuleTemplate("apps/template-entry-editor.hbs", {
         name: this.entry.name,
         slug: this.entry.slug,
         nameLabel: localize("PF2EATW.Compendium.Name"),
         slugLabel: localize("PF2EATW.Compendium.SlugLabel"),
         saveLabel: localize("PF2EATW.Compendium.AddButton"),
         cancelLabel: localize("PF2EATW.IO.Cancel"),
         editorHtml: renderTabContent(this.item, { showItemActions: false }),
      })
   }

   _replaceHTML(html, content, _options) {
      if (typeof html === "string") content.innerHTML = html
      else content.replaceChildren(html)
      this.renderedRoot = content
      const root = content.querySelector(".atw-template-entry-editor")
      root?.addEventListener("submit", (event) => {
         event.preventDefault()
         event.stopPropagation()
      })
      const sync = () => this._syncMetadata()
      content
         .querySelectorAll(".atw-template-entry-name, .atw-template-entry-slug")
         .forEach((input) => input.addEventListener("input", sync))
      wireTab($(content), this.item, this, { showItemActions: false })
   }

   _syncMetadata() {
      const root = this.element?.querySelector ? this.element : this.renderedRoot
      const name =
         root?.querySelector(".atw-template-entry-name")?.value ??
         this.entry.name
      const slug =
         root?.querySelector(".atw-template-entry-slug")?.value ??
         this.entry.slug
      this.entry = sanitizeTemplateEntry({
         ...this.item.atwCompendiumEntry,
         name:
            String(name || localize("PF2EATW.Compendium.NewBlankDefaultName")).trim() ||
            localize("PF2EATW.Compendium.NewBlankDefaultName"),
         slug: normalizeEntrySlug(slug),
      })
      this.item.name = this.entry.name
      this.item.system.slug = this.entry.slug
   }

   static async _onSave(_event, _target) {
      this._syncMetadata()
      const saved = await this.onSave?.(this.entry)
      if (saved !== false) await this.close()
   }

   static async _onClose(_event, _target) {
      await this.close()
   }
}
