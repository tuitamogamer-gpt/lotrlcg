import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import {
  eligiblePayers,
  fx,
  get,
  make,
  playCost,
  stats,
} from "../src/game/core";
import { check, collectResources, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities, needsTarget } from "../src/game/actions";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import {
  effectiveKeyword,
  hasResourceIcon,
  hasTrait,
} from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import { dwarfCount, OTD_DWARF as D } from "../src/game/dwarf-player-cards";
import { OTD_PLAYER as P } from "../src/game/otd-player-cards";
import { base, choose, reload, settle } from "./we-must-away-fixtures";
import { WMA as W } from "../src/game/we-must-away-support";
import type { GameState, Unit } from "../src/game/types";
import art from "./hobbit-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const hand = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
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
const hero = (s: GameState, code: string, slot: number, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    u.resources = 0;
    s.heroes[slot] = u;
  });
  return u;
};
const enemy = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
};
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const icons = (s: GameState, sphere: string, p = 0) =>
  forOwner(s, p, () => {
    for (const h of s.heroes) h.phaseResourceIcons = [sphere];
  });
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const AXEHAND = "01028",
  BLADE = "01039",
  SNEAK = "01023",
  GANDALF = "01073",
  LEGOLAS = "01005",
  GIMLI = "01004",
  GLOIN = "01003",
  ORCS = "01089",
  SPIDER = "01096",
  UFTHAK = "01090",
  WARGS = "01085",
  CROWS = "01115",
  ROVER = "01081",
  THORIN = "131002",
  HUNTING_BOW = "132023";

test("Every On the Doorstep player card is scripted, deckable and pinned to a reviewed scan", () => {
  for (let n = 1; n <= 24; n++)
    assert.ok(SCRIPTED.has(`1320${String(n).padStart(2, "0")}`), `${n}`);
  const heroes = HERO_CARDS.map((c) => c.code),
    deck = DECK_CARDS.map((c) => c.code);
  for (const code of [P.balin, P.bard, D.oin, D.bombur])
    assert.ok(heroes.includes(code), code);
  for (const code of [
    D.bifur,
    D.dwalin,
    P.shot,
    P.alliance,
    P.ravens,
    P.kinsfolk,
    P.lucky,
    P.bow,
    P.arrow,
    P.key,
    P.hunter,
  ])
    assert.ok(deck.includes(code), code);
  const otd = art.filter((a) => a.code.startsWith("1320"));
  assert.equal(otd.length, 15);
  for (const a of otd) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath);
    // The scans were reviewed against the RingsDB text.
    assert.equal(
      card(a.code).text,
      (official as { code: string; text?: string }[]).find(
        (c) => c.code === a.code,
      )!.text,
    );
  }
  // Black Arrow prints Victory 1, which the catalog omits.
  assert.equal(card(P.arrow).victory, 1);
  assert.equal(card(P.arrow).deck_limit, 1);
  for (const code of [P.shot, P.alliance, P.ravens, P.lucky])
    assert.ok(needsTarget({ code } as Unit), code);
  assert.deepEqual(
    deckWarnings({ heroes: [P.balin, P.bard], cards: { [P.lucky]: 3 } }),
    [
      "The Lucky Number is paid with Bilbo Baggins' Baggins resources, so it can only be played in The Hobbit scenarios.",
    ],
  );
});

test("Bombur counts as two Dwarf characters for every card that counts them", () => {
  const s = base();
  const thorin = hero(s, THORIN, 0);
  const bombur = hero(s, D.bombur, 1);
  // Thorin 1 + Bombur 2 + Glóin 1; Bilbo is a Hobbit.
  assert.equal(dwarfCount(s, 0), 4);
  collectResources(s);
  assert.equal(thorin.resources, 1);
  ally(s, AXEHAND);
  assert.equal(dwarfCount(s, 0), 5);
  collectResources(s);
  assert.equal(thorin.resources, 3, "Thorin's bonus resource");
  // Bombur's text blanked with his traits kept: he counts once.
  bombur.blanked = true;
  bombur.printedTraitsPreserved = true;
  assert.equal(dwarfCount(s, 0), 4);
});

test("Óin gets +1 attack and the Tactics resource icon with 5 Dwarf characters", () => {
  const s = base();
  const oin = hero(s, D.oin, 0);
  hero(s, D.bombur, 1);
  oin.resources = 2;
  syncAttachmentText(s);
  assert.equal(stats(s, oin).attack, 1);
  assert.equal(hasResourceIcon(oin, "tactics"), false);
  ally(s, AXEHAND);
  syncAttachmentText(s);
  assert.equal(stats(s, oin).attack, 2);
  assert.equal(hasResourceIcon(oin, "tactics"), true);
  // He can pay for Tactics cards with his own resources.
  assert.ok(
    eligiblePayers(s, card(BLADE)).some((u) => u.id === oin.id),
    "Óin pays for a Tactics attachment",
  );
});

