import encounters from "../data/three-trials-encounter-cards.json";
import quests from "../data/three-trials-quest-cards.json";
import recipes from "../data/three-trials-recipes.json";
import art from "../data/scripted-scenario-art.json";
import type { Card, GameState, Unit } from "./types";
export const THREE_TRIALS_ENCOUNTERS = encounters as Card[];
export const THREE_TRIALS_QUESTS = quests as Card[];
export const THREE_TRIALS_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const TRIALS = {
  begin: code("The Trials Begin"),
  strength: code("The Trial of Strength"),
  perseverance: code("The Trial of Perseverance"),
  intuition: code("The Trial of Intuition"),
  crown: code("The Antlered Crown"),
  boar: code("Boar's Guardian"),
  wolf: code("Wolf's Guardian"),
  raven: code("Raven's Guardian"),
  boarKey: code("Key of the Boar"),
  wolfKey: code("Key of the Wolf"),
  ravenKey: code("Key of the Raven"),
  hill: code("Hill Barrow"),
  cave: code("Cave Barrow"),
  stone: code("Stone Barrow"),
  circle: code("Hallowed Circle"),
  spirit: code("Spirit of the Wild"),
  forest: code("Cursed Forest"),
  foothills: code("Grim Foothills"),
  curse: code("Curse of the Wild Men"),
  fury: code("The Guardian's Fury"),
  tenacity: code("Wild Tenacity"),
};
export const TRIAL_QUESTS = [
  TRIALS.strength,
  TRIALS.perseverance,
  TRIALS.intuition,
];
export const TRIAL_GUARDIANS = [TRIALS.boar, TRIALS.wolf, TRIALS.raven];
export const TRIAL_KEYS = [TRIALS.boarKey, TRIALS.wolfKey, TRIALS.ravenKey];
export const TRIAL_BARROWS = [TRIALS.hill, TRIALS.cave, TRIALS.stone];
export const TRIAL_SET_ASIDE = [
  ...TRIAL_GUARDIANS,
  ...TRIAL_KEYS,
  ...TRIAL_BARROWS,
  TRIALS.circle,
];
export const guardianTimeLimit = (code: string) =>
  code === TRIALS.boar
    ? 2
    : code === TRIALS.wolf
      ? 3
      : code === TRIALS.raven
        ? 4
        : 0;
export interface ThreeTrialsState {
  initialized: boolean;
  advancing?: boolean;
  activeQuest: string;
  completed: string[];
  currentKey?: string;
  setAside: Unit[];
  /** Set-aside cards preserve identity during the ordinary encounter reveal windows. */
  revealing: Unit[];
}
export const trialsGrantedImmunity = (s: GameState, code: string) =>
  s.threeTrials?.activeQuest === TRIALS.strength &&
  TRIAL_BARROWS.includes(code);
export const trialsCurrentQuest = (s: GameState) => s.threeTrials?.activeQuest;
export function trialsStageInfo(s: GameState) {
  const c = THREE_TRIALS_QUESTS.find((c) => c.code === trialsCurrentQuest(s));
  if (!c) return undefined;
  const src = c.back_imagesrc ?? c.imagesrc;
  return {
    name: c.name,
    cardCode: c.code,
    quest: c.back_quest ?? 0,
    story: c.back_text ?? "",
    questImage: art[src as keyof typeof art] ?? src,
  };
}
export function validateThreeTrialsState(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.threeTrials;
  if (q === undefined) return s.scenarioId !== "the-three-trials";
  if (
    !q ||
    (q.advancing !== undefined && typeof q.advancing !== "boolean") ||
    s.scenarioId !== "the-three-trials" ||
    typeof q.initialized !== "boolean" ||
    !THREE_TRIALS_QUESTS.some((c) => c.code === q.activeQuest) ||
    !Array.isArray(q.completed) ||
    q.completed.some((c) => !TRIAL_QUESTS.includes(c)) ||
    new Set(q.completed).size !== q.completed.length ||
    (q.currentKey !== undefined && !TRIAL_KEYS.includes(q.currentKey)) ||
    (!q.initialized && (s.stage !== 1 || q.activeQuest !== TRIALS.begin)) ||
    (s.stage === 1 && q.activeQuest !== TRIALS.begin) ||
    (s.stage === 2 && !TRIAL_QUESTS.includes(q.activeQuest)) ||
    (s.stage === 3 && q.activeQuest !== TRIALS.crown) ||
    !Array.isArray(q.setAside) ||
    !Array.isArray(q.revealing)
  )
    return false;
  const hidden = [...q.setAside, ...q.revealing];
  return (
    hidden.every(
      (u) =>
        validUnit(u) &&
        TRIAL_SET_ASIDE.includes(u.code) &&
        (u.owner === undefined || u.owner < (s.table?.seats.length ?? 1)),
    ) && new Set(hidden.map((u) => u.code)).size === hidden.length
  );
}
