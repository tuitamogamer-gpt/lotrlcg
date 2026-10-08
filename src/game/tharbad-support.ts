import encounters from "../data/tharbad-encounter-cards.json";
import quests from "../data/tharbad-quest-cards.json";
import recipes from "../data/tharbad-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const THARBAD_ENCOUNTERS = encounters as Card[];
export const THARBAD_QUESTS = quests as Card[];
export const THARBAD_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const THARBAD = {
  dealings: code("Double Dealings"),
  escape: code("Escape from Tharbad"),
  nalir: code("Nalir"),
  mug: code("The Empty Mug"),
  bellach: code("Bellach"),
  crossing: code("The Crossing at Tharbad"),
  spy: code("Spy from Mordor"),
  marauder: code("Bellach's Marauder"),
  streets: code("Streets of Tharbad"),
  hideout: code("Tharbad Hideout"),
  ruins: code("Ruins of the Second Age"),
  inn: code("Seedy Inn"),
  alley: code("Hidden Alleyway"),
  rooftops: code("Decrepit Rooftops"),
  tail: code("Constant Tail"),
  lot: code("Conspicuous Lot"),
  cornered: code("Cornered"),
  dwarf: code("Get That Dwarf!"),
};
export interface TharbadState {
  initialized: boolean;
  time: number;
  elimination: number;
  advancing?: boolean;
  setAside: Unit[];
  removedSources: string[];
}
export const threatElimination = (s: GameState) => s.tharbad?.elimination ?? 50;
export const tharbadTimeLimit = (stage: number) => (stage === 1 ? 4 : 3);
export function validateTharbad(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.tharbad;
  if (q === undefined) return s.scenarioId !== "trouble-in-tharbad";
  return (
    !!q &&
    s.scenarioId === "trouble-in-tharbad" &&
    typeof q.initialized === "boolean" &&
    (q.advancing === undefined || typeof q.advancing === "boolean") &&
    [q.time, q.elimination].every((n) => Number.isInteger(n) && n >= 0) &&
    q.elimination <= 50 &&
    q.elimination % 10 === 0 &&
    Array.isArray(q.removedSources) &&
    q.removedSources.every((id) => typeof id === "string") &&
    new Set(q.removedSources).size === q.removedSources.length &&
    Array.isArray(q.setAside) &&
    q.setAside.every(
      (u) =>
        validUnit(u) && [THARBAD.bellach, THARBAD.crossing].includes(u.code),
    ) &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length
  );
}
