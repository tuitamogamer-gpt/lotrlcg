import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, optionalEngagementProblem } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stats, threatOf } from "../src/game/core";
import { progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { forOwner, seatView } from "../src/game/table";
import { WOODLAND_REALM_HOOKS, WR } from "../src/game/woodland-realm";
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
} from "./woodland-realm-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = WOODLAND_REALM_HOOKS;
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
const exhaustedCount = (s: GameState, p = 0) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => u.exhausted,
  ).length;
const GUARD = "01013",
  SNOWBOURN = "01016",
  ARCHER = "01017",
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

test("Set 1: Ungoliant's Spawn takes only combat damage, has no player attachments and stops player card readying from the staging area; Forest Grove; Despair blanks the characters' text boxes", () => {
  let s = base();
  const spawn = stage(s, WR.spawn);
  assert.equal(H.cannotAttach!(s, spawn, COURAGE), true);
  assert.equal(H.cannotAttach!(s, spawn, WR.driven), false);
  assert.equal(H.damageAmount!(s, spawn, 3, {}), 0);
  assert.equal(H.damageAmount!(s, spawn, 3, { combatDamage: true }), 3);
  assert.equal(H.cannotPlayerReady!(s), true);
  s.staging = [];
  forOwner(s, 0, () => s.engaged.push(spawn));
  assert.equal(H.cannotPlayerReady!(s), false, "only from the staging area");
  // Forest Grove: X is 1 more than the stage number.
  s = base(2);
  const grove = stage(s, WR.grove);
  assert.equal(threatOf(s, grove), 2);
  assert.equal(H.locationQuestBonus!(s, grove), 2);
  atQuest(s, WR.dark);
  assert.equal(threatOf(s, grove), 3);
  assert.equal(H.locationQuestBonus!(s, grove), 3);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: grove.id });
  assert.match(
    s.choice!.title,
    /^Forest Grove · Deal 3 damage to a character you control/,
  );
  s = settle(s);
  for (const p of [0, 1])
    assert.equal(
      seatView(s, p).heroes.reduce((n, h) => n + h.damage, 0),
      3,
      `player ${p} deals 3 damage`,
    );
  // Despair: each character's printed text box is blank until the end of the round.
  s = base();
  const [ally] = allies(s, [GUARD]);
  reveal(s, WR.despair);
  s = settle(s);
  assert.equal(s.woodlandRealm!.despairRound, s.round);
  assert.equal(H.characterBlanked!(s, s.heroes[0]), true);
  assert.equal(H.characterBlanked!(s, ally), true);
  assert.ok(s.encounterDiscard.includes(WR.despair));
  s.round++;
  assert.equal(H.characterBlanked!(s, s.heroes[0]), false);
  // Shadow: the defending character until the end of the phase.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.despair];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /Despair: the defending character's text box is blank/));
  s.phase = "attack";
  assert.equal(H.characterBlanked!(s, s.heroes[0]), true);
  assert.equal(H.characterBlanked!(s, s.heroes[1]), false);
  s.phase = "refresh";
  assert.equal(H.characterBlanked!(s, s.heroes[0]), false);
  reload(s);
});

test("Set 2: Chieftain Ufthak brings an Orc enemy of cost 1 or less after it engages; Abandoned Camp shuffles a discarded card back when explored; Gathering Gloom", () => {
  let s = base();
  const ufthak = stage(s, WR.ufthak);
  assert.equal(H.cannotAttach!(s, ufthak, BLADE), true);
  assert.equal(H.damageAmount!(s, ufthak, 2, {}), 0);
  s.encounterDeck = [WR.wolf, WR.patrol, WR.trail];
  s.encounterDiscard = [WR.orcs, WR.bear];
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: ufthak.id });
  assert.match(
    s.choice!.title,
    /^Chieftain Ufthak · The opposing team puts an Orc enemy of cost 1 or less into play engaged with/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Ambushing Orcs", "Mirkwood Patrol", "Wolf Rider"],
  );
  s = choose(s, WR.patrol);
  s = settle(s);
  assert.deepEqual(
    s.engaged.map((u) => u.code).sort(),
    [WR.ufthak, WR.patrol].sort(),
  );
  assert.deepEqual([...s.encounterDeck].sort(), [WR.wolf, WR.trail].sort());
  // Abandoned Camp: the explored copy itself is not offered.
  s = base();
  activate(s, WR.camp);
  s.encounterDiscard = [WR.gloom, WR.spiders];
  s.encounterDeck = [WR.trail];
  progress(s, 2);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Abandoned Camp · The opposing team shuffles a card from the encounter discard pile into the encounter deck/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Gathering Gloom", "Spiders of Mirkwood"],
  );
  s = choose(s, WR.gloom);
  s = settle(s);
  assert.deepEqual([...s.encounterDeck].sort(), [WR.trail, WR.gloom].sort());
  assert.deepEqual(
    [...s.encounterDiscard].sort(),
    [WR.spiders, WR.camp].sort(),
  );
  // Gathering Gloom: each player raises his threat by the stage number + 1.
  s = base(2);
  reveal(s, WR.gloom);
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  s = base(2);
  atQuest(s, WR.fear);
  reveal(s, WR.gloom);
  s = settle(s);
  assert.deepEqual(threats(s), [24, 24]);
  // Shadow: +1 attack, +2 at 35 threat or more.
  for (const [threat, bonus] of [
    [20, 1],
    [35, 2],
  ] as const) {
    s = base();
    s.threat = threat;
    const wolf = engaged(s, WR.wolf);
    wolf.shadows = [WR.gloom];
    s.encounterDeck = [];
    s = defend(s, wolf, s.heroes[0]);
    s = settle(s);
    assert.ok(
      logged(
        s,
        new RegExp(
          `Gathering Gloom: the attacking enemy gets \\+${bonus} attack`,
        ),
      ),
    );
  }
  reload(s);
});

