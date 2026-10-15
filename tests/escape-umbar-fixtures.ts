import assert from "node:assert/strict";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { UMBAR as C } from "../src/game/escape-umbar-support";
import type { GameState } from "../src/game/types";
import { reload } from "./against-shadow-final-fixtures";
export { reload };
export function settle(s: GameState) {
  for (
    let n = 0;
    (s.choice || s.flow?.pending || s.queue.length) && s.status === "playing";
    n++
  ) {
    assert.ok(n < 500, "Umbar choices terminate");
    if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.choice)
      s = applyAction(reload(s), {
        type: "CHOOSE",
        id:
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options.find((o) => o.id === "progress")?.id ??
          s.choice.options[0].id,
      });
    else break;
  }
  return s;
}
export function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(reload(s), { type: "CHOOSE", id });
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(55, d.cards, d.heroes, d.id, {
    scenarioId: "escape-from-umbar",
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
  for (let i = 0; s.phase === "setup" || s.choice || s.flow?.pending; i++) {
    assert.ok(i < 400, "Umbar setup terminates");
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
    encounterDeck: Array(30).fill(C.alley),
    encounterDiscard: [],
  });
  if (s.flow) delete s.flow.pending;
  s.umbar!.advancing = false;
  s.umbar!.champions = [];
  s.umbar!.underAlley = [];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
      s.hand = [];
      s.used = [];
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
