// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/cross-roads-encounter-cards.json";
import quests from "../data/cross-roads-quest-cards.json";
import recipes from "../data/cross-roads-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { CrossRoadsState } from "./cross-roads-types";

export const CROSS_ROADS_ENCOUNTERS = encounters as Card[];
export const CROSS_ROADS_QUESTS = quests as Card[];
export const CROSS_ROADS_RECIPES = recipes;
export const CROSS_ROADS_SCENARIO = "journey-to-the-cross-roads";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string) => printed.find((c) => c.name === name)!.code;
export const JTC = {
  ambush: code("Ambush the Men of Harad"),
  crossroads: code("The Cross-roads"),
  blackGate: code("The Black Gate"),
  southward: code("Southward Road"),
  henneth: code("Henneth Annûn"),
  woods: code("Ithilien Woods"),
  foothills: code("Foothills of Ephel Dúath"),
  hills: code("Hills of Ithilien"),
  man: code("Man of Harad"),
  captain: code("Captain of Harad"),
  oliphaunt: code("Oliphaunt"),
  soldier: code("Haradrim Soldier"),
  archer: code("Haradrim Archer"),
  summons: code("The Dark Lord's Summons"),
  arrows: code("Arrows Thick in the Air"),
  marching: code("Marching Up the Road"),
  southrons: code("Fierce Southrons"),
} as const;
/** 1B: the progress needed before the players can travel to The Cross-roads. */
export const JTC_CROSSROADS_PROGRESS = 20;
/** The Black Gate: the players lose with 3 more facedown cards than players. */
export const JTC_BLACK_GATE_BASE = 3;
/** Oliphaunt: the most damage it takes each round. */
export const JTC_OLIPHAUNT_DAMAGE = 3;

export function crossRoadsStageInfo(s: GameState) {
  const q = s.crossRoads;
  const c = CROSS_ROADS_QUESTS.find((x) => x.code === q?.currentQuest);
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const crossRoadsUnits = (s: GameState): Unit[] =>
  s.crossRoads?.resolving ?? [];
export function crossRoadsPublicState(s: GameState) {
  const q = s.crossRoads;
  if (!q) return undefined;
  const players = s.table
    ? s.table.seats.filter((seat) => !seat.eliminated).length
    : 1;
  return {
    currentQuest: q.currentQuest,
    underCrossroads: q.underCrossroads.length,
    underBlackGate: q.underBlackGate.length,
    blackGateLimit: JTC_BLACK_GATE_BASE + players,
    refuge: [
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ].some((l) => l.code === JTC.henneth && !l.blanked),
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
const counter = (v: unknown) => {
  const m = v as { round?: unknown; count?: unknown } | undefined;
  return !!m && natural(m.round) && natural(m.count);
};
export function validateCrossRoads(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.crossRoads;
  if (q === undefined) return s.scenarioId !== CROSS_ROADS_SCENARIO;
  return (
    !!q &&
    s.scenarioId === CROSS_ROADS_SCENARIO &&
    s.stage === 1 &&
    q.currentQuest === JTC.ambush &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.underCrossroads) &&
    codes(q.underBlackGate) &&
    (q.arrows === undefined || counter(q.arrows)) &&
    (q.captain === undefined || counter(q.captain)) &&
    (q.oliphaunt === undefined ||
      (!!q.oliphaunt &&
        natural(q.oliphaunt.round) &&
        !!q.oliphaunt.damage &&
        typeof q.oliphaunt.damage === "object" &&
        Object.values(q.oliphaunt.damage).every(natural)))
  );
}