test("Set 3: Black Forest Bats remove a questing character; Enchanted Stream blocks progress on the quest and holds the exhausted heroes; Exhaustion", () => {
  let s = base();
  s.phase = "staging";
  const [hero, other] = s.heroes;
  quest(hero, s);
  quest(other, s);
  reveal(s, WR.bats);
  assert.match(
    s.choice!.title,
    /^Black Forest Bats · The opposing team chooses a questing character to remove from the quest/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [hero.id, other.id].sort(),
  );
  s = choose(s, hero.id);
  s = settle(s);
  assert.equal(get(s, hero.id)!.committed, false);
  assert.ok(!s.committedIds.includes(hero.id));
  assert.equal(get(s, other.id)!.committed, true);
  assert.ok(s.staging.some((u) => u.code === WR.bats));
  // Shadow: Black Forest Bats is shuffled into the encounter deck.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.bats];
  s.encounterDeck = [WR.trail];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  assert.ok(s.encounterDeck.includes(WR.bats));
  assert.ok(!s.encounterDiscard.includes(WR.bats));
  // Enchanted Stream.
  s = base();
  const stream = stage(s, WR.stream);
  progress(s, 3);
  assert.equal(s.progress, 0, "no progress on the main quest");
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stream.id });
  assert.match(
    s.choice!.title,
    /^Enchanted Stream · Exhaust a hero you control/,
  );
  const tired = s.heroes[1];
  s = choose(s, tired.id);
  s = settle(s);
  assert.equal(get(s, tired.id)!.exhausted, true);
  assert.equal(H.cannotReady!(s, get(s, tired.id)!), true);
  assert.equal(H.cannotReady!(s, s.heroes[0]), false);
  progress(s, 2);
  assert.equal(s.activeLocation?.code, WR.stream);
  progress(s, 4);
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation, null, "explored");
  assert.equal(H.cannotReady!(s, get(s, tired.id)!), false);
  // Exhaustion.
  s = base(2);
  reveal(s, WR.exhaustion);
  assert.match(
    s.choice!.title,
    /^Exhaustion · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(exhaustedCount(s, 0), 1);
  assert.equal(exhaustedCount(s, 1), 1);
  assert.equal(H.cannotPlayerReady!(s), true);
  s.round++;
  assert.equal(H.cannotPlayerReady!(s), false);
  // Shadow: the defending character cannot ready until the end of the round.
  s = base();
  const rider = engaged(s, WR.wolf);
  rider.shadows = [WR.exhaustion];
  s.encounterDeck = [];
  s = defend(s, rider, s.heroes[0]);
  s = settle(s);
  assert.equal(H.cannotReady!(s, s.heroes[0]), true);
  s.round++;
  assert.equal(H.cannotReady!(s, s.heroes[0]), false);
  reload(s);
});

