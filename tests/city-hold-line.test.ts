import assert from "node:assert/strict";
import test from "node:test";
import { canPlay } from "../src/game/engine";
import { fx, get, make, prepend } from "../src/game/core";
import { beginEnemyAttack } from "../src/game/combat";
import { flush } from "../src/game/effects";
import { activeSeat, forOwner, playerOrder, seatView } from "../src/game/table";
import {
  HOLD_THE_LINE as HOLD,
  cityHoldLineDefenders,
} from "../src/game/city-hold-line";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import {
  drownedPlayerFixture as fixture,
  drownedPlayerHand as hand,
  drownedPlayerAlly as ally,
} from "./drowned-player-fixtures";
import type { GameState, Unit } from "../src/game/types";

const select = (s: GameState, id: string) => choose(reload(s), id);
function attack(s: GameState, code = "01089", defender?: Unit) {
  s.phase = "defense";
  const enemy = make(s, code);
  if (code === "01076") enemy.tempAttack = 1;
  s.engaged.push(enemy);
  beginEnemyAttack(s, enemy, defender ? [defender.id] : []);
  flush(s);
  return { s, enemy };
}
function declare(s: GameState, event: Unit, ids: string[]) {
  s = select(s, event.id);
  for (const id of ids) s = select(s, id);
  if (ids.length < 3) s = select(s, "done");
  return s;
}
function pay(s: GameState, ids: string[]) {
  s = select(s, "pay");
  for (const id of ids) s = select(s, id);
  return s;
}

test("Hold the Line is response-only and declining preserves the physical card and original defense", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    defender = s.heroes[1];
  assert.match(canPlay(s, event) ?? "", /response window/);
  ({ s } = attack(s, "01089", defender));
  assert.match(s.choice!.title, /Hold the Line/);
  assert.equal(get(s, defender.id)!.exhausted, false);
  s = select(s, "skip");
  assert.equal(get(s, defender.id)!.exhausted, true);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.ok(s.hand.some((u) => u.id === event.id));
  assert.ok(!s.discard.includes(HOLD));
});

test("Hold the Line declares three distinct defenders with combined defense and no mandatory payment", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    ids = s.heroes.map((h) => h.id),
    before = s.heroes.reduce((n, h) => n + h.resources, 0);
  ({ s } = attack(s, "01076"));
  s = declare(s, event, ids);
  assert.match(s.choice!.title, /Then spend 2 Tactics/);
  assert.deepEqual(s.combat!.defenderIds, ids);
  assert.equal(s.standTogether, false);
  for (const id of ids) assert.equal(get(s, id)!.exhausted, true);
  s = select(s, "skip");
  assert.match(s.choice!.title, /Assign 1 combat damage/);
  s = select(s, ids[1]);
  assert.equal(get(s, ids[1])!.damage, 1);
  assert.equal(get(s, ids[0])!.damage, 0);
  assert.equal(get(s, ids[2])!.damage, 0);
  for (const id of ids) assert.equal(get(s, id)!.exhausted, true);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before,
  );
  assert.equal(s.discard.filter((c) => c === HOLD).length, 1);
  assert.ok(!s.hand.some((u) => u.id === event.id));
});

test("a remote player casts Hold the Line while the attacked player chooses local and Sentinel defenders", () => {
  let s = fixture(2);
  const event = hand(s, HOLD, 1),
    local = s.heroes[1],
    sentinel = ally(s, "01029", 1),
    nonSentinel = ally(s, "01018", 1);
  const { enemy } = attack(s);
  assert.ok(cityHoldLineDefenders(s, enemy).some((u) => u.id === sentinel.id));
  assert.ok(
    !cityHoldLineDefenders(s, enemy).some((u) => u.id === nonSentinel.id),
  );
  s = select(s, event.id);
  assert.equal(activeSeat(s), 0);
  assert.ok(s.choice!.options.some((o) => o.id === sentinel.id));
  assert.ok(!s.choice!.options.some((o) => o.id === nonSentinel.id));
  s = select(s, local.id);
  assert.ok(!s.choice!.options.some((o) => o.id === local.id));
  s = select(s, sentinel.id);
  s = select(s, "done");
  s = select(s, "skip");
  assert.equal(get(s, local.id)!.exhausted, true);
  assert.equal(get(s, sentinel.id)!.exhausted, true);
  assert.equal(get(s, nonSentinel.id)!.exhausted, false);
  assert.ok(seatView(s, 1).discard.includes(HOLD));
  assert.ok(!seatView(s, 0).discard.includes(HOLD));
});

test("shared Tactics allocation survives reload, spends atomically and readies only after attack completion", () => {
  let s = fixture(2);
  const event = hand(s, HOLD),
    one = s.heroes[1],
    two = s.heroes[2],
    remote = seatView(s, 1).heroes[0];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.resources = 0;
    });
  one.resources = remote.resources = 1;
  two.damage = 1;
  ({ s } = attack(s));
  s = declare(s, event, [one.id, two.id]);
  s = select(s, "pay");
  s = select(s, one.id);
  assert.equal(get(s, one.id)!.resources, 1);
  assert.equal(get(s, remote.id)!.resources, 1);
  assert.equal(get(s, one.id)!.exhausted, true);
  assert.equal(get(s, two.id)!.exhausted, true);
  s = select(s, remote.id);
  assert.equal(get(s, one.id)!.resources, 0);
  assert.equal(get(s, remote.id)!.resources, 0);
  assert.equal(get(s, one.id)!.exhausted, false);
  assert.equal(get(s, two.id)!.exhausted, false);
  assert.equal(
    get(s, two.id)!.damage,
    1,
    "pre-existing damage is not from this attack",
  );
});

