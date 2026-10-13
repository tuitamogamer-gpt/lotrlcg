import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import {
  eligiblePayers,
  get,
  make,
  stats,
  fx,
  prepend,
} from "../src/game/core";
import { check, damage, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  COBAS_PLAYER as P,
  COBAS_PLAYER_CARDS,
} from "../src/game/cobas-player-support";
import {
  cobasPlayerFixture as fixture,
  cobasPlayerHand as hand,
  cobasPlayerAlly as ally,
  cobasPlayerAttach as attach,
} from "./cobas-player-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";
import { TEMPLE } from "../src/game/temple-support";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import type { GameState } from "../src/game/types";

const pick = (s: GameState, id: string) => choose(reload(s), id);
function skip(s: GameState) {
  for (let i = 0; i < 40 && s.choice; i++)
    s = pick(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options.find((o) => o.id === "continue")?.id ??
        s.choice.options[0].id,
    );
  return s;
}
function playKnife(s: GameState, player = 0) {
  const event = hand(s, P.knife);
  s = applyAction(s, { type: "PLAY", id: event.id });
  return pick(s, `player-${player}`);
}
test("Cobas preserves eleven original player designs and all 31 physical cards", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    COBAS_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.naasiyah),
    ),
  );
  assert.equal(COBAS_PLAYER_CARDS.length, 11);
  assert.equal(
    COBAS_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    31,
  );
  for (const c of COBAS_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Na'asiyah cannot fund allies with matching or gained icons but may pay attachments and events", () => {
  const s = fixture(),
    h = s.heroes[0];
  assert.ok(!eligiblePayers(s, card(P.veteran)).some((u) => u.id === h.id));
  assert.ok(!eligiblePayers(s, card(P.linhir)).some((u) => u.id === h.id));
  assert.ok(eligiblePayers(s, card(P.guard)).some((u) => u.id === h.id));
  assert.ok(eligiblePayers(s, card(P.knife)).some((u) => u.id === h.id));
  assert.ok(
    eligiblePayers(s, card(P.ioreth)).some((u) => u.id === h.id),
    "zero-cost sphere matching spends none of her resources",
  );
  const a = hand(s, P.veteran);
  assert.throws(
    () => applyAction(s, { type: "PLAY", id: a.id, payment: { [h.id]: 3 } }),
    /payment/i,
  );
});
test("Na'asiyah's real attack supports repeat paid boosts and removes exactly its own temporary statistics", () => {
  let s = fixture();
  s.phase = "attack";
  const h = s.heroes[0],
    enemy = make(s, "01089");
  s.engaged = [enemy];
  h.tempAttack = 1;
  const initial = h.resources;
  s = applyAction(s, {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [h.id],
  });
  assert.match(s.choice!.title, /Na'asiyah/);
  s = pick(s, "attack");
  s = pick(s, "attack");
  s = pick(s, "defense");
  assert.equal(stats(s, get(s, h.id)!).attack, 7);
  assert.equal(stats(s, get(s, h.id)!).defense, 4);
  s = pick(s, "continue");
  s = skip(s);
  assert.ok(!get(s, enemy.id));
  assert.equal(get(s, h.id)!.resources, initial - 3);
  assert.equal(get(s, h.id)!.tempAttack, 1);
  assert.equal(get(s, h.id)!.tempDefense, 0);
  assert.ok(!s.used.some((k) => k.startsWith("combat:cobas:")));
});
test("Na'asiyah defending survives a pending save and pays one defense boost for this attack", () => {
  let s = fixture();
  s.phase = "defense";
  const h = s.heroes[0],
    enemy = make(s, "01082");
  s.engaged = [enemy];
  enemy.shadows = [];
  s = applyAction(s, { type: "DEFEND", enemyId: enemy.id, defenderId: h.id });
  assert.match(s.choice!.title, /Na'asiyah/);
  s = pick(s, "defense");
  s = pick(s, "continue");
  s = skip(s);
  assert.equal(get(s, h.id)!.damage, 2);
  assert.equal(get(s, h.id)!.resources, 9);
  assert.equal(stats(s, get(s, h.id)!).defense, 2);
});
test("Na'asiyah exposes no unrelated free-standing combat boost action", () => {
  const s = fixture();
  assert.ok(
    !availableAbilities(s, s.heroes[0]).some((a) =>
      /\+2|combat/i.test(a.label),
    ),
  );
});
test("Veteran Sword-elf counts each copy in its controller's discard and follows control changes", () => {
  let s = fixture(2);
  const veteran = ally(s, P.veteran);
  s.discard = [P.veteran, P.veteran, "01023"];
  assert.equal(stats(s, veteran).attack, 3);
  assert.equal(stats(s, veteran).defense, 3);
  s.allies = s.allies.filter((u) => u.id !== veteran.id);
  veteran.controller = 1;
  forOwner(s, 1, () => {
    s.allies.push(veteran);
    s.discard = [P.veteran];
  });
  s = reload(s);
  assert.equal(stats(s, get(s, veteran.id)!).attack, 2);
  assert.equal(stats(s, get(s, veteran.id)!).defense, 2);
});
test("Knife-work snapshots affected enemies and its defense reduction expires at phase end", () => {
  let s = fixture();
  const enemy = make(s, "01082");
  s.engaged = [enemy];
  s = playKnife(s);
  s = pick(s, "skip");
  assert.equal(stats(s, get(s, enemy.id)!).defense, 2);
  const late = make(s, "01082");
  s.engaged.push(late);
  assert.equal(stats(s, late).defense, 3);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 3);
});
test("Knife-work permits shared Lore payment across seats and draws for the chosen player's real kill", () => {
  let s = fixture(2);
  s.phase = "attack";
  const h = s.heroes[1],
    enemy = make(s, "01089"),
    remote = seatView(s, 1).heroes[0];
  h.tempAttack = 5;
  s.engaged = [enemy];
  s = playKnife(s);
  s = pick(s, `pay-${h.id}-${remote.id}`);
  const before = s.hand.length;
  s = applyAction(s, {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [h.id],
  });
  s = skip(s);
  assert.equal(s.hand.length, before + 1);
  assert.ok(!get(s, enemy.id));
  assert.equal(get(s, remote.id)!.resources, 9);
  phaseEnd(s);
  flush(s);
  assert.ok(!s.used.some((k) => k.startsWith("phase:cobas-knife:")));
});
test("Knife-work draw excludes direct damage kills and the other player's attack", () => {
  let s = fixture(2);
  s.phase = "attack";
  const enemy = make(s, "01089");
  s.engaged = [enemy];
  s = playKnife(s);
  s = pick(s, `pay-${s.heroes[1].id}`);
  const before = s.hand.length;
  damage(s, enemy.id, 5);
  flush(s);
  s = skip(s);
  assert.equal(s.hand.length, before);
  const remoteEnemy = make(s, "01089");
  forOwner(s, 1, () => s.engaged.push(remoteEnemy));
  selectSeat(s, 1);
  s.table!.turn = 1;
  const h = s.heroes[0];
  h.tempAttack = 6;
  const remoteBefore = s.hand.length;
  s = skip(
    applyAction(s, {
      type: "ATTACK",
      enemyId: remoteEnemy.id,
      attackerIds: [h.id],
    }),
  );
  assert.equal(s.hand.length, remoteBefore);
});
test("Knife-work leaves immune enemies unchanged and does not complete its Then payment with a partial first effect", () => {
  let s = fixture();
  const enemy = make(s, "01082"),
    immune = make(s, TEMPLE.guardian);
  s.engaged = [enemy, immune];
  const initial = stats(s, immune).defense;
  s = playKnife(s);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 2);
  assert.equal(stats(s, get(s, immune.id)!).defense, initial);
  assert.equal(s.choice, null);
  assert.ok(!s.used.some((k) => k.startsWith("phase:cobas-knife:")));
});
test("Ioreth reuses the existing any-player action and charges only the triggering player's Lore hero", () => {
  let s = fixture(2);
  const ioreth = ally(s, P.ioreth),
    target = seatView(s, 1).heroes[0];
  target.damage = 2;
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = applyAction(s, { type: "ABILITY", id: ioreth.id });
  assert.ok(
    s.choice!.options.every((o) => s.heroes.some((h) => h.id === o.id)),
  );
  s = pick(s, target.id);
  s = pick(s, target.id);
  assert.equal(get(s, ioreth.id)!.exhausted, true);
  assert.equal(get(s, target.id)!.resources, 9);
  assert.equal(get(s, target.id)!.damage, 0);
});
test("Vigilant Guard and Windfola static stats and printed attachment restrictions are active", () => {
  const s = fixture(),
    h = s.heroes[0];
  const guard = hand(s, P.guard);
  assert.ok(playTargets(s, guard).some((u) => u.id === h.id));
  attach(s, h, P.guard);
  assert.equal(stats(s, h).health, 6);
  assert.ok(!playTargets(s, guard).some((u) => u.id === h.id));
  const wind = hand(s, P.windfola);
  assert.ok(playTargets(s, wind).some((u) => u.id === h.id));
  attach(s, h, P.windfola);
  assert.equal(stats(s, h).will, 2);
});

