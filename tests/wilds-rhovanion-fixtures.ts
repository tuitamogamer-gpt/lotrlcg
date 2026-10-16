import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import {
  WILDS_RHOVANION as W,
  WILDS_ANDUIN_QUESTS,
  WILDS_KINGS_QUESTS,
} from "../src/game/wilds-rhovanion-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState, ScenarioId } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState, prefer?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Wilds decisions terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === prefer)?.id ??
            s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function start(
  id: ScenarioId = "journey-up-the-anduin",
  players = 1,
  easy = false,
) {
  const d = STARTERS[0];
  let s = createGame(865, d.cards, d.heroes, d.id, {
    scenarioId: id,
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Wilds setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? { type: "CHOOSE", id: s.choice.options[0].id }
          : { type: "KEEP" },
    );
  }
  return s;
}
export function base(
  id: ScenarioId = "journey-up-the-anduin",
  players = 1,
  easy = false,
) {
  const s = start(id, players, easy);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(20).fill(W.contested),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.wildsRhovanion!, {
    advancing: false,
    noReady: [],
    storedCards: [],
    guardedHeroes: [],
    guardedPlayerCards: [],
    pendingGuarded: [],
    locationProgress: [],
    resolving: [],
    vastness: [],
    darkPlaces: [],
    noDamage: [],
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.allies = [];
      s.hand = [];
      s.discard = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
        });
    });
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  selectSeat(s, 0);
  syncSeat(s);
  return s;
}
export function setStage(s: GameState, stage: number) {
  s.stage = stage;
  s.progress = 0;
  s.stageRevealing = false;
  const chain =
    s.scenarioId === "the-kings-quest"
      ? WILDS_KINGS_QUESTS
      : WILDS_ANDUIN_QUESTS;
  Object.assign(s.wildsRhovanion!, {
    currentQuest: chain[stage - 1],
    questDeck: chain.slice(stage),
    completedQuests: chain.slice(0, stage - 1),
    advancing: false,
  });
}