test("combat damage goes to one chosen defender and prevents only that defender's delayed ready", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    one = s.heroes[1],
    two = s.heroes[2];
  ({ s } = attack(s, "01076"));
  s = declare(s, event, [one.id, two.id]);
  s = pay(s, [one.id, one.id]);
  assert.match(s.choice!.title, /Assign 2 combat damage/);
  assert.equal(get(s, one.id)!.exhausted, true);
  assert.equal(get(s, two.id)!.exhausted, true);
  s = select(s, one.id);
  assert.equal(get(s, one.id)!.damage, 2);
  assert.equal(get(s, one.id)!.exhausted, true);
  assert.equal(get(s, two.id)!.damage, 0);
  assert.equal(get(s, two.id)!.exhausted, false);
});

test("shadow damage is recorded before healing and prevents an otherwise undamaged defender from readying", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    defender = s.heroes[1];
  s.phase = "defense";
  const enemy = make(s, "01089");
  enemy.shadows = ["octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9006"];
  s.engaged.push(enemy);
  beginEnemyAttack(s, enemy, []);
  flush(s);
  s = declare(s, event, [defender.id]);
  const boundary = s.queue.findIndex((e) => e.kind === "enemyDamage");
  assert.ok(boundary >= 0);
  s.queue.splice(boundary, 0, fx("heal", { target: defender.id, value: 1 }));
  s = pay(s, [defender.id, defender.id]);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, defender.id)!.exhausted, true);
  assert.ok(s.log.some((entry) => /Blocking Wargs/.test(entry.text)));
});

test("a canceled damage assignment does not block Hold the Line's delayed ready", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    defender = s.heroes[1];
  defender.roundCannotTakeDamage = true;
  ({ s } = attack(s, "01076"));
  s = declare(s, event, [defender.id]);
  s = pay(s, [defender.id, defender.id]);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, defender.id)!.exhausted, false);
});

test("Hold the Line excludes exhausted, Sacked and immune characters without targeting the attacking enemy", () => {
  const s = fixture(2),
    exhausted = s.heroes[0],
    sacked = s.heroes[1],
    immune = s.heroes[2],
    sentinel = ally(s, "01029", 1),
    enemy = make(s, "01097");
  exhausted.exhausted = true;
  sacked.attachments.push({ id: "sacked", code: "01108", exhausted: false });
  immune.immuneToPlayerEffects = true;
  enemy.immuneToPlayerEffects = true;
  assert.deepEqual(
    cityHoldLineDefenders(s, enemy).map((u) => u.id),
    [sentinel.id],
  );
});

test("Hold the Line skips its optional group payment if two spendable Tactics resources do not exist", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    defender = s.heroes[1];
  for (const h of s.heroes) h.resources = 0;
  ({ s } = attack(s));
  s = declare(s, event, [defender.id]);
  assert.equal(s.choice, null);
  assert.equal(get(s, defender.id)!.exhausted, true);
  assert.ok(s.discard.includes(HOLD));
});

test("Hold the Line can leave an attack undefended without enabling its Then ready payment", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    defender = s.heroes[1];
  ({ s } = attack(s));
  s = declare(s, event, []);
  assert.match(s.choice!.title, /Assign 2 damage/);
  s = select(s, defender.id);
  assert.equal(get(s, defender.id)!.damage, 2);
  assert.equal(get(s, defender.id)!.exhausted, false);
  assert.ok(s.discard.includes(HOLD));
});

test("Counter-spell consumes the played physical response and restores the original ordinary defender", () => {
  let s = fixture();
  const event = hand(s, HOLD),
    defender = s.heroes[1],
    bane = make(s, SHADOW_FLAME.bane);
  hand(s, "01013");
  bane.attachments.push({
    id: "hold-counter-spell",
    code: SHADOW_FLAME.counter,
    exhausted: false,
  });
  s.staging.push(bane);
  s.encounterDeck = ["01092"];
  ({ s } = attack(s, "01089", defender));
  s = select(s, event.id);
  assert.equal(s.choice, null);
  assert.equal(get(s, defender.id)!.exhausted, true);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.ok(s.discard.includes(HOLD));
  assert.ok(s.discard.includes("01013"));
  assert.ok(
    !get(s, bane.id)!.attachments.some((a) => a.id === "hold-counter-spell"),
  );
});

test("a saved immediate attack retains its attacked player and restores the interrupted combat after Hold the Line", () => {
  let s = fixture(2);
  const event = hand(s, HOLD, 1),
    defender = s.heroes[1],
    enemy = make(s, "01089");
  s.engaged.push(enemy);
  prepend(s, fx("immediateAttack", { target: enemy.id, player: 0 }));
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  s = select(s, defender.id);
  assert.match(s.choice!.title, /Hold the Line/);
  s = declare(s, event, [defender.id]);
  assert.equal(s.combat!.attackPlayer, 0);
  assert.equal(s.combat!.immediate, true);
  s = pay(s, [defender.id, defender.id]);
  assert.equal(get(s, defender.id)!.exhausted, false);
  assert.equal(s.phase, "planning");
  assert.equal(s.combat, null);
  assert.equal(get(s, enemy.id)!.attacked, false);
  assert.ok(seatView(s, 1).discard.includes(HOLD));
});
