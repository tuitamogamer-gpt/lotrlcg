// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/the-oath-encounter-cards.json";
import quests from "../data/the-oath-quest-cards.json";
import recipes from "../data/the-oath-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { OathState } from "./the-oath-types";

export const OATH_ENCOUNTERS = encounters as Card[];
export const OATH_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const OATH_RECIPES = recipes;
/** The Dark of Mirkwood's version (2022) and the Starter's (2018). */
export const OATH_SCENARIO = "the-oath";
export const OATH_2018_SCENARIO = "the-oath-2018";
export const isOathScenario = (id: string) =>
  id === OATH_SCENARIO || id === OATH_2018_SCENARIO;
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
export const OATH = {
  raid: code("After the Raid"),
  forest: code("Mirkwood Forest"),
  rearguard: code("The Rearguard"),
  spiders: code("Spiders of Mirkwood"),
  greatSpider: code("Great Spider"),
  eaves: code("The Eaves of Mirkwood"),
  grove: code("Tangled Grove"),
  gate: code("Forest Gate"),
  den: code("Spider Den"),
  trail: code("Goblin Trail"),
  driven: code("Driven by Shadow"),
  speed: code("Surprising Speed"),
  web: code("Caught in a Web"),
  troop: code("Goblin Troop"),
  sniper: code("Goblin Sniper"),
  runners: code("Goblin Runners"),
  scavengers: code("Goblintown Scavengers"),
  upon: code("Goblins are Upon You!"),
  eyes: code("Eyes in the Dark"),
  camp: code("Abandoned Camp"),
  wargs: code("Wild Wargs"),
  arrows: code("Obsidian Arrows"),
} as const;
export const OATH_STAGES = [OATH.raid, OATH.forest, OATH.rearguard] as const;
/** The treacheries the scenario resolves itself (the reprints follow the Core Set). */
export const OATH_TREACHERIES: readonly string[] = [
  OATH.speed,
  OATH.upon,
  OATH.eyes,
  OATH.arrows,
];

const byCode = new Map(OATH_ENCOUNTERS.map((c) => [c.code, c]));
const traitsOf = (c: string) =>
  (byCode.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const oathHasTrait = (u: Unit | string, trait: string) =>
  traitsOf(typeof u === "string" ? u : u.code).includes(trait);
export const isOathEnemy = (c: string) => byCode.get(c)?.type_code === "enemy";
export const isGoblinEnemy = (c: string) =>
  isOathEnemy(c) && oathHasTrait(c, "Goblin");
export const isSpiderEnemy = (c: string) =>
  isOathEnemy(c) && oathHasTrait(c, "Spider");
export const isForestLocation = (c: string) =>
  byCode.get(c)?.type_code === "location" && oathHasTrait(c, "Forest");

type Recipe = (typeof recipes)[number];
/**
 * The recipe in play: The Dark of Mirkwood's standard or easy recipe, or the
 * Starter's single recipe. The Starter printed the same gold easy-mode icons,
 * so its easy mode removes the cards The Dark of Mirkwood's easy recipe drops.
 */
export function oathRecipe(scenarioId: string, easy: boolean) {
  const byId = (id: string) => recipes.find((r) => r.id === id)! as Recipe;
  if (scenarioId === OATH_2018_SCENARIO) {
    const lce = byId("Q00.01A");
    if (!easy) return lce;
    const easyCodes = new Set(byId("E00.01B").cards.map((c) => c.code));
    return {
      ...lce,
      id: "Q00.01A-easy",
      mode: "easy",
      cards: lce.cards.filter((c) => easyCodes.has(c.code)),
    } as Recipe;
  }
  return byId(easy ? "E00.01B" : "Q00.01B");
}

export function oathStageInfo(s: GameState) {
  const q = OATH_QUESTS[s.stage - 1];
  if (!q || !s.oath) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const oathUnits = (s: GameState): Unit[] => [
  ...(s.oath?.resolving ?? []),
];
/** Goblin Troop in play: in the staging area or engaged with a player. */
export function troopInPlay(s: GameState) {
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  return [...s.staging, ...engaged].some((u) => u.code === OATH.troop);
}
/** The scenario's public state, for the panel and the browser checks. */
export function oathPublicState(s: GameState) {
  const q = s.oath;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    edition: q.edition,
    troop: q.troopAside
      ? ("aside" as const)
      : troopInPlay(s)
        ? ("play" as const)
        : ("gone" as const),
    trails: (s.victoryCards ?? []).filter((c) => c === OATH.trail).length,
    eaves: s.activeLocation?.code === OATH.eaves && !s.activeLocation.blanked,
  };
}
export function validateOath(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.oath;
  if (q === undefined) return !isOathScenario(s.scenarioId);
  return (
    !!q &&
    isOathScenario(s.scenarioId) &&
    (OATH_STAGES as readonly string[]).includes(q.currentQuest) &&
    s.stage ===
      (OATH_STAGES as readonly string[]).indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    (q.edition === "2018" || q.edition === "2022") &&
    (q.edition === "2018") === (s.scenarioId === OATH_2018_SCENARIO) &&
    typeof q.troopAside === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
