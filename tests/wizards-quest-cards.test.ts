import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  optionalEngagementProblem,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stats, threatOf } from "../src/game/core";
import { check, damage, progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView } from "../src/game/table";
import {
  WIZARDS_QUEST_HOOKS,
  WQ,
  wizardsQuestPublicState,
} from "../src/game/wizards-quest";
import {
  activate,
  allies,
  atQuest,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./wizards-quest-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = WIZARDS_QUEST_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** Reveal the given encounter cards from the top of the deck, one after another. */
const reveal = (s: GameState, ...codes: string[]) => {
  s.encounterDeck = [...codes, ...s.encounterDeck.slice(codes.length)];
  return run(s, fx("reveal"));
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) => {
  s.phase = "defense";
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const logged = (s: GameState, pattern: RegExp) =>
  s.log.some((l) => pattern.test(l.text));
const quest = (u: Unit, s: GameState) => {
  u.committed = true;
  u.exhausted = true;
  s.committedIds.push(u.id);
};
const GUARD = "01013",
  SNOWBOURN = "01016",
  ARCHER = "01017",
  AXEHAND = "01028",
  STEWARD = "01026",
  BLADE = "01039",
  COURAGE = "01057";
/** Attach a player attachment from the core set to a character. */
const attach = (s: GameState, u: Unit, code: string) => {
  const a = {
    id: `att-${code}-${u.attachments.length}-${u.id}`,
    code,
    exhausted: false,
    owner: 0,
  } as Unit["attachments"][number];
  u.attachments.push(a);
  return a;
};

test("Set 15: Nazgûl of Dol Guldur takes only combat damage and, after it attacks, returns to the staging area or raises the threat by 3; Necromancer's Pass guards a card of the first player; Pursued by Shadow", () => {
  let s = base();
  const nazgul = engaged(s, WQ.nazgul);
  assert.equal(H.cannotAttach!(s, nazgul), true);
  assert.equal(H.damageAmount!(s, nazgul, 3, {}), 0);
  assert.equal(H.damageAmount!(s, nazgul, 3, { combatDamage: true }), 3);
  s.encounterDeck = [];
  s = defend(s, nazgul, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Nazgûl of Dol Guldur · Return it to the staging area, or raise your threat by 3/,
  );
  s = choose(s, "return");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WQ.nazgul));
  assert.equal(s.engaged.length, 0);
  assert.equal(s.threat, 20);
  s = base();
  const second = engaged(s, WQ.nazgul);
  s.encounterDeck = [];
  s = defend(s, second, s.heroes[0]);
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(s.threat, 23);
  assert.ok(s.engaged.some((u) => u.code === WQ.nazgul));
  // Necromancer's Pass: the first player protects a card, the opposing team
  // guards another one until the Pass is explored.
  s = base();
  const [guard, scout, archer] = hand(s, [GUARD, SNOWBOURN, ARCHER]);
  reveal(s, WQ.pass);
  assert.match(
    s.choice!.title,
    /^Necromancer's Pass · Choose a card in your hand/,
  );
  s = choose(s, guard.id);
  assert.match(
    s.choice!.title,
    /^Necromancer's Pass · The opposing team chooses a different card from the first player's hand to guard/,
  );
  assert.ok(!s.choice!.options.some((o) => o.id === guard.id));
  s = choose(s, archer.id);
  s = settle(s);
  assert.equal(s.wizardsQuest!.passGuards.length, 1);
  assert.deepEqual(s.hand.map((u) => u.id).sort(), [guard.id, scout.id].sort());
  assert.match(H.playProblem!(s, ARCHER)!, /Necromancer's Pass guards a copy/);
  assert.equal(H.playProblem!(s, GUARD), null);
  assert.equal(wizardsQuestPublicState(s)!.passGuards, 1);
  const pass = s.staging.find((u) => u.code === WQ.pass)!;
  s.staging = s.staging.filter((u) => u.id !== pass.id);
  s.activeLocation = pass;
  progress(s, 2);
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(
    s.hand.some((u) => u.id === archer.id),
    "the guarded card returns to its owner's hand",
  );
  assert.equal(s.wizardsQuest!.passGuards.length, 0);
  assert.equal(H.playProblem!(s, ARCHER), null);
  // With fewer than 2 cards in hand nothing is guarded.
  s = base();
  hand(s, [GUARD]);
  reveal(s, WQ.pass);
  s = settle(s);
  assert.equal(s.wizardsQuest!.passGuards.length, 0);
  assert.ok(logged(s, /fewer than 2 cards in hand/));
  // Pursued by Shadow: the highest attack enemy in the staging area attacks the first player.
  s = base();
  const troll = stage(s, WQ.troll);
  stage(s, WQ.warg);
  const [chump] = allies(s, [GUARD]);
  reveal(s, WQ.pursued);
  assert.match(s.choice!.title, /^Hill Troll · Immediate attack/);
  s = choose(s, chump.id);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === chump.id));
  assert.ok(
    s.staging.some((u) => u.id === troll.id),
    "it attacks from the staging area",
  );
  assert.ok(s.encounterDiscard.includes(WQ.pursued));
  // No attack: it gains surge.
  s = base();
  reveal(s, WQ.pursued, WQ.gate);
  s = settle(s);
  assert.ok(logged(s, /Pursued by Shadow gains surge/));
  assert.ok(s.staging.some((u) => u.code === WQ.gate));
  // Shadow: a unique attacker makes an additional attack.
  s = base();
  const bane = engaged(s, WQ.bane);
  bane.shadows = [WQ.pursued];
  const [a, b] = allies(s, [GUARD, GUARD]);
  s.encounterDeck = [];
  s = defend(s, bane, a);
  s = settle(s);
  assert.ok(
    logged(s, /Bane of Amon Lanc is unique and makes an additional attack/),
  );
  assert.ok(!s.allies.some((u) => u.id === a.id));
  void b;
  reload(s);
});

