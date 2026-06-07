import {
   BEHAVIOR_CATALOG,
   defaultBehaviorEntry,
} from "../data.mjs"
import { localize } from "../common/html.mjs"
import {
   cloneAutomation,
   confirmDelete,
   isTemplateAutomation,
   mergeAutomationOntoItem,
   promptForCompendiumImport,
   promptForImportJson,
   promptForSlug,
   saveAutomationToCompendium,
} from "../compendium/templates-compendium.mjs"
import {
   normalizeAutomation,
   readAutomation,
   saveAutomation,
} from "./automation-storage.mjs"

export function wireAutomationImportExportControls(
   $tab,
   $html,
   item,
   sheet,
   refreshPanel,
) {
   $tab.on("click", "[data-action='atw-export']", async (ev) => {
      ev.preventDefault()
      try {
         const a = readAutomation(item)
         const json = JSON.stringify(a, null, 2)
         const safe = (item.name ?? "automation").replace(/[^\w-]+/g, "-")
         const filename = `atw-${safe}.json`

         if (foundry.utils?.saveDataToFile) {
            foundry.utils.saveDataToFile(json, "application/json", filename)
         } else if (typeof saveDataToFile === "function") {
            saveDataToFile(json, "application/json", filename)
         } else {
            await navigator.clipboard?.writeText(json)
            ui.notifications?.info("Automation JSON copied to clipboard.")
         }
      } catch (e) {
         undefined
         ui.notifications?.error("Export failed.")
      }
   })

   $tab.on("click", "[data-action='atw-import']", async (ev) => {
      ev.preventDefault()
      try {
         const json = await promptForImportJson()
         if (!json) return
         let parsed
         try {
            parsed = JSON.parse(json)
         } catch (_e) {
            ui.notifications?.error("Invalid JSON.")
            return
         }
         const incoming = parsed?.automation ?? parsed
         if (!isTemplateAutomation(incoming)) {
            ui.notifications?.error(
               "That doesn't look like a Template Wizard automation.",
            )
            return
         }

         await saveAutomation(item, incoming)
         ui.notifications?.info("Automation imported.")
         refreshPanel($html, item, sheet)
      } catch (e) {
         undefined
         ui.notifications?.error("Import failed.")
      }
   })

   $tab.on("click", "[data-action='atw-save-to-compendium']", async (ev) => {
      ev.preventDefault()
      try {
         const info = await promptForSlug(item)
         if (info === null) return
         const a = readAutomation(item)
         const saved = await saveAutomationToCompendium(item, a, info)
         if (!saved) return
         ui.notifications?.info(
            info.slug
               ? `Saved to Templates Compendium with slug "${info.slug}".`
               : "Saved to Templates Compendium.",
         )
      } catch (e) {
         undefined
         ui.notifications?.error("Save failed.")
      }
   })

   $tab.on(
      "click",
      "[data-action='atw-import-from-compendium']",
      async (ev) => {
         ev.preventDefault()
         try {
            const result = await promptForCompendiumImport()
            if (!result) return
            const imported = normalizeAutomation(
               cloneAutomation(result.entry.automation),
               item,
            )
            if (!isTemplateAutomation(imported)) {
               ui.notifications?.error(
                  "That compendium entry does not contain Template Wizard automation.",
               )
               return
            }
            if (result.mode === "append") {
               const merged = mergeAutomationOntoItem(
                  readAutomation(item),
                  imported,
               )
               await saveAutomation(item, merged)
               ui.notifications?.info(
                  localize("PF2EATW.Compendium.ImportedAppend").replace(
                     "{name}",
                     result.entry.name ?? "",
                  ),
               )
            } else {
               await saveAutomation(item, imported)
               ui.notifications?.info(
                  localize("PF2EATW.Compendium.ImportedReplace").replace(
                     "{name}",
                     result.entry.name ?? "",
                  ),
               )
            }
            refreshPanel($html, item, sheet)
         } catch (e) {
            undefined
            ui.notifications?.error("Compendium import failed.")
         }
      },
   )
}

export function wireBehaviorListControls($tab, $html, item, sheet, refreshPanel) {
   $tab.on("click", "[data-action='add-behavior']", async () => {
      const select = $tab.find('[data-role="behavior-type"]')[0]
      const type = select.value
      const entry = defaultBehaviorEntry(type)
      if (!entry) return
      const a = readAutomation(item)
      a.behaviors.push(entry)
      await saveAutomation(item, a)
      refreshPanel($html, item, sheet)
   })

   $tab.on("click", "[data-action='remove-behavior']", async (ev) => {
      const li = ev.currentTarget.closest(".atw-behavior")
      if (!li) return
      const id = li.dataset.id
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      const def = entry
         ? BEHAVIOR_CATALOG.find((b) => b.type === entry.type)
         : null
      const label = def ? localize(def.label) : (entry?.type ?? "behavior")
      if (!(await confirmDelete(label))) return
      a.behaviors = a.behaviors.filter((b) => b.id !== id)
      await saveAutomation(item, a)
      refreshPanel($html, item, sheet)
   })

   $tab.on("click", ".atw-behavior-header", async (ev) => {
      if (ev.target.closest("input, select, textarea, button")) return
      if (ev.target.closest("[data-action='remove-behavior']")) return
      const li = ev.currentTarget.closest(".atw-behavior")
      if (!li) return
      ev.preventDefault()
      const id = li.dataset.id
      const willCollapse = !li.classList.contains("atw-collapsed")
      li.classList.toggle("atw-collapsed", willCollapse)

      const icon = li.querySelector("[data-action='toggle-collapse'] i")
      if (icon) {
         icon.classList.toggle("fa-chevron-up", !willCollapse)
         icon.classList.toggle("fa-chevron-down", willCollapse)
      }
      const a = readAutomation(item)
      const entry = a.behaviors.find((b) => b.id === id)
      if (entry) {
         entry.collapsed = willCollapse
         await saveAutomation(item, a)
      }
   })

   $tab.on("click", "[data-action='toggle-accordion']", (ev) => {
      const acc = ev.currentTarget.closest(".atw-accordion")
      if (!acc) return
      const chev = acc.querySelector(".atw-accordion-chevron")
      const willCollapse = !acc.classList.contains("atw-accordion-collapsed")
      acc.classList.toggle("atw-accordion-collapsed", willCollapse)
      if (chev) {
         chev.classList.toggle("fa-chevron-down", willCollapse)
         chev.classList.toggle("fa-chevron-up", !willCollapse)
      }
   })
}
