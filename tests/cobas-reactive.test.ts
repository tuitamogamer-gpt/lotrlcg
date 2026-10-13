import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import { fx, get, make, prepend, stats } from "../src/game/core";
import { damage, removeFromQuest } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  readDamageContext,
  encodeDamageContext,
} from "../src/game/damage-context";
import { activeSeat, seatView } from "../src/game/table";
import { KHAZAD } from "../src/game/khazad-dum";
import { TEMPLE } from "../src/game/temple-support";
import { MORGUL_VALE } from "../src/game/morgul-vale-support";
import { COBAS_PLAYER as P } from "../src/game/cobas-player-support";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import {
  drownedPlayerFixture as fixture,
  drownedPlayerHand as hand,
  drownedPlayerAttach as attach,
} from "./drowned-player-fixtures";
import type { GameState } from "../src/game/types";

const select = (s: GameState, id: string) => choose(reload(s), id);
function settle(s: GameState) {
  for (let n = 0; n < 50 && s.choice; n++)
    s = select(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}
function play(s: GameState, code: string, target?: string) {
  const card = hand(s, code);
  return applyAction(s, { type: "PLAY", id: card.id, target });
}

test("Rune-master attaches only to a Ranger or Leadership hero", () => {
  const s = fixture(),
    rune = hand(s, P.rune);
  s.heroes[0].code = "04053";
  for (const h of s.heroes) delete h.phaseResourceIcons;
  assert.deepEqual(
    playTargets(s, rune).map((u) => u.id),
    s.heroes.slice(0, 2).map((u) => u.id),
  );
});
test("Rune-master responds to a Signal attached to another hero and its optional payment survives reload", () => {
  let s = fixture();
  const bearer = s.heroes[1],
    recipient = s.heroes[2],
    rune = attach(s, bearer, P.rune);
  s = play(s, "02002", recipient.id);
  assert.match(s.choice!.title, /Rune-master/);
  const before = get(s, recipient.id)!.resources,
    bearerBefore = get(s, bearer.id)!.resources;
  s = select(s, "use");
  assert.equal(get(s, recipient.id)!.resources, before + 1);
  assert.equal(
    get(s, bearer.id)!.attachments.find((a) => a.id === rune.id)!.exhausted,
    true,
  );
  assert.equal(
    get(s, bearer.id)!.resources,
    bearerBefore,
    "resource goes to the Signal's hero, not Rune-master's bearer",
  );
});
test("Rune-master can decline and does not trigger for ordinary attachments", () => {
  let s = fixture();
  const host = s.heroes[1],
    rune = attach(s, host, P.rune);
  s = play(s, "02002", host.id);
  s = select(s, "skip");
  assert.equal(
    get(s, host.id)!.attachments.find((a) => a.id === rune.id)!.exhausted,
    false,
  );
  s = play(s, "01040", host.id);
  assert.equal(s.choice, null);
});
test("Rune-master follows a Signal's paid self-transfer to a remote hero", () => {
  let s = fixture(2);
  const host = s.heroes[1],
    remote = seatView(s, 1).heroes[0],
    rune = attach(s, host, P.rune),
    signal = attach(s, host, "02002");
  const before = remote.resources;
  s = applyAction(s, { type: "ABILITY", id: host.id, attachmentId: signal.id });
  s = select(s, remote.id);
  assert.match(s.choice!.title, /Rune-master/);
  s = select(s, "use");
  assert.equal(get(s, remote.id)!.resources, before + 1);
  assert.equal(
    get(s, remote.id)!.attachments.some((a) => a.id === signal.id),
    true,
  );
  assert.equal(
    get(s, host.id)!.attachments.find((a) => a.id === rune.id)!.exhausted,
    true,
  );
});

function defendFixture(players = 1) {
  const s = fixture(players),
    enemy = make(s, "01089");
  s.phase = "defense";
  s.engaged = [enemy];
  enemy.shadows = ["01090"];
  const event = hand(s, P.terrible);
  return { s, enemy, event };
}
test("Terrible to Behold is response-only and returns an engaged attacker before canceling damage and shadows", () => {
  let { s, enemy, event } = defendFixture();
  const defender = s.heroes[1];
  assert.match(canPlay(s, event)!, /response window/);
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  assert.match(s.choice!.title, /Terrible to Behold/);
  s = select(s, event.id);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(s.engaged.length, 0);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, defender.id)!.exhausted, true);
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
  assert.ok(s.discard.includes(P.terrible));
  assert.ok(s.encounterDiscard.includes("01090"));
});
test("Terrible to Behold does not offer after a non-Noble defender or an undefended attack", () => {
  for (const defended of [true, false]) {
    let { s, enemy } = defendFixture();
    s = applyAction(s, {
      type: "DEFEND",
      enemyId: enemy.id,
      ...(defended ? { defenderId: s.heroes[0].id } : {}),
    });
    assert.ok(!s.choice?.title.includes("Terrible to Behold"));
    assert.ok(s.hand.some((u) => u.code === P.terrible));
  }
});
test("Terrible to Behold cannot cancel by returning an enemy already in staging", () => {
  let { s, enemy } = defendFixture();
  s.engaged = [];
  s.staging = [enemy];
  prepend(
    s,
    fx("cobasTerribleOffer", { target: enemy.id, ids: [s.heroes[1].id] }),
  );
  flush(s);
  assert.equal(
    s.choice,
    null,
    "an enemy already in staging cannot be returned, so Then cannot cancel",
  );
});
test("Terrible to Behold respects printed immunity", () => {
  const { s, enemy } = defendFixture();
  enemy.code = TEMPLE.guardian;
  s.combat = { enemyId: enemy.id, defenderId: s.heroes[1].id, attackBonus: 0 };
  prepend(
    s,
    fx("cobasTerribleOffer", { target: enemy.id, ids: [s.heroes[1].id] }),
  );
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.hand.some((h) => h.code === P.terrible));
});
test("The remote Sentinel's controller may play Terrible to Behold for that Noble defender", () => {
  let { s, enemy } = defendFixture(2);
  s.hand = [];
  s.heroes[1].code = "01012";
  const defender = seatView(s, 1).heroes[0];
  defender.code = "01001";
  const event = hand(s, P.terrible, 1);
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  assert.equal(activeSeat(s), 1);
  assert.match(s.choice!.title, /Terrible to Behold/);
  s = select(s, event.id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(seatView(s, 1).discard.includes(P.terrible));
  assert.equal(get(s, defender.id)!.damage, 0);
});
test("Another player's Terrible to Behold cannot respond for a remote Noble Sentinel", () => {
  let { s, enemy } = defendFixture(2);
  s.heroes[1].code = "01012";
  const defender = seatView(s, 1).heroes[0];
  defender.code = "01001";
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  assert.ok(!s.choice?.title.includes("Terrible to Behold"));
  assert.ok(seatView(s, 0).hand.some((h) => h.code === P.terrible));
});
test("Terrible to Behold cannot cancel an attack when the active Morgul captain cannot leave engagement", () => {
  const s = base("the-morgul-vale"),
    captain = make(s, MORGUL_VALE.murzag);
  s.engaged = [captain];
  s.combat = {
    enemyId: captain.id,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
  };
  hand(s, P.terrible);
  prepend(
    s,
    fx("cobasTerribleOffer", { target: captain.id, ids: [s.heroes[0].id] }),
  );
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.engaged.some((u) => u.id === captain.id));
});

