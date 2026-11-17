import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  playCost,
  stats,
  threatOf,
} from "../src/game/core";
import { addVictoryCard, check, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { consideredEngaged } from "../src/game/considered-engagement";
import { forOwner, seatView } from "../src/game/table";
import {
  RB,
  RB_LOOT_POOL,
  RUINS_BELEGOST_HOOKS,
  nextQuest,
  rbRecipe,
  ruinsBelegostPublicState,
  ruinsBelegostShadowOptions,
} from "../src/game/ruins-belegost";
import { RUINS_BELEGOST_ADVENTURES } from "../src/game/ruins-belegost-scenario-data";
import {
  activate,
  allies,
  atQuest,
  base,
  choose,
  deck,
  engaged,
  hand,
  loot,
  reload,
  settle,
  stage,
  start,
} from "./ruins-belegost-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = RUINS_BELEGOST_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const advance = (s: GameState) => {
  check(s);
  flush(s);
  return s;
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const stalking = (s: GameState) =>
  s.staging.find((u) => u.code === RB.stalking)!;
const lootOn = (u: Unit) => u.attachments.map((a) => a.code);
const GUARD = "01013",
  STEWARD = "01026";

test("Setup: Stalking the Ruins and an Abandoned Mine per player are staged; a random Loot lies under Stalking; the other Loot and Abandoned Mines join the deck", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.ruinsBelegost!;
      assert.equal(q.currentQuest, RB.first);
      assert.equal(s.stage, 1);
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [RB.stalking, ...Array(players).fill(RB.mine)].sort(),
      );
      assert.ok(RB_LOOT_POOL.includes(q.under!));
      assert.deepEqual(
        [...q.setAside].sort(),
        [
          RB.rules1,
          RB.rules2,
          RB.lurker,
          RB.naurlhug,
          RB.lair,
          RB.sword,
        ].sort(),
      );
      // No encounter card is revealed during setup.
      const deckCards = [...s.encounterDeck, ...s.encounterDiscard];
      assert.equal(deckCards.length, (easy ? 25 : 31) + (4 - players) + 4);
      for (const c of RB_LOOT_POOL)
        assert.equal(
          deckCards.filter((x) => x === c).length,
          c === q.under ? 0 : 1,
        );
      assert.equal(
        [RB.hall, RB.troll, RB.spawn].some((c) => deckCards.includes(c)),
        !easy,
        "easy mode removes Flooded Hall, Old Stone Troll and Spawn of Thangorodrim",
      );
      reload(s);
    }
  assert.equal(rbRecipe(false).id, "Q99.06");
  assert.equal(rbRecipe(true).id, "E99.06");
  assert.deepEqual(
    RUINS_BELEGOST_ADVENTURES[0].stages.map((x) => [x.name, x.quest]),
    [
      ["Ruins of the First Age", 6],
      ["Ancient Evils Disturbed / Deeper into the Past", 9],
      [
        "The Servants of Morgoth / The Roots of Ered Luin / The Mines of Belegost",
        6,
      ],
      ["The Beast of Belegost", 0],
    ],
  );
});

test("Discover X: the first player looks at X cards, attaches a Loot to the active location, reveals a random Hazard and discards the rest", () => {
  let s = base();
  const mine = stage(s, RB.mine);
  // Abandoned Mine: Discover 2, plus 1 card for the single player.
  s.encounterDeck = [RB.map, RB.spikes, RB.tunnel, RB.orc, RB.orc];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: mine.id });
  // Concealed Spikes: X is 1 more than the Abandoned Mine's Discover 2.
  assert.match(
    s.choice!.title,
    /^Concealed Spikes · Assign damage.*3 remaining/,
  );
  s = settle(s);
  assert.deepEqual(lootOn(s.activeLocation!), [RB.map]);
  assert.deepEqual(s.encounterDiscard.sort(), [RB.spikes, RB.tunnel].sort());
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
  assert.deepEqual(s.encounterDeck, [RB.orc, RB.orc]);
  // Two Loot: the first player chooses one; the other is discarded.
  s = base();
  const tunnel = stage(s, RB.tunnel);
  s.encounterDeck = [RB.book, RB.gem, RB.orc];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: tunnel.id });
  assert.match(s.choice!.title, /^Discover · Choose a Loot objective/);
  s = choose(s, RB.gem);
  s = settle(s);
  assert.deepEqual(lootOn(s.activeLocation!), [RB.gem]);
  assert.deepEqual(s.encounterDiscard, [RB.book]);
  assert.equal(stalking(s).resources, 1, "Darkened Tunnel's travel cost");
  // Short deck: the discard pile is shuffled in to finish looking.
  s = base();
  const tunnel2 = stage(s, RB.tunnel);
  s.encounterDeck = [RB.orc];
  s.encounterDiscard = [RB.orc];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: tunnel2.id });
  s = settle(s);
  assert.deepEqual(s.encounterDiscard, [RB.orc, RB.orc]);
  assert.deepEqual(s.encounterDeck, []);
  reload(s);
});