test("Set 16: Bane of Amon Lanc makes the defending player discard a card per excess damage after it destroys an ally; Oak-wood Grove; Smoking Blood", () => {
  let s = base();
  const bane = engaged(s, WQ.bane);
  assert.equal(H.cannotAttach!(s, bane), true);
  const [guard] = allies(s, [GUARD]);
  hand(s, [
    SNOWBOURN,
    SNOWBOURN,
    SNOWBOURN,
    SNOWBOURN,
    SNOWBOURN,
    SNOWBOURN,
    SNOWBOURN,
  ]);
  s.encounterDeck = [];
  s = defend(s, bane, guard);
  // 7 attack against 0 defense and 2 hit points: 5 excess damage.
  for (let n = 5; n > 0; n--) {
    assert.match(
      s.choice!.title,
      new RegExp(
        `^Bane of Amon Lanc · Discard a card from your hand \\(${n} left\\)`,
      ),
    );
    s = choose(s, s.choice!.options[0].id);
  }
  s = settle(s);
  assert.equal(s.hand.length, 2);
  assert.equal(s.discard.filter((c) => c === SNOWBOURN).length, 5);
  // Oak-wood Grove: no progress on the other locations in the staging area;
  // to travel there each player exhausts a character.
  s = base(2);
  const grove = stage(s, WQ.grove);
  const gate = stage(s, WQ.gate);
  assert.equal(H.locationProgressBlocked!(s, gate), true);
  assert.equal(H.locationProgressBlocked!(s, grove), false);
  s.phase = "travel";
  forOwner(s, 1, () => {
    for (const h of s.heroes) h.exhausted = true;
  });
  assert.match(
    canTravel(s, grove) ?? "",
    /each player must exhaust a character/,
  );
  forOwner(s, 1, () => {
    s.heroes[0].exhausted = false;
  });
  assert.equal(canTravel(s, grove), null);
  s = act(s, { type: "TRAVEL", id: grove.id });
  assert.match(
    s.choice!.title,
    /^Oak-wood Grove · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(s.activeLocation?.code, WQ.grove);
  assert.equal(seatView(s, 1).heroes.filter((h) => !h.exhausted).length, 0);
  assert.equal(seatView(s, 0).heroes.filter((h) => h.exhausted).length, 1);
  // Smoking Blood: attached to a Troll, it cancels the lethal damage once.
  s = base();
  stage(s, WQ.troll);
  reveal(s, WQ.blood);
  s = settle(s);
  const troll = s.staging.find((u) => u.code === WQ.troll)!;
  assert.deepEqual(
    troll.attachments.map((x) => x.code),
    [WQ.blood],
  );
  troll.damage = 5;
  assert.equal(damage(s, troll.id, 2, {}), true, "2 damage do not destroy it");
  assert.equal(troll.damage, 7);
  damage(s, troll.id, 3, {});
  flush(s);
  assert.equal(troll.damage, 7, "the lethal damage is canceled");
  assert.equal(troll.attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(WQ.blood));
  assert.ok(s.staging.some((u) => u.id === troll.id));
  // Without a Troll enemy it gains surge.
  s = base();
  reveal(s, WQ.blood, WQ.gate);
  s = settle(s);
  assert.ok(logged(s, /no Troll enemy to attach it to; it gains surge/));
  assert.ok(s.encounterDiscard.includes(WQ.blood));
  assert.ok(s.staging.some((u) => u.code === WQ.gate));
  reload(s);
});

test("Set 17: Forest Flies raise the defending player's threat; Twilight Hall counts the first player's characters and reveals a card per player when explored; Swarming Mosquitoes deal 1 more damage than the stage number", () => {
  let s = base();
  const flies = engaged(s, WQ.flies);
  engaged(s, WQ.warg);
  s.encounterDeck = [];
  s = defend(s, flies, s.heroes[0]);
  s = settle(s);
  assert.equal(s.threat, 21);
  // Shadow: 1 threat per engaged enemy.
  s = base();
  const troll = engaged(s, WQ.troll);
  engaged(s, WQ.warg);
  troll.shadows = [WQ.flies];
  s.encounterDeck = [];
  const [chump] = allies(s, [GUARD]);
  s = defend(s, troll, chump);
  s = settle(s);
  assert.equal(s.threat, 22);
  // Twilight Hall.
  s = base(2);
  const hall = stage(s, WQ.hall);
  assert.equal(threatOf(s, hall), 3);
  allies(s, [GUARD, GUARD], 0);
  allies(s, [GUARD], 1);
  assert.equal(threatOf(s, hall), 5, "the first player's characters only");
  assert.equal(H.cannotAttach!(s, hall), true);
  s.staging = s.staging.filter((u) => u.id !== hall.id);
  s.activeLocation = hall;
  progress(s, 6);
  flush(s);
  s = settle(s);
  assert.equal(
    s.staging.filter((u) => u.code === WQ.gate).length,
    2,
    "one card per player",
  );
  // Swarming Mosquitoes: X = stage + 1 damage to a character of each player.
  s = base(2);
  atQuest(s, WQ.fork);
  reveal(s, WQ.mosquitoes);
  assert.match(
    s.choice!.title,
    /^Swarming Mosquitoes · Deal 3 damage to a character you control/,
  );
  s = choose(s, s.heroes[0].id);
  assert.match(s.choice!.title, /Deal 3 damage/);
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[0].damage, 3);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
  // Shadow: +1 attack, +2 if the defender has an attachment.
  for (const [withAttachment, bonus] of [
    [false, 1],
    [true, 2],
  ] as const) {
    s = base();
    const orcs = engaged(s, WQ.orcs);
    orcs.shadows = [WQ.mosquitoes];
    s.encounterDeck = [];
    const hero = s.heroes[0];
    if (withAttachment) attach(s, hero, COURAGE);
    s = defend(s, orcs, hero);
    s = settle(s);
    assert.ok(
      logged(
        s,
        new RegExp(
          `Swarming Mosquitoes: the attacking enemy gets \\+${bonus} attack`,
        ),
      ),
    );
  }
  reload(s);
});

