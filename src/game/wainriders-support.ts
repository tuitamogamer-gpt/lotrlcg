import encounters from "../data/wainriders-encounter-cards.json";
import quests from "../data/wainriders-quest-cards.json";
import recipes from "../data/wainriders-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const WAINRIDERS_ENCOUNTERS = encounters as Card[];
export const WAINRIDERS_QUESTS = quests as Card[];
export const WAINRIDERS_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const WAINRIDERS = {
  champion: code("Wainrider Champion"),
  challengers: code("The Challengers"),
  wainriders: code("The Wainriders"),
  racer: code("Aggressive Racer"),
  driver: code("Chariot Driver"),
  veteran: code("Veteran Wainrider"),
  narrow: code("Narrow Pass"),
  crowded: code("Crowded Track"),
  ravine: code("Ravine Ledge"),
  chariot: code("Wainrider Chariot"),
  cunning: code("The Champion's Cunning"),
  captain: code("Easterling Captain"),
  rider: code("Rider of Rhûn"),
  horse: code("Easterling Horse"),
  plains: code("Rolling Plains"),
  outcrop: code("Rocky Outcrop"),
  weary: code("Weary Lands"),
  fatigue: code("Painful Fatigue"),
  arduous: code("An Arduous Journey"),
};
export const wainridersPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["attack", "defense"].includes(s.phase)
      ? "combat"
      : s.phase;
export const wainridersGoal = (s: GameState) =>
  4 * (s.table?.seats.filter((p) => !p.eliminated).length ?? 1);
export const wainridersAhead = (s: GameState) =>
  !!s.wainriders && s.wainriders.challengerSteps > s.wainriders.wainriderSteps;
export const racingResult = (code: string) =>
  encounters.find((c) => c.code === code)?.racing_result;
export function wainridersStageInfo(s: GameState) {
  const c = WAINRIDERS_QUESTS[s.stage - 1];
  return c && s.wainriders
    ? {
        name: c.name,
        cardCode: c.code,
        quest: wainridersGoal(s),
        story: c.back_text!,
        questImage: c.back_imagesrc,
        side: "B" as const,
      }
    : undefined;
}
export const wainridersPublicState = (s: GameState) =>
  s.wainriders
    ? {
        challengerSteps: s.wainriders.challengerSteps,
        wainriderSteps: s.wainriders.wainriderSteps,
        damage: s.wainriders.damage,
        progress: s.wainriders.progress.map((n, i) =>
          i === s.stage - 1 ? s.progress : n,
        ),
        completed:
          s.wainriders.completedRound === s.round ? s.wainriders.completed : 0,
        test: s.wainriders.test,
        lastTest: s.wainriders.lastTest,
      }
    : undefined;
export function validateWainriders(
  s: GameState,
  validUnit: (v: unknown) => boolean,
  validCode: (code: string) => boolean,
) {
  const q = s.wainriders;
  if (q === undefined) return s.scenarioId !== "challenge-of-the-wainriders";
  const n = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  return (
    !!q &&
    s.scenarioId === "challenge-of-the-wainriders" &&
    [1, 2, 3, 4, 5, 6].includes(s.stage) &&
    q.currentQuest === WAINRIDERS_QUESTS[s.stage - 1].code &&
    typeof q.initialized === "boolean" &&
    n(q.challengerSteps) &&
    q.challengerSteps <= 12 &&
    n(q.wainriderSteps) &&
    q.wainriderSteps <= 12 &&
    s.stage === (q.challengerSteps % 6) + 1 &&
    n(q.damage) &&
    n(q.completedRound) &&
    q.completedRound <= s.round &&
    n(q.completed) &&
    Array.isArray(q.progress) &&
    q.progress.length === 6 &&
    q.progress.every(n) &&
    Array.isArray(q.defeated) &&
    q.defeated.every((i) => n(i) && i < 6) &&
    new Set(q.defeated).size === q.defeated.length &&
    Array.isArray(q.setupChosen) &&
    q.setupChosen.every((c) =>
      encounters.some((x) => x.code === c && x.type_code === "location"),
    ) &&
    new Set(q.setupChosen).size === q.setupChosen.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(validUnit) &&
    Array.isArray(q.enteredEnemies) &&
    q.enteredEnemies.every((id) => typeof id === "string") &&
    Array.isArray(q.phaseEffects) &&
    q.phaseEffects.every(
      (x) =>
        !!x &&
        n(x.round) &&
        x.round <= s.round &&
        typeof x.phase === "string" &&
        n(x.plains) &&
        n(x.weary),
    ) &&
    (q.cunning === undefined || n(q.cunning)) &&
    (q.test === undefined ||
      (!!q.test &&
        [1, 2, 3, 4, 5, 6].includes(q.test.stage) &&
        ["will", "attack", "defense"].includes(q.test.stat) &&
        ["straight", "turn"].includes(q.test.result) &&
        n(q.test.required) &&
        q.test.required > 0 &&
        n(q.test.excess) &&
        typeof q.test.travel === "boolean")) &&
    (q.lastTest === undefined ||
      (!!q.lastTest &&
        Array.isArray(q.lastTest.cards) &&
        q.lastTest.cards.every((c) => typeof c === "string" && validCode(c)) &&
        n(q.lastTest.matches) &&
        n(q.lastTest.required) &&
        typeof q.lastTest.passed === "boolean"))
  );
}

/** Race cards stay in play on both laps; these views retain their physical attachments. */
export function wainridersQuestUnits(s: GameState): Unit[] {
  if (!s.wainriders) return [];
  return WAINRIDERS_QUESTS.map((c, i) => ({
    id: `quest:${c.code}`,
    code: c.code,
    exhausted: false,
    damage: s.wainriders!.wainriderSteps % 6 === i ? s.wainriders!.damage : 0,
    progress: s.stage === i + 1 ? s.progress : s.wainriders!.progress[i],
    resources: 0,
    committed: false,
    boost: 0,
    attacked: false,
    shadows: [],
    attachments: s.questAttachments?.[c.code] ?? [],
  }));
}
