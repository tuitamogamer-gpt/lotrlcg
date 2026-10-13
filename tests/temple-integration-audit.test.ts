import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../src/game/engine";
import { check, damage, readyCharacter } from "../src/game/board";
import { make } from "../src/game/core";
import { forOwner, ownerOf, seatView, selectSeat } from "../src/game/table";
import { TEMPLE as T, templeMapUnit } from "../src/game/temple-support";
import {
  base,
  add,
  cell,
  setActive,
  setFace,
  reload,
  choose,
} from "./temple-fixtures";

test("Temple actual map travel offers Curious Brandybuck's after-travel response and preserves its owner", () => {
  let s = base(2);
  const previous = setActive(s, T.cursed, 1, 1);
  previous.progress = 3;
  const destination = setFace(s, cell(s, 1, 2).id, T.cursed);
  const brandybuck = add(s, "10006", "hand", 0);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: destination.id });
  assert.match(s.choice?.title ?? "", /Curious Brandybuck/);
  s = choose(reload(s), "use");
  s = choose(reload(s), "player-1");
  const entered = seatView(s, 1).allies.find((u) => u.id === brandybuck.id);
  assert.ok(
    entered,
    "the exact physical card enters under the chosen controller",
  );
  assert.equal(entered.owner, 0);
  assert.equal(ownerOf(s, entered), 1);
  assert.ok(!seatView(s, 0).hand.some((u) => u.id === brandybuck.id));
  reload(s);
});

test("Temple travel to the printed Mountain face offers Ever My Heart Rises to another player's Dwarf", () => {
  let s = base(2);
  const previous = setActive(s, T.cursed, 1, 1);
  previous.progress = 3;
  const destination = setFace(s, cell(s, 1, 2).id, T.cliffs);
  const dwarf = seatView(s, 1).heroes.find((u) => u.code === "01004")!;
  assert.ok(dwarf);
  dwarf.exhausted = true;
  const attachment = {
    id: make(s, "04082").id,
    code: "04082",
    exhausted: false,
    owner: 1,
    controller: 1,
  };
  dwarf.attachments.push(attachment);
  const before = seatView(s, 1).threat;
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: destination.id });
  assert.match(s.choice?.title ?? "", /Ever My Heart Rises/);
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), "ready");
  assert.equal(
    seatView(s, 1).heroes.find((u) => u.id === dwarf.id)!.exhausted,
    false,
  );
  assert.equal(seatView(s, 1).threat, before - 1);
  assert.ok(
    seatView(s, 1)
      .heroes.find((u) => u.id === dwarf.id)!
      .attachments.some((a) => a.id === attachment.id),
  );
  reload(s);
});

test("Temple actual map travel offers Strength of Will to a different seat and places progress on that destination", () => {
  let s = base(3);
  const previous = setActive(s, T.cursed, 1, 1);
  previous.progress = 3;
  const destination = setFace(s, cell(s, 1, 2).id, T.cursed);
  const event = add(s, "01047", "hand", 2);
  const spiritHero = seatView(s, 2).heroes[0];
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: destination.id });
  assert.match(s.choice?.title ?? "", /Strength of Will/);
  assert.equal(s.table!.active, 2);
  s = choose(reload(s), spiritHero.id);
  assert.equal(templeMapUnit(s, destination.id)!.progress, 2);
  assert.equal(templeMapUnit(s, previous.id)!.progress, 0);
  assert.equal(
    seatView(s, 2).heroes.find((u) => u.id === spiritHero.id)!.exhausted,
    true,
  );
  assert.ok(!seatView(s, 2).hand.some((u) => u.id === event.id));
  assert.ok(seatView(s, 2).discard.includes("01047"));
  reload(s);
});

test("Temple middle-seat elimination discards that player's attachment from a remote map location", () => {
  let s = base(3);
  const remote = setActive(s, T.flooded, 1, 1);
  forOwner(s, 1, () => {
    s.heroes[0].attachments.push({
      id: make(s, "02081").id,
      code: "02081",
      exhausted: false,
    });
  });
  const mathom = add(s, "02056", "hand", 1);
  s.table!.turn = 1;
  selectSeat(s, 1);
  s = applyAction(reload(s), {
    type: "PLAY",
    id: mathom.id,
    target: remote.id,
  });
  assert.ok(
    templeMapUnit(s, remote.id)!.attachments.some((a) => a.id === mathom.id),
  );
  setActive(s, T.cursed, 1, 3);
  assert.ok(s.temple!.outOfStaging.some((u) => u.id === remote.id));
  s = reload(s);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(
    s.status,
    "playing",
    "first and last player objective companions remain in play",
  );
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(
    !templeMapUnit(s, remote.id)!.attachments.some((a) => a.id === mathom.id),
  );
  assert.equal(
    seatView(s, 1).discard.filter((code) => code === "02056").length,
    1,
  );
  reload(s);
});

test("Temple exhausted Gate Key keeps its physical exhaustion and ID when its attached hero dies", () => {
  let s = base(2);
  damage(s, s.staging.find((u) => u.code === T.guardian)!.id, 10);
  const keyId = s.staging.find((u) => u.code === T.key)!.id;
  s.table!.turn = 1;
  selectSeat(s, 1);
  const heroId = s.heroes[0].id;
  s = applyAction(reload(s), { type: "CLAIM", id: keyId, heroId });
  readyCharacter(
    s,
    s.heroes.find((u) => u.id === heroId)!,
  );
  const temple = cell(s, 1, 4);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: heroId,
    attachmentId: keyId,
  });
  s = choose(reload(s), temple.id);
  s = choose(reload(s), "close");
  assert.equal(
    s.heroes
      .find((u) => u.id === heroId)!
      .attachments.find((a) => a.id === keyId)!.exhausted,
    true,
  );
  damage(s, heroId, 100);
  check(s);
  assert.equal(s.status, "playing");
  const returned = s.staging.filter((u) => u.code === T.key);
  assert.equal(returned.length, 1);
  assert.equal(returned[0].id, keyId);
  assert.equal(returned[0].exhausted, true);
  reload(s);
});

test("Temple departure does not trigger Elf-stone because the explored map location remains in play", () => {
  let s = base();
  const previous = setActive(s, T.cursed, 1, 1);
  const stone = {
    id: make(s, "141016").id,
    code: "141016",
    exhausted: false,
    owner: 0,
    controller: 0,
  };
  previous.attachments.push(stone);
  previous.progress = 4;
  const destination = setFace(s, cell(s, 1, 2).id, T.cursed);
  const ally = add(s, "01014", "hand");
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: destination.id });
  assert.equal(
    s.choice,
    null,
    "printed response requires the explored location to leave play",
  );
  assert.ok(
    templeMapUnit(s, previous.id)!.attachments.some((a) => a.id === stone.id),
  );
  assert.ok(s.hand.some((u) => u.id === ally.id));
  assert.ok(!s.allies.some((u) => u.id === ally.id));
  reload(s);
});
