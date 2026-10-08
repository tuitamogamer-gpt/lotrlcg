import test from "node:test";
import assert from "node:assert/strict";
import { card } from "../src/game/cards";
import { make } from "../src/game/core";
import { placeEncounter, progressLocation, check } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView } from "../src/game/table";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import { WEATHER as W } from "../src/game/weather-hills-support";
import {
  sideQuestStart,
  addCurrentQuestProgress,
} from "../src/game/side-quests";
import { base, choose, reload, settle } from "./dread-realm-fixtures";

test("shared Angmar: Lost in the Wilderness retains physical owner hands through save and quest defeat", () => {
  let s = base(2);
  const a = make(s, "01013"),
    b = make(s, "01050");
  a.owner = 0;
  b.owner = 1;
  s.hand.push(a);
  forOwner(s, 1, () => s.hand.push(b));
  placeEncounter(s, C.wilderness, false, 0, undefined, true);
  flush(s);
  const quest = s.staging.find((u) => u.code === C.wilderness)!;
  assert.equal(s.chetwood, undefined);
  assert.deepEqual(
    s.encounterHiddenHands![quest.id].map((u) => u.id),
    [a.id, b.id],
  );
  s = reload(s);
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  s = choose(reload(s), quest.id);
  addCurrentQuestProgress(s, card(C.wilderness).quest!);
  flush(s);
  s = settle(s);
  assert.equal(s.encounterHiddenHands![quest.id], undefined);
  assert.equal(seatView(s, 0).hand.find((u) => u.id === a.id)?.code, a.code);
  assert.equal(seatView(s, 1).hand.find((u) => u.id === b.id)?.code, b.code);
});
test("shared Angmar: eliminated owners' hidden cards are removed while surviving owners' physical cards remain", () => {
  const s = base(2),
    a = make(s, "01013"),
    b = make(s, "01050");
  a.owner = 0;
  b.owner = 1;
  s.encounterHiddenHands = { c900: [a, b] };
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.deepEqual(
    s.encounterHiddenHands.c900.map((u) => u.id),
    [a.id],
  );
  assert.ok(seatView(s, 1).removed.includes(b.code));
});
test("shared Angmar: Cold from Angmar resolves each hero choice and blanks damaged printed abilities without Weather state", () => {
  let s = base(2);
  placeEncounter(s, W.cold);
  flush(s);
  assert.match(s.choice!.title, /Cold from Angmar/);
  s = choose(reload(s), s.choice!.options[0].id);
  s = choose(reload(s), s.choice!.options[0].id);
  s = settle(s);
  assert.equal(s.weatherHills, undefined);
  for (const p of [0, 1]) {
    const h = seatView(s, p).heroes.find((h) => h.damage === 1)!;
    assert.ok(h);
    assert.equal(h.blanked, true);
    assert.equal(h.printedKeywordsPreserved, true);
  }
  assert.equal(
    s.questAttachments!["octgn:e2f901ad-f5bc-4d29-b6c3-50c261e5668a"].find(
      (a) => a.code === W.cold,
    )?.code,
    W.cold,
  );
});
test("shared Angmar: Ancient Causeway's physical explore effect raises each player's threat without mission/orc state", () => {
  const s = base(2),
    location = make(s, W.causeway);
  s.staging.push(location);
  progressLocation(s, location, 100);
  flush(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  assert.equal(s.weatherHills, undefined);
  assert.equal(s.stage, 1);
  assert.ok(s.encounterDiscard.includes(W.causeway));
});
