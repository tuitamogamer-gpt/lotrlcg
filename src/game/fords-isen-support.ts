import encounters from "../data/fords-isen-encounter-cards.json";
import quests from "../data/fords-isen-quest-cards.json";
import recipes from "../data/fords-isen-recipes.json";
import type { Card, GameState } from "./types";

export const FORDS_ISEN_ENCOUNTERS = encounters as Card[];
export const FORDS_ISEN_QUESTS = quests as Card[];
export const FORDS_ISEN_RECIPES = recipes;
const code = (title: string) =>
  [...encounters, ...quests].find((c) => c.name === title)!.code;
export const FORDS = {
  fight: code("Fight at the Fords"),
  attack: code("Dunlending Attack"),
  hold: code("Hold the Fords"),
  grima: code("Gríma"),
  islet: code("The Islet"),
  fords: code("Fords of Isen"),
  road: code("The King's Road"),
  gap: code("Gap of Rohan"),
  pillaging: code("Pillaging and Burning"),
  hills: code("Down From The Hills"),
  tidings: code("Ill Tidings"),
  prowler: code("Dunland Prowler"),
  bandit: code("Dunlending Bandit"),
  raider: code("Dunland Raider"),
  hatreds: code("Old Hatreds"),
  tribesman: code("Dunland Tribesman"),
  chieftain: code("Dunland Chieftain"),
  berserker: code("Dunland Berserker"),
  wild: code("Wild Men of Dunland"),
};
export interface FordsIsenState {
  time: number;
}
export const fordsTimeLimit = (stage: number) => [5, 2, 3][stage - 1];
export function validateFordsIsenState(s: GameState) {
  if (s.fordsIsen === undefined) return s.scenarioId !== "fords-of-isen";
  return (
    s.scenarioId === "fords-of-isen" &&
    !!s.fordsIsen &&
    Number.isInteger(s.fordsIsen.time) &&
    s.fordsIsen.time >= 0 &&
    s.fordsIsen.time <= fordsTimeLimit(s.stage)
  );
}
