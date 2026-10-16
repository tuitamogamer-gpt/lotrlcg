import encounters from "../data/crossings-poros-encounter-cards.json";
import quests from "../data/crossings-poros-quest-cards.json";
import recipes from "../data/crossings-poros-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const CROSSINGS_POROS_ENCOUNTERS = encounters as Card[];
export const CROSSINGS_POROS_QUESTS = quests as Card[];
export const CROSSINGS_POROS_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const CROSSINGS_POROS = {
  flight: code("Flight to Gondor"),
  desert: code("The Desert Path"),
  mountains: code("The Ephel Dúath"),
  creatures: code("Deadly Creatures"),
  pursuit: code("Southron Pursuit"),
  orcs: code("Orc Patrols"),
  battle: code("Battle at the Crossings"),
  garrison: code("Poros Garrison"),
  serpent: code("The Black Serpent"),
  outrider: code("Southron Outrider"),
  prowler: code("Uruk Prowler"),
  warg: code("Desert Warg"),
  land: code("Desolate Land"),
  waste: code("Harondor Waste"),
  danger: code("Danger Close Behind"),
  foothills: code("Foothills of Mordor"),
  vale: code("Shadowy Vale"),
  shadow: code("Mountains of Shadow"),
  wayDown: code("Find a Way Down"),
  champion: code("Southron Champion"),
  water: code("Find Water"),
  dunes: code("Towering Dunes"),
  oasis: code("Desert Oasis"),
  sandstorm: code("Sandstorm"),
  exhaustion: code("Heat Exhaustion"),
  remedy: code("Craft Remedy"),
  viper: code("Sand Viper"),
  scorpion: code("Giant Scorpion"),
};
export const CROSSINGS_POROS_STAGE_TWO = [
  CROSSINGS_POROS.desert,
  CROSSINGS_POROS.mountains,
];
export const CROSSINGS_POROS_STAGE_THREE = [
  CROSSINGS_POROS.creatures,
  CROSSINGS_POROS.pursuit,
  CROSSINGS_POROS.orcs,
];
export const CROSSINGS_POROS_MAIN_QUESTS = [
  CROSSINGS_POROS.flight,
  ...CROSSINGS_POROS_STAGE_TWO,
  ...CROSSINGS_POROS_STAGE_THREE,
  CROSSINGS_POROS.battle,
];
export const CROSSINGS_POROS_SETS = [
  "Mountains of Shadow",
  "Desert Sands",
  "Desert Creatures",
  "Harad Soldiers",
  "Mordor Orcs",
];
export const crossingsPorosSet = (code: string) =>
  CROSSINGS_POROS_ENCOUNTERS.find((c) => c.code === code)?.encounter_set;
export interface CrossingsPorosState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAsideQuests: string[];
  removedQuests: string[];
  setAside: Unit[];
  removed: Unit[];
  champions: { questId: string; enemyId: string }[];
  poisoned: { id: string; round: number }[];
  garrisonEntered: boolean;
}
export function crossingsPorosStageInfo(s: GameState) {
  const q = CROSSINGS_POROS_QUESTS.find(
    (q) => q.code === s.crossingsPoros?.currentQuest,
  );
  if (!q) return undefined;
  const extra =
    q.code === CROSSINGS_POROS.orcs
      ? 2 *
        s.staging.filter(
          (u) =>
            CROSSINGS_POROS_ENCOUNTERS.find((c) => c.code === u.code)
              ?.type_code === "enemy",
        ).length
      : 0;
  return {
    name: q.back_name ?? q.name,
    cardCode: q.code,
    quest: (q.back_quest ?? 0) + extra,
    story: q.back_text ?? "",
    questImage: q.back_imagesrc ?? q.imagesrc,
  };
}
export function validateCrossingsPoros(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.crossingsPoros;
  if (q === undefined) return s.scenarioId !== "the-crossings-of-poros";
  if (
    !q ||
    s.scenarioId !== "the-crossings-of-poros" ||
    ![
      q.questDeck,
      q.completedQuests,
      q.setAsideQuests,
      q.removedQuests,
      q.setAside,
      q.removed,
      q.champions,
      q.poisoned,
    ].every(Array.isArray)
  )
    return false;
  const quests = [
    ...q.completedQuests,
    q.currentQuest,
    ...q.questDeck,
    ...q.setAsideQuests,
    ...q.removedQuests,
  ];
  const external = [
    ...s.heroes,
    ...s.allies,
    ...s.engaged,
    ...s.hand,
    ...(s.table?.seats ?? [])
      .filter((_, i) => i !== s.table!.active)
      .flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged, ...p.hand]),
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  const physical = [...external, ...q.setAside, ...q.removed];
  const expected =
    s.stage === 1
      ? [CROSSINGS_POROS.flight]
      : s.stage === 2
        ? CROSSINGS_POROS_STAGE_TWO
        : s.stage === 3
          ? CROSSINGS_POROS_STAGE_THREE
          : [CROSSINGS_POROS.battle];
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    typeof q.garrisonEntered === "boolean" &&
    q.garrisonEntered === (s.stage === 4) &&
    q.questDeck.length === [6, 4, 1, 0][s.stage - 1] &&
    q.setAsideQuests.length === (s.stage >= 3 ? 2 : 0) &&
    q.removedQuests.length === (s.stage >= 2 ? 1 : 0) &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 4 &&
    expected.includes(q.currentQuest) &&
    q.completedQuests.length === s.stage - 1 &&
    q.completedQuests.every((code, i) =>
      (i === 0
        ? [CROSSINGS_POROS.flight]
        : i === 1
          ? CROSSINGS_POROS_STAGE_TWO
          : CROSSINGS_POROS_STAGE_THREE
      ).includes(code),
    ) &&
    quests.length === 7 &&
    new Set(quests).size === 7 &&
    quests.every((c) => CROSSINGS_POROS_MAIN_QUESTS.includes(c)) &&
    [...q.setAside, ...q.removed].every(
      (u) =>
        validUnit(u) &&
        CROSSINGS_POROS_ENCOUNTERS.some((c) => c.code === u.code),
    ) &&
    new Set(physical.map((u) => u.id)).size === physical.length &&
    q.setAsideQuests.every((c) => CROSSINGS_POROS_STAGE_THREE.includes(c)) &&
    q.removedQuests.every((c) => CROSSINGS_POROS_STAGE_TWO.includes(c)) &&
    q.champions.every(
      (c) =>
        c &&
        typeof c.questId === "string" &&
        typeof c.enemyId === "string" &&
        s.staging.some(
          (u) => u.id === c.questId && u.code === CROSSINGS_POROS.champion,
        ),
    ) &&
    new Set(q.champions.map((c) => c.questId)).size === q.champions.length &&
    q.poisoned.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        Number.isInteger(p.round) &&
        p.round >= 0 &&
        p.round <= s.round,
    ) &&
    new Set(q.poisoned.map((p) => p.id)).size === q.poisoned.length
  );
}
