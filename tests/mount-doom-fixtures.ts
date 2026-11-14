import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  globalCharacters,
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { MD } from "../src/game/mount-doom-support";
import { MOUNTAIN_FIRE_FRODO } from "../src/game/lotr-saga-codes";
import { isOneRing } from "../src/game/lotr-saga-codes";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "Mount Doom save validates");
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
/**
 * Resolve the open decisions, preferring the given option; a Fortitude test
 * with no open decision is resolved.
 */
export function settle(s: GameState, preferred?: string) {
  for (
    let n = 0;
    s.status === "playing" &&
    (s.choice || s.flow?.pending || s.hideTest?.phase === "actions");
    n++
  ) {
    assert.ok(n < 500, "Mount Doom decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : !s.choice
          ? { type: "RESOLVE_HIDE" }
          : {
              type: "CHOOSE",
              id:
                s.choice!.options.find((o) => o.id === preferred)?.id ??
                s.choice!.options.find((o) =>
                  ["skip", "resolve", "undefended", "keep", "done"].includes(
                    o.id,
                  ),
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
    scenarioId: "mount-doom",
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
/** A game through its setup: Brake of Thorns' damage and the searches. */
export function start(players = 1, easy = false, seed = 919) {
  let s = created(players, easy, seed);
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Mount Doom setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              // Brake of Thorns' damage goes to the last character (an ally
              // or Frodo is never first): the first hero.
              id: s.choice.options[0].id,
            }
          : { type: "KEEP" },
    );
  }
  return s;
}
/** A filler card for players' hands: Guard of the Citadel. */
export const FILLER = "01013";
/** The Mountain of Fire's Frodo Baggins. */
export const frodo = (s: GameState) =>
  globalCharacters(s).find((u) => u.code === MOUNTAIN_FIRE_FRODO);
/** The One Ring attached to the Ring-bearer. */
export const ring = (s: GameState) =>
  globalCharacters(s)
    .flatMap((u) => u.attachments)
    .find((a) => isOneRing(a.code));
/** Mount Doom wherever it is. */
export const doom = (s: GameState) =>
  [s.activeLocation, ...s.staging].find((u) => u?.code === MD.doom);
/**
 * A settled planning-phase table at the given stage. Each player has threat
 * 20, heroes with 10 resources and no damage, no card in hand and no ally;
 * the staging area holds Mount Doom and The Tower of Barad-dûr, there is no
 * active location, an empty victory display and an encounter deck of Plain of
 * Gorgoroth (no Sauron's Eye icon).
 */
export function base(players = 1, stage = 1) {
  const s = start(players);
  const quest = [MD.land, MD.road, MD.gasp, MD.crack][stage - 1];
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
    encounterDeck: Array(20).fill(MD.plain),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    removedEncounter: [],
    questAttachments: {},
  });
  s.staging.push(make(s, MD.doom), make(s, MD.tower));
  s.mountDoom = {
    currentQuest: quest,
    advancing: false,
    resolving: [],
    ready: true,
    ...(stage === 2 ? { resources: 0 } : {}),
  };
  delete s.hideTest;
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
          attachments: h.attachments.filter((a) => isOneRing(a.code)),
        });
    });
  for (const a of globalCharacters(s).flatMap((u) => u.attachments))
    a.exhausted = false;
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