test("A remote Sentinel Na'asiyah spends her controller's pool and protects the attacked player", () => {
  let s = fixture(2);
  const h = s.heroes[0];
  s.heroes = s.heroes.filter((u) => u.id !== h.id);
  h.controller = 1;
  forOwner(s, 1, () => s.heroes.push(h));
  attach(s, h, "02117", 1);
  const enemy = make(s, "01082");
  s.engaged = [enemy];
  s.phase = "defense";
  s = applyAction(s, { type: "DEFEND", enemyId: enemy.id, defenderId: h.id });
  assert.equal(s.table!.active, 1);
  s = pick(s, "defense");
  s = skip(pick(s, "continue"));
  assert.equal(get(s, h.id)!.resources, 9);
  assert.equal(get(s, h.id)!.damage, 2);
  assert.equal(stats(s, get(s, h.id)!).defense, 2);
  assert.ok(
    !seatView(s, 1).used.some((key) => key.startsWith("combat:cobas:")),
  );
});

test("Knife-work's optional payment cannot be taken with only one group Lore resource", () => {
  let s = fixture(2);
  for (const h of allCharacters(s)) h.resources = 0;
  // One Tactics hero pays the event and one separate Lore resource remains.
  s.heroes[0].phaseResourceIcons = ["tactics"];
  s.heroes[0].resources = 1;
  const lore = seatView(s, 1).heroes[0];
  lore.phaseResourceIcons = ["lore"];
  lore.resources = 1;
  s.engaged = [make(s, "01082")];
  s = playKnife(s);
  assert.equal(s.choice, null);
  assert.equal(get(s, lore.id)!.resources, 1);
  assert.equal(stats(s, s.engaged[0]).defense, 2);
});

