import assert from "node:assert/strict";
import test from "node:test";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import {
  canPlay,
  playTargets,
  publicState,
  validateSave,
} from "../src/game/engine";
import { fx, get, make, stats, playCost } from "../src/game/core";
import { damage } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  forOwner,
  globalCharacters,
  ownerOf,
  seatView,
  selectSeat,
} from "../src/game/table";
import { shadowEastRing } from "../src/game/shadow-east-player-support";
import {
  wrathRuinPlayerPublicState,
  wrathRuinPlayerStats,
  WRATH_RUIN_PLAYER as P,
  WRATH_RUIN_PLAYER_CARDS,
} from "../src/game/wrath-ruin-player-support";
import { wrathRuinPlayerShadowOptions } from "../src/game/wrath-ruin-player";
import {
  fixture,
  act,
  pick,
  hand,
  ally,
  attach,
  play,
  reload,
  settle,
  ring,
  fellowship,
} from "./wrath-ruin-player-fixtures";
import type { GameState, Unit } from "../src/game/types";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import { base as foundationFixture } from "./against-shadow-final-fixtures";
import { FOUNDATIONS_STONE as F } from "../src/game/foundations-stone";

function enemy(s: GameState, code = "01082", player = activeSeat(s)) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
}
function framework(s: GameState, kind: string, data = {}) {
  handle(s, fx(kind, data));
  flush(s);
  return s;
}
function revealTom(s: GameState) {
  s.phase = "staging";
  s.encounterDeck = [P.tom, "01099"];
  return framework(s, "reveal");
}
function tomEvent(s: GameState) {
  return play(s, hand(s, P.bombadillo).id);
}
function chargeAttack(s: GameState, target: string, attackers: string[]) {
  s = pick(s, target);
  for (const id of attackers) s = pick(s, id);
  return pick(s, "attack");
}

test("Wrath and Ruin registers all eleven original designs once and preserves four reused handlers", () => {
  assert.equal(WRATH_RUIN_PLAYER_CARDS.length, 11);
  for (const c of WRATH_RUIN_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(
      playerCards.filter((p) => p.code === c.code).length,
      1,
      c.code,
    );
  }
  assert.equal(card(P.tom).cost, undefined);
  assert.equal((card(P.axe).text!.match(/Guarded \(enemy\)/g) ?? []).length, 1);
});

test("reused Thorin pays the actual top deck card after native attacker declaration", () => {
  let s = fixture();
  const thorin = s.heroes[0],
    foe = enemy(s);
  s.phase = "attack";
  s.deck = ["01018", "01016"];
  s = act(s, { type: "ATTACK", enemyId: foe.id, attackerIds: [thorin.id] });
  assert.match(s.choice!.title, /Thorin/);
  s = pick(s, "use");
  s = pick(s, foe.id);
  s = settle(s);
  assert.ok(s.discard.includes("01018"));
  assert.equal(s.deck[0], "01016");
  assert.ok(get(s, foe.id)!.damage >= 1);
});

test("reused Soldier of Gondor searches its original top five through a native play", () => {
  let s = fixture();
  s.deck = ["05003", "01016", "05007", "05002", "01073", "05004"];
  s = play(s, hand(s, P.soldier).id);
  s = pick(s, "search");
  assert.deepEqual(
    s.choice!.options.filter((o) => o.code).map((o) => o.code),
    ["05003", "05007"],
  );
  s = pick(s, s.choice!.options.find((o) => o.code === "05003")!.id);
  assert.ok(s.hand.some((u) => u.code === "05003"));
  assert.ok(s.deck.includes("05004"));
});

test("reused Pillars applies its zero-cost low-threat play and draws four actual cards", () => {
  let s = fixture();
  s.threat = 28;
  s.deck = Array(6).fill("01018");
  const h = hand(s, P.pillars),
    resources = s.heroes.reduce((n, u) => n + u.resources, 0);
  assert.equal(playCost(s, card(P.pillars)), 0);
  s = play(s, h.id);
  assert.equal(s.threat, 40);
  assert.equal(s.hand.length, 4);
  assert.equal(
    s.heroes.reduce((n, u) => n + u.resources, 0),
    resources,
  );
});

