import assert from "node:assert/strict";
import {
  createGame,
  applyAction,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { STARTERS } from "../src/game/cards.ts";
import {
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import type { GameState, ScenarioId } from "../src/game/types.ts";
export function base(id: ScenarioId, players = 1) {
  const d = STARTERS[0];
  let s = createGame(91, d.cards, d.heroes, d.id, {
    scenarioId: id,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let i = 0; i < 50 && s.phase === "setup"; i++)
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
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
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
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
          attachments: [],
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  if (s.bloodGondor)
    s.bloodGondor = { hidden: {}, turning: [], captured: [], conflict: false };
  return s;
}
export function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(s, { type: "CHOOSE", id });
}
export function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json), "save validates");
  const result = restoreSave(json);
  assert.ok(result);
  return result!;
}
