import { localize, renderModuleTemplate } from "../common/html.mjs"

export async function promptForImportJson() {
   return promptForJsonFile({
      title: localize("PF2EATW.IO.ImportDialogTitle"),
      prompt: localize("PF2EATW.IO.ImportDialogPrompt"),
   })
}

export async function promptForImportFile() {
   return promptForJsonFile({
      title: localize("PF2EATW.Compendium.ImportFileTitle"),
      prompt: localize("PF2EATW.Compendium.ImportFilePrompt"),
   })
}

async function promptForJsonFile({ title, prompt }) {
   const content = await renderModuleTemplate("dialogs/import-file.hbs", {
      prompt,
      accept: ".json,application/json",
   })
   const readFile = async (root) => {
      const file = root.querySelector(".atw-import-file")?.files?.[0]
      if (!file) return null
      if (typeof file.text === "function") return await file.text()
      return await new Promise((resolve, reject) => {
         const reader = new FileReader()
         reader.onload = () => resolve(String(reader.result ?? ""))
         reader.onerror = () => reject(reader.error)
         reader.readAsText(file)
      })
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
                  label: localize("PF2EATW.IO.Import"),
                  default: true,
                  callback: async (_e, _b, dlg) =>
                     resolve(await readFile(dlg.element)),
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
               label: localize("PF2EATW.IO.Import"),
               callback: async (html) =>
                  resolve(await readFile(html[0])),
            },
            cancel: {
               label: localize("PF2EATW.IO.Cancel"),
               callback: () => resolve(null),
            },
         },
         default: "import",
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
            cancel: {
               label: localize("PF2EATW.IO.Cancel"),
               callback: () => resolve(null),
            },
         },
         default: "save",
         close: () => resolve(null),
      }).render(true)
   })
}
