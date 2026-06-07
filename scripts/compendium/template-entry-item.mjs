import { FLAG_SCOPE } from "../data.mjs"
import { normalizeAutomation } from "../sheet/automation-storage.mjs"

export const COMPENDIUM_ENTRY_FLAG = "compendiumEntry"

export function normalizeEntrySlug(slug) {
   return String(slug ?? "")
      .trim()
      .toLowerCase()
}

export function sanitizeTemplateEntry(entry = {}) {
   const automation = normalizeAutomation(entry?.automation ?? null)
   return {
      id: entry?.id ? String(entry.id) : foundry.utils.randomID(),
      slug: normalizeEntrySlug(entry?.slug),
      name: String(entry?.name ?? "New Template"),
      automation,
   }
}

export function makeTemplateEntryFlag(entry) {
   return sanitizeTemplateEntry(entry)
}

export function createTemplateEntryItem(
   entry,
   { editable = true, onChange = null } = {},
) {
   let current = sanitizeTemplateEntry(entry)
   const item = {
      id: current.id,
      uuid: `TemplateWizard.CompendiumEntry.${current.id}`,
      name: current.name,
      img: "icons/svg/dice-target.svg",
      type: "spell",
      actor: game.user?.character ?? null,
      isOwner: editable,
      system: {
         slug: current.slug,
         area: null,
         description: { value: "" },
      },
      getFlag(scope, key) {
         if (scope === FLAG_SCOPE && key === "automation") {
            return foundry.utils.deepClone(current.automation)
         }
         return undefined
      },
      async setFlag(scope, key, value) {
         if (scope === FLAG_SCOPE && key === "automation") {
            current.automation = foundry.utils.deepClone(value)
            await onChange?.(sanitizeTemplateEntry(current))
         }
         return value
      },
      async update(changes = {}, _options = {}) {
         const automation = updateValue(
            changes,
            `flags.${FLAG_SCOPE}.automation`,
         )
         if (automation !== undefined) {
            current.automation = foundry.utils.deepClone(automation)
         }
         if (Object.prototype.hasOwnProperty.call(changes, "name")) {
            current.name = String(changes.name ?? "")
            this.name = current.name
         }
         const slug = updateValue(changes, "system.slug")
         if (slug !== undefined) {
            current.slug = normalizeEntrySlug(slug)
            this.system.slug = current.slug
         }
         await onChange?.(sanitizeTemplateEntry(current))
         return this
      },
      getOriginData() {
         return {
            uuid: this.uuid,
            type: this.type,
            name: this.name,
            slug: this.system.slug,
         }
      },
      get atwCompendiumEntry() {
         return sanitizeTemplateEntry(current)
      },
   }
   return item
}

function updateValue(changes, path) {
   if (Object.prototype.hasOwnProperty.call(changes, path)) {
      return changes[path]
   }
   return foundry.utils.getProperty(changes, path)
}

export function templateEntryFromRegion(region) {
   const entry = region?.getFlag?.(FLAG_SCOPE, COMPENDIUM_ENTRY_FLAG)
   if (!entry || typeof entry !== "object") return null
   return sanitizeTemplateEntry(entry)
}

export function itemFromRegionEntry(region, options = {}) {
   const entry = templateEntryFromRegion(region)
   return entry ? createTemplateEntryItem(entry, options) : null
}

export async function sourceItemForRegion(region, tryFromUuidFn) {
   const managed = region?.getFlag?.(FLAG_SCOPE, "managed")
   const itemUuid =
      managed?.itemUuid ?? region?.getFlag?.(FLAG_SCOPE, "originUuid")
   if (itemUuid && typeof tryFromUuidFn === "function") {
      const item = await tryFromUuidFn(itemUuid)
      if (item) return item
   }
   return itemFromRegionEntry(region, { editable: false })
}

export function hasCompendiumEntryRegionFlag(region) {
   return !!templateEntryFromRegion(region)
}

export function compendiumEntryOriginUuid(entry) {
   const clean = sanitizeTemplateEntry(entry)
   return `TemplateWizard.CompendiumEntry.${clean.id}`
}
