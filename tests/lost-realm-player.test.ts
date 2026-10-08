import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import {
  optionalEngagementProblem,
  commitCharacters,
} from "../src/game/actions";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import { get, make, playCost, stats, threatOf } from "../src/game/core";
import {
  damage,
  destroy,
  engage,
  enterAlly,
  phaseEnd,
} from "../src/game/board";
import { resolvePlayerAttack } from "../src/game/combat";
import { flush } from "../src/game/effects";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support";
import { THARBAD as T } from "../src/game/tharbad-support";
import {
  realmDefensePenalty,
  realmWillProtected,
  REALM_ATTACKS_STARTED,
} from "../src/game/lost-realm-player";
import type { GameState, Unit } from "../src/game/types";

function fixture(players = 1) {
  const s = base("mirkwood", players);
  s.heroes = [make(s, "09001"), make(s, "09002"), make(s, "01012")];
  s.startingHeroes = s.heroes.map((h) => h.code);
  for (const p of playerOrder(s))
    forOwner(s, p, () =>
      s.heroes.forEach((h) => {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "lore", "spirit"];
      }),
    );
  return s;
}
function attach(s: GameState, u: Unit, code: string, owner = activeSeat(s)) {
  const a = { id: `a${s.nextId++}`, code, owner, exhausted: false };
  u.attachments.push(a);
  return a;
}
function play(s: GameState, code: string, target?: string) {
  const u = make(s, code);
  s.hand.push(u);
  return applyAction(s, { type: "PLAY", id: u.id, target });
}
function ability(s: GameState, u: Unit, id: string) {
  return applyAction(s, { type: "ABILITY", id: u.id, attachmentId: id });
}