test("Set 4: Spiders of Mirkwood exhaust a character after they engage; The Spiders' Ring; Caught in a Web keeps its hero exhausted until 2 resources are spent", () => {
  let s = base();
  const spiders = stage(s, WR.spiders);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: spiders.id });
  assert.match(
    s.choice!.title,
    /^Spiders of Mirkwood · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(exhaustedCount(s), 1);
  // Shadow: +1 attack, +2 for a Spider.
  for (const [code, bonus] of [
    [WR.wolf, 1],
    [WR.giant, 2],
  ] as const) {
    s = base();
    const enemy = engaged(s, code);
    enemy.shadows = [WR.spiders];
    s.encounterDeck = [];
    const [chump] = allies(s, [GUARD]);
    s = defend(s, enemy, chump);
    s = settle(s);
    assert.ok(
      logged(
        s,
        new RegExp(
          `Spiders of Mirkwood: the attacking enemy gets \\+${bonus} attack`,
        ),
      ),
    );
  }
  // The Spiders' Ring: each Spider enemy gets +1 threat; explored, a non-unique Spider.
  s = base();
  stage(s, WR.ring);
  const giant = stage(s, WR.giant);
  const wolf = stage(s, WR.wolf);
  assert.equal(threatOf(s, giant), 4);
  assert.equal(threatOf(s, wolf), 2);
  s = base();
  activate(s, WR.ring);
  s.encounterDeck = [WR.trail, WR.giant, WR.wolf];
  s.encounterDiscard = [WR.spawn, WR.wicked];
  progress(s, 4);
  flush(s);
  assert.match(
    s.choice!.title,
    /^The Spiders' Ring · The opposing team adds a non-unique Spider enemy to the staging area/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Giant Spider", "Wicked Spider"],
  );
  s = choose(s, WR.wicked);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.wicked));
  // Caught in a Web.
  s = base();
  const hero = s.heroes[0];
  hero.resources = 1;
  reveal(s, WR.web);
  assert.match(
    s.choice!.title,
    /^Caught in a Web · The opposing team attaches it to a hero and exhausts that hero/,
  );
  s = choose(s, hero.id);
  s = settle(s);
  const webbed = get(s, hero.id)!;
  const web = webbed.attachments.find((a) => a.code === WR.web)!;
  assert.ok(web, "attached as a condition");
  assert.equal(webbed.exhausted, true);
  assert.ok(!s.encounterDiscard.includes(WR.web));
  assert.equal(s.woodlandRealm!.resolving.length, 0);
  assert.equal(H.cannotReady!(s, webbed), true);
  assert.match(
    H.abilityProblem!(s, webbed, web.id)!,
    /needs 2 resources in its pool/,
  );
  webbed.resources = 3;
  s.phase = "planning";
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: web.id });
  s = settle(s);
  assert.equal(get(s, hero.id)!.resources, 1);
  assert.deepEqual(s.woodlandRealm!.webPaid, [hero.id]);
  assert.equal(H.cannotReady!(s, get(s, hero.id)!), false);
  run(s, fx("ready", { target: hero.id }));
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.deepEqual(
    s.woodlandRealm!.webPaid,
    [],
    "each payment readies it once",
  );
  // Before the refresh phase the controller is offered the payment.
  s = base();
  const other = s.heroes[1];
  attach(s, other, WR.web);
  other.exhausted = true;
  other.resources = 2;
  H.combatEnd!(s);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Caught in a Web · Spend 2 resources from Théodred's pool so it readies in the refresh phase\?/,
  );
  s = choose(s, "use");
  s = settle(s);
  assert.equal(get(s, other.id)!.resources, 0);
  assert.equal(H.cannotReady!(s, get(s, other.id)!), false);
  reload(s);
});

test("Set 5: Wolf Rider surges with another Orc in the staging area and joins Orc attacks as a shadow; The Goblins' Caves; Driven by Shadow", () => {
  let s = base();
  stage(s, WR.wolf);
  s.encounterDeck = [WR.wolf, WR.trail, WR.trail];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === WR.wolf).length, 2);
  assert.equal(
    s.staging.filter((u) => u.code === WR.trail).length,
    1,
    "surge: another card is revealed",
  );
  s = base();
  s.encounterDeck = [WR.wolf, WR.trail];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === WR.trail).length, 0);
  // Shadow: the attacking Orc brings Wolf Rider.
  for (const [code, joins] of [
    [WR.patrol, true],
    [WR.giant, false],
  ] as const) {
    s = base();
    const enemy = engaged(s, code);
    enemy.shadows = [WR.wolf];
    s.encounterDeck = [];
    const [chump] = allies(s, [GUARD]);
    s = defend(s, enemy, chump);
    s = settle(s);
    assert.equal(
      s.engaged.some((u) => u.code === WR.wolf),
      joins,
    );
    // Otherwise it stays a shadow card until it is discarded.
    assert.equal(
      [...s.encounterDiscard, ...(get(s, enemy.id)?.shadows ?? [])].includes(
        WR.wolf,
      ),
      !joins,
    );
  }
  // The Goblins' Caves: each Orc enemy gets +1 attack; explored, a non-unique Orc.
  s = base();
  stage(s, WR.caves);
  const rider = engaged(s, WR.wolf);
  const spider = engaged(s, WR.giant);
  assert.equal(stats(s, rider).attack, 3);
  assert.equal(stats(s, spider).attack, 3);
  s = base();
  activate(s, WR.caves);
  s.encounterDeck = [WR.trail, WR.patrol];
  s.encounterDiscard = [WR.ufthak, WR.orcs];
  progress(s, 5);
  flush(s);
  assert.match(
    s.choice!.title,
    /^The Goblins' Caves · The opposing team adds a non-unique Orc enemy to the staging area/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Ambushing Orcs", "Mirkwood Patrol"],
  );
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.orcs));
  // Driven by Shadow: on an engaged enemy, which returns to the staging area.
  s = base();
  const target = engaged(s, WR.giant);
  reveal(s, WR.driven);
  assert.match(
    s.choice!.title,
    /^Driven by Shadow · The opposing team attaches it to an enemy, which returns to the staging area/,
  );
  s = choose(s, target.id);
  s = settle(s);
  const driven = s.staging.find((u) => u.id === target.id)!;
  assert.ok(driven, "it returns to the staging area");
  assert.ok(driven.attachments.some((a) => a.code === WR.driven));
  assert.equal(threatOf(s, driven), 3 + 2);
  assert.equal(stats(s, driven).attack, 3 + 2);
  assert.equal(stats(s, driven).defense, 2 + 2);
  assert.equal(H.immune!(s, driven), true);
  assert.ok(!s.encounterDiscard.includes(WR.driven));
  // No enemy in play: it gains surge.
  s = base();
  s.encounterDeck = [WR.driven, WR.trail];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(s, /Driven by Shadow: there is no enemy in play; it gains surge/),
  );
  assert.ok(s.staging.some((u) => u.code === WR.trail));
  assert.ok(s.encounterDiscard.includes(WR.driven));
  reload(s);
});