test("Set 18: Goblin Sniper cannot be optionally engaged and deals 1 damage to a hero of each player at the end of combat; Pine Slopes; Under the Shadow limits each player to 1 card each phase", () => {
  let s = base(2);
  const sniper = stage(s, WQ.sniper);
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, sniper));
  assert.equal(H.cannotOptionallyEngage!(s, sniper), true);
  s.phase = "attack";
  H.combatEnd!(s);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Goblin Sniper · Deal 1 damage to a hero you control/,
  );
  assert.ok(s.choice!.options.every((o) => card(o.code!).type_code === "hero"));
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  reload(s);
  // Shadow: the defender does not count its defense.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.sniper];
  s.encounterDeck = [];
  s = defend(s, orcs, s.heroes[0]);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 3, "3 attack against 0 defense");
  // Pine Slopes: +2 threat to each Pine Slopes this phase; travel costs 1
  // threat per Pine Slopes in the staging area.
  s = base();
  const first = stage(s, WQ.pine);
  reveal(s, WQ.pine);
  s = settle(s);
  const second = s.staging.find(
    (u) => u.code === WQ.pine && u.id !== first.id,
  )!;
  assert.equal(threatOf(s, first), 4);
  assert.equal(threatOf(s, second), 4);
  s.phase = "travel";
  assert.equal(threatOf(s, first), 2, "until the end of the phase");
  s = act(s, { type: "TRAVEL", id: first.id });
  s = settle(s);
  assert.equal(s.threat, 22);
  // Under the Shadow: attached to the main quest, doomed 1.
  s = base(2);
  reveal(s, WQ.shadow);
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  assert.deepEqual(
    s.questAttachments![WQ.request].map((a) => a.code),
    [WQ.shadow],
  );
  assert.equal(wizardsQuestPublicState(s)!.underShadow, 1);
  assert.equal(H.playProblem!(s, GUARD), null);
  H.playerCardPlayed!(s, {} as Unit, true);
  assert.match(
    H.playProblem!(s, GUARD)!,
    /cannot play more than 1 card each phase/,
  );
  forOwner(s, 1, () => {
    assert.equal(
      H.playProblem!(s, GUARD),
      null,
      "the other player may still play",
    );
  });
  s.phase = "quest";
  assert.equal(H.playProblem!(s, GUARD), null, "a new phase");
  reload(s);
});

