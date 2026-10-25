import encounters from "../data/river-running-encounter-cards.json";
import quests from "../data/river-running-quest-cards.json";
import recipes from "../data/river-running-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { RiverRunningState } from "./river-running-types";
export const RIVER_RUNNING_ENCOUNTERS = encounters as Card[];
export const RIVER_RUNNING_QUESTS = [...quests].sort(
  (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
) as Card[];
export const RIVER_RUNNING_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const RIVER_RUNNING = {
  first: code("Chased by Easterlings"),
  second: code("The Crossing of Araw"),
  pursuit: code("Easterling Pursuit"),
  river: code("River Running"),
  outrider: code("Easterling Outrider"),
  riverbank: code("Exposed Riverbank"),
  close: code("Enemies Close Behind"),
  captain: code("Easterling Captain"),
  rider: code("Rider of Rhûn"),
  horse: code("Easterling Horse"),
  raider: code("Easterling Raider"),
  warrior: code("Warrior of Rhûn"),
  sword: code("Sword of Rhûn"),
  bow: code("Recurve Bow"),
  warriors: code("Warriors of the East"),
  plains: code("Rolling Plains"),
  outcrop: code("Rocky Outcrop"),
  weary: code("Weary Lands"),
  fatigue: code("Painful Fatigue"),
  arduous: code("An Arduous Journey"),
};
export const riverRunningPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
export const riverRunningPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
export function riverRunningStageInfo(s: GameState) {
  const q = RIVER_RUNNING_QUESTS.find(
    (c) => c.code === s.riverRunning?.currentQuest,
  );
  if (!q) return undefined;
  return {
    name: q.back_name ?? q.name,
    cardCode: q.code,
    quest:
      (q.back_quest ?? 0) + (s.stage === 1 ? 5 * riverRunningPlayers(s) : 0),
    story: q.back_text ?? "",
    questImage: q.back_imagesrc ?? q.imagesrc,
  };
}
export const riverRunningUnits = (s: GameState): Unit[] => [
  ...(s.riverRunning?.setAside ?? []),
  ...(s.riverRunning?.resolving ?? []),
];
export function riverRunningPublicState(s: GameState) {
  const q = s.riverRunning;
  if (!q) return undefined;
  return {
    initialized: q.initialized,
    currentQuest: q.currentQuest,
    setAside: q.setAside.length,
    resolving: q.resolving.length,
    pursuit:
      s.staging.find((u) => u.code === RIVER_RUNNING.pursuit)?.resources ?? 0,
    progressPlaced: q.progressRound === s.round ? q.progressPlaced : 0,
    progressLimit:
      s.stage === 2 &&
      (s.engaged.length > 0 ||
        s.table?.seats.some(
          (p, i) =>
            i !== s.table!.active && !p.eliminated && p.engaged.length > 0,
        ))
        ? 5
        : null,
    refreshLimit: s.staging.some(
      (u) => u.code === RIVER_RUNNING.arduous && !u.blanked,
    )
      ? 6
      : null,
    optionalEngagementBlocked: s.staging.some(
      (u) => u.code === RIVER_RUNNING.river && !u.blanked,
    ),
    playerReadinessBlocked: s.staging.some(
      (u) => u.code === RIVER_RUNNING.outcrop && !u.blanked,
    ),
  };
}
export function validateRiverRunning(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.riverRunning;
  if (q === undefined) return s.scenarioId !== "the-river-running";
  const n = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  return (
    !!q &&
    s.scenarioId === "the-river-running" &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === RIVER_RUNNING_QUESTS[s.stage - 1]?.code &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every(
      (u) => validUnit(u) && u.code === RIVER_RUNNING.warriors,
    ) &&
    q.setAside.length <= 1 &&
    Array.isArray(q.resolving) &&
    q.resolving.every(validUnit) &&
    Array.isArray(q.setupChosen) &&
    q.setupChosen.every((c) =>
      [
        RIVER_RUNNING.outrider,
        RIVER_RUNNING.raider,
        RIVER_RUNNING.rider,
        RIVER_RUNNING.captain,
        RIVER_RUNNING.warrior,
      ].includes(c),
    ) &&
    new Set(q.setupChosen).size === q.setupChosen.length &&
    Array.isArray(q.enteredEnemies) &&
    q.enteredEnemies.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(q.enteredEnemies).size === q.enteredEnemies.length &&
    n(q.progressRound) &&
    q.progressRound <= s.round &&
    n(q.progressPlaced) &&
    Array.isArray(q.phaseEffects) &&
    q.phaseEffects.every(
      (m) =>
        !!m &&
        n(m.round) &&
        m.round <= s.round &&
        [
          "setup",
          "resource",
          "planning",
          "quest",
          "travel",
          "encounter",
          "combat",
          "refresh",
        ].includes(m.phase) &&
        n(m.plains) &&
        n(m.weary),
    )
  );
}