test("Set 6: Beast of Taur-nu-Fuin grows with its damage and is hurt by blank shadow cards; Dark Black Woods; Wind-whipped Rain", () => {
  let s = base();
  const beast = engaged(s, WR.beast);
  assert.equal(stats(s, beast).attack, 3);
  beast.damage = 2;
  assert.equal(stats(s, beast).attack, 5);
  beast.damage = 0;
  beast.shadows = [WR.trail];
  s.encounterDeck = [];
  const hero = s.heroes[0];
  s = defend(s, beast, hero);
  s = settle(s);
  assert.equal(get(s, beast.id)!.damage, 1);
  assert.ok(
    logged(
      s,
      /Beast of Taur-nu-Fuin is dealt a shadow card with no shadow effect/,
    ),
  );
  // 1 damage from the Forced effect, then 4 attack against 2 defense.
  assert.equal(get(s, hero.id)!.damage, 1 + 2);
  // Dark Black Woods: +1 threat per copy in the staging area; discard on travel.
  s = base();
  const woods = stage(s, WR.woods);
  stage(s, WR.woods);
  assert.equal(threatOf(s, woods), 3);
  hand(s, [GUARD, SNOWBOURN, ARCHER]);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: woods.id });
  assert.match(
    s.choice!.title,
    /^Dark Black Woods · Discard a card from your hand \(2 left\)/,
  );
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 2);
  // Wind-whipped Rain: keep 1 card, or 1 damage per card in hand.
  s = base();
  const [kept] = hand(s, [GUARD, SNOWBOURN, ARCHER]);
  reveal(s, WR.rain);
  assert.match(
    s.choice!.title,
    /^Wind-whipped Rain · Keep 1 card and discard the rest, or assign 3 damage among characters you control/,
  );
  s = choose(s, "keep");
  s = choose(s, kept.id);
  s = settle(s);
  assert.deepEqual(
    s.hand.map((u) => u.id),
    [kept.id],
  );
  assert.equal(s.discard.length, 2);
  s = base();
  hand(s, [GUARD, SNOWBOURN]);
  reveal(s, WR.rain);
  s = choose(s, "damage");
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  assert.equal(s.hand.length, 2);
  // Shadow: 1 random card from the defending player's hand.
  s = base();
  hand(s, [GUARD, SNOWBOURN]);
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.rain];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 1);
  reload(s);
});

