import { MODULE_ID } from "../data.mjs"
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
         console.warn(
            `[${MODULE_ID}] Failed to clean orphan scratch ${name}`,
            error,
         )
      }
   }
}