test("Set 19: Necromancer's Warg damages after it engages; Dol Guldur Beastmaster brings a Necromancer's Warg; Watched Path; Evil Storm", () => {
  let s = base();
  const warg = stage(s, WQ.warg);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: warg.id });
  assert.match(
    s.choice!.title,
    /^Necromancer's Warg · Deal 1 damage to a character you control/,
  );
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  // Shadow: engaged with an Orc and a Warg enemy, discard a character.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  engaged(s, WQ.howling);
  orcs.shadows = [WQ.warg];
  s.encounterDeck = [];
  const [scout] = allies(s, [SNOWBOURN]);
  s = defend(s, orcs, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Necromancer's Warg · Discard a character you control/,
  );
  s = choose(s, scout.id);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === scout.id));
  assert.ok(s.discard.includes(SNOWBOURN));
  // Dol Guldur Beastmaster: the Warg from the encounter discard pile engages too.
  s = base();
  const beast = stage(s, WQ.beastmaster);
  s.encounterDiscard = [WQ.warg];
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: beast.id });
  s = settle(s);
  assert.deepEqual(
    s.engaged.map((u) => u.code).sort(),
    [WQ.beastmaster, WQ.warg].sort(),
  );
  assert.deepEqual(s.encounterDiscard, []);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    1,
    "the Warg's Forced effect",
  );
  // Watched Path: explored, an enemy from the top of the deck is staged.
  s = base();
  const path = activate(s, WQ.path);
  s.encounterDeck = [WQ.troll, WQ.gate];
  progress(s, 1);
  flush(s);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WQ.troll));
  assert.ok(s.encounterDiscard.includes(WQ.path));
  void path;
  s = base();
  activate(s, WQ.path);
  s.encounterDeck = [WQ.gate, WQ.gate];
  progress(s, 1);
  flush(s);
  s = settle(s);
  assert.deepEqual(s.encounterDiscard.sort(), [WQ.gate, WQ.path].sort());
  // Evil Storm: 1 damage to a questing character; damaged characters get -1
  // willpower and cannot be healed until the end of the phase.
  s = base();
  s.phase = "quest";
  const [hero, other] = s.heroes;
  quest(hero, s);
  other.damage = 1;
  const will = stats(s, other).will;
  reveal(s, WQ.storm);
  assert.match(
    s.choice!.title,
    /^Evil Storm · Deal 1 damage to a questing character you control/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [hero.id],
  );
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(stats(s, s.heroes[1]).will, will - 1);
  assert.equal(H.cannotHeal!(s, s.heroes[1]), true);
  s.phase = "travel";
  assert.equal(stats(s, s.heroes[1]).will, will);
  assert.equal(H.cannotHeal!(s, s.heroes[1]), false);
  // Shadow: 1 damage to the defending character.
  s = base();
  const hunter = engaged(s, WQ.orcs);
  hunter.shadows = [WQ.storm];
  s.encounterDeck = [];
  s = defend(s, hunter, s.heroes[0]);
  s = settle(s);
  assert.equal(
    s.heroes[0].damage,
    2,
    "1 from the shadow and 1 from the attack",
  );
  reload(s);
});

test("Set 20: Spider of Dol Guldur returns after it destroys an ally; Patch of Midnight; Eyes in the Dark", () => {
  let s = base();
  const spider = engaged(s, WQ.spider);
  const [guard] = allies(s, [GUARD]);
  s.encounterDeck = [];
  s = defend(s, spider, guard);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === spider.id));
  assert.equal(s.engaged.length, 0);
  // Shadow: an additional attack.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.spider];
  s.encounterDeck = [];
  s = defend(s, orcs, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /makes an additional attack after this one/));
  // Patch of Midnight: discarded at the beginning of the staging step.
  s = base();
  stage(s, WQ.patch);
  s.encounterDeck = [WQ.gate, WQ.gate, WQ.gate];
  s.phase = "quest";
  s.heroes[0].exhausted = false;
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(WQ.patch));
  assert.ok(!s.staging.some((u) => u.code === WQ.patch));
  assert.equal(
    s.staging.filter((u) => u.code === WQ.gate).length,
    2,
    "its card and the staging step's",
  );
  // Shadow: a destroyed character reveals the top card.
  s = base();
  const troll = engaged(s, WQ.troll);
  troll.shadows = [WQ.patch];
  const [chump] = allies(s, [GUARD]);
  s.encounterDeck = [WQ.gate];
  s = defend(s, troll, chump);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WQ.gate));
  // Eyes in the Dark: the opposing team readies a questing character of each
  // player and removes it from the quest.
  s = base(2);
  s.phase = "quest";
  quest(s.heroes[0], s);
  quest(s.heroes[1], s);
  forOwner(s, 1, () => quest(s.heroes[2], s));
  reveal(s, WQ.eyes);
  assert.match(
    s.choice!.title,
    /^Eyes in the Dark · The opposing team chooses a questing character of Aragorn & Théodred & Glóin/,
  );
  assert.equal(s.choice!.options.length, 2);
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].committed, false);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[1].committed, true);
  assert.ok(!seatView(s, 1).heroes[2].committed);
  assert.ok(!seatView(s, 1).heroes[2].exhausted);
  // Shadow: +1 attack; if it destroys a character each player raises his threat.
  s = base(2);
  const warg = engaged(s, WQ.troll);
  warg.shadows = [WQ.eyes];
  const [victim] = allies(s, [GUARD]);
  s.encounterDeck = [];
  s = defend(s, warg, victim);
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  reload(s);
});

