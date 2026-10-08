import assert from "node:assert/strict";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { GRAM, gramArea } from "../src/game/mount-gram-support";
import {
  activeSeat,
  eachArea,
  globalEachSeat,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState, Unit } from "../src/game/types";

export { choose, reload };
export function settle(s: GameState) {
  for (let n = 0; s.choice && s.status === "playing"; n++) {
    assert.ok(n < 240, "Mount Gram decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(91, d.cards, d.heroes, d.id, {
    scenarioId: "escape-from-mount-gram",
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
  for (let n = 0; s.phase === "setup"; n++) {
    assert.ok(n < 120, "Mount Gram setup terminates");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
/** Real setup and its physical dungeon quests remain intact; boards are controlled for a single clause. */
export function base(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    combat: null,
    suspendedCombats: [],
    encounterDeck: Array(30).fill("01099"),
    encounterDiscard: [],
    stageRevealing: false,
  });
  eachArea(s, () => {
    s.staging = [];
    s.activeLocation = null;
    s.extraActiveLocations = [];
    s.progress = 0;
    s.questDebuff = 0;
    s.threatModifier = 0;
  });
  s.mountGram!.captured = {};
  s.mountGram!.capturedDecks = {};
  s.mountGram!.alarms = {};
  globalEachSeat(s, () => {
    s.threat = 20;
    s.hand = [];
    s.discard = [];
    s.allies = [];
    s.engaged = [];
    s.used = [];
    s.committedIds = [];
    for (const h of s.heroes)
      Object.assign(h, {
        resources: 10,
        damage: 0,
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
  syncSeat(s);
  return s;
}
export function flight(players = 1) {
  const s = base(players),
    q = s.mountGram!;
  q.removedQuests.push(...q.areas.map((a) => a.quest));
  q.areas = [];
  q.split = false;
  delete q.activeArea;
  q.setAside = [];
  q.orcDeck = [];
  s.stage = 3;
  s.staging = [];
  s.activeLocation = null;
  s.extraActiveLocations = [];
  return s;
}
export function captive(
  s: GameState,
  host: Unit,
  code = "01016",
  owner = activeSeat(s),
) {
  const u = make(s, code);
  u.owner = owner;
  (s.mountGram!.captured[host.id] ??= []).push(u);
  return u;
}
export function capturedDeck(
  s: GameState,
  codes: string[],
  owner = activeSeat(s),
) {
  const units = codes.map((code) => {
    const u = make(s, code);
    u.owner = owner;
    return u;
  });
  s.mountGram!.capturedDecks[owner] = units;
  return units;
}
export function gate(s: GameState) {
  const u = make(s, GRAM.gate);
  s.staging.push(u);
  return u;
}
/** The first player's dungeon is complete; both other physical dungeons retain a prisoner. */
export function browserJoin() {
  const s = base(3);
  captive(s, gramArea(s, 1)!.quest, "01016", 1);
  captive(s, gramArea(s, 2)!.quest, "01016", 2);
  s.phase = "staging";
  s.mountGram!.resolvedAreas = s
    .mountGram!.areas.filter((a) => !a.players.includes(0))
    .map((a) => a.id);
  s.table!.turn = 0;
  syncSeat(s);
  return reload(s);
}