test("Bifur draws 2 cards when played from hand as the fifth Dwarf, and Dwalin costs 2 less", () => {
  let s = base();
  hero(s, GIMLI, 0);
  hero(s, D.bombur, 1);
  icons(s, "lore");
  for (const h of s.heroes) h.resources = 5;
  s.deck = [SNEAK, BLADE, GANDALF];
  const bifur = hand(s, D.bifur);
  s = act(s, { type: "PLAY", id: bifur.id });
  s = settle(s, "draw");
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [SNEAK, BLADE],
  );
  // With fewer than 5 Dwarves there is no response.
  s = base();
  icons(s, "lore");
  s.deck = [SNEAK, BLADE];
  s = act(s, { type: "PLAY", id: hand(s, D.bifur).id });
  s = settle(s, "draw");
  assert.deepEqual(s.hand, []);
  assert.equal(s.deck.length, 2);

  s = base();
  hero(s, GIMLI, 0);
  hero(s, D.bombur, 1);
  // Gimli 1 + Bombur 2 + Glóin 1 = 4.
  assert.equal(playCost(s, card(D.dwalin)), 3);
  ally(s, AXEHAND);
  assert.equal(playCost(s, card(D.dwalin)), 1);
  const dwalin = ally(s, D.dwalin);
  assert.ok(effectiveKeyword(dwalin, "Sentinel"));
});

test("Balin pays 1 resource to cancel a shadow effect, then the attacker is dealt another shadow card that resolves", () => {
  let s = base();
  const balin = hero(s, P.balin, 0);
  balin.resources = 2;
  const spider = enemy(s, SPIDER);
  spider.shadows = [WARGS];
  s.encounterDeck = [CROWS, ROVER, ROVER];
  s.phase = "defense";
  const defender = s.heroes[2];
  s = act(s, { type: "DEFEND", enemyId: spider.id, defenderId: defender.id });
  assert.match(s.choice!.title, /A shadow falls/);
  const option = s.choice!.options.find((o) => o.code === P.balin)!;
  assert.match(option.label, /Balin/);
  s = choose(s, option.id);
  s = settle(s);
  assert.equal(get(s, balin.id)!.resources, 1);
  // Forest Spider 2 + Eastern Crows 1 (threat below 35) − Glóin's 1 defense.
  assert.equal(get(s, defender.id)!.damage, 2);
  assert.deepEqual(s.encounterDeck, [ROVER, ROVER]);
  // Both shadow cards stay with the attacker until the end of combat.
  assert.deepEqual(get(s, spider.id)!.shadows, [WARGS, CROWS]);

  // Limit once per attack: the second shadow resolves normally.
  s = base();
  const second = hero(s, P.balin, 0);
  second.resources = 3;
  const wargs = enemy(s, SPIDER);
  wargs.shadows = [WARGS];
  s.encounterDeck = [WARGS, ROVER];
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: wargs.id,
    defenderId: s.heroes[2].id,
  });
  s = choose(s, s.choice!.options.find((o) => o.code === P.balin)!.id);
  assert.ok(
    !s.choice || !s.choice.options.some((o) => o.code === P.balin),
    "Balin cannot cancel the replacement shadow",
  );
  s = settle(s);
  assert.equal(get(s, second.id)!.resources, 2);
  // Forest Spider 2 + Wargs 1 − 1 defense.
  assert.equal(get(s, s.heroes[2].id)!.damage, 2);

  // Without a resource in his own pool he cannot respond.
  s = base();
  hero(s, P.balin, 0);
  const third = enemy(s, SPIDER);
  third.shadows = [WARGS];
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: third.id,
    defenderId: s.heroes[2].id,
  });
  assert.ok(!s.choice?.options.some((o) => o.code === P.balin));
});