test("Set 21: Eastern Crows surge while a copy is in the discard pile; The Sorcerer's Tower gives treacheries doomed 1 and resolves a treachery when explored; Power Sevenfold", () => {
  let s = base();
  reveal(s, WQ.crows, WQ.gate);
  s = settle(s);
  assert.ok(
    !s.staging.some((u) => u.code === WQ.gate),
    "no surge without a discarded copy",
  );
  s = base();
  s.encounterDiscard = [WQ.crows];
  reveal(s, WQ.crows, WQ.gate);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === WQ.gate),
    "it surges",
  );
  // The Sorcerer's Tower.
  s = base(2);
  stage(s, WQ.tower);
  assert.equal(H.revealedDoomed!(s, WQ.reach, "encounter"), 1);
  assert.equal(H.revealedDoomed!(s, WQ.troll, "encounter"), 0);
  reveal(s, WQ.reach);
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  s = base();
  const tower = activate(s, WQ.tower);
  void tower;
  const [hero] = s.heroes;
  hero.exhausted = true;
  s.encounterDeck = [WQ.gate];
  s.encounterDiscard = [WQ.reach];
  progress(s, 4);
  flush(s);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1, "The Necromancer's Reach resolved");
  assert.ok(s.encounterDiscard.includes(WQ.reach));
  // Power Sevenfold: discard chosen non-unique encounter cards in play and
  // reveal as many; a discarded Necromancer's Pass discards its guarded card.
  s = base();
  const [, b] = hand(s, [GUARD, ARCHER]);
  const pass = stage(s, WQ.pass);
  s.wizardsQuest!.passGuards.push({
    locationId: pass.id,
    card: s.hand.pop()!,
    player: 0,
  });
  stage(s, WQ.hall);
  s.encounterDeck = [WQ.sevenfold, WQ.gate, WQ.gate];
  run(s, fx("reveal"));
  assert.match(
    s.choice!.title,
    /^Power Sevenfold · The opposing team chooses non-unique encounter cards in play \(0 chosen\)/,
  );
  assert.ok(
    !s.choice!.options.some((o) => o.code === WQ.hall),
    "unique cards cannot be chosen",
  );
  s = choose(s, pass.id);
  s = choose(s, "resolve");
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.id === pass.id));
  assert.ok(s.encounterDiscard.includes(WQ.pass));
  assert.equal(s.staging.filter((u) => u.code === WQ.gate).length, 1);
  assert.ok(s.discard.includes(ARCHER), "the guarded card is discarded");
  assert.equal(s.wizardsQuest!.passGuards.length, 0);
  void b;
  // Shadow: reveal a card or the attack is undefended.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.sevenfold];
  s.encounterDeck = [WQ.gate];
  s = defend(s, orcs, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Power Sevenfold · Shadow: reveal an encounter card, or treat this attack as undefended/,
  );
  s = choose(s, "undefended");
  s = settle(s);
  assert.ok(logged(s, /this attack is treated as undefended/));
  reload(s);
});

test("Set 22: Hill Troll cannot have attachments; Troll Cave draws a card and searches the top 5 for a Hill Troll; Befouled Equipment", () => {
  let s = base(2);
  const troll = stage(s, WQ.troll);
  assert.equal(H.cannotAttach!(s, troll), true);
  const cave = stage(s, WQ.cave);
  s.encounterDeck = [WQ.gate, WQ.gate, WQ.gate, WQ.troll, WQ.gate, WQ.gate];
  deck(s, [GUARD], 0);
  deck(s, [GUARD], 1);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: cave.id });
  s = settle(s, "use");
  assert.equal(s.activeLocation?.code, WQ.cave);
  assert.equal(s.staging.filter((u) => u.code === WQ.troll).length, 2);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  // Befouled Equipment: on the character with the most attachments; at the
  // end of the round it discards another attachment, then itself.
  s = base();
  const [hero] = s.heroes;
  attach(s, hero, COURAGE);
  attach(s, hero, BLADE);
  reveal(s, WQ.befouled);
  s = settle(s);
  assert.deepEqual(
    s.heroes[0].attachments.map((a) => a.code).sort(),
    [BLADE, COURAGE, WQ.befouled].sort(),
  );
  run(s, ...H.roundEnd!(s));
  assert.match(
    s.choice!.title,
    /^Befouled Equipment · Discard an attachment from Aragorn/,
  );
  assert.ok(!s.choice!.options.some((o) => o.code === WQ.befouled));
  s = choose(s, s.choice!.options[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].attachments.length, 2);
  run(s, ...H.roundEnd!(s));
  s = settle(s);
  assert.deepEqual(
    s.heroes[0].attachments.map((a) => a.code),
    [WQ.befouled],
  );
  run(s, ...H.roundEnd!(s));
  s = settle(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(WQ.befouled));
  reload(s);
});

