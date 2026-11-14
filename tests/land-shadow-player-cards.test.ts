import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import { engagementCost, get, playCost, stats } from "../src/game/core";
import { damage, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities, canPlay } from "../src/game/actions";
import { restrictedSlots } from "../src/game/expansion-passives";
import { DECK_CARDS, HERO_CARDS } from "../src/game/decks";
import { forOwner, seatView } from "../src/game/table";
import { make } from "../src/game/core";
import { LAND_SHADOW_PLAYER as P } from "../src/game/land-shadow-player-cards";
import { POM } from "../src/game/passage-marshes-support";
import { ringBearer } from "../src/game/lotr-saga";
import {
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./passage-marshes-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./land-shadow-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Replace one of a player's starting heroes (Frodo stays in slot 3). */
const hero = (s: GameState, code: string, slot: number, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    u.resources = 10;
    s.heroes[slot] = u;
  });
  return u;
};
const ally = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
/** Attach a fresh copy of a player attachment to a character. */
const attach = (s: GameState, host: Unit, code: string, p = 0) => {
  const a = { id: `c${s.nextId++}`, code, exhausted: false, owner: p };
  host.attachments.push(a);
  return a;
};
const offered = (s: GameState, code: string) =>
  !!s.choice?.options.some((o) => o.ability?.code === code);
/** Reveal an encounter card from the top of the deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
/** An engaged enemy attacks with one facedown shadow card. */
const defend = (s: GameState, enemy: Unit, defender: Unit) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = ["01104"];
  enemy.faceupShadows = [false];
  return act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: defender.id });
};
/** Answer every unrelated decision until the given card's Response is offered. */
const until = (s: GameState, code: string) => {
  for (let n = 0; n < 20 && s.choice && !offered(s, code); n++)
    s = choose(
      s,
      (
        s.choice.options.find((o) =>
          ["skip", "resolve", "undefended", "keep"].includes(o.id),
        ) ?? s.choice.options[0]
      ).id,
    );
  return s;
};
const GUARD = "01013",
  SCOUT = "01016",
  BLADE = "01039",
  SNARE = "01069",
  SPIKES = "05017",
  GIMLI = "01004",
  THEODEN = "143002",
  TROLL = "01082",
  ORCS = "01089",
  UFTHAK = "01090";

test("The Land of Shadow player cards are scripted, deckable and pinned to reviewed scans", () => {
  const codes = Object.values(P).filter((c) => c !== P.frodo);
  assert.equal(codes.length, 11);
  // Mablung is scripted with the collector cards.
  for (const code of [...codes, P.frodo, "144005"])
    assert.ok(SCRIPTED.has(code), code);
  assert.ok(!SCRIPTED.has("144014"), "Brace of Coneys needs campaign mode");
  const heroes = HERO_CARDS.map((c) => c.code),
    deckable = DECK_CARDS.map((c) => c.code);
  for (const code of [P.faramir, P.damrod])
    assert.ok(heroes.includes(code), code);
  for (const code of codes.filter((c) => c !== P.faramir && c !== P.damrod))
    assert.ok(deckable.includes(code), code);
  assert.equal(art.length, 12);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath, a.code);
  }
  // Every printed text matches the catalog; Snowmane restores Théoden's accent.
  for (const code of [...codes, P.frodo]) {
    const catalog = (official as { code: string; text?: string }[])
      .find((c) => c.code === code)!
      .text!.replace(/<\/?[bi]>/g, "");
    assert.equal(
      card(code).text!.replace(/<\/?[bi]>/g, ""),
      code === P.snowmane ? catalog.replace("Theoden", "Théoden") : catalog,
      code,
    );
  }
});

test("Faramir: after you engage an enemy, ready an exhausted ally you control, once per phase; Sméagol ignores him", () => {
  let s = base(1, 2);
  hero(s, P.faramir, 2);
  const guard = ally(s, GUARD);
  guard.exhausted = true;
  const smeagol = s.allies.find((u) => u.code === POM.smeagol)!;
  smeagol.exhausted = true;
  const troll = stage(s, TROLL);
  const orcs = stage(s, ORCS);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: troll.id });
  assert.ok(offered(s, P.faramir), JSON.stringify(s.choice?.title));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [guard.id, "skip"],
    "Sméagol cannot be readied by player cards",
  );
  s = choose(s, guard.id);
  assert.equal(get(s, guard.id)!.exhausted, false);
  assert.equal(get(s, smeagol.id)!.exhausted, true);
  // Limit once per phase: the engagement check offers nothing more.
  get(s, guard.id)!.exhausted = true;
  s.threat = 15;
  s.queue.push({ kind: "engagementRound" });
  flush(s);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.id === orcs.id));
  assert.equal(get(s, guard.id)!.exhausted, true);
  // Declined, the limit is not used; a new phase also resets it.
  s = base(1, 2);
  hero(s, P.faramir, 2);
  const second = ally(s, GUARD);
  second.exhausted = true;
  const enemy = stage(s, ORCS);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: enemy.id });
  s = choose(s, "skip");
  assert.equal(get(s, second.id)!.exhausted, true);
  // Without an exhausted ally there is nothing to offer.
  s = base(1, 2);
  hero(s, P.faramir, 2);
  s.allies.find((u) => u.code === POM.smeagol)!.exhausted = true;
  const third = stage(s, ORCS);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: third.id });
  assert.ok(!offered(s, P.faramir));
});

