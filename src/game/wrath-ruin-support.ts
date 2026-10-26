import encounters from "../data/wrath-ruin-encounter-cards.json";
import quests from "../data/wrath-ruin-quest-cards.json";
import recipes from "../data/wrath-ruin-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { WrathRuinState } from "./wrath-ruin-types";
export const WRATH_RUIN_ENCOUNTERS = encounters as Card[];
export const WRATH_RUIN_QUESTS = [...quests].sort(
  (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
) as Card[];
export const WRATH_RUIN_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  )!.code;
export const WRATH_RUIN = {
  first: code("Inside the Walls"),
  second: code("Drive them Out"),
  ulchor: code("Thane Ulchor"),
  gate: code("Gate of Dorwinion"),
  champion: code("Champion of Rhûn"),
  skirmisher: code("Easterling Skirmisher"),
  square: code("Contested Square"),
  house: code("Ransacked House"),
  tower: code("Captured Tower"),
  fortification: code("Makeshift Fortification"),
  fury: code("Fury"),
  caught: code("Caught Off Guard"),
  fighting: code("Street Fighting"),
  siege: code("Under Siege"),
  revenge: code("Ulchor's Revenge"),
  raider: code("Easterling Raider"),
  warrior: code("Warrior of Rhûn"),
  sword: code("Sword of Rhûn"),
  bow: code("Recurve Bow"),
  backstabber: code("Rhûn Backstabber"),
  easterling: code("Treacherous Easterling"),
  forum: code("City Forum"),
  tavern: code("Seedy Tavern"),
  darkness: code("Darkness in the East"),
};
export const wrathRuinPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
export const wrathRuinPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
export const wrathRuinControlled = (s: GameState, player?: number) =>
  (s.wrathRuin?.controlled ?? []).filter(
    (u) => player === undefined || (u.owner ?? 0) === player,
  );
export const wrathRuinStaged = (s: GameState) =>
  s.staging.filter(
    (u) =>
      WRATH_RUIN_ENCOUNTERS.find((c) => c.code === u.code)?.type_code ===
      "location",
  );
export function wrathRuinStageInfo(s: GameState) {
  const q = WRATH_RUIN_QUESTS.find((c) => c.code === s.wrathRuin?.currentQuest);
  if (!q) return undefined;
  const front = !!s.stageRevealing;
  return {
    name: front ? q.name : (q.back_name ?? q.name),
    cardCode: q.code,
    quest: front
      ? 0
      : (q.back_quest ?? 0) + (s.stage === 1 ? 4 * wrathRuinPlayers(s) : 0),
    story: front ? (q.text ?? "") : (q.back_text ?? ""),
    questImage: front ? q.imagesrc : (q.back_imagesrc ?? q.imagesrc),
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const wrathRuinUnits = (s: GameState): Unit[] => [
  ...(s.wrathRuin?.controlled ?? []),
  ...(s.wrathRuin?.pendingExplored ?? []),
  ...(s.wrathRuin?.resolving ?? []),
  ...(s.wrathRuin?.looked ?? []),
  ...(s.wrathRuin?.storedCards.flatMap((g) => g.cards) ?? []),
];
export function wrathRuinPublicState(s: GameState) {
  const q = s.wrathRuin;
  if (!q) return undefined;
  return {
    initialized: q.initialized,
    currentQuest: q.currentQuest,
    controlled: q.controlled.map((u) => ({
      id: u.id,
      code: u.code,
      player: u.owner ?? 0,
      progress: u.progress,
      resources: u.resources,
      attachments: u.attachments.map((a) => ({ id: a.id, code: a.code })),
    })),
    controlledCount: q.controlled.length,
    stagedCount: wrathRuinStaged(s).length,
    gateControlled: q.controlled.some((u) => u.code === WRATH_RUIN.gate),
    pendingExplored: q.pendingExplored.map((u) => ({ id: u.id, code: u.code })),
    looked: q.looked.length,
    resolving: q.resolving.length,
    storedCards: q.storedCards.map((g) => ({
      locationId: g.locationId,
      count: g.cards.length,
    })),
    stageProgressGoal: wrathRuinStageInfo(s)!.quest,
    endRoundOnly: true,
  };
}
export function validateWrathRuin(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.wrathRuin;
  if (q === undefined) return s.scenarioId !== "wrath-and-ruin";
  const n = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const seat = (v: unknown) => n(v) && Number(v) < (s.table?.seats.length ?? 1);
  const location = (u: Unit) =>
    validUnit(u) &&
    WRATH_RUIN_ENCOUNTERS.some(
      (c) => c.code === u.code && c.type_code === "location",
    );
  return (
    !!q &&
    s.scenarioId === "wrath-and-ruin" &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === WRATH_RUIN_QUESTS[s.stage - 1]?.code &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.controlled) &&
    q.controlled.every((u) => location(u) && seat(u.owner ?? 0)) &&
    Array.isArray(q.pendingExplored) &&
    q.pendingExplored.every(location) &&
    [q.resolving, q.looked].every(
      (a) => Array.isArray(a) && a.every(validUnit),
    ) &&
    Array.isArray(q.storedCards) &&
    q.storedCards.every(
      (g) =>
        !!g &&
        typeof g.locationId === "string" &&
        Array.isArray(g.cards) &&
        g.cards.every(validUnit),
    ) &&
    new Set(q.storedCards.map((g) => g.locationId)).size ===
      q.storedCards.length &&
    Array.isArray(q.setupChosen) &&
    q.setupChosen.every((c) =>
      WRATH_RUIN_ENCOUNTERS.some(
        (v) => v.code === c && v.type_code === "location",
      ),
    ) &&
    new Set(q.setupChosen).size === q.setupChosen.length &&
    Array.isArray(q.enteredEnemies) &&
    q.enteredEnemies.every((id) => typeof id === "string") &&
    new Set(q.enteredEnemies).size === q.enteredEnemies.length &&
    !!q.threatRaised &&
    typeof q.threatRaised === "object" &&
    !Array.isArray(q.threatRaised) &&
    Object.entries(q.threatRaised).every(
      ([p, r]) => seat(Number(p)) && n(r) && r <= s.round,
    ) &&
    Array.isArray(q.phaseThreat) &&
    q.phaseThreat.every(
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
        n(m.value),
    )
  );
}
