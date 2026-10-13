import assert from "node:assert/strict";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { COBAS, COBAS_MAIN_QUESTS } from "../src/game/cobas-support";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };

export function settle(s: GameState) {
  for (
    let n = 0;
    (s.choice || s.flow?.pending) && s.status === "playing";
    n++
  ) {
    assert.ok(n < 200, "Cobas Haven decisions terminate");
    s = s.flow?.pending
      ? applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id })
      : choose(
          reload(s),
          s.choice!.options.find((o) => o.id === "skip")?.id ??
            s.choice!.options[0].id,
        );
  }
  return s;
}

export function start(players = 1, easy = false, seed = 41) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "a-storm-on-cobas-haven",
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
    assert.ok(n < 200, "opening decisions terminate");
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

/** A legal opening, with stable public fleet and clear test decision windows. */
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
    encounterDeck: Array(30).fill("01099"),
    encounterDiscard: [],
  });
  s.sailing = { heading: 0 };
  s.cobas!.advancing = false;
  s.cobas!.belfalas = [];
  s.cobas!.capturePending = [];
  s.cobas!.pendingGuarded = [];
  s.cobas!.corsairDiscard = [];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      for (const h of [...s.heroes, ...s.allies])
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
  const quests = COBAS_MAIN_QUESTS;
  s.cobas!.completedQuests = quests.slice(0, stage - 1);
  s.cobas!.currentQuest = quests[stage - 1];
  s.cobas!.questDeck = quests.slice(stage);
  s.cobas!.advancing = false;
  s.stage = stage;
  s.stageRevealing = false;
  s.progress = 0;
  return s;
}
