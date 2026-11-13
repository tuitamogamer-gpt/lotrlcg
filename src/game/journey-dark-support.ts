// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/journey-dark-encounter-cards.json";
import quests from "../data/journey-dark-quest-cards.json";
import recipes from "../data/journey-dark-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { JourneyDarkState } from "./journey-dark-types";

export const JOURNEY_DARK_ENCOUNTERS = encounters as Card[];
export const JOURNEY_DARK_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const JOURNEY_DARK_RECIPES = recipes;
export const JOURNEY_DARK_SCENARIO = "journey-in-the-dark";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const JD = {
  moria: code("The Long Dark of Moria"),
  drums: code("Drums in the Deep"),
  bridgeStage: code("The Bridge of Khazad-dûm"),
  doom: code("Doom, Doom, Doom"),
  balrog: code("The Balrog"),
  chieftain: code("Orc-chieftain"),
  troll: code("Great Cave-troll"),
  uruk: code("Uruk from Mordor"),
  orc: code("Moria Orc"),
  archer: code("Moria Archer"),
  bridge: code("The Great Bridge"),
  mazarbul: code("Chamber of Mazarbul"),
  mines: code("Mines of Moria"),
  hall: code("Many-pillared Hall"),
  stairway: code("Darkened Stairway"),
  guardroom: code("Ancient Guardroom"),
  coming: code("They Are Coming!"),
  trapped: code("We Cannot Get Out"),
  fissure: code("Deep Fissure"),
  fool: code("Fool of a Took!"),
} as const;
export const JD_SET_ASIDE: readonly string[] = [
  JD.balrog,
  JD.bridge,
  JD.mazarbul,
];
/** Setup: 10 damage tokens on Doom, Doom, Doom. */
export const JD_DOOM_TOKENS = 10;
/** 2B: X resource tokens, where X is the number of players times 3. */
export const JD_DRUMS_PER_PLAYER = 3;
/** 3B: no more than 5 progress on the stage each round. */
export const JD_BRIDGE_CAP = 5;
const players = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
export const jdDrumsGoal = (s: GameState) => JD_DRUMS_PER_PLAYER * players(s);
export const jdDoom = (s: GameState) =>
  s.staging.find((u) => u.code === JD.doom);
const inPlay = (s: GameState) => [
  ...s.staging,
  ...(s.activeLocation ? [s.activeLocation] : []),
  ...(s.extraActiveLocations ?? []),
  ...s.engaged,
  ...(s.table?.seats.flatMap((p, i) =>
    i === s.table!.active ? [] : p.engaged,
  ) ?? []),
];
export const jdBalrog = (s: GameState) =>
  inPlay(s).find((u) => u.code === JD.balrog);
/** Where The Balrog is: set aside, in the staging area, engaged or defeated. */
export function jdBalrogPlace(s: GameState) {
  const q = s.journeyDark;
  if (!q || q.setAside.includes(JD.balrog)) return "aside" as const;
  if (s.staging.some((u) => u.code === JD.balrog)) return "staging" as const;
  if (jdBalrog(s)) return "engaged" as const;
  return "defeated" as const;
}

export function journeyDarkStageInfo(s: GameState) {
  const q = JOURNEY_DARK_QUESTS[s.stage - 1];
  if (!q || !s.journeyDark) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const journeyDarkUnits = (s: GameState): Unit[] =>
  s.journeyDark ? [...s.journeyDark.resolving] : [];
export function journeyDarkPublicState(s: GameState) {
  const q = s.journeyDark;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    setAside: [...q.setAside],
    doom: jdDoom(s)?.damage ?? 0,
    balrog: jdBalrogPlace(s),
    balrogDamage: jdBalrog(s)?.damage ?? 0,
    balrogUnbound: q.balrogUnbound,
    drums: q.drums,
    drumsGoal: jdDrumsGoal(s),
    bridgePlaced: q.bridgeRound === s.round ? q.bridgePlaced : 0,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateJourneyDark(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.journeyDark;
  if (q === undefined) return s.scenarioId !== JOURNEY_DARK_SCENARIO;
  return (
    !!q &&
    s.scenarioId === JOURNEY_DARK_SCENARIO &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === JOURNEY_DARK_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => JD_SET_ASIDE.includes(c)) &&
    new Set(q.setAside).size === q.setAside.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    integer(q.drums) &&
    q.drums >= 0 &&
    integer(q.drumsReveal) &&
    integer(q.bridgeRound) &&
    integer(q.bridgePlaced) &&
    q.bridgePlaced >= 0 &&
    q.bridgePlaced <= JD_BRIDGE_CAP &&
    typeof q.balrogUnbound === "boolean"
  );
}
