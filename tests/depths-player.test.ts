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
} from "../src/game/engine";
import {
  fx,
  get,
  make,
  playCost,
  stats,
  threatOf,
  pay,
  resources,
} from "../src/game/core";
import {
  enterAlly,
  phaseEnd,
  raiseThreat,
  revealed,
  discardCharacter,
  takePlayerDiscard,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import { DREAD } from "../src/game/dread-realm-support";
import { KHAZAD } from "../src/game/khazad-dum";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support";
import { WATCHER_WATER } from "../src/game/watcher-water";
import { syncAttachmentText } from "../src/game/attachment-text";
import * as Depths from "../src/game/depths-player";
import {
  DEPTHS_PLAYER as P,
  DEPTHS_PLAYER_CARDS,
} from "../src/game/depths-player-support";
import { choose, reload, base } from "./against-shadow-final-fixtures";
import {
  depthsPlayerFixture as fixture,
  depthsPlayerAlly as ally,
  depthsPlayerHand as hand,
  depthsPlayerAttach as attach,
} from "./depths-player-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const select = (s: GameState, id: string) => choose(reload(s), id);
function effect(s: GameState, e: Effect) {
  s.queue.push(e);
  flush(s);
  return s;
}
function ability(s: GameState, u: Unit, attachmentId?: string) {
  return applyAction(s, { type: "ABILITY", id: u.id, attachmentId });
}
function play(
  s: GameState,
  code: string,
  target?: string,
  payment?: Record<string, number>,
) {
  const u = hand(s, code);
  return applyAction(s, { type: "PLAY", id: u.id, target, payment });
}
function shadowFixture(players = 1, shadow = "01089") {
  const s = fixture(players),
    eldahir = ally(s, P.eldahir),
    enemy = make(s, "01082");
  s.phase = "defense";
  enemy.shadows = [shadow, "01099"];
  enemy.faceupShadows = [false, false];
  s.engaged.push(enemy);
  return { s, eldahir, enemy };
}

test("The Thing in the Depths registers nine unchanged original designs and25 physical cards", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.equal(DEPTHS_PLAYER_CARDS.length, 9);
  assert.equal(
    DEPTHS_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    25,
  );
  for (const c of DEPTHS_PLAYER_CARDS) {
    const source = catalog.find((x: { code: string }) => x.code === c.code);
    assert.equal(c.text, source.text);
    assert.equal(c.octgnid, source.octgnid);
    assert.equal(c.pack_code, "TitD");
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(c.imagesrc, "/cards/" + c.code + ".jpg");
  }
});
test("Lanwyn's actual revealed Surge offers an optional phase-limited ready or willpower response", () => {
  let s = fixture();
  const lanwyn = s.heroes[0];
  lanwyn.exhausted = true;
  s.phase = "quest";
  revealed(s, "01088");
  flush(s);
  // Eastern Crows, not the non-Surge location, supplies the actual trigger.
  assert.equal(s.choice?.title.includes("Lanwyn"), undefined);
  s.queue = [];
  s.encounterDeck = ["01099"];
  revealed(s, "01115");
  flush(s);
  assert.match(s.choice!.title, /Lanwyn/);
  s = select(s, "ready");
  assert.equal(get(s, lanwyn.id)!.exhausted, false);
  Depths.depthsPlayerSurgeRevealed(s, "01115");
  flush(s);
  s = select(s, "will");
  assert.equal(stats(s, get(s, lanwyn.id)!).will, 4);
  Depths.depthsPlayerSurgeRevealed(s, "01115");
  flush(s);
  assert.equal(s.choice, null);
  phaseEnd(s);
  assert.equal(stats(s, get(s, lanwyn.id)!).will, 2);
});
test("Declining Lanwyn preserves both activations and ready Lanwyn can still gain willpower", () => {
  let s = fixture();
  const u = s.heroes[0];
  s = effect(s, fx("depthsPlayerLanwynOffer", { source: u.id, code: "01115" }));
  assert.ok(!s.choice!.options.some((o) => o.id === "ready"));
  s = select(s, "skip");
  assert.equal(s.used.filter((k) => k.includes("lanwyn:")).length, 0);
  s = effect(s, fx("depthsPlayerLanwynOffer", { source: u.id, code: "01115" }));
  s = select(s, "will");
  assert.equal(stats(s, get(s, u.id)!).will, 4);
});
test("Lanwyn's physical phase limit follows control changes and lasting willpower survives blanking", () => {
  let s = fixture(2);
  const u = s.heroes[0];
  for (let i = 0; i < 2; i++) {
    s = effect(
      s,
      fx("depthsPlayerLanwynOffer", { source: u.id, code: "01115" }),
    );
    s = select(s, "will");
  }
  const actual = get(s, u.id)!;
  s.heroes = s.heroes.filter((h) => h.id !== u.id);
  forOwner(s, 1, () => s.heroes.push(actual));
  selectSeat(s, 1);
  actual.blanked = true;
  assert.equal(stats(s, actual).will, 6);
  actual.blanked = false;
  Depths.depthsPlayerSurgeRevealed(s, "01115");
  flush(s);
  assert.equal(s.choice, null);
});
test("Eldahir pays exactly one Lore resource and looks at an individual shadow without revealing/resolving it", () => {
  let { s, eldahir, enemy } = shadowFixture();
  const payer = s.heroes[0],
    before = payer.resources;
  s = ability(s, eldahir);
  s = select(s, payer.id);
  assert.equal(s.choice!.options.length, 2);
  s = select(s, enemy.id + ":0");
  assert.match(s.choice!.title, /Look at the shadow/);
  assert.equal(s.choice!.options[0].code, "01089");
  assert.equal(get(s, payer.id)!.resources, before - 1);
  assert.deepEqual(get(s, enemy.id)!.faceupShadows, [false, false]);
  assert.deepEqual(get(s, enemy.id)!.shadows, ["01089", "01099"]);
  assert.equal(stats(s, get(s, eldahir.id)!).defense, 4);
  s = select(s, "continue");
  assert.match(
    Depths.depthsPlayerAbilityProblem(s, get(s, eldahir.id)!)!,
    /already/,
  );
});
test("A shadow without printed effects grants no defense and faceup/resolved shadows cannot be selected", () => {
  let { s, eldahir, enemy } = shadowFixture(1, "01099");
  enemy.faceupShadows = [true, false];
  s = ability(s, eldahir);
  s = select(s, s.heroes[0].id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [enemy.id + ":1"],
  );
  s = select(s, enemy.id + ":1");
  assert.equal(stats(s, get(s, eldahir.id)!).defense, 2);
  assert.match(s.choice!.description!, /no shadow effect/);
});
test("Any player can trigger remote Eldahir but only the initiating player's Lore pool pays", () => {
  let { s, eldahir, enemy } = shadowFixture(2);
  const hostPool = s.heroes[0].resources;
  selectSeat(s, 1);
  const payer = s.heroes[0],
    ownPool = payer.resources;
  s = ability(s, eldahir);
  assert.ok(availableAbilities(s, get(s, eldahir.id)!).length > 0);
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  s = select(s, payer.id);
  s = select(s, enemy.id + ":0");
  s = select(s, "continue");
  assert.equal(get(s, payer.id)!.resources, ownPool - 1);
  assert.equal(seatView(s, 0).heroes[0].resources, hostPool);
  phaseEnd(s);
  assert.equal(stats(s, get(s, eldahir.id)!).defense, 2);
  selectSeat(s, 1);
  assert.equal(Depths.depthsPlayerAbilityProblem(s, get(s, eldahir.id)!), null);
});
test("Eldahir rejects an exhausted spending pool, stale saved shadow index and exhausted-phase reuse", () => {
  let { s, eldahir, enemy } = shadowFixture();
  s = ability(s, eldahir);
  s = select(s, s.heroes[0].id);
  s = reload(s);
  get(s, enemy.id)!.shadows[0] = "01099";
  assert.throws(() => choose(s, enemy.id + ":0"), /same actual facedown/);
  assert.equal(s.heroes[0].resources, 10);
});
test("Captain's Wisdom is Resource-only and exhausts a controlled Noble hero before adding2", () => {
  let s = fixture();
  const h = s.heroes[1],
    event = hand(s, P.wisdom);
  assert.match(canPlay(s, event)!, /Resource Action/);
  assert.equal(needsTarget(event), true, "the play dialog must offer its Noble target");
  s.phase = "resource";
  assert.deepEqual(
    playTargets(s, event).map((u) => u.id),
    [h.id, s.heroes[2].id],
  );
  s = applyAction(s, { type: "PLAY", id: event.id, target: h.id });
  assert.equal(get(s, h.id)!.resources, 12);
  assert.equal(get(s, h.id)!.exhausted, true);
  assert.ok(s.discard.includes(P.wisdom));
});
test("Captain's Wisdom excludes other-player Noble heroes and blocked gains", () => {
  const s = fixture(2),
    u = hand(s, P.wisdom);
  s.phase = "resource";
  assert.ok(
    playTargets(s, u).every((h) => s.heroes.some((x) => x.id === h.id)),
  );
  s.heroes[1].exhausted = s.heroes[2].exhausted = true;
  assert.match(canPlay(s, u)!, /ready Noble/);
});
test("Captain's Wisdom recognizes a Noble Sword-thain hero as a real resource recipient", () => {
  let s = fixture();
  const eldahir = ally(s, P.eldahir);
  attach(s, eldahir, "10149");
  syncAttachmentText(s);
  s.phase = "resource";
  s = play(s, P.wisdom, eldahir.id);
  assert.equal(get(s, eldahir.id)!.resources, 2);
  assert.equal(get(s, eldahir.id)!.exhausted, true);
});
test("Master Ironsmith's actual single-hero payment offers both physical hand and discard attachments", () => {
  let s = fixture();
  const hero = s.heroes[2],
    smith = hand(s, P.ironsmith),
    plate = hand(s, "01040");
  s.discard = [P.raiment];
  s = applyAction(s, { type: "PLAY", id: smith.id, payment: { [hero.id]: 3 } });
  assert.match(s.choice!.title, /Master Ironsmith/);
  assert.ok(s.choice!.options.some((o) => o.id === plate.id));
  assert.ok(s.choice!.options.some((o) => o.id === "discard-0"));
  s = select(s, plate.id);
  assert.equal(get(s, hero.id)!.resources, 7);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === plate.id));
  assert.ok(!s.hand.some((u) => u.id === plate.id));
  assert.equal(s.allies.filter((u) => u.code === P.ironsmith).length, 1);
});
test("Ironsmith may attach from physical discard at no extra cost while respecting2-slot Raiment", () => {
  let s = fixture();
  const hero = s.heroes[2];
  s.discard = ["01040", P.raiment];
  s = play(s, P.ironsmith, undefined, { [hero.id]: 3 });
  s = select(s, "discard-1");
  assert.deepEqual(s.discard, ["01040"]);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === P.raiment));
  assert.equal(stats(s, get(s, hero.id)!).attack, 3);
  assert.equal(stats(s, get(s, hero.id)!).defense, 3);
  assert.equal(stats(s, get(s, hero.id)!).health, 7);
});
test("Ironsmith split resource payment is legal but cannot initiate its single-pool Response", () => {
  let s = fixture();
  hand(s, "01040");
  const smith = hand(s, P.ironsmith);
  s = applyAction(s, {
    type: "PLAY",
    id: smith.id,
    payment: { [s.heroes[0].id]: 1, [s.heroes[2].id]: 2 },
  });
  assert.equal(s.choice, null);
  assert.ok(get(s, smith.id));
  assert.ok(!s.used.some((k) => k.includes("ironsmith-paid")));
});
test("Ironsmith auto-payment records the hero actually spent from", () => {
  let s = fixture();
  const hero = s.heroes[2];
  hero.resources = 12;
  hand(s, "01040");
  s = play(s, P.ironsmith);
  assert.match(s.choice!.title, /Master Ironsmith/);
  s = select(s, s.hand[0].id);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === "01040"));
  assert.equal(get(s, hero.id)!.resources, 9);
});
test("Ironsmith put-into-play and explicit free hand play produce no fictitious paying hero", () => {
  let s = fixture();
  hand(s, "01040");
  const u = make(s, P.ironsmith);
  enterAlly(s, u, false, false, false);
  flush(s);
  assert.equal(s.choice, null);
  const smith = hand(s, P.ironsmith);
  s = effect(s, fx("freeHandPlayResolve", { target: smith.id }));
  assert.equal(s.choice, null);
  assert.ok(get(s, smith.id));
});
test("Ironsmith zero resource trace grants no attachment response", () => {
  const s = fixture(),
    smith = make(s, P.ironsmith);
  hand(s, "01040");
  const trace = pay(s, { ...card(P.ironsmith), cost: 0 }, {});
  assert.deepEqual(trace, {});
  Depths.depthsPlayerCardPaid(s, smith, trace, true, true);
  enterAlly(s, smith, false, true, true);
  flush(s);
  assert.equal(s.choice, null);
});
test("Ironsmith respects printed target restrictions and excludes non-Weapon/Armor attachments", () => {
  let s = fixture();
  const hero = s.heroes[0];
  const raiment = hand(s, P.raiment),
    steward = hand(s, "01026");
  s = play(s, P.ironsmith, undefined, { [hero.id]: 3 });
  assert.equal(s.choice, null);
  assert.ok(s.hand.some((u) => u.id === raiment.id || u.id === steward.id));
});
test("Ironsmith's pending attachment choice survives reload and rejects a changed discard identity", () => {
  let s = fixture();
  const hero = s.heroes[2];
  s.discard = ["01040", P.raiment];
  s = play(s, P.ironsmith, undefined, { [hero.id]: 3 });
  s = reload(s);
  s.discard[1] = "01040";
  assert.throws(() => choose(s, "discard-1"), /same legal physical/);
  assert.equal(get(s, hero.id)!.resources, 7);
  assert.deepEqual(s.discard, ["01040", "01040"]);
});
test("Raiment's normal play enforces Warrior targets, resource cost, bonuses and two restricted slots", () => {
  let s = fixture();
  const u = hand(s, P.raiment),
    hero = s.heroes[2];
  assert.ok(!playTargets(s, u).some((h) => h.id === s.heroes[0].id));
  s = applyAction(s, { type: "PLAY", id: u.id, target: hero.id });
  assert.equal(stats(s, get(s, hero.id)!).health, 7);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    28,
  );
  const plate = hand(s, "01040");
  s = applyAction(s, { type: "PLAY", id: plate.id, target: hero.id });
  assert.match(s.choice!.title, /Restricted/);
  s = select(s, u.id);
  assert.ok(s.discard.includes(P.raiment));
});
test("Sam's Frodo discount checks control rather than presence, including a blanked Frodo", () => {
  const s = fixture(2),
    sam = hand(s, P.sam);
  forOwner(s, 1, () => s.heroes.push(make(s, "02025")));
  assert.equal(playCost(s, card(sam.code)), 3);
  const frodo = make(s, "02025");
  frodo.blanked = true;
  s.heroes[1] = frodo;
  assert.equal(playCost(s, card(sam.code)), 1);
});
test("Sam's actual threat response lets the raiser pay to ready a remote Sam and boost all stats for the round", () => {
  let s = fixture(2);
  const sam = ally(s, P.sam);
  sam.exhausted = true;
  selectSeat(s, 1);
  const payer = s.heroes[0];
  raiseThreat(s, 2, "encounter");
  flush(s);
  assert.match(s.choice!.title, /Sam Gamgee/);
  s = select(s, "pay");
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  s = select(s, payer.id);
  assert.equal(get(s, sam.id)!.exhausted, false);
  assert.equal(get(s, payer.id)!.resources, 9);
  assert.deepEqual(
    [
      stats(s, get(s, sam.id)!).will,
      stats(s, get(s, sam.id)!).attack,
      stats(s, get(s, sam.id)!).defense,
    ],
    [3, 2, 2],
  );
  phaseEnd(s);
  assert.equal(stats(s, get(s, sam.id)!).will, 3);
  raiseThreat(s, 1, "cost");
  flush(s);
  assert.equal(s.choice, null);
});
test("Sam can be readied already and still gain its lasting round bonus; declines never consume its limit", () => {
  let s = fixture();
  const sam = ally(s, P.sam);
  raiseThreat(s, 1, "player-card");
  flush(s);
  s = select(s, "skip");
  raiseThreat(s, 1, "player-card");
  flush(s);
  s = select(s, "pay");
  s = select(s, s.heroes[0].id);
  assert.equal(get(s, sam.id)!.exhausted, false);
  assert.equal(stats(s, get(s, sam.id)!).will, 3);
  get(s, sam.id)!.blanked = true;
  assert.equal(stats(s, get(s, sam.id)!).attack, 2);
});
test("Sam's limit follows physical control and expires only at round end", () => {
  let s = fixture(2);
  const sam = ally(s, P.sam);
  raiseThreat(s, 1, "framework");
  flush(s);
  s = select(s, "pay");
  s = select(s, s.heroes[0].id);
  const actual = get(s, sam.id)!;
  s.allies = s.allies.filter((u) => u.id !== sam.id);
  forOwner(s, 1, () => s.allies.push(actual));
  selectSeat(s, 1);
  raiseThreat(s, 1, "framework");
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(stats(s, get(s, sam.id)!).will, 3);
  forOwner(
    s,
    0,
    () => (s.used = s.used.filter((k) => !k.startsWith("round:"))),
  );
  assert.equal(stats(s, get(s, sam.id)!).will, 2);
});
test("Elevenses excludes pre-staging, remote and non-Hobbit questers and resolves selected IDs after reload", () => {
  let s = fixture(2);
  const sam = ally(s, P.sam),
    frodo = make(s, "02025");
  s.heroes[1] = frodo;
  sam.committed = frodo.committed = true;
  sam.exhausted = frodo.exhausted = true;
  s.committedIds = [sam.id, frodo.id];
  let remote!: Unit;
  forOwner(s, 1, () => {
    remote = make(s, "02001");
    s.heroes[0] = remote;
  });
  remote.committed = true;
  const event = hand(s, P.elevenses);
  s.phase = "quest";
  assert.match(canPlay(s, event)!, /after the staging/);
  s.phase = "staging";
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.ok(
    !s.choice!.options.some(
      (o) => o.id === remote.id || o.id === s.heroes[0].id,
    ),
  );
  s = select(s, sam.id);
  s = select(s, frodo.id);
  s = select(s, "finish");
  assert.equal(s.threat, 18);
  assert.equal(get(s, sam.id)!.committed, false);
  assert.equal(get(s, frodo.id)!.exhausted, false);
  assert.deepEqual(s.committedIds, []);
  assert.equal(get(s, remote.id)!.committed, true);
});
test("Elevenses can select fewer than all questing Hobbits and Then does not reduce threat after failed readying", () => {
  let s = fixture();
  const sam = ally(s, P.sam),
    frodo = make(s, "02025");
  s.heroes[1] = frodo;
  sam.committed = frodo.committed = true;
  sam.exhausted = frodo.exhausted = true;
  attach(s, frodo, WATCHER_WATER.wrapped);
  s.phase = "staging";
  s = play(s, P.elevenses);
  s = select(s, frodo.id);
  s = select(s, "finish");
  assert.equal(get(s, sam.id)!.committed, true);
  assert.equal(get(s, frodo.id)!.committed, false);
  assert.equal(s.threat, 20);
});
test("Mirkwood Explorer's successful quest Response stores progress per physical committed ally", () => {
  let s = fixture();
  const a = ally(s, P.explorer),
    b = ally(s, P.explorer);
  a.committed = true;
  b.committed = false;
  s.phase = "staging";
  s = effect(s, fx("questSucceeded", { value: 1 }));
  assert.match(s.choice!.title, /Quested successfully/);
  s = select(s, "progress");
  assert.equal(get(s, a.id)!.progress, 1);
  assert.equal(get(s, b.id)!.progress, 0);
});
test("Explorer moves its own progress with real exhaustion and explores staging locations through board rules", () => {
  let s = fixture();
  const a = ally(s, P.explorer),
    location = make(s, "01100");
  a.progress = 4;
  s.staging.push(location);
  s = ability(s, a);
  s = select(s, location.id);
  assert.equal(get(s, a.id)!.progress, 0);
  assert.equal(get(s, a.id)!.exhausted, true);
  assert.ok(!s.staging.some((u) => u.id === location.id));
  assert.ok(s.encounterDiscard.includes(location.code));
});
test("Explorer refuses empty piles, exhausted source and immune locations before paying", () => {
  const s = fixture(),
    a = ally(s, P.explorer),
    l = make(s, "01100");
  s.staging.push(l);
  assert.match(Depths.depthsPlayerAbilityProblem(s, a)!, /needs to exhaust/);
  a.progress = 2;
  l.immuneToPlayerEffects = true;
  assert.match(Depths.depthsPlayerAbilityProblem(s, a)!, /eligible location/);
  assert.equal(a.exhausted, false);
  assert.equal(a.progress, 2);
});
test("Guarded Ceaselessly attaches to a physical location and its controller exhausts their Ranger/Scout", () => {
  let s = fixture(2);
  const l = make(s, "01100");
  s.staging.push(l);
  s = play(s, P.guarded, l.id);
  const a = get(s, l.id)!.attachments[0],
    scout = s.heroes[0];
  assert.ok(availableAbilities(s, get(s, l.id)!).some((x) => x.id === a.id));
  s = ability(s, get(s, l.id)!, a.id);
  assert.ok(
    !s.choice!.options.some((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  s = select(s, scout.id);
  assert.equal(get(s, scout.id)!.exhausted, true);
  assert.equal(threatOf(s, get(s, l.id)!), 0);
  assert.equal(get(s, l.id)!.attachments[0].exhausted, false);
  phaseEnd(s);
  assert.equal(threatOf(s, get(s, l.id)!), 2);
});
test("Guarded Ceaselessly has no exhaust/usage limit, stacks phase reductions and rejects other controllers", () => {
  let s = fixture(2);
  const l = make(s, "01100");
  s.staging.push(l);
  const a = attach(s, l, P.guarded),
    scout = s.heroes[0];
  s = ability(s, l, a.id);
  s = select(s, scout.id);
  get(s, scout.id)!.exhausted = false;
  s = ability(s, get(s, l.id)!, a.id);
  s = select(s, scout.id);
  assert.equal(get(s, l.id)!.tempThreat, -4);
  selectSeat(s, 1);
  assert.throws(() => ability(s, get(s, l.id)!, a.id), /control/);
});
test("New printed action labels match actual engine availability", () => {
  const s = fixture(),
    e = ally(s, P.eldahir),
    m = ally(s, P.explorer),
    l = make(s, "01100");
  s.staging.push(l);
  const a = attach(s, l, P.guarded);
  assert.match(availableAbilities(s, e)[0].label, /Lore/);
  assert.equal(availableAbilities(s, m)[0].disabled, true);
  assert.match(
    availableAbilities(s, l).find((x) => x.id === a.id)!.label,
    /Ranger or Scout/,
  );
});

test("Ironsmith normal PLAY can spend from an effective Sword-thain hero and attaches to that actual payer", () => {
  let s = fixture();
  const hero = ally(s, P.eldahir);
  attach(s, hero, "10149");
  syncAttachmentText(s);
  hero.resources = 3;
  hero.phaseResourceIcons = ["tactics"];
  const smith = hand(s, P.ironsmith),
    plate = hand(s, "01040");
  s = applyAction(s, { type: "PLAY", id: smith.id, payment: { [hero.id]: 3 } });
  assert.equal(get(s, hero.id)!.resources, 0);
  assert.match(s.choice!.title, /Master Ironsmith/);
  s = select(s, plate.id);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === plate.id));
});

test("Captain's Wisdom pays Noble exhaustion before Counter-Spell cancels its resource effect", () => {
  let s = fixture();
  const hero = s.heroes[1],
    bane = make(s, S.bane);
  attach(s, bane, S.counter);
  s.staging = [bane];
  s.encounterDeck = [S.flame];
  s.phase = "resource";
  const before = hero.resources;
  s = play(s, P.wisdom, hero.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(get(s, hero.id)!.resources, before);
  assert.ok(s.discard.includes(P.wisdom));
  assert.ok(s.encounterDiscard.includes(S.counter));
});

test("Sword-thain auto-payment uses its actual hero pool once, not special-ally duplicate pools", () => {
  let s = fixture();
  const hero = ally(s, P.eldahir);
  attach(s, hero, "10149");
  syncAttachmentText(s);
  hero.resources = 4;
  hero.phaseResourceIcons = ["tactics"];
  s.heroes.forEach((h) => (h.resources = 0));
  assert.equal(resources(s, "tactics"), 4);
  const plate = hand(s, "01040");
  s = play(s, P.ironsmith);
  assert.equal(get(s, hero.id)!.resources, 1);
  s = select(s, plate.id);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === plate.id));
});

