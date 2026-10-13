import assert from "node:assert/strict";
import type { GameState } from "../src/game/types";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { forOwner, playerOrder, selectSeat } from "../src/game/table";
import {
  TEMPLE as T,
  templeMapUnits,
  templeMapUnit,
  templeCell,
} from "../src/game/temple-support";
import { templeSyncMap } from "../src/game/temple";
import { choose, reload } from "./against-shadow-final-fixtures";
export { choose, reload };
export function settle(s: GameState) {
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 200, "Temple mandatory choices terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) =>
        ["continue", "skip", "close", "resolve"].includes(o.id),
      )?.id ?? s.choice.options[0].id,
    );
  }
  return s;
}
export function start(players = 1, easy = false, seed = 50) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "temple-of-the-deceived",
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
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 100, "Temple setup terminates");
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
/** Valid original map and physical companions; extra gameplay cards are explicit. */
export function base(players = 1, easy = false) {
  const s = start(players, easy);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDiscard: [],
    encounterDeck: Array(30).fill("01099"),
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      s.allies = s.allies.filter((u) =>
        [T.sahirAlly, T.naasiyahAlly].includes(u.code),
      );
      for (const u of [...s.heroes, ...s.allies])
        Object.assign(u, {
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
  return s;
}
/** Fixture placement preserves the exact original face multiset and all opaque IDs. */
export function setFace(
  s: GameState,
  id: string,
  code: string,
  hidden = false,
) {
  const q = s.temple!,
    u = templeMapUnit(s, id)!;
  assert.ok(u && templeCell(s, id));
  if (q.originalCodes[id] !== code) {
    const other = templeMapUnits(s).find(
      (x) => x.id !== id && q.originalCodes[x.id] === code,
    )!;
    assert.ok(other, `original ${code} physical copy exists`);
    const previous = q.originalCodes[id],
      wasHidden = !!q.hiddenBacks[other.id];
    q.originalCodes[other.id] = previous;
    if (wasHidden) q.hiddenBacks[other.id] = previous;
    else other.code = previous;
  }
  q.originalCodes[id] = code;
  u.progress = 0;
  delete q.lookedBy[id];
  if (hidden) {
    u.code = templeCell(s, id)!.column === 4 ? T.temple : T.lost;
    q.hiddenBacks[id] = code;
  } else {
    u.code = code;
    delete q.hiddenBacks[id];
  }
  templeSyncMap(s);
  return u;
}
export function cell(s: GameState, row: number, column: number) {
  return templeMapUnit(
    s,
    s.temple!.map.find((c) => c.row === row && c.column === column)!.id,
  )!;
}
export function setActive(s: GameState, code: string, row = 1, column = 1) {
  const u = setFace(s, cell(s, row, column).id, code);
  const old = s.activeLocation;
  if (old) s.temple!.outOfStaging.push(old);
  s.activeLocation = null;
  s.temple!.activeId = u.id;
  templeSyncMap(s);
  return u;
}
export function add(
  s: GameState,
  code: string,
  zone: "staging" | "allies" | "engaged" | "hand" = "staging",
  player = 0,
) {
  const u = make(s, code);
  if (zone === "staging") s.staging.push(u);
  else
    forOwner(s, player, () => {
      u.owner = player;
      if (zone === "allies") u.controller = player;
      s[zone].push(u);
    });
  return u;
}
