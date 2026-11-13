// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/stone-erech-encounter-cards.json";
import quests from "../data/stone-erech-quest-cards.json";
import recipes from "../data/stone-erech-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { StoneErechState } from "./stone-erech-types";

export const STONE_ERECH_ENCOUNTERS = encounters as Card[];
export const STONE_ERECH_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const STONE_ERECH_RECIPES = recipes;
export const STONE_ERECH_SCENARIO = "the-stone-of-erech";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const SE = {
  disappearance: code("The Disappearance"),
  terror: code("Terror of the Dead"),
  host: code("The Shadow Host"),
  eventide: code("Eventide"),
  dusk: code("Dusk"),
  midnight: code("Midnight"),
  derufin: code("Derufin"),
  lord: code("The Lord of the Dead"),
  stone: code("The Stone of Erech"),
  neck: code("Tarlang's Neck"),
  relic: code("Relic from the Dark Years"),
  banks: code("Banks of Morthond"),
  graves: code("Blackroot Graves"),
  dwimorberg: code("Shadow of Dwimorberg"),
  haunted: code("Haunted Valley"),
  vale: code("Vale of Shadows"),
  whisperer: code("Whisperer"),
  restless: code("Restless Dead"),
  shadowMan: code("Shadow-man"),
  captain: code("Shadow Host Captain"),
  shade: code("Regretful Shade"),
  deadRide: code("The Dead Ride Behind"),
  groping: code("Groping Horror"),
  throng: code("Midnight Throng"),
  driven: code("Driven by Fear"),
  gloaming: code("The Gloaming"),
  murmurs: code("Murmurs of Dread"),
} as const;
/** The Night objectives in order. */
export const SE_NIGHTS: readonly string[] = [SE.eventide, SE.dusk, SE.midnight];
/** The cards set aside by stage 1A that are not put into play. */
export const SE_SET_ASIDE: readonly string[] = [
  SE.derufin,
  SE.lord,
  SE.stone,
  SE.dusk,
  SE.midnight,
];
/** Eventide and Dusk move on with 4 progress. */
export const NIGHT_LIMIT = 4;

const byCode = new Map(STONE_ERECH_ENCOUNTERS.map((c) => [c.code, c]));
const traitsOf = (c: string) =>
  (byCode.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const seHasTrait = (u: Unit | string, trait: string) =>
  traitsOf(typeof u === "string" ? u : u.code).includes(trait);
export const isSeEnemy = (u: Unit | string) =>
  byCode.get(typeof u === "string" ? u : u.code)?.type_code === "enemy";
/** An Undead enemy of this encounter deck (each is also an Oathbreaker). */
export const isUndead = (u: Unit | string) =>
  isSeEnemy(u) && seHasTrait(u, "Undead");
export const isOathbreaker = (u: Unit | string) =>
  isSeEnemy(u) && seHasTrait(u, "Oathbreaker");
/** The printed Spectral keyword. */
export const printedSpectral = (u: Unit | string) =>
  /^Spectral\./.test(
    byCode.get(typeof u === "string" ? u : u.code)?.text ?? "",
  );

export const nightCode = (s: GameState) => s.stoneErech?.night.code;
export const isDusk = (s: GameState) => nightCode(s) === SE.dusk;
export const isMidnight = (s: GameState) => nightCode(s) === SE.midnight;
/** 0 at Eventide, 1 at Dusk, 2 at Midnight. */
export const nightLevel = (s: GameState) =>
  isMidnight(s) ? 2 : isDusk(s) ? 1 : 0;

export function stoneErechStageInfo(s: GameState) {
  const q = STONE_ERECH_QUESTS[s.stage - 1];
  if (!q || !s.stoneErech) return undefined;
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
export const stoneErechUnits = (s: GameState): Unit[] =>
  s.stoneErech ? [s.stoneErech.night, ...s.stoneErech.resolving] : [];
export function stoneErechPublicState(s: GameState) {
  const q = s.stoneErech;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    night: q.night.code,
    nightProgress: q.night.progress,
    derufin: q.derufin,
    setAside: [...q.setAside],
    noEvents: q.noEventsRound === s.round,
    skipTravel: q.skipTravel,
    skipPlanning: q.skipPlanning,
    noResources: q.noResourcesRound === s.round,
    unspectral: q.unspectral.length,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateStoneErech(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.stoneErech;
  if (q === undefined) return s.scenarioId !== STONE_ERECH_SCENARIO;
  const nightIndex = q ? SE_NIGHTS.indexOf(q.night?.code) : -1;
  return (
    !!q &&
    s.scenarioId === STONE_ERECH_SCENARIO &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === STONE_ERECH_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => SE_SET_ASIDE.includes(c)) &&
    new Set(q.setAside).size === q.setAside.length &&
    unit(q.night) &&
    nightIndex >= 0 &&
    // A later Night objective is never still set aside.
    SE_NIGHTS.slice(1, nightIndex + 1).every((c) => !q.setAside.includes(c)) &&
    ["aside", "attached", "controlled", "lost"].includes(q.derufin) &&
    (q.derufin === "aside") === q.setAside.includes(SE.derufin) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.noEventsRound === null || integer(q.noEventsRound)) &&
    typeof q.skipTravel === "boolean" &&
    typeof q.skipPlanning === "boolean" &&
    (q.noResourcesRound === null || integer(q.noResourcesRound)) &&
    Array.isArray(q.unspectral) &&
    q.unspectral.every((id) => typeof id === "string")
  );
}
