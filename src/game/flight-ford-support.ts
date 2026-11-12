// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/flight-ford-encounter-cards.json";
import quests from "../data/flight-ford-quest-cards.json";
import recipes from "../data/flight-ford-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { SP, SHADOW_PAST_ENCOUNTERS } from "./shadow-past-support";
import { KD, KNIFE_DARK_ENCOUNTERS } from "./knife-dark-support";
export type { FlightFordState } from "./flight-ford-types";

export const FLIGHT_FORD_ENCOUNTERS = encounters as Card[];
export const FLIGHT_FORD_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const FLIGHT_FORD_RECIPES = recipes;
export const FLIGHT_FORD_SCENARIO = "flight-to-the-ford";
/** The Ring-bearer's life at setup. */
export const RING_BEARER_LIFE = 15;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FF = {
  pursued: code("Pursued by the Enemy"),
  race: code("Race to Rivendell"),
  weight: code("Weight of the Ring"),
  fear: code("Fear of Discovery"),
  eaten: code("Eaten Alive!"),
  panicked: code("Panicked"),
  overcome: code("Overcome by Terror"),
  uponUs: code("The Enemy is Upon Us!"),
  camp: code("The Troll's Camp"),
  ford: code("Ford of Bruinen"),
  fell: code("Fell Rider"),
  wound: code("An Evil Wound"),
  stricken: code("Stricken Dumb"),
  nine: code("The Nine are Abroad"),
  pain: code("Pain Assailed Him"),
  ettenmoors: code("Ettenmoors"),
  bridge: code("The Last Bridge"),
  oldRoad: code("The Old Road"),
  // The Black Riders, Hunted and The Nazgûl sets, shared with the earlier scenarios.
  steed: SP.steed,
  gale: SP.gale,
  pathless: SP.pathless,
  cry: SP.cry,
  ringwraith: KD.ringwraith,
  witchKing: KD.witchKing,
  blade: KD.blade,
  terror: KD.terror,
} as const;
/** The Flight to the Ford burden set. */
export const FF_BURDENS: readonly string[] = [
  FF.weight,
  FF.fear,
  FF.eaten,
  FF.panicked,
  FF.overcome,
];

const byCode = new Map(
  [
    ...FLIGHT_FORD_ENCOUNTERS,
    ...KNIFE_DARK_ENCOUNTERS,
    ...SHADOW_PAST_ENCOUNTERS,
  ].map((c) => [c.code, c]),
);
const traitsOf = (code: string) =>
  (byCode.get(code)?.traits ?? "").split(".").map((t) => t.trim());
/** A Nazgûl enemy of this encounter deck. */
export const isFfNazgul = (u: Unit | string) => {
  const c = typeof u === "string" ? u : u.code;
  return byCode.get(c)?.type_code === "enemy" && traitsOf(c).includes("Nazgûl");
};
export const ffLocations = (s: GameState) =>
  [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].filter((u) => byCode.get(u.code)?.type_code === "location");
/** Each Nazgûl enemy in play: in the staging area or engaged with a player. */
export function ffNazgulInPlay(s: GameState) {
  const engaged = s.table
    ? s.table.seats.flatMap((p, i) =>
        i === s.table!.active ? s.engaged : p.engaged,
      )
    : s.engaged;
  return [...s.staging, ...engaged].filter((u) => isFfNazgul(u));
}
export function flightFordStageInfo(s: GameState) {
  const q = FLIGHT_FORD_QUESTS[s.stage - 1];
  if (!q || !s.flightFord) return undefined;
  const front = s.stageRevealing;
  // 2B: +15 quest points while at least 1 Nazgûl enemy is in play.
  const bonus = s.stage === 2 && !front && ffNazgulInPlay(s).length ? 15 : 0;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0) + bonus,
    story: (front ? q.text : q.back_text) || (q.back_text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const flightFordUnits = (s: GameState): Unit[] => [
  ...(s.flightFord?.resolving ?? []),
];
export function flightFordPublicState(s: GameState) {
  const q = s.flightFord;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    life: q.life,
    burdens: q.burdens.length,
    fordAside: q.setAside.includes(FF.ford),
    witchKingAside: q.setAside.includes(FF.witchKing),
    bridge: (s.victoryCards ?? []).includes(FF.bridge)
      ? ("explored" as const)
      : ffLocations(s).some((l) => l.code === FF.bridge)
        ? ("in-play" as const)
        : ("gone" as const),
    ford: (s.victoryCards ?? []).includes(FF.ford)
      ? ("explored" as const)
      : q.setAside.includes(FF.ford)
        ? ("aside" as const)
        : ("in-play" as const),
    nazgul: ffNazgulInPlay(s).length,
    blankThisRound: !!q.blank && q.blank.round === s.round,
    painThisRound: q.painRound === s.round,
    extraReveals: q.extraReveals,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateFlightFord(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.flightFord;
  if (q === undefined) return s.scenarioId !== FLIGHT_FORD_SCENARIO;
  return (
    !!q &&
    s.scenarioId === FLIGHT_FORD_SCENARIO &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === FLIGHT_FORD_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    integer(q.life) &&
    q.life >= 0 &&
    q.life <= RING_BEARER_LIFE &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => c === FF.ford || c === FF.witchKing) &&
    new Set(q.setAside).size === q.setAside.length &&
    Array.isArray(q.burdens) &&
    q.burdens.every((c) => FF_BURDENS.includes(c)) &&
    new Set(q.burdens).size === q.burdens.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    integer(q.extraReveals) &&
    q.extraReveals >= 0 &&
    q.extraReveals <= 10 &&
    (q.blank === null ||
      (!!q.blank &&
        integer(q.blank.round) &&
        Array.isArray(q.blank.ids) &&
        q.blank.ids.every((id) => typeof id === "string"))) &&
    (q.painRound === null || integer(q.painRound))
  );
}
