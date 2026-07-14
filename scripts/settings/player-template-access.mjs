import { MODULE_ID } from "../data.mjs"

const ACCESS_LEVELS = {
   none: "none",
   player: "player",
   trusted: "trusted",
}

function settingValue(key, fallback) {
   try {
      return game.settings.get(MODULE_ID, key)
   } catch (_e) {
      return fallback
   }
}

function minimumRoleForAccessLevel(level) {
   const roles = globalThis.CONST?.USER_ROLES ?? {}
   if (level === ACCESS_LEVELS.none) return Infinity
   if (level === ACCESS_LEVELS.player) return roles.PLAYER ?? 1
   return roles.TRUSTED ?? 2
}

function userIdsWithTemplateAccess() {
   const value = settingValue("playerTemplateAccessUserIds", [])
   if (Array.isArray(value)) return value.map(String)
   if (typeof value === "string" && value.trim()) {
      try {
         const parsed = JSON.parse(value)
         return Array.isArray(parsed) ? parsed.map(String) : []
      } catch (_e) {
         return []
      }
   }
   return []
}

export function userMeetsTemplateCreatorAccess(user = game.user) {
   if (user?.isGM) return true
   if (!settingValue("allowPlayerTemplates", false)) return false
   if (user?.id && userIdsWithTemplateAccess().includes(String(user.id))) {
      return true
   }
   const accessLevel = settingValue("playerTemplateAccessLevel", "trusted")
   const minimumRole = minimumRoleForAccessLevel(accessLevel)
   return Number(user?.role ?? 0) >= minimumRole
}

export function canEditTemplateAutomation(item, user = game.user) {
   if (!userMeetsTemplateCreatorAccess(user)) return false
   if (user?.isGM) return true
   return !!item?.isOwner
}

export function canImportTemplateJson(user = game.user) {
   return !!(
      user?.isGM ||
      (userMeetsTemplateCreatorAccess(user) &&
         settingValue("allowPlayerTemplateImport", false))
   )
}

export function canSaveTemplatesToCompendium(user = game.user) {
   return !!(
      user?.isGM ||
      (userMeetsTemplateCreatorAccess(user) &&
         settingValue("allowPlayerTemplateCompendiumSave", false))
   )
}
