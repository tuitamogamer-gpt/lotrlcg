import encounters from "../data/ettenmoors-encounter-cards.json";
import quests from "../data/ettenmoors-quest-cards.json";
import recipes from "../data/ettenmoors-recipes.json";
import type { Card, GameState } from "./types";

export const ETTEN_ENCOUNTERS = encounters as Card[];
export const ETTEN_QUESTS = quests as Card[];
export const ETTEN_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const ETTEN = {
  into: code("Into the Ettenmoors"),
  journey: code("A Miserable Journey"),
  end: code("Journey's End"),
  amarthiul: code("Amarthiúl"),
  camp: code("Abandoned Camp"),
  cave: code("Secluded Cave"),
  woods: code("Patch of Woods"),
  hoarwell: code("The Hoarwell"),
  noRest: code("No Rest"),
  cruel: code("Cruel Mountain-troll"),
  ruthless: code("Ruthless Hill-troll"),
  spawn: code("Savage Trollspawn"),
  giant: code("Coldfell Giant"),
  goblin: code("Goblin Pursuer"),
  moorland: code("Barren Moorland"),
  fells: code("Troll-fells"),
  arador: code("Arador's Bane"),
  lieLow: code("Lie Low"),
  forage: code("Forage for Food"),
  scavenge: code("Scavenge for Supplies"),
};
export const ETTEN_SAFE = [ETTEN.camp, ETTEN.cave, ETTEN.woods, ETTEN.hoarwell];
export const ETTEN_SIDES = [ETTEN.lieLow, ETTEN.forage, ETTEN.scavenge];
export interface EttenmoorsState {
  initialized: boolean;
  /** Actual placement, rather than current tokens, governs Lie Low. */
  lieLowProgressRound: Record<string, number>;
  /** Lie Low's penalty applies to every enemy until this round ends. */
  lowEngagementRound: number;
  lowEngagementPenalty: number;
}
export function validateEttenmoors(
  s: GameState,
  _validUnit: (u: unknown) => boolean,
) {
  const q = s.ettenmoors;
  if (q === undefined) return s.scenarioId !== "across-the-ettenmoors";
  return (
    !!q &&
    s.scenarioId === "across-the-ettenmoors" &&
    typeof q.initialized === "boolean" &&
    [1, 2, 3].includes(s.stage) &&
    !!q.lieLowProgressRound &&
    typeof q.lieLowProgressRound === "object" &&
    !Array.isArray(q.lieLowProgressRound) &&
    Object.entries(q.lieLowProgressRound).every(
      ([id, round]) =>
        !!id && Number.isSafeInteger(round) && round >= 0 && round <= s.round,
    ) &&
    Number.isSafeInteger(q.lowEngagementRound) &&
    q.lowEngagementRound >= -1 &&
    q.lowEngagementRound <= s.round &&
    Number.isSafeInteger(q.lowEngagementPenalty) &&
    q.lowEngagementPenalty >= 0 &&
    q.lowEngagementPenalty % 20 === 0 &&
    (q.lowEngagementPenalty === 0 || q.lowEngagementRound >= 0)
  );
}
