import encounters from "../data/fangorn-encounter-cards.json";
import quests from "../data/fangorn-quest-cards.json";
import recipes from "../data/fangorn-recipes.json";
import type { Card, GameState } from "./types";

export const FANGORN_ENCOUNTERS = encounters as Card[];
export const FANGORN_QUESTS = quests as Card[];
export const FANGORN_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FANGORN = {
  woods: code("Into the Woods"),
  escape: code("Escape from Fangorn"),
  angryForest: code("The Angry Forest"),
  ancient: code("Ancient Forest"),
  tangled: code("Tangled Woods"),
  turned: code("Turned Around"),
  dark: code("Dark-Hearted Huorn"),
  angry: code("Angry Huorn"),
  deadly: code("Deadly Huorn"),
  heart: code("Heart of Fangorn"),
  malice: code("The Forest's Malice"),
  provisions: code("Low on Provisions"),
  offTrack: code("Off Track"),
  rest: code("In Need of Rest"),
  edge: code("Edge of Fangorn"),
  mugash: code("Mugash"),
};
export interface FangornState {
  time: number;
  /** Stage 3 advances only in response to newly placed quest progress. */
  progressTrigger?: boolean;
  maliceAttacked?: boolean;
}
export const fangornTimeLimit = (stage: number) => (stage === 3 ? 3 : 4);
export function validateFangornState(s: GameState) {
  if (s.fangorn === undefined) return s.scenarioId !== "into-fangorn";
  const q = s.fangorn;
  return (
    s.scenarioId === "into-fangorn" &&
    !!q &&
    Number.isSafeInteger(q.time) &&
    q.time >= 0 &&
    q.time <= fangornTimeLimit(s.stage) &&
    (q.progressTrigger === undefined ||
      typeof q.progressTrigger === "boolean") &&
    (q.maliceAttacked === undefined || typeof q.maliceAttacked === "boolean")
  );
}