test("Damrod: the first Trap each round costs 1 less, and he draws a card after a Trap you control attaches to an enemy; Ambush attaches to the next enemy entering staging and lets the engaged player attack it", () => {
  let s = base(1, 2);
  const damrod = hero(s, P.damrod, 2);
  const [ambush, spikes] = hand(s, [P.ambush, SPIKES]);
  assert.equal(playCost(s, card(P.ambush)), 1);
  assert.equal(playCost(s, card(SPIKES)), 1);
  assert.equal(playCost(s, card(GUARD)), 2, "not a Trap");
  s = act(s, { type: "PLAY", id: ambush.id, payment: { [damrod.id]: 1 } });
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.id === ambush.id),
    "Ambush waits unattached in the staging area",
  );
  assert.equal(get(s, damrod.id)!.resources, 9);
  // The second Trap this round pays its full cost; a new round resets it.
  assert.equal(playCost(s, card(SPIKES)), 2);
  s.used = s.used.filter((k) => !k.startsWith("round:"));
  assert.equal(playCost(s, card(SPIKES)), 1);
  assert.ok(s.hand.some((u) => u.id === spikes.id));
  // An enemy enters the staging area: Ambush attaches, and Damrod draws.
  const drawn = s.deck.length;
  s = reveal(s, TROLL);
  s = until(s, P.damrod);
  assert.ok(offered(s, P.damrod), JSON.stringify(s.choice?.title));
  s = choose(s, "draw");
  assert.equal(s.deck.length, drawn - 1);
  const troll = s.staging.find((u) => u.code === TROLL)!;
  assert.ok(troll.attachments.some((a) => a.id === ambush.id));
  assert.ok(!s.staging.some((u) => u.id === ambush.id));
  // Ambush is a Combat Action of the engaged player.
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: troll.id });
  s = settle(s);
  const label = availableAbilities(s, get(s, troll.id)!).find((a) =>
    a.label.startsWith("Ambush"),
  )!;
  assert.ok(label.disabled, "not outside combat");
  s.phase = "defense";
  const aragorn = s.heroes.find((h) => h.code === "01001")!;
  const theodred = s.heroes.find((h) => h.code === "01002")!;
  s = act(s, { type: "ABILITY", id: troll.id, attachmentId: ambush.id });
  assert.ok(s.discard.includes(P.ambush), "Ambush is discarded");
  assert.match(s.choice!.title, /^Ambush · Declare attackers/);
  assert.ok(!s.choice!.options.some((o) => o.id === "attack"));
  s = choose(s, aragorn.id);
  s = choose(s, theodred.id);
  s = choose(s, "attack");
  s = settle(s);
  // 3 + 2 attack against the Hill Troll's 3 defense.
  assert.equal(get(s, troll.id)!.damage, 2);
  assert.equal(get(s, aragorn.id)!.exhausted, true);
  assert.equal(get(s, theodred.id)!.exhausted, true);
  assert.ok(!get(s, troll.id)!.attachments.some((a) => a.id === ambush.id));
  // A Trap played onto an engaged enemy: Forest Snare.
  s = base(1, 2);
  const lore = hero(s, P.damrod, 2);
  const orcs = engaged(s, ORCS);
  const [snare] = hand(s, [SNARE]);
  assert.equal(playCost(s, card(SNARE)), 2);
  s = act(s, {
    type: "PLAY",
    id: snare.id,
    target: orcs.id,
    payment: { [lore.id]: 2 },
  });
  s = until(s, P.damrod);
  assert.ok(offered(s, P.damrod));
  const before = s.hand.length;
  s = choose(s, "draw");
  assert.equal(s.hand.length, before + 1);
  // Declined, nothing is drawn.
  s = base(1, 2);
  const third = hero(s, P.damrod, 2);
  const orc = engaged(s, ORCS);
  const [net] = hand(s, [SNARE]);
  s = act(s, {
    type: "PLAY",
    id: net.id,
    target: orc.id,
    payment: { [third.id]: 2 },
  });
  s = until(s, P.damrod);
  const kept = s.hand.length;
  s = choose(s, "skip");
  assert.equal(s.hand.length, kept);
});

