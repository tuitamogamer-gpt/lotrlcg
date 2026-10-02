import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards.ts";
import {
  createGame,
  applyAction,
  canPlay,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { make } from "../src/game/core.ts";
import { seatView, selectSeat } from "../src/game/table.ts";

test("collection and draw lead to a real, saved resource action window", () => {
  const d = STARTERS[0];
  let s = applyAction(createGame(710, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  assert.equal(s.phase, "resource");
  assert.equal(s.round, 1);
  assert.equal(s.hand.length, 7);
  assert.ok(s.heroes.every((h) => h.resources === 1));
  const ally = make(s, "01013");
  s.hand.push(ally);
  s.heroes[0].resources = 10;
  assert.match(canPlay(s, ally) ?? "", /during planning/);
  s.heroes[0].attachments.push({
    id: "resource-steward",
    code: "01026",
    exhausted: false,
  });
  s = applyAction(s, {
    type: "ABILITY",
    id: s.heroes[0].id,
    attachmentId: "resource-steward",
  });
  assert.equal(s.phase, "resource");
  assert.equal(s.heroes[0].resources, 12);
  const event = make(s, "01022");
  s.hand.push(event);
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.equal(s.phase, "resource");
  assert.ok(s.discard.includes("01022"));
  assert.ok(validateSave(s));
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  const hand = s.hand.length,
    resources = s.heroes[0].resources;
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.phase, "planning");
  assert.equal(s.hand.length, hand);
  assert.equal(s.heroes[0].resources, resources);
  assert.equal(
    canPlay(
      s,
      s.hand.find((u) => u.id === ally.id)!,
    ),
    null,
  );
});

test("each living seat passes resource actions before planning; viewing another seat cannot pass its turn", () => {
  const d = STARTERS[0];
  let s = createGame(711, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001"], deckId: "leadership" },
      { heroes: ["01007"], deckId: "spirit" },
    ],
  });
  while (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
  assert.equal(s.phase, "resource");
  assert.equal(s.table!.turn, 0);
  selectSeat(s, 1);
  assert.throws(() => applyAction(s, { type: "NEXT" }), /turn/);
  selectSeat(s, 0);
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.phase, "resource");
  assert.equal(s.table!.turn, 1);
  assert.deepEqual(s.table!.passed, [0]);
  s = restoreSave(JSON.parse(JSON.stringify(s)))!;
  const amounts = s.table!.seats.map(
    (_, i) => seatView(s, i).heroes[0].resources,
  );
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.phase, "planning");
  assert.equal(s.table!.turn, 0);
  assert.deepEqual(s.table!.passed, []);
  assert.deepEqual(
    s.table!.seats.map((_, i) => seatView(s, i).heroes[0].resources),
    amounts,
  );
});
