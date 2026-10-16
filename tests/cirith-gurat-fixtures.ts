import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  CIRITH_GURAT as C,
  CIRITH_GURAT_MAIN_QUESTS,
} from "../src/game/cirith-gurat-support";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { make } from "../src/game/core";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
export { choose, reload };
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 400, "Cirith Gurat decisions terminate");
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
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(760, d.cards, d.heroes, d.id, {
    scenarioId: "the-dungeons-of-cirith-gurat",
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
    assert.ok(n < 500, "Cirith Gurat setup terminates");
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
  const s = start(players),
    captiveObjective = s.staging.find((u) => u.code === C.captives)!;
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [captiveObjective],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill(C.mines),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.cirithGurat!, {
    advancing: false,
    captives: [],
    guarding: {},
    abaanExhausted: false,
    abaanBonuses: [],
    shadowDefense: [],
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
  Object.assign(s.cirithGurat!, {
    currentQuest: CIRITH_GURAT_MAIN_QUESTS[stage - 1],
    completedQuests: CIRITH_GURAT_MAIN_QUESTS.slice(0, stage - 1),
    questDeck: CIRITH_GURAT_MAIN_QUESTS.slice(stage),
    advancing: false,
  });
}
export function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
export function ally(s: GameState, code = "01013", player = 0) {
  const u = make(s, code);
  u.owner = player;
  forOwner(s, player, () => {
    s.allies.push(u);
  });
  return u;
}
