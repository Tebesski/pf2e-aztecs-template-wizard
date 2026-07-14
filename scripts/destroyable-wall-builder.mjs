import {
  DAMAGE_CATEGORY_OPTIONS,
  DAMAGE_DIE_OPTIONS,
  getDamageTypeOptions
} from "./data.mjs";
import { escapeHTML, localize, renderModuleTemplate } from "./common/html.mjs";
import { spawnConstructActorsForWalls } from "./region-handler.mjs";

export async function openDestroyableWallBuilder({ walls = null } = {}) {
  if (!game.user?.isGM) {
    ui.notifications?.warn(localize("PF2EATW.WallBuilder.GmOnly"));
    return [];
  }

  const wallDocs = resolveWallDocuments(walls);
  if (wallDocs.length === 0) {
    ui.notifications?.warn(localize("PF2EATW.WallBuilder.SelectWall"));
    return [];
  }

  const content = await renderModuleTemplate("dialogs/destroyable-wall-builder.hbs", {
    wallCount: wallDocs.length,
    damageTypes: localizedDamageTypes(),
    damageRowHtml: renderDamageRow(),
    titleLabel: localize("PF2EATW.WallBuilder.WallActors"),
    nameLabel: localize("PF2EATW.WallBuilder.Name"),
    hpLabel: localize("PF2EATW.WallBuilder.HP"),
    acLabel: localize("PF2EATW.WallBuilder.AC"),
    hardnessLabel: localize("PF2EATW.WallBuilder.Hardness"),
    selectedWallsLabel: localize("PF2EATW.WallBuilder.SelectedWalls"),
    immunitiesLabel: localize("PF2EATW.WallBuilder.Immunities"),
    resistancesLabel: localize("PF2EATW.WallBuilder.Resistances"),
    weaknessesLabel: localize("PF2EATW.WallBuilder.Weaknesses"),
    addStrikeLabel: localize("PF2EATW.WallBuilder.AddStrike"),
    strikeNameLabel: localize("PF2EATW.WallBuilder.StrikeName"),
    attackModifierLabel: localize("PF2EATW.WallBuilder.AttackModifier"),
    countLabel: localize("PF2EATW.WallBuilder.Count"),
    dieLabel: localize("PF2EATW.WallBuilder.Die"),
    typeLabel: localize("PF2EATW.WallBuilder.Type"),
    categoryLabel: localize("PF2EATW.WallBuilder.Category"),
    addDamageLabel: localize("PF2EATW.WallBuilder.AddDamage"),
    wallName: localize("PF2EATW.WallBuilder.DefaultWallName"),
    strikeName: localize("PF2EATW.WallBuilder.DefaultStrikeName")
  });

  const config = await promptWallBuilderConfig(content);
  if (!config) return [];

  const created = await spawnConstructActorsForWalls(wallDocs, config);
  if (created.length > 0) {
    ui.notifications?.info(
      localize("PF2EATW.WallBuilder.Spawned").replace("{count}", String(created.length))
    );
  } else {
    ui.notifications?.warn(localize("PF2EATW.WallBuilder.NoneCreated"));
  }
  return created;
}

function resolveWallDocuments(walls) {
  const candidates = Array.isArray(walls)
    ? walls
    : walls
      ? [walls]
      : canvas.walls?.controlled ?? [];
  return candidates
    .map((wall) => wall?.document ?? wall)
    .filter((wall) => wall && Array.isArray(wall.c) && wall.parent);
}

async function promptWallBuilderConfig(content) {
  const title = localize("PF2EATW.WallBuilder.DialogTitle");
  const readConfig = (root) => readWallBuilderConfig(root);
  const DV2 = foundry?.applications?.api?.DialogV2;
  if (DV2?.wait) {
    return await new Promise((resolve) => {
      DV2.wait({
        window: { title },
        content,
        buttons: [
          {
            action: "spawn",
            label: localize("PF2EATW.WallBuilder.Spawn"),
            default: true,
            callback: (_event, _button, dialog) => resolve(readConfig(dialog.element))
          },
          { action: "cancel", label: localize("PF2EATW.IO.Cancel"), callback: () => resolve(null) }
        ],
        rejectClose: false,
        modal: true,
        render: (_event, dialog) => bindDestroyableWallBuilder(dialog.element),
        close: () => resolve(null)
      }).catch(() => resolve(null));
    });
  }

  return await new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        spawn: {
          label: localize("PF2EATW.WallBuilder.Spawn"),
          callback: (html) => resolve(readConfig(html?.[0] ?? html))
        },
        cancel: { label: localize("PF2EATW.IO.Cancel"), callback: () => resolve(null) }
      },
      default: "spawn",
      render: (html) => bindDestroyableWallBuilder(html?.[0] ?? html),
      close: () => resolve(null)
    }).render(true);
  });
}