test("Discover modifiers: The Roots of Ered Luin adds 1, Flooded Hall reveals a Hazard for each other player, The Mines of Belegost reveals the top card when no Hazard was", () => {
  let s = base();
  atQuest(s, RB.roots);
  const tunnel = stage(s, RB.tunnel);
  s.encounterDeck = [RB.orc, RB.orc, RB.orc, RB.goblin, RB.goblin];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: tunnel.id });
  s = settle(s);
  assert.equal(s.encounterDiscard.length, 3, "Discover 2 + 1");
  // Flooded Hall with 2 players: 2 Hazards revealed.
  s = base(2);
  const hall = stage(s, RB.hall);
  s.encounterDeck = [RB.pit, RB.pit, RB.orc, RB.orc, RB.orc, RB.orc];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: hall.id });
  s = settle(s);
  assert.equal(
    s.log.filter((l) => /^Revealed Covered Pit/.test(l.text)).length,
    2,
  );
  // 3F: no Hazard looked at, so the top card is revealed.
  s = base();
  atQuest(s, RB.mines);
  const tunnel3 = stage(s, RB.tunnel);
  s.encounterDeck = [RB.orc, RB.goblin, RB.goblin];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: tunnel3.id });
  s = settle(s);
  assert.ok(s.log.some((l) => /no Hazard card was revealed/.test(l.text)));
  assert.ok(s.staging.some((u) => u.code === RB.goblin));
  reload(s);
});

test("Loot: a revealed Loot is discarded and replaced; Loot guarded by a location or an enemy is claimed by the first player when its guard leaves play", () => {
  let s = base();
  s.encounterDeck = [RB.keys, RB.orc, RB.orc];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.deepEqual(s.encounterDiscard, [RB.keys]);
  assert.ok(s.staging.some((u) => u.code === RB.orc));
  // An explored guarding location: the first player attaches it to a hero.
  s = base();
  const mine = activate(s, RB.mine);
  mine.attachments.push({ id: "a-loot", code: RB.torch, exhausted: false });
  progressLocation(s, mine, 3);
  flush(s);
  assert.match(s.choice!.title, /^Dwarven Torch · Attach it to a hero/);
  const theodred = s.heroes[1];
  s = choose(s, theodred.id);
  assert.deepEqual(lootOn(get(s, theodred.id)!), [RB.torch]);
  assert.equal(ruinsBelegostPublicState(s)!.loot[0], RB.torch);
  // Covered Pit's shadow: a Loot moves to the attacker, back when it leaves.
  s = base();
  const a = loot(s, RB.gem, 0, 0);
  const orc = engaged(s, RB.orc);
  orc.shadows = [RB.pit];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: s.heroes[0].id });
  assert.match(s.choice!.title, /^Covered Pit · Attach a Loot objective/);
  s = choose(s, a.id);
  s = settle(s);
  const attacker = seatView(s, 0).engaged.find((u) => u.code === RB.orc)!;
  assert.deepEqual(lootOn(attacker), [RB.gem]);
  assert.equal(lootOn(s.heroes[0]).length, 0);
  attacker.damage = 3;
  run(s, fx("damage", { target: attacker.id, value: 1 }));
  s = settle(s, s.heroes[2].id);
  assert.deepEqual(lootOn(s.heroes[2]), [RB.gem]);
  reload(s);
});

