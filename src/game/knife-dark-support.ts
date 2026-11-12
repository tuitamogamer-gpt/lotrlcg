// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/knife-dark-encounter-cards.json";
import quests from "../data/knife-dark-quest-cards.json";
import recipes from "../data/knife-dark-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { SP, SHADOW_PAST_ENCOUNTERS } from "./shadow-past-support";
export type { KnifeDarkState } from "./knife-dark-types";

export const KNIFE_DARK_ENCOUNTERS = encounters as Card[];
export const KNIFE_DARK_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const KNIFE_DARK_RECIPES = recipes;
export const KNIFE_DARK_SCENARIO = "a-knife-in-the-dark";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const KD = {
  bree: code("Trouble in Bree"),
  wild: code("Into the Wild"),
  attack: code("The Ringwraiths Attack"),
  pony: code("The Prancing Pony"),
  weathertop: code("Weathertop"),
  chetwood: code("Chetwood"),
  midgewater: code("Midgewater"),
  hills: code("Weather Hills"),
  rider: code("Rider of Mordor"),
  ferny: code("Bill Ferny"),
  shady: code("Shady Bree-lander"),
  squint: code("Squint-eyed Southerner"),
  unwanted: code("Unwanted Attention"),
  breath: code("Black Breath"),
  witchKing: code("The Witch-king"),
  ringwraith: code("Ringwraith"),
  blade: code("Pale Blade"),
  terror: code("Power in their Terror"),
  // The Hunted and The Ring sets, shared with A Shadow of the Past.
  pathless: SP.pathless,
  cry: SP.cry,
  lure: SP.lure,
} as const;

const byCode = new Map(
  [...KNIFE_DARK_ENCOUNTERS, ...SHADOW_PAST_ENCOUNTERS].map((c) => [c.code, c]),
);
const traitsOf = (code: string) =>
  (byCode.get(code)?.traits ?? "").split(".").map((t) => t.trim());
export const kdTrait = (u: Unit | string, trait: string) =>
  traitsOf(typeof u === "string" ? u : u.code).includes(trait);
/** A Nazgûl enemy of this encounter deck. */
export const isKdNazgul = (u: Unit | string) =>
  byCode.get(typeof u === "string" ? u : u.code)?.type_code === "enemy" &&
  kdTrait(u, "Nazgûl");
export const kdLocations = (s: GameState) =>
  [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].filter((u) => byCode.get(u.code)?.type_code === "location");
/** Each Nazgûl enemy in play: in the staging area or engaged with a player. */
export function kdNazgulInPlay(s: GameState) {
  const engaged = s.table
    ? s.table.seats.flatMap((p, i) =>
        i === s.table!.active ? s.engaged : p.engaged,
      )
    : s.engaged;
  return [...s.staging, ...engaged].filter((u) => isKdNazgul(u));
}
export function knifeDarkStageInfo(s: GameState) {
  const q = KNIFE_DARK_QUESTS[s.stage - 1];
  if (!q || !s.knifeDark) return undefined;
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
export const knifeDarkUnits = (s: GameState): Unit[] => [
  ...(s.knifeDark?.resolving ?? []),
];
export function knifeDarkPublicState(s: GameState) {
  const q = s.knifeDark;
  if (!q) return undefined;
  const aside = (c: string) => q.setAside.filter((x) => x === c).length;
  return {
    currentQuest: q.currentQuest,
    ringwraithsAside: aside(KD.ringwraith),
    witchKingAside: aside(KD.witchKing) > 0,
    midgewater: aside(KD.midgewater)
      ? ("aside" as const)
      : kdLocations(s).some((l) => l.code === KD.midgewater)
        ? ("in-play" as const)
        : ("explored" as const),
    weathertop: (s.victoryCards ?? []).includes(KD.weathertop)
      ? ("explored" as const)
      : aside(KD.weathertop)
        ? ("aside" as const)
        : ("in-play" as const),
    ponyInPlay: kdLocations(s).some((l) => l.code === KD.pony),
    hidden: q.hills.reduce((n, h) => n + h.codes.length, 0),
    nazgul: kdNazgulInPlay(s).length,
    finale: q.finale,
    resolving: q.resolving.length,
  };
}
const SET_ASIDE: readonly string[] = [
  KD.ringwraith,
  KD.witchKing,
  KD.midgewater,
  KD.weathertop,
];
export function validateKnifeDark(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.knifeDark;
  if (q === undefined) return s.scenarioId !== KNIFE_DARK_SCENARIO;
  return (
    !!q &&
    s.scenarioId === KNIFE_DARK_SCENARIO &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === KNIFE_DARK_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    typeof q.finale === "boolean" &&
    (!q.finale || s.stage === 3) &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => SET_ASIDE.includes(c)) &&
    q.setAside.filter((c) => c === KD.ringwraith).length <= 4 &&
    SET_ASIDE.slice(1).every(
      (c) => q.setAside.filter((x) => x === c).length <= 1,
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.hills) &&
    q.hills.every(
      (h) =>
        !!h &&
        typeof h.location === "string" &&
        Array.isArray(h.codes) &&
        h.codes.length > 0 &&
        h.codes.every((c) => byCode.get(c)?.type_code === "enemy"),
    ) &&
    new Set(q.hills.map((h) => h.location)).size === q.hills.length
  );
}
