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
import { fx, get, make, stats, draw } from "../src/game/core";
import {
  charactersCommitted,
  enemyAddedToStaging,
  discardPlayerDeck,
  phaseEnd,
  engage,
  check,
  raiseThreat,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allHeroes,
  forOwner,
  seatView,
  selectSeat,
  ownerOf,
  hasKeyword,
} from "../src/game/table";
import { hasTrait } from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import { angmarSyncSwordThain } from "../src/game/angmar-player";
import { WATCHER_WATER } from "../src/game/watcher-water";
import { TEMPLE as QUEST } from "../src/game/temple-support";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import { THARBAD } from "../src/game/tharbad-support";
import * as Temple from "../src/game/temple-player";
import {
  TEMPLE_PLAYER as P,
  TEMPLE_PLAYER_CARDS,
} from "../src/game/temple-player-support";
import { FOUNDATIONS_STONE as FOUNDATIONS } from "../src/game/foundations-stone-support";
import { foundationsSelectArea } from "../src/game/foundations-stone-support";
import * as MapFixture from "./temple-fixtures";
import {
  base as scenarioBase,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import {
  templePlayerFixture as fixture,
  templePlayerHand as hand,
  templePlayerAlly as ally,
  templePlayerAttach as attach,
} from "./temple-player-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const select = (s: GameState, id: string) => choose(reload(s), id);
function effect(s: GameState, e: Effect) {
  s.queue.push(e);
  flush(s);
  return s;
}
function ability(s: GameState, u: Unit) {
  return applyAction(s, { type: "ABILITY", id: u.id });
}
function play(s: GameState, code: string, target?: string) {
  const u = hand(s, code);
  return applyAction(s, { type: "PLAY", id: u.id, target });
}
function committed(s: GameState, chars: Unit[]) {
  s.phase = "quest";
  for (const u of chars) {
    u.committed = true;
    u.exhausted = true;
  }
  s.committedIds = chars
    .filter((u) => ownerOf(s, u) === (s.table?.active ?? 0))
    .map((u) => u.id);
  charactersCommitted(
    s,
    chars,
    chars.map((u) => u.id),
  );
  flush(s);
  return s;
}
function defense(s: GameState, enemy: Unit, defender: Unit) {
  s.phase = "defense";
  s.engaged.push(enemy);
  s.combat = null;
  enemy.shadows = ["01104"];
  enemy.faceupShadows = [false];
  return applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
}

test("Temple player promotion preserves10 canonical identities and28 printed physical cards", () => {
  const source = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    TEMPLE_PLAYER_CARDS,
    source.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.elfhelm),
    ),
  );
  assert.equal(TEMPLE_PLAYER_CARDS.length, 10);
  assert.equal(
    TEMPLE_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    28,
  );
  for (const c of TEMPLE_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(
      card(c.code).text,
      c.code === P.ceorl ? `Action: ${c.text}` : c.text,
      "only Ceorl's scan-verified missing Action label is normalized at runtime",
    );
  }
});
test("Elfhelm's Mount bonuses apply across seats with effective resource icons", () => {
  const s = fixture(2),
    own = s.heroes[2],
    remote = seatView(s, 1).heroes[0];
  own.phaseResourceIcons = [];
  remote.phaseResourceIcons = ["spirit", "tactics", "leadership"];
  attach(s, own, "10059");
  attach(s, remote, "10059");
  const base = card(remote.code);
  assert.deepEqual(
    [stats(s, remote).will, stats(s, remote).attack, stats(s, remote).defense],
    [
      (base.willpower ?? 0) + 1,
      (base.attack ?? 0) + 1,
      (base.defense ?? 0) + 1,
    ],
  );
  assert.equal(stats(s, own).attack, (card(own.code).attack ?? 0) + 1);
  remote.attachments = [];
  assert.equal(stats(s, remote).will, base.willpower);
});
test("Elfhelm recognizes a Sword-thain hero but never boosts an ordinary mounted ally", () => {
  const s = fixture(),
    u = ally(s, P.ceorl),
    normal = ally(s, P.outrider);
  attach(s, u, "10059");
  const sword = JSON.parse(fs.readFileSync("public/catalog.json", "utf8")).find(
    (c: { name: string }) => c.name === "Sword-thain",
  ).code;
  attach(s, u, sword);
  attach(s, normal, "10059");
  angmarSyncSwordThain(s);
  assert.ok(allHeroes(s).some((h) => h.id === u.id));
  assert.equal(stats(s, u).defense, 1);
  assert.equal(stats(s, normal).will, card(P.outrider).willpower);
});
test("Armored Destrier legal play accepts gained Leadership and Sentinel across seats and consumes Restricted capacity", () => {
  let s = fixture(2);
  const event = hand(s, P.destrier),
    remote = seatView(s, 1).heroes[0];
  for (const h of allHeroes(s)) h.phaseResourceIcons = [];
  remote.phaseResourceIcons = ["leadership"];
  assert.ok(needsTarget(event));
  assert.ok(playTargets(s, event).some((h) => h.id === remote.id));
  s = applyAction(s, { type: "PLAY", id: event.id, target: remote.id });
  assert.ok(get(s, remote.id)!.attachments.some((a) => a.id === event.id));
  reload(s);
});
test("Ceorl any-player Action pays from the initiating seat and preserves ownership after control transfer", () => {
  let s = fixture(2);
  const u = ally(s, P.ceorl);
  u.exhausted = true;
  selectSeat(s, 1);
  const payer = s.heroes[0],
    before = payer.resources;
  assert.ok(availableAbilities(s, get(s, u.id)!).some((a) => !a.disabled));
  s = ability(s, get(s, u.id)!);
  s = select(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, before - 1);
  assert.equal(get(s, u.id)!.exhausted, false);
  s = select(s, "player-1");
  assert.equal(ownerOf(s, get(s, u.id)!), 1);
  assert.equal(get(s, u.id)!.owner, 0);
  assert.equal(
    seatView(s, 0).allies.some((x) => x.id === u.id),
    false,
  );
  assert.equal(
    seatView(s, 1).allies.some((x) => x.id === u.id),
    true,
  );
});
test("Ceorl physical once-per-phase limit survives transfer and declines preserve ready cost", () => {
  let s = fixture(2),
    u = ally(s, P.ceorl);
  u.exhausted = true;
  s = ability(s, u);
  s = select(s, s.heroes[0].id);
  s = select(s, "player-1");
  selectSeat(s, 1);
  get(s, u.id)!.exhausted = true;
  assert.throws(
    () => ability(s, get(s, u.id)!),
    /already acted|unavailable|phase/i,
  );
  phaseEnd(s);
  flush(s);
  selectSeat(s, 1);
  assert.equal(Temple.templePlayerAbilityProblem(s, get(s, u.id)!), null);
  s = ability(s, get(s, u.id)!);
  s = select(s, s.heroes.find((h) => h.code === "01007")!.id);
  s = select(s, "skip");
  assert.equal(ownerOf(s, get(s, u.id)!), 1);
});
test("Ceorl already ready or cannot-ready cannot pay and cannot reach Then control transfer", () => {
  const s = fixture(),
    u = ally(s, P.ceorl),
    before = s.heroes.map((h) => h.resources);
  assert.throws(() => ability(s, u), /exhausted|ready/);
  u.exhausted = true;
  attach(s, u, WATCHER_WATER.wrapped);
  assert.throws(() => ability(s, u), /ready/);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    before,
  );
});
test("Revealed in Wrath requires an own Noldor effective hero and excludes unique or immune enemies", () => {
  let s = fixture(2),
    ev = hand(s, P.wrath),
    e = make(s, "01089"),
    unique = make(s, "01082");
  unique.immuneToPlayerEffects = true;
  s.staging = [e, unique];
  assert.ok(needsTarget(ev));
  assert.match(canPlay(s, ev) ?? "", /Noldor/);
  forOwner(s, 1, () => s.heroes.push(make(s, "04001")));
  assert.match(canPlay(s, ev) ?? "", /Noldor/);
  s.heroes.push(make(s, "04001"));
  assert.equal(canPlay(s, ev), null);
  assert.ok(playTargets(s, ev).some((u) => u.id === e.id));
});
test("Wrath blanks enemy abilities and keywords while retaining printed Traits until phase end and reload", () => {
  let s = fixture();
  s.heroes.push(make(s, "04001"));
  const e = make(s, "01115");
  s.staging = [e];
  s = play(s, P.wrath, e.id);
  syncAttachmentText(s);
  assert.equal(get(s, e.id)!.blanked, true);
  assert.equal(hasTrait(get(s, e.id)!, "Creature"), true);
  s = reload(s);
  assert.equal(get(s, e.id)!.printedTraitsPreserved, true);
  phaseEnd(s);
  flush(s);
  syncAttachmentText(s);
  assert.equal(get(s, e.id)!.blanked, undefined);
  assert.equal(get(s, e.id)!.printedTraitsPreserved, undefined);
});
test("Wrath derives its Traits exception from the lasting effect rather than leaving a stale saved flag", () => {
  const s = fixture(),
    e = make(s, "01089");
  s.staging = [e];
  Temple.templePlayerEvent(s, P.wrath, e.id);
  // The exact state flag is derived again by sync rather than saved as a stale exception.
  syncAttachmentText(s);
  assert.equal(hasTrait(e, "Orc"), true);
  s.used = [];
  syncAttachmentText(s);
  assert.equal(e.printedTraitsPreserved, undefined);
});
test("Rhovanion Outrider actual commitment can explore a physical staging location", () => {
  let s = fixture(),
    u = ally(s, P.outrider),
    l = make(s, "01099");
  l.progress = 2;
  s.staging = [l];
  s = committed(s, [u]);
  assert.match(s.choice!.title, /Outrider/);
  s = select(s, l.id);
  assert.ok(!get(s, l.id));
  assert.ok(s.encounterDiscard.includes(l.code));
  assert.equal(get(s, u.id)!.tempWill, undefined);
});
test("Outrider grants phase willpower when its1 progress does not explore and expires normally", () => {
  let s = fixture(),
    u = ally(s, P.outrider),
    l = make(s, "01099");
  s.staging = [l];
  s = committed(s, [u]);
  s = select(s, l.id);
  assert.equal(get(s, l.id)!.progress, 1);
  assert.equal(stats(s, get(s, u.id)!).will, 2);
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, u.id)!).will, 1);
});
test("Outrider can target progress-preventing nonimmune Streets of Tharbad and still gain willpower", () => {
  let s = fixture(),
    u = ally(s, P.outrider),
    l = make(s, THARBAD.streets);
  s.staging = [l];
  s = committed(s, [u]);
  assert.ok(s.choice!.options.some((o) => o.id === l.id));
  s = select(s, l.id);
  assert.equal(get(s, l.id)!.progress, 0);
  assert.equal(stats(s, get(s, u.id)!).will, 2);
});
test("Outrider never offers immune location targets and declining does not add willpower", () => {
  let s = fixture(),
    u = ally(s, P.outrider),
    l = make(s, "01099");
  l.immuneToPlayerEffects = true;
  s.staging = [l];
  // Use an intrinsic immunity source, since sync derives transient immunity flags.
  Temple.templePlayerCharactersCommitted(s, [u]);
  flush(s);
  assert.equal(s.choice, null);
  l.immuneToPlayerEffects = false;
  Temple.templePlayerCharactersCommitted(s, [u]);
  flush(s);
  s = select(s, "skip");
  assert.equal(get(s, u.id)!.tempWill, undefined);
});
test("Scouting Party boosts exactly all currently controlled committed Scouts and ignores remote non-Scouts", () => {
  let s = fixture(2),
    a = ally(s, P.ceorl),
    b = ally(s, P.outrider),
    remote = seatView(s, 1).heroes[0],
    ev = hand(s, P.party);
  remote.committed = true;
  s.staging.push(make(s, "01099"));
  s = committed(s, [a, b]);
  s = select(s, "skip");
  assert.match(s.choice!.title, /Scouting Party/);
  s = select(s, ev.id);
  assert.equal(stats(s, get(s, a.id)!).will, 3);
  assert.equal(stats(s, get(s, b.id)!).will, 3);
  assert.equal(get(s, remote.id)!.tempWill, undefined);
  assert.ok(s.discard.includes(P.party));
  reload(s);
});
test("Scouting Party is never playable with empty commitment or any own committed non-Scout", () => {
  const s = fixture(),
    ev = hand(s, P.party),
    a = ally(s, P.ceorl);
  assert.match(canPlay(s, ev) ?? "", /Scout|commit/i);
  Temple.templePlayerCharactersCommitted(s, []);
  flush(s);
  assert.equal(s.choice, null);
  s.heroes[2].committed = true;
  a.committed = true;
  Temple.templePlayerCharactersCommitted(s, [a]);
  flush(s);
  assert.equal(s.choice, null);
});
test("Entangling Nets is a physical unattached Trap and does not attach retroactively", () => {
  let s = fixture();
  const old = make(s, "01089");
  s.staging = [old];
  const ev = hand(s, P.nets);
  assert.equal(needsTarget(ev), false);
  s = applyAction(s, { type: "PLAY", id: ev.id });
  assert.ok(s.staging.some((u) => u.id === ev.id));
  assert.equal(get(s, old.id)!.attachments.length, 0);
  const next = make(s, "01089");
  s.staging.push(next);
  enemyAddedToStaging(s, next);
  flush(s);
  assert.ok(!s.staging.some((u) => u.id === ev.id));
  assert.equal(next.attachments[0].id, ev.id);
  assert.equal(stats(s, next).attack, 0);
  assert.equal(stats(s, next).defense, 0);
  reload(s);
});
test("Nets waits through immune staging entry and attaches every waiting copy to next eligible enemy", () => {
  const s = fixture(),
    a = make(s, P.nets),
    b = make(s, P.nets),
    protectedEnemy = make(s, "01089");
  s.staging = [a, b, protectedEnemy];
  protectedEnemy.immuneToPlayerEffects = true;
  Temple.templePlayerEnemyEntered(s, protectedEnemy);
  assert.equal(s.staging.filter((u) => u.code === P.nets).length, 2);
  const e = make(s, "01089");
  s.staging.push(e);
  Temple.templePlayerEnemyEntered(s, e);
  assert.equal(e.attachments.length, 2);
  assert.equal(stats(s, e).attack, 0);
});
test("Arrows rejects pre-check play and any actual engagement history survives return to staging and reload", () => {
  let s = fixture();
  s.phase = "encounter";
  const e = make(s, "01083"),
    ev = hand(s, P.arrows);
  s.staging = [e];
  assert.match(canPlay(s, ev) ?? "", /checks/);
  Temple.templePlayerEngagementChecksDone(s);
  assert.equal(canPlay(s, ev), null);
  engage(s, e);
  flush(s);
  s.queue = [];
  s.choice = null;
  s.engaged = [];
  s.staging.push(e);
  s = reload(s);
  assert.match(canPlay(s, s.hand[0]) ?? "", /engaged/);
});
test("Arrows actual post-check Action damages every staging enemy and group payment spans seats after reload", () => {
  let s = fixture(2);
  s.phase = "encounter";
  const a = make(s, "01082"),
    b = make(s, "01089");
  s.staging = [a, b];
  const ev = hand(s, P.arrows);
  Temple.templePlayerEngagementChecksDone(s);
  s = applyAction(s, { type: "PLAY", id: ev.id });
  assert.equal(get(s, a.id)!.damage, 1);
  assert.equal(get(s, b.id)!.damage, 1);
  s = select(s, "pay");
  const own = s.heroes[2].id,
    remote = seatView(s, 1).heroes[0].id;
  s = select(s, own);
  s = select(s, remote);
  s = select(s, remote);
  assert.equal(get(s, a.id)!.damage, 3);
  assert.ok(!get(s, b.id));
  assert.equal(get(s, remote)!.resources, 8);
  reload(s);
});
test("Arrows initial damage prevention blocks its dependent Then group cost, even if another enemy takes damage", () => {
  const s = fixture();
  s.phase = "encounter";
  const a = make(s, "01082"),
    b = make(s, "01089");
  b.roundCannotTakeDamage = true;
  s.staging = [a, b];
  Temple.templePlayerEvent(s, P.arrows);
  flush(s);
  assert.equal(a.damage, 1);
  assert.equal(b.damage, 0);
  assert.equal(s.choice, null);
});
test("Arrows skips immune enemies and never offers group cost after first damage destroys every affected enemy", () => {
  const s = fixture(),
    a = make(s, "01089"),
    immune = make(s, QUEST.guardian);
  a.damage = 2;
  immune.immuneToPlayerEffects = true;
  s.staging = [a, immune];
  Temple.templePlayerEvent(s, P.arrows);
  flush(s);
  assert.ok(!get(s, a.id));
  assert.equal(immune.damage, 0);
  assert.equal(s.choice, null);
});
test("Actual all-player engagement checks expose optional Arrows window before combat with high-engagement staging enemy", () => {
  let s = fixture(2);
  s.phase = "encounter";
  forOwner(s, 0, () => (s.threat = 10));
  forOwner(s, 1, () => (s.threat = 10));
  s.staging = [make(s, "01083")];
  const ev = hand(s, P.arrows, 1);
  s = applyAction(s, { type: "NEXT" });
  if (s.phase === "encounter" && !s.choice)
    s = applyAction(s, { type: "NEXT" });
  assert.match(s.choice!.title, /After engagement checks/);
  assert.ok(s.choice!.options.some((o) => o.id === ev.id));
  s = select(s, "skip");
  assert.ok(["defense", "attack"].includes(s.phase));
  reload(s);
});
test("Armored Destrier actual defense readies hero and discards a hidden shadow from another engaged enemy", () => {
  let s = fixture(),
    hero = s.heroes[2],
    a = attach(s, hero, P.destrier),
    attacker = make(s, "01089"),
    other = make(s, "01083");
  other.shadows = ["01099"];
  other.faceupShadows = [false];
  s.engaged = [other];
  s = defense(s, attacker, hero);
  assert.match(s.choice!.title, /Armored Destrier/);
  s = select(s, "ready");
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.equal(
    get(s, hero.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
  assert.equal(s.choice!.options[0].code, undefined);
  assert.ok(!JSON.stringify(publicState(s)).includes('"code":"01099"'));
  s = select(s, `${other.id}-0`);
  assert.deepEqual(get(s, other.id)!.shadows, []);
  assert.ok(s.encounterDiscard.includes("01099"));
});
test("Destrier Then uses attack's defending seat for a remote Sentinel, excludes attacker and owner's enemies", () => {
  let s = fixture(2),
    hero = seatView(s, 1).heroes[2],
    attacker = make(s, "01089"),
    ownOther = make(s, "01083"),
    remoteOther = make(s, "01083");
  attach(s, hero, P.destrier, 1);
  attach(s, hero, "02117", 1);
  hero.exhausted = true;
  ownOther.shadows = ["01099"];
  remoteOther.shadows = ["01104"];
  s.engaged = [attacker, ownOther];
  forOwner(s, 1, () => (s.engaged = [remoteOther]));
  Temple.templePlayerAfterDefense(s, attacker.id, [hero.id], 0);
  flush(s);
  s = select(s, "ready");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [`${ownOther.id}-0`],
  );
  s = select(s, `${ownOther.id}-0`);
  assert.equal(get(s, remoteOther.id)!.shadows.length, 1);
});
test("Destrier cannot initiate when ready effect fails and preserves unexhausted attachment", () => {
  const s = fixture(),
    hero = s.heroes[2],
    a = attach(s, hero, P.destrier);
  hero.exhausted = true;
  attach(s, hero, WATCHER_WATER.wrapped);
  Temple.templePlayerAfterDefense(s, "fake", [hero.id], 0);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(a.exhausted, false);
});
test("Déorwine actual shadow cancellation lets another player's gained Leadership hero pay", () => {
  let s = fixture(2),
    defender = ally(s, P.deorwine),
    e = make(s, "01089"),
    payer = seatView(s, 1).heroes[0];
  payer.phaseResourceIcons = ["leadership"];
  s.phase = "defense";
  e.shadows = ["01089"];
  e.faceupShadows = [false];
  s.engaged = [e];
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: defender.id,
  });
  assert.match(s.choice!.title, /shadow/i);
  const id = `temple-deorwine-${payer.id}`;
  assert.ok(s.choice!.options.some((o) => o.id === id));
  s = select(s, id);
  assert.equal(get(s, payer.id)!.resources, 9);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, e.id)!.roundAttackBonus, undefined);
  reload(s);
});
test("Déorwine offers no cancellation while another character defends or the shadow has no effect", () => {
  const s = fixture(),
    d = ally(s, P.deorwine),
    e = make(s, "01089");
  s.engaged = [e];
  s.combat = {
    enemyId: e.id,
    defenderId: s.heroes[2].id,
    attackBonus: 0,
    attackPlayer: 0,
  };
  assert.deepEqual(Temple.templePlayerShadowOptions(s, "01089", true), []);
  s.combat.defenderId = d.id;
  assert.deepEqual(Temple.templePlayerShadowOptions(s, "01099", false), []);
});
test("Ered Luin Miner actual bulk deck discard enters from its physical discard after optional response and reload", () => {
  let s = fixture();
  s.deck = ["01020", P.miner, "01021"];
  discardPlayerDeck(s, 3);
  flush(s);
  assert.match(s.choice!.title, /Ered Luin Miner/);
  s = select(s, "enter");
  assert.equal(s.allies.filter((u) => u.code === P.miner).length, 1);
  assert.deepEqual(s.discard, ["01020", "01021"]);
  assert.equal(s.deck.length, 0);
  reload(s);
});
test("Miner drawn into hand or discarded from hand is not a deck-discard trigger", () => {
  const s = fixture();
  s.deck = [P.miner];
  draw(s, 1);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.hand[0].code, P.miner);
  s.hand = [];
  s.discard = [P.miner];
  flush(s);
  assert.equal(s.choice, null);
});

