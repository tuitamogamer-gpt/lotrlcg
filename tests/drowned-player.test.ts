import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  needsTarget,
  playTargets,
  publicState,
} from "../src/game/engine";
import {
  engagementCost,
  get,
  make,
  questWill,
  stats,
  threatOf,
} from "../src/game/core";
import { enterAlly, nextRound, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import { questExhausts } from "../src/game/expansion-passives";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import { CARROCK } from "../src/game/carrock";
import { TEMPLE } from "../src/game/temple-support";
import {
  DROWNED_PLAYER as P,
  DROWNED_PLAYER_CARDS,
} from "../src/game/drowned-player-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import {
  drownedPlayerFixture as fixture,
  drownedPlayerHand as hand,
  drownedPlayerAlly as ally,
  drownedPlayerAttach as attach,
} from "./drowned-player-fixtures";
import type { GameState, Unit } from "../src/game/types";

const select = (s: GameState, id: string) => choose(reload(s), id);
function target(s: GameState, id: string) {
  for (let n = 0; n < 8 && !s.choice?.options.some((o) => o.id === id); n++) {
    assert.ok(
      s.choice?.options.some((o) => o.id === "use"),
      JSON.stringify(s.choice),
    );
    s = select(s, "use");
  }
  return select(s, id);
}
function settle(s: GameState) {
  for (let n = 0; n < 40 && s.choice; n++)
    s = select(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}
function play(s: GameState, code: string, recipient?: string) {
  const u = hand(s, code);
  return applyAction(s, { type: "PLAY", id: u.id, target: recipient });
}
function ability(s: GameState, u: Unit, attachmentId?: string) {
  return applyAction(s, { type: "ABILITY", id: u.id, attachmentId });
}

test("Drowned players preserve ten original identities, exact text and 28 physical cards", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    DROWNED_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.argalad),
    ),
  );
  assert.equal(DROWNED_PLAYER_CARDS.length, 10);
  assert.equal(
    DROWNED_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    28,
  );
  for (const c of DROWNED_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Argalad exhausts, snapshots current attack and reduces staging threat to zero with one damage", () => {
  let s = fixture();
  const hero = s.heroes[0],
    enemy = make(s, "01089");
  hero.tempAttack = 1;
  enemy.tempThreat = 1;
  s.staging = [enemy];
  s = ability(s, hero);
  s = target(s, enemy.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(threatOf(s, get(s, enemy.id)!), 0);
  assert.equal(get(s, enemy.id)!.damage, 1);
  get(s, hero.id)!.tempAttack = 5;
  assert.equal(
    get(s, enemy.id)!.tempThreat,
    -2,
    "the reduction keeps its original three attack magnitude",
  );
  s = reload(s);
  phaseEnd(s);
  flush(s);
  assert.equal(threatOf(s, get(s, enemy.id)!), 2);
});
test("Argalad's once-per-round physical limit survives readying, phase expiry and reload", () => {
  let s = fixture();
  const hero = s.heroes[0],
    enemy = make(s, "01082");
  s.staging = [enemy];
  s = target(ability(s, hero), enemy.id);
  phaseEnd(s);
  flush(s);
  get(s, hero.id)!.exhausted = false;
  s = reload(s);
  assert.ok(availableAbilities(s, get(s, hero.id)!).every((a) => a.disabled));
  assert.throws(
    () => ability(s, get(s, hero.id)!),
    /round|unavailable|already/i,
  );
  nextRound(s);
  flush(s);
  s = settle(s);
  assert.ok(availableAbilities(s, get(s, hero.id)!).some((a) => !a.disabled));
});
test("Argalad cannot target engaged or immune enemies, and a zero attack does not cause zero-threat damage", () => {
  let s = fixture();
  const hero = s.heroes[0],
    engaged = make(s, "01089"),
    immune = make(s, TEMPLE.guardian);
  s.engaged = [engaged];
  s.staging = [immune];
  assert.throws(() => ability(s, hero), /enemy|target|unavailable/i);
  const enemy = make(s, "01089");
  enemy.tempThreat = -2;
  s.staging = [enemy];
  hero.tempAttack = -2;
  s = target(ability(s, hero), enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 0);
});
test("Argalad does not damage an enemy whose reduced threat remains positive", () => {
  let s = fixture();
  const enemy = make(s, "01089");
  enemy.tempThreat = 3;
  s.staging = [enemy];
  s = target(ability(s, s.heroes[0]), enemy.id);
  assert.equal(threatOf(s, get(s, enemy.id)!), 3);
  assert.equal(get(s, enemy.id)!.damage, 0);
});
test("Dwarven Sellsword's real round-end payment can use a remote Leadership pool", () => {
  let s = fixture(2);
  const sword = ally(s, P.sellsword),
    payer = seatView(s, 1).heroes[0];
  attach(s, payer, "02010", 1);
  s.phase = "refresh";
  s = applyAction(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Sellsword/);
  const before = get(s, payer.id)!.resources;
  s = target(s, payer.id);
  assert.ok(get(s, sword.id));
  assert.equal(
    get(s, payer.id)!.resources,
    before,
    "one paid resource and the new round's one income net to zero",
  );
});
test("Each physical Sellsword has its own payment and declining discards the selected copy", () => {
  let s = fixture();
  const a = ally(s, P.sellsword),
    b = ally(s, P.sellsword);
  s.phase = "refresh";
  s = applyAction(s, { type: "NEXT" });
  s = select(s, "discard");
  assert.ok(!get(s, a.id));
  assert.ok(get(s, b.id));
  s = select(s, "discard");
  assert.ok(!get(s, b.id));
  assert.equal(s.discard.filter((c) => c === P.sellsword).length, 2);
});
test("Dunedain Remedy's paid attachment offers optional healing and retains the physical attachment", () => {
  let s = fixture();
  const hero = s.heroes[0],
    remedy = hand(s, P.remedy);
  hero.damage = 2;
  assert.ok(needsTarget(remedy));
  s = applyAction(s, { type: "PLAY", id: remedy.id, target: hero.id });
  assert.match(s.choice!.title, /Remedy/);
  s = select(s, "heal");
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(get(s, hero.id)!.attachments[0].id, remedy.id);
});
test("Remedy transfer pays from its old host, reaches another player's hero and can heal again after reload", () => {
  let s = fixture(2);
  const old = s.heroes[0],
    remote = seatView(s, 1).heroes[0],
    remedy = attach(s, old, P.remedy);
  remote.damage = 2;
  s = ability(s, old, remedy.id);
  s = target(s, remote.id);
  assert.equal(get(s, old.id)!.resources, 9);
  assert.ok(!get(s, old.id)!.attachments.length);
  assert.equal(get(s, remote.id)!.attachments[0].id, remedy.id);
  assert.equal(get(s, remote.id)!.attachments[0].owner, 0);
  s = select(s, "heal");
  assert.equal(get(s, remote.id)!.damage, 1);
});
test("Remedy cannot transfer to its current host or spend an empty host's pool", () => {
  let s = fixture();
  const old = s.heroes[0],
    remedy = attach(s, old, P.remedy);
  old.resources = 0;
  assert.throws(() => ability(s, old, remedy.id), /resource|unavailable/i);
  old.resources = 1;
  s = ability(s, old, remedy.id);
  assert.ok(!s.choice!.options.some((o) => o.id === old.id));
});
test("Remedy's healing can be declined independently from successful attachment", () => {
  let s = fixture();
  const hero = s.heroes[0];
  hero.damage = 2;
  s = play(s, P.remedy, hero.id);
  s = select(s, "skip");
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === P.remedy));
});
test("Marksman entering play reduces an enemy's defense across phases, then expires next round", () => {
  let s = fixture(2);
  const enemy = make(s, "01082");
  forOwner(s, 1, () => s.engaged.push(enemy));
  s = play(s, P.marksman);
  s = target(s, enemy.id);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 1);
  phaseEnd(s);
  flush(s);
  s = reload(s);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 1);
  nextRound(s);
  flush(s);
  s = settle(s);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 3);
});
test("Marksman also responds to put-into-play entry, stacking reductions and flooring defense at zero", () => {
  let s = fixture();
  const enemy = make(s, "01082");
  s.staging = [enemy];
  enterAlly(s, make(s, P.marksman), false, false, false);
  flush(s);
  s = target(s, enemy.id);
  enterAlly(s, make(s, P.marksman), false, false, false);
  flush(s);
  s = target(s, enemy.id);
  assert.equal(stats(s, get(s, enemy.id)!).defense, 0);
});
test("Marksman excludes immune enemies and declining preserves defense", () => {
  let s = fixture();
  const immune = make(s, TEMPLE.guardian),
    enemy = make(s, "01082");
  s.staging = [immune, enemy];
  s = play(s, P.marksman);
  if (s.choice!.options.some((o) => o.id === "use")) s = select(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.id === immune.id));
  s = select(s, "skip");
  assert.equal(stats(s, get(s, enemy.id)!).defense, 3);
});
test("Woodland Courier's paid play places two Forest progress and explores through normal rules", () => {
  let s = fixture();
  const forest = make(s, "01099");
  forest.progress = 1;
  s.staging = [forest];
  s = target(play(s, P.courier), forest.id);
  assert.ok(!get(s, forest.id));
  assert.ok(s.encounterDiscard.includes(forest.code));
});
test("Woodland Courier puts one progress on a non-Forest active location and excludes immune locations", () => {
  let s = fixture();
  const location = make(s, "01088"),
    immune = make(s, CARROCK.carrock);
  s.activeLocation = location;
  s.staging = [immune];
  enterAlly(s, make(s, P.courier), false, false, false);
  flush(s);
  s = select(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.id === immune.id));
  s = select(s, location.id);
  assert.equal(get(s, location.id)!.progress, 1);
});
test("Hithlain attaches to a physical location, enforces its limit and responds to a played Silvan", () => {
  let s = fixture();
  const location = make(s, "01100"),
    rope = hand(s, P.hithlain);
  s.staging = [location];
  assert.ok(playTargets(s, rope).some((u) => u.id === location.id));
  s = applyAction(s, { type: "PLAY", id: rope.id, target: location.id });
  const second = hand(s, P.hithlain);
  assert.ok(!playTargets(s, second).some((u) => u.id === location.id));
  s = play(s, P.marksman);
  assert.match(s.choice!.title, /Hithlain/);
  s = select(s, "progress");
  assert.equal(get(s, location.id)!.progress, 1);
});
test("Hithlain responds to another player's play from hand, but not Silvan put into play", () => {
  let s = fixture(2);
  const location = make(s, "01100");
  s.staging = [location];
  attach(s, location, P.hithlain, 0);
  enterAlly(s, make(s, P.marksman), false, false, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(location.progress, 0);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = play(s, P.marksman);
  assert.match(s.choice!.title, /Hithlain/);
  s = select(s, "progress");
  assert.equal(get(s, location.id)!.progress, 1);
});
test("Hithlain never responds to a non-Silvan play and can explore its attached location", () => {
  let s = fixture();
  const location = make(s, "01099");
  location.progress = 2;
  s.staging = [location];
  attach(s, location, P.hithlain);
  s = play(s, P.sellsword);
  assert.equal(s.choice, null);
  s = play(s, P.marksman);
  s = select(s, "progress");
  assert.ok(!get(s, location.id));
  assert.ok(s.discard.includes(P.hithlain));
});
test("Robin's travel response accepts any player's Spirit payment and lasts through the round", () => {
  let s = fixture(2);
  ally(s, P.robin);
  const enemy = make(s, "01089"),
    remoteEnemy = make(s, "01082"),
    location = make(s, "01088"),
    payer = seatView(s, 1).heroes[0];
  s.staging = [enemy, location];
  forOwner(s, 1, () => s.engaged.push(remoteEnemy));
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: location.id });
  assert.match(s.choice!.title, /Robin/);
  s = target(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, 9);
  for (const e of [enemy, remoteEnemy])
    assert.equal(
      engagementCost(s, get(s, e.id)!),
      card(e.code).engagement! + card(location.code).quest!,
    );
  phaseEnd(s);
  flush(s);
  s = reload(s);
  assert.equal(
    engagementCost(s, get(s, enemy.id)!),
    card(enemy.code).engagement! + card(location.code).quest!,
  );
  s.phase = "refresh";
  s = settle(applyAction(s, { type: "NEXT" }));
  assert.equal(
    engagementCost(s, get(s, enemy.id)!),
    card(enemy.code).engagement,
  );
});
test("Robin's declined response spends nothing and moving a location into play is not travel", () => {
  let s = fixture();
  ally(s, P.robin);
  const enemy = make(s, "01089"),
    location = make(s, "01088");
  s.staging = [enemy, location];
  s.activeLocation = s.staging.pop()!;
  assert.equal(s.choice, null);
  assert.equal(engagementCost(s, enemy), 10);
  s.staging.push(s.activeLocation);
  s.activeLocation = null;
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: location.id });
  s = select(s, "skip");
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [10, 10, 10],
  );
  assert.equal(engagementCost(s, get(s, enemy.id)!), 10);
});
test("Interrogation requires a real attached Trap and uses printed threat rather than current threat", () => {
  let s = fixture();
  const enemy = make(s, "01089"),
    event = hand(s, P.interrogation);
  s.staging = [enemy];
  assert.match(canPlay(s, event) ?? "", /Trap|enemy/i);
  attach(s, enemy, "01069");
  enemy.tempThreat = -2;
  s.encounterDeck = ["01099", "01089", "01100"];
  s = applyAction(s, { type: "PLAY", id: event.id, target: enemy.id });
  assert.equal(s.choice!.options.filter((o) => o.code).length, 2);
  assert.ok(
    publicState(s).choice!.options.some((o) =>
      o.label.includes(card("01089").name),
    ),
  );
  const discard = s.choice!.options.find((o) => o.code === "01089")!;
  s = select(s, discard.id);
  assert.deepEqual(s.encounterDeck, ["01099", "01100"]);
  assert.deepEqual(s.encounterDiscard, ["01089"]);
});
test("Interrogation can decline discarding and preserves the original deck order after reload", () => {
  let s = fixture();
  const enemy = make(s, "01089");
  s.staging = [enemy];
  attach(s, enemy, "01069");
  s.encounterDeck = ["01099", "01100", "01089"];
  s = play(s, P.interrogation, enemy.id);
  s = select(s, "none");
  assert.deepEqual(s.encounterDeck, ["01099", "01100", "01089"]);
  assert.deepEqual(s.encounterDiscard, []);
});
test("Interrogation discards exactly one selected physical index among duplicate card codes", () => {
  let s = fixture();
  const enemy = make(s, "01089");
  s.staging = [enemy];
  attach(s, enemy, "01069");
  s.encounterDeck = ["01099", "01099", "01100"];
  s = play(s, P.interrogation, enemy.id);
  const options = s.choice!.options.filter((o) => o.code === "01099");
  assert.equal(options.length, 2);
  assert.notEqual(options[0].id, options[1].id);
  s = select(s, options[1].id);
  assert.deepEqual(s.encounterDeck, ["01099", "01100"]);
  assert.deepEqual(s.encounterDiscard, ["01099"]);
});
test("Interrogation looks only at available cards and never reshuffles encounter discard to fill X", () => {
  let s = fixture();
  const enemy = make(s, "01089");
  s.staging = [enemy];
  attach(s, enemy, "01069");
  s.encounterDeck = ["01099"];
  s.encounterDiscard = ["01100"];
  s = play(s, P.interrogation, enemy.id);
  assert.equal(s.choice!.options.filter((o) => o.code).length, 1);
  s = select(s, "none");
  assert.deepEqual(s.encounterDeck, ["01099"]);
  assert.deepEqual(s.encounterDiscard, ["01100"]);
});
test("Strider's hero and total-character thresholds operate independently", () => {
  const s = fixture(),
    hero = s.heroes[0];
  attach(s, hero, P.strider);
  assert.equal(stats(s, hero).will, card(hero.code).willpower! + 2);
  assert.equal(questExhausts(s, hero), true);
  s.heroes.pop();
  assert.equal(questExhausts(s, hero), false);
  for (let n = 0; n < 4; n++) ally(s, "01020");
  assert.equal(stats(s, hero).will, card(hero.code).willpower);
  assert.equal(questExhausts(s, hero), false);
});
test("Strider's normal paid play and actual commitment keep a two-hero bearer ready", () => {
  let s = fixture();
  s.heroes.pop();
  s.startingHeroes = s.heroes.map((h) => h.code);
  const hero = s.heroes[0];
  s = play(s, P.strider, hero.id);
  s.phase = "quest";
  s = applyAction(s, { type: "TOGGLE_QUEST", id: hero.id });
  s = applyAction(s, { type: "COMMIT" });
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, false);
  reload(s);
});
test("Strider follows the remote bearer’s controller while retaining the original physical owner", () => {
  const s = fixture(2);
  s.heroes.pop();
  const remote = seatView(s, 1).heroes[0];
  attach(s, remote, P.strider, 0);
  for (let n = 0; n < 3; n++) ally(s, "01020", 1);
  assert.equal(questExhausts(s, remote), true);
  assert.equal(stats(s, remote).will, card(remote.code).willpower);
  seatView(s, 1).heroes.pop();
  assert.equal(questExhausts(s, remote), false);
  assert.equal(stats(s, remote).will, card(remote.code).willpower! + 2);
  assert.equal(remote.attachments[0].owner, 0);
});

