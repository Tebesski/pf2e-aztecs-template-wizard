import { BEHAVIOR_CATALOG } from "./behavior-catalog.mjs"
import { getDamageTypeOptions } from "./options.mjs"

export function defaultAutomation() {
  return {
    enabled: false,
    label: "",
    attachable: false,
    contiguous: { enabled: false, count: 2 },
    placementRange: { enabled: false, max: 0 },
    expiration: { enabled: true, amount: 1, unit: "minutes", sustained: false },
    advanced: defaultAdvanced(),
    templateShape: defaultTemplateShape(),
    behaviors: []
  };
}

export function defaultTemplateShape() {
  return {
    shapes: [defaultShapeVariant()]
  };
}

export function defaultShapeVariant() {
  return {
    id: foundry.utils.randomID(),
    type: "cone",
    size: 15,
    width: 5,
    innerRadius: 5
  };
}

export const TEMPLATE_SHAPE_TYPE_OPTIONS = [
  { value: "circle",     label: "PF2EATW.TemplateShape.Circle" },
  { value: "emanation",  label: "PF2EATW.TemplateShape.Emanation" },
  { value: "line",       label: "PF2EATW.TemplateShape.Line" },
  { value: "ring",       label: "PF2EATW.TemplateShape.Ring" },
  { value: "square",     label: "PF2EATW.TemplateShape.Square" },
  { value: "cone",       label: "PF2EATW.TemplateShape.Cone" },
];

export const TILE_SHAPE_FILTER_OPTIONS = [
  { value: "all", label: "PF2EATW.Field.TileShapeAny" },
  ...TEMPLATE_SHAPE_TYPE_OPTIONS
];

export function defaultTileAttachment() {
  const randomID = globalThis.foundry?.utils?.randomID;
  return {
    id: typeof randomID === "function"
      ? randomID()
      : Math.random().toString(36).slice(2, 10),
    shape: "all",
    tile: {}
  };
}

export function normalizeTileAttachments(source) {
  const system = source && typeof source === "object" && !Array.isArray(source)
    ? source
    : null;
  const raw = Array.isArray(source)
    ? source
    : (Array.isArray(system?.tiles) ? system.tiles : []);
  const legacyTile = system?.tile && typeof system.tile === "object"
    ? system.tile
    : null;
  const legacyShape = typeof system?.tileShape === "string"
    ? system.tileShape
    : "all";

  const rows = raw.length > 0
    ? raw
    : (legacyTile ? [{ shape: legacyShape, tile: legacyTile }] : []);

  return rows
    .filter(row => row && typeof row === "object")
    .map((row) => {
      const base = defaultTileAttachment();
      const tile = row.tile && typeof row.tile === "object"
        ? row.tile
        : {};
      return {
        ...base,
        id: row.id ? String(row.id) : base.id,
        shape: row.shape ? String(row.shape) : "all",
        tile
      };
    });
}

export function placedRegionShapeKind(regionShapeType) {
  switch (regionShapeType) {
    case "cone":      return "cone";
    case "circle":    return "circle";
    case "ring":      return "ring";
    case "rectangle": return "rectangle";
    case "ellipse":   return "ellipse";
    case "polygon":   return null;
    default:          return null;
  }
}

export function shapeVariantsFromSpell(item) {
  const area = item?.system?.area;
  if (!area || !area.type) return [defaultShapeVariant()];
  const size = Number(area.value) || 15;
  let type = area.type;

  if (type === "burst") type = "circle";

  const known = TEMPLATE_SHAPE_TYPE_OPTIONS.some(o => o.value === type);
  if (!known) return [defaultShapeVariant()];
  return [{
    id: foundry.utils.randomID(),
    type,
    size,
    width: 5,
    innerRadius: 5
  }];
}

export function defaultAdvanced() {
  return {
    enabled: false,
    color: "#a728cc",
    visibility: 0,
    highlightMode: "coverage",
    displayMeasurements: true
  };
}

export const REGION_VISIBILITY_OPTIONS = [
  { value: 0, label: "PF2EATW.RegionVis.RegionLayer" },
  { value: 4, label: "PF2EATW.RegionVis.RegionLayerUnlocked" },
  { value: 1, label: "PF2EATW.RegionVis.GamemasterOnly" },
  { value: 3, label: "PF2EATW.RegionVis.Observers" },
  { value: 2, label: "PF2EATW.RegionVis.AlwaysForAnyone" }
];

export const REGION_HIGHLIGHT_MODE_OPTIONS = [
  { value: "shapes",     label: "PF2EATW.RegionHL.TrueShapes" },
  { value: "coverage",   label: "PF2EATW.RegionHL.CoveredGridSpaces" }
];

export function defaultBehaviorEntry(type) {
  const def = BEHAVIOR_CATALOG.find(b => b.type === type);
  if (!def) return null;
  const system = {};
  for (const f of def.fields) {
    if (f.default !== undefined) {
      system[f.key] = (typeof f.default === "object" && f.default !== null)
        ? foundry.utils.deepClone(f.default)
        : f.default;
    }
  }
  return {
    id: foundry.utils.randomID(),
    type,
    enabled: true,
    collapsed: false,
    system
  };
}

export function coerceFieldValue(field, raw) {
  if (raw === undefined || raw === null) return raw;
  switch (field?.valueType ?? "string") {
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return raw === true || raw === "true" || raw === "on" || raw === 1 || raw === "1";
    default:
      return raw;
  }
}

export function resolveOptions(field) {
  if (!field) return [];
  let opts = field.options;
  if (typeof opts === "function") opts = opts();
  if (opts === "damageTypeOptions") opts = getDamageTypeOptions();
  if (!Array.isArray(opts)) return [];

  if (field.sort === false) return opts;
  const I = (typeof game !== "undefined" && game.i18n)
    ? (k) => game.i18n.localize(k) : (k) => String(k);
  return opts.slice().sort((a, b) => I(a.label).localeCompare(I(b.label)));
}

export function sortByLocalizedLabel(opts) {
  if (!Array.isArray(opts)) return [];
  const I = (typeof game !== "undefined" && game.i18n)
    ? (k) => game.i18n.localize(k) : (k) => String(k);
  return opts.slice().sort((a, b) => I(a.label).localeCompare(I(b.label)));
}