test("Vigilant Guard gives a Warrior two hit points with a per-character attachment limit", () => {
  const s = fixture(),
    host = s.heroes[2],
    guard = hand(s, P.guard);
  assert.ok(playTargets(s, guard).some((u) => u.id === host.id));
  const before = stats(s, host).health;
  attach(s, host, P.guard);
  assert.equal(stats(s, host).health, before + 2);
  assert.ok(!playTargets(s, guard).some((u) => u.id === host.id));
});
test("Vigilant Guard redirects exactly one damage and preserves the original remaining assignment", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard);
  assert.equal(damage(s, victim.id, 3), false);
  flush(s);
  assert.match(s.choice!.title, /Vigilant Guard/);
  s = select(s, guard.id);
  assert.equal(get(s, bearer.id)!.damage, 1);
  assert.equal(get(s, victim.id)!.damage, 2);
  assert.ok(!s.used.some((key) => key.startsWith("cobas-guard:")));
  assert.equal(s.choice, null);
});
test("Vigilant Guard decline assigns all damage and a new assignment can respond again", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard);
  damage(s, victim.id, 1);
  flush(s);
  s = select(s, "skip");
  assert.equal(get(s, victim.id)!.damage, 1);
  damage(s, victim.id, 1);
  flush(s);
  s = select(s, guard.id);
  assert.equal(get(s, victim.id)!.damage, 1);
  assert.equal(get(s, bearer.id)!.damage, 1);
});
test("Vigilant Guard has no phase cap and may absorb a point from each distinct damage assignment", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard);
  for (let n = 0; n < 2; n++) {
    damage(s, victim.id, 1);
    flush(s);
    s = select(s, guard.id);
  }
  assert.equal(get(s, victim.id)!.damage, 0);
  assert.equal(get(s, bearer.id)!.damage, 2);
});
test("Two Vigilant Guards can respond to distinct recipients while repeated recipient redirects cannot cycle", () => {
  let s = fixture(2);
  const victim = s.heroes[0],
    first = s.heroes[2],
    second = seatView(s, 1).heroes[0];
  const a = attach(s, first, P.guard),
    b = attach(s, second, P.guard, 1);
  damage(s, victim.id, 3);
  flush(s);
  s = select(s, a.id);
  assert.match(s.choice!.title, /Vigilant Guard/);
  s = select(s, b.id);
  // A can now respond to B's new assignment. Returning to A then stops:
  // B already responded to this recipient in the same damage chain.
  s = select(s, a.id);
  // B has not yet responded to the original victim's separate remainder.
  s = select(s, b.id);
  assert.equal(s.choice, null);
  assert.equal(get(s, first.id)!.damage, 1);
  assert.equal(get(s, second.id)!.damage, 1);
  assert.equal(get(s, victim.id)!.damage, 1);
  assert.ok(
    s.table!.seats.every(
      (seat) => !seat.used.some((key) => key.startsWith("cobas-guard:")),
    ),
  );
});
test("Vigilant Guard cannot replace costs or damage assigned to its own character", () => {
  const s = fixture(),
    victim = s.heroes[0],
    bearer = s.heroes[2];
  attach(s, bearer, P.guard);
  assert.equal(damage(s, victim.id, 1, { cost: true }), true);
  assert.equal(damage(s, bearer.id, 1), true);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(victim.damage, 1);
  assert.equal(bearer.damage, 1);
});
test("Vigilant Guard's pending branch keeps combat, Then, fate and replacement context through save", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard);
  const context = {
    enemyId: "attacker",
    combatDamage: true,
    drownedThenToken: "receipt",
    fateBottomOnDestroy: true,
    mockingVisited: [victim.id],
    bypassFrodo: true,
  };
  damage(s, victim.id, 2, context);
  flush(s);
  s = reload(s);
  const encoded = s.choice!.options.find((o) => o.id === guard.id)!.effects[0];
  const decoded = readDamageContext(encoded);
  assert.deepEqual(
    { ...decoded, cobasGuardToken: undefined },
    { ...context, cobasGuardToken: undefined },
  );
  assert.equal(typeof decoded.cobasGuardToken, "string");
  s = select(s, guard.id);
  assert.equal(get(s, victim.id)!.damage, 1);
  assert.equal(get(s, bearer.id)!.damage, 1);
  assert.deepEqual(
    readDamageContext({
      text: encodeDamageContext({ cost: true, cobasGuardToken: "g1" }),
    }),
    { cost: true, cobasGuardToken: "g1" },
  );
});
test("Vigilant Guard's diverted point is fresh attachment damage while the remainder remains enemy combat damage", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard),
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s.combat = {
    enemyId: enemy.id,
    defenderId: victim.id,
    attackBonus: 0,
    damageDealt: 0,
  };
  bearer.shadowCancelsCombatDamage = true;
  damage(s, victim.id, 2, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  s = select(s, guard.id);
  assert.equal(
    get(s, bearer.id)!.damage,
    1,
    "combat-only prevention cannot cancel the attachment's new damage source",
  );
  assert.equal(get(s, victim.id)!.damage, 1);
  assert.equal(
    s.combat!.damageDealt,
    1,
    "the enemy dealt only the unreassigned point",
  );
});
test("Vigilant Guard preserves Hill Troll excess damage on the reduced original recipient", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard),
    troll = make(s, "01082");
  s.phase = "defense";
  s.engaged = [troll];
  victim.damage = stats(s, victim).health - 1;
  const expectedExcess = Math.max(
      0,
      stats(s, troll).attack - stats(s, victim).defense - 1 - 1,
    ),
    before = s.threat;
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: troll.id,
    defenderId: victim.id,
  });
  assert.match(s.choice!.title, /Vigilant Guard/);
  s = select(s, guard.id);
  s = settle(s);
  assert.equal(get(s, bearer.id)!.damage, 1);
  assert.equal(s.threat, before + expectedExcess);
  assert.equal(get(s, victim.id), undefined);
});
test("Vigilant Guard allows fresh prevention on the redirected attachment damage", () => {
  let s = fixture();
  const victim = s.heroes[0],
    bearer = s.heroes[2],
    guard = attach(s, bearer, P.guard);
  bearer.roundCannotTakeDamage = true;
  damage(s, victim.id, 2);
  flush(s);
  s = select(s, guard.id);
  assert.equal(get(s, bearer.id)!.damage, 0);
  assert.equal(get(s, victim.id)!.damage, 1);
});

