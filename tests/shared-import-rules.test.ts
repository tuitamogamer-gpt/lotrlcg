import { applyAction } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave, restoreSave } from "../src/game/engine.ts";
import {
  make,
  takePlayerDeck,
  putPlayerDeck,
  reorderPlayerDeck,
  shuffle,
} from "../src/game/core.ts";
import {
  check,
  discardHandCard,
  takePlayerDiscard,
} from "../src/game/board.ts";
import { currentQuestCode } from "../src/game/quest-state.ts";
import { seatView, selectSeat, syncSeat } from "../src/game/table.ts";
import { WATCHER_WATER } from "../src/game/watcher-water-support.ts";
function game() {
  const deck = STARTERS[0];
  let s = createGame(608, deck.cards, deck.heroes, deck.id, {
    seats: [
      { deckId: "leadership", heroes: ["01001"] },
      { deckId: "spirit", heroes: ["01007"] },
    ],
  });
  while (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
  s.queue = [];
  s.choice = null;
  s.staging = [];
  return s;
}
test("elimination discards controlled shared attachments and traps, retains attachments controlled by survivors and enemy damage", () => {
  const s = game(),
    enemy = make(s, "01082"),
    location = make(s, "01078"),
    trap = make(s, "05017");
  enemy.owner = 0;
  enemy.damage = 2;
  enemy.attachments.push(
    { id: "snare", code: "01069", owner: 0, exhausted: false },
    { id: "enemy-encounter", code: WATCHER_WATER.grasping, exhausted: false },
  );
  location.attachments.push({
    id: "paths",
    code: "01056",
    owner: 0,
    exhausted: false,
  });
  s.staging.push(location, trap);
  s.engaged.push(enemy);
  trap.owner = 0;
  const survivor = seatView(s, 1).heroes[0];
  survivor.attachments.push({
    id: "survivor-owned-by-zero",
    code: "01027",
    owner: 0,
    exhausted: false,
  });
  const code = currentQuestCode(s)!;
  s.questAttachments = {
    [code]: [{ id: "quest-copy", code: "10122", owner: 0, exhausted: false }],
  };
  s.threat = 50;
  syncSeat(s);
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.ok(
    ["01069", "01056", "05017", "10122"].every((c) =>
      seatView(s, 0).discard.includes(c),
    ),
  );
  assert.ok(!s.staging.some((u) => u.id === trap.id));
  const returned = s.staging.find((u) => u.id === enemy.id)!;
  assert.equal(returned.damage, 2);
  assert.equal(returned.attachments.length, 1);
  assert.equal(returned.attachments[0].id, "enemy-encounter");
  assert.ok(
    seatView(s, 1).heroes[0].attachments.some(
      (a) => a.id === "survivor-owned-by-zero",
    ),
  );
  assert.equal(s.questAttachments![code].length, 0);
  assert.ok(validateSave(s));
  const before = seatView(s, 0).discard.length;
  check(s);
  assert.equal(seatView(s, 0).discard.length, before);
});
test("used physical event identities survive hidden deck permutations and reload without leaking into other seats", () => {
  let s = game();
  selectSeat(s, 0);
  const copy = make(s, "04105"),
    other = make(s, "04105");
  s.hand = [copy, other];
  s.deck = ["01018", "01014"];
  s.used.push(`phase:heavy-stroke:${copy.id}`);
  discardHandCard(s, copy.id);
  putPlayerDeck(s, takePlayerDiscard(s, s.discard.lastIndexOf("04105")), 0);
  putPlayerDeck(s, other);
  s.hand = [];
  reorderPlayerDeck(s, 0, [3, 1, 2, 0]);
  shuffle(s, s.deck);
  syncSeat(s);
  assert.ok(validateSave(s));
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(s);
  const physical = [];
  while (s.deck.length) physical.push(takePlayerDeck(s));
  assert.equal(physical.filter((u) => u.id === copy.id).length, 1);
  assert.equal(physical.filter((u) => u.code === "04105").length, 2);
  assert.ok(physical.some((u) => u.code === "04105" && u.id !== copy.id));
  syncSeat(s);
  assert.ok(validateSave(s));
});
test("save validation rejects malformed or colliding hidden card bindings", () => {
  const s = game(),
    copy = make(s, "04105");
  s.used.push(`phase:heavy-stroke:${copy.id}`);
  s.deck = ["04105"];
  s.used.push("phase:heavy-deck:{broken");
  syncSeat(s);
  assert.equal(restoreSave(s), null);
  s.used = s.used.filter((k) => !k.startsWith("phase:heavy-deck:"));
  s.used.push("phase:heavy-deck:" + JSON.stringify({ index: 0, id: copy.id }));
  s.hand.push(copy);
  syncSeat(s);
  assert.equal(restoreSave(s), null);
});
