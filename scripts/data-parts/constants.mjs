export const MODULE_ID = "pf2e-aztecs-template-wizard";
export const FLAG_SCOPE = MODULE_ID;

export const SUPPORTED_ITEM_TYPES = new Set([
  "spell", "action", "feat",
  "consumable", "equipment", "weapon", "armor", "backpack", "treasure", "book"
]);

export const TIME_UNITS = {
  seconds: { label: "PF2EATW.Unit.Seconds", toSeconds: 1 },
  rounds:  { label: "PF2EATW.Unit.Rounds",  toSeconds: 6 },
  minutes: { label: "PF2EATW.Unit.Minutes", toSeconds: 60 },
  hours:   { label: "PF2EATW.Unit.Hours",   toSeconds: 3600 },
  days:    { label: "PF2EATW.Unit.Days",    toSeconds: 86400 }
};

export const DARKNESS_MODE = { OVERRIDE: 0, BRIGHTEN: 1, DARKEN: 2 };
export const SURFACE_MODE  = { ADD: 0, REMOVE: 1, OVERRIDE: 2 };

export function getMovementActionOptions() {
  const actions = globalThis.CONFIG?.Token?.movement?.actions;
  if (actions && typeof actions === "object") {
    return Object.entries(actions)
      .filter(([, cfg]) => cfg)
      .map(([k, cfg]) => ({
        value: k,
        label: cfg?.label ?? k
      }));
  }
  return [
    { value: "stride", label: "Stride" },
    { value: "fly",    label: "Fly" },
    { value: "swim",   label: "Swim" },
    { value: "burrow", label: "Burrow" },
    { value: "deploy", label: "Deploy" },
    { value: "travel", label: "Travel" }
  ];
}

export const DEFAULT_MOVEMENT_ACTIONS = [];

export const COMMON_DC_SUGGESTIONS = [
  { value: "@placer.system.attributes.classDC.value", label: "PF2EATW.DCSuggest.PlacerClassDC" },
  { value: "@placer.system.attributes.spellDC.value", label: "PF2EATW.DCSuggest.PlacerSpellDC" },
  { value: "@placer.system.attributes.classOrSpellDC.value", label: "PF2EATW.DCSuggest.PlacerClassOrSpellDC" },
  { value: "@placer.system.attributes.spellDC.value - 10", label: "PF2EATW.DCSuggest.PlacerSpellAttack" },
  { value: "@actor.system.attributes.classDC.value", label: "PF2EATW.DCSuggest.ActorClassDC" },
  { value: "@actor.system.attributes.spellDC.value", label: "PF2EATW.DCSuggest.ActorSpellDC" }
];

const TRIGGER_CANDIDATES = {

  onPlace: [],

  tokenAdjacentTurnStart: [],
  tokenAdjacentTurnEnd:   [],
  tokenEnter: [
    "TOKEN_ENTER", "TOKEN_MOVE_IN", "tokenEnter", "tokenMoveIn",
    "token-enter", "token-move-in"
  ],
  tokenExit: [
    "TOKEN_EXIT", "TOKEN_MOVE_OUT", "tokenExit", "tokenMoveOut",
    "token-exit", "token-move-out"
  ],
  tokenMoveWithin: [
    "TOKEN_MOVE_WITHIN", "TOKEN_MOVE", "tokenMoveWithin", "tokenMove",
    "token-move-within", "token-move"
  ],

  tokenTurnStart: [
    "TOKEN_TURN_START", "tokenTurnStart", "token-turn-start"
  ],

  tokenTurnEnd: [
    "TOKEN_TURN_END", "tokenTurnEnd", "token-turn-end"
  ],
  tokenRoundStart: [
    "TOKEN_ROUND_START", "tokenRoundStart", "token-round-start"
  ],
  tokenRoundEnd: [
    "TOKEN_ROUND_END", "tokenRoundEnd", "token-round-end"
  ],

  whileAdjacent: [],
  whileWithin: []
};

export function resolveTriggerToEvent(triggerKey) {
  const candidates = TRIGGER_CANDIDATES[triggerKey] ?? [];
  if (candidates.length === 0) return null;
  const constMap = globalThis.CONST?.REGION_EVENTS ?? {};

  const acceptedStrings = new Set();
  for (const v of Object.values(constMap)) {
    if (typeof v === "string") acceptedStrings.add(v);
  }

  for (const cand of candidates) {
    if (typeof cand === "string" && acceptedStrings.has(cand)) return cand;
  }

  for (const cand of candidates) {
    const mapped = constMap[cand];
    if (typeof mapped === "string" && acceptedStrings.has(mapped)) return mapped;
  }

  return null;
}

export const TRIGGER_TO_EVENT = {
  onPlace:         null,
  tokenEnter:      "tokenEnter",
  tokenExit:       "tokenExit",
  tokenMoveWithin: "tokenMoveWithin",
  tokenTurnStart:  "tokenTurnStart",
  tokenTurnEnd:    "tokenTurnEnd",

  tokenAdjacentTurnStart: "tokenTurnStart",
  tokenAdjacentTurnEnd:   "tokenTurnEnd",
  whileAdjacent: null,
  whileWithin: null,
  tokenRoundStart: "tokenRoundStart",
  tokenRoundEnd:   "tokenRoundEnd"
};

export const TRIGGER_OPTIONS = [
  { value: "onPlace",          label: "PF2EATW.Trigger.OnPlace" },
  { value: "tokenEnter",       label: "PF2EATW.Trigger.Entering" },
  { value: "tokenExit",        label: "PF2EATW.Trigger.Leaving" },
  { value: "tokenMoveWithin",  label: "PF2EATW.Trigger.MovingWithin" },
  { value: "tokenTurnStart",   label: "PF2EATW.Trigger.TurnStart" },
  { value: "tokenTurnEnd",     label: "PF2EATW.Trigger.TurnEnd" },
  { value: "tokenAdjacentTurnStart", label: "PF2EATW.Trigger.AdjacentTurnStart" },
  { value: "tokenAdjacentTurnEnd",   label: "PF2EATW.Trigger.AdjacentTurnEnd" },
  { value: "tokenRoundStart",  label: "PF2EATW.Trigger.RoundStart" },
  { value: "tokenRoundEnd",    label: "PF2EATW.Trigger.RoundEnd" }
];

export const GRANT_TRIGGER_OPTIONS = [
  ...TRIGGER_OPTIONS,
  { value: "whileAdjacent", label: "PF2EATW.Trigger.WhileAdjacent" },
  { value: "whileWithin",   label: "PF2EATW.Trigger.WhileWithin" }
];

export const TARGET_OPTIONS = [
  { value: "allies",  label: "PF2EATW.Target.Allies" },
  { value: "enemies", label: "PF2EATW.Target.Enemies" },
  { value: "all",     label: "PF2EATW.Target.All" }
];