test("Branches: each stage's Forced effect follows the Loot attached to the heroes, and stages 1B, 2B and 2D need Loot, Lurker in the victory display or resources", () => {
  const s = base();
  const cases: [string, string | null, string, string][] = [
    [RB.first, RB.keys, RB.deeper, RB.evils],
    [RB.evils, RB.book, RB.roots, RB.servants],
    [RB.deeper, RB.book, RB.mines, RB.roots],
    [RB.servants, RB.torch, RB.beast, RB.roots],
    [RB.roots, RB.map, RB.beast, RB.mines],
    [RB.mines, RB.gem, RB.beast, RB.servants],
  ];
  for (const [quest, key, withIt, without] of cases) {
    s.heroes[0].attachments = [];
    assert.equal(nextQuest(s, quest), without, card(quest).name);
    loot(s, key!);
    assert.equal(nextQuest(s, quest), withIt, card(quest).name);
  }
  // 1B: at least 1 Loot.
  let t = base();
  t.encounterDeck.push(RB.tunnel);
  t.progress = 6;
  advance(t);
  assert.equal(t.stage, 1, "no Loot");
  loot(t, RB.keys);
  advance(t);
  t = settle(t);
  assert.equal(t.ruinsBelegost!.currentQuest, RB.deeper);
  assert.equal(t.stage, 2);
  // 2C: Lurker and the discard pile are shuffled in; cards are discarded
  // from the top until a location, which is added to the staging area.
  assert.ok(!t.ruinsBelegost!.setAside.includes(RB.lurker));
  assert.ok(
    t.encounterDeck.includes(RB.lurker) ||
      t.encounterDiscard.includes(RB.lurker),
  );
  assert.ok(t.staging.some((u) => u.code === RB.tunnel));
  assert.ok(!t.encounterDeck.includes(RB.tunnel));
  assert.ok(
    t.encounterDiscard.every((c) => card(c).type !== "location"),
    "only the dug location leaves the discarded cards",
  );
  // 2B: 2 Loot and Lurker in the victory display.
  t = base();
  atQuest(t, RB.evils);
  loot(t, RB.book);
  loot(t, RB.map, 0, 1);
  t.progress = 9;
  advance(t);
  assert.equal(
    t.stage,
    2,
    "Lurker of the Depths is not in the victory display",
  );
  addVictoryCard(t, RB.lurker);
  advance(t);
  t = settle(t);
  assert.equal(t.ruinsBelegost!.currentQuest, RB.roots);
  assert.equal(t.stage, 3);
  // 2D: 3 resources, one for each explored active location.
  t = base();
  atQuest(t, RB.deeper);
  loot(t, RB.book);
  loot(t, RB.map, 0, 1);
  t.progress = 9;
  advance(t);
  assert.equal(t.stage, 2);
  for (let i = 0; i < 3; i++) {
    const m = activate(t, RB.orc === RB.orc ? RB.tunnel : RB.tunnel);
    progressLocation(t, m, 3);
    flush(t);
  }
  assert.equal(t.ruinsBelegost!.questResources, 3);
  advance(t);
  t = settle(t);
  assert.equal(t.ruinsBelegost!.currentQuest, RB.mines);
  reload(t);
});

