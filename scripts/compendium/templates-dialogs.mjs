import { defaultAutomation } from "../data.mjs"
import { localize, renderModuleTemplate } from "../common/html.mjs"

export async function promptForImportJson() {
   const title = localize("PF2EATW.IO.ImportDialogTitle")
   const prompt = localize("PF2EATW.IO.ImportDialogPrompt")
   const content = await renderModuleTemplate("dialogs/import-json.hbs", {
      prompt,
      rows: 14,
      value: "",
   })
   const DV2 = foundry?.applications?.api?.DialogV2
   if (DV2?.wait) {
      return await new Promise((resolve) => {
         DV2.wait({
            window: { title },
            content,
            buttons: [
               {
                  action: "import",
                  label: localize("PF2EATW.IO.Import"),
                  default: true,
                  callback: (_e, _b, dlg) => {
                     const ta = dlg.element.querySelector(
                        ".atw-import-textarea",
                     )
                     resolve(ta?.value ?? "")
                  },
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
               label: localize("PF2EATW.IO.Import"),
               callback: (html) => {
                  const ta = html[0].querySelector(".atw-import-textarea")
                  resolve(ta?.value ?? "")
               },
            },
            cancel: { label: "Cancel", callback: () => resolve(null) },
         },
         default: "import",
         close: () => resolve(null),
      }).render(true)
   })
}

export async function promptForAutomationJson(
   initialAutomation,
   { title = "Edit Automation" } = {},
) {
   const json = JSON.stringify(
      initialAutomation ?? defaultAutomation(),
      null,
      2,
   )
   const content = await renderModuleTemplate("dialogs/import-json.hbs", {
      prompt: "",
      rows: 18,
      value: json,
   })
   const readValue = (root) =>
      root.querySelector(".atw-import-textarea")?.value ?? ""
   const DV2 = foundry?.applications?.api?.DialogV2
   if (DV2?.wait) {
      return await new Promise((resolve) => {
         DV2.wait({
            window: { title },
            content,
            buttons: [
               {
                  action: "save",
                  label: localize("PF2EATW.Compendium.SaveAutomationJson"),
                  default: true,
                  callback: (_e, _b, dlg) => resolve(readValue(dlg.element)),
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
            save: {
               label: localize("PF2EATW.Compendium.SaveAutomationJson"),
               callback: (html) => resolve(readValue(html[0])),
            },
            cancel: { label: "Cancel", callback: () => resolve(null) },
         },
         default: "save",
         close: () => resolve(null),
      }).render(true)
   })
}

export async function promptForSlug(item) {
   const title = localize("PF2EATW.Compendium.SaveDialogTitle")
   const prompt = localize("PF2EATW.Compendium.SaveDialogPrompt")
   const slugLabel = localize("PF2EATW.Compendium.SlugLabel")
   const nameLabel = localize("PF2EATW.Compendium.NameLabel")
   const itemSlug = item?.system?.slug ?? item?.slug ?? ""
   const itemName = item?.name ?? ""
   const content = await renderModuleTemplate("dialogs/save-template.hbs", {
      prompt,
      nameLabel,
      slugLabel,
      itemName,
      itemSlug,
      slugPlaceholder: localize("PF2EATW.Compendium.SlugPlaceholder"),
      slugHint: localize("PF2EATW.Compendium.SlugHint"),
   })
   const DV2 = foundry?.applications?.api?.DialogV2
   if (DV2?.wait) {
      return await new Promise((resolve) => {
         DV2.wait({
            window: { title },
            content,
            buttons: [
               {
                  action: "save",
                  label: localize("PF2EATW.Compendium.AddButton"),
                  default: true,
                  callback: (_e, _b, dlg) => {
                     const name =
                        dlg.element.querySelector(".atw-save-name")?.value ?? ""
                     const slug =
                        dlg.element.querySelector(".atw-save-slug")?.value ?? ""
                     resolve({
                        name: name.trim(),
                        slug: slug.trim().toLowerCase(),
                     })
                  },
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
            save: {
               label: localize("PF2EATW.Compendium.AddButton"),
               callback: (html) => {
                  const name =
                     html[0].querySelector(".atw-save-name")?.value ?? ""
                  const slug =
                     html[0].querySelector(".atw-save-slug")?.value ?? ""
                  resolve({
                     name: name.trim(),
                     slug: slug.trim().toLowerCase(),
                  })
               },
            },
            cancel: { label: "Cancel", callback: () => resolve(null) },
         },
         default: "save",
         close: () => resolve(null),
      }).render(true)
   })
}