function findWallBuilderForm(root) {
  return root?.matches?.(".atw-wall-builder-form")
    ? root
    : root?.querySelector?.(".atw-wall-builder-form");
}

function readWallBuilderConfig(root) {
  const form = findWallBuilderForm(root);
  if (!form) {
    ui.notifications?.error(localize("PF2EATW.WallBuilder.FormReadFailed"));
    return null;
  }

  const hasStrike = !!form.querySelector("[name='hasStrike']")?.checked;
  const damages = hasStrike ? readDamageRows(form) : [];
  if (hasStrike && damages.length === 0) {
    ui.notifications?.warn(localize("PF2EATW.WallBuilder.AddDamageRequired"));
    return null;
  }

  return {
    name: valueOf(form, "name") || localize("PF2EATW.WallBuilder.DefaultWallName"),
    hp: numberOf(form, "hp", 30, 1),
    ac: numberOf(form, "ac", 15, 1),
    hardness: numberOf(form, "hardness", 5, 0),
    immunities: readJsonValue(form, "immunities", []),
    resistances: readJsonValue(form, "resistances", []),
    weaknesses: readJsonValue(form, "weaknesses", []),
    strike: hasStrike
      ? {
          name: valueOf(form, "strikeName") || localize("PF2EATW.WallBuilder.DefaultStrikeName"),
          attack: valueOf(form, "strikeAttack") || "10",
          damages
        }
      : null,
    sourceItem: null
  };
}

function valueOf(form, name) {
  return String(form.querySelector(`[name='${name}']`)?.value ?? "").trim();
}

function numberOf(form, name, fallback, minimum) {
  const value = Number(valueOf(form, name));
  return Math.max(minimum, Number.isFinite(value) ? value : fallback);
}

function readJsonValue(form, name, fallback) {
  try {
    const parsed = JSON.parse(form.querySelector(`[name='${name}']`)?.value ?? "");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_e) {
    return fallback;
  }
}

function readDamageRows(form) {
  return Array.from(form.querySelectorAll(".atw-wall-builder-damage-row"))
    .map((row) => {
      const diceCount = Math.max(
        0,
        Number(row.querySelector(".atw-wall-builder-damage-count")?.value) || 0
      );
      return {
        diceCount,
        dieSize: row.querySelector(".atw-wall-builder-damage-die")?.value || "d6",
        damageType: row.querySelector(".atw-wall-builder-damage-type")?.value || "bludgeoning",
        category: row.querySelector(".atw-wall-builder-damage-category")?.value || "normal"
      };
    })
    .filter((damage) => damage.diceCount > 0);
}

function bindDestroyableWallBuilder(root) {
  const form = findWallBuilderForm(root);
  if (!form || form.dataset.atwWallBuilderBound) return;
  form.dataset.atwWallBuilderBound = "1";

  form.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-action]");
    if (!button) return;
    if (!form.contains(button)) return;

    const action = button.dataset.action;
    if (!action?.startsWith("atw-wall-")) return;
    event.preventDefault();

    if (action === "atw-wall-add-tag") addTag(button);
    else if (action === "atw-wall-add-irw") addIrwTag(button);
    else if (action === "atw-wall-remove-tag") removeListEntry(button);
    else if (action === "atw-wall-add-damage-row") addDamageRow(form);
    else if (action === "atw-wall-remove-damage-row") removeDamageRow(button);
  });

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!input?.matches?.("[name='hasStrike']")) return;
    const panel = form?.querySelector(".atw-wall-builder-strike");
    if (panel) panel.hidden = !input.checked;
  });
}

function addTag(button) {
  const section = button.closest("[data-wall-list]");
  const select = section?.querySelector(".atw-wall-builder-type");
  const type = select?.value;
  if (!section || !type) return;
  const entries = readSectionEntries(section);
  if (!entries.includes(type)) entries.push(type);
  writeSectionEntries(section, entries);
}

function addIrwTag(button) {
  const section = button.closest("[data-wall-list]");
  const select = section?.querySelector(".atw-wall-builder-type");
  const valueInput = section?.querySelector(".atw-wall-builder-value");
  const type = select?.value;
  if (!section || !type) return;
  const value = Math.max(1, Number(valueInput?.value) || 1);
  const entries = readSectionEntries(section).filter((entry) => entry?.type !== type);
  entries.push({ type, value });
  writeSectionEntries(section, entries);
}