test("Stalking the Ruins: a resource each quest phase brings Naurlhûg at 3; advancing discards its tokens and sets Naurlhûg aside; travel and Spawn of Thangorodrim add resources", () => {
  let s = base();
  stalking(s).resources = 2;
  run(s, ...H.questBegin!(s)!);
  assert.equal(stalking(s).resources, 3);
  const dragon = s.staging.find((u) => u.code === RB.naurlhug)!;
  assert.ok(dragon, "Naurlhûg is added to the staging area");
  assert.equal(threatOf(s, dragon), 3, "X threat");
  // Engaged, he returns to the staging area at the next quest phase.
  s.staging = s.staging.filter((u) => u.id !== dragon.id);
  forOwner(s, 0, () => s.engaged.push(dragon));
  run(s, ...H.questBegin!(s)!);
  assert.ok(s.staging.some((u) => u.id === dragon.id));
  // Advancing: tokens discarded, Naurlhûg set aside.
  loot(s, RB.keys);
  s.progress = 6;
  advance(s);
  s = settle(s);
  assert.equal(stalking(s).resources, 0);
  assert.ok(s.ruinsBelegost!.setAside.includes(RB.naurlhug));
  assert.ok(!s.staging.some((u) => u.code === RB.naurlhug));
  // Spawn of Thangorodrim: a resource, then Naurlhûg at 3.
  s = base();
  stalking(s).resources = 2;
  s.encounterDeck = [RB.spawn, RB.orc];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === RB.naurlhug));
  // Naurlhûg's Lair: X resources for X players.
  s = base(2);
  const lair = stage(s, RB.lair);
  s.ruinsBelegost!.setAside = s.ruinsBelegost!.setAside.filter(
    (c) => c !== RB.lair,
  );
  s.encounterDeck = Array(10).fill(RB.orc);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: lair.id });
  s = settle(s);
  assert.equal(stalking(s).resources, 2);
  reload(s);
});

test("Naurlhûg: immune, no damage until 4B with his lair in the victory display, X damage when he attacks, the next player after a blank shadow, and his defeat wins", () => {
  let s = base();
  atQuest(s, RB.beast);
  s.ruinsBelegost!.setAside = s.ruinsBelegost!.setAside.filter(
    (c) => c !== RB.naurlhug,
  );
  stalking(s).resources = 2;
  const dragon = engaged(s, RB.naurlhug);
  assert.equal(H.immune!(s, dragon), true);
  assert.equal(H.damageAmount!(s, dragon, 5, {} as never), 0);
  addVictoryCard(s, RB.lair);
  assert.equal(H.damageAmount!(s, dragon, 5, {} as never), 5);
  // When he attacks: the defending player assigns X (2) damage.
  dragon.shadows = [RB.orc];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: dragon.id, defenderId: null });
  assert.match(s.choice!.title, /^Naurlhûg · Assign damage.*2 remaining/);
  s = settle(s);
  // Defeating him at 4B wins.
  s = base();
  atQuest(s, RB.beast);
  addVictoryCard(s, RB.lair);
  s.ruinsBelegost!.setAside = s.ruinsBelegost!.setAside.filter(
    (c) => c !== RB.naurlhug,
  );
  const target = engaged(s, RB.naurlhug);
  target.damage = 19;
  run(s, fx("damage", { target: target.id, value: 1 }));
  assert.equal(s.status, "won");
  assert.match(s.reason!, /Naurlhûg is defeated/);
  // 4B: a shadow card with no shadow effect sends him to the next player.
  s = base(2);
  atQuest(s, RB.beast);
  s.ruinsBelegost!.setAside = s.ruinsBelegost!.setAside.filter(
    (c) => c !== RB.naurlhug,
  );
  const next = engaged(s, RB.naurlhug, 0);
  next.shadows = [RB.mine];
  const effects = H.attackFinished!(s, {
    enemyId: next.id,
    attackPlayer: 0,
  } as never);
  assert.equal(effects.length, 1);
  run(s, ...effects);
  s = settle(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === next.id));
  reload(s);
});

test("Lurker of the Depths: considered engaged with each player in the staging area, never engaged, and no more than 4 damage each round", () => {
  const s = base(2);
  atQuest(s, RB.evils);
  const lurker = stage(s, RB.lurker);
  assert.equal(consideredEngaged(s, lurker, 0), true);
  assert.equal(consideredEngaged(s, lurker, 1), true);
  assert.equal(H.cannotEngage!(s, lurker), true);
  assert.equal(H.damageAmount!(s, lurker, 6, {} as never), 4);
  H.damageDealt!(s, lurker, 3, {} as never);
  assert.equal(H.damageAmount!(s, lurker, 6, {} as never), 1);
  s.round += 1;
  assert.equal(H.damageAmount!(s, lurker, 6, {} as never), 4);
  assert.equal(H.cannotAttach!(s, lurker, STEWARD), true);
});

