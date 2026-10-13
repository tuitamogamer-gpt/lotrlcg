import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "../src/game/types";
import { validateSave } from "../src/game/engine";
import { make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { allCharacters, forOwner, ownerOf, seatView } from "../src/game/table";
import { DROWNED as D, DROWNED_ENCOUNTERS } from "../src/game/drowned-support";
import { drownedQuestEnd } from "../src/game/drowned";
import { add, base, choose, reload, setActive } from "./drowned-fixtures";

const physical = (name: string) =>
  DROWNED_ENCOUNTERS.find(
    (c) => c.back_name === name && c.type_code === "location",
  )!.code;
function force(s: GameState) {
  drownedQuestEnd(s);
  flush(s);
  return s;
}
/** Leave the actual Then choice pending while declining unrelated Responses. */
function reachThen(s: GameState) {
  for (
    let i = 0;
    s.choice && !/Flip to|Return to staging/.test(s.choice.title);
    i++
  ) {
    assert.ok(i < 100);
    const option =
      s.choice.options.find((o) =>
        ["skip", "continue", "resolve", "accept-damage"].includes(o.id),
      ) ?? s.choice.options[0];
    s = choose(reload(s), option.id);
  }
  return s;
}
function cave(s: GameState) {
  const u = add(s, D.cave);
  s.staging = s.staging.filter((c) => c.id !== u.id);
  s.activeLocation = u;
  return u;
}

test("Drowned Sunken Temple needs one actual resource from every hero and objective ally before Then", () => {
  let s = base(2);
  setActive(s, physical("Sunken Temple"), true);
  for (const c of allCharacters(s)) c.resources = 2;
  const empty = allCharacters(s).find((c) => c.code === D.naasiyahAlly)!;
  empty.resources = 0;
  s = reachThen(force(s));
  assert.equal(s.choice, null);
  assert.ok(s.activeLocation!.code.endsWith(":B"));
  assert.equal(allCharacters(s).find((c) => c.id === empty.id)!.resources, 0);
  assert.ok(
    allCharacters(s)
      .filter((c) => c.id !== empty.id)
      .every((c) => c.resources === 1),
  );
  assert.deepEqual(s.drowned!.thenReceipts, []);
  reload(s);
});

test("Drowned Sunken Temple offers Then after all resource discards resolve in full", () => {
  let s = base(2);
  setActive(s, physical("Sunken Temple"), true);
  allCharacters(s).forEach((c) => (c.resources = 1));
  s = reachThen(force(s));
  assert.match(s.choice!.title, /Flip to/);
  assert.ok(allCharacters(s).every((c) => c.resources === 0));
  s = choose(reload(s), "flip");
  assert.ok(!s.activeLocation!.code.endsWith(":B"));
});

test("Drowned Cave still discards every available card but a short second deck prevents Then", () => {
  let s = base(2);
  cave(s);
  forOwner(s, 0, () => (s.deck = Array(10).fill("01028")));
  forOwner(s, 1, () => (s.deck = Array(3).fill("01028")));
  s = reachThen(force(s));
  assert.equal(s.choice, null);
  assert.equal(s.activeLocation!.code, D.cave);
  assert.deepEqual(
    [seatView(s, 0).deck.length, seatView(s, 1).deck.length],
    [0, 0],
  );
  assert.deepEqual(
    [seatView(s, 0).discard.length, seatView(s, 1).discard.length],
    [10, 3],
  );
});

test("Drowned Cave offers return only after all players actually discard ten cards", () => {
  let s = base(2);
  const location = cave(s);
  for (const p of [0, 1])
    forOwner(s, p, () => (s.deck = Array(10).fill("01028")));
  s = reachThen(force(s));
  assert.match(s.choice!.title, /Return to staging/);
  s = choose(reload(s), "return");
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === location.id));
});

test("Drowned Twisting Hollow requires each player's physical discard and preserves pending receipts across reload", () => {
  let s = base(2);
  setActive(s, physical("Twisting Hollow"), true);
  const a = add(s, "01028", "allies", 0),
    b = add(s, "01028", "allies", 1);
  s = force(s);
  assert.match(s.choice!.title, /Discard a character/);
  s = choose(reload(s), a.id);
  assert.match(s.choice!.title, /Discard a character/);
  assert.equal(s.drowned!.thenReceipts![0].resolved.length, 1);
  s = reachThen(choose(reload(s), b.id));
  assert.match(s.choice!.title, /Flip to/);
  assert.ok(!allCharacters(s).some((c) => [a.id, b.id].includes(c.id)));
  assert.deepEqual(s.drowned!.thenReceipts, []);
});

