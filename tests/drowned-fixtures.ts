import assert from "node:assert/strict";
import type { GameState, Unit } from "../src/game/types";
import { createGame, applyAction } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { advanceQuest, addVictoryCard } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, playerOrder, selectSeat } from "../src/game/table";
import { DROWNED as D, drownedFront } from "../src/game/drowned-support";
import { choose, reload } from "./against-shadow-final-fixtures";
export { choose, reload };
export function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 200, "Drowned mandatory choices terminate");
    const options = s.choice.options;
    s = choose(
      reload(s),
      options.find((o) =>
        ["skip", "continue", "resolve", "close"].includes(o.id),
      )?.id ?? options[0].id,
    );
  }
  return s;
}
export function start(players = 1, easy = false, seed = 50) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-drowned-ruins",
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
    assert.ok(i < 100);
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
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
        [D.sahirAlly, D.naasiyahAlly].includes(u.code),
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
export function setActive(
  s: GameState,
  physicalCode: string,
  underwater = false,
): Unit {
  const q = s.drowned!;
  const candidates = [
    ...s.staging,
    ...q.grottoDeck,
    ...q.setAside,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ];
  const u = candidates.find(
    (u) =>
      q.originalCodes[u.id] === physicalCode ||
      u.code === physicalCode ||
      q.originalCodes[u.id] + ":B" === physicalCode,
  )!;
  assert.ok(u, `Physical location ${physicalCode} exists`);
  if (s.activeLocation && s.activeLocation.id !== u.id)
    s.staging.push(s.activeLocation);
  s.staging = s.staging.filter((x) => x.id !== u.id);
  q.grottoDeck = q.grottoDeck.filter((x) => x.id !== u.id);
  q.setAside = q.setAside.filter((x) => x.id !== u.id);
  u.code = underwater
    ? q.originalCodes[u.id] + ":B"
    : drownedFront(q.originalCodes[u.id]);
  u.progress = 0;
  s.activeLocation = u;
  s.extraActiveLocations = [];
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
export function stage2(players = 1, easy = false) {
  let s = base(players, easy),
    q = s.drowned!;
  for (let i = 0; i < 3; i++) {
    const u = q.grottoDeck.shift()!;
    u.code = q.originalCodes[u.id] + ":B";
    q.victoryLocations.push(u);
    addVictoryCard(s, u.code);
  }
  s.progress = 15;
  advanceQuest(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.status, "playing");
  return s;
}
