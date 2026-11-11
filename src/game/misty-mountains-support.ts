import encounters from "../data/misty-mountains-encounter-cards.json";
import quests from "../data/misty-mountains-quest-cards.json";
import recipes from "../data/misty-mountains-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { WMA } from "./we-must-away-support";
export type { MistyMountainsState } from "./misty-mountains-types";

export const OMM_ENCOUNTERS = encounters as Card[];
export const OMM_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const OMM_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const OMM = {
  rest: code("A Short Rest"),
  pass: code("The Mountain Pass"),
  town: code("Down, Down to Goblin Town"),
  boulders: code("Galloping Boulders"),
  guffawing: code("Guffawing of Giants"),
  rock: code("Overhanging Rock"),
  giant: code("Stone-Giant"),
  highPass: code("The High Pass"),
  greatGoblin: code("The Great Goblin"),
  chaos: code("Chaos in the Cavern"),
  porch: code("Front Porch"),
  bentSwords: code("Goblin Bent-Swords"),
  cavern: code("Great Cavern Room"),
  axeman: code("Goblin Axeman"),
  driver: code("Goblin Driver"),
  miners: code("Goblin Miners"),
  runners: code("Goblin Runners"),
  grip: code("Grip, grab! Pinch, nab!"),
  caves: code("The Goblins' Caves"),
  // Western Lands, shared with We Must Away.
  crow: WMA.crow,
  caveEntrance: WMA.caveEntrance,
  drearyHills: WMA.drearyHills,
  loneLands: WMA.loneLands,
  grocer: WMA.grocer,
  campfire: WMA.campfire,
  rain: WMA.rain,
};
const traitsOf = new Map(
  encounters.map((c) => [
    c.code,
    (c.traits ?? "").split(".").map((t) => t.trim()),
  ]),
);
export const ommTrait = (u: Unit | string, trait: string) =>
  !!traitsOf.get(typeof u === "string" ? u : u.code)?.includes(trait);
export const ommPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["attack", "defense"].includes(s.phase)
      ? "combat"
      : s.phase;
export function ommStageInfo(s: GameState) {
  const q = OMM_QUESTS[s.stage - 1];
  if (!q || !s.mistyMountains) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? q.quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const ommUnits = (s: GameState): Unit[] => [
  ...(s.mistyMountains?.resolving ?? []),
];
export function ommPublicState(s: GameState) {
  const q = s.mistyMountains;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    goblinTown: q.goblinTown,
    inactiveDeck: q.inactiveDeck.length,
    resolving: q.resolving.length,
    guffawing: [...q.guffawing],
  };
}
export function validateMistyMountains(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.mistyMountains;
  if (q === undefined) return s.scenarioId !== "over-the-misty-mountains-grim";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const round = (x: unknown) => n(x) && Number(x) <= s.round;
  const codes = new Set(OMM_RECIPES.flatMap((r) => r.cards.map((c) => c.code)));
  return (
    !!q &&
    s.scenarioId === "over-the-misty-mountains-grim" &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === OMM_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    typeof q.initialized === "boolean" &&
    typeof q.goblinTown === "boolean" &&
    (!q.goblinTown || s.stage === 3) &&
    Array.isArray(q.inactiveDeck) &&
    q.inactiveDeck.every(
      (c: string) => typeof c === "string" && codes.has(c),
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.guffawing) &&
    q.guffawing.every((id: string) => typeof id === "string") &&
    Array.isArray(q.chaos) &&
    q.chaos.every(
      (m: { round: number; phase: string }) =>
        !!m &&
        round(m.round) &&
        [
          "quest",
          "travel",
          "encounter",
          "combat",
          "refresh",
          "planning",
          "resource",
        ].includes(m.phase),
    ) &&
    Array.isArray(q.porchBlank) &&
    q.porchBlank.every(
      (m: { id: string; round: number }) =>
        !!m && typeof m.id === "string" && round(m.round),
    )
  );
}