test("Set 7: Giant Spider exhausts a character of each player; Giant Web becomes the active location; Eyes of the Forest", () => {
  let s = base(2);
  reveal(s, WR.giant);
  assert.match(
    s.choice!.title,
    /^Giant Spider · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(exhaustedCount(s, 0), 1);
  assert.equal(exhaustedCount(s, 1), 1);
  // Shadow: the defending player exhausts a character.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.giant];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Giant Spider · Exhaust a character you control/,
  );
  assert.ok(!s.choice!.options.some((o) => o.id === s.heroes[0].id));
  s = settle(s);
  assert.equal(exhaustedCount(s), 2, "the defender and one more character");
  // Giant Web: the previous active location returns to the staging area.
  s = base();
  const trail = activate(s, WR.trail);
  reveal(s, WR.giantWeb);
  s = settle(s);
  assert.equal(s.activeLocation?.code, WR.giantWeb);
  assert.ok(s.staging.some((u) => u.id === trail.id));
  s = base();
  reveal(s, WR.giantWeb);
  s = settle(s);
  assert.equal(s.activeLocation?.code, WR.giantWeb);
  // Eyes of the Forest: Doomed 1; the opposing team discards a card from each hand.
  s = base(2);
  hand(s, [GUARD, ARCHER], 0);
  hand(s, [SNOWBOURN], 1);
  reveal(s, WR.eyes);
  assert.match(
    s.choice!.title,
    /^Eyes of the Forest · The opposing team discards a card from Aragorn & Théodred & Glóin's hand/,
  );
  s = choose(s, s.choice!.options.find((o) => o.code === ARCHER)!.id);
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    [GUARD],
  );
  assert.equal(seatView(s, 1).hand.length, 0);
  // Shadow: +X attack, the stage number.
  s = base();
  atQuest(s, WR.fear);
  const rider = engaged(s, WR.wolf);
  rider.shadows = [WR.eyes];
  s.encounterDeck = [];
  s = defend(s, rider, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(s, /Eyes of the Forest: the attacking enemy gets \+3 attack/),
  );
  reload(s);
});

test("Set 8: Mirkwood Patrol stops optional engagements from the staging area; Mountains of Mirkwood; Hatred Rekindled makes each engaged enemy attack", () => {
  let s = base();
  stage(s, WR.patrol);
  const wolf = stage(s, WR.wolf);
  s.phase = "encounter";
  assert.equal(H.cannotOptionallyEngage!(s, wolf), true);
  assert.ok(optionalEngagementProblem(s, wolf));
  // Shadow: +1 attack, +2 if the enemy engaged the player this round.
  s = base();
  const fresh = stage(s, WR.wolf);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: fresh.id });
  s = settle(s);
  get(s, fresh.id)!.shadows = [WR.patrol];
  s.encounterDeck = [];
  s = defend(s, get(s, fresh.id)!, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /Mirkwood Patrol: the attacking enemy gets \+2 attack/));
  s = base();
  const old = engaged(s, WR.wolf);
  old.shadows = [WR.patrol];
  s.encounterDeck = [];
  s = defend(s, old, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /Mirkwood Patrol: the attacking enemy gets \+1 attack/));
  // Mountains of Mirkwood: each player raises his threat by 2 at the end of the round.
  s = base(2);
  stage(s, WR.mountains);
  run(s, ...H.roundEnd!(s));
  assert.deepEqual(threats(s), [22, 22]);
  // Shadow: raise your threat by 2, or the attacking enemy gets +2 attack.
  for (const option of ["threat", "attack"]) {
    s = base();
    const rider = engaged(s, WR.wolf);
    rider.shadows = [WR.mountains];
    s.encounterDeck = [];
    s = defend(s, rider, s.heroes[0]);
    assert.match(
      s.choice!.title,
      /^Mountains of Mirkwood · Shadow: raise your threat by 2, or the attacking enemy gets \+2 attack/,
    );
    s = choose(s, option);
    s = settle(s);
    assert.equal(s.threat, option === "threat" ? 22 : 20);
    assert.equal(
      logged(s, /Mountains of Mirkwood: the attacking enemy gets \+2 attack/),
      option === "attack",
    );
  }
  // Hatred Rekindled: each engaged enemy makes an immediate attack.
  s = base();
  engaged(s, WR.wolf);
  engaged(s, WR.giant);
  reveal(s, WR.hatred);
  assert.ok(
    logged(s, /Hatred Rekindled: each engaged enemy makes an immediate attack/),
  );
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(WR.hatred));
  s = base();
  s.encounterDeck = [WR.hatred, WR.trail];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(logged(s, /Hatred Rekindled: no enemy is engaged; it gains surge/));
  assert.ok(s.staging.some((u) => u.code === WR.trail));
  // Shadow: +1 attack and an additional shadow card whose effects cannot be canceled.
  s = base();
  const hater = engaged(s, WR.wolf);
  hater.shadows = [WR.hatred];
  s.encounterDeck = [WR.gloom];
  s = defend(s, hater, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /Hatred Rekindled: the attacking enemy is dealt an additional shadow card/,
    ),
  );
  assert.ok(logged(s, /Gathering Gloom: the attacking enemy gets \+1 attack/));
  assert.deepEqual(
    s.woodlandRealm!.uncancelable,
    [],
    "cleared after the attack",
  );
  reload(s);
});