test("Anborn: after an enemy is added to the staging area, exhaust him to give it +5 engagement cost until the end of the round, then 1 damage", () => {
  let s = base(1, 2);
  const anborn = ally(s, P.anborn);
  s = reveal(s, TROLL);
  s = until(s, P.anborn);
  assert.ok(offered(s, P.anborn), JSON.stringify(s.choice?.title));
  const troll = s.staging.find((u) => u.code === TROLL)!;
  assert.equal(engagementCost(s, troll), 30);
  s = choose(s, "exhaust");
  const slowed = s.staging.find((u) => u.id === troll.id)!;
  assert.equal(get(s, anborn.id)!.exhausted, true);
  assert.equal(engagementCost(s, slowed), 35);
  assert.equal(slowed.damage, 1);
  // Exhausted, he cannot answer the next enemy.
  s = reveal(s, ORCS);
  s = settle(s);
  assert.ok(!s.log.some((l) => /Anborn: Dol Guldur Orcs/.test(l.text)));
  // The engagement cost returns at the end of the round.
  s.queue.push({ kind: "endRound" });
  flush(s);
  s = settle(s);
  const after = [...s.staging, ...s.engaged].find((u) => u.id === troll.id)!;
  assert.equal(engagementCost(s, after), 30);
  // Declined, Anborn stays ready.
  s = base(1, 2);
  const ready = ally(s, P.anborn);
  s = reveal(s, ORCS);
  s = until(s, P.anborn);
  s = choose(s, "skip");
  assert.equal(get(s, ready.id)!.exhausted, false);
});

test("Skinbark enters play exhausted, cannot have restricted attachments, and attacking alone ignores an Orc's defense", () => {
  let s = base(1, 2);
  const gimli = hero(s, GIMLI, 2);
  const [ent] = hand(s, [P.skinbark]);
  s = act(s, { type: "PLAY", id: ent.id, payment: { [gimli.id]: 3 } });
  s = settle(s);
  const skinbark = s.allies.find((u) => u.code === P.skinbark)!;
  assert.equal(skinbark.exhausted, true);
  const [blade] = hand(s, [BLADE]);
  assert.ok(!playTargets(s, blade).some((u) => u.id === skinbark.id));
  assert.ok(playTargets(s, blade).length > 0);
  // Alone against Chieftain Ufthak (Orc, 3 defense): his 4 attack in full.
  skinbark.exhausted = false;
  assert.equal(stats(s, skinbark).attack, 4);
  const ufthak = engaged(s, UFTHAK);
  s.phase = "attack";
  s = act(s, {
    type: "ATTACK",
    enemyId: ufthak.id,
    attackerIds: [skinbark.id],
  });
  s = settle(s);
  assert.equal(get(s, ufthak.id)!.damage, 4);
  // With another attacker the defense counts.
  s = base(1, 2);
  const tree = ally(s, P.skinbark);
  const frodo = ringBearer(s)!;
  const chief = engaged(s, UFTHAK);
  s.phase = "attack";
  s = act(s, {
    type: "ATTACK",
    enemyId: chief.id,
    attackerIds: [tree.id, frodo.id],
  });
  s = settle(s);
  assert.equal(get(s, chief.id)!.damage, stats(s, frodo).attack + 4 - 3);
  // Alone against a Troll the defense counts.
  s = base(1, 2);
  const third = ally(s, P.skinbark);
  const troll = engaged(s, TROLL);
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: troll.id, attackerIds: [third.id] });
  s = settle(s);
  assert.equal(get(s, troll.id)!.damage, 4 - 3);
});

