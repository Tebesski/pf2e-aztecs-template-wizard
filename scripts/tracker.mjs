import { FLAG_SCOPE, MODULE_ID } from "./data.mjs";
import { deleteManagedRegion } from "./region-handler.mjs";

const STORAGE_KEY  = `${MODULE_ID}.trackedRegions`;
const POSITION_KEY = `${MODULE_ID}.trackerPos`;
const ENTRIES = new Map();

let dockEl = null;
let tickHandle = null;

export function trackRegion({
  regionUuid,
  itemName,
  durationSeconds = null,
  durationRounds = null,
  remainingRounds = null,
  totalRounds = null,
  sustained = false,
  placedAt,
  sceneId
}) {
  ENTRIES.set(regionUuid, {
    itemName,
    durationSeconds,
    durationRounds,
    remainingRounds,
    totalRounds,
    sustained,
    placedAt,
    sceneId
  });
  persist();
  ensureDock();
  renderRows();
}

export function untrackRegion(regionUuid) {
  if (!ENTRIES.has(regionUuid)) return;
  ENTRIES.delete(regionUuid);
  persist();
  renderRows();
  if (ENTRIES.size === 0) hideDock();
}

export function restoreTrackedRegions() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch {}
  for (const e of saved) {
    if (!e?.regionUuid) continue;
    ENTRIES.set(e.regionUuid, {
      itemName: e.itemName,
      durationSeconds: e.durationSeconds,
      durationRounds: e.durationRounds,
      remainingRounds: e.remainingRounds,
      totalRounds: e.totalRounds,
      sustained: !!e.sustained,
      placedAt: e.placedAt,
      sceneId: e.sceneId
    });
  }
  if (ENTRIES.size > 0) {
    ensureDock();
    renderRows();
  }
  syncTrackedRegionsFromScene(canvas?.scene);
  if (!tickHandle) tickHandle = setInterval(tick, 1000);
}

export function registerTrackerCleanup() {
  Hooks.on("canvasReady", () => syncTrackedRegionsFromScene(canvas?.scene));
  Hooks.on("createRegion", (region) => syncRegionToTracker(region));
  Hooks.on("updateRegion", (region, changes) => {
    if (changes?.flags) syncRegionToTracker(region);
  });
  Hooks.on("deleteRegion", (region) => {
    if (ENTRIES.has(region.uuid)) untrackRegion(region.uuid);
  });
}

function syncTrackedRegionsFromScene(scene) {
  if (!scene) return;
  for (const region of scene.regions ?? []) syncRegionToTracker(region);
}

function syncRegionToTracker(region) {
  const flag = region?.getFlag?.(FLAG_SCOPE, "managed");
  if (!flag) {
    if (region?.uuid && ENTRIES.has(region.uuid)) untrackRegion(region.uuid);
    return;
  }
  const placedAt = Number(flag.placedAt ?? game.time.worldTime) || game.time.worldTime;
  const hasExpiresAt = flag.expiresAt !== null && flag.expiresAt !== undefined && flag.expiresAt !== "";
  const expiresAt = Number(flag.expiresAt);
  const storedDuration = flag.durationSeconds;
  const durationSeconds = hasExpiresAt && Number.isFinite(expiresAt)
    ? Math.max(0, expiresAt - placedAt)
    : isLimitedDuration(storedDuration)
      ? Math.max(0, Number(storedDuration))
      : null;
  const schedule = flag.combatExpiration;
  const scheduleRemaining = schedule?.remainingRounds ?? flag.remainingRounds;
  const scheduleTotal = schedule?.totalRounds ?? flag.totalRounds;
  const remainingRounds = isLimitedDuration(scheduleRemaining)
    ? Math.max(0, Math.floor(Number(scheduleRemaining)))
    : durationSeconds !== null
      ? secondsToRounds(durationSeconds)
      : null;
  const totalRounds = isLimitedDuration(scheduleTotal)
    ? Math.max(1, Math.floor(Number(scheduleTotal)))
    : isLimitedDuration(flag.durationRounds)
      ? Math.max(1, Math.floor(Number(flag.durationRounds)))
      : remainingRounds;
  trackRegion({
    regionUuid: region.uuid,
    itemName: flag.itemName ?? flag.itemUuid ?? "Region",
    durationSeconds,
    durationRounds: flag.durationRounds,
    remainingRounds,
    totalRounds,
    sustained: !!(schedule?.sustained ?? flag.resolvedAutomation?.expiration?.sustained),
    placedAt,
    sceneId: region.parent?.id ?? null
  });
}

function persist() {
  const list = Array.from(ENTRIES.entries()).map(([regionUuid, v]) => ({
    regionUuid, ...v
  }));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
  catch (e) { undefined; }
}

function readPosition() {
  try { return JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null"); }
  catch { return null; }
}

function writePosition(pos) {
  try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); }
  catch {}
}