test("Encounter cards: Concealed Spikes, Covered Pit, Echoes in the Dark, Orc of Ered Luin, Sunken Treasury, Secret Chamber, Abandoned Mine, Flooded Hall, Old Stone Troll, Blue Mountain Goblin, Nameless Cave Dweller", () => {
  // Covered Pit: each player discards an ally.
  let s = base();
  const [guard] = allies(s, [GUARD]);
  s.encounterDeck = [RB.pit, RB.orc];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(get(s, guard.id), undefined);
  // Echoes in the Dark: doomed 1, +1 threat per character of the first player.
  s = base();
  s.phase = "staging";
  allies(s, [GUARD]);
  s.encounterDeck = [RB.echoes, RB.orc];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.deepEqual(threats(s), [21]);
  assert.equal(H.stagingThreat!(s), 4);
  s.phase = "travel";
  assert.equal(H.stagingThreat!(s), 0);
  // Orc of Ered Luin attacks each player with a Loot.
  s = base(2);
  loot(s, RB.keys, 1);
  s.encounterDeck = [RB.orc, RB.orc];
  run(s, fx("reveal", { player: 0 }));
  assert.ok(s.combat, "an immediate attack against the second player");
  assert.equal(s.combat!.attackPlayer, 1);
  // Sunken Treasury: +1 threat per Loot; travel discards a random card each.
  s = base(2);
  const treasury = stage(s, RB.treasury);
  loot(s, RB.keys);
  loot(s, RB.map, 1);
  assert.equal(threatOf(s, treasury), 3);
  s.phase = "travel";
  assert.match(canTravel(s, treasury)!, /discard 1 random card/);
  hand(s, [GUARD], 0);
  hand(s, [STEWARD], 1);
  s.encounterDeck = Array(8).fill(RB.orc);
  s = act(s, { type: "TRAVEL", id: treasury.id });
  s = settle(s);
  assert.deepEqual(seatView(s, 0).discard, [GUARD]);
  assert.deepEqual(seatView(s, 1).discard, [STEWARD]);
  // Secret Chamber: +2 threat each; its Response attaches a discarded Loot.
  s = base(2);
  const chamber = stage(s, RB.chamber);
  s.encounterDeck = [RB.orc, RB.orc, RB.orc, RB.orc];
  s.encounterDiscard = [RB.book];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: chamber.id });
  s = settle(s, RB.book);
  assert.deepEqual(threats(s), [22, 22]);
  assert.deepEqual(lootOn(s.activeLocation!), [RB.book]);
  // Abandoned Mine: no progress on other staging locations.
  s = base();
  stage(s, RB.mine);
  const other = stage(s, RB.tunnel);
  assert.equal(H.locationProgressBlocked!(s, other), true);
  // Flooded Hall: allies cost 1 more.
  s = base();
  const before = playCost(s, card(GUARD));
  stage(s, RB.hall);
  assert.equal(playCost(s, card(GUARD)), before + 1);
  // Old Stone Troll: -10 engagement per Loot; only its player attacks it.
  s = base(2);
  const troll = stage(s, RB.troll);
  loot(s, RB.keys);
  loot(s, RB.map, 1);
  assert.equal(engagementCost(s, troll), 30);
  s.staging = s.staging.filter((u) => u.id !== troll.id);
  forOwner(s, 0, () => s.engaged.push(troll));
  const other1 = seatView(s, 1).heroes[0];
  assert.match(H.attackProblem!(s, troll, [other1.id])!, /Only the engaged/);
  assert.equal(H.attackProblem!(s, troll, [s.heroes[0].id]), null);
  // Blue Mountain Goblin: surge while a Loot is attached to a hero.
  assert.equal(H.revealedSurge!(s, RB.goblin), true);
  // Nameless Cave Dweller: X is 1 more than the active Discover value.
  s = base();
  const dweller = stage(s, RB.dweller);
  assert.deepEqual(
    [stats(s, dweller).attack, stats(s, dweller).defense, threatOf(s, dweller)],
    [1, 1, 1],
  );
  activate(s, RB.treasury);
  assert.deepEqual(
    [stats(s, dweller).attack, stats(s, dweller).defense, threatOf(s, dweller)],
    [4, 4, 4],
  );
  reload(s);
});