function removeListEntry(button) {
  const section = button.closest("[data-wall-list]");
  const badge = button.closest(".atw-wall-builder-badge");
  const index = Number(badge?.dataset.index);
  if (!section || !Number.isInteger(index)) return;
  const entries = readSectionEntries(section);
  entries.splice(index, 1);
  writeSectionEntries(section, entries);
}

function readSectionEntries(section) {
  const name = section.dataset.wallList;
  try {
    const parsed = JSON.parse(section.querySelector(`[name='${name}']`)?.value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function writeSectionEntries(section, entries) {
  const name = section.dataset.wallList;
  const input = section.querySelector(`[name='${name}']`);
  if (input) input.value = JSON.stringify(entries);
  renderSectionBadges(section, entries);
}

function renderSectionBadges(section, entries = readSectionEntries(section)) {
  const row = section.querySelector(".atw-wall-builder-badges");
  if (!row) return;
  const kind = section.dataset.wallListKind;
  row.hidden = entries.length === 0;
  row.innerHTML = entries.map((entry, index) => {
    const type = kind === "tag" ? entry : entry?.type;
    const value = kind === "tag" ? "" : `<span class="atw-wall-builder-badge-value">${Number(entry?.value) || 1}</span>`;
    return `<span class="atw-wall-builder-badge" data-index="${index}">
      <span class="atw-wall-builder-badge-type">${escapeHTML(labelForDamageType(section, type))}</span>
      ${value}
      <a class="atw-tag-remove" data-action="atw-wall-remove-tag" aria-label="${escapeHTML(localize("PF2EATW.WallBuilder.Remove"))}">&times;</a>
    </span>`;
  }).join("");
}

function labelForDamageType(section, type) {
  const option = Array.from(section.querySelectorAll(".atw-wall-builder-type option"))
    .find((candidate) => candidate.value === type);
  return option?.textContent ?? type ?? "";
}

function addDamageRow(form) {
  const list = form.querySelector(".atw-wall-builder-damage-list");
  if (!list) return;
  const template = document.createElement("template");
  template.innerHTML = renderDamageRow();
  list.append(template.content);
}

function removeDamageRow(button) {
  const row = button.closest(".atw-wall-builder-damage-row");
  const list = row?.closest(".atw-wall-builder-damage-list");
  if (!row || !list) return;
  if (list.querySelectorAll(".atw-wall-builder-damage-row").length <= 1) {
    row.querySelector(".atw-wall-builder-damage-count").value = "1";
    row.querySelector(".atw-wall-builder-damage-die").value = "d6";
    row.querySelector(".atw-wall-builder-damage-type").value = "bludgeoning";
    row.querySelector(".atw-wall-builder-damage-category").value = "normal";
    return;
  }
  row.remove();
}

function localizedDamageTypes() {
  return getDamageTypeOptions().map((option) => ({
    value: option.value,
    label: localize(option.label)
  }));
}

function localizedOptions(options) {
  return options.map((option) => ({
    value: option.value,
    label: localize(option.label)
  }));
}

function renderDamageRow(value = {}) {
  const damage = {
    diceCount: value.diceCount ?? 1,
    dieSize: value.dieSize ?? "d6",
    damageType: value.damageType ?? "bludgeoning",
    category: value.category ?? "normal"
  };
  return `<div class="atw-wall-builder-damage-row">
    <input type="number" class="atw-wall-builder-damage-count" value="${escapeHTML(damage.diceCount)}" min="0" step="1">
    <select class="atw-wall-builder-damage-die">${optionHtml(localizedOptions(DAMAGE_DIE_OPTIONS), damage.dieSize)}</select>
    <select class="atw-wall-builder-damage-type">${optionHtml(localizedDamageTypes(), damage.damageType)}</select>
    <select class="atw-wall-builder-damage-category">${optionHtml(localizedOptions(DAMAGE_CATEGORY_OPTIONS), damage.category)}</select>
    <button type="button" class="atw-wall-builder-icon-button" data-action="atw-wall-remove-damage-row"
            data-tooltip="${escapeHTML(localize("PF2EATW.WallBuilder.RemoveDamage"))}">
      <i class="fa-solid fa-trash"></i>
    </button>
  </div>`;
}

function optionHtml(options, selected) {
  return options.map((option) => {
    const isSelected = option.value === selected ? " selected" : "";
    return `<option value="${escapeHTML(option.value)}"${isSelected}>${escapeHTML(option.label)}</option>`;
  }).join("");
}
