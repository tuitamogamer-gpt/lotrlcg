import encounters from "../data/massing-osgiliath-encounter-cards.json";
import quests from "../data/massing-osgiliath-quest-cards.json";
import recipes from "../data/massing-osgiliath-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { MassingState } from "./massing-osgiliath-types";

export const MASSING_ENCOUNTERS = encounters as Card[];
export const MASSING_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const MASSING_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const MASSING = {
  first: code("Beyond Expectations"),
  ruinsStage: code("Through the Ruins"),
  crossing: code("Anduin Crossing"),
  race: code("Race to Minas Tirith"),
  witchKing: code("The Witch-king"),
  snaga: code("Snaga Scouts"),
  wolves: code("Wolves from Mordor"),
  wainriders: code("Wainriders"),
  captain: code("Wainrider Captain"),
  uruk: code("Uruk Vanguard"),
  watchtower: code("Captured Watchtower"),
  overlook: code("Emyn Arnen Overlook"),
  morgulduin: code("Morgulduin"),
  pelennor: code("Pelennor Fields"),
  ruins: code("Ruins of Osgiliath"),
  cutOff: code("Cut Off"),
  pursuit: code("Dark Pursuit"),
  massing: code("Massing at Osgiliath"),
  ranger: code("Ranger of Ithilien"),
};
/** The three Scout titles that begin the game in the staging area. */
export const MASSING_SCOUTS = [
  MASSING.snaga,
  MASSING.wolves,
  MASSING.wainriders,
];
const traitsOf = new Map(
  encounters.map((c) => [
    c.code,
    (c.traits ?? "").split(".").map((t) => t.trim()),
  ]),
);
export const massingTrait = (u: Unit | string, trait: string) =>
  !!traitsOf.get(typeof u === "string" ? u : u.code)?.includes(trait);
export const massingPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["attack", "defense"].includes(s.phase)
      ? "combat"
      : s.phase;
export const massingPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
export function massingStageInfo(s: GameState) {
  const q = MASSING_QUESTS[s.stage - 1];
  if (!q || !s.massing) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? q.quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const massingUnits = (s: GameState): Unit[] => [
  ...(s.massing?.setAside ?? []),
  ...(s.massing?.resolving ?? []),
];
export function massingPublicState(s: GameState) {
  const q = s.massing;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    crossed: q.crossed,
    witchKingSetAside: q.setAside.some((u) => u.code === MASSING.witchKing),
    handCards: q.handCards.round === s.round ? { ...q.handCards.counts } : {},
    resolving: q.resolving.length,
  };
}
export function validateMassing(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.massing;
  if (q === undefined) return s.scenarioId !== "the-massing-at-osgiliath";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const round = (x: unknown) => n(x) && Number(x) <= s.round;
  const seats = s.table?.seats.length ?? 1;
  const phase = (x: unknown) =>
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "travel",
      "encounter",
      "combat",
      "refresh",
    ].includes(x as string);
  const entries = (v: unknown) =>
    Array.isArray(v) &&
    v.every(
      (m) =>
        !!m &&
        round((m as { round: number }).round) &&
        phase((m as { phase: string }).phase) &&
        n((m as { value: number }).value),
    );
  return (
    !!q &&
    s.scenarioId === "the-massing-at-osgiliath" &&
    [1, 2, 3, 4].includes(s.stage) &&
    q.currentQuest === MASSING_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    typeof q.crossed === "boolean" &&
    (!q.crossed || s.stage === 4) &&
    Array.isArray(q.setAside) &&
    q.setAside.every((u) => unit(u) && u.code === MASSING.witchKing) &&
    q.setAside.length <= 1 &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    entries(q.phaseThreat) &&
    entries(q.doomed) &&
    Number.isSafeInteger(q.scoutRound) &&
    q.scoutRound >= -1 &&
    q.scoutRound <= s.round &&
    (q.overlook === null ||
      (typeof q.overlook === "string" &&
        MASSING_SCOUTS.includes(q.overlook))) &&
    !!q.handCards &&
    round(q.handCards.round) &&
    !!q.handCards.counts &&
    typeof q.handCards.counts === "object" &&
    Object.entries(q.handCards.counts).every(
      ([p, v]) => /^\d+$/.test(p) && Number(p) < seats && n(v),
    )
  );
}
