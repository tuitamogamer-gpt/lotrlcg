import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { TLM as T } from "../src/game/lonely-mountain-support";
import { EREBOR_TREASURES } from "../src/game/hobbit-codes";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "The Lonely Mountain save validates");
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
    assert.ok(n < 500, "The Lonely Mountain decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "stay", "undefended"].includes(o.id),
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
  seed = 917,
  guided = false,
  hotseat = players > 1,
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-lonely-mountain",
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
    assert.ok(n < 500, "The Lonely Mountain setup terminates");
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
/**
 * A settled planning-phase table at stage 2B with Smaug the Golden and The
 * Lonely Mountain (its five treasures beneath) as the only encounter cards in
 * play.
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
    stage: 2,
    stageRevealing: false,
    encounterDeck: Array(20).fill(T.path),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
  });
  s.staging = s.staging.filter((u) => [T.golden, T.mountain].includes(u.code));
  for (const u of s.staging) Object.assign(u, { progress: 0, damage: 0 });
  const q = s.lonelyMountain!;
  Object.assign(q, {
    currentQuest: T.burglar,
    advancing: false,
    stack: [...EREBOR_TREASURES],
    resolving: [],
    treasures: [],
    burgle: null,
    weighedDown: [],
    treacheryRound: 0,
    treacheryReveals: 0,
    ounce: [],
    noTravelRound: null,
    entranceNamed: null,
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
          attachments: [],
        });
    });
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
/** Replace a player's deck with the listed cards, top first. */
export function deck(s: GameState, codes: string[], p = 0) {
  forOwner(s, p, () => {
    s.deck = [...codes];
  });
}
