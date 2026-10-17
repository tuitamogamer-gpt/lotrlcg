import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { FIRE_NIGHT as F } from "../src/game/fire-night-support";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import type { GameState } from "../src/game/types";
export function reload(s: GameState) {
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "Fire save validates");
  const r = restoreSave(raw);
  assert.ok(r);
  return r;
}
export function settle(s: GameState, preferred?: string) {
  for (
    let i = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 500, "Fire decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "hill", "undefended", "threat"].includes(
                  o.id,
                ),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
export function start(players = 1, easy = false, seed = 862) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "fire-in-the-night",
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
    let i = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    i++
  ) {
    assert.ok(i < 500, "Fire setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id:
                s.choice.options.find((o) =>
                  ["resolve", "hill", "threat"].includes(o.id),
                )?.id ?? s.choice.options[0].id,
            }
          : { type: "KEEP" },
    );
  }
  return s;
}
export function base(players = 1, easy = false) {
  const s = start(players, easy),
    d = s.staging.find((u) => u.code === F.dagnir)!;
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [d],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill(F.palisade),
    encounterDiscard: [],
    stageRevealing: false,
  });
  if (s.flow) s.flow.pending = null;
  Object.assign(s.fireNight!, {
    hillDamage: 0,
    resolving: [],
    nonQuestDamage: { round: 0, amount: 0 },
    locationProgress: [],
  });
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
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
export function revealSide(s: GameState, code: string) {
  const i = s.fireNight!.sideDeck.findIndex((u) => u.code === code);
  assert.ok(i >= 0);
  const q = s.fireNight!.sideDeck.splice(i, 1)[0];
  s.staging.push(q);
  return q;
}
export function defeatCount(s: GameState, count: number) {
  const done = s.fireNight!.sideDeck.splice(0, count);
  (s.victoryCards ??= []).push(...done.map((u) => u.code));
  return done;
}
export function enemy(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