test("reused Silver Circlet retains Spirit-hero, one-per-hero and Restricted rules", () => {
  let s = fixture();
  const hero = s.heroes[1],
    h = hand(s, P.circlet),
    before = stats(s, hero).will;
  s = play(s, h.id, hero.id);
  assert.equal(stats(s, get(s, hero.id)!).will, before + 2);
  const again = hand(s, P.circlet);
  assert.ok(!playTargets(s, again).some((u) => u.id === hero.id));
  assert.match(card(P.circlet).text!, /Restricted/);
});

test("Cautious Halfling looks without revealing and draws only after seeing a non-enemy", () => {
  let s = fixture();
  s.encounterDeck = ["01099", "01074"];
  const top = [...s.encounterDeck],
    h = hand(s, P.halfling),
    drawCode = s.deck[0];
  s = play(s, h.id);
  s = pick(s, "use");
  assert.equal(s.choice!.options[0].code, "01099");
  assert.deepEqual(s.encounterDeck, top);
  assert.equal(s.staging.length, 0);
  assert.ok(!JSON.stringify(publicState(s)).includes(card("01099").name));
  s = pick(s, "continue");
  assert.equal(s.hand.at(-1)?.code, drawCode);
  assert.deepEqual(s.encounterDeck, top);
});

test("Cautious Halfling does not draw for an enemy or inspect an empty deck", () => {
  let s = fixture();
  s.encounterDeck = ["01074"];
  s = play(s, hand(s, P.halfling).id);
  s = pick(s, "use");
  const count = s.hand.length;
  s = pick(s, "continue");
  assert.equal(s.hand.length, count);
  s.encounterDeck = [];
  s = play(s, hand(s, P.halfling).id);
  assert.equal(s.choice, null);
});

test("Halfling's private saved look belongs to the remote ally controller and declining reveals nothing", () => {
  let s = fixture(2);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.encounterDeck = ["01099", "01074"];
  s = play(s, hand(s, P.halfling).id);
  assert.equal(activeSeat(s), 1);
  s = pick(s, "skip");
  assert.deepEqual(s.encounterDeck, ["01099", "01074"]);
  s = play(s, hand(s, P.halfling).id);
  s = pick(s, "use");
  const original = structuredClone(s),
    alternate = structuredClone(s);
  alternate.choice!.options[0].code = "01096";
  alternate.choice!.options[0].effects[0].code = "01096";
  assert.deepEqual(publicState(original), publicState(alternate));
  const ownBefore = seatView(s, 1).hand.length,
    otherBefore = seatView(s, 0).hand.length;
  s = pick(reload(s), "continue");
  assert.equal(seatView(s, 1).hand.length, ownBefore + 1);
  assert.equal(seatView(s, 0).hand.length, otherBefore);
});

test("Durin's Axe native play discards past locations, adds only an enemy without revealing and preserves its physical identity", () => {
  let s = fixture();
  s.encounterDeck = ["01088", "01089", "01074"];
  const axe = hand(s, P.axe),
    host = s.heroes[0];
  s = play(s, axe.id);
  const guard = s.staging.find((u) => u.code === "01089")!;
  assert.ok(guard);
  assert.ok(s.encounterDiscard.includes("01088"));
  assert.equal(guard.attachments[0].id, axe.id);
  // Adding Dol Guldur Orcs as a guard does not reveal its damage effect.
  assert.ok(s.heroes.every((hero) => hero.damage === 0));
  damage(s, guard.id, 20, { combatDamage: true });
  flush(s);
  assert.match(s.choice!.title, /Durin/);
  s = pick(reload(s), host.id);
  s = settle(s);
  assert.ok(get(s, host.id)!.attachments.some((a) => a.id === axe.id));
  assert.equal(wrathRuinPlayerStats(s, get(s, host.id)!).attack, 2);
});