test("Gamling: after a Rohan ally you control is discarded from play, exhaust him to return it to your hand", () => {
  let s = base(1, 2);
  const gamling = ally(s, P.gamling);
  const scout = ally(s, SCOUT);
  const guard = ally(s, GUARD);
  damage(s, scout.id, 1, {});
  flush(s);
  s = until(s, P.gamling);
  assert.ok(offered(s, P.gamling), JSON.stringify(s.choice?.title));
  s = choose(s, "return");
  assert.equal(get(s, gamling.id)!.exhausted, true);
  assert.ok(s.hand.some((u) => u.code === SCOUT));
  assert.ok(!s.discard.includes(SCOUT));
  // A non-Rohan ally, or an exhausted Gamling, gives no Response.
  damage(s, guard.id, 2, {});
  flush(s);
  assert.ok(!offered(s, P.gamling));
  assert.ok(s.discard.includes(GUARD));
  s = base(1, 2);
  const tired = ally(s, P.gamling);
  tired.exhausted = true;
  const rider = ally(s, SCOUT);
  damage(s, rider.id, 1, {});
  flush(s);
  assert.ok(!offered(s, P.gamling));
  assert.ok(s.discard.includes(SCOUT));
  // Another player's Rohan ally is not yours.
  s = base(2, 2);
  ally(s, P.gamling, 0);
  const theirs = ally(s, SCOUT, 1);
  forOwner(s, 1, () => damage(s, theirs.id, 1, {}));
  flush(s);
  assert.ok(!offered(s, P.gamling));
  assert.ok(seatView(s, 1).discard.includes(SCOUT));
});

test("Staff of Lebethron: a Gondor or Hobbit hero discards a shadow card after exhausting to defend an enemy with engagement cost higher than your threat", () => {
  let s = base(1, 2);
  const faramir = hero(s, P.faramir, 2);
  const frodo = ringBearer(s)!;
  const guard = ally(s, GUARD);
  const [staff] = hand(s, [P.staff]);
  assert.deepEqual(
    playTargets(s, staff)
      .map((u) => u.id)
      .sort(),
    [faramir.id, frodo.id].sort(),
    "Gondor or Hobbit heroes only",
  );
  assert.ok(!playTargets(s, staff).some((u) => u.id === guard.id));
  const held = attach(s, faramir, P.staff);
  assert.equal(restrictedSlots(faramir), 1);
  const troll = engaged(s, TROLL);
  s = defend(s, troll, faramir);
  s = until(s, P.staff);
  assert.ok(offered(s, P.staff), JSON.stringify(s.choice?.title));
  s = choose(s, "discard");
  assert.ok(s.encounterDiscard.includes("01104"));
  assert.equal(
    get(s, faramir.id)!.attachments.find((a) => a.id === held.id)!.exhausted,
    true,
  );
  s = settle(s);
  assert.equal(get(s, faramir.id)!.damage, 6 - 2);
  // An enemy below your threat gives no Response.
  s = base(1, 2);
  const second = hero(s, P.faramir, 2);
  attach(s, second, P.staff);
  const orcs = engaged(s, ORCS);
  s = defend(s, orcs, second);
  s = until(s, P.staff);
  assert.ok(!offered(s, P.staff));
});

test("Taste it Again!: after a hero you control defends an enemy with engagement cost higher than your threat, ready it with +2 attack against that enemy this phase", () => {
  let s = base(1, 2);
  const faramir = hero(s, P.faramir, 2);
  const [taste] = hand(s, [P.taste]);
  assert.match(canPlay(s, taste)!, /in response/);
  const troll = engaged(s, TROLL);
  s = defend(s, troll, faramir);
  s = until(s, P.taste);
  assert.ok(offered(s, P.taste), JSON.stringify(s.choice?.title));
  s = choose(s, "play");
  s = settle(s);
  assert.ok(s.discard.includes(P.taste));
  assert.ok(!s.hand.some((u) => u.id === taste.id));
  assert.equal(get(s, faramir.id)!.exhausted, false);
  // 2 + 2 attack against 3 defense during this combat phase.
  s.phase = "attack";
  s.combat = null;
  s = act(s, {
    type: "ATTACK",
    enemyId: troll.id,
    attackerIds: [faramir.id],
  });
  s = settle(s);
  assert.equal(get(s, troll.id)!.damage, 1);
  assert.equal(stats(s, get(s, faramir.id)!).attack, 2, "only while attacking");
  // An enemy below your threat gives no Response.
  s = base(1, 2);
  const second = hero(s, P.faramir, 2);
  hand(s, [P.taste]);
  const orcs = engaged(s, ORCS);
  s = defend(s, orcs, second);
  s = until(s, P.taste);
  assert.ok(!offered(s, P.taste));
});