test("Set 23: Hunting Warg attacks after it engages (+2 attack with a blank shadow card); Hunter's Lookout; Restless Hunters", () => {
  let s = base();
  const hunting = stage(s, WQ.hunting);
  s.encounterDeck = [WQ.gate];
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: hunting.id });
  assert.match(s.choice!.title, /^Hunting Warg · Immediate attack/);
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.ok(logged(s, /Hunting Warg makes an immediate attack/));
  // Forest Gate's shadow has an effect: no +2.
  assert.ok(!logged(s, /no shadow effect: \+2 attack/));
  s = base();
  const hunting2 = stage(s, WQ.hunting);
  s.encounterDeck = [WQ.troll];
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: hunting2.id });
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /Hunting Warg is dealt a shadow card with no shadow effect: \+2 attack/,
    ),
  );
  assert.equal(s.heroes[0].damage, 3, "5 attack against 2 defense");
  // Hunter's Lookout: at the end of the round, threat per staged enemy;
  // travel: the highest attack enemy attacks the first player.
  s = base(2);
  const lookout = stage(s, WQ.lookout);
  stage(s, WQ.warg);
  stage(s, WQ.orcs);
  run(s, ...H.roundEnd!(s));
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  s.phase = "travel";
  s.encounterDeck = [];
  s = act(s, { type: "TRAVEL", id: lookout.id });
  assert.match(s.choice!.title, /^Dol Guldur Orcs · Immediate attack/);
  s = settle(s);
  // Tied for the highest attack: the first player chooses which attacks.
  s = base();
  const second = stage(s, WQ.lookout);
  stage(s, WQ.warg);
  stage(s, WQ.howling);
  s.phase = "travel";
  s.encounterDeck = [];
  s = act(s, { type: "TRAVEL", id: second.id });
  assert.match(
    s.choice!.title,
    /^Hunter's Lookout · Choose the enemy with the highest attack/,
  );
  assert.equal(s.choice!.options.length, 2);
  s = settle(s);
  // Restless Hunters: each engaged enemy returns to the staging area.
  s = base(2);
  engaged(s, WQ.orcs, 0);
  engaged(s, WQ.warg, 1);
  reveal(s, WQ.restless);
  s = settle(s);
  assert.equal(s.staging.length, 2);
  assert.equal(
    seatView(s, 0).engaged.length + seatView(s, 1).engaged.length,
    0,
  );
  s = base();
  reveal(s, WQ.restless, WQ.gate);
  s = settle(s);
  assert.ok(
    logged(s, /Restless Hunters: no enemy was returned; it gains surge/),
  );
  // Shadow: +1 attack; if it destroys a character the attacker returns.
  s = base();
  const troll = engaged(s, WQ.troll);
  troll.shadows = [WQ.restless];
  const [chump] = allies(s, [GUARD]);
  s.encounterDeck = [];
  s = defend(s, troll, chump);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === troll.id));
  reload(s);
});

test("Set 24: Dol Guldur Orcs; The Shadow Road damages after optional engagements and on travel; The Necromancer's Reach", () => {
  let s = base(2);
  reveal(s, WQ.orcs);
  assert.match(
    s.choice!.title,
    /^Dol Guldur Orcs · Deal 1 damage to a character you control/,
  );
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  // Shadow: -1 defense per damage on the defender.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.orcs];
  s.heroes[0].damage = 1;
  s.encounterDeck = [];
  s = defend(s, orcs, s.heroes[0]);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 3, "3 attack against 2 - 1 = 1 defense");
  // The Shadow Road.
  s = base();
  const road = stage(s, WQ.road);
  const warg = stage(s, WQ.howling);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: warg.id });
  assert.match(
    s.choice!.title,
    /^The Shadow Road · Deal 1 damage to a character you control/,
  );
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: road.id });
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  // The Necromancer's Reach: 1 damage to each exhausted character.
  s = base(2);
  s.heroes[0].exhausted = true;
  forOwner(s, 1, () => {
    s.heroes[1].exhausted = true;
    s.heroes[2].exhausted = true;
  });
  reveal(s, WQ.reach);
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  // Shadow: +1 attack, +2 against a damaged defender.
  s = base();
  const reach = engaged(s, WQ.orcs);
  reach.shadows = [WQ.reach];
  s.heroes[0].damage = 1;
  s.encounterDeck = [];
  s = defend(s, reach, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(s, /The Necromancer's Reach: the attacking enemy gets \+2 attack/),
  );
  reload(s);
});