test("Durin's Axe cannot use a location guard and still claims legally when no matching enemy exists", () => {
  let s = fixture();
  s.encounterDeck = ["01088"];
  s.encounterDiscard = [];
  const h = hand(s, P.axe);
  s = play(s, h.id);
  assert.equal(s.staging.length, 0);
  assert.match(s.choice!.title, /Durin/);
  s = pick(s, s.heroes[0].id);
  assert.ok(s.heroes[0].attachments.some((a) => a.id === h.id));
});

test("Durin's Axe reacts to native killing attacks and damages an enemy engaged with its controller", () => {
  let s = fixture(2);
  const hero = seatView(s, 1).heroes[0];
  attach(s, hero, P.axe, 0);
  const victim = enemy(s, "01083", 1),
    other = enemy(s, "01082", 1),
    remote = enemy(s, "01082", 0);
  hero.tempAttack = 10;
  s.phase = "attack";
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = act(s, { type: "ATTACK", enemyId: victim.id, attackerIds: [hero.id] });
  assert.match(s.choice!.title, /Durin/);
  assert.ok(s.choice!.options.some((o) => o.id === other.id));
  assert.ok(!s.choice!.options.some((o) => o.id === remote.id));
  s = pick(s, other.id);
  s = settle(s);
  assert.equal(get(s, other.id)!.damage, 1);
  assert.equal(get(s, remote.id)!.damage, 0);
});

test("Inner Strength attaches only to the Ring bearer, is limited to one and gives one defense", () => {
  let s = fixture();
  const bearer = ring(s),
    h = hand(s, P.strength);
  assert.deepEqual(
    playTargets(s, h).map((u) => u.id),
    [bearer.id],
  );
  const before = stats(s, bearer).defense;
  s = play(s, h.id, bearer.id);
  assert.equal(stats(s, get(s, bearer.id)!).defense, before + 1);
  assert.deepEqual(playTargets(s, hand(s, P.strength)), []);
});

test("Inner Strength cancels an actual triggered shadow after native defense and pays Ring plus threat", () => {
  let s = fixture();
  const bearer = ring(s),
    strength = attach(s, bearer, P.strength),
    foe = enemy(s, "01083");
  foe.shadows = ["01086"];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: foe.id, defenderId: bearer.id });
  assert.ok(
    s.choice!.options.some((o) => o.id === `wrath-strength-${strength.id}`),
  );
  const before = s.threat;
  s = pick(reload(s), `wrath-strength-${strength.id}`);
  s = settle(s);
  assert.equal(s.threat, before + 1);
  assert.equal(shadowEastRing(s)!.attachment.exhausted, true);
  assert.equal(get(s, bearer.id)!.damage, 0);
});

test("Inner Strength is unavailable for a different defender, exhausted Ring or a shadow without text", () => {
  const s = fixture(),
    bearer = ring(s),
    strength = attach(s, bearer, P.strength),
    foe = enemy(s);
  s.combat = {
    enemyId: foe.id,
    defenderId: s.heroes[1].id,
    attackBonus: 0,
    defenseBonus: 0,
    pierce: false,
  };
  assert.deepEqual(wrathRuinPlayerShadowOptions(s, "01088"), []);
  s.combat.defenderId = bearer.id;
  assert.equal(wrathRuinPlayerShadowOptions(s, "01088").length, 1);
  assert.deepEqual(wrathRuinPlayerShadowOptions(s, "01099", false), []);
  shadowEastRing(s)!.attachment.exhausted = true;
  assert.deepEqual(wrathRuinPlayerShadowOptions(s, "01088"), []);
  shadowEastRing(s)!.attachment.exhausted = false;
  strength.blanked = true;
  assert.deepEqual(wrathRuinPlayerShadowOptions(s, "01088"), []);
});

test("Charge into Battle only starts after staging and ignores unique or immune staging enemies", () => {
  const s = fixture(),
    event = hand(s, P.charge),
    nonunique = make(s, "01083");
  s.staging = [nonunique];
  assert.match(canPlay(s, event)!, /after staging/);
  s.phase = "quest";
  assert.match(canPlay(s, event)!, /after staging/);
  s.phase = "staging";
  assert.equal(canPlay(s, event), null);
  s.staging = [make(s, "21072.B")];
  assert.match(canPlay(s, event)!, /non-unique/);
});

