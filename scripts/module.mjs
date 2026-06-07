import { MODULE_ID } from "./data.mjs";
import {
  registerSheetTab
} from "./sheet-tab.mjs";
import { readAutomation } from "./sheet/automation-storage.mjs";
import {
  registerSpellCastHeighteningCapture,
  resolveAutomationHeightening
} from "./heightening.mjs";
import {
  TemplatesCompendiumApp,
  registerTemplatesCompendiumHooks
} from "./compendium/templates-compendium.mjs";
import {
  openTemplateBrowser,
  registerTemplateBrowserControls
} from "./compendium/template-browser.mjs";
import {
  registerRegionHandler,
  registerExpirationSweep,
  debugFootprint,
  debugRegionPolygons,
  debugAdjacentLifecycle,
  debugTriggerAdjacentLifecycle,
  spawnConstructActorsForWalls,
  gmApplyRegionAutomation,
  gmMarkContiguousPrimary,
  gmFinalizeContiguousPlacement,
  gmDeleteManagedRegion,
  gmCatchupEffectLifecycleForToken
} from "./region-handler.mjs";
import { openDestroyableWallBuilder } from "./destroyable-wall-builder.mjs";
import { registerChatTemplateButtons } from "./chat-template-buttons.mjs";
import { restoreTrackedRegions, registerTrackerCleanup } from "./tracker.mjs";
import { buildBehaviorData } from "./behaviors/index.mjs";
import {
  installRuntimeHooks,
  isRegionDeleting,
  requestPlayerSave,
  requestPlayerSkillRoll,
  requestPlayerChoiceDialog,
  queueTargetHelperSave,
  queueTargetHelperChoice,
  queueRollDiceCard,
  queueDamageCard,
  queueHealCard,
  queueSkillCheckCard,
  isTargetHelperEnabled,
  setSocketlibSocket,
  executeAsGM,
  gmApplyRuntimeConsequences,
  gmCleanupRuntimeConsequences,
  gmApplyCardDamage,
  gmApplyCardHealing,
  gmApplyRestrictionEffect,
  gmPersistCardMessage,
  applyRestrictionEffectToToken,
  moveTokenByRegionVector
} from "./runtime/index.mjs";
import {
  cleanOrphanScratchDocuments,
  registerModuleSettings
} from "./settings/module-settings.mjs";

Hooks.once("socketlib.ready", () => {
  const socket = socketlib.registerModule(MODULE_ID);
  if (!socket) return;
  setSocketlibSocket(socket);
  socket.register("applyRegionAutomation", gmApplyRegionAutomation);
  socket.register("markContiguousPrimary", gmMarkContiguousPrimary);
  socket.register("finalizeContiguousPlacement", gmFinalizeContiguousPlacement);
  socket.register("deleteManagedRegion", gmDeleteManagedRegion);
  socket.register("catchupEffectLifecycleForToken", gmCatchupEffectLifecycleForToken);
  socket.register("applyRuntimeConsequences", gmApplyRuntimeConsequences);
  socket.register("cleanupRuntimeConsequences", gmCleanupRuntimeConsequences);
  socket.register("applyCardDamage", gmApplyCardDamage);
  socket.register("applyCardHealing", gmApplyCardHealing);
  socket.register("applyRestrictionEffect", gmApplyRestrictionEffect);
  socket.register("persistCardMessage", gmPersistCardMessage);
});

async function debugHeightening(itemOrUuid = null) {
  let item = itemOrUuid;
  if (typeof itemOrUuid === "string") {
    try {
      item = await fromUuid(itemOrUuid);
    } catch (_e) {
      item = null;
    }
  }
  if (!item) {
    const token = canvas?.tokens?.controlled?.[0];
    item = token?.actor?.items?.find((candidate) =>
      candidate.getFlag?.(MODULE_ID, "automation")
    );
  }
  if (!item?.getFlag) {
    ui.notifications?.warn("Select a token with an automated item or pass an item UUID.");
    return null;
  }
  return resolveAutomationHeightening(readAutomation(item), item);
}

Hooks.once("init", () => {
  registerSheetTab();
  registerRegionHandler();
  registerExpirationSweep();
  registerTrackerCleanup();
  registerTemplatesCompendiumHooks();
  registerTemplateBrowserControls();
  registerChatTemplateButtons();
  registerModuleSettings(TemplatesCompendiumApp);

  game.modules.get(MODULE_ID).api = {
    readAutomation,
    resolveAutomationHeightening,
    debugHeightening,
    buildBehaviorData,
    isRegionDeleting,
    requestPlayerSave,
    requestPlayerSkillRoll,
    requestPlayerChoiceDialog,
    executeAsGM,
    applyRestrictionEffectToToken,
    moveTokenByRegionVector,
    queueTargetHelperSave,
    queueTargetHelperChoice,
    queueRollDiceCard,
    queueDamageCard,
    queueHealCard,
    queueSkillCheckCard,
    isTargetHelperEnabled,
    openTemplateBrowser,
    openDestroyableWallBuilder,
    spawnConstructActorsForWalls,
    debugAdjacentLifecycle,
    debugTriggerAdjacentLifecycle,
    debugFootprint,
    debugRegionPolygons
  };
});

Hooks.once("ready", async () => {
  registerSpellCastHeighteningCapture();
  installRuntimeHooks();
  restoreTrackedRegions();
  await cleanOrphanScratchDocuments();
});