test("Set 9: Wild Bear's X is 1 more than the stage number; Labyrinthine Woods raises the staged locations' threat for the phase; Vastness of Mirkwood", () => {
  let s = base();
  const bear = stage(s, WR.bear);
  assert.equal(threatOf(s, bear), 2);
  assert.equal(stats(s, bear).defense, 2);
  atQuest(s, WR.fear);
  assert.equal(threatOf(s, bear), 4);
  assert.equal(stats(s, bear).defense, 4);
  // Shadow: +X defense until the end of the phase, X the stage number.
  s = base();
  atQuest(s, WR.dark);
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.bear];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  s.phase = "attack";
  assert.equal(stats(s, get(s, wolf.id)!).defense, 2 + 2);
  s.phase = "refresh";
  assert.equal(stats(s, get(s, wolf.id)!).defense, 2);
  // Labyrinthine Woods: each staged location gets +1 threat this phase.
  s = base();
  s.phase = "staging";
  const trail = stage(s, WR.trail);
  reveal(s, WR.labyrinth);
  s = settle(s);
  const woods = s.staging.find((u) => u.code === WR.labyrinth)!;
  assert.equal(threatOf(s, trail), 4);
  assert.equal(threatOf(s, woods), 3);
  s.phase = "travel";
  assert.equal(threatOf(s, trail), 3);
  // Shadow: each enemy engaged with the defending player gets +1 attack this phase.
  s = base();
  const rider = engaged(s, WR.wolf);
  const giant = engaged(s, WR.giant);
  rider.shadows = [WR.labyrinth];
  s.encounterDeck = [];
  s = defend(s, rider, s.heroes[0]);
  s = settle(s);
  assert.equal(stats(s, get(s, giant.id)!).attack, 4);
  s.phase = "refresh";
  assert.equal(stats(s, get(s, giant.id)!).attack, 3);
  // Vastness of Mirkwood: a card with cost up to the stage number from the top 5.
  s = base();
  s.encounterDeck = [
    WR.vastness,
    WR.beast,
    WR.giant,
    WR.trail,
    WR.trail,
    WR.spawn,
    WR.wolf,
  ];
  run(s, fx("reveal"));
  assert.match(
    s.choice!.title,
    /^Vastness of Mirkwood · The opposing team chooses a card with cost 1 or less from the top 5 encounter cards to reveal/,
  );
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Giant Spider",
    "Mirkwood Path",
  ]);
  s = choose(s, WR.giant);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.giant));
  assert.ok(s.encounterDiscard.includes(WR.vastness));
  // Shadow: if the attack destroys a character, the top card is revealed.
  s = base();
  const spider = engaged(s, WR.giant);
  spider.shadows = [WR.vastness];
  s.encounterDeck = [WR.trail];
  const [chump] = allies(s, [GUARD]);
  s = defend(s, spider, chump);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === chump.id));
  assert.ok(s.staging.some((u) => u.code === WR.trail));
  reload(s);
});

test("Set 10: Mirkwood Flock surges and joins the staging area as a shadow; The Eaves of Mirkwood; Massing at Night", () => {
  let s = base();
  s.encounterDeck = [WR.flock, WR.trail];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.flock));
  assert.ok(
    s.staging.some((u) => u.code === WR.trail),
    "surge",
  );
  // Shadow: Mirkwood Flock is added to the staging area.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.flock];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.flock));
  // The Eaves of Mirkwood: 1 progress on each staged location each round.
  s = base();
  stage(s, WR.eaves);
  const trail = stage(s, WR.trail);
  assert.equal(H.locationProgressCapacity!(s, trail), 1);
  H.locationProgressPlaced!(s, trail, 1);
  assert.equal(H.locationProgressCapacity!(s, trail), 0);
  s.round++;
  assert.equal(H.locationProgressCapacity!(s, trail), 1);
  // Travel: each player discards 1 random card from his hand.
  s = base(2);
  const eaves = stage(s, WR.eaves);
  hand(s, [GUARD, ARCHER], 0);
  hand(s, [SNOWBOURN], 1);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: eaves.id });
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 0);
  // Massing at Night: one different 0 cost enemy per player (limit 2).
  s = base(3);
  s.encounterDeck = [WR.massing, WR.spiders, WR.wolf, WR.trail];
  s.encounterDiscard = [WR.bats, WR.spiders];
  run(s, fx("reveal"));
  // Eleanor (the spirit deck) could cancel it: she does not.
  s = choose(s, "resolve");
  assert.match(
    s.choice!.title,
    /^Massing at Night · The opposing team adds a different 0 cost enemy to the staging area/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Black Forest Bats", "Spiders of Mirkwood", "Wolf Rider"],
  );
  s = choose(s, WR.spiders);
  assert.ok(!s.choice!.options.some((o) => o.code === WR.spiders));
  s = choose(s, WR.wolf);
  s = settle(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [WR.spiders, WR.wolf].sort(),
    "the limit is 2",
  );
  // Shadow: if the attack destroys a character, an additional attack.
  s = base();
  const spider = engaged(s, WR.giant);
  spider.shadows = [WR.massing];
  s.encounterDeck = [WR.trail];
  const [chump, second] = allies(s, [GUARD, SNOWBOURN]);
  s = defend(s, spider, chump);
  assert.match(s.choice?.title ?? "", /Immediate attack/);
  s = choose(s, second.id);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === chump.id));
  assert.ok(!s.allies.some((u) => u.id === second.id), "the additional attack");
  reload(s);
});