test("Battle-fury is only playable before staging, with a ready controlled hero and legal attack", () => {
  const s = fixture(2),
    event = hand(s, P.fury),
    hero = s.heroes[0],
    enemy = make(s, "01082");
  s.engaged = [enemy];
  assert.match(canPlay(s, event) ?? "", /staging|quest/i);
  s.phase = "quest";
  assert.equal(canPlay(s, event), null);
  assert.ok(playTargets(s, event).some((u) => u.id === hero.id));
  assert.ok(
    !playTargets(s, event).some((u) =>
      seatView(s, 1).heroes.some((h) => h.id === u.id),
    ),
  );
  s.phase = "staging";
  assert.match(canPlay(s, event) ?? "", /staging|quest/i);
  s.phase = "quest";
  s.engaged = [];
  s.staging = [enemy];
  assert.match(canPlay(s, event) ?? "", /ready|eligible|target/i);
});
test("Battle-fury exhausts its paid hero, resolves a real attack, then uses group Spirit to commit it", () => {
  let s = fixture(2);
  s.phase = "quest";
  const hero = s.heroes[0],
    enemy = make(s, "01089"),
    payer = seatView(s, 1).heroes[0];
  s.engaged = [enemy];
  s = play(s, P.fury, hero.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(get(s, hero.id)!.committed, false);
  s = target(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.match(s.choice!.title, /Spirit/);
  s = target(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, 9);
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.ok(s.discard.includes(P.fury));
  assert.equal(questWill(s), stats(s, get(s, hero.id)!).will);
  s = applyAction(s, { type: "COMMIT" });
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, true);
});
test("Battle-fury declining its Then cost leaves a successful attacker exhausted and uncommitted", () => {
  let s = fixture();
  s.phase = "quest";
  const hero = s.heroes[0],
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s = target(play(s, P.fury, hero.id), enemy.id);
  const resources = s.heroes.map((h) => h.resources);
  s = select(s, "skip");
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(get(s, hero.id)!.committed, false);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    resources,
  );
});
test("Battle-fury supports an eligible Ranged hero against another player's engaged enemy", () => {
  let s = fixture(2);
  s.phase = "quest";
  const hero = s.heroes[0],
    enemy = make(s, "01089");
  forOwner(s, 1, () => s.engaged.push(enemy));
  s = target(play(s, P.fury, hero.id), enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  s = select(s, "skip");
  assert.equal(get(s, hero.id)!.exhausted, true);
});
test("Battle-fury's Then commitment remains available after its attack destroys the enemy", () => {
  let s = fixture();
  s.phase = "quest";
  const hero = s.heroes[0],
    enemy = make(s, "01083");
  s.engaged = [enemy];
  s = target(play(s, P.fury, hero.id), enemy.id);
  assert.ok(!get(s, enemy.id));
  s = target(s, s.heroes[1].id);
  assert.equal(get(s, hero.id)!.committed, true);
});

test("Battle-fury pays resource and hero exhaustion costs before Counter-Spell cancels the attack", () => {
  let s = fixture();
  s.phase = "quest";
  const hero = s.heroes[0],
    enemy = make(s, "01089"),
    bane = make(s, SHADOW_FLAME.bane);
  s.engaged = [enemy];
  s.staging = [bane];
  attach(s, bane, SHADOW_FLAME.counter);
  s.encounterDeck = [SHADOW_FLAME.flame, "01099"];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, P.fury, hero.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(get(s, hero.id)!.committed, false);
  assert.equal(get(s, enemy.id)!.damage, 0);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(P.fury));
  assert.ok(s.encounterDiscard.includes(SHADOW_FLAME.counter));
});

