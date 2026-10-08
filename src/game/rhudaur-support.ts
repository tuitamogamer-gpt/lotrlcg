import encounters from "../data/rhudaur-encounter-cards.json";
import quests from "../data/rhudaur-quest-cards.json";
import recipes from "../data/rhudaur-recipes.json";
import { WEATHER } from "./weather-hills-support";
import type { Card, GameState, Phase, Unit } from "./types";

export const RHUDAUR_ENCOUNTERS = encounters as Card[];
export const RHUDAUR_QUESTS = quests as Card[];
export const RHUDAUR_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const RHUDAUR = {
  secrets: code("Secrets of Rhudaur"),
  pursuit: code("Thaurdir's Pursuit"),
  amarthiul: code("Amarthiúl"),
  thaurdir: code("Thaurdir"),
  hall: code("The Great Hall"),
  descent: code("Forbidden Descent"),
  years: code("Curse of the Years"),
  wight: code("Wight of Rhudaur"),
  spirits: code("Quiet the Spirits"),
  texts: code("Decipher Ancient Texts"),
  debris: code("Sift Through the Debris"),
  covenant: code("Dark Covenant"),
  sorrow: code("Centuries of Sorrow"),
  fog: code("Haunting Fog"),
  halls: code("Eerie Halls"),
  ghostly: code("Ghostly Ruins"),
  traitor: code("Traitorous Wight"),
  discovery: WEATHER.discovery,
  remains: code("Decrepit Remains"),
  heirloom: code("Heirloom of Iârchon"),
  brand: code("Daechanar's Brand"),
  orders: code("Orders from Angmar"),
};
export const RHUDAUR_SIDES = [RHUDAUR.spirits, RHUDAUR.texts, RHUDAUR.debris];
export const RHUDAUR_CLUES = [RHUDAUR.brand, RHUDAUR.orders, RHUDAUR.heirloom];
export const RHUDAUR_FLIPS: Record<string, string> = {
  [RHUDAUR.spirits]: RHUDAUR.brand,
  [RHUDAUR.texts]: RHUDAUR.orders,
  [RHUDAUR.debris]: RHUDAUR.heirloom,
};
export interface RhudaurState {
  initialized: boolean;
  time: number;
  setAside: Unit[];
  forbiddenProgressRound: number;
  forbiddenProgress: Record<string, number>;
  quietThreat: Record<string, { phase: Phase; threat: number }>;
  textActionsRound: number;
  textActions: Record<string, number>;
  deckEmptyHandled: boolean;
}
export function validateRhudaur(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.rhudaur;
  if (q === undefined) return s.scenarioId !== "the-treachery-of-rhudaur";
  return (
    !!q &&
    s.scenarioId === "the-treachery-of-rhudaur" &&
    typeof q.initialized === "boolean" &&
    typeof q.deckEmptyHandled === "boolean" &&
    [1, 2].includes(s.stage) &&
    Number.isSafeInteger(q.time) &&
    q.time >= 0 &&
    q.time <= 5 &&
    Array.isArray(q.setAside) &&
    q.setAside.length <= 1 &&
    q.setAside.every((u) => validUnit(u) && u.code === RHUDAUR.thaurdir) &&
    (s.stage !== 2 ||
      q.setAside.length === 0 ||
      (s.stageRevealing &&
        s.queue.some((e) => e.kind === "rhudaurStageTwo"))) &&
    Number.isSafeInteger(q.forbiddenProgressRound) &&
    q.forbiddenProgressRound >= -1 &&
    q.forbiddenProgressRound <= s.round &&
    !!q.forbiddenProgress &&
    typeof q.forbiddenProgress === "object" &&
    !Array.isArray(q.forbiddenProgress) &&
    Object.entries(q.forbiddenProgress).every(
      ([id, n]) => !!id && Number.isSafeInteger(n) && n >= 0 && n <= 2,
    ) &&
    Number.isSafeInteger(q.textActionsRound) &&
    q.textActionsRound >= -1 &&
    q.textActionsRound <= s.round &&
    !!q.textActions &&
    typeof q.textActions === "object" &&
    !Array.isArray(q.textActions) &&
    Object.entries(q.textActions).every(
      ([id, n]) => !!id && Number.isSafeInteger(n) && n >= 0 && n <= 3,
    ) &&
    !!q.quietThreat &&
    typeof q.quietThreat === "object" &&
    !Array.isArray(q.quietThreat) &&
    Object.entries(q.quietThreat).every(
      ([id, v]) =>
        !!id &&
        !!v &&
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
        ].includes(v.phase) &&
        Number.isFinite(v.threat) &&
        v.threat >= 0,
    )
  );
}