test("Bard the Bowman's ranged attacks give the enemy −2 defense until the end of the phase", () => {
  let s = base(2);
  const bard = hero(s, P.bard, 1, 1);
  const spider = enemy(s, SPIDER, 0);
  s.phase = "attack";
  s.table!.turn = 0;
  selectSeat(s, 0);
  const aragorn = s.heroes[0];
  s = act(s, {
    type: "ATTACK",
    enemyId: spider.id,
    attackerIds: [aragorn.id, bard.id],
  });
  s = settle(s);
  // Aragorn 3 + Bard 3 against 1 − 2 defense: the spider (4 hp) is destroyed.
  assert.equal(get(s, spider.id), undefined);
  assert.equal(get(s, bard.id)!.exhausted, true);

  // Attacking an enemy engaged with his own controller is not ranged.
  s = base();
  const solo = hero(s, P.bard, 0);
  const own = enemy(s, SPIDER);
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: own.id, attackerIds: [solo.id] });
  s = settle(s);
  assert.equal(get(s, own.id)!.damage, 2);
  assert.equal(get(s, own.id)!.tempDefense ?? 0, 0);
});

test("Straight Shot exhausts a Weapon to discard a non-unique enemy with 0 defense", () => {
  let s = base();
  icons(s, "tactics");
  const shot = hand(s, P.shot);
  const orcs = enemy(s, ORCS);
  enemy(s, SPIDER);
  enemy(s, UFTHAK);
  const rover = staged(s, ROVER);
  assert.match(canPlay(s, shot)!, /ready Weapon/);
  s.heroes[1].attachments.push({ id: "blade", code: BLADE, exhausted: false });
  assert.equal(canPlay(s, shot), null);
  assert.deepEqual(
    playTargets(s, shot)
      .map((u) => u.id)
      .sort(),
    [orcs.id, rover.id].sort(),
  );
  s = act(s, { type: "PLAY", id: shot.id, target: orcs.id });
  s = settle(s);
  assert.equal(get(s, orcs.id), undefined);
  assert.ok(s.encounterDiscard.includes(ORCS));
  assert.deepEqual(s.victoryCards ?? [], []);
  assert.equal(s.heroes[1].attachments[0].exhausted, true);
  assert.match(canPlay(s, hand(s, P.shot))!, /ready Weapon/);
});

test("Desperate Alliance gives a hero and its resources to another player until the end of the phase", () => {
  let s = base(2);
  icons(s, "spirit");
  const alliance = hand(s, P.alliance);
  const aragorn = s.heroes[0];
  aragorn.resources = 4;
  assert.ok(
    !playTargets(s, alliance).some(
      (u) => card(u.code).name === "Bilbo Baggins",
    ),
  );
  s = act(s, { type: "PLAY", id: alliance.id, target: aragorn.id });
  s = settle(s);
  assert.ok(seatView(s, 1).heroes.some((u) => u.id === aragorn.id));
  assert.ok(!seatView(s, 0).heroes.some((u) => u.id === aragorn.id));
  assert.equal(get(s, aragorn.id)!.resources, 4);
  // The other player may pay with Aragorn now.
  selectSeat(s, 1);
  assert.ok(
    eligiblePayers(s, card(SNEAK)).some((u) => u.id === aragorn.id),
    "the receiving player spends the lent hero's resources",
  );
  // One Desperate Alliance per phase for the whole group.
  icons(s, "spirit", 1);
  const another = hand(s, P.alliance, 1);
  assert.match(canPlay(s, another)!, /Only one Desperate Alliance/);
  // The lending player is not eliminated while the hero is lent.
  selectSeat(s, 0);
  forOwner(s, 0, () => {
    s.heroes = [];
  });
  check(s);
  assert.equal(s.table!.seats[0].eliminated ?? false, false);
  phaseEnd(s);
  flush(s);
  assert.ok(seatView(s, 0).heroes.some((u) => u.id === aragorn.id));
  assert.ok(!seatView(s, 1).heroes.some((u) => u.id === aragorn.id));

  // Solo play has no other player.
  s = base();
  icons(s, "spirit");
  assert.match(canPlay(s, hand(s, P.alliance))!, /another player/);
});

test("Ravens of the Mountain exhausts a hero, shuffles the encounter deck and places progress equal to its top card's threat", () => {
  let s = base();
  icons(s, "lore");
  s.encounterDeck = [SPIDER, ROVER, ORCS, CROWS];
  const ravens = hand(s, P.ravens);
  const lore = s.heroes[0];
  assert.ok(playTargets(s, ravens).some((u) => u.id === lore.id));
  s = act(s, { type: "PLAY", id: ravens.id, target: lore.id });
  assert.match(s.choice!.title, /Ravens of the Mountain/);
  const top = s.encounterDeck[0];
  s = choose(s, "progress");
  s = settle(s);
  assert.equal(get(s, lore.id)!.exhausted, true);
  assert.equal(s.progress, card(top).threat);
  assert.equal(s.encounterDeck[0], top, "the card stays on top");
  assert.equal(s.encounterDeck.length, 4);
  s.encounterDeck = [];
  assert.match(canPlay(s, hand(s, P.ravens))!, /encounter deck is empty/);
});

