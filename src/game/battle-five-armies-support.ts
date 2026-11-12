// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/battle-five-armies-encounter-cards.json";
import quests from "../data/battle-five-armies-quest-cards.json";
import recipes from "../data/battle-five-armies-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { FAS } from "./flies-spiders-support";
export type { BattleFiveArmiesState } from "./battle-five-armies-types";

export const BOFA_ENCOUNTERS = encounters as Card[];
export const BOFA_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const BOFA_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const BOFA = {
  gathering: code("The Gathering of the Clouds"),
  spur: code("The Eastern Spur"),
  dale: code("Battle in the Dale"),
  ravenhill: code("The Defense of Ravenhill"),
  clouds: code("The Clouds Burst"),
  bolg: code("Bolg"),
  bodyguard: code("Bodyguard of Bolg"),
  vanguard: code("Vanguard of Bolg"),
  climber: code("Gundabad Climber"),
  rider: code("Gundabad Wolf Rider"),
  archer: code("Gundabad Archer"),
  warg: code("Ravenous Warg"),
  eagle: code("Misty Mountain Eagle"),
  heedless: code("Heedless of Order"),
  hatred: code("Hatred Rekindled"),
  goblins: code("Goblins are Upon You!"),
  slopes: code("Northern Slopes"),
  gate: code("The Front Gate"),
  ruins: code("Ruins of Dale"),
  ravenhillLocation: code("Ravenhill"),
  // Wilderland, shared with Flies and Spiders and The Lonely Mountain.
  bats: FAS.bats,
  path: FAS.path,
  weighed: FAS.weighed,
  friends: FAS.friends,
} as const;
const B = BOFA;
export const BOFA_SCENARIO = "the-battle-of-five-armies";
export const isBattleFiveArmies = (s: GameState) =>
  (s.scenarioId as string) === BOFA_SCENARIO;
/** Stages 2B, 3B and 4B are in play at the same time. */
export const BOFA_STAGES: readonly string[] = [B.spur, B.dale, B.ravenhill];
/** Each Ruins location removes progress from one of the three stages. */
export const BOFA_RUINS: Readonly<Record<string, string>> = {
  [B.gate]: B.spur,
  [B.ruins]: B.dale,
  [B.ravenhillLocation]: B.ravenhill,
};
export const STAGE_GOAL = 8;

export const bofaStageNumber = (questCode: string | undefined) =>
  BOFA_QUESTS.findIndex((q) => q.code === questCode) + 1;
/** Progress on a quest stage in play (the current quest uses the shared counter). */
export function bofaStageProgress(s: GameState, questCode: string) {
  const q = s.battleFiveArmies;
  if (!q) return 0;
  if (questCode === q.currentQuest) return s.progress;
  return BOFA_STAGES.includes(q.currentQuest)
    ? (q.stageProgress[questCode] ?? 0)
    : 0;
}
/** The quest stages in play. */
export function bofaStagesInPlay(s: GameState): string[] {
  const q = s.battleFiveArmies;
  if (!q) return [];
  return BOFA_STAGES.includes(q.currentQuest)
    ? [...BOFA_STAGES]
    : [q.currentQuest];
}
/** "Each quest stage in play with no progress on it." */
export const bofaEmptyStages = (s: GameState) =>
  bofaStagesInPlay(s).filter((c) => bofaStageProgress(s, c) <= 0).length;
export const bofaComplete = (s: GameState, questCode: string) =>
  bofaStageProgress(s, questCode) >= STAGE_GOAL;
export function bofaStageInfo(s: GameState) {
  const state = s.battleFiveArmies;
  const q = BOFA_QUESTS.find((c) => c.code === state?.currentQuest);
  if (!q || !state) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const bofaUnits = (s: GameState): Unit[] => [
  ...(s.battleFiveArmies?.resolving ?? []),
];
export function bofaPublicState(s: GameState) {
  const q = s.battleFiveArmies;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    stage: bofaStageNumber(q.currentQuest),
    stages: bofaStagesInPlay(s).map((c) => ({
      code: c,
      progress: bofaStageProgress(s, c),
      current: c === q.currentQuest,
      complete: BOFA_STAGES.includes(c) && bofaComplete(s, c),
    })),
    emptyStages: bofaEmptyStages(s),
    chosen: q.chosenRound === s.round,
    weighedDown: q.weighedDown.includes(s.round),
    bolgDestroyed: q.bolgDestroyed,
  };
}
export function validateBattleFiveArmies(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.battleFiveArmies;
  if (q === undefined) return s.scenarioId !== BOFA_SCENARIO;
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const stage = bofaStageNumber(q?.currentQuest);
  return (
    !!q &&
    s.scenarioId === BOFA_SCENARIO &&
    stage >= 1 &&
    s.stage === stage &&
    !!q.stageProgress &&
    typeof q.stageProgress === "object" &&
    Object.entries(q.stageProgress).every(
      ([k, v]) => BOFA_STAGES.includes(k) && n(v),
    ) &&
    n(q.chosenRound) &&
    q.chosenRound <= s.round &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.weighedDown) &&
    q.weighedDown.every((r) => n(r) && r <= s.round) &&
    n(q.goblinRound) &&
    n(q.goblinReveals) &&
    typeof q.bolgDestroyed === "boolean"
  );
}