test("Shadows: Concealed Spikes, Orc of Ered Luin, Sunken Treasury, Blue Mountain Goblin, Spawn of Thangorodrim, Echoes in the Dark and Nameless Cave Dweller; Sword of Belegost cancels one", () => {
  const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
    act(s, {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: defender?.id ?? null,
    });
  // Spawn of Thangorodrim: an additional attack.
  let s = base();
  let enemy = engaged(s, RB.goblin);
  enemy.shadows = [RB.spawn];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(
    s.log.filter((l) => /Blue Mountain Goblin attacks/.test(l.text)).length >=
      2,
  );
  // Nameless Cave Dweller: +2 attack with a Loot.
  s = base();
  loot(s, RB.keys, 0, 2);
  enemy = engaged(s, RB.goblin);
  enemy.shadows = [RB.dweller];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  // Goblin 3 + 2 − Aragorn's 2 = 3.
  assert.equal(get(s, s.heroes[0].id)!.damage, 3);
  // Blue Mountain Goblin: with a Loot, it enters play engaged.
  s = base();
  loot(s, RB.keys, 0, 2);
  enemy = engaged(s, RB.orc);
  enemy.shadows = [RB.goblin];
  s.encounterDeck = [RB.mine, RB.mine];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === RB.goblin));
  // Sunken Treasury: exhaust a character.
  s = base();
  enemy = engaged(s, RB.goblin);
  enemy.shadows = [RB.treasury];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s, s.heroes[2].id);
  assert.equal(get(s, s.heroes[2].id)!.exhausted, true);
  // Concealed Spikes: X attachments, or discard the most expensive.
  s = base();
  loot(s, RB.keys, 0, 1);
  enemy = engaged(s, RB.goblin);
  enemy.shadows = [RB.spikes];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Concealed Spikes · Assign 1 damage or discard/,
  );
  s = choose(s, s.choice!.options.find((o) => o.id !== "damage")!.id);
  s = settle(s);
  assert.equal(lootOn(s.heroes[1]).length, 0);
  // Orc of Ered Luin's shadow: the attacker engages the next player.
  // The immediate attack is dealt a new shadow card (here a location).
  s = base(2);
  enemy = engaged(s, RB.goblin, 0);
  enemy.shadows = [RB.orc];
  s.encounterDeck = [RB.mine, RB.mine];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === enemy.id));
  assert.ok(!seatView(s, 0).engaged.some((u) => u.id === enemy.id));
  assert.ok(s.encounterDiscard.includes(RB.mine), "its shadow is discarded");
  // Echoes in the Dark: a random event in hand gives +2 attack.
  s = base();
  hand(s, ["01020"]);
  enemy = engaged(s, RB.goblin);
  enemy.shadows = [RB.echoes];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[0]);
  s = settle(s);
  assert.equal(get(s, s.heroes[0].id)!.damage, 3, "3 + 2 − 2");
  // Sword of Belegost: exhaust it to cancel a shadow effect.
  s = base();
  const sword = loot(s, RB.sword, 0, 0);
  assert.equal(stats(s, s.heroes[0]).attack, 7, "+4 attack");
  const options = ruinsBelegostShadowOptions(s, RB.treasury);
  assert.deepEqual(
    options.map((o) => o.id),
    [`sword-${sword.id}`],
  );
  reload(s);
});