test("Ceorl retains Sword-thain hero status in the recipient's physical hero zone", () => {
  let s = fixture(2);
  const u = ally(s, P.ceorl);
  attach(s, u, "10149");
  u.resources = 2;
  u.exhausted = true;
  angmarSyncSwordThain(s);
  s = ability(s, u);
  s = select(s, s.heroes[0].id);
  s = select(s, "player-1");
  assert.ok(seatView(s, 1).heroes.some((h) => h.id === u.id));
  assert.ok(!seatView(s, 0).heroes.some((h) => h.id === u.id));
  assert.equal(get(s, u.id)!.owner, 0);
  reload(s);
});
test("Wrath accepts a gained Noldor effective hero and removes printed Surge without losing Creature", () => {
  let s = fixture();
  const h = ally(s, P.ceorl);
  attach(s, h, "10149");
  attach(s, h, "10093");
  angmarSyncSwordThain(s);
  const crows = make(s, "01115");
  s.staging = [crows];
  s = play(s, P.wrath, crows.id);
  assert.equal(hasTrait(get(s, crows.id)!, "Creature"), true);
  assert.equal(hasKeyword(get(s, crows.id)!, "Surge"), false);
});

test("Wrath lasting blanking survives caster elimination then expires through shared phase cleanup", () => {
  let s = fixture(2);
  s.heroes.push(make(s, "04001"));
  const enemy = make(s, "01115");
  s.staging = [enemy];
  s = play(s, P.wrath, enemy.id);
  selectSeat(s, 0);
  raiseThreat(s, 30);
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.status, "playing");
  s = reload(s);
  syncAttachmentText(s);
  assert.equal(get(s, enemy.id)!.blanked, true);
  phaseEnd(s);
  flush(s);
  syncAttachmentText(s);
  assert.equal(get(s, enemy.id)!.blanked, undefined);
});
test("Destrier response revalidates a ready failure after reload without exhausting its cost", () => {
  let s = fixture();
  const h = s.heroes[2],
    a = attach(s, h, P.destrier);
  h.exhausted = true;
  Temple.templePlayerAfterDefense(s, "fake", [h.id], 0);
  flush(s);
  s = reload(s);
  attach(s, get(s, h.id)!, WATCHER_WATER.wrapped);
  assert.throws(() => choose(s, "ready"), /must be able to ready/);
  assert.equal(
    get(s, h.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    false,
  );
});
test("Arrows group payment remains unspent until all three physical resource selections are made", () => {
  let s = fixture(2);
  s.phase = "encounter";
  s.staging = [make(s, "01082")];
  Temple.templePlayerEvent(s, P.arrows);
  flush(s);
  s = select(s, "pay");
  const payer = s.heroes[2];
  s = select(s, payer.id);
  s = select(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, 10);
  s = select(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, 7);
  assert.equal(s.staging[0].damage, 3);
  reload(s);
});
test("Nets next-entry condition is scoped to the actual new staging object", () => {
  const s = fixture(),
    trap = make(s, P.nets),
    old = make(s, "01089"),
    engaged = make(s, "01089");
  s.staging = [trap, old];
  s.engaged = [engaged];
  Temple.templePlayerEnemyEntered(s, engaged);
  assert.equal(trap.attachments.length, 0);
  assert.equal(s.staging.length, 2);
});

test("Outrider's eighth progress on revealed staging Grotto wins while preserving the map location", () => {
  let s = MapFixture.base();
  MapFixture.setActive(s, QUEST.jungle, 1, 3);
  const grotto = MapFixture.setFace(
    s,
    MapFixture.cell(s, 1, 4).id,
    QUEST.grotto,
  );
  grotto.progress = 7;
  const u = MapFixture.add(s, P.outrider, "allies");
  s = committed(s, [u]);
  assert.ok(s.choice!.options.some((o) => o.id === grotto.id));
  s = select(s, grotto.id);
  assert.equal(s.status, "won");
  assert.equal(get(s, grotto.id)!.progress, 8);
  assert.ok(s.staging.some((l) => l.id === grotto.id));
  assert.equal(get(s, u.id)!.tempWill, 1);
  reload(s);
});
test("Outrider reaching ordinary Temple map quest points does not explore before departure and still grants willpower", () => {
  let s = MapFixture.base();
  MapFixture.setActive(s, QUEST.jungle, 1, 1);
  const loc = MapFixture.setFace(s, MapFixture.cell(s, 1, 2).id, QUEST.graves);
  loc.progress = (card(QUEST.graves).quest ?? 0) - 1;
  const u = MapFixture.add(s, P.outrider, "allies");
  s = committed(s, [u]);
  s = select(s, loc.id);
  assert.ok(s.staging.some((l) => l.id === loc.id));
  assert.equal(get(s, u.id)!.tempWill, 1);
  assert.ok(!s.encounterDiscard.includes(loc.code));
  reload(s);
});

test("Destrier offers each eligible defender separately after an actual Stand Together defense", () => {
  let s = fixture();
  s.phase = "defense";
  s.standTogether = true;
  const first = s.heroes[0],
    second = s.heroes[1];
  attach(s, first, P.destrier);
  attach(s, second, P.destrier);
  const enemy = make(s, "01089");
  enemy.shadows = ["01104"];
  enemy.faceupShadows = [false];
  s.engaged = [enemy];
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderIds: [first.id, second.id],
  });
  assert.match(s.choice!.title, /Armored Destrier/);
  s = select(s, "ready");
  assert.equal(get(s, first.id)!.exhausted, false);
  assert.match(s.choice!.title, /Armored Destrier/);
  s = select(s, "ready");
  assert.equal(get(s, second.id)!.exhausted, false);
  reload(s);
});
test("Wrath excludes intrinsic unique and player-immune enemy targets before paying", () => {
  const s = fixture();
  s.heroes.push(make(s, "04001"));
  const boss = make(s, QUEST.guardian),
    unique = make(s, SHADOW_FLAME.bane);
  s.staging = [boss, unique];
  const event = hand(s, P.wrath);
  assert.deepEqual(playTargets(s, event), []);
  const before = s.heroes.map((h) => h.resources);
  assert.throws(
    () => applyAction(s, { type: "PLAY", id: event.id, target: boss.id }),
    /non.unique|cannot|affected|target/i,
  );
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    before,
  );
});

