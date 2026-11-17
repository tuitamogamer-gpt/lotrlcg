// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/attack-dol-guldur-encounter-cards.json";
import quests from "../data/attack-dol-guldur-quest-cards.json";
import recipes from "../data/attack-dol-guldur-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { AttackDolGuldurState } from "./attack-dol-guldur-types";

export const ADG_ENCOUNTERS = encounters as Card[];
/** The quest cards in quest-deck order (1A, 2A, 3A, 3C, 3E, 3G). */
export const ADG_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const ADG_RECIPES = recipes;
export const ADG_SCENARIO = "attack-on-dol-guldur";
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
export const ADG = {
  golden: code("Assault on the Golden Wood"),
  anduin: code("Crossing the Anduin"),
  siege: code("The Siege of Dol Guldur"),
  tower: code("The Tower of Sorcery"),
  trees: code("Battle Under the Trees"),
  dungeons: code("Dungeons of the Necromancer"),
  mode: code("Standard Game Mode"),
  epic: code("Epic Multiplayer Mode"),
  city: code("Dol Guldur"),
  power: code("Power of Lórien"),
  host: code("Host of Lórien"),
  bane: code("Bane of Amon Lanc"),
  sorcerer: code("Sorcerer of Dol Guldur"),
  morlug: code("Chieftain Morlug"),
  dweller: code("Dungeon Dweller"),
  army: code("Host of Dol Guldur"),
  olog: code("Mirkwood Olog-hai"),
  beast: code("Beast of Taur-nu-Fuin"),
  archer: code("Amon Lanc Archer"),
  marauder: code("Dol Guldur Marauder"),
  warg: code("Battle Warg"),
  gate: code("Gate of Dol Guldur"),
  sorcery: code("The Sorcerer's Tower"),
  road: code("The Shadow Road"),
  door: code("Dungeon Door"),
  forest: code("Forest Battleground"),
  woods: code("Blackened Woods"),
  servant: code("Servant of Sauron"),
  sevenfold: code("Power Sevenfold"),
  rage: code("The Necromancer's Rage"),
  despair: code("Fear and Despair"),
  fastness: code("Fastness of Mirkwood"),
} as const;
/** Each stage 3: its letters, its Lieutenant and the Dol Guldur location it opens. */
export const ADG_STAGE3: Record<
  string,
  { front: string; back: string; lieutenant: string; location: string }