test("Charge into Battle saves attacker selection and resolves separate native attacks once per staging enemy", () => {
  let s = fixture();
  s.phase = "staging";
  const a = make(s, "01082"),
    b = make(s, "01082"),
    h1 = s.heroes[1],
    h2 = s.heroes[2];
  s.staging = [a, b];
  h1.tempAttack = 4;
  h2.tempAttack = 4;
  s = play(s, hand(s, P.charge).id);
  s = chargeAttack(s, a.id, [h1.id]);
  assert.ok(!s.choice!.options.some((o) => o.id === a.id));
  assert.ok(s.choice!.options.some((o) => o.id === b.id));
  assert.ok(get(s, h1.id)!.exhausted);
  assert.equal(get(s, a.id)!.damage, 3);
  s = chargeAttack(reload(s), b.id, [h2.id]);
  if (s.choice) s = pick(s, "finish");
  assert.equal(get(s, b.id)!.damage, 2);
  assert.ok(get(s, h2.id)!.exhausted);
  assert.ok(s.discard.includes(P.charge));
  assert.ok(!get(s, a.id)!.attacked);
  assert.ok(!get(s, b.id)!.attacked);
});

test("Tom Bombadillo pays the exact event into victory and can consume a teammate's reserve", () => {
  let s = fixture(2);
  s.wrathBombadilReserves = { 0: 0, 1: 2 };
  const event = hand(s, P.bombadillo);
  s = play(s, event.id);
  assert.ok(s.victoryCards!.includes(P.bombadillo));
  assert.equal(s.wrathBombadilReserves[1], 1);
  assert.equal(s.encounterDeck.filter((c) => c === P.tom).length, 1);
  assert.ok(!s.discard.includes(P.bombadillo));
  assert.equal(s.wrathRuinPlayers!.bombadilloOwners[0].id, event.id);
  assert.match(canPlay(s, hand(s, P.bombadillo))!, /victory display/);
  reload(s);
});

test("Tom Bombadillo's reserve choice saves the paid event and uses the selected physical pool", () => {
  let s = fixture(2);
  const event = hand(s, P.bombadillo);
  s = play(s, event.id);
  assert.match(s.choice!.title, /set-aside copy/);
  assert.ok(s.victoryCards!.includes(P.bombadillo));
  assert.equal(s.resolvingEvents![0].destination, "spent");
  s = pick(reload(s), "reserve-1");
  assert.equal(s.wrathBombadilReserves![0], 3);
  assert.equal(s.wrathBombadilReserves![1], 2);
  assert.equal(s.resolvingEvents, undefined);
});

test("Tom Bombadillo requires a Hobbit, a reserve and planning; Tom is never playable from a hand", () => {
  const s = fixture(),
    event = hand(s, P.bombadillo);
  s.phase = "attack";
  assert.match(canPlay(s, event)!, /Planning/);
  s.phase = "planning";
  s.wrathBombadilReserves = { 0: 0 };
  assert.match(canPlay(s, event)!, /set-aside/);
  s.wrathBombadilReserves[0] = 3;
  s.heroes = s.heroes.filter((h) => !card(h.code).traits?.includes("Hobbit"));
  assert.match(canPlay(s, event)!, /Hobbit/);
  assert.match(canPlay(s, hand(s, P.tom))!, /Encounter/);
});

test("Tom's uncancellable native reveal assigns the actual physical ally ready and committed to another player", () => {
  let s = fixture(2);
  hand(s, "01050");
  s = revealTom(s);
  assert.match(s.choice!.title, /Tom Bombadil/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["player-0", "player-1"],
  );
  const id = s.staging.find((u) => u.code === P.tom)!.id;
  s = pick(reload(s), "player-1");
  s = settle(s);
  const tom = globalCharacters(s).find((u) => u.id === id)!;
  assert.equal(ownerOf(s, tom), 1);
  assert.equal(tom.exhausted, false);
  assert.equal(tom.committed, true);
  assert.ok(!s.staging.some((u) => u.id === id));
});