test("Battle-fury triggers Aragorn's actual commitment response once and framework COMMIT never repeats it", () => {
  let s = fixture();
  s.phase = "quest";
  const hero = s.heroes[1],
    enemy = make(s, "01082");
  s.engaged = [enemy];
  s = target(play(s, P.fury, hero.id), enemy.id);
  s = target(s, s.heroes[0].id);
  assert.match(s.choice!.title, /Aragorn/);
  s = select(s, "ready");
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, false);
  const before = get(s, hero.id)!.resources;
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.equal(get(s, hero.id)!.committed, true);
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.equal(get(s, hero.id)!.resources, before);
  assert.ok(!s.choice?.title.includes("Aragorn"));
  assert.equal(
    s.queue.some((e) => e.kind === "aragorn"),
    false,
  );
});

test("Interrogation looking at the whole deck in the quest phase never causes premature encounter refill", () => {
  let s = fixture();
  s.phase = "quest";
  const enemy = make(s, "01089");
  s.staging = [enemy];
  attach(s, enemy, "01069");
  s.encounterDeck = ["01099"];
  s.encounterDiscard = ["01100"];
  s = play(s, P.interrogation, enemy.id);
  assert.equal(s.choice!.options.filter((o) => o.code).length, 1);
  assert.deepEqual(s.encounterDeck, ["01099"]);
  assert.deepEqual(s.encounterDiscard, ["01100"]);
  s = select(s, "none");
  assert.deepEqual(s.encounterDeck, ["01099"]);
  assert.deepEqual(s.encounterDiscard, ["01100"]);
});