test("Actual COMMIT controls offer Outrider then Scouting Party before encounter staging", () => {
  let s = fixture();
  s.phase = "quest";
  const out = ally(s, P.outrider),
    scout = ally(s, P.ceorl),
    loc = make(s, "01099"),
    party = hand(s, P.party);
  s.staging = [loc];
  s = applyAction(s, { type: "TOGGLE_QUEST", id: out.id });
  s = applyAction(s, { type: "TOGGLE_QUEST", id: scout.id });
  s = applyAction(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Outrider/);
  s = select(s, loc.id);
  assert.match(s.choice!.title, /Scouting Party/);
  s = select(s, party.id);
  assert.equal(stats(s, get(s, out.id)!).will, 4);
  assert.equal(stats(s, get(s, scout.id)!).will, 3);
  assert.ok(s.discard.includes(P.party));
  reload(s);
});
test("Actual King Under the Mountain deck-discard action triggers Miner but keeping Miner draws it without response", () => {
  let s = fixture(),
    hero = s.heroes[2],
    king = attach(s, hero, "132018");
  s.deck = ["01020", P.miner, "01021"];
  s = applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: king.id });
  s = select(s, "keep-0");
  assert.match(s.choice!.title, /Ered Luin Miner/);
  s = select(s, "enter");
  assert.equal(s.allies.filter((u) => u.code === P.miner).length, 1);
  assert.deepEqual(s.deck, ["01021"]);
  reload(s);
  s = fixture();
  hero = s.heroes[2];
  king = attach(s, hero, "132018");
  s.deck = ["01020", P.miner, "01021"];
  s = applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: king.id });
  s = select(s, "keep-1");
  assert.equal(s.choice, null);
  assert.equal(s.hand[0].code, P.miner);
  assert.equal(s.allies.length, 0);
  reload(s);
});

