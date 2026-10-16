import { CARROCK, isSacked } from "../src/game/carrock";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import {
  fx,
  get,
  make,
  playCost,
  prepend,
  stats,
  eligiblePayers,
} from "../src/game/core";
import {
  damage,
  destroy,
  phaseEnd,
  returnAlliesToHand,
  returnAlly,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { seatView, selectSeat } from "../src/game/table";
import {
  effectiveKeyword,
  questExhausts,
  resourcePhaseBonus,
} from "../src/game/expansion-passives";
import {
  WILDS_PLAYER as P,
  WILDS_PLAYER_CARDS,
} from "../src/game/wilds-player-support";
import {
  wildsPlayerAttackersDeclared,
  wildsPlayerAttackResolved,
  wildsPlayerDefenderDeclared,
} from "../src/game/wilds-player";
import {
  wildsPlayerFixture as fixture,
  wildsPlayerHand as hand,
  wildsPlayerAlly as ally,
  wildsPlayerAttach as attach,
} from "./wilds-player-fixtures";
import {
  base as rawBase,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import type { Action, GameState } from "../src/game/types";
const pick = (s: GameState, id: string) => choose(reload(s), id);
const act = (s: GameState, a: Action) => applyAction(reload(s), a);
function play(s: GameState, id: string, target?: string) {
  return act(s, { type: "PLAY", id, target });
}
function settle(s: GameState) {
  for (let n = 0; s.choice && n < 40; n++)
    s = pick(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  return s;
}
test("Wilds retains all15 exact originals and one native definition each", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    WILDS_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.brand),
    ),
  );
  assert.equal(WILDS_PLAYER_CARDS.length, 15);
  for (const c of WILDS_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
  }
});
test("Dale passives dynamically follow Armor/Weapon/Item and Brand only benefits its controller", () => {
  const s = fixture(2),
    sentry = ally(s, P.sentry),
    lookout = ally(s, P.lookout),
    warrior = ally(s, P.warrior),
    foreign = ally(s, P.sentry, 1);
  attach(s, sentry, P.hauberk);
  attach(s, lookout, P.map);
  attach(s, warrior, P.bow);
  attach(s, foreign, P.hauberk, 1);
  assert.equal(stats(s, sentry).defense, 4);
  assert.equal(
    stats(s, sentry).health,
    4,
    "Sentry gains Sentinel before Hauberk derives its health bonus",
  );
  assert.equal(stats(s, lookout).will, 3);
  assert.equal(stats(s, warrior).attack, 3);
  assert.equal(stats(s, sentry).will, 1);
  assert.equal(stats(s, foreign).will, 0);
  assert.ok(effectiveKeyword(sentry, "Sentinel"));
  assert.ok(effectiveKeyword(warrior, "Ranged"));
  assert.equal(questExhausts(s, lookout), false);
  sentry.attachments = [];
  lookout.attachments = [];
  warrior.attachments = [];
  assert.equal(stats(s, sentry).defense, 2);
  assert.equal(stats(s, lookout).will, 1);
  assert.equal(stats(s, warrior).attack, 2);
  assert.equal(questExhausts(s, lookout), true);
});
test("Brand first attachment draw is optional, preserves paid card identity and does not trigger for second attachment", () => {
  let s = fixture();
  const host = ally(s, P.sentry),
    a = hand(s, P.hauberk);
  const before = s.hand.length;
  s = play(s, a.id, host.id);
  assert.match(s.choice!.title, /Brand/);
  s = pick(s, "use");
  assert.equal(s.hand.length, before);
  assert.ok(get(s, host.id)!.attachments.some((x) => x.id === a.id));
  const bow = hand(s, P.bow);
  s = play(s, bow.id, host.id);
  assert.equal(s.choice, null);
  s = fixture();
  const h = ally(s, P.sentry),
    armor = hand(s, P.hauberk);
  s = play(s, armor.id, h.id);
  s = pick(s, "skip");
  assert.equal(s.hand.length, 0);
});
test("Bard pays for Items of every sphere, while Sentry and Warrior apply host-specific discounts", () => {
  const s = fixture();
  for (const h of s.heroes) {
    h.phaseResourceIcons = [];
    h.resources = 0;
  }
  s.heroes[1].resources = 5;
  for (const code of [P.hauberk, P.bow, P.map])
    assert.ok(eligiblePayers(s, card(code)).some((h) => h.code === P.bard));
  assert.ok(!eligiblePayers(s, card("01026")).some((h) => h.code === P.bard));
  const sentry = ally(s, P.sentry),
    warrior = ally(s, P.warrior);
  assert.equal(playCost(s, card(P.hauberk), sentry), 0);
  assert.equal(playCost(s, card(P.hauberk), warrior), 1);
  assert.equal(playCost(s, card(P.bow), warrior), 0);
});
test("Bard saves the same physical player attachments to each owner's hand, once per phase", () => {
  let s = fixture(2);
  const host = ally(s, P.sentry),
    own = attach(s, host, P.hauberk),
    foreign = attach(s, host, P.bow, 1);
  damage(s, host.id, 20);
  flush(s);
  assert.match(s.choice!.title, /Bard/);
  s = pick(s, "use");
  assert.ok(s.hand.some((u) => u.id === own.id));
  assert.ok(seatView(s, 1).hand.some((u) => u.id === foreign.id));
  const next = ally(s, P.warrior);
  attach(s, next, P.bow);
  destroy(s, next);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(P.bow));
  phaseEnd(s);
  const third = ally(s, P.warrior);
  attach(s, third, P.bow);
  destroy(s, third);
  flush(s);
  assert.match(s.choice!.title, /Bard/);
  s = pick(s, "skip");
  assert.ok(s.discard.includes(P.bow));
});
test("Long Lake Trader pays exhaustion then moves a physical Item to an eligible character without replaying Brand", () => {
  let s = fixture();
  const trader = ally(s, P.trader),
    from = ally(s, P.warrior),
    to = ally(s, P.sentry),
    item = attach(s, from, P.bow);
  s = act(s, { type: "ABILITY", id: trader.id });
  assert.match(s.choice!.title, /Item/);
  s = pick(s, item.id);
  assert.ok(!s.choice!.options.some((o) => o.id === from.id));
  s = pick(s, to.id);
  assert.ok(get(s, trader.id)!.exhausted);
  assert.equal(get(s, from.id)!.attachments.length, 0);
  assert.equal(get(s, to.id)!.attachments[0].id, item.id);
  assert.equal(s.choice, null);
});
test("King of Dale counts different attachment titles including itself, ignores match once, and expires at phase end", () => {
  let s = fixture();
  const h = s.heroes[0],
    king = attach(s, h, P.king);
  attach(s, h, P.hauberk);
  attach(s, h, P.map);
  const warrior = hand(s, P.warrior);
  s = act(s, { type: "ABILITY", id: h.id, attachmentId: king.id });
  assert.equal(playCost(s, card(P.warrior)), 0);
  for (const hero of s.heroes) hero.phaseResourceIcons = [];
  assert.equal(
    canPlay(
      s,
      s.hand.find((u) => u.id === warrior.id)!,
    ),
    null,
  );
  s = play(s, warrior.id);
  assert.ok(get(s, warrior.id));
  assert.equal(playCost(s, card(P.warrior)), 3);
  phaseEnd(s);
  assert.equal(playCost(s, card(P.warrior)), 3);
});
test("Map of Rhovanion native quest response places progress on active location only", () => {
  let s = fixture();
  const h = s.heroes[0];
  attach(s, h, P.map);
  const location = make(s, "01100");
  s.activeLocation = location;
  s.phase = "quest";
  s.encounterDeck = ["01099"];
  s = act(s, { type: "TOGGLE_QUEST", id: h.id });
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Map/);
  s = pick(s, location.id);
  assert.equal(s.activeLocation!.progress, 1);
});
test("Bow of Yew offers optional physical exhaustion and damages before normal attack", () => {
  let s = fixture();
  s.phase = "attack";
  const h = s.heroes[0],
    bow = attach(s, h, P.bow),
    enemy = make(s, "01089");
  s.engaged.push(enemy);
  prepend(s, ...wildsPlayerAttackersDeclared(s, enemy, [h]));
  flush(s);
  assert.match(s.choice!.title, /Bow of Yew/);
  s = pick(s, "use");
  assert.equal(get(s, enemy.id)!.damage, 1);
  assert.ok(get(s, h.id)!.attachments.find((a) => a.id === bow.id)!.exhausted);
});
test("Necklace Guarded adds without revealing, follows its owner after guard defeat and grants stats/resource", () => {
  let s = fixture();
  const necklace = hand(s, P.necklace);
  s.encounterDeck = ["01092", "01089"];
  s = play(s, necklace.id);
  const guard = s.staging.find((u) => u.code === "01089")!;
  assert.ok(guard);
  assert.ok(guard.attachments.some((a) => a.id === necklace.id));
  assert.ok(s.heroes.every((h) => h.damage === 0));
  assert.ok(s.encounterDiscard.includes("01092"));
  destroy(s, guard);
  flush(s);
  assert.match(s.choice!.title, /Necklace/);
  const h = s.heroes[0];
  s = pick(s, h.id);
  assert.ok(get(s, h.id)!.attachments.some((a) => a.id === necklace.id));
  assert.equal(stats(s, get(s, h.id)!).will, 5);
  assert.equal(resourcePhaseBonus(get(s, h.id)!), 1);
});
test("Traffic from Dale counts equipped characters once each and enforces Planning/round limits", () => {
  let s = fixture();
  const h = s.heroes[0],
    a = ally(s, P.lookout);
  attach(s, h, P.hauberk);
  attach(s, h, P.map);
  attach(s, a, P.map);
  const event = hand(s, P.traffic),
    before = h.resources;
  s = play(s, event.id, h.id);
  assert.equal(get(s, h.id)!.resources, before + 1);
  const second = hand(s, P.traffic);
  assert.match(canPlay(s, second)!, /1 copy|one copy/i);
  s.phase = "quest";
  assert.match(canPlay(s, second)!, /Planning/);
});
test("To Arms chooses another player's equipped ally and preserves its attachment", () => {
  let s = fixture(2);
  const a = ally(s, P.lookout, 1),
    item = attach(s, a, P.map, 1);
  a.exhausted = true;
  const event = hand(s, P.arms);
  assert.ok(playTargets(s, event).some((u) => u.id === a.id));
  s = play(s, event.id, a.id);
  assert.ok(!get(s, a.id)!.exhausted);
  assert.equal(get(s, a.id)!.attachments[0].id, item.id);
});
test("Valour of the North attack/defense responses give +3 only for the resolving attack and require an attached enemy", () => {
  let s = fixture();
  s.phase = "attack";
  const hero = s.heroes[0],
    enemy = make(s, "01082");
  s.engaged.push(enemy);
  attach(s, enemy, "01069");
  hand(s, P.valour);
  prepend(s, ...wildsPlayerAttackersDeclared(s, enemy, [hero]));
  flush(s);
  assert.match(s.choice!.title, /Valour/);
  s = pick(s, "use");
  assert.equal(stats(s, get(s, hero.id)!).attack, 6);
  assert.equal(stats(s, get(s, hero.id)!).defense, 5);
  wildsPlayerAttackResolved(s, [hero.id]);
  assert.equal(stats(s, get(s, hero.id)!).attack, 3);
  const defense = hand(s, P.valour);
  s.phase = "defense";
  prepend(
    s,
    ...wildsPlayerDefenderDeclared(s, get(s, enemy.id)!, get(s, hero.id)!),
  );
  flush(s);
  assert.match(s.choice!.title, /Valour/);
  s = pick(s, "skip");
  assert.ok(s.hand.some((u) => u.id === defense.id));
  get(s, enemy.id)!.attachments = [];
  assert.deepEqual(
    wildsPlayerDefenderDeclared(s, get(s, enemy.id)!, get(s, hero.id)!),
    [],
  );
});
test("Bartering returns a ready attachment as physical cost and discounts exactly the next attachment this phase", () => {
  let s = fixture();
  const h = s.heroes[0],
    king = attach(s, h, P.king),
    event = hand(s, P.barter);
  s = play(s, event.id, h.id);
  assert.match(s.choice!.title, /Bartering/);
  s = pick(s, king.id);
  assert.ok(s.hand.some((u) => u.id === king.id));
  assert.equal(playCost(s, card(P.hauberk), h), 0);
  const armor = hand(s, P.hauberk);
  s = play(s, armor.id, h.id);
  s = settle(s);
  assert.equal(playCost(s, card(P.hauberk), h), 1);
  get(s, h.id)!.attachments[0].exhausted = true;
  const next = hand(s, P.barter);
  assert.match(canPlay(s, next)!, /eligible/);
});