test("Tom's delayed round-end departure removes the same ally and Bombadillo from the victory display", () => {
  let s = fixture();
  s = tomEvent(s);
  s = revealTom(s);
  s = pick(s, "player-0");
  s = settle(s);
  const tom = s.allies.find((u) => u.code === P.tom)!;
  s = framework(reload(s), "endRound");
  s = settle(s);
  assert.ok(!globalCharacters(s).some((u) => u.id === tom.id));
  assert.ok(s.removed.includes(P.tom));
  assert.ok(s.removed.includes(P.bombadillo));
  assert.ok(!s.victoryCards!.includes(P.bombadillo));
  assert.equal(s.wrathRuinPlayers!.tomDelays.length, 0);
});

test("Tom's delayed effect still removes Bombadillo when he was destroyed earlier", () => {
  let s = fixture();
  s = tomEvent(s);
  s = revealTom(s);
  s = pick(s, "player-0");
  s = settle(s);
  const tom = s.allies.find((u) => u.code === P.tom)!;
  damage(s, tom.id, 20, { combatDamage: true });
  flush(s);
  s = settle(s);
  assert.equal(s.removed.filter((c) => c === P.tom).length, 1);
  assert.equal(s.wrathRuinPlayers!.tomDelays.length, 1);
  s = framework(reload(s), "endRound");
  s = settle(s);
  assert.equal(s.removed.filter((c) => c === P.tom).length, 1);
  assert.ok(s.removed.includes(P.bombadillo));
  assert.ok(!s.victoryCards!.includes(P.bombadillo));
});

test("Tom gain of control is legal with Fellowship side B because the revealed card is already in play", () => {
  let s = fixture();
  fellowship(s, 0, "B");
  s = revealTom(s);
  s = pick(s, "player-0");
  s = settle(s);
  assert.ok(s.allies.some((u) => u.code === P.tom));
  assert.equal(s.shadowEastPlayers!.contracts[0].side, "B");
  reload(s);
});

test("new player metadata rejects malformed owners and repeated delayed physical IDs without exposing reserve order", () => {
  let s = fixture();
  s = tomEvent(s);
  s = revealTom(s);
  s = pick(s, "player-0");
  s = settle(s);
  assert.ok(validateSave(reload(s)));
  const invalid = structuredClone(s);
  invalid.wrathRuinPlayers!.bombadilloOwners[0].owner = 9;
  assert.equal(validateSave(invalid), false);
  const repeated = structuredClone(s);
  repeated.wrathRuinPlayers!.tomDelays.push(
    repeated.wrathRuinPlayers!.tomDelays[0],
  );
  assert.equal(validateSave(repeated), false);
  assert.ok(
    !JSON.stringify(wrathRuinPlayerPublicState(s)).includes("bombadilloOwners"),
  );
});

test("Charge into Battle permits remote Ranged support but requires an attacker controlled by the event player", () => {
  let s = fixture(2);
  s.phase = "staging";
  const foe = make(s, "01082"),
    own = s.heroes[1];
  s.staging = [foe];
  const ranged = ally(s, "01017", 1),
    nonRanged = seatView(s, 1).heroes[0];
  s = play(s, hand(s, P.charge).id);
  s = pick(s, foe.id);
  assert.ok(s.choice!.options.some((o) => o.id === ranged.id));
  assert.ok(!s.choice!.options.some((o) => o.id === nonRanged.id));
  s = pick(s, ranged.id);
  assert.ok(!s.choice!.options.some((o) => o.id === "attack"));
  s = pick(reload(s), own.id);
  assert.ok(s.choice!.options.some((o) => o.id === "attack"));
  s = pick(s, "attack");
  if (s.choice) s = pick(s, "finish");
  assert.ok(get(s, own.id)!.exhausted);
  assert.ok(get(s, ranged.id)!.exhausted);
  assert.equal(get(s, foe.id)!.damage, 1);
});