test("Set 25: Ravenous Spider exhausts a character after it destroys one; Forest Gate; Nightfall raises the first player's threat in each refresh phase", () => {
  let s = base();
  const spider = engaged(s, WQ.ravenous);
  const [guard] = allies(s, [GUARD]);
  s.encounterDeck = [];
  s = defend(s, spider, guard);
  assert.match(
    s.choice!.title,
    /^Ravenous Spider · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  // Shadow: if this attack destroys a character, exhaust a character.
  s = base();
  const troll = engaged(s, WQ.troll);
  troll.shadows = [WQ.ravenous];
  const [chump] = allies(s, [GUARD]);
  s.encounterDeck = [];
  s = defend(s, troll, chump);
  assert.match(s.choice!.title, /Exhaust a character you control/);
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  // Forest Gate: +1 threat per enemy in the staging area; shadow: +1 attack
  // per enemy engaged with the defending player.
  s = base();
  const gate = stage(s, WQ.gate);
  stage(s, WQ.warg);
  stage(s, WQ.orcs);
  assert.equal(threatOf(s, gate), 3);
  s = base();
  const orcs = engaged(s, WQ.orcs);
  engaged(s, WQ.warg);
  orcs.shadows = [WQ.gate];
  s.encounterDeck = [];
  s = defend(s, orcs, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /Forest Gate: the attacking enemy gets \+2 attack/));
  // Nightfall.
  s = base(2);
  reveal(s, WQ.nightfall);
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21], "doomed 1");
  assert.deepEqual(s.wizardsQuest!.nightfall, [
    { player: 0, code: WQ.nightfall },
  ]);
  assert.ok(!s.encounterDiscard.includes(WQ.nightfall));
  assert.equal(H.refreshThreatBonus!(s), 1);
  forOwner(s, 1, () => assert.equal(H.refreshThreatBonus!(s), 0));
  reload(s);
});

test("Set 26: Venomous Spider stops readying; Pitch-dark Thicket protects staged enemies; Fastness of Mirkwood", () => {
  let s = base();
  const venom = engaged(s, WQ.venomous);
  s.encounterDeck = [];
  s = defend(s, venom, s.heroes[0]);
  s = settle(s);
  assert.equal(H.cannotReady!(s, s.heroes[0]), true);
  s.round++;
  assert.equal(H.cannotReady!(s, s.heroes[0]), false);
  // Shadow: the defender cannot ready this round.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.venomous];
  s.encounterDeck = [];
  s = defend(s, orcs, s.heroes[1]);
  s = settle(s);
  assert.equal(H.cannotReady!(s, s.heroes[1]), true);
  // Pitch-dark Thicket.
  s = base();
  stage(s, WQ.thicket);
  const staged = stage(s, WQ.orcs);
  const fighting = engaged(s, WQ.warg);
  assert.equal(H.damageAmount!(s, staged, 2, {}), 0);
  assert.equal(H.damageAmount!(s, fighting, 2, {}), 2);
  // Shadow: an enemy engaged this round cannot take damage this round.
  s = base();
  const warg = stage(s, WQ.howling);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: warg.id });
  s = settle(s);
  const w = s.engaged.find((u) => u.code === WQ.howling)!;
  w.shadows = [WQ.thicket];
  s.encounterDeck = [];
  s = defend(s, w, s.heroes[0]);
  s = settle(s);
  assert.equal(H.damageAmount!(s, s.engaged[0], 3, { combatDamage: true }), 0);
  // Fastness of Mirkwood: one different 0 cost location per player, limit 2.
  s = base(3);
  s.encounterDeck = [WQ.fastness, WQ.pine, WQ.pine, WQ.grove, WQ.troll];
  s.encounterDiscard = [WQ.pass];
  run(s, fx("reveal"));
  // Eleanor could cancel it.
  assert.match(s.choice!.title, /^Revealed: Fastness of Mirkwood/);
  s = choose(s, "resolve");
  assert.match(
    s.choice!.title,
    /^Fastness of Mirkwood · The opposing team adds a different 0 cost location/,
  );
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Necromancer's Pass",
    "Oak-wood Grove",
    "Pine Slopes",
  ]);
  s = choose(s, WQ.pine);
  assert.ok(!s.choice!.options.some((o) => o.code === WQ.pine));
  s = choose(s, WQ.pass);
  s = settle(s);
  assert.equal(s.staging.length, 2, "limit 2");
  // Shadow: if it destroys a character, the active location returns.
  s = base();
  const active = activate(s, WQ.gate);
  const troll = engaged(s, WQ.troll);
  troll.shadows = [WQ.fastness];
  const [chump] = allies(s, [GUARD]);
  s.encounterDeck = [];
  s = defend(s, troll, chump);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === active.id));
  reload(s);
});

