import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { forOwner, playerOrder, selectSeat, syncSeat } from "../src/game/table";
import {
  HD,
  HD_CORSAIR_DECK,
  HD_DAMAGED,
  HD_MODES,
  HD_SHIPS,
  hdBack,
  hdSection,
} from "../src/game/hunt-dreadnaught-support";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export type Mode = "easy" | "standard" | "hard";
export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "The Hunt for the Dreadnaught save validates");
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
/** Resolve the pending decisions, taking a preferred option when offered. */
export function settle(s: GameState, preferred: string[] = []) {
  for (
    let n = 0;
    s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "The Hunt for the Dreadnaught decisions terminate");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id:
              s.choice!.options.find((o) => preferred.includes(o.id))?.id ??
              s.choice!.options.find((o) =>
                ["skip", "resolve", "undefended", "keep", "allow"].includes(
                  o.id,
                ),
              )?.id ??
              s.choice!.options[0].id,
          },
    );
  }
  return s;
}
/**
 * A native game after the opening hands. The fleet takes the listed ships in
 * seat order (by default the first free ship), Standard or Hard Mode is
 * chosen at setup, and the other decisions take their first option.
 */
export function start(
  players = 1,
  mode: Mode = "standard",
  ships: string[] = [],
  seed = 919,
  picks: string[] = [],
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-hunt-for-the-dreadnaught",
    easy: mode === "easy",
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  const queue = [...ships, mode, ...picks];
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "The Hunt for the Dreadnaught setup terminates");
    const next = queue.findIndex((id) =>
      s.choice?.options.some((o) => o.id === id),
    );
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id:
                (next >= 0 ? queue.splice(next, 1)[0] : undefined) ??
                (
                  s.choice.options.find((o) => o.id === "skip") ??
                  s.choice.options[0]
                ).id,
            }
          : { type: "KEEP" },
    );
  }
  return s;
}
/**
 * A settled planning-phase table at 1B (Searching the High Seas, no
 * progress): each player controls one ship (the listed ones, by default
 * Swan Ship of Dol Amroth, Pride of Lebennin, Golden Wing and Eithiliant in
 * seat order), Standard Mode (or the given mode) is next to the quest deck,
 * the Corsair deck holds its 13 cards in recipe order, and nothing is in
 * play: the encounter deck holds 20 Cobas Havens (no When Revealed, no effect
 * in the staging area) and the discard pile is empty. Each player has threat
 * 20 and heroes with 10 resources, and no other allies, cards in hand or
 * discard pile.
 */
export function base(
  players = 1,
  mode: Mode = "standard",
  ships = [HD.swan, HD.pride, HD.goldenWing, HD.eithiliant],
) {
  const s = start(players, mode);
  const q = s.huntDreadnaught!;
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
    encounterDeck: Array(20).fill(HD.cobas),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    questAttachments: {
      [HD.search]: [
        { id: "setup-card", code: hdBack(HD_MODES[mode]), exhausted: false },
      ],
    },
  });
  s.staging = [];
  const fleet = playerOrder(s).map((player, i) => ({
    player,
    code: ships[i],
  }));
  Object.assign(q, {
    mode,
    currentQuest: HD.search,
    fleet,
    fleetReady: true,
    corsairDeck: [...HD_CORSAIR_DECK],
    corsairDiscard: [],
    setAside: hdSection("sharedSetAside").filter(
      (c) =>
        !Object.values(HD_MODES).includes(c) &&
        !fleet.some((f) => f.code === c),
    ),
    removed: Object.values(HD_MODES).filter((c) => c !== HD_MODES[mode]),
    questProgress: null,
    dreadDamage: null,
    questActionUsed: false,
    boarding: [],
    ballista: null,
    overworked: null,
    ramming: [],
    cove: [],
    hydraken: null,
    ophidian: [],
    threatReduced: [],
    cancelled: [],
    extraShadows: [],
    ranged: [],
    traits: [],
    eliminated: [],
    resolving: [],
    capture: [],
  });
  if (s.flow) s.flow.pending = null;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      const ship = make(s, fleet[p].code);
      ship.owner = p;
      ship.controller = p;
      s.allies = [ship];
      s.engaged = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      s.used = [];
      s.mulled = true;
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
/** A player's ship (the first ship-objective they control). */
export function shipOf(s: GameState, p = 0): Unit {
  let ship: Unit | undefined;
  forOwner(s, p, () => {
    ship = s.allies.find(
      (u) =>
        HD_SHIPS.includes(u.code.replace(/:B$/, "")) ||
        u.code === HD.warship ||
        !!u.cobasShipObjective,
    );
  });
  assert.ok(ship, `player ${p} controls a ship`);
  return ship!;
}
/** Destroy the Dreadnaught (2B): the Dreadnaught is in the staging area. */
export function stageTwo(s: GameState, damaged = false, damage = 0) {
  const q = s.huntDreadnaught!;
  q.currentQuest = HD.destroy;
  s.stage = 2;
  s.progress = 0;
  s.questAttachments = {
    [HD.destroy]: s.questAttachments?.[HD.search] ?? [],
    [HD.search]: [],
  };
  q.setAside = q.setAside.filter((c) => c !== HD.dreadnaught);
  const u = make(s, damaged ? HD_DAMAGED : HD.dreadnaught);
  u.damage = damage;
  s.staging.push(u);
  return u;
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
    u.owner = p;
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
/** Make a location the active location. */
export function activate(s: GameState, code: string) {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
}
/** Heroes of a player. */
export function heroesOf(s: GameState, p = 0): Unit[] {
  let heroes: Unit[] = [];
  forOwner(s, p, () => {
    heroes = s.heroes;
  });
  return heroes;
}