test("Native Bow attack declaration resolves damage and Valour expires after that attack", () => {
  let s = fixture();
  s.phase = "attack";
  const hero = s.heroes[0],
    bow = attach(s, hero, P.bow),
    enemy = make(s, "01082");
  attach(s, enemy, "17139");
  s.engaged.push(enemy);
  hand(s, P.valour);
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [hero.id] });
  assert.match(s.choice!.title, /Bow of Yew/);
  s = pick(s, "use");
  assert.match(s.choice!.title, /Valour/);
  s = pick(s, "use");
  assert.ok(
    get(s, hero.id)!.attachments.find((a) => a.id === bow.id)!.exhausted,
  );
  assert.equal(
    stats(s, get(s, hero.id)!).attack,
    3,
    "native attack cleanup removes the temporary bonus",
  );
  assert.equal(
    get(s, enemy.id)!.damage,
    4,
    "Bow adds1, then6attack−3defense adds3",
  );
});
test("Native defended enemy attack offers Valour and clears its defense boost after damage", () => {
  let s = fixture();
  s.phase = "defense";
  const hero = s.heroes[0],
    enemy = make(s, "01082");
  attach(s, enemy, "17139");
  s.engaged.push(enemy);
  hand(s, P.valour);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: hero.id });
  assert.match(s.choice!.title, /Valour/);
  s = pick(s, "use");
  s = settle(s);
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(stats(s, get(s, hero.id)!).defense, 2);
});
test("Canceled Bartering pays its returned-attachment cost without granting the next-play discount", () => {
  let s = fixture();
  const hero = s.heroes[0],
    king = attach(s, hero, P.king),
    event = hand(s, P.barter);
  const bane = make(s, SHADOW_FLAME.bane);
  s.staging.push(bane);
  attach(s, bane, SHADOW_FLAME.counter);
  s.encounterDeck = ["01092"];
  s = play(s, event.id, hero.id);
  s = pick(s, king.id);
  assert.equal(get(s, hero.id)!.attachments.length, 0);
  assert.ok(
    s.discard.includes(P.king),
    "Counter-Spell discards the attachment returned as the paid cost",
  );
  assert.equal(playCost(s, card(P.hauberk), get(s, hero.id)!), 1);
});
test("Bard can save attachments when an ally returns to hand or is shuffled into its owner's deck", () => {
  for (const deck of [false, true]) {
    let s = fixture();
    const host = ally(s, P.sentry),
      armor = attach(s, host, P.hauberk);
    if (deck) returnAlly(s, host, true);
    else returnAlliesToHand(s, [host]);
    flush(s);
    assert.match(s.choice!.title, /Bard/);
    s = pick(s, "use");
    assert.ok(s.hand.some((u) => u.id === armor.id));
    assert.ok(!s.discard.includes(P.hauberk));
    assert.ok(
      deck
        ? s.deck.includes(P.sentry)
        : s.hand.some((u) => u.code === P.sentry),
    );
  }
});
test("Bow defeating the enemy before attack damage still discards an activated Haradrim Spear", () => {
  let s = fixture();
  s.phase = "attack";
  const host = ally(s, "17006"),
    spear = attach(s, host, "17056"),
    bow = attach(s, host, P.bow),
    enemy = make(s, "01089");
  enemy.damage = 2;
  s.engaged.push(enemy);
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [host.id] });
  assert.match(s.choice!.title, /Spear/);
  s = pick(s, "use");
  assert.match(s.choice!.title, /Bow/);
  s = pick(s, "use");
  assert.equal(get(s, enemy.id), undefined);
  assert.ok(!get(s, host.id)!.attachments.some((a) => a.id === spear.id));
  assert.ok(get(s, host.id)!.attachments.some((a) => a.id === bow.id));
  assert.ok(s.discard.includes("17056"));
});