function loc(key) { return game.i18n.localize(key); }

function ensureDock() {
  if (dockEl) return;

  dockEl = document.createElement("div");
  dockEl.className = "atw-dock";
  dockEl.innerHTML = `
    <header class="atw-dock-grip">
      <i class="fa-solid fa-hourglass-half"></i>
      <span class="atw-dock-title">${loc("PF2EATW.Tracker.Title")}</span>
      <a class="atw-dock-collapse"
         data-tooltip="${loc("PF2EATW.Tracker.Collapse")}">
        <i class="fa-solid fa-chevron-up"></i>
      </a>
    </header>
    <ul class="atw-dock-list"></ul>
  `;

  const pos = readPosition();
  dockEl.style.left = `${pos?.x ?? Math.max(20, window.innerWidth - 320)}px`;
  dockEl.style.top  = `${pos?.y ?? 120}px`;

  document.body.appendChild(dockEl);
  wireDockDrag();
  wireDockCollapse();
  wireDockActions();
}

function hideDock() {
  if (dockEl?.parentElement) dockEl.remove();
  dockEl = null;
}

function renderRows() {
  if (!dockEl) return;
  const ul = dockEl.querySelector(".atw-dock-list");
  if (!ul) return;
  const rows = [];
  for (const [uuid, entry] of ENTRIES) rows.push(rowHtml(uuid, entry));
  ul.innerHTML = rows.join("");
}

function rowHtml(regionUuid, entry) {
  const rounds = entryRounds(entry);
  const time = formatRounds(rounds.remaining, rounds.total, entry.sustained);
  const expired = isLimitedDuration(rounds.remaining) && rounds.remaining <= 0 ? "atw-expired" : "";
  const sustained = entry.sustained ? "atw-sustained" : "atw-unsustained";
  const itemName = entry.itemName ?? "Region";
  const panTooltip = loc("PF2EATW.Tracker.PanToName").replace("{name}", itemName);
  const gmControls = game.user?.isGM
    ? `<a data-action="open-settings"
         data-tooltip="${loc("PF2EATW.Tracker.Settings")}">
        <i class="fa-solid fa-gear"></i>
      </a>
      <a class="atw-dock-delete" data-action="delete"
         data-tooltip="${loc("PF2EATW.Tracker.Delete")}">
        <i class="fa-solid fa-trash"></i>
      </a>`
    : "";
  return `
    <li class="atw-dock-row ${expired} ${sustained}" data-uuid="${regionUuid}">
      <a class="atw-dock-name" data-action="pan-to"
         data-tooltip="${escapeHTML(panTooltip)}"><span class="atw-dock-name-text">${escapeHTML(itemName)}</span></a>
      <span class="atw-dock-time">${time}</span>
      <a data-action="select-region"
         data-tooltip="${loc("PF2EATW.Tracker.SelectRegion")}">
        <i class="fa-solid fa-arrow-pointer"></i>
      </a>
      ${gmControls}
    </li>
  `;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function tick() {
  if (!dockEl || ENTRIES.size === 0) return;
  const ul = dockEl.querySelector(".atw-dock-list");
  for (const li of ul.querySelectorAll(".atw-dock-row")) {
    const uuid = li.dataset.uuid;
    const entry = ENTRIES.get(uuid);
    if (!entry) continue;
    const rounds = entryRounds(entry);
    const out = li.querySelector(".atw-dock-time");
    if (out) out.textContent = formatRounds(rounds.remaining, rounds.total, entry.sustained);
    li.classList.toggle(
      "atw-expired",
      isLimitedDuration(rounds.remaining) && rounds.remaining <= 0
    );
  }
}

function entryRounds(entry) {
  if (isLimitedDuration(entry.remainingRounds)) {
    return {
      remaining: Math.max(0, Math.floor(Number(entry.remainingRounds))),
      total: isLimitedDuration(entry.totalRounds)
        ? Math.max(1, Math.floor(Number(entry.totalRounds)))
        : null
    };
  }
  if (isLimitedDuration(entry.durationSeconds)) {
    const elapsed = Math.max(0, game.time.worldTime - entry.placedAt);
    const remainingSeconds = Math.max(0, entry.durationSeconds - elapsed);
    return {
      remaining: secondsToRounds(remainingSeconds),
      total: isLimitedDuration(entry.totalRounds)
        ? Math.max(1, Math.floor(Number(entry.totalRounds)))
        : secondsToRounds(entry.durationSeconds)
    };
  }
  if (isLimitedDuration(entry.durationRounds)) {
    const rounds = Math.max(0, Math.floor(Number(entry.durationRounds)));
    return { remaining: rounds, total: rounds };
  }
  return { remaining: null, total: null };
}

function formatRounds(remaining, total, sustained = false) {
  if (!isLimitedDuration(remaining)) return "∞";
  const current = Math.max(0, Math.floor(Number(remaining)));
  if (sustained && isLimitedDuration(total)) {
    const max = Math.max(1, Math.floor(Number(total)));
    return `${current} / ${max} rnds`;
  }
  return `${current} ${current === 1 ? "rnd" : "rnds"}`;
}

function isLimitedDuration(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function secondsToRounds(seconds) {
  return Math.max(0, Math.ceil(Math.max(0, Number(seconds) || 0) / 6));
}

function wireDockDrag() {
  const grip = dockEl.querySelector(".atw-dock-grip");
  let dragging = false, offX = 0, offY = 0;

  grip.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest("a, button")) return;
    dragging = true;
    grip.setPointerCapture(ev.pointerId);
    const r = dockEl.getBoundingClientRect();
    offX = ev.clientX - r.left;
    offY = ev.clientY - r.top;
    dockEl.classList.add("atw-dock-dragging");
  });

  grip.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - dockEl.offsetWidth, ev.clientX - offX));
    const y = Math.max(0, Math.min(window.innerHeight - dockEl.offsetHeight, ev.clientY - offY));
    dockEl.style.left = `${x}px`;
    dockEl.style.top  = `${y}px`;
  });

  const end = (ev) => {
    if (!dragging) return;
    dragging = false;
    try { grip.releasePointerCapture(ev.pointerId); } catch {}
    dockEl.classList.remove("atw-dock-dragging");
    writePosition({
      x: parseFloat(dockEl.style.left),
      y: parseFloat(dockEl.style.top)
    });
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}

