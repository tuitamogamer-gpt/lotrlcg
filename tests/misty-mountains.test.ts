import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  createGame,
  validateSave,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, get, make, stageInfo, stats, threatOf } from "../src/game/core";
import { check, damage, engage, progress } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { playTargets } from "../src/game/actions";
import {
  allCharacters,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  OMM as O,
  OMM_HOOKS as hooks,
  OMM_QUESTS,
  OMM_RECIPES,
} from "../src/game/misty-mountains";
import { HOBBIT_BILBO, bagginsBilbo } from "../src/game/hobbit-saga";
import { DECK_CARDS } from "../src/game/decks";
import {
  base,
  choose,
  reload,
  settle,
  stage,
  start,
} from "./misty-mountains-fixtures";
import type { GameState, Unit } from "../src/game/types";

const effect = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
  return s;
};
const run = (s: GameState, preferred?: string) => {
  flush(s);
  check(s);
  flush(s);
  return settle(s, preferred);
};
const combat = (s: GameState, enemyId: string, extra = {}) =>
  (s.combat = {
    enemyId,
    attackPlayer: 0,
    attackBonus: 0,
    defenderId: null,
    ...extra,
  } as unknown as GameState["combat"]);
const bilbo = (s: GameState) => bagginsBilbo(s)!;
const ally = (s: GameState, code: string, player = 0) => {
  const u = make(s, code);
  forOwner(s, player, () => {
    u.owner = player;
    u.controller = player;
    s.allies.push(u);
  });
  return u;
};
const engageWith = (s: GameState, u: Unit, player = 0) => {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  forOwner(s, player, () => s.engaged.push(u));
};

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Over the Misty Mountains Grim ${players} players ${easy ? "easy" : "normal"}: A Short Rest advances to The Mountain Pass, the Goblin deck waits inactive and the inventory is exact`, () => {
      const s = start(players, easy, 81, true, true);
      const q = s.mistyMountains!;
      assert.equal(s.phase, "resource");
      assert.equal(s.round, 1);
      assert.equal(s.stage, 2);
      assert.equal(q.initialized, true);
      assert.equal(q.goblinTown, false);
      assert.equal(stageInfo(s).quest, 16);
      assert.ok(allCharacters(s).some((u) => u.code === HOBBIT_BILBO));
      const recipe = OMM_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const engaged = playerOrder(s).flatMap((p) => seatView(s, p).engaged);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...engaged.map((u) => u.code),
        ...q.inactiveDeck,
        ...OMM_QUESTS.map((c) => c.code),
        HOBBIT_BILBO,
      ].sort();
      assert.deepEqual(
        physical,
        recipe.cards
          .flatMap((r) => Array<string>(r.quantity).fill(r.code))
          .sort(),
      );
      assert.ok(
        [...s.staging, ...engaged].some((u) => u.code === O.giant),
        "The Mountain Pass adds a Stone-giant",
      );
      assert.ok(q.inactiveDeck.includes(O.greatGoblin));
      reload(s);
    });

test("Discovered treasures join decks only in a scenario that lists them, once each, and A Short Rest lets each player search for one", () => {
  const d = STARTERS[0];
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "we-must-away-ere-break-of-day",
        hobbitTreasures: { 0: ["131020"] },
      }),
    /treasure set/,
  );
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "over-the-misty-mountains-grim",
        hobbitTreasures: { 0: ["131020", "131020"] },
      }),
    /at most once/,
  );
  let s = createGame(7, d.cards, d.heroes, d.id, {
    scenarioId: "over-the-misty-mountains-grim",
    hobbitTreasures: { 0: ["131020", "131022"] },
  });
  while (s.phase === "setup" && !s.choice)
    s = applyAction(reload(s), { type: "KEEP" });
  assert.match(s.choice!.title, /A Short Rest/);
  const inDeck = ["131020", "131022"].filter((c) =>
    seatView(s, 0).deck.includes(c),
  );
  const inHand = ["131020", "131022"].filter((c) =>
    seatView(s, 0).hand.some((u) => u.code === c),
  );
  assert.equal(inDeck.length + inHand.length, 2);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [...inDeck, "skip"].sort(),
  );
  const pick = inDeck[0];
  s = choose(s, pick);
  s = settle(s);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === pick));
  assert.ok(!seatView(s, 0).deck.includes(pick));
  assert.ok(!DECK_CARDS.some((c) => c.treasure));
});

test("Sting attaches only to Bilbo; Orcrist to a hero; Glamdring to a hero or Gandalf; each grants its statistics", () => {
  const s = base(1);
  const g = ally(s, "01073");
  const h = seatView(s, 0).heroes.find((u) => u.code !== HOBBIT_BILBO)!;
  const targets = (code: string) =>
    playTargets(s, make(s, code)).map((u) => u.id);
  assert.deepEqual(targets("131020"), [bilbo(s).id]);
  assert.ok(!targets("131021").includes(g.id));
  assert.ok(targets("131021").includes(h.id));
  assert.ok(targets("131022").includes(g.id));
  assert.ok(targets("131022").includes(h.id));
  const before = stats(s, bilbo(s));
  bilbo(s).attachments.push({
    id: "t1",
    code: "131020",
    owner: 0,
    exhausted: false,
  });
  const after = stats(s, bilbo(s));
  assert.deepEqual(
    [
      after.will - before.will,
      after.attack - before.attack,
      after.defense - before.defense,
    ],
    [1, 1, 1],
  );
  const attack = stats(s, h).attack;
  h.attachments.push({ id: "t2", code: "131021", owner: 0, exhausted: false });
  assert.equal(stats(s, h).attack, attack + 2);
});

test("Sting's response discards the top encounter card and damages the attacker by its threat; Orcrist and Glamdring reward destroying an Orc", () => {
  let s = base(1);
  const b = bilbo(s);
  b.attachments.push({ id: "t1", code: "131020", owner: 0, exhausted: false });
  b.exhausted = true;
  const gg = stage(s, O.greatGoblin);
  s.encounterDeck = [O.caves, O.axeman];
  const effects = hooks.defendersDeclared!(s, gg, [b]);
  assert.equal(effects.length, 1);
  handle(s, effects[0]);
  flush(s);
  s = choose(s, "sting");
  s = run(s);
  assert.equal(get(s, gg.id)!.damage, card(O.caves).threat);
  assert.deepEqual(s.encounterDiscard, [O.caves]);
  const h = seatView(s, 0).heroes.find((u) => u.code !== HOBBIT_BILBO)!;
  h.attachments.push(
    { id: "t2", code: "131021", owner: 0, exhausted: false },
    { id: "t3", code: "131022", owner: 0, exhausted: false },
  );
  forOwner(s, 0, () => (s.deck = ["01073", "01073"]));
  const axeman = stage(s, O.axeman);
  const resources = h.resources;
  s.staging = s.staging.filter((u) => u.id !== axeman.id);
  hooks.playerAttackResolved!(s, axeman, [h.id], 5, 2);
  flush(s);
  s = choose(s, "orcrist");
  s = choose(s, "glamdring");
  s = run(s);
  assert.equal(get(s, h.id)!.resources, resources + 1);
  assert.equal(seatView(s, 0).hand.length, 1);
});

test("Stage 2B falls at 16 progress; Goblin Town sets the first deck aside, makes the Goblin deck active with The Great Goblin and reveals 3 per player less Bilbo's spending", () => {
  let s = base(2, 2);
  const giant = stage(s, O.giant);
  const rock = stage(s, O.rock);
  s.encounterDiscard = [O.boulders];
  bilbo(s).resources = 2;
  const inactive = s.mistyMountains!.inactiveDeck.length;
  progress(s, 16);
  s = run(s, "spend-2");
  assert.equal(s.stage, 3);
  assert.equal(s.mistyMountains!.goblinTown, true);
  assert.ok(!s.staging.some((u) => u.id === giant.id || u.id === rock.id));
  assert.ok(s.mistyMountains!.inactiveDeck.includes(O.boulders));
  assert.ok(s.mistyMountains!.inactiveDeck.includes(O.giant));
  assert.equal(
    s.mistyMountains!.inactiveDeck.length,
    20 + 3 /* staged + discard */,
  );
  assert.ok(
    s.staging.some((u) => u.code === O.greatGoblin) ||
      seatView(s, 0).engaged.some((u) => u.code === O.greatGoblin) ||
      seatView(s, 1).engaged.some((u) => u.code === O.greatGoblin),
  );
  assert.equal(bilbo(s).resources, 0);
  // 30 Goblin cards: The Great Goblin left the deck and 4 cards were revealed.
  assert.equal(
    s.encounterDeck.length +
      s.encounterDiscard.length +
      s.staging.filter((u) => u.code !== O.greatGoblin).length +
      playerOrder(s).reduce(
        (n, p) =>
          n +
          seatView(s, p).engaged.filter((u) => u.code !== O.greatGoblin).length,
        0,
      ),
    inactive - 1,
  );
  reload(s);
});

test("Stage 3B cannot be defeated until The Great Goblin is in the victory display", () => {
  let s = base(1, 3);
  progress(s, 25);
  s = run(s);
  assert.equal(s.status, "playing");
  s.victoryCards = [O.greatGoblin];
  check(s);
  s = run(s);
  assert.equal(s.status, "won");
});

test("Galloping Boulders hurts and removes a questing character, surges with a Stone-giant in staging, and its shadow returns to the deck top", () => {
  let s = base(1);
  assert.ok(!hooks.revealedSurge!(s, O.boulders));
  stage(s, O.giant);
  assert.ok(hooks.revealedSurge!(s, O.boulders));
  const h = seatView(s, 0).heroes[0];
  h.committed = true;
  forOwner(s, 0, () => (s.committedIds = [h.id]));
  hooks.encounter!(s, O.boulders, false, true);
  flush(s);
  s = choose(s, h.id);
  s = run(s);
  assert.equal(get(s, h.id)!.damage, 3);
  assert.equal(get(s, h.id)!.committed, false);
  assert.deepEqual(seatView(s, 0).committedIds, []);
  const gg = stage(s, O.greatGoblin);
  gg.shadows = [O.boulders];
  gg.revealedShadowCount = 1;
  combat(s, gg.id);
  hooks.shadow!(s, O.boulders);
  assert.equal(s.encounterDeck[0], O.boulders);
});

test("Guffawing of Giants marks a Stone-giant to engage the highest-threat player at the end of the quest phase, or searches one out", () => {
  let s = base(2);
  s.encounterDeck = [O.loneLands, O.giant];
  hooks.encounter!(s, O.guffawing, false, true);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === O.giant));
  assert.deepEqual(s.mistyMountains!.guffawing, []);
  const giant = s.staging.find((u) => u.code === O.giant)!;
  hooks.encounter!(s, O.guffawing, false, true);
  flush(s);
  assert.deepEqual(s.mistyMountains!.guffawing, [giant.id]);
  forOwner(s, 1, () => (s.threat = 30));
  hooks.endQuest!(s);
  s = run(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === giant.id));
});

test("Stone-Giant's engagement discards an ally; The High Pass has X threat and removes X progress at the end of the round", () => {
  let s = base(2);
  const a = ally(s, "01073");
  const giant = stage(s, O.giant);
  forOwner(s, 0, () => engage(s, giant));
  s = run(s);
  assert.ok(!get(s, a.id));
  const pass = stage(s, O.highPass);
  assert.equal(threatOf(s, pass), 2);
  s.progress = 5;
  for (const e of hooks.roundEnd!(s)) handle(s, e);
  flush(s);
  assert.equal(s.progress, 3);
});

test("Goblins get +1 attack/defense per Cave in play; The Goblins' Caves add threat while active; Front Porch forbids attacks on Goblins until Bilbo blanks it", () => {
  let s = base(1, 3);
  const axeman = stage(s, O.axeman);
  const miners = stage(s, O.miners);
  const attack = stats(s, axeman).attack,
    defense = stats(s, miners).defense;
  stage(s, O.cavern);
  const porch = make(s, O.porch);
  s.activeLocation = porch;
  assert.equal(stats(s, axeman).attack, attack + 2);
  assert.equal(stats(s, miners).defense, defense + 2);
  const h = seatView(s, 0).heroes[0];
  assert.ok(hooks.cannotAttack!(s, h, axeman));
  bilbo(s).resources = 2;
  assert.equal(hooks.abilityProblem!(s, porch), null);
  s = applyAction(reload(s), { type: "ABILITY", id: porch.id });
  assert.ok(!hooks.cannotAttack!(s, h, get(s, axeman.id)!));
  assert.equal(bilbo(s).resources, 0);
  const caves = make(s, O.caves);
  s.activeLocation = caves;
  assert.equal(threatOf(s, get(s, axeman.id)!), card(O.axeman).threat! + 1);
});

test("Overhanging Rock lets Bilbo's controller spend 1 Baggins resource to keep one of the top two cards", () => {
  let s = base(1);
  const rock = make(s, O.rock);
  s.activeLocation = rock;
  forOwner(s, 0, () => (s.deck = ["01073", "01067", "01071"]));
  bilbo(s).resources = 1;
  assert.equal(hooks.abilityProblem!(s, rock), null);
  s = applyAction(reload(s), { type: "ABILITY", id: rock.id });
  s = choose(s, "top-1");
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    ["01067"],
  );
  assert.deepEqual(seatView(s, 0).discard, ["01073"]);
  assert.deepEqual(seatView(s, 0).deck, ["01071"]);
  assert.equal(bilbo(s).resources, 0);
});

test("Great Cavern Room deals 1 damage after a Goblin engages and forces travel once The Great Goblin is defeated", () => {
  let s = base(1, 3);
  s.activeLocation = make(s, O.cavern);
  const runners = stage(s, O.runners);
  forOwner(s, 0, () => engage(s, runners));
  flush(s);
  const target = s.choice!.options[0].id;
  s = choose(s, target);
  s = run(s);
  assert.equal(get(s, target)!.damage, 1);
  s.activeLocation = null;
  const other = stage(s, O.caves);
  const cavern = stage(s, O.cavern);
  s.phase = "travel";
  assert.equal(hooks.mustTravel!(s), false);
  s.victoryCards = [O.greatGoblin];
  assert.equal(hooks.mustTravel!(s), true);
  assert.match(canTravel(s, other)!, /Great Cavern Room/);
  assert.equal(canTravel(s, cavern), null);
});

test("Goblin Driver exhausts a character, Grip, grab! returns a Goblin from the discard pile, Chaos in the Cavern returns engaged enemies with +1 threat to Goblins", () => {
  let s = base(2, 3);
  stage(s, O.driver);
  hooks.encounter!(s, O.driver, false, true);
  flush(s);
  const exhausted = s.choice!.options[0].id;
  s = choose(s, exhausted);
  assert.equal(get(s, exhausted)!.exhausted, true);
  s.encounterDiscard = [O.axeman, O.rain];
  hooks.encounter!(s, O.grip, false, true);
  s = run(s);
  assert.ok(s.staging.some((u) => u.code === O.axeman));
  assert.deepEqual(
    s.encounterDiscard.filter((c) => c !== O.grip),
    [O.rain],
  );
  const miners = stage(s, O.miners);
  engageWith(s, miners, 1);
  s.phase = "quest";
  const before = threatOf(s, miners);
  hooks.encounter!(s, O.chaos, false, true);
  s = run(s);
  assert.ok(s.staging.some((u) => u.id === miners.id));
  assert.equal(threatOf(s, get(s, miners.id)!), before + 1);
});

test("Goblin shadows: Runners add an attack, Bent-Swords and Miners add attack, Axeman lowers defense, Caves raise threat and Grip spreads damage", () => {
  let s = base(1, 3);
  const gg = stage(s, O.greatGoblin);
  engageWith(s, gg);
  const runner = stage(s, O.runners);
  engageWith(s, runner);
  combat(s, gg.id);
  hooks.shadow!(s, O.runners);
  assert.equal(s.combat!.extraAttacks, 1);
  hooks.shadow!(s, O.bentSwords);
  hooks.shadow!(s, O.miners);
  assert.equal(s.combat!.attackBonus, 2);
  s.victoryCards = [O.greatGoblin];
  hooks.shadow!(s, O.bentSwords);
  assert.equal(s.combat!.attackBonus, 4);
  hooks.shadow!(s, O.axeman);
  assert.equal(s.combat!.defensePenalty, 1);
  hooks.shadow!(s, O.caves);
  flush(s);
  assert.equal(seatView(s, 0).threat, 22);
  hooks.shadow!(s, O.grip);
  flush(s);
  s = settle(s);
  assert.equal(
    allCharacters(s).reduce((n, u) => n + u.damage, 0),
    2,
  );
});

test("The Great Goblin discards X cards after attacking and adds the Goblins among them; Chaos in the Cavern's shadow returns the attacker", () => {
  let s = base(2, 3);
  const gg = stage(s, O.greatGoblin);
  engageWith(s, gg);
  s.encounterDeck = [O.runners, O.cavern, O.axeman];
  combat(s, gg.id, { attackResolved: true });
  hooks.enemyAttackStarted!(s, gg, 0);
  s.combat!.attackResolved = true;
  hooks.shadow!(s, O.chaos);
  for (const e of hooks.attackFinished!(s, s.combat!, false)) handle(s, e);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === O.runners));
  assert.deepEqual(s.encounterDiscard, [O.cavern]);
  assert.deepEqual(s.encounterDeck, [O.axeman]);
  assert.ok(s.staging.some((u) => u.id === gg.id));
});

test("Western Lands cards keep their rules in the Misty Mountains", () => {
  let s = base(1);
  s.encounterDiscard = [O.loneLands];
  stage(s, O.crow);
  hooks.encounter!(s, O.crow, false, true);
  s = run(s);
  assert.ok(s.staging.some((u) => u.code === O.loneLands));
  bilbo(s).resources = 3;
  hooks.encounter!(s, O.grocer, false, true);
  s = run(s);
  assert.equal(bilbo(s).resources, 0);
  assert.ok(s.encounterDiscard.includes(O.grocer));
  assert.equal(hooks.roundEnd!(s).length, 1);
  stage(s, O.caveEntrance);
  assert.equal(hooks.roundEnd!(s).length, 2);
});

test("Malformed Over the Misty Mountains Grim saves are rejected", () => {
  const s = base(1);
  const bad = (mutate: (raw: GameState) => void) => {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    return validateSave(raw);
  };
  assert.ok(bad(() => undefined));
  assert.ok(!bad((r) => (r.mistyMountains!.inactiveDeck = ["01001"])));
  assert.ok(!bad((r) => (r.mistyMountains!.goblinTown = true)));
  assert.ok(!bad((r) => (r.mistyMountains!.currentQuest = O.town)));
  assert.ok(!bad((r) => (r.stage = 4)));
  void ownerOf;
});
