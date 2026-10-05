import test from "node:test";
import assert from "node:assert/strict";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyAction } from "./pass-resource-window.ts";
import { STARTERS } from "../src/game/cards.ts";
import {
  eventReplayPayments,
  playEventFromDiscardEffect,
  replayEventProblem,
} from "../src/game/actions.ts";
import { make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";

function fixture(sphere = "spirit") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = applyAction(createGame(99120, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    engaged: [],
    activeLocation: null,
    hand: [],
    discard: [],
    allies: [],
    used: [],
  });
  s.heroes.forEach((h) => {
    h.resources = 10;
  });
  return s;
}

test("discard replay derives Stand and Fight X and retains its ally when the event precedes it", () => {
  const s = fixture();
  s.discard = ["01051", "01013", "01073"];
  const event = make(s, "01051");
  assert.equal(replayEventProblem(s, event), null);
  assert.equal(replayEventProblem(s, event, "discard-1"), null);
  const payments = eventReplayPayments(s, event, "discard-1");
  assert.ok(payments.length);
  assert.equal(
    Object.values(payments[0]).reduce((a, b) => a + b, 0),
    2,
  );
  playEventFromDiscardEffect(s, 0, {
    target: "discard-1",
    payment: payments[0],
    bottom: true,
  });
  flush(s);
  assert.deepEqual(
    s.allies.map((u) => u.code),
    ["01013"],
  );
  assert.deepEqual(s.discard, ["01073"]);
  assert.equal(s.deck.at(-1), "01051");
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});

test("discard replay availability requires an affordable non-neutral Stand and Fight ally", () => {
  const s = fixture();
  const event = make(s, "01051");
  s.discard = ["01051", "01013", "01073"];
  s.heroes.forEach((h) => {
    h.resources = 0;
  });
  assert.match(replayEventProblem(s, event)!, /paid for/);
  s.heroes[0].resources = 1;
  assert.match(replayEventProblem(s, event, "discard-1")!, /payment/);
  s.heroes[0].resources = 2;
  assert.equal(replayEventProblem(s, event), null);
  assert.match(replayEventProblem(s, event, "discard-2")!, /target/);
});

test("Gandalf's Search discard replay pays the selected positive X and saves its ordering choice", () => {
  const s = fixture("lore");
  s.discard = ["01067"];
  s.deck = ["01013", "01014", "01015"];
  const event = make(s, "01067");
  assert.equal(replayEventProblem(s, event), null);
  assert.match(replayEventProblem(s, event, undefined, 0)!, /positive X/);
  assert.match(replayEventProblem(s, event, undefined, 4)!, /positive X/);
  const payment = eventReplayPayments(s, event, undefined, 2)[0];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  playEventFromDiscardEffect(s, 0, { amount: 2, payment, bottom: true });
  flush(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.equal(s.choice?.title, "Gandalf’s Search");
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  assert.equal(s.choice?.options.length, 2);
  const restored = JSON.parse(JSON.stringify(s));
  let next = applyAction(restored, {
    type: "CHOOSE",
    id: s.choice!.options[0].id,
  });
  while (next.choice)
    next = applyAction(next, { type: "CHOOSE", id: next.choice.options[0].id });
  assert.equal(next.hand[0].code, "01013");
  assert.equal(next.deck.at(-1), "01067");
});

test("a replayed Dwarven Tomb cannot recover its own physical copy or consume payment", () => {
  const s = fixture();
  s.discard = ["01053", "01043"];
  const before = JSON.stringify(s);
  assert.throws(
    () =>
      playEventFromDiscardEffect(s, 0, {
        target: "discard-0",
        payment: { [s.heroes[0].id]: 1 },
        bottom: true,
      }),
    /own physical discard copy/,
  );
  assert.equal(JSON.stringify(s), before);
});

test("a replayed Dwarven Tomb recovers another identical copy after its source leaves discard", () => {
  const s = fixture();
  s.discard = ["01053", "01053", "01043"];
  playEventFromDiscardEffect(s, 0, {
    target: "discard-1",
    payment: { [s.heroes[0].id]: 1 },
    bottom: true,
  });
  flush(s);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01053"],
  );
  assert.deepEqual(s.discard, ["01043"]);
  assert.equal(s.deck.at(-1), "01053");
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