> = {
  [ADG.siege]: {
    front: "3A",
    back: "3B",
    lieutenant: ADG.bane,
    location: ADG.gate,
  },
  [ADG.tower]: {
    front: "3C",
    back: "3D",
    lieutenant: ADG.sorcerer,
    location: ADG.sorcery,
  },
  [ADG.trees]: {
    front: "3E",
    back: "3F",
    lieutenant: ADG.morlug,
    location: ADG.road,
  },
  [ADG.dungeons]: {
    front: "3G",
    back: "3H",
    lieutenant: ADG.dweller,
    location: ADG.door,
  },
};
export const ADG_STAGE3_CODES = Object.keys(ADG_STAGE3);
export const ADG_LIEUTENANTS: readonly string[] = [
  ADG.bane,
  ADG.sorcerer,
  ADG.morlug,
  ADG.dweller,
];
export const ADG_STAGE: Record<string, number> = {
  [ADG.golden]: 1,
  [ADG.anduin]: 2,
  ...Object.fromEntries(ADG_STAGE3_CODES.map((c) => [c, 3])),
};
export const ADG_QUEST_CODES = Object.keys(ADG_STAGE);
/** Printed siege values (in the victory box of the reviewed scans). */
export const ADG_SIEGE: Record<string, number> = {
  [ADG.army]: 4,
  [ADG.olog]: 3,
  [ADG.beast]: 2,
  [ADG.archer]: 1,
  [ADG.marauder]: 1,
  [ADG.warg]: 1,
  [ADG.gate]: 2,
  [ADG.sorcery]: 2,
  [ADG.road]: 2,
  [ADG.door]: 2,
};
/** The Dol Guldur locations (2B, Power Sevenfold). */
export const ADG_DOL_GULDUR_LOCATIONS: readonly string[] = [
  ADG.gate,
  ADG.sorcery,
  ADG.road,
  ADG.door,
];
const byCode = new Map(printed.map((c) => [c.code, c]));
type Recipe = (typeof recipes)[number];
export const adgRecipe = () => recipes[0] as Recipe;
const quest = (c: string) => ADG_QUESTS.find((q) => q.code === c)!;
/** The letter of the current quest side, e.g. "1B" or "3F". */
export function adgSide(s: GameState) {
  const q = s.attackDolGuldur;
  if (!q) return "";
  const stage3 = ADG_STAGE3[q.currentQuest];
  if (stage3) return s.stageRevealing ? stage3.front : stage3.back;
  return `${ADG_STAGE[q.currentQuest]}${s.stageRevealing ? "A" : "B"}`;
}
export function adgStageInfo(s: GameState) {
  const q = s.attackDolGuldur;
  if (!q) return undefined;
  const c = quest(q.currentQuest);
  const front = s.stageRevealing;
  // Every stage of this quest deck has "–" quest points.
  return {
    name: c.name,
    cardCode: c.code,
    quest: 0,
    story: (front ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const adgUnits = (s: GameState): Unit[] => [
  ...(s.attackDolGuldur?.resolving ?? []),
];
const engagedUnits = (s: GameState) => [
  ...(s.engaged ?? []),
  ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
];
const allyUnits = (s: GameState) => [
  ...(s.allies ?? []),
  ...(s.table?.seats.flatMap((seat) => seat.allies ?? []) ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function attackDolGuldurPublicState(s: GameState) {
  const q = s.attackDolGuldur;
  if (!q) return undefined;
  const victory = s.victoryCards ?? [];
  const inPlay = [...s.staging, ...engagedUnits(s)];
  const power = s.staging.find((u) => u.code === ADG.power);
  const lieutenantOf = (c: string) =>
    q.setAside.includes(c)
      ? ("aside" as const)
      : inPlay.some((u) => u.code === c)
        ? ("play" as const)
        : victory.includes(c)
          ? ("victory" as const)
          : ("gone" as const);
  return {
    currentQuest: q.currentQuest,
    side: adgSide(s),
    stage: ADG_STAGE[q.currentQuest],
    cityStrength: q.cityStrength,
    questResources: q.questResources,
    lorien: power
      ? ("staging" as const)
      : q.lorien
        ? ("controlled" as const)
        : victory.includes(ADG.power)
          ? ("victory" as const)
          : ("discarded" as const),
    lorienProgress: power?.progress ?? 0,
    lorienPlayer: q.lorien?.player ?? null,
    hostOfLorien: q.setAside.includes(ADG.host)
      ? ("aside" as const)
      : allyUnits(s).some((u) => u.code === ADG.host)
        ? ("play" as const)
        : ("removed" as const),
    lieutenants: Object.fromEntries(
      ADG_LIEUTENANTS.map((c) => [c, lieutenantOf(c)]),
    ) as Record<string, "aside" | "play" | "victory" | "gone">,
    siege: q.siege.round === s.round ? q.siege.value : 0,
  };
}
export function validateAttackDolGuldur(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.attackDolGuldur;
  if (q === undefined) return s.scenarioId !== ADG_SCENARIO;
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && byCode.has(c));
  const marks = (v: unknown, phase = false) =>
    Array.isArray(v) &&
    v.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        (!phase || typeof m.phase === "string"),
    );
  const round = (v: unknown) => v === null || Number.isInteger(v);
  return (
    !!q &&
    s.scenarioId === ADG_SCENARIO &&
    ADG_QUEST_CODES.includes(q.currentQuest) &&
    s.stage === ADG_STAGE[q.currentQuest] &&
    typeof q.advancing === "boolean" &&
    codes(q.setAside) &&
    codes(q.removed) &&
    Number.isInteger(q.cityStrength) &&
    q.cityStrength >= 0 &&
    Number.isInteger(q.questResources) &&
    q.questResources >= 0 &&
    (q.lorien === null || Number.isInteger(q.lorien.player)) &&
    Number.isInteger(q.siege?.round) &&
    Number.isInteger(q.siege?.value) &&
    round(q.fastness) &&
    (q.questProgress === null ||
      (Number.isInteger(q.questProgress.round) &&
        Number.isInteger(q.questProgress.amount))) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.threatReduced) &&
    q.threatReduced.every(
      (m) =>
        Number.isInteger(m.player) &&
        Number.isInteger(m.round) &&
        Number.isInteger(m.amount),
    ) &&
    Array.isArray(q.healed) &&
    q.healed.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        Number.isInteger(m.amount),
    ) &&
    round(q.despair) &&
    marks(q.unready) &&
    (q.rage === null ||
      (Number.isInteger(q.rage.round) && typeof q.rage.phase === "string")) &&
    marks(q.rageShadow, true) &&
    marks(q.fastnessShadow, true) &&
    q.fastnessShadow.every((m) => Number.isInteger(m.value)) &&
    Array.isArray(q.shadowRoad) &&
    q.shadowRoad.every((id) => typeof id === "string")
  );
}