test("Set 27: Dark Bats reveal a card and leave after damaging; Forest Stream; Treacherous Fog", () => {
  let s = base();
  const bats = engaged(s, WQ.bats);
  s.encounterDeck = [WQ.gate, WQ.gate];
  s = defend(s, bats, s.heroes[1]);
  s = settle(s);
  assert.ok(!s.engaged.some((u) => u.id === bats.id));
  assert.ok(s.encounterDiscard.includes(WQ.bats));
  assert.ok(s.staging.some((u) => u.code === WQ.gate));
  // Shadow: +1 attack and an additional shadow card.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.bats];
  s.encounterDeck = [WQ.gate, WQ.gate];
  s = defend(s, orcs, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /Dark Bats: the attacking enemy is dealt an additional shadow card/,
    ),
  );
  // Forest Stream: removes 2 progress at the end of the round; travel raises
  // each player's threat by 2.
  s = base(2);
  const stream = stage(s, WQ.stream);
  s.progress = 3;
  run(s, ...H.roundEnd!(s));
  s = settle(s);
  assert.equal(s.progress, 1);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stream.id });
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  // Treacherous Fog: +2 threat to staged enemies and locations this phase.
  s = base();
  const gate = stage(s, WQ.gate);
  const warg = stage(s, WQ.warg);
  s.phase = "quest";
  reveal(s, WQ.fog);
  s = settle(s);
  assert.equal(threatOf(s, gate), 3 + 1, "1 + 2, +1 for the staged enemy");
  assert.equal(threatOf(s, warg), 4);
  s.phase = "travel";
  assert.equal(threatOf(s, warg), 2);
  // Shadow: each enemy engaged with the defending player gets +1 attack and
  // +1 defense until the end of the phase.
  s = base();
  const o = engaged(s, WQ.orcs);
  const other = engaged(s, WQ.warg);
  o.shadows = [WQ.fog];
  s.encounterDeck = [];
  s = defend(s, o, s.heroes[0]);
  s = settle(s);
  assert.equal(
    stats(
      s,
      s.engaged.find((u) => u.id === other.id)!,
    ).defense,
    2,
  );
  reload(s);
});

test("Set 28: Howling Warg reveals a discarded Warg; The Wargs' Glade; Weighed Down", () => {
  let s = base();
  reveal(s, WQ.howling, WQ.hunting, WQ.gate);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === WQ.hunting),
    "the Warg is revealed",
  );
  s = base();
  reveal(s, WQ.howling, WQ.gate, WQ.gate);
  s = settle(s);
  assert.deepEqual(s.encounterDiscard, [WQ.gate]);
  // Shadow: +1 attack, +2 for a Warg.
  s = base();
  const hunter = engaged(s, WQ.hunting);
  hunter.shadows = [WQ.howling];
  s.encounterDeck = [];
  s = defend(s, hunter, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /Howling Warg: the attacking enemy gets \+2 attack/));
  // The Wargs' Glade: the first Warg revealed each round surges; explored, a
  // non-unique Warg enemy from the deck or discard pile is staged.
  s = base();
  const glade = stage(s, WQ.glade);
  reveal(s, WQ.warg, WQ.gate, WQ.howling, WQ.gate);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === WQ.gate),
    "the first Warg surges",
  );
  assert.equal(
    H.revealedSurge!(s, WQ.howling),
    false,
    "only the first each round",
  );
  s.staging = s.staging.filter((u) => u.id !== glade.id);
  s.activeLocation = glade;
  s.encounterDeck = [WQ.gate];
  s.encounterDiscard = [WQ.hunting];
  progress(s, 5);
  flush(s);
  assert.match(
    s.choice!.title,
    /^The Wargs' Glade · The opposing team adds a non-unique Warg enemy/,
  );
  s = choose(s, WQ.hunting);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WQ.hunting));
  // Weighed Down: exhaust each character with an attachment.
  s = base();
  attach(s, s.heroes[0], COURAGE);
  reveal(s, WQ.weighed);
  s = settle(s);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.heroes[1].exhausted, false);
  s = base();
  reveal(s, WQ.weighed, WQ.gate);
  s = settle(s);
  assert.ok(
    logged(s, /Weighed Down: no character was exhausted; it gains surge/),
  );
  // Shadow: discard an attachment from the defending character.
  s = base();
  const orcs = engaged(s, WQ.orcs);
  orcs.shadows = [WQ.weighed];
  attach(s, s.heroes[0], COURAGE);
  s.encounterDeck = [];
  s = defend(s, orcs, s.heroes[0]);
  s = settle(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.ok(s.discard.includes(COURAGE));
  reload(s);
});
