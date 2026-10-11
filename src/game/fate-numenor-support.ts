import encounters from "../data/fate-numenor-encounter-cards.json";
import quests from "../data/fate-numenor-quest-cards.json";
import recipes from "../data/fate-numenor-recipes.json";
import type { Card, GameState, Phase, Unit } from "./types";

export const FATE_ENCOUNTERS = encounters as Card[];
export const FATE_QUESTS = quests as Card[];
export const FATE_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FATE = {
  explore: code("Explore the Island"),
  discovery: code("A Fateful Discovery"),
  calphon: code("Calphon"),
  shrine: code("Shrine to Morgoth"),
  lost: "fate-lost-island",
  jungle: code("Lush Jungle"),
  coast: code("Forbidden Coast"),
  flooded: code("Flooded Ruins"),
  graves: code("Drowned Graves"),
  temple: code("Cursed Temple"),
  servant: code("Servant of the Deceiver"),
  plateau: code("Steep Plateau"),
  fog: code("Mysterious Fog"),
  malevolence: code("Lingering Malevolence"),
  ruins: code("Ruins of Ages Past"),
  drowned: code("Drowned Dead"),
  cadaver: code("Soulless Cadaver"),
  throngs: code("Throngs of Unfaithful"),
  curse: code("Curse of the Downfallen"),
  wandering: code("Aimless Wandering"),
};
export const FATE_UNCHARTED = [
  FATE.jungle,
  FATE.coast,
  FATE.flooded,
  FATE.graves,
  FATE.temple,
  FATE.shrine,
];
export interface FateNumenorState {
  initialized: boolean;
  unchartedDeck: string[];
  setAside: Unit[];
  /** Actual backs never occur on a public Lost Island unit. */
  hiddenBacks: Record<string, string>;
  lookedBy: Record<string, number[]>;
  fogPhase: Phase | null;
  fogThreat: number;
  /** Destruction replacements follow redirected damage and physical owners. */
  bottomOnDestroy: string[];
  curseDamageIds: string[];
  /** Only copies discarded by the current Drowned Graves effect are selectable. */
  gravesPool?: string[];
}
export function validateFateNumenor(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.fateNumenor;
  if (q === undefined) return s.scenarioId !== "the-fate-of-numenor";
  if (!q || s.scenarioId !== "the-fate-of-numenor") return false;
  const locations = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ];
  const islands = locations.filter((u) => u.code === FATE.lost);
  const seats = s.table?.seats.length ?? 1;
  const record = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  return (
    typeof q.initialized === "boolean" &&
    [1, 2].includes(s.stage) &&
    Array.isArray(q.unchartedDeck) &&
    q.unchartedDeck.length <= 11 &&
    q.unchartedDeck.every((c) => FATE_UNCHARTED.includes(c)) &&
    Array.isArray(q.setAside) &&
    q.setAside.length <= 1 &&
    q.setAside.every((u) => validUnit(u) && u.code === FATE.shrine) &&
    record(q.hiddenBacks) &&
    Object.entries(q.hiddenBacks).length === islands.length &&
    Object.entries(q.hiddenBacks).every(
      ([id, c]) =>
        islands.some((u) => u.id === id) && FATE_UNCHARTED.includes(c),
    ) &&
    record(q.lookedBy) &&
    Object.entries(q.lookedBy).every(
      ([id, ps]) =>
        id in q.hiddenBacks &&
        Array.isArray(ps) &&
        new Set(ps).size === ps.length &&
        ps.every((p) => Number.isInteger(p) && p >= 0 && p < seats),
    ) &&
    (q.fogPhase === null ||
      [
        "setup",
        "resource",
        "planning",
        "quest",
        "staging",
        "travel",
        "encounter",
        "defense",
        "attack",
        "refresh",
      ].includes(q.fogPhase)) &&
    Number.isSafeInteger(q.fogThreat) &&
    q.fogThreat >= 0 &&
    [q.bottomOnDestroy, q.curseDamageIds].every(
      (xs) =>
        Array.isArray(xs) &&
        xs.every((id) => typeof id === "string" && /^c\d+$/.test(id)) &&
        new Set(xs).size === xs.length,
    ) &&
    (q.gravesPool === undefined ||
      (Array.isArray(q.gravesPool) &&
        q.gravesPool.length <= 6 &&
        q.gravesPool.every((c) =>
          [FATE.servant, FATE.cadaver, FATE.drowned, FATE.throngs].includes(c),
        ))) &&
    (!q.initialized ||
      s.status === "lost" ||
      [...s.allies, ...(s.table?.seats.flatMap((p) => p.allies) ?? [])].some(
        (u) => u.code === FATE.calphon,
      )) &&
    (s.stage !== 2 || q.setAside.length === 0 || !!s.stageRevealing)
  );
}
