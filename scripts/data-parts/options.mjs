export const DAMAGE_DIE_OPTIONS = [
  { value: "-",   label: "—" },
  { value: "d4",  label: "d4" },
  { value: "d6",  label: "d6" },
  { value: "d8",  label: "d8" },
  { value: "d10", label: "d10" },
  { value: "d12", label: "d12" }
];

export const DAMAGE_CATEGORY_OPTIONS = [
  { value: "normal",     label: "PF2EATW.DamageCategory.Normal" },
  { value: "persistent", label: "PF2EATW.DamageCategory.Persistent" },
  { value: "splash",     label: "PF2EATW.DamageCategory.Splash" },
  { value: "precision",  label: "PF2EATW.DamageCategory.Precision" }
];

export const DAMAGE_TYPE_VISUAL = {
  bludgeoning: { icon: "fa-hammer",           color: "#aa7a55" },
  piercing:    { icon: "fa-shield-arrow",     color: "#a1a1a1" },
  slashing:    { icon: "fa-sword",            color: "#cfcfcf" },
  acid:        { icon: "fa-vial",             color: "#5ba33b" },
  cold:        { icon: "fa-snowflake",        color: "#4fa6df" },
  electricity: { icon: "fa-bolt",             color: "#dfb44f" },
  fire:        { icon: "fa-fire",             color: "#d9534f" },
  sonic:       { icon: "fa-volume-high",      color: "#61c7c9" },
  force:       { icon: "fa-burst",            color: "#b963e6" },
  spirit:      { icon: "fa-sparkles",         color: "#df74ca" },
  void:        { icon: "fa-skull",            color: "#483669" },
  vitality:    { icon: "fa-sun",              color: "#e39734" },
  mental:      { icon: "fa-brain",            color: "#956bd4" },
  poison:      { icon: "fa-skull-crossbones", color: "#74a83b" },
  untyped:     { icon: "fa-question",         color: "#666666" },

  bleed:       { icon: "fa-droplet",          color: "#b71c1c" },
  negative:    { icon: "fa-skull",            color: "#483669" },
  positive:    { icon: "fa-sun",              color: "#e39734" }
};

export function getDamageTypeVisual(type) {
  return DAMAGE_TYPE_VISUAL[type] ?? { icon: "fa-circle", color: "#9e9e9e" };
}

export const CONSEQUENCE_TYPE_OPTIONS = [
  { value: "damage",              label: "PF2EATW.Consequence.Damage" },
  { value: "heal",                label: "Heal" },
  { value: "move",                label: "Move" },
  { value: "savingThrow",         label: "PF2EATW.Consequence.SavingThrow" },
  { value: "rollSkill",           label: "PF2EATW.Consequence.SkillCheck" },
  { value: "applyEffect",         label: "PF2EATW.Consequence.ApplyEffect" },
  { value: "applyCondition",      label: "PF2EATW.Consequence.ApplyCondition" },
  { value: "removeEffect",        label: "PF2EATW.Consequence.RemoveEffect" },
  { value: "removeCondition",     label: "PF2EATW.Consequence.RemoveCondition" },
  { value: "applyRuleElement",    label: "PF2EATW.Consequence.ApplyRuleElement" },
  { value: "executeMacro",        label: "PF2EATW.Consequence.ExecuteMacro" },
  { value: "sendChatMessage",     label: "PF2EATW.Consequence.SendChatMessage" },
  { value: "scrollingText",       label: "PF2EATW.Consequence.ScrollingText" }
];

export const SAVE_CONSEQUENCE_TYPE_OPTIONS = CONSEQUENCE_TYPE_OPTIONS.filter(
  o => o.value !== "savingThrow" && o.value !== "rollSkill"
);

export const SAVE_OUTCOME_OPTIONS = [
  { value: "criticalSuccess", label: "PF2EATW.SaveOutcome.CriticalSuccess" },
  { value: "success",         label: "PF2EATW.SaveOutcome.Success" },
  { value: "failure",         label: "PF2EATW.SaveOutcome.Failure" },
  { value: "criticalFailure", label: "PF2EATW.SaveOutcome.CriticalFailure" }
];