test("To me! O my kinsfolk! puts a Dwarf ally from the discard pile into play until the end of the phase", () => {
  let s = base();
  icons(s, "leadership");
  s.discard = [GANDALF, AXEHAND];
  s.deck = [SNEAK];
  const call = hand(s, P.kinsfolk);
  s = act(s, { type: "PLAY", id: call.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [AXEHAND],
  );
  s = choose(s, s.choice!.options[0].id);
  s = settle(s);
  const axehand = s.allies.find((u) => u.code === AXEHAND)!;
  assert.ok(axehand);
  assert.deepEqual(s.discard, [GANDALF, P.kinsfolk]);
  phaseEnd(s);
  flush(s);
  s = settle(s);
  assert.equal(get(s, axehand.id), undefined);
  assert.deepEqual(s.deck, [SNEAK, AXEHAND], "bottom of the deck");

  // It needs a Dwarf hero.
  s = base();
  icons(s, "leadership");
  hero(s, LEGOLAS, 2);
  s.discard = [AXEHAND];
  assert.match(canPlay(s, hand(s, P.kinsfolk))!, /Dwarf hero/);
});

test("The Lucky Number adds Bilbo Baggins' willpower, attack and defense to another character", () => {
  let s = base();
  const lucky = hand(s, P.lucky);
  const aragorn = s.heroes[0];
  const before = stats(s, aragorn);
  const bilbo = s.heroes.find((u) => card(u.code).name === "Bilbo Baggins")!;
  assert.ok(!playTargets(s, lucky).some((u) => u.id === bilbo.id));
  s = act(s, { type: "PLAY", id: lucky.id, target: aragorn.id });
  s = settle(s);
  const after = stats(s, get(s, aragorn.id)!);
  const b = stats(s, get(s, bilbo.id)!);
  assert.equal(after.will, before.will + b.will);
  assert.equal(after.attack, before.attack + b.attack);
  assert.equal(after.defense, before.defense + b.defense);
  assert.equal(get(s, bilbo.id)!.resources, 9, "paid from Bilbo's pool");
});

test("Great Yew Bow attaches to a printed Ranged hero and exhausts with it to attack an enemy in the staging area", () => {
  let s = base();
  icons(s, "tactics");
  const legolas = hero(s, LEGOLAS, 0);
  const bow = hand(s, P.bow);
  const targets = playTargets(s, bow).map((u) => u.id);
  assert.ok(targets.includes(legolas.id));
  assert.ok(!targets.includes(s.heroes[1].id));
  // Ranged granted by Thrór's Hunting Bow is not printed.
  s.heroes[1].attachments.push({
    id: "hunting",
    code: HUNTING_BOW,
    exhausted: false,
  });
  assert.ok(effectiveKeyword(s.heroes[1], "Ranged"));
  assert.ok(!playTargets(s, bow).some((u) => u.id === s.heroes[1].id));
  s = act(s, { type: "PLAY", id: bow.id, target: legolas.id });
  s = settle(s);
  const spider = staged(s, SPIDER);
  const ability = () =>
    availableAbilities(s, get(s, legolas.id)!).find((a) =>
      a.label.startsWith("Great Yew Bow"),
    )!;
  assert.equal(ability().disabled, true, "only in the combat phase");
  s.phase = "attack";
  assert.equal(ability().disabled, false);
  const bowId = get(s, legolas.id)!.attachments[0].id;
  s = act(s, { type: "ABILITY", id: legolas.id, attachmentId: bowId });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [spider.id],
  );
  s = choose(s, spider.id);
  s = settle(s);
  const l = get(s, legolas.id)!;
  assert.equal(l.exhausted, true);
  assert.equal(l.attachments[0].exhausted, true);
  // Legolas 3 attack − 1 defense.
  assert.equal(get(s, spider.id)!.damage, 2);
  assert.equal(get(s, spider.id)!.attacked, false);

  // Bard's text makes the staging-area attack ranged: −2 defense.
  s = base();
  const bard = hero(s, P.bard, 0);
  bard.attachments.push({ id: "bow", code: P.bow, exhausted: false });
  const target = staged(s, SPIDER);
  s.phase = "defense";
  s = act(s, { type: "ABILITY", id: bard.id, attachmentId: "bow" });
  s = choose(s, target.id);
  s = settle(s);
  // Bard 3 attack − (1 − 2, at least 0) defense.
  assert.equal(get(s, target.id)!.damage, 3);
});