test("Windfola grants willpower and recommits an exhausted hero after generic removal during staging", () => {
  let s = fixture();
  const hero = s.heroes[1],
    a = attach(s, hero, P.windfola);
  s.phase = "staging";
  hero.committed = true;
  hero.exhausted = true;
  assert.equal(stats(s, hero).will, 3);
  prepend(s, fx("uncommit", { target: hero.id }));
  flush(s);
  assert.match(s.choice!.title, /Windfola/);
  s = select(s, "use");
  s = settle(s);
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(
    get(s, hero.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
});
test("Windfola's response belongs to the remote hero's controller and does not require exhausting that hero", () => {
  let s = fixture(2);
  const hero = seatView(s, 1).heroes[0],
    a = attach(s, hero, P.windfola, 0);
  attach(s, hero, KHAZAD.fear, 1);
  s.phase = "staging";
  hero.committed = true;
  hero.exhausted = true;
  removeFromQuest(s, hero);
  flush(s);
  assert.equal(activeSeat(s), 1);
  s = select(s, "use");
  s = settle(s);
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(
    get(s, hero.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
});
test("Windfola does not respond to a character that was not committed, and an exhausted copy cannot respond twice", () => {
  let s = fixture();
  const hero = s.heroes[1],
    a = attach(s, hero, P.windfola);
  s.phase = "staging";
  removeFromQuest(s, hero);
  flush(s);
  assert.equal(s.choice, null);
  hero.committed = true;
  removeFromQuest(s, hero);
  flush(s);
  s = select(s, "use");
  s = settle(s);
  removeFromQuest(s, get(s, hero.id)!);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(get(s, hero.id)!.committed, false);
  assert.equal(
    get(s, hero.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
});
test("Windfola does not respond to refresh cleanup", () => {
  const s = fixture(),
    hero = s.heroes[1];
  attach(s, hero, P.windfola);
  hero.committed = true;
  prepend(s, fx("refreshReady"));
  flush(s);
  assert.ok(!s.choice?.title.includes("Windfola"));
  assert.equal(hero.committed, false);
});