test("Loot actions: the Book draws, the Gem lowers threat, the Keys add a resource, the Torch and the Map weaken a non-unique card for the phase", () => {
  let s = base();
  const keys = loot(s, RB.keys, 0, 0);
  const label = (H.abilityLabel!(RB.keys) ?? "").split(" · ")[0];
  assert.equal(label, "Keys of Belegost");
  assert.ok(
    availableAbilities(s, s.heroes[0]).some(
      (o) => o.id === keys.id && !o.disabled,
    ),
  );
  s = act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: keys.id });
  s = choose(s, s.heroes[2].id);
  assert.equal(get(s, s.heroes[2].id)!.resources, 11);
  assert.match(H.abilityProblem!(s, s.heroes[0], keys.id)!, /exhausted/);
  s = base();
  const gem = loot(s, RB.gem, 0, 1);
  s = act(s, { type: "ABILITY", id: s.heroes[1].id, attachmentId: gem.id });
  s = choose(s, "player-0");
  assert.equal(s.threat, 19);
  s = base();
  const book = loot(s, RB.book, 0, 1);
  deck(s, [GUARD, STEWARD]);
  s = act(s, { type: "ABILITY", id: s.heroes[1].id, attachmentId: book.id });
  s = choose(s, "player-0");
  assert.equal(s.hand.length, 1);
  s = base();
  const torch = loot(s, RB.torch);
  const goblin = engaged(s, RB.goblin);
  s = act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: torch.id });
  s = choose(s, goblin.id);
  assert.deepEqual(
    [stats(s, get(s, goblin.id)!).attack, stats(s, get(s, goblin.id)!).defense],
    [2, 1],
  );
  s.phase = "quest";
  assert.equal(
    stats(s, get(s, goblin.id)!).attack,
    3,
    "until the end of the phase",
  );
  s = base();
  const map = loot(s, RB.map);
  const tunnel = stage(s, RB.tunnel);
  s = act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: map.id });
  s = choose(s, tunnel.id);
  assert.equal(threatOf(s, get(s, tunnel.id)!), 1);
  reload(s);
});

test("Ruins of the First Age returns the topmost discarded location with none in play; stage 3 makes the players travel; Darkened Tunnel answers a cancelled When Revealed", () => {
  let s = base();
  s.staging = [stalking(s)];
  s.encounterDiscard = [RB.tunnel, RB.orc, RB.mine, RB.orc];
  H.travelBegin!(s);
  flush(s);
  assert.ok(
    s.staging.some((u) => u.code === RB.mine),
    "the topmost location",
  );
  assert.deepEqual(s.encounterDiscard, [RB.tunnel, RB.orc, RB.orc]);
  // 3B, 3D, 3F: must travel.
  s = base();
  atQuest(s, RB.servants);
  stage(s, RB.tunnel);
  s.phase = "travel";
  assert.equal(H.mustTravel!(s), true);
  atQuest(s, RB.first);
  assert.equal(H.mustTravel!(s), false);
  // Darkened Tunnel: a Hazard on top is resolved as if revealed.
  s = base();
  stage(s, RB.tunnel);
  s.encounterDeck = [RB.pit, RB.orc];
  allies(s, [GUARD]);
  H.whenRevealedCancelled!(s, RB.spikes);
  flush(s);
  s = settle(s);
  assert.ok(s.log.some((l) => /^Revealed Covered Pit/.test(l.text)));
  reload(s);
});

test("Saves and the scenario panel", () => {
  const s = base(2);
  atQuest(s, RB.deeper);
  loot(s, RB.keys);
  s.ruinsBelegost!.questResources = 2;
  stalking(s).resources = 1;
  const restored = reload(s);
  assert.deepEqual(restored.ruinsBelegost, s.ruinsBelegost);
  const view = ruinsBelegostPublicState(restored)!;
  assert.equal(view.side, "2D");
  assert.equal(view.stage, 2);
  assert.deepEqual(view.loot, [RB.keys]);
  assert.equal(view.stalking, 1);
  assert.equal(view.naurlhug, "aside");
  assert.equal(view.hidden, true);
  assert.equal(view.questResources, 2);
  assert.deepEqual(publicState(restored).ruinsBelegost, view);
  // A save whose stage does not match its quest card is rejected.
  const raw = JSON.parse(JSON.stringify(s));
  raw.stage = 3;
  assert.throws(() => reload(raw));
});
