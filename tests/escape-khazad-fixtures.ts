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
  EK,
  EK_SETS,
  ekRecipe,
  ekStageOf,
} from "../src/game/escape-khazad-support";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "Escape from Khazad-dûm save validates");
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
    assert.ok(n < 500, "Escape from Khazad-dûm decisions terminate");
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
/**
 * A native game after the opening hands: by default the quick build takes the
 * first stage 2 and stage 3 cards and the first 7 encounter sets, and each
 * 'opposing team' search its first option.
 */
export function start(
  players = 1,
  easy = false,
  seed = 919,
  guided = false,
  hotseat = players > 1,
  picks: string[] = [],
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "escape-from-khazad-dum",
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
  const queue = [...picks];
  for (
    let n = 0;
    s.status === "playing" &&
    (s.phase === "setup" || s.choice || s.flow?.pending);
    n++
  ) {
    assert.ok(n < 500, "Escape from Khazad-dûm setup terminates");
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : s.choice
          ? {
              type: "CHOOSE",
              id:
                (queue.length && s.choice.options.some((o) => o.id === queue[0])
                  ? queue.shift()
                  : undefined) ??
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
 * A settled planning-phase table at 1B (Out of the Depths, no progress) with
 * the quick build done (Old One Lair, The Bridge of Khazad-dûm, sets 15-21)
 * but no encounter card in play or active: Dark Pit is in the box, the
 * encounter deck holds 20 Mithril Lodes (3 threat, no When Revealed, no
 * effect in the staging area) and the discard pile is empty. Each player has
 * threat 20 and heroes with 10 resources, and no allies, cards in hand or
 * discard pile.
 */
export function base(players = 1) {
  const s = start(players);
  const q = s.escapeKhazad!;
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
    encounterDeck: Array(20).fill(EK.mithril),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    questAttachments: {},
  });
  s.staging = [];
  const box = ekRecipe().cards.flatMap((c) =>
    Array<string>(c.quantity).fill(c.code),
  );
  Object.assign(q, {
    currentQuest: EK.depths,
    questDeck: [EK.lair, EK.bridge],
    defeated: [],
    box: box.filter((c) => c !== EK.depths && c !== EK.lair && c !== EK.bridge),
    sets: EK_SETS.slice(0, 7).map((x) => x.number),
    building: null,
    advancing: false,
    noCancel: null,
    baneAside: false,
    baneSafe: null,
    baneDamage: null,
    bridgeDamage: 0,
    bridgePlaced: null,
    lair: null,
    blank: [],
    penalties: [],
    enemyDefense: [],
    noDamage: [],
    fatigue: null,
    noReady: [],
    reduced: [],
    dungeon: [],
    nameless: [],
    excess: null,
    resolving: [],
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
/** Dark Pit in the staging area (from the box). */
export function pit(s: GameState) {
  takeBox(s, EK.pit);
  const u = make(s, EK.pit);
  s.staging.push(u);
  return u;
}
/** Dark Pit was explored: Durin's Bane is set aside. */
export function baneAside(s: GameState) {
  takeBox(s, EK.pit);
  s.escapeKhazad!.baneAside = true;
}
/** Durin's Bane in the staging area (Dark Pit was explored). */
export function bane(s: GameState) {
  takeBox(s, EK.pit);
  const u = make(s, EK.bane);
  s.staging.push(u);
  return u;
}
/** Take one physical copy out of the box (an unchosen set or Dark Pit). */
export function takeBox(s: GameState, code: string) {
  const q = s.escapeKhazad!;
  const i = q.box.indexOf(code);
  if (i >= 0) q.box.splice(i, 1);
}
/** Move the table to a quest card's B side. */
export function atQuest(s: GameState, code: string) {
  const q = s.escapeKhazad!;
  q.currentQuest = code;
  s.stage = ekStageOf(code);
  q.questDeck = q.questDeck.filter((c) => ekStageOf(c) > s.stage);
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
/** Make a location the active location. */
export function activate(s: GameState, code: string) {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
}