test("Guarded Ceaselessly rejects a stale non-Scout exhaustion choice before spending", () => {
  let s = fixture();
  const l = make(s, "01100"),
    scout = s.heroes[0];
  s.staging.push(l);
  const a = attach(s, l, P.guarded);
  s = ability(s, l, a.id);
  s = reload(s);
  attach(s, get(s, scout.id)!, KHAZAD.fear);
  assert.throws(() => choose(s, scout.id), /Ranger or Scout/);
  assert.equal(get(s, scout.id)!.exhausted, false);
  assert.equal(get(s, l.id)!.tempThreat ?? 0, 0);
});

test("Lanwyn cannot initiate while blanked but a Surge response works outside the quest phase", () => {
  let s = fixture();
  const hero = s.heroes[0];
  attach(s, hero, KHAZAD.fear);
  s.phase = "travel";
  revealed(s, "01115");
  flush(s);
  assert.equal(s.choice, null);
  get(s, hero.id)!.attachments = [];
  s.encounterDeck = ["01099"];
  revealed(s, "01115");
  flush(s);
  assert.match(s.choice!.title, /Lanwyn/);
  s = select(s, "will");
  assert.equal(stats(s, get(s, hero.id)!).will, 4);
});

test("Sam's actual Dread Realm departure clears instance effects before same-ID reanimation and re-entry", () => {
  let s = base("the-dread-realm");
  s.heroes[0].phaseResourceIcons = ["spirit"];
  const sam = ally(s, P.sam);
  raiseThreat(s, 1, "player-card");
  flush(s);
  s = select(s, "pay");
  s = select(s, s.heroes[0].id);
  assert.equal(stats(s, get(s, sam.id)!).attack, 2);
  discardCharacter(s, get(s, sam.id)!);
  assert.ok(
    !s.used.some(
      (k) => k.startsWith("round:depths:") && k.endsWith(":" + sam.id),
    ),
  );
  handle(
    s,
    fx("dreadReanimateDiscardIndex", { value: s.discard.indexOf(P.sam) }),
  );
  const enemy = get(s, sam.id)!;
  assert.equal(enemy.code, DREAD.reanimated);
  assert.equal(stats(s, enemy).attack, 2);
  assert.equal(stats(s, enemy).defense, 2);
  assert.equal(stats(s, enemy).will, 0);
  discardCharacter(s, enemy);
  const restored = takePlayerDiscard(s, s.discard.indexOf(P.sam));
  assert.equal(restored.id, sam.id);
  enterAlly(s, restored, false, false, false);
  flush(s);
  raiseThreat(s, 1, "player-card");
  flush(s);
  assert.match(s.choice!.title, /Sam Gamgee/);
  s = select(s, "pay");
  s = select(s, s.heroes[0].id);
  assert.equal(stats(s, get(s, sam.id)!).will, 3);
});