export function getDamageTypeOptions() {
  const i18n = globalThis.game?.i18n;
  const loc = (s) => (i18n && typeof s === "string") ? i18n.localize(s) : s;
  const cfg = globalThis.CONFIG?.PF2E?.damageTypes;
  if (cfg && typeof cfg === "object") {
    return Object.entries(cfg)
      .map(([k, v]) => {
        const raw = typeof v === "string" ? v : (v?.label ?? k);
        return { value: k, label: raw, sortKey: loc(raw) };
      })
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  }
  return [
    { value: "acid",        label: "Acid" },
    { value: "bleed",       label: "Bleed" },
    { value: "bludgeoning", label: "Bludgeoning" },
    { value: "cold",        label: "Cold" },
    { value: "electricity", label: "Electricity" },
    { value: "fire",        label: "Fire" },
    { value: "force",       label: "Force" },
    { value: "mental",      label: "Mental" },
    { value: "piercing",    label: "Piercing" },
    { value: "poison",      label: "Poison" },
    { value: "slashing",    label: "Slashing" },
    { value: "sonic",       label: "Sonic" },
    { value: "spirit",      label: "Spirit" },
    { value: "vitality",    label: "Vitality" },
    { value: "void",        label: "Void" },
    { value: "untyped",     label: "Untyped" }
  ];
}
export function getConditionTypeOptions() {
  const i18n = globalThis.game?.i18n;
  const loc = (s) => (i18n && typeof s === "string") ? i18n.localize(s) : s;
  const cfg = globalThis.CONFIG?.PF2E?.conditionTypes;
  if (cfg && typeof cfg === "object") {
    return Object.entries(cfg)
      .map(([k, v]) => {
        const raw = typeof v === "string" ? v : (v?.label ?? k);
        return { value: k, label: raw, sortKey: loc(raw) };
      })
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  }
  return [
    { value: "blinded",           label: "Blinded" },
    { value: "broken",            label: "Broken" },
    { value: "clumsy",            label: "Clumsy" },
    { value: "concealed",         label: "Concealed" },
    { value: "confused",          label: "Confused" },
    { value: "controlled",        label: "Controlled" },
    { value: "dazzled",           label: "Dazzled" },
    { value: "deafened",          label: "Deafened" },
    { value: "doomed",            label: "Doomed" },
    { value: "drained",           label: "Drained" },
    { value: "dying",             label: "Dying" },
    { value: "encumbered",        label: "Encumbered" },
    { value: "enfeebled",         label: "Enfeebled" },
    { value: "fascinated",        label: "Fascinated" },
    { value: "fatigued",          label: "Fatigued" },
    { value: "fleeing",           label: "Fleeing" },
    { value: "frightened",        label: "Frightened" },
    { value: "grabbed",           label: "Grabbed" },
    { value: "hidden",            label: "Hidden" },
    { value: "immobilized",       label: "Immobilized" },
    { value: "invisible",         label: "Invisible" },
    { value: "off-guard",         label: "Off-Guard" },
    { value: "paralyzed",         label: "Paralyzed" },
    { value: "persistent-damage", label: "Persistent Damage" },
    { value: "petrified",         label: "Petrified" },
    { value: "prone",             label: "Prone" },
    { value: "quickened",         label: "Quickened" },
    { value: "restrained",        label: "Restrained" },
    { value: "sickened",          label: "Sickened" },
    { value: "slowed",            label: "Slowed" },
    { value: "stunned",           label: "Stunned" },
    { value: "stupefied",         label: "Stupefied" },
    { value: "unconscious",       label: "Unconscious" },
    { value: "undetected",        label: "Undetected" },
    { value: "wounded",           label: "Wounded" }
  ];
}
export function getEnvironmentTypeOptions() {
  const cfg = globalThis.CONFIG?.PF2E?.environmentTypes;
  if (cfg && typeof cfg === "object") {
    return Object.entries(cfg).map(([k, v]) => ({
      value: k,
      label: typeof v === "string" ? v : (v?.label ?? k)
    }));
  }
  return [
    { value: "aerial",      label: "Aerial" },
    { value: "aquatic",     label: "Aquatic" },
    { value: "arctic",      label: "Arctic" },
    { value: "desert",      label: "Desert" },
    { value: "forest",      label: "Forest" },
    { value: "mountain",    label: "Mountain" },
    { value: "plains",      label: "Plains" },
    { value: "swamp",       label: "Swamp" },
    { value: "underground", label: "Underground" },
    { value: "urban",       label: "Urban" }
  ];
}