test("Lost Realm registers eleven new original designs with local art and keeps unsupported frameworks gated", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13]) {
    const code = `09${String(n).padStart(3, "0")}`;
    assert.ok(SCRIPTED.has(code), code);
    assert.equal(card(code).pack_name, "The Lost Realm");
    assert.match(imageUrl(card(code)), /^\/cards\//);
  }
  for (const code of ["09014"]) assert.ok(!SCRIPTED.has(code), code);
});
test("Aragorn reduces only enemies engaged with his controller and honors immunity and blanking", () => {
  const s = fixture(2),
    own = make(s, "01082"),
    other = make(s, "01082"),
    staging = make(s, "01082");
  s.engaged.push(own);
  forOwner(s, 1, () => s.engaged.push(other));
  s.staging.push(staging);
  assert.equal(stats(s, own).defense, 2);
  assert.equal(stats(s, other).defense, 3);
  assert.equal(stats(s, staging).defense, 3);
  own.immuneToPlayerEffects = true;
  assert.equal(realmDefensePenalty(s, own), 0);
  own.immuneToPlayerEffects = false;
  s.heroes[0].blanked = true;
  assert.equal(realmDefensePenalty(s, own), 0);
});
test("Aragorn may engage another player's enemy after participating in an actual killing attack", () => {
  let s = fixture(2);
  s.phase = "attack";
  const a = s.heroes[0],
    victim = make(s, "01096"),
    other = make(s, "01096");
  victim.damage = 2;
  s.engaged.push(victim);
  forOwner(s, 1, () => s.engaged.push(other));
  resolvePlayerAttack(s, victim, [a.id], 0);
  flush(s);
  assert.match(s.choice!.title, /Aragorn/);
  s = choose(reload(s), other.id);
  assert.ok(s.engaged.some((u) => u.id === other.id));
  assert.equal(seatView(s, 1).engaged.length, 0);
});
test("direct damage and a killing attack without Aragorn do not trigger his response", () => {
  const s = fixture(),
    enemy = make(s, "01096");
  s.engaged.push(enemy);
  s.staging.push(make(s, "01096"));
  damage(s, enemy.id, 10);
  flush(s);
  assert.equal(s.choice, null);
  const second = make(s, "01096");
  second.damage = 2;
  s.engaged.push(second);
  resolvePlayerAttack(s, second, [s.heroes[1].id], 0);
  flush(s);
  assert.equal(s.choice, null);
});
test("Halbarad permits exactly two optional engagements and the allowance survives reload", () => {
  let s = fixture();
  s.phase = "encounter";
  s.staging = [make(s, "01096"), make(s, "01096"), make(s, "01096")];
  s = applyAction(s, { type: "ENGAGE", id: s.staging[0].id });
  assert.equal(optionalEngagementProblem(s, s.staging[0]), null);
  s = applyAction(reload(s), { type: "ENGAGE", id: s.staging[0].id });
  assert.match(optionalEngagementProblem(s, s.staging[0])!, /one enemy/);
  assert.equal(s.engaged.length, 2);
  phaseEnd(s);
  s.optionalEngagement = false;
  assert.equal(optionalEngagementProblem(s, s.staging[0]), null);
});
test("Halbarad stays ready when questing with an engaged enemy, but normally exhausts without one", () => {
  for (const engaged of [false, true]) {
    const s = fixture();
    s.phase = "quest";
    const h = s.heroes[1];
    if (engaged) s.engaged.push(make(s, "01096"));
    s.committedIds = [h.id];
    commitCharacters(s);
    assert.equal(h.exhausted, !engaged);
    assert.ok(h.committed);
  }
});
test("Halbarad and Warden count considered engagements with Durin's Bane", () => {
  const s = fixture(2),
    warden = make(s, "09006"),
    bane = make(s, S.bane);
  s.allies.push(warden);
  s.staging.push(bane);
  assert.equal(stats(s, warden).will, 1);
  s.phase = "quest";
  s.committedIds = [s.heroes[1].id];
  commitCharacters(s);
  assert.equal(s.heroes[1].exhausted, false);
});
test("Warden counts only his controller's engaged enemies and updates as enemies leave", () => {
  const s = fixture(2),
    warden = make(s, "09006");
  s.allies.push(warden);
  s.engaged.push(make(s, "01096"), make(s, "01096"));
  forOwner(s, 1, () => s.engaged.push(make(s, "01096")));
  assert.equal(stats(s, warden).will, 2);
  destroy(s, s.engaged[0], false);
  assert.equal(stats(s, warden).will, 1);
});
test("Watchman searches exactly five cards and takes the selected physical Signal", () => {
  let s = fixture();
  s.deck = ["01013", "02002", "01013", "02002", "01013", "02002"];
  s = choose(play(s, "09003"), "search");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.id),
    ["card-1", "card-3"],
  );
  s = choose(reload(s), "card-3");
  assert.equal(s.hand.filter((u) => u.code === "02002").length, 1);
  assert.equal(s.deck.length, 5);
  assert.equal(s.deck.filter((c) => c === "02002").length, 2);
});
test("Watchman's optional response can be declined without shuffling", () => {
  let s = fixture();
  s.deck = ["01013", "02002"];
  const rng = s.rng;
  s = choose(play(s, "09003"), "skip");
  assert.deepEqual(s.deck, ["01013", "02002"]);
  assert.equal(s.rng, rng);
});
test("Hunter puts a nonunique enemy into play engaged without triggering its When Revealed", () => {
  let s = fixture();
  s.encounterDeck = ["01074", S.bane, "01099", "01099", "01099", "01096"];
  s = play(s, "09004");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["01074"],
  );
  s = choose(reload(s), "enemy-0");
  assert.equal(s.engaged[0].code, "01074");
  assert.ok(s.heroes.every((h) => !h.exhausted));
  assert.equal(s.encounterDeck.length, 5);
  assert.equal(s.allies[0].code, "09004");
});
test("Hunter discards himself when no nonunique enemy is among the top five", () => {
  let s = fixture();
  s.encounterDeck = [S.bane, "01099", "01099", "01099", "01099", "01096"];
  s = choose(play(s, "09004"), "none");
  assert.equal(s.allies.length, 0);
  assert.ok(s.discard.includes("09004"));
  assert.equal(s.encounterDeck.length, 6);
});
test("Hunter's Forced effect also runs when put into play instead of played", () => {
  const s = fixture(),
    u = make(s, "09004");
  s.encounterDeck = ["01096"];
  enterAlly(s, u, false);
  flush(s);
  assert.match(s.choice!.title, /Dúnedain Hunter/);
});
test("Tireless Hunters engages another player's enemy and selects a physical shadow without leaking facedown identity", () => {
  let s = fixture(2);
  s.phase = "defense";
  const enemy = make(s, "01096");
  enemy.shadows = ["01093", "01097"];
  enemy.faceupShadows = [false, true];
  forOwner(s, 1, () => s.engaged.push(enemy));
  s = play(s, "09008", enemy.id);
  assert.equal(s.engaged[0].id, enemy.id);
  assert.equal(s.choice!.options[0].code, undefined);
  assert.equal(s.choice!.options[1].code, "01097");
  s = choose(reload(s), "shadow-0");
  assert.deepEqual(s.engaged[0].shadows, ["01097"]);
  assert.deepEqual(s.engaged[0].faceupShadows, [true]);
  assert.ok(s.encounterDiscard.includes("01093"));
});
test("Tireless Hunters cannot be played outside the combat opening window", () => {
  const s = fixture();
  const event = make(s, "09008");
  s.hand.push(event);
  s.staging = [make(s, "01096")];
  assert.match(canPlay(s, event)!, /Combat Action/);
  s.phase = "defense";
  assert.equal(canPlay(s, event), null);
  s.used.push(REALM_ATTACKS_STARTED);
  assert.match(canPlay(s, event)!, /before normal/);
});
test("a real normal defense closes Tireless Hunters for every player", () => {
  let s = fixture(2);
  s.phase = "defense";
  s.engaged = [make(s, "01096")];
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: s.engaged[0].id,
    defenderId: s.heroes[0].id,
  });
  for (const p of playerOrder(s))
    assert.ok(seatView(s, p).used.includes(REALM_ATTACKS_STARTED));
});
test("Tireless Hunters excludes enemies already engaged with its controller", () => {
  const s = fixture();
  s.phase = "defense";
  const own = make(s, "01096"),
    other = make(s, "01096");
  s.engaged.push(own);
  s.staging.push(other);
  assert.deepEqual(
    playTargets(s, make(s, "09008")).map((u) => u.id),
    [other.id],
  );
});
test("Expert Trackers pays its Scout exhaustion and uses printed enemy threat on a chosen location", () => {
  let s = fixture();
  const ranger = s.heroes[0],
    location = make(s, "01099"),
    enemy = make(s, "01082");
  enemy.tempThreat = 8;
  s.staging.push(location);
  s.hand = [make(s, "09009")];
  engage(s, enemy);
  flush(s);
  s = choose(s, "play");
  s = choose(reload(s), ranger.id);
  s = choose(s, location.id);
  assert.equal(get(s, ranger.id)!.exhausted, true);
  assert.equal(get(s, location.id)!.progress, 1);
  assert.ok(s.discard.includes("09009"));
});
test("Expert Trackers pays exhaustion even when Counter-Spell cancels progress", () => {
  let s = fixture();
  const ranger = s.heroes[0],
    location = make(s, "01099"),
    enemy = make(s, "01082"),
    bane = make(s, S.bane);
  attach(s, bane, S.counter);
  s.staging = [location, bane];
  s.encounterDeck = ["01093"];
  s.hand = [make(s, "09009")];
  engage(s, enemy);
  flush(s);
  s = choose(s, "play");
  s = choose(s, ranger.id);
  s = choose(s, location.id);
  assert.ok(get(s, ranger.id)!.exhausted);
  assert.equal(get(s, location.id)!.progress, 0);
  assert.ok(s.discard.includes("09009"));
});
test("Expert Trackers is a response, cannot be played freely, and cannot exhaust another player's Ranger", () => {
  const s = fixture(2);
  const event = make(s, "09009");
  s.hand = [event];
  assert.ok(canPlay(s, event));
  s.heroes.forEach((h) => (h.exhausted = true));
  s.staging = [make(s, "01099")];
  engage(s, make(s, "01096"));
  flush(s);
  assert.equal(s.choice, null);
});
test("Heir freezes its discount, leaves other allies unchanged, consumes it on next Dunedain play and survives reload", () => {
  let s = fixture();
  const h = s.heroes[1],
    a = attach(s, h, "09010");
  s.engaged = [make(s, "01096"), make(s, "01096")];
  s = ability(s, h, a.id);
  assert.equal(playCost(s, card("09006")), 2);
  assert.equal(playCost(s, card("01013")), 2);
  s.engaged = [];
  s = reload(s);
  assert.equal(playCost(s, card("09006")), 2);
  s = play(s, "09006");
  assert.equal(playCost(s, card("09006")), 4);
  assert.ok(get(s, h.id)!.attachments[0].exhausted);
});
test("Heir discounts stack, clamp at zero and expire with the planning phase", () => {
  let s = fixture();
  const h = s.heroes[1],
    a = attach(s, h, "09010"),
    b = attach(s, h, "09010");
  s.engaged = Array.from({ length: 3 }, () => make(s, "01096"));
  s = ability(s, h, a.id);
  s = ability(s, get(s, h.id)!, b.id);
  assert.equal(playCost(s, card("09006")), 0);
  phaseEnd(s);
  assert.equal(playCost(s, card("09006")), 4);
});
test("putting a Dunedain ally into play does not consume Heir's discount", () => {
  let s = fixture();
  const h = s.heroes[1],
    a = attach(s, h, "09010");
  s.engaged = [make(s, "01096")];
  s = ability(s, h, a.id);
  enterAlly(s, make(s, "09006"), false);
  assert.equal(playCost(s, card("09006")), 3);
});
test("Heir and Athelas follow the host's controller while preserving card ownership", () => {
  const s = fixture(2),
    h = seatView(s, 1).heroes[0];
  h.code = "09002";
  const a = attach(s, h, "09010", 0);
  forOwner(s, 1, () => s.engaged.push(make(s, "01096")));
  assert.ok(!availableAbilities(s, h).some((x) => x.id === a.id));
  selectSeat(s, 1);
  assert.ok(availableAbilities(s, h).some((x) => x.id === a.id && !x.disabled));
});
test("Athelas pays both costs, heals another player and optionally discards a Condition", () => {
  let s = fixture(2);
  const h = s.heroes[0],
    target = seatView(s, 1).heroes[0],
    a = attach(s, h, "09011"),
    condition = attach(s, target, "01071", 1);
  target.damage = 3;
  s = ability(s, h, a.id);
  s = choose(reload(s), target.id);
  assert.ok(get(s, h.id)!.exhausted);
  assert.equal(get(s, target.id)!.damage, 0);
  assert.ok(s.discard.includes("09011"));
  s = choose(reload(s), condition.id);
  assert.equal(get(s, target.id)!.attachments.length, 0);
});
test("Athelas may remove a Condition from an undamaged character", () => {
  let s = fixture();
  const h = s.heroes[0],
    a = attach(s, h, "09011"),
    c = attach(s, s.heroes[1], "01071");
  s = ability(s, h, a.id);
  s = choose(s, s.heroes[1].id);
  s = choose(s, c.id);
  assert.ok(!s.heroes[1].attachments.length);
});
test("Athelas has no action with no eligible healing or Condition target", () => {
  const s = fixture(),
    h = s.heroes[0],
    a = attach(s, h, "09011");
  assert.ok(availableAbilities(s, h).find((x) => x.id === a.id)!.disabled);
});
test("Athelas and Heir attachment restrictions use traits and Star Brooch enforces one per hero", () => {
  const s = fixture();
  s.allies.push(make(s, "04083"));
  assert.ok(playTargets(s, make(s, "09011")).some((u) => u.code === "04083"));
  assert.ok(!playTargets(s, make(s, "09010")).some((u) => u.code === "04083"));
  const h = s.heroes[0];
  assert.ok(playTargets(s, make(s, "09013")).some((u) => u.id === h.id));
  attach(s, h, "09013");
  assert.ok(!playTargets(s, make(s, "09013")).some((u) => u.id === h.id));
});
test("Secret Vigil reduces threat in staging and cannot stack on one enemy", () => {
  const s = fixture(),
    enemy = make(s, "01082");
  s.staging.push(enemy);
  attach(s, enemy, "09012");
  assert.equal(threatOf(s, enemy), 0);
  assert.ok(!playTargets(s, make(s, "09012")).some((u) => u.id === enemy.id));
});
test("Secret Vigil reduces each living player's threat by printed threat after destruction", () => {
  let s = fixture(3);
  const enemy = make(s, "01082");
  enemy.tempThreat = 8;
  s.engaged.push(enemy);
  attach(s, enemy, "09012", 1);
  destroy(s, enemy);
  flush(s);
  assert.equal(activeSeat(s), 1);
  s = choose(reload(s), "reduce");
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 19);
  assert.ok(seatView(s, 1).discard.includes("09012"));
});
test("Secret Vigil does not trigger from discard or leaving play without destruction", () => {
  const s = fixture(),
    enemy = make(s, "01082");
  s.staging.push(enemy);
  attach(s, enemy, "09012");
  destroy(s, enemy, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.threat, 20);
});
test("The Empty Mug removes the actual destroyed Vigil once and preserves an older discard copy", () => {
  let s = fixture(2);
  s.scenarioId = "trouble-in-tharbad";
  s.tharbad = {
    initialized: true,
    time: 4,
    elimination: 50,
    setAside: [],
    removedSources: [],
  };
  s.allies.push(make(s, T.nalir));
  s.victoryCards = [T.mug];
  s.discard = ["09012", "01013"];
  const enemy = make(s, "01082");
  s.engaged.push(enemy);
  const a = attach(s, enemy, "09012");
  destroy(s, enemy);
  flush(s);
  s = choose(reload(s), "reduce");
  assert.deepEqual(s.discard, ["09012", "01013"]);
  assert.ok(s.removed.includes("09012"));
  assert.deepEqual(s.tharbad!.removedSources, [a.id]);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 19);
});
test("Star Brooch ignores independent willpower penalties while keeping positive bonuses", () => {
  const s = fixture(),
    h = s.heroes[0];
  attach(s, h, "09013");
  attach(s, h, "01027");
  attach(s, h, "01071");
  s.engaged.push(make(s, "01096"));
  h.committed = true;
  s.questDebuff = 4;
  h.tempWill = 2;
  assert.ok(realmWillProtected(s, h));
  assert.equal(stats(s, h).will, 7);
  s.engaged = [];
  assert.equal(stats(s, h).will, 1);
});
test("Star Brooch's engagement requirement uses the bearer rather than the attachment's owner", () => {
  const s = fixture(2),
    h = seatView(s, 1).heroes[0];
  h.code = "09002";
  attach(s, h, "09013", 0);
  s.engaged.push(make(s, "01096"));
  assert.equal(realmWillProtected(s, h), false);
  forOwner(s, 1, () => s.engaged.push(make(s, "01096")));
  assert.equal(realmWillProtected(s, h), true);
});
test("new card abilities and pending responses remain valid through serialized reload", () => {
  let s = fixture();
  const h = s.heroes[0];
  attach(s, h, "09010");
  attach(s, h, "09011");
  attach(s, h, "09013");
  s.engaged.push(make(s, "01096"));
  s.hand.push(make(s, "09009"));
  s.staging.push(make(s, "01099"));
  engage(s, make(s, "01096"));
  flush(s);
  s = reload(s);
  assert.match(s.choice!.title, /Expert Trackers/);
  assert.equal(s.heroes[0].attachments.length, 3);
});