test("Black Arrow goes to the victory display to give the attacking hero +5 attack for that attack", () => {
  let s = base();
  icons(s, "tactics");
  const legolas = hero(s, LEGOLAS, 0);
  const arrow = hand(s, P.arrow);
  assert.ok(playTargets(s, arrow).some((u) => u.id === legolas.id));
  assert.ok(!playTargets(s, arrow).some((u) => u.id === s.heroes[1].id));
  s = act(s, { type: "PLAY", id: arrow.id, target: legolas.id });
  s = settle(s);
  const troll = enemy(s, UFTHAK);
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: troll.id, attackerIds: [legolas.id] });
  assert.match(s.choice!.title, /Black Arrow/);
  s = choose(s, "use");
  s = settle(s);
  // Legolas 3 + 5 attack − Ufthak's 3 defense.
  assert.equal(get(s, troll.id)!.damage, 5);
  assert.deepEqual(get(s, legolas.id)!.attachments, []);
  assert.ok(s.victoryCards!.includes(P.arrow));
  assert.equal(s.victory, 1);
  assert.equal(stats(s, get(s, legolas.id)!).attack, 3, "only that attack");
});

test("Thrór's Key moves to a location added to the staging area and blanks its text box except for traits", () => {
  let s = base();
  icons(s, "spirit");
  const key = hand(s, P.key);
  const aragorn = s.heroes[0];
  s = act(s, { type: "PLAY", id: key.id, target: aragorn.id });
  s = settle(s);
  s.queue.push(fx("placeEncounter", { code: W.loneLands, text: "revealed" }));
  s = reload(s);
  flush(s);
  assert.match(s.choice!.title, /Thrór's Key/);
  s = choose(s, "use");
  s = settle(s);
  const lands = s.staging.find((u) => u.code === W.loneLands)!;
  assert.equal(lands.attachments[0].code, P.key);
  syncAttachmentText(s);
  assert.equal(get(s, lands.id)!.blanked, true);
  assert.equal(get(s, lands.id)!.printedTraitsPreserved, true);
  assert.ok(
    (card(W.loneLands).traits ?? "")
      .split(".")
      .map((t) => t.trim())
      .filter(Boolean)
      .every((t) => hasTrait(get(s, lands.id)!, t)),
  );
  assert.deepEqual(get(s, aragorn.id)!.attachments, []);
  // It may move on to the next location; the first regains its text.
  s.queue.push(fx("placeEncounter", { code: W.drearyHills, text: "revealed" }));
  s = reload(s);
  flush(s);
  s = choose(s, "use");
  s = settle(s);
  syncAttachmentText(s);
  assert.equal(get(s, lands.id)!.blanked, undefined);
  const hills = s.staging.find((u) => u.code === W.drearyHills)!;
  assert.equal(hills.attachments[0].code, P.key);
  // A location immune to player card effects is not offered.
  s.queue.push(fx("placeEncounter", { code: W.cave, text: "revealed" }));
  s = reload(s);
  flush(s);
  assert.ok(!s.choice || !/Thrór's Key/.test(s.choice.title));
});

test("Expert Treasure-hunter names a card type after its hero quests successfully and keeps a matching top card", () => {
  let s = base();
  icons(s, "lore");
  const hunter = hand(s, P.hunter);
  const aragorn = s.heroes[0];
  s = act(s, { type: "PLAY", id: hunter.id, target: aragorn.id });
  s = settle(s);
  // Limit 1 per hero.
  assert.ok(
    !playTargets(s, hand(s, P.hunter)).some((u) => u.id === aragorn.id),
  );
  s.deck = [SNEAK, BLADE];
  get(s, aragorn.id)!.committed = true;
  s.queue.push(fx("questSuccessResponses", { player: 0 }));
  s = reload(s);
  flush(s);
  assert.match(s.choice!.title, /Expert Treasure-hunter/);
  s = choose(s, "event");
  s = settle(s);
  assert.ok(s.hand.some((u) => u.code === SNEAK));
  assert.deepEqual(s.deck, [BLADE]);
  // A different type stays in the discard pile.
  s.queue.push(fx("questSuccessResponses", { player: 0 }));
  s = reload(s);
  flush(s);
  s = choose(s, "ally");
  s = settle(s);
  assert.ok(s.discard.includes(BLADE));
  assert.ok(!s.hand.some((u) => u.code === BLADE));
  // A hero that did not quest does not trigger it.
  get(s, aragorn.id)!.committed = false;
  s.deck = [SNEAK];
  s.queue.push(fx("questSuccessResponses", { player: 0 }));
  s = reload(s);
  flush(s);
  assert.ok(!s.choice || !/Expert Treasure-hunter/.test(s.choice.title));
});