test("Set 11: Wild Wargs return to the staging area after a blank shadow card; Dry Watercourse limits threat reduction; Turned Around", () => {
  let s = base();
  const wargs = engaged(s, WR.wargs);
  wargs.shadows = [WR.trail];
  s.encounterDeck = [];
  s = defend(s, wargs, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === wargs.id));
  assert.equal(s.engaged.length, 0);
  // Shadow: the attacking enemy returns to the staging area.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.wargs];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === wolf.id));
  // Dry Watercourse.
  s = base(2);
  const dry = stage(s, WR.watercourse);
  forOwner(s, 0, () => reduceThreat(s, 3));
  forOwner(s, 1, () => reduceThreat(s, 1));
  forOwner(s, 1, () => reduceThreat(s, 1));
  assert.deepEqual(threats(s), [19, 19]);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: dry.id });
  s = settle(s);
  assert.deepEqual(threats(s), [20, 20]);
  // Without it in the staging area, threat is reduced normally.
  forOwner(s, 0, () => reduceThreat(s, 3));
  assert.deepEqual(threats(s), [17, 20]);
  // Turned Around adds 5 quest points.
  s = base();
  s.progress = 3;
  reveal(s, WR.turned);
  s = settle(s);
  assert.equal(s.progress, 0);
  assert.equal(H.stageInfo!(s)!.quest, 15);
  reload(s);
});

test("Set 12: Pack of Wargs attacks again after a blank shadow card; Dark-wood Grove punishes canceled 'when revealed' effects; Lost and Witless", () => {
  let s = base();
  const pack = engaged(s, WR.pack);
  assert.equal(H.cannotAttach!(s, pack, STEWARD), true);
  assert.equal(H.damageAmount!(s, pack, 2, {}), 0);
  pack.shadows = [WR.trail];
  s.encounterDeck = [WR.gloom];
  const [chump, second] = allies(s, [GUARD, SNOWBOURN]);
  s = defend(s, pack, chump);
  assert.ok(
    logged(
      s,
      /Pack of Wargs is dealt a shadow card with no shadow effect: it makes an additional attack/,
    ),
  );
  assert.match(s.choice?.title ?? "", /Pack of Wargs · Immediate attack/);
  s = choose(s, second.id);
  s = settle(s);
  assert.deepEqual(
    s.encounterDeck,
    [WR.gloom],
    "no shadow card for the additional attack",
  );
  assert.equal(s.allies.length, 0);
  // Dark-wood Grove.
  s = base(2);
  const grove = stage(s, WR.darkwood);
  H.whenRevealedCancelled!(s, WR.gloom);
  flush(s);
  assert.deepEqual(threats(s), [23, 23]);
  s.encounterDeck = [WR.trail];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: grove.id });
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === WR.trail),
    "travel reveals a card",
  );
  // Lost and Witless: each player discards the allies in his hand.
  s = base(2);
  hand(s, [GUARD, STEWARD], 0);
  hand(s, [ARCHER], 1);
  reveal(s, WR.witless);
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    [STEWARD],
  );
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.deepEqual(seatView(s, 1).discard, [ARCHER]);
  // Shadow: if undefended, discard an ally.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.witless];
  s.encounterDeck = [];
  allies(s, [GUARD]);
  s = defend(s, wolf);
  s = settle(s);
  assert.equal(s.allies.length, 0);
  assert.ok(s.discard.includes(GUARD));
  reload(s);
});

