import { MODULE_ID } from "../data.mjs"
import { escapeHTML } from "../common/html.mjs"
import {
   installTemplatePlacementResize,
   registerTemplatePlacementResizeKeybindings,
} from "../template-placement-resize.mjs"

export function registerModuleSettings(TemplatesCompendiumApp) {
   game.settings.register(MODULE_ID, "applyDamageAutomatically", {
      name: "PF2EATW.Setting.AutoDamage",
      hint: "PF2EATW.Setting.AutoDamageHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })
   game.settings.register(MODULE_ID, "promptGmForApply", {
      name: "PF2EATW.Setting.PromptGm",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })
   game.settings.register(MODULE_ID, "templateResizeStepSquares", {
      name: "PF2EATW.Setting.TemplateResizeStep",
      hint: "PF2EATW.Setting.TemplateResizeStepHint",
      scope: "client",
      config: true,
      type: Number,
      range: { min: 0.25, max: 10, step: 0.25 },
      default: 1,
   })
   game.settings.register(MODULE_ID, "enableTemplateResizeRmb", {
      name: "PF2EATW.Setting.TemplateResizeRmb",
      hint: "PF2EATW.Setting.TemplateResizeRmbHint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
   })
   game.settings.register(MODULE_ID, "restrictTemplatePlacementRange", {
      name: "PF2EATW.Setting.RestrictTemplatePlacementRange",
      hint: "PF2EATW.Setting.RestrictTemplatePlacementRangeHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
   })
   game.settings.register(MODULE_ID, "drawTemplatePlacementRangeLine", {
      name: "PF2EATW.Setting.DrawTemplatePlacementRangeLine",
      hint: "PF2EATW.Setting.DrawTemplatePlacementRangeLineHint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
   })
   game.settings.register(MODULE_ID, "templatePlacementRangeLineColor", {
      name: "PF2EATW.Setting.TemplatePlacementRangeLineColor",
      scope: "client",
      config: true,
      type: String,
      default: "#ffcc33",
   })
   game.settings.register(MODULE_ID, "allowPlayerTemplates", {
      name: "PF2EATW.Setting.AllowPlayerTemplates",
      hint: "PF2EATW.Setting.AllowPlayerTemplatesHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })
   game.settings.register(MODULE_ID, "playerTemplateAccessLevel", {
      name: "PF2EATW.Setting.PlayerTemplateAccessLevel",
      scope: "world",
      config: true,
      type: String,
      choices: {
         none: "PF2EATW.Setting.AccessNone",
         trusted: "PF2EATW.Setting.AccessTrustedPlayer",
         player: "PF2EATW.Setting.AccessPlayer",
      },
      default: "trusted",
   })
   game.settings.register(MODULE_ID, "playerTemplateAccessUserIds", {
      name: "PF2EATW.Setting.PlayerTemplateAccessUserIds",
      scope: "world",
      config: false,
      type: Object,
      default: [],
   })
   game.settings.register(MODULE_ID, "allowPlayerTemplateCompendiumSave", {
      name: "PF2EATW.Setting.AllowPlayerTemplateCompendiumSave",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })
   game.settings.register(MODULE_ID, "allowPlayerTemplateImport", {
      name: "PF2EATW.Setting.AllowPlayerTemplateImport",
      hint: "PF2EATW.Setting.AllowPlayerTemplateImportHint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
   })
   installPlacementRangeColorPicker()
   installPlayerTemplateSettingsVisibility()
   registerTemplatePlacementResizeKeybindings()
   installTemplatePlacementResize()
   game.settings.register(MODULE_ID, "templatesCompendium", {
      name: "PF2EATW.Compendium.SettingName",
      scope: "world",
      config: false,
      type: Object,
      default: [],
   })
   game.settings.registerMenu(MODULE_ID, "openTemplatesCompendium", {
      name: "PF2EATW.Compendium.MenuName",
      label: "PF2EATW.Compendium.MenuLabel",
      icon: "fa-solid fa-book-sparkles",
      type: TemplatesCompendiumApp,
      restricted: true,
   })
}

function installPlayerTemplateSettingsVisibility() {
   const guard = "__atwPlayerTemplateSettingsHook"
   if (globalThis[guard]) return
   globalThis[guard] = true
   Hooks.on("renderSettingsConfig", (_app, element) => {
      const root = element?.querySelector ? element : element?.[0]
      if (!root) return
      const controller = root.querySelector(
         `input[name="${MODULE_ID}.allowPlayerTemplates"]`,
      )
      if (!controller) return
      const dependentKeys = [
         "playerTemplateAccessLevel",
         "allowPlayerTemplateCompendiumSave",
         "allowPlayerTemplateImport",
      ]
      const roleRow = root
         .querySelector(`[name="${MODULE_ID}.playerTemplateAccessLevel"]`)
         ?.closest(".form-group")
      const usersRow = ensurePlayerAccessUsersRow(root, roleRow)
      const rows = dependentKeys
         .map((key) =>
            root
               .querySelector(`[name="${MODULE_ID}.${key}"]`)
               ?.closest(".form-group"),
         )
         .filter(Boolean)
      if (usersRow) rows.splice(Math.min(1, rows.length), 0, usersRow)
      const sync = () => {
         for (const row of rows) row.hidden = !controller.checked
      }
      controller.addEventListener("change", sync)
      sync()
   })
}

function ensurePlayerAccessUsersRow(root, afterRow) {
   const existing = root.querySelector(".atw-player-access-users")
   if (existing) {
      renderPlayerAccessUserBadges(existing)
      return existing
   }
   const users = currentPlayerAccessUsers()
   const options = users
      .map(
         (user) =>
            `<option value="${escapeHTML(user.id)}">${escapeHTML(user.name)}</option>`,
      )
      .join("")
   const row = document.createElement("div")
   row.className = "form-group atw-player-access-users"
   row.innerHTML = `
      <label>${escapeHTML(localizeSetting("PF2EATW.Setting.PlayerTemplateAccessByUser"))}</label>
      <div class="form-fields atw-player-access-user-fields">
         <select class="atw-player-access-user-select"
                 aria-label="${escapeHTML(localizeSetting("PF2EATW.Setting.PlayerTemplateAccessByUser"))}">
            <option value="">${escapeHTML(localizeSetting("PF2EATW.Setting.ChooseUser"))}</option>
            ${options}
         </select>
         <div class="atw-player-access-user-badges"></div>
      </div>`
   row
      .querySelector(".atw-player-access-user-select")
      ?.addEventListener("change", async (event) => {
         const select = event.currentTarget
         const id = String(select.value ?? "")
         select.value = ""
         if (!id) return
         const ids = normalizeUserAccessIds(
            game.settings.get(MODULE_ID, "playerTemplateAccessUserIds"),
         )
         if (!ids.includes(id)) {
            ids.push(id)
            await game.settings.set(MODULE_ID, "playerTemplateAccessUserIds", ids)
         }
         renderPlayerAccessUserBadges(row)
      })
   row.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action='atw-remove-player-access']")
      if (!button) return
      event.preventDefault()
      const id = button.closest("[data-user-id]")?.dataset.userId
      if (!id) return
      const ids = normalizeUserAccessIds(
         game.settings.get(MODULE_ID, "playerTemplateAccessUserIds"),
      ).filter((entry) => entry !== id)
      await game.settings.set(MODULE_ID, "playerTemplateAccessUserIds", ids)
      renderPlayerAccessUserBadges(row)
   })
   if (afterRow?.parentElement) afterRow.after(row)
   else root
      .querySelector(`input[name="${MODULE_ID}.allowPlayerTemplates"]`)
      ?.closest(".form-group")
      ?.after(row)
   renderPlayerAccessUserBadges(row)
   return row
}

function currentPlayerAccessUsers() {
   const values = game.users?.contents ?? Array.from(game.users ?? [])
   return values
      .map((entry) => (Array.isArray(entry) ? entry[1] : entry))
      .filter((user) => user?.id && !user.isGM)
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
}

function renderPlayerAccessUserBadges(row) {
   const wrap = row.querySelector(".atw-player-access-user-badges")
   if (!wrap) return
   const usersById = new Map(currentPlayerAccessUsers().map((user) => [user.id, user]))
   const ids = normalizeUserAccessIds(
      game.settings.get(MODULE_ID, "playerTemplateAccessUserIds"),
   )
   wrap.innerHTML = ids
      .map((id) => {
         const user = usersById.get(id)
         const name = user?.name ?? id
         return `<span class="atw-tag atw-player-access-user-badge" data-user-id="${escapeHTML(id)}">
            <span class="atw-tag-label">${escapeHTML(name)}</span>
            <a class="atw-tag-remove" data-action="atw-remove-player-access"
               aria-label="${escapeHTML(localizeSetting("PF2EATW.Setting.RemoveUserAccess"))}"
               data-tooltip="${escapeHTML(localizeSetting("PF2EATW.Setting.RemoveUserAccess"))}">&times;</a>
         </span>`
      })
      .join("")
}

function normalizeUserAccessIds(value) {
   if (Array.isArray(value)) return value.map(String).filter(Boolean)
   if (typeof value === "string" && value.trim()) {
      try {
         const parsed = JSON.parse(value)
         return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
      } catch (_e) {
         return []
      }
   }
   return []
}

function localizeSetting(key) {
   return game.i18n.localize(key)
}

function installPlacementRangeColorPicker() {
   const guard = "__atwPlacementRangeColorPickerHook"
   if (globalThis[guard]) return
   globalThis[guard] = true
   Hooks.on("renderSettingsConfig", (_app, element) => {
      const root = element?.querySelector ? element : element?.[0]
      const input = root?.querySelector?.(
         `input[name="${MODULE_ID}.templatePlacementRangeLineColor"]`,
      )
      if (!input) return
      input.type = "color"
      input.value = normalizeColorSetting(input.value)
   })
}

function normalizeColorSetting(value) {
   const text = String(value ?? "").trim()
   return /^#[0-9a-f]{6}$/i.test(text) ? text : "#ffcc33"
}

export async function cleanOrphanScratchDocuments() {
   if (!game.user.isGM) return
   const orphans = []
   for (const scene of game.scenes) {
      const collections = [
         { name: "Tile", items: scene.tiles },
         { name: "AmbientSound", items: scene.sounds },
         { name: "AmbientLight", items: scene.lights },
      ]
      for (const { name, items } of collections) {
         for (const document of items) {
            if (document.flags?.[MODULE_ID]?.isScratch) {
               orphans.push({ scene, name, id: document.id })
            }
         }
      }
   }
   const groupedByScene = new Map()
   for (const orphan of orphans) {
      const key = `${orphan.scene.id}|${orphan.name}`
      if (!groupedByScene.has(key)) {
         groupedByScene.set(key, {
            scene: orphan.scene,
            name: orphan.name,
            ids: [],
         })
      }
      groupedByScene.get(key).ids.push(orphan.id)
   }
   for (const { scene, name, ids } of groupedByScene.values()) {
      try {
         await scene.deleteEmbeddedDocuments(name, ids)
      } catch (error) {
         undefined
      }
   }
}
