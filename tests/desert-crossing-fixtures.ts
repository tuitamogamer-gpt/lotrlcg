import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  DESERT_CROSSING as D,
  DESERT_CROSSING_MAIN_QUESTS,
} from "../src/game/desert-crossing-support";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    (s.choice || s.flow?.pending) && s.status === "playing";
    n++
  ) {
    assert.ok(n < 400, "Desert choices terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === preferred)?.id ??
            s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}
export function start(players = 1, easy = false, seed = 55) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "desert-crossing",
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
  for (let n = 0; s.phase === "setup" || s.choice || s.flow?.pending; n++) {
    assert.ok(n < 300, "Desert setup terminates");
    if (s.status !== "playing") break;
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
export function base(players = 1) {
  const s = start(players);
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
    encounterDeck: Array(30).fill(D.sands),
    encounterDiscard: [],
  });
  if (s.flow) s.flow.pending = null;
  s.desertCrossing!.advancing = false;
  s.desertCrossing!.poisoned = [];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.allies = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  syncSeat(s);
  return s;
}
export function setStage(s: GameState, stage: number) {
  s.stage = stage;
  s.progress = 0;
  s.stageRevealing = false;
  Object.assign(s.desertCrossing!, {
    advancing: false,
    currentQuest: DESERT_CROSSING_MAIN_QUESTS[stage - 1],
    completedQuests: DESERT_CROSSING_MAIN_QUESTS.slice(0, stage - 1),
    questDeck: DESERT_CROSSING_MAIN_QUESTS.slice(stage),
  });
  return s;
}