function wireDockCollapse() {
  dockEl.querySelector(".atw-dock-collapse").addEventListener("click", () => {
    dockEl.classList.toggle("atw-dock-collapsed");
  });
}

function wireDockActions() {
  dockEl.addEventListener("click", async (ev) => {
    const action = ev.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    const row = ev.target.closest(".atw-dock-row");
    if (!row) return;
    const uuid = row.dataset.uuid;
    const region = await fromUuid(uuid).catch(() => null);

    if (action === "pan-to") {
      ev.preventDefault();
      if (!region) {
        ui.notifications?.warn(loc("PF2EATW.Tracker.NotFound"));
        untrackRegion(uuid);
        return;
      }
      await panToRegion(region);
      return;
    }
    if (action === "select-region") {
      ev.preventDefault();
      if (!region) {
        ui.notifications?.warn(loc("PF2EATW.Tracker.NotFound"));
        untrackRegion(uuid);
        return;
      }
      await selectRegion(region);
      return;
    }
    if (action === "open-settings") {
      if (!region) return ui.notifications?.warn(loc("PF2EATW.Tracker.NotFound"));
      region.sheet?.render(true);
      return;
    }
    if (action === "delete") {
      const itemName = ENTRIES.get(uuid)?.itemName ?? loc("PF2EATW.Tracker.UnnamedRegion");
      const confirmed = await dialogConfirm({
        title: loc("PF2EATW.Tracker.DeleteConfirmTitle"),
        content: `<p>${loc("PF2EATW.Tracker.DeleteConfirm").replace("{name}", escapeHTML(itemName))}</p>`
      });
      if (!confirmed) return;
      await deleteManagedRegion(uuid);
      untrackRegion(uuid);
      return;
    }
  });
}

async function dialogConfirm({ title, content }) {
  const DV2 = foundry?.applications?.api?.DialogV2;
  if (DV2?.confirm) {
    try {
      return await DV2.confirm({
        window: { title },
        content,
        rejectClose: false,
        modal: true
      });
    } catch (_e) {
      return false;
    }
  }
  try {
    return await Dialog.confirm({ title, content, defaultYes: false });
  } catch (_e) {
    return false;
  }
}

async function selectRegion(region) {
  const scene = region.parent;
  if (!scene) return;
  if (scene.id !== canvas.scene?.id) {
    await scene.view();
    await new Promise(r => requestAnimationFrame(r));
  }
  const layer = canvas.regions;
  if (layer?.activate) layer.activate();
  await panToRegion(region);
  try {
    const obj = region.object;
    if (obj?.control) {
      layer?.releaseAll?.();
      obj.control({ releaseOthers: true });
    } else if (layer?.controllable) {
      layer.controlObject?.(region.object);
    }
  } catch (e) {
    undefined;
  }
}

async function panToRegion(region) {
  const scene = region.parent;
  if (!scene) return;
  if (scene.id !== canvas.scene?.id) {
    await scene.view();
    await new Promise(r => requestAnimationFrame(r));
  }
  const bounds = region.object?.bounds;
  let x, y;
  if (bounds) {
    x = bounds.x + bounds.width / 2;
    y = bounds.y + bounds.height / 2;
  } else {
    const shape = region.shapes?.[0];
    x = shape?.x ?? canvas.dimensions.width / 2;
    y = shape?.y ?? canvas.dimensions.height / 2;
  }
  canvas.animatePan({ x, y, duration: 250 });
}