test("Snowmane: a Rohan hero, restricted unless it is Théoden, readies after questing successfully", () => {
  let s = base(1, 2);
  const theodred = s.heroes.find((h) => h.code === "01002")!;
  const [mount] = hand(s, [P.snowmane]);
  assert.deepEqual(
    playTargets(s, mount).map((u) => u.id),
    [theodred.id],
  );
  attach(s, theodred, P.snowmane);
  assert.equal(restrictedSlots(theodred), 1);
  const king = hero(s, THEODEN, 0);
  attach(s, king, P.snowmane);
  assert.equal(restrictedSlots(king), 0, "Théoden: not restricted");
  // A successful quest readies the attached hero.
  s = base(1, 2);
  const rider = s.heroes.find((h) => h.code === "01002")!;
  attach(s, rider, P.snowmane);
  s.phase = "quest";
  rider.committed = true;
  rider.exhausted = true;
  s.committedIds = [rider.id];
  s.lastQuest = { will: 10, threat: 0, net: 10 } as GameState["lastQuest"];
  s.queue.push({ kind: "questSuccessResponses", player: 0 });
  flush(s);
  s = until(s, P.snowmane);
  assert.ok(offered(s, P.snowmane), JSON.stringify(s.choice?.title));
  s = choose(s, "ready");
  assert.equal(get(s, rider.id)!.exhausted, false);
});

test("In the Shadows costs 1 less per Hobbit or Ranger hero and weakens the enemies engaged with you above your threat; Speak Your Promise! readies the Ring-bearer to weaken an enemy by the difference", () => {
  let s = base(1, 2);
  // Aragorn (Ranger) and Frodo (Hobbit).
  assert.equal(playCost(s, card(P.shadows)), 1);
  hero(s, P.damrod, 2);
  assert.equal(playCost(s, card(P.shadows)), 0, "Damrod is a Ranger");
  const [shadows] = hand(s, [P.shadows]);
  assert.match(canPlay(s, shadows)!, /Combat Action/);
  s.phase = "defense";
  assert.match(canPlay(s, shadows)!, /engagement cost higher/);
  const troll = engaged(s, TROLL);
  const orcs = engaged(s, ORCS);
  assert.equal(canPlay(s, shadows), null);
  s = act(s, { type: "PLAY", id: shadows.id, payment: {} });
  s = settle(s);
  assert.equal(stats(s, get(s, troll.id)!).attack, 6 - 1);
  assert.equal(stats(s, get(s, troll.id)!).defense, 3 - 1);
  assert.equal(stats(s, get(s, orcs.id)!).attack, 2, "below your threat");
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, troll.id)!).attack, 6);
  // Speak Your Promise!: Frodo readies, then compares his willpower.
  s = base(1, 2);
  const frodo = ringBearer(s)!;
  const [promise] = hand(s, [P.promise]);
  assert.match(canPlay(s, promise)!, /exhausted Ring-bearer/);
  frodo.exhausted = true;
  assert.match(canPlay(s, promise)!, /enemy engaged with you/);
  const hill = engaged(s, TROLL);
  const pack = engaged(s, ORCS);
  assert.equal(stats(s, frodo).will, 2);
  s = act(s, { type: "PLAY", id: promise.id, payment: { [frodo.id]: 1 } });
  assert.equal(get(s, frodo.id)!.exhausted, false, "the cost readies Frodo");
  assert.match(s.choice!.title, /^Speak Your Promise! · Choose an enemy/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [hill.id, pack.id],
  );
  s = choose(s, hill.id);
  s = settle(s);
  // Willpower 2 against the Hill Troll's threat 1.
  assert.equal(stats(s, get(s, hill.id)!).attack, 6 - 1);
  assert.equal(stats(s, get(s, hill.id)!).defense, 3 - 1);
  // Against Dol Guldur Orcs (threat 2) the willpower is not greater.
  s = base(1, 2);
  const bearer = ringBearer(s)!;
  bearer.exhausted = true;
  const [again] = hand(s, [P.promise]);
  const orc = engaged(s, ORCS);
  s = act(s, { type: "PLAY", id: again.id, payment: { [bearer.id]: 1 } });
  s = choose(s, orc.id);
  s = settle(s);
  assert.equal(stats(s, get(s, orc.id)!).attack, 2);
  assert.ok(s.log.some((l) => /is not greater than/.test(l.text)));
  // With Frodo's own Action (+2 willpower) the difference is 2.
  s = base(1, 2);
  const ringed = ringBearer(s)!;
  ringed.resources = 2;
  s = act(s, { type: "ABILITY", id: ringed.id });
  get(s, ringed.id)!.exhausted = true;
  const [third] = hand(s, [P.promise]);
  const band = engaged(s, ORCS);
  s = act(s, { type: "PLAY", id: third.id, payment: { [ringed.id]: 1 } });
  s = choose(s, band.id);
  s = settle(s);
  assert.equal(stats(s, get(s, band.id)!).attack, 0);
  assert.equal(stats(s, get(s, band.id)!).defense, 0);
});