test("Brand rewards the attachment caster when its first attachment is played on another player's Dale character", () => {
  let s = fixture(2);
  const host = ally(s, P.sentry, 1),
    armor = hand(s, P.hauberk, 0);
  const ownDeck = seatView(s, 0).deck.length,
    remoteDeck = seatView(s, 1).deck.length;
  s = play(s, armor.id, host.id);
  assert.match(s.choice!.title, /Brand/);
  s = pick(s, "use");
  assert.equal(seatView(s, 0).deck.length, ownDeck - 1);
  assert.equal(seatView(s, 1).deck.length, remoteDeck);
  assert.ok(get(s, host.id)!.attachments.some((a) => a.id === armor.id));
  s = fixture(2);
  const ownHost = ally(s, P.sentry, 0),
    foreignArmor = hand(s, P.hauberk, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = play(s, foreignArmor.id, ownHost.id);
  assert.equal(
    s.choice,
    null,
    "Brand does not respond to another player playing an attachment",
  );
  assert.equal(seatView(s, 0).deck.length, 20);
  assert.equal(seatView(s, 1).deck.length, 20);
});

function carrockWildsPlayerFixture() {
  const s = rawBase("conflict-at-the-carrock");
  s.heroes = [P.brand, P.bard, "01001"].map((code) => ({
    ...make(s, code),
    resources: 10,
    phaseResourceIcons: ["leadership", "tactics", "spirit", "lore"],
  }));
  s.startingHeroes = s.heroes.map((u) => u.code);
  s.deck = Array(20).fill("01013");
  return s;
}
test("Sacked Brand cannot offer his response or resolve an already queued draw while his passive remains active", () => {
  let s = carrockWildsPlayerFixture();
  attach(s, s.heroes[0], CARROCK.sacked);
  assert.ok(isSacked(s.heroes[0]));
  const host = ally(s, P.sentry),
    armor = hand(s, P.hauberk),
    before = s.deck.length;
  s = play(s, armor.id, host.id);
  assert.equal(s.choice, null);
  assert.equal(s.deck.length, before);
  assert.equal(stats(s, get(s, host.id)!).will, 1);
  s = carrockWildsPlayerFixture();
  const nextHost = ally(s, P.sentry),
    nextArmor = hand(s, P.hauberk),
    nextBefore = s.deck.length;
  s = play(s, nextArmor.id, nextHost.id);
  assert.match(s.choice!.title, /Brand/);
  attach(s, s.heroes[0], CARROCK.sacked);
  s = pick(s, "use");
  assert.equal(s.deck.length, nextBefore);
  assert.equal(s.choice, null);
});
test("Sacked Bard cannot offer or resolve his response while retaining his Item resource icons", () => {
  let s = carrockWildsPlayerFixture();
  s.heroes[1].phaseResourceIcons = [];
  attach(s, s.heroes[1], CARROCK.sacked);
  assert.ok(isSacked(s.heroes[1]));
  assert.ok(
    eligiblePayers(s, card(P.hauberk)).some((h) => h.id === s.heroes[1].id),
  );
  const host = ally(s, P.sentry);
  attach(s, host, P.hauberk);
  destroy(s, host);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(P.hauberk));
  s = carrockWildsPlayerFixture();
  const nextHost = ally(s, P.sentry),
    armor = attach(s, nextHost, P.hauberk);
  destroy(s, nextHost);
  flush(s);
  assert.match(s.choice!.title, /Bard/);
  attach(s, s.heroes[1], CARROCK.sacked);
  s = pick(s, "use");
  assert.ok(!s.hand.some((u) => u.id === armor.id));
  assert.ok(s.discard.includes(P.hauberk));
  assert.equal(s.choice, null);
});
