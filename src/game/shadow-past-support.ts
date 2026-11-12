// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/shadow-past-encounter-cards.json";
import quests from "../data/shadow-past-quest-cards.json";
import recipes from "../data/shadow-past-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { ShadowPastState } from "./shadow-past-types";

export const SHADOW_PAST_ENCOUNTERS = encounters as Card[];
export const SHADOW_PAST_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const SHADOW_PAST_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const SP = {
  company: code("Three is Company"),
  mushrooms: code("A Shortcut to Mushrooms"),
  buckland: code("Escape to Buckland"),
  bagEnd: code("Bag End"),
  woody: code("Woody End"),
  stockBrook: code("Stock-brook"),
  bamfurlong: code("Bamfurlong"),
  ferry: code("Bucklebury Ferry"),
  greenHill: code("Green Hill Country"),
  stockRoad: code("Stock Road"),
  marish: code("The Marish"),
  rider: code("Black Rider"),
  crow: code("Evil Crow"),
  crawling: code("Crawling Towards Him"),
  hunting: code("Hunting for the Ring"),
  baggins: code("Have you seen Baggins?"),
  pathless: code("Pathless Country"),
  cry: code("Piercing Cry"),
  steed: code("Black Steed"),
  gale: code("Rode Like a Gale"),
  lure: code("Lure of the Ring"),
};

const byCode = new Map(SHADOW_PAST_ENCOUNTERS.map((c) => [c.code, c]));
const traitsOf = (code: string) =>
  (byCode.get(code)?.traits ?? "").split(".").map((t) => t.trim());
export const spTrait = (u: Unit | string, trait: string) =>
  traitsOf(typeof u === "string" ? u : u.code).includes(trait);
export const isNazgul = (u: Unit | string) => spTrait(u, "Nazgûl");
export const spLocations = (s: GameState) =>
  [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].filter((u) => byCode.get(u.code)?.type_code === "location");
export function shadowPastStageInfo(s: GameState) {
  const q = SHADOW_PAST_QUESTS[s.stage - 1];
  if (!q || !s.shadowPast) return undefined;
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
export const shadowPastUnits = (s: GameState): Unit[] => [
  ...(s.shadowPast?.resolving ?? []),
];
export function shadowPastPublicState(s: GameState) {
  const q = s.shadowPast;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    bagEndExplored: (s.victoryCards ?? []).includes(SP.bagEnd),
    ferryAside: q.setAside.includes(SP.ferry),
    ferryInPlay: spLocations(s).some((l) => l.code === SP.ferry),
    resolving: q.resolving.length,
  };
}
export function validateShadowPast(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.shadowPast;
  if (q === undefined) return s.scenarioId !== "a-shadow-of-the-past";
  return (
    !!q &&
    s.scenarioId === "a-shadow-of-the-past" &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === SHADOW_PAST_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    typeof q.noCancel === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => c === SP.ferry) &&
    q.setAside.length <= 1 &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