test("Drowned Twisting Hollow does not count a stale discard target as resolved", () => {
  let s = base(2);
  setActive(s, physical("Twisting Hollow"), true);
  const a = add(s, "01028", "allies", 0),
    b = add(s, "01028", "allies", 1);
  s = choose(force(s), a.id);
  forOwner(s, 1, () => {
    s.allies = s.allies.filter((c) => c.id !== b.id);
    s.discard.push(b.code);
  });
  s = reachThen(choose(reload(s), b.id));
  assert.equal(s.choice, null);
  assert.ok(s.activeLocation!.code.endsWith(":B"));
  assert.deepEqual(s.drowned!.thenReceipts, []);
});

test("Drowned Dark Abyss offers Then after every damage assignment lands", () => {
  let s = base(2);
  setActive(s, physical("Dark Abyss"), true);
  s = reachThen(force(s));
  assert.match(s.choice!.title, /Flip to/);
  assert.ok(allCharacters(s).every((c) => c.damage === 1));
  s = choose(reload(s), "flip");
  assert.ok(!s.activeLocation!.code.endsWith(":B"));
});

test("Drowned Dark Abyss damage prevention blocks Then even though the other assignments land", () => {
  let s = base();
  setActive(s, physical("Dark Abyss"), true);
  const protectedId = s.heroes[0].id;
  s.heroes[0].roundCannotTakeDamage = true;
  s = reachThen(force(s));
  assert.equal(s.choice, null);
  assert.ok(s.activeLocation!.code.endsWith(":B"));
  assert.equal(allCharacters(s).find((c) => c.id === protectedId)!.damage, 0);
  assert.ok(
    allCharacters(s)
      .filter((c) => c.id !== protectedId)
      .every((c) => c.damage === 1),
  );
});

test("Drowned Dark Abyss waits for Frodo and a saved cancellation blocks Then", () => {
  let s = base();
  setActive(s, physical("Dark Abyss"), true);
  const frodo = make(s, "02025");
  s.heroes.unshift(frodo);
  s = force(s);
  assert.match(s.choice!.title, /Frodo/);
  assert.equal(s.drowned!.thenReceipts![0].resolved.length, 0);
  const forged = structuredClone(s);
  forged.drowned!.thenReceipts![0].resolved.push("not-an-assignment");
  assert.equal(validateSave(forged), false);
  s = reachThen(choose(reload(s), "cancel-damage"));
  assert.equal(s.choice, null);
  assert.equal(allCharacters(s).find((c) => c.id === frodo.id)!.damage, 0);
  assert.ok(s.activeLocation!.code.endsWith(":B"));
  assert.deepEqual(s.drowned!.thenReceipts, []);
});

test("Drowned Dark Abyss counts a successful Dori replacement toward the original assignment", () => {
  let s = base();
  setActive(s, physical("Dark Abyss"), true);
  const hero = s.heroes[0],
    dori = add(s, "131009", "allies");
  s = force(s);
  assert.match(s.choice!.title, /Dori/);
  s = reachThen(choose(reload(s), dori.id));
  assert.match(s.choice!.title, /Flip to/);
  assert.equal(allCharacters(s).find((c) => c.id === hero.id)!.damage, 0);
  assert.equal(allCharacters(s).find((c) => c.id === dori.id)!.damage, 2);
});

test("Drowned Dark Abyss Song redirection into Frodo cancellation cannot satisfy Then", () => {
  let s = base();
  setActive(s, physical("Dark Abyss"), true);
  const hero = s.heroes[0],
    frodo = make(s, "02025");
  s.heroes.push(frodo);
  frodo.attachments.push({
    id: `a${s.nextId++}`,
    code: "02099",
    exhausted: false,
  });
  seatView(s, ownerOf(s, hero)).used.push(
    `phase:mocking:${s.nextId++}:${hero.id}:${frodo.id}`,
  );
  s = force(s);
  assert.match(s.choice!.title, /Frodo/);
  s = reachThen(choose(reload(s), "cancel-damage"));
  assert.equal(s.choice, null);
  assert.equal(allCharacters(s).find((c) => c.id === hero.id)!.damage, 0);
  assert.equal(allCharacters(s).find((c) => c.id === frodo.id)!.damage, 1);
  assert.ok(s.activeLocation!.code.endsWith(":B"));
});
