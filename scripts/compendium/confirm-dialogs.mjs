import { escapeHTML, localize } from "../common/html.mjs"

export async function confirmDelete(itemLabel) {
   const title = localize("PF2EATW.ConfirmDelete.Title")
   const promptTmpl = localize("PF2EATW.ConfirmDelete.Prompt")

   const content =
      "<p>" + promptTmpl.replace("{name}", escapeHTML(itemLabel)) + "</p>"
   return await confirmHtml(title, content, false)
}

export async function confirmHtml(title, content, defaultYes = false) {
   const DV2 = foundry?.applications?.api?.DialogV2
   if (DV2?.confirm) {
      try {
         return await DV2.confirm({
            window: { title },
            content,
            rejectClose: false,
            modal: true,
         })
      } catch (_e) {
         return false
      }
   }
   try {
      return await Dialog.confirm({ title, content, defaultYes })
   } catch (_e) {
      return false
   }
}
