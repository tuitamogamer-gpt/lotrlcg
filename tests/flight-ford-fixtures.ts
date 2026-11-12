import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { FF } from "../src/game/flight-ford-support";
import { ONE_RING, ringBearer } from "../src/game/lotr-saga";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "Flight to the Ford save validates");
  const restored = restoreSave(raw);
  assert.ok(restored);
  return restored;
}
export function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(reload(s), { type: "CHOOSE", id });
}
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Flight to the Ford decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "undefended", "town", "keep"].includes(
                  o.id,
                ),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
export function start(
  players = 1,
  easy = false,
  seed = 919,
  guided = false,
  hotseat = players > 1,
  heroes?: string[],
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, heroes ?? d.heroes, d.id, {
    scenarioId: "flight-to-the-ford",
    easy,
    guided,
    ...(hotseat
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
    assert.ok(n < 500, "Flight to the Ford setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id: (
                s.choice.options.find((o) => o.id === "town") ??
                s.choice.options[0]
              ).id,
            }
          : { type: "KEEP" },
    );
  }
  return s;
}
/**
 * A settled planning-phase table at stage 1B (Pursued by the Enemy, no
 * progress) with no encounter card in play, no active location, an empty
 * victory display and an encounter deck of The Old Road (3 threat each).
 * Ford of Bruinen and The Witch-king are set aside, the burden deck holds the
 * five burdens in a fixed order and the Ring-bearer's life is 15. The first
 * player controls Frodo Baggins with The One Ring and An Evil Wound.
 */
export function base(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    stage: 1,
    stageRevealing: false,
    encounterDeck: Array(20).fill(FF.oldRoad),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
  });
  s.staging = [];
  Object.assign(s.flightFord!, {
    currentQuest: FF.pursued,
    advancing: false,
    life: 15,
    setAside: [FF.ford, FF.witchKing],
    burdens: [FF.weight, FF.fear, FF.eaten, FF.panicked, FF.overcome],
    resolving: [],
    extraReveals: 0,
    blank: null,
    painRound: null,
  });
  if (s.flow) s.flow.pending = null;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.allies = [];
      s.engaged = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      s.used = [];
      for (const h of s.heroes)
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: h.attachments.filter(
            (a) => a.code === ONE_RING || a.code === FF.wound,
          ),
        });
    });
  const bearer = ringBearer(s)!;
  bearer.attachments.forEach((a) => (a.exhausted = false));
  // Frodo's pool starts empty, so his cancel response is not offered.
  bearer.resources = 0;
  selectSeat(s, playerOrder(s)[0]);
  syncSeat(s);
  return s;
}
/** Put a fresh copy of an encounter card into the staging area. */
export function stage(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
/** Put a fresh enemy into play engaged with a player. */
export function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
}
/** Give a player the listed cards in hand (physical copies). */
export function hand(s: GameState, codes: string[], p = 0): Unit[] {
  const out: Unit[] = [];
  forOwner(s, p, () => {
    for (const code of codes) {
      const u = make(s, code);
      u.owner = p;
      s.hand.push(u);
      out.push(u);
    }
  });
  return out;
}
/** Give a player the listed allies in play. */
export function allies(s: GameState, codes: string[], p = 0): Unit[] {
  const out: Unit[] = [];
  forOwner(s, p, () => {
    for (const code of codes) {
      const u = make(s, code);
      u.owner = p;
      s.allies.push(u);
      out.push(u);
    }
  });
  return out;
}
/** Replace a player's deck with the listed cards, top first. */
export function deck(s: GameState, codes: string[], p = 0) {
  forOwner(s, p, () => {
    s.deck = [...codes];
  });
}
