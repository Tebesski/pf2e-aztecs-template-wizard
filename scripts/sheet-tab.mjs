import {
   MODULE_ID,
   SUPPORTED_ITEM_TYPES,
} from "./data.mjs"
import { localize } from "./common/html.mjs"
import { autoAssignTemplateToItem } from "./compendium/templates-compendium.mjs"
import { renderTabContent } from "./sheet/renderers.mjs"
import { wireTab } from "./sheet/wire-tab.mjs"
import { canEditTemplateAutomation } from "./settings/player-template-access.mjs"
import { NAV_CLASS, TAB_CLASS, TAB_NAME } from "./sheet/tab-constants.mjs"

export function registerSheetTab() {
   Hooks.on("renderItemSheet", _onRender)
   Hooks.on("renderItemSheetV2", _onRender)
}

function _asJQuery(html) {
   if (!html) return null
   if (typeof html.find === "function" && typeof html.append === "function")
      return html
   if (html instanceof HTMLElement || html instanceof DocumentFragment) {
      if (typeof globalThis.$ === "function") return globalThis.$(html)
      if (typeof globalThis.jQuery === "function")
         return globalThis.jQuery(html)
   }
   return null
}

async function _onRender(sheet, html) {
   const item = sheet.item ?? sheet.document
   if (!item) return
   if (!SUPPORTED_ITEM_TYPES.has(item.type)) return
   if (!canEditTemplateAutomation(item)) return
   try {
      if (game.user?.isGM) {
         await autoAssignTemplateToItem(item, { reason: "item-sheet-render" })
      }
   } catch (_e) {}

   const $html = _asJQuery(html)
   if (!$html) return
   if ($html.find(`.${TAB_CLASS}`).length > 0) return

   $html.find(`.${NAV_CLASS}`).remove()
   $html.find(`.${TAB_CLASS}`).remove()

   if (sheet._atwActiveTab === undefined) {
      sheet._atwActiveTab = sheet._tabs?.[0]?.active ?? "description"
   }
   $html.on("click", ".sheet-navigation .item", (ev) => {
      sheet._atwActiveTab = ev.currentTarget.dataset.tab
   })

   const tabNav = $html.find(".sheet-navigation .item, .tabs [data-tab]").last()
   const navHtml =
      `<a class="item ${NAV_CLASS}" data-tab="${TAB_NAME}" ` +
      `data-tooltip="${localize("PF2EATW.TabLabel")}" ` +
      `aria-label="${localize("PF2EATW.TabLabel")}">` +
      `<i class="fa-solid fa-wand-magic-sparkles"></i></a>`

   if (tabNav.length) tabNav.after(navHtml)
   else $html.find(".sheet-navigation, nav").first().append(navHtml)

   const body = $html.find(".sheet-body, .tab-body").first()
   if (!body.length) {
      undefined
      return
   }
   body.append(
      `<div class="tab ${TAB_CLASS}" data-tab="${TAB_NAME}">${renderTabContent(item)}</div>`,
   )

   try {
      sheet._tabs?.[0]?.bind($html[0])
   } catch (_e) {}

   if (sheet._atwActiveTab === TAB_NAME) {
      $html.find(".sheet-navigation .item").removeClass("active")
      $html.find(`.${NAV_CLASS}`).addClass("active")
      $html.find(".sheet-body > .tab, .tab-body > .tab").removeClass("active")
      $html.find(`.${TAB_CLASS}`).addClass("active")
   }

   if (item.isOwner) wireTab($html, item, sheet)
}