test("Set 13: Wicked Spider discards an exhausted character after it engages; Old Forest Road; A Frightened Beast", () => {
  let s = base();
  const [tired] = allies(s, [GUARD]);
  tired.exhausted = true;
  const wicked = stage(s, WR.wicked);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: wicked.id });
  assert.match(
    s.choice!.title,
    /^Wicked Spider · Discard an exhausted character you control/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [tired.id],
  );
  s = settle(s);
  assert.equal(s.allies.length, 0);
  // Shadow: the attacking enemy cannot take damage this phase.
  s = base();
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.wicked];
  s.encounterDeck = [];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  assert.equal(
    H.damageAmount!(s, get(s, wolf.id)!, 3, { combatDamage: true }),
    0,
  );
  s.phase = "refresh";
  assert.equal(
    H.damageAmount!(s, get(s, wolf.id)!, 3, { combatDamage: true }),
    3,
  );
  // Old Forest Road: travel discards the top encounter card (an enemy is staged);
  // the first player may put an ally from the top of his deck into play.
  s = base();
  const road = stage(s, WR.road);
  s.encounterDeck = [WR.giant, WR.trail];
  deck(s, [GUARD, SNOWBOURN]);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: road.id });
  assert.match(
    s.choice!.title,
    /^Old Forest Road · Response: discard the top card of your deck and put it into play if it is an ally\?/,
  );
  s = choose(s, "use");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.giant));
  assert.ok(s.allies.some((u) => u.code === GUARD));
  assert.deepEqual(s.deck, [SNOWBOURN]);
  s = base();
  const second = stage(s, WR.road);
  s.encounterDeck = [WR.gloom];
  deck(s, [STEWARD]);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: second.id });
  s = choose(s, "use");
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(WR.gloom));
  assert.ok(s.discard.includes(STEWARD));
  assert.equal(s.allies.length, 0);
  // A Frightened Beast: threat per questing character, or a questing character discarded.
  s = base();
  s.phase = "staging";
  const [hero, other] = s.heroes;
  quest(hero, s);
  quest(other, s);
  reveal(s, WR.frightened);
  assert.match(
    s.choice!.title,
    /^A Frightened Beast · Raise your threat by 2, or discard a questing character you control/,
  );
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(s.threat, 22);
  s = base();
  s.phase = "staging";
  const [scout] = allies(s, [SNOWBOURN]);
  quest(scout, s);
  reveal(s, WR.frightened);
  s = choose(s, scout.id);
  s = settle(s);
  assert.equal(s.allies.length, 0);
  assert.equal(s.threat, 20);
  // Shadow: +1 attack; if the attack destroys a character, each player raises his threat by 1.
  s = base(2);
  const spider = engaged(s, WR.giant);
  spider.shadows = [WR.frightened];
  s.encounterDeck = [];
  const [chump] = allies(s, [GUARD]);
  s = defend(s, spider, chump);
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  reload(s);
});

test("Set 14: Ambushing Orcs attack the first player as they are revealed and engage a staged enemy as a shadow; Mirkwood Path; Wasted Provisions", () => {
  let s = base(2);
  forOwner(s, 0, () => allies(s, [GUARD], 0));
  reveal(s, WR.orcs);
  assert.ok(
    logged(
      s,
      /Ambushing Orcs makes an immediate attack against the first player/,
    ),
  );
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === WR.orcs),
    "it stays in the staging area",
  );
  // Shadow: the lowest engagement cost enemy in the staging area engages and is dealt a shadow card.
  s = base();
  stage(s, WR.spawn);
  const flock = stage(s, WR.flock);
  const wolf = engaged(s, WR.wolf);
  wolf.shadows = [WR.orcs];
  s.encounterDeck = [WR.trail, WR.trail];
  s = defend(s, wolf, s.heroes[0]);
  s = settle(s);
  const joined = s.engaged.find((u) => u.id === flock.id);
  assert.ok(joined, "Mirkwood Flock (12) engages");
  assert.ok(logged(s, /Ambushing Orcs: Mirkwood Flock engages/));
  assert.ok(s.staging.some((u) => u.code === WR.spawn));
  // Mirkwood Path: explored, a location from the top of the deck is staged.
  s = base();
  activate(s, WR.trail);
  s.encounterDeck = [WR.road, WR.gloom];
  progress(s, 1);
  flush(s);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.road));
  s = base();
  activate(s, WR.trail);
  s.encounterDeck = [WR.gloom, WR.road];
  progress(s, 1);
  flush(s);
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(WR.gloom));
  assert.equal(s.staging.length, 0);
  // Wasted Provisions: every hero resource is discarded, 1 threat each.
  s = base(2);
  for (const p of [0, 1])
    forOwner(s, p, () => s.heroes.forEach((h, i) => (h.resources = i)));
  reveal(s, WR.wasted);
  s = settle(s);
  assert.deepEqual(threats(s), [23, 23]);
  for (const p of [0, 1])
    assert.ok(seatView(s, p).heroes.every((h) => h.resources === 0));
  s = base();
  for (const h of s.heroes) h.resources = 0;
  s.encounterDeck = [WR.wasted, WR.trail];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(s, /Wasted Provisions: no resource was discarded; it gains surge/),
  );
  assert.ok(s.staging.some((u) => u.code === WR.trail));
  // Shadow: discard an attachment you control.
  s = base();
  const rider = engaged(s, WR.wolf);
  rider.shadows = [WR.wasted];
  s.encounterDeck = [];
  attach(s, s.heroes[1], COURAGE);
  s = defend(s, rider, s.heroes[0]);
  s = settle(s);
  assert.equal(s.heroes[1].attachments.length, 0);
  assert.ok(s.discard.includes(COURAGE));
  reload(s);
});
