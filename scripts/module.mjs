import { MODULE_ID } from "./data.mjs";
import {
  registerSheetTab
} from "./sheet-tab.mjs";
import { readAutomation } from "./sheet/automation-storage.mjs";
import {
  TemplatesCompendiumApp,
  registerTemplatesCompendiumHooks
} from "./compendium/templates-compendium.mjs";
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
  queueSkillCheckCard,
  isTargetHelperEnabled,
  setSocketlibSocket,
  executeAsGM,
  gmApplyRuntimeConsequences,
  gmCleanupRuntimeConsequences,
  gmApplyCardDamage
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
});

Hooks.once("init", () => {
  registerSheetTab();
  registerRegionHandler();
  registerExpirationSweep();
  registerTrackerCleanup();
  registerTemplatesCompendiumHooks();
  registerModuleSettings(TemplatesCompendiumApp);

  game.modules.get(MODULE_ID).api = {
    readAutomation,
    buildBehaviorData,
    isRegionDeleting,
    requestPlayerSave,
    requestPlayerSkillRoll,
    requestPlayerChoiceDialog,
    executeAsGM,
    queueTargetHelperSave,
    queueTargetHelperChoice,
    queueRollDiceCard,
    queueDamageCard,
    queueSkillCheckCard,
    isTargetHelperEnabled,
    openDestroyableWallBuilder,
    spawnConstructActorsForWalls,
    debugAdjacentLifecycle,
    debugTriggerAdjacentLifecycle,
    debugFootprint,
    debugRegionPolygons
  };
});

Hooks.once("ready", async () => {
  installRuntimeHooks();
  restoreTrackedRegions();
  await cleanOrphanScratchDocuments();
});