test("All-area engagement checks offer Arrows to a separate Foundations fellowship before combat", () => {
  let s = scenarioBase("foundations-of-stone", 2);
  const q = s.foundationsStone!;
  q.areas = [FOUNDATIONS.lair, FOUNDATIONS.rocks].map((questCode, p) => ({
    id: `area-${p}`,
    players: [p],
    questCode,
    progress: 0,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    questDebuff: 0,
    fog: 0,
    threatModifier: 0,
  }));
  q.split = true;
  q.setAside = [];
  q.activeArea = undefined;
  q.resolvedAreas = [];
  q.travelPassedAreas = [];
  s.stage = 4;
  s.phase = "encounter";
  s.stageRevealing = false;
  foundationsSelectArea(s, 0);
  forOwner(s, 0, () => {
    s.threat = 10;
    s.staging = [make(s, "01083")];
    s.heroes[0].phaseResourceIcons = ["lore"];
  });
  const event = hand(s, P.arrows);
  forOwner(s, 1, () => {
    s.threat = 10;
  });
  selectSeat(s, 0);
  s = reload(s);
  s = applyAction(s, { type: "NEXT" });
  s = applyAction(s, { type: "NEXT" });
  assert.match(s.choice!.title, /After engagement checks/);
  assert.ok(s.choice!.options.some((o) => o.id === event.id));
  s = select(s, "skip");
  assert.ok(["attack", "defense"].includes(s.phase));
  reload(s);
});