test("Inner Strength respects an active location that forbids shadow cancellation", () => {
  let s = fixture();
  const bearer = ring(s),
    strength = attach(s, bearer, P.strength),
    foe = enemy(s, "01083");
  s.activeLocation = make(s, "02016");
  foe.shadows = ["01086"];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: foe.id, defenderId: bearer.id });
  assert.ok(
    !s.choice?.options.some((o) => o.id === `wrath-strength-${strength.id}`),
  );
  s = settle(s);
  assert.equal(shadowEastRing(s)!.attachment.exhausted, false);
  assert.equal(get(s, bearer.id)!.damage, 2);
});

test("Tom Bombadillo retains its paid victory cost when Counter-Spell cancels the shuffle", () => {
  let s = fixture();
  const bane = make(s, SHADOW_FLAME.bane);
  attach(s, bane, SHADOW_FLAME.counter);
  s.staging.push(bane);
  s.encounterDeck = ["01092", "01099"];
  const event = hand(s, P.bombadillo),
    resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, event.id);
  assert.ok(s.victoryCards!.includes(P.bombadillo));
  assert.ok(!s.discard.includes(P.bombadillo));
  assert.equal(s.wrathBombadilReserves![0], 3);
  assert.ok(!s.encounterDeck.includes(P.tom));
  assert.ok(s.encounterDiscard.includes("01092"));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resources - 2,
  );
  reload(s);
});

test("Tom's complete native event, staging reveal and refresh preserve both physical cards", () => {
  let s = fixture();
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s = tomEvent(s);
  assert.deepEqual(s.encounterDeck, [P.tom]);
  s.phase = "quest";
  s.committedIds = [s.heroes[1].id];
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Tom Bombadil/);
  s = pick(reload(s), "player-0");
  s = settle(s);
  assert.equal(s.allies.filter((u) => u.code === P.tom).length, 1);
  assert.ok(!s.encounterDeck.includes(P.tom));
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  s = settle(s);
  assert.equal(s.removed.filter((code) => code === P.tom).length, 1);
  assert.equal(s.removed.filter((code) => code === P.bombadillo).length, 1);
  assert.equal(s.wrathBombadilReserves![0], 2);
  assert.ok(!s.discard.includes(P.tom));
  assert.ok(!s.discard.includes(P.bombadillo));
  reload(s);
});

test("Tom dealt as a shadow does not trigger his reveal and goes to the encounter discard", () => {
  let s = fixture();
  const foe = enemy(s, "01083"),
    defender = s.heroes[1];
  foe.shadows = [P.tom];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: foe.id, defenderId: defender.id });
  s = settle(s);
  assert.equal(s.wrathRuinPlayers, undefined);
  assert.ok(!s.allies.some((u) => u.code === P.tom));
  assert.ok(s.encounterDiscard.includes(P.tom));
  assert.ok(!s.discard.includes(P.tom));
  reload(s);
});

test("Tom's global round-end delay removes him once from a different separated staging area", () => {
  let s = foundationFixture("foundations-of-stone", 2);
  s.wrathBombadilReserves = { 0: 0, 1: 1 };
  const d = s.foundationsStone!;
  d.areas = [F.lair, F.rocks].map((questCode, player) => ({
    id: `wrath-area-${player}`,
    players: [player],
    questCode,
    progress: 0,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  }));
  d.split = true;
  d.setAside = [];
  d.activeArea = undefined;
  d.resolvedAreas = [];
  d.travelPassedAreas = [];
  s.stage = 4;
  s.stageRevealing = false;
  selectSeat(s, 1);
  s = revealTom(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["player-1"],
  );
  s = pick(s, "player-1");
  s = settle(s);
  const tom = globalCharacters(s).find((u) => u.code === P.tom)!;
  assert.equal(ownerOf(s, tom), 1);
  selectSeat(s, 0);
  s = framework(reload(s), "endRound");
  s = settle(s);
  assert.ok(!globalCharacters(s).some((u) => u.id === tom.id));
  assert.equal(seatView(s, 1).removed.filter((c) => c === P.tom).length, 1);
  assert.equal(s.wrathRuinPlayers!.tomDelays.length, 0);
  reload(s);
});