test("Counter-Spell cancels Knife-work after its resource cost and before any defense or draw effect", () => {
  let s = fixture();
  const enemy = make(s, "01082"),
    bane = make(s, SHADOW_FLAME.bane);
  s.engaged = [enemy];
  s.staging = [bane];
  attach(s, bane, SHADOW_FLAME.counter);
  s.encounterDeck = [SHADOW_FLAME.flame, "01099"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  const event = hand(s, P.knife);
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.equal(s.choice, null);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 3);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.ok(s.discard.includes(P.knife));
});

test("Knife-work lasts through its caster's elimination but still expires at phase end", () => {
  let s = fixture(2);
  const enemy = make(s, "01082");
  forOwner(s, 1, () => s.engaged.push(enemy));
  s = playKnife(s, 1);
  s = pick(s, `pay-${s.heroes[1].id}`);
  s.threat = 50;
  check(s);
  flush(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.ok(
    seatView(s, 0).used.some((key) => key.startsWith("phase:cobas-knife:")),
  );
  assert.equal(stats(s, get(s, enemy.id)!).defense, 2);
  phaseEnd(s);
  flush(s);
  assert.ok(
    !seatView(s, 0).used.some((key) => key.startsWith("phase:cobas-knife:")),
  );
  assert.equal(stats(s, get(s, enemy.id)!).defense, 3);
  reload(s);
});
