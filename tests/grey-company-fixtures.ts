import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import { GC, GREY_COMPANY_QUESTS } from "../src/game/grey-company-support";
import { fellowshipAragorn } from "../src/game/lotr-saga";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(
    validateSave(raw),
    "The Passing of the Grey Company save validates",
  );
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
    assert.ok(n < 500, "The Passing of the Grey Company decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => o.id === preferred)?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "undefended", "keep"].includes(o.id),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
/** A new game up to the first decision after the opening hands are kept. */
export function created(
  players = 1,
  easy = false,
  seed = 919,
  hotseat = players > 1,
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-passing-of-the-grey-company",
    easy,
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
    s.status === "playing" && s.phase === "setup" && !s.choice;
    n++
  ) {
    assert.ok(n < 50, "setup terminates");
    s = applyAction(reload(s), { type: "KEEP" });
  }
  return s;
}
export function start(players = 1, easy = false, seed = 919) {
  let s = created(players, easy, seed);
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "The Passing of the Grey Company setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id: (
                s.choice.options.find((o) => o.id === "skip") ??
                s.choice.options[0]
              ).id,
            }
          : { type: "KEEP" },
    );
  }
  return s;
}
const QUEST: Record<number, string> = Object.fromEntries(
  GREY_COMPANY_QUESTS.map((q) => [Number(q.cost), q.code]),
);
/** A filler card for players' hands: Guard of the Citadel. */
export const FILLER = "01013";
/**
 * A settled planning-phase table at the given stage. Each player has
 * Overcome by Fear on his threat dial, threat 20, heroes with 10 resources
 * (Aragorn has 2), no card in hand and no ally; there is no active location,
 * no card in the staging area, an empty victory display and an encounter
 * deck of Deadly Road. The Stone of Erech and Army of the Dead are set aside.
 */
export function base(players = 1, stage = 1) {
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
    stage,
    stageRevealing: false,
    staging: [],
    encounterDeck: Array(20).fill(GC.deadly),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    removedEncounter: [],
    questAttachments: {},
  });
  Object.assign(s.greyCompany!, {
    currentQuest: QUEST[stage],
    advancing: false,
    resolving: [],
    setAside: [GC.stone, GC.army, GC.rules],
    fearAside: 0,
    fearRemoved: 4 - playerOrder(s).length,
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
      s.threatAttachments = [
        { id: make(s, GC.fear).id, code: GC.fear, exhausted: false },
      ];
      for (const h of s.heroes)
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  const aragorn = fellowshipAragorn(s)!;
  aragorn.resources = 2;
  selectSeat(s, playerOrder(s)[0]);
  syncSeat(s);
  return s;
}
/** Detach a player's Overcome by Fear and set it aside. */
export function fearAside(s: GameState, p = 0) {
  forOwner(s, p, () => {
    delete s.threatAttachments;
  });
  s.greyCompany!.fearAside++;
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
/** Make a location the active location. */
export function activate(s: GameState, code: string) {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
}
