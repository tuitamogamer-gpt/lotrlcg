import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import {
  firstPlayer,
  forOwner,
  globalCharacters,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { CU, CU_STAGES } from "../src/game/cirith-ungol-support";
import { isOneRing } from "../src/game/lotr-saga";
import { make } from "../src/game/core";
import type { GameState, Unit } from "../src/game/types";

export function reload(s: GameState): GameState {
  syncSeat(s);
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw), "The Tower of Cirith Ungol save validates");
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
    assert.ok(n < 500, "The Tower of Cirith Ungol decisions terminate");
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
    scenarioId: "the-tower-of-cirith-ungol",
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
    assert.ok(n < 500, "The Tower of Cirith Ungol setup terminates");
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
/** A filler card for players' hands: Guard of the Citadel. */
export const FILLER = "01013";
/** The hero carrying Last of the Company. */
export const host = (s: GameState) =>
  globalCharacters(s).find((u) =>
    u.attachments.some((a) => a.code === CU.company),
  );
/** Frodo Baggins, captive or in play. */
export const frodo = (s: GameState) =>
  s.cirithUngol?.captive ??
  globalCharacters(s).find((u) => u.code === "146001");
/** The One Ring, wherever it is attached. */
export const ring = (s: GameState) =>
  globalCharacters(s)
    .flatMap((u) => u.attachments)
    .find((a) => isOneRing(a.code));
/** The Two Watchers in play, either side. */
export const watchers = (s: GameState) =>
  [...s.staging, ...(s.activeLocation ? [s.activeLocation] : [])].find(
    (u) => u.code === CU.twoWatchers || u.code === CU.watchersEnemy,
  );
/**
 * A settled planning-phase table at the given stage. Each player has threat
 * 20, heroes with 10 resources, no card in hand and no ally; there is no
 * active location, an empty victory display and an encounter deck of Echoing
 * Passage, with Shagrat set aside.
 *
 * Stages 1 and 2: the first player's first hero carries Last of the Company
 * and The One Ring, and Frodo is captive under Topmost Chamber, which is in
 * the staging area. Stage 1 also has The Two Watchers (location side).
 * Stage 3: Frodo is free with The One Ring, Last of the Company and Topmost
 * Chamber are in the victory display and The Two Watchers (location side) is
 * in the staging area.
 */
export function base(players = 1, stage = 1) {
  const s = start(players);
  const bearer = host(s)!;
  const lotc = bearer.attachments.find((a) => a.code === CU.company)!;
  const oneRing = bearer.attachments.find((a) => isOneRing(a.code))!;
  const captive = s.cirithUngol!.captive!;
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
    encounterDeck: Array(20).fill(CU.passage),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    removedEncounter: [],
    questAttachments: {},
  });
  s.cirithUngol = {
    currentQuest: CU_STAGES[stage - 1],
    advancing: false,
    resolving: [],
    setAside: [CU.shagrat],
    ringPlaced: true,
  };
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
  Object.assign(captive, {
    resources: 0,
    damage: 0,
    exhausted: false,
    committed: false,
    attachments: [],
  });
  if (stage < 3) {
    bearer.attachments = [lotc, oneRing];
    s.cirithUngol.captive = captive;
    s.staging.push(make(s, CU.chamber));
    if (stage === 1) s.staging.unshift(make(s, CU.twoWatchers));
    else s.victoryCards = [CU.watchersEnemy];
    s.victory = stage === 1 ? 0 : 5;
  } else {
    const first = firstPlayer(s);
    captive.owner = first;
    captive.controller = first;
    captive.attachments = [oneRing];
    forOwner(s, first, () => s.heroes.push(captive));
    s.staging.push(make(s, CU.twoWatchers));
    s.victoryCards = [CU.chamber, CU.company];
    s.victory = 2;
  }
  selectSeat(s, playerOrder(s)[0]);
  syncSeat(s);
  return s;
}
/** The Two Watchers' enemy side in the staging area, replacing its location side. */
export function flipped(s: GameState) {
  const old = watchers(s);
  if (old) {
    s.staging = s.staging.filter((u) => u.id !== old.id);
    if (s.activeLocation?.id === old.id) s.activeLocation = null;
  }
  const u = make(s, CU.watchersEnemy);
  if (old) u.id = old.id;
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
