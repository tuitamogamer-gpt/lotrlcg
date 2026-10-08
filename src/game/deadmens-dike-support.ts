import encounters from "../data/deadmens-dike-encounter-cards.json";
import quests from "../data/deadmens-dike-quest-cards.json";
import recipes from "../data/deadmens-dike-recipes.json";
import { CHETWOOD } from "./chetwood-support";
import type { Card, GameState, Unit } from "./types";

export const DIKE_ENCOUNTERS = encounters as Card[];
export const DIKE_QUESTS = quests as Card[];
export const DIKE_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const DIKE = {
  shades: code("The Shades of Angmar"),
  wraith: code("A Fell Wraith"),
  iarion: CHETWOOD.iarion,
  restless: code("Restless Evil"),
  fog: code("Unnatural Fog"),
  cursed: code("Cursed Dead"),
  gate: code("Deadmen's Gate"),
  thaurdir: code("Thaurdir"),
  square: code("Fornost Square"),
  seal: code("Seal the Tomb"),
  battlements: code("Broken Battlements"),
  damned: code("Thaurdir's Damned"),
  keep: code("Haunted Keep"),
  tombs: code("Norbury Tombs"),
  curse: code("Heavy Curse"),
  lord: code("Dead Lord"),
  power: code("The Power of Angmar"),
  terror: code("Terror of the North"),
  world: code("The Shadow World"),
  sorcery: code("Dark Sorcery"),
  shade: code("Baleful Shade"),
};
export const dikeLocationTime = (code: string) =>
  code === DIKE.battlements ? 3 : 0;
export const dikeLocationTimeLimit = (
  s: GameState,
  code: string,
  seatCount = s.table?.seats.length ?? 1,
) => (code === DIKE.battlements ? Math.max(3, seatCount) : 0);

export interface DeadmensDikeState {
  initialized: boolean;
  setAside: Unit[];
  undeadRevealRound: number;
  terrorRound: number;
  terrorThreat: number;
}
export function validateDeadmensDike(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.deadmensDike;
  if (q === undefined) return s.scenarioId !== "deadmens-dike";
  return (
    !!q &&
    s.scenarioId === "deadmens-dike" &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.length <= 1 &&
    q.setAside.every((u) => validUnit(u) && u.code === DIKE.thaurdir) &&
    [q.undeadRevealRound, q.terrorRound].every(
      (round) => Number.isSafeInteger(round) && round >= -1 && round <= s.round,
    ) &&
    Number.isSafeInteger(q.terrorThreat) &&
    q.terrorThreat >= 0 &&
    (q.terrorThreat === 0 || q.terrorRound >= 0) &&
    [1, 2].includes(s.stage) &&
    (!q.initialized || s.stage === 2 || q.setAside.length === 1)
  );
}