test("Tireless Hunters receives a combat opening window even when no enemy was engaged", () => {
  let s = fixture();
  s.phase = "encounter";
  s.hand = [make(s, "09008")];
  const enemy = make(s, "01082");
  s.staging = [enemy];
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.phase, "defense");
  assert.match(s.choice!.title, /Before enemy attacks/);
  s = choose(reload(s), "play");
  s = choose(reload(s), enemy.id);
  assert.equal(s.phase, "defense");
  assert.equal(s.engaged[0].id, enemy.id);
  assert.equal(s.engaged[0].shadows.length, 0);
  assert.ok(s.discard.includes("09008"));
});
test("declining the otherwise empty combat window advances normally and does not repeat", () => {
  let s = fixture();
  s.phase = "encounter";
  s.hand = [make(s, "09008")];
  s.staging = [make(s, "01082")];
  s = applyAction(s, { type: "NEXT" });
  s = choose(s, "skip");
  assert.equal(s.phase, "attack");
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 1);
});
test("an unaffordable Tireless Hunters does not pause an empty combat", () => {
  let s = fixture();
  s.phase = "encounter";
  s.heroes.forEach((h) => (h.resources = 0));
  s.hand = [make(s, "09008")];
  s.staging = [make(s, "01082")];
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.phase, "attack");
  assert.equal(s.choice, null);
});
test("Hunter's forced search cannot decline an available enemy", () => {
  let s = fixture();
  s.encounterDeck = ["01096"];
  s = play(s, "09004");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["enemy-0"],
  );
});
