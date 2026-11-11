import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  createGame,
  validateSave,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import {
  canGainResources,
  fx,
  get,
  make,
  stageInfo,
  stats,
  threatOf,
  cannotReady,
} from "../src/game/core";
import {
  check,
  damage,
  engage,
  progress,
  progressLocation,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import { isSacked } from "../src/game/carrock";
import {
  WMA as W,
  WMA_QUESTS,
  WMA_RECIPES,
  WMA_SACKS,
  WMA_TREASURES,
  WMA_TROLLS,
  sackTargets,
} from "../src/game/we-must-away";
import { WMA_HOOKS as hooks } from "../src/game/we-must-away";
import { HOBBIT_BILBO, bagginsBilbo } from "../src/game/hobbit-saga";
import {
  base,
  choose,
  reload,
  settle,
  stage,
  start,
} from "./we-must-away-fixtures";
import type { GameState, Unit } from "../src/game/types";

const effect = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
  return s;
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
const sackOn = (u: Unit) =>
  u.attachments.find((a) => WMA_SACKS.includes(a.code));
/** Resolve queued effects, run the framework check and settle choices. */
const run = (s: GameState, preferred?: string) => {
  flush(s);
  check(s);
  flush(s);
  return settle(s, preferred);
};
const toStageTwo = (s: GameState) => {
  progress(s, 7);
  return run(s);
};

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`We Must Away ${players} players ${easy ? "easy" : "normal"}: Bilbo joins the first player, seven Sacks, three Trolls and Troll Cave set aside, exact inventory`, () => {
      const s = start(players, easy, 71, true, true);
      const q = s.weMustAway!;
      assert.equal(s.phase, "resource");
      const first = seatView(s, s.table?.first ?? 0);
      assert.equal(
        first.heroes.filter((h) => h.code === HOBBIT_BILBO).length,
        1,
      );
      assert.equal(
        allCharacters(s).filter((h) => h.code === HOBBIT_BILBO).length,
        1,
      );
      // Bilbo's 0 threat leaves the first player's threat unchanged.
      assert.equal(
        first.startingThreat,
        seatView(s, playerOrder(s)[0]).startingThreat,
      );
      if (!s.encounterDiscard.includes(W.grocer))
        assert.equal(bilbo(s).resources, easy ? 2 : 1);
      assert.equal(q.sackDeck.length, 7);
      assert.deepEqual(
        q.setAside.map((u) => u.code).sort(),
        [...WMA_TROLLS, W.cave].sort(),
      );
      assert.equal(stageInfo(s).quest, 7);
      const recipe = WMA_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...playerOrder(s).flatMap((p) =>
          seatView(s, p).engaged.map((u) => u.code),
        ),
        ...q.setAside.map((u) => u.code),
        ...q.sackDeck,
        ...WMA_QUESTS.map((c) => c.code),
        HOBBIT_BILBO,
      ].sort();
      assert.deepEqual(
        physical,
        recipe.cards
          .flatMap((r) => Array<string>(r.quantity).fill(r.code))
          .sort(),
      );
      reload(s);
    });

test("The Baggins Bilbo cannot be chosen as a hero, and other Bilbos are reserved", () => {
  const d = STARTERS[0];
  const seats = (heroes: string[]) => [{ deckId: d.id, heroes }];
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "mirkwood",
        seats: seats([HOBBIT_BILBO, ...d.heroes.slice(1)]),
      }),
    /joins the first player only/,
  );
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "we-must-away-ere-break-of-day",
        seats: seats(["02001", ...d.heroes.slice(1)]),
      }),
    /reserved by The Hobbit/,
  );
  const outside = createGame(1, d.cards, d.heroes, d.id, {
    scenarioId: "mirkwood",
  });
  assert.ok(!allCharacters(outside).some((u) => u.code === HOBBIT_BILBO));
});

test("Stage 1B defeats at 7 progress; Roast Mutton adds the Trolls and Troll Cave, reshuffles the discard pile and attaches Troll Key", () => {
  let s = base(1);
  s.encounterDiscard = [W.rain, W.grocer];
  const key = stage(s, W.key);
  s = toStageTwo(s);
  assert.equal(s.stage, 2);
  assert.equal(s.stageRevealing, false);
  assert.equal(s.weMustAway!.setAside.length, 0);
  for (const code of [...WMA_TROLLS, W.cave])
    assert.equal(s.staging.filter((u) => u.code === code).length, 1);
  assert.deepEqual(s.encounterDiscard, []);
  assert.equal(s.encounterDeck.length, 32);
  // The Key attached to the chosen Troll (settle picked the first option).
  assert.ok(!s.staging.some((u) => u.id === key.id));
  assert.equal(
    s.staging.filter((u) => u.attachments.some((a) => a.code === W.key)).length,
    1,
  );
  assert.equal(stageInfo(s).quest, 1);
  reload(s);
});

test("Roast Mutton turns quest progress into encounter discards and advances when the deck empties; Dawn wins without treasure", () => {
  let s = base(1, 2);
  for (const code of WMA_TROLLS) stage(s, code);
  s.encounterDeck = [W.rain, W.grocer, W.lots];
  progress(s, 2);
  s = run(s);
  assert.equal(s.progress, 0);
  assert.deepEqual(s.encounterDeck, [W.lots]);
  assert.deepEqual(s.encounterDiscard, [W.rain, W.grocer]);
  assert.equal(s.status, "playing");
  progress(s, 3);
  s = run(s);
  assert.equal(s.status, "won");
  assert.equal(s.stage, 3);
  assert.deepEqual(s.weMustAway!.treasures, []);
  assert.ok(!s.staging.some((u) => WMA_TROLLS.includes(u.code)));
  assert.equal(
    s.removedEncounter?.filter((c) => WMA_TROLLS.includes(c)).length,
    3,
  );
  assert.equal(
    s.removedEncounter?.filter((c) => WMA_SACKS.includes(c)).length,
    7,
  );
});

test("Destroying the last Troll advances to Dawn Take You All; Troll Cave in the victory display discovers Sting, Glamdring and Orcrist", () => {
  let s = base(1, 2);
  const bert = stage(s, W.bert);
  s.victoryCards = [W.cave];
  damage(s, bert.id, 10);
  s = run(s);
  assert.equal(s.status, "won");
  assert.deepEqual(s.weMustAway!.treasures, WMA_TREASURES);
  assert.match(s.reason, /Sting, Glamdring and Orcrist/);
});

test("Sack 1 attaches to the highest printed willpower character, ties go to the first player, and a sacked character cannot ready, fight, commit or trigger", () => {
  let s = base(1, 2);
  stage(s, W.bert);
  s.weMustAway!.sackDeck = [
    W.deep,
    ...s.weMustAway!.sackDeck.filter((c) => c !== W.deep),
  ];
  const top = Math.max(
    ...allCharacters(s).map((u) => card(u.code).willpower ?? 0),
  );
  const best = allCharacters(s).filter(
    (u) => (card(u.code).willpower ?? 0) === top,
  );
  effect(s, "wmaSack", { value: 1, player: 0 });
  if (best.length > 1) s = choose(s, best[0].id);
  const target = get(s, best[0].id)!;
  assert.ok(sackOn(target));
  assert.ok(isSacked(target));
  assert.ok(cannotReady(target, s));
  assert.deepEqual(
    sackTargets(s, W.deep)
      .map((u) => u.id)
      .includes(target.id),
    false,
  );
  assert.equal(s.weMustAway!.sackDeck.length, 6);
  reload(s);
});

test("A Smelly Sack with no ally lets the first player choose any eligible character; Sacks that leave play return to the sack deck", () => {
  let s = base(1);
  s.weMustAway!.sackDeck = [W.smelly, W.tough];
  const options = sackTargets(s, W.smelly);
  assert.equal(options.length, allCharacters(s).length);
  effect(s, "wmaSack", { value: 1, player: 0 });
  const target = options[options.length - 1];
  s = choose(s, target.id);
  assert.ok(sackOn(get(s, target.id)!));
  assert.deepEqual(s.weMustAway!.sackDeck, [W.tough]);
  const u = get(s, target.id)!;
  hooks.attachmentLeaves!(s, u, sackOn(u)!, true);
  assert.deepEqual(
    [...s.weMustAway!.sackDeck].sort(),
    [W.smelly, W.tough].sort(),
  );
});

test("Sack X stops when the sack deck is empty and shuffles back a Sack without eligible targets", () => {
  let s = base(1);
  s.weMustAway!.sackDeck = [];
  effect(s, "wmaSack", { value: 2, player: 0 });
  assert.equal(s.weMustAway!.drawn.length, 0);
  s.weMustAway!.sackDeck = [W.worn];
  for (const h of allCharacters(s))
    h.attachments.push({
      id: `a${s.nextId++}`,
      code: W.deep,
      exhausted: false,
    });
  effect(s, "wmaSack", { value: 1, player: 0 });
  assert.deepEqual(s.weMustAway!.sackDeck, [W.worn]);
  assert.deepEqual(s.weMustAway!.drawn, []);
});

test("Trolls sack on engagement and return at the end of combat unless the engaged player raises threat by 1", () => {
  let s = base(1, 2);
  const william = stage(s, W.william);
  engage(s, william);
  s = run(s);
  assert.equal(allCharacters(s).filter((u) => sackOn(u)).length, 2);
  hooks.combatEnd!(s);
  flush(s);
  assert.match(s.choice!.title, /William/);
  s = choose(s, "threat");
  assert.equal(seatView(s, 0).threat, 21);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === william.id));
  hooks.combatEnd!(s);
  flush(s);
  s = choose(s, "return");
  assert.ok(s.staging.some((u) => u.id === william.id));
});

test("Troll texts: Bert forbids attachments, Tom allows one attacker, William protects unengaged Trolls and Troll Camp adds threat per player", () => {
  const s = base(2, 2);
  const bert = stage(s, W.bert);
  assert.ok(hooks.cannotAttach!(s, bert, "01067"));
  assert.equal(hooks.attackProblem!(s, bert, ["a", "b"]), null);
  stage(s, W.tom);
  assert.match(hooks.attackProblem!(s, bert, ["a", "b"])!, /one character/);
  assert.equal(hooks.attackProblem!(s, bert, ["a"]), null);
  assert.equal(hooks.damageAmount!(s, bert, 3, {}), 3);
  stage(s, W.william);
  assert.equal(hooks.damageAmount!(s, bert, 3, {}), 0);
  const before = threatOf(s, bert);
  stage(s, W.camp);
  assert.equal(threatOf(s, bert), before + 2);
});

test("Troll Key is claimed by exhausting Bilbo after its Troll takes attack damage; Troll Purse costs 1 Baggins resource after its Troll is destroyed", () => {
  let s = base(1, 2);
  const tom = stage(s, W.tom);
  const bert = stage(s, W.bert);
  tom.attachments.push({ id: "k1", code: W.key, exhausted: false });
  bert.attachments.push({ id: "p1", code: W.purse, exhausted: false });
  hooks.playerAttackResolved!(s, tom, [], 2, 11);
  flush(s);
  s = choose(s, "claim");
  assert.ok(bilbo(s).exhausted);
  assert.ok(bilbo(s).attachments.some((a) => a.code === W.key));
  assert.ok(!get(s, tom.id)!.attachments.some((a) => a.code === W.key));
  const resources = bilbo(s).resources;
  damage(s, bert.id, 10);
  flush(s);
  s = choose(s, "claim");
  assert.equal(bilbo(s).resources, resources - 1);
  assert.ok(bilbo(s).attachments.some((a) => a.code === W.purse));
  reload(s);
});

test("Troll Cave can be travelled to only with the Troll Key on Bilbo and 5 Baggins resources, or 2 with the Troll Purse", () => {
  let s = base(1, 2);
  stage(s, W.bert);
  const cave = stage(s, W.cave);
  s.phase = "travel";
  assert.match(canTravel(s, cave)!, /Troll Key/);
  bilbo(s).attachments.push({ id: "k1", code: W.key, exhausted: false });
  bilbo(s).resources = 4;
  assert.match(canTravel(s, cave)!, /5 Baggins resources/);
  bilbo(s).attachments.push({ id: "p1", code: W.purse, exhausted: false });
  assert.equal(canTravel(s, cave), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: cave.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, W.cave);
  assert.equal(bilbo(s).resources, 2);
  assert.ok(hooks.immune!(s, s.activeLocation!));
});

test("Bilbo follows the first player token with his resources and attachments; player cards cannot give him resources; losing him loses the game", () => {
  let s = start(2, false, 5, false, true);
  const b = bilbo(s);
  b.resources = 3;
  b.attachments.push({ id: "k1", code: W.key, exhausted: false });
  assert.equal(ownerOf(s, b), 0);
  assert.ok(!canGainResources(s, b));
  assert.ok(canGainResources(s, b, false));
  s.queue = [];
  s.choice = null;
  effect(s, "refreshEnd");
  assert.equal(firstPlayer(s), 1);
  assert.equal(ownerOf(s, bilbo(s)), 1);
  assert.ok(seatView(s, 1).heroes.some((u) => u.code === HOBBIT_BILBO));
  assert.ok(!seatView(s, 0).heroes.some((u) => u.code === HOBBIT_BILBO));
  assert.equal(bilbo(s).resources, 3);
  assert.ok(bilbo(s).attachments.some((a) => a.code === W.key));
  s = reload(s);
  damage(s, bilbo(s).id, 3);
  flush(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Bilbo Baggins has left play/);
});
test("Treacheries: Hungry Troll engages or surges, Lots or None sacks or gains doomed 2, Grocer discards Baggins resources", () => {
  let s = base(1, 2);
  assert.ok(hooks.revealedSurge!(s, W.hungry));
  assert.equal(hooks.revealedDoomed!(s, W.lots, "encounter"), 2);
  assert.equal(hooks.printedDoomed!(s, W.lots), 0);
  const bert = stage(s, W.bert);
  assert.ok(!hooks.revealedSurge!(s, W.hungry));
  assert.equal(hooks.revealedDoomed!(s, W.lots, "encounter"), 0);
  hooks.encounter!(s, W.hungry, false, true);
  flush(s);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === bert.id));
  assert.ok(s.encounterDiscard.includes(W.hungry));
  bilbo(s).resources = 4;
  hooks.encounter!(s, W.grocer, false, true);
  flush(s);
  assert.equal(bilbo(s).resources, 0);
});

test("Wind-whipped Rain keeps objectives and treasures; Roast 'Em damages allies by 1 or 2; A Nice Pickle moves the discard pile under the deck", () => {
  let s = base(2);
  const a = ally(s, "01073");
  const h = seatView(s, 0).heroes[0];
  h.attachments.push({ id: "x1", code: "01067", owner: 0, exhausted: false });
  h.attachments.push({ id: "k1", code: W.key, exhausted: false });
  hooks.encounter!(s, W.rain, false, true);
  flush(s);
  assert.deepEqual(
    get(s, h.id)!.attachments.map((x) => x.code),
    [W.key],
  );
  hooks.encounter!(s, W.roast, false, true);
  flush(s);
  assert.equal(get(s, a.id)!.damage, 1);
  stage(s, W.bert);
  hooks.encounter!(s, W.roast, false, true);
  flush(s);
  assert.equal(get(s, a.id)?.damage ?? 4, 3);
  s.encounterDiscard = ["d1", "d2", "d3", "d4", "d5", "d6"].map(() => W.rain);
  s.encounterDiscard[5] = W.grocer;
  s.encounterDeck = [W.lots];
  hooks.encounter!(s, W.pickle, false, true);
  flush(s);
  assert.equal(s.encounterDeck.length, 5);
  assert.equal(s.encounterDeck[1], W.grocer);
});

test("A Suspicious Crow reveals the top card of the encounter discard pile; its shadow shuffles it back after damage", () => {
  let s = base(1);
  s.encounterDiscard = [W.grocer, W.loneLands];
  stage(s, W.crow);
  hooks.encounter!(s, W.crow, false, true);
  flush(s);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === W.loneLands));
  assert.deepEqual(s.encounterDiscard, [W.grocer]);
  const bert = stage(s, W.bert);
  bert.shadows = [W.crow];
  bert.revealedShadowCount = 1;
  combat(s, bert.id);
  hooks.enemyAttackStarted!(s, bert, 0);
  hooks.shadow!(s, W.crow);
  hooks.damageDealt!(s, seatView(s, 0).heroes[0], 2, {
    combatDamage: true,
    enemyId: bert.id,
  });
  const deck = s.encounterDeck.length;
  hooks.attackFinished!(s, s.combat!);
  assert.equal(s.encounterDeck.length, deck + 1);
  assert.deepEqual(bert.shadows, []);
});

test("Shadows: Hungry Troll's 4 damage and Lots or None's Sack can be cancelled with Baggins resources; Roast 'Em finds Troll Camp", () => {
  let s = base(1, 2);
  const bert = stage(s, W.bert);
  const h = seatView(s, 0).heroes[0];
  h.attachments.push({ id: "s1", code: W.deep, exhausted: false });
  combat(s, bert.id);
  bilbo(s).resources = 2;
  hooks.shadow!(s, W.hungry);
  flush(s);
  s = choose(s, "cancel");
  assert.equal(bilbo(s).resources, 0);
  assert.equal(get(s, h.id)!.damage, 0);
  combat(s, bert.id);
  hooks.shadow!(s, W.hungry);
  flush(s);
  assert.equal(get(s, h.id)!.damage, 4);
  s.encounterDeck = [W.rain, W.camp];
  hooks.shadow!(s, W.roast);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === W.camp));
  assert.equal(s.encounterDeck.length, 1);
  combat(s, bert.id);
  const sacks = s.weMustAway!.sackDeck.length;
  hooks.shadow!(s, W.lots);
  flush(s);
  s = settle(s);
  assert.equal(s.weMustAway!.sackDeck.length, sacks - 1);
});

test("Western Lands: Dreary Hills discards at random, Lone-Lands removes a resource, Hobbit-lands draws, and Bilbo gains a resource from explored hills", () => {
  let s = base(1);
  forOwner(s, 0, () => {
    s.hand = [make(s, "01073"), make(s, "01067")];
    s.deck = ["01073", "01073"];
  });
  const hills = stage(s, W.drearyHills);
  s.staging = s.staging.filter((u) => u.id !== hills.id);
  s.activeLocation = hills;
  progressLocation(s, hills, 1);
  s = run(s, "gain");
  assert.equal(seatView(s, 0).hand.length, 1);
  const before = bilbo(s).resources;
  progressLocation(s, s.activeLocation!, 2);
  s = run(s, "gain");
  // The second placement discards again before the explored response.
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(bilbo(s).resources, before + 1);
  const lands = make(s, W.hobbitLands);
  s.activeLocation = lands;
  progressLocation(s, lands, 1);
  s = run(s, "draw");
  assert.equal(seatView(s, 0).hand.length, 1);
});

test("Cave Entrance returns X discards to the bottom of the deck at the end of the round; More Like a Grocer's shadow discards Baggins resources", () => {
  let s = base(2);
  stage(s, W.caveEntrance);
  s.encounterDiscard = [W.rain, W.grocer, W.lots];
  s.encounterDeck = [W.loneLands];
  const effects = hooks.roundEnd!(s);
  assert.equal(effects.length, 1);
  handle(s, effects[0]);
  flush(s);
  assert.deepEqual(s.encounterDeck, [W.loneLands, W.lots, W.grocer]);
  const bert = stage(s, W.bert);
  combat(s, bert.id);
  bilbo(s).resources = 3;
  hooks.shadow!(s, W.grocer);
  flush(s);
  assert.equal(bilbo(s).resources, 0);
  assert.equal(stats(s, bert).attack, card(W.bert).attack);
});

test("Troll Camp gives Bilbo an action to remove a Sack even while he is sacked", () => {
  let s = base(1);
  stage(s, W.camp);
  const b = bilbo(s);
  b.attachments.push({ id: "s1", code: W.worn, exhausted: false });
  s.weMustAway!.sackDeck = s.weMustAway!.sackDeck.filter((c) => c !== W.worn);
  assert.equal(hooks.abilityProblem!(s, b), null);
  assert.ok(hooks.abilitySackExempt!(s, b));
  s = applyAction(reload(s), { type: "ABILITY", id: b.id });
  s = choose(s, b.id);
  assert.ok(!sackOn(bilbo(s)));
  assert.ok(bilbo(s).exhausted);
  assert.equal(s.weMustAway!.sackDeck.length, 7);
});

test("Malformed We Must Away saves are rejected", () => {
  const s = base(1);
  const bad = (mutate: (raw: GameState) => void) => {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    return validateSave(raw);
  };
  assert.ok(bad(() => undefined));
  assert.ok(!bad((r) => (r.weMustAway!.sackDeck = [W.deep, W.deep])));
  assert.ok(!bad((r) => (r.weMustAway!.sackDeck = ["01001"])));
  assert.ok(!bad((r) => (r.weMustAway!.currentQuest = W.dawn)));
  assert.ok(!bad((r) => (r.weMustAway!.treasures = ["131020"])));
  assert.ok(!bad((r) => (r.stage = 4)));
});

test("A first player whose last hero was Bilbo is eliminated when Bilbo passes; an eliminated controller loses Bilbo and the game", () => {
  let s = start(2, false, 5, false, true);
  forOwner(s, 0, () => {
    s.heroes = s.heroes.filter((h) => h.code === HOBBIT_BILBO);
  });
  s.queue = [];
  s.choice = null;
  effect(s, "refreshEnd");
  check(s);
  flush(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(ownerOf(s, bilbo(s)), 1);
  assert.equal(s.status, "playing");
  s = start(2, false, 6, false, true);
  hooks.playerEliminating!(s, 0);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Bilbo Baggins has left play/);
});

test("Lone-Lands removes a hero resource from each player, No Campfire offers threat or a reveal, and the remaining shadows resolve", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    for (const h of s.heroes) h.resources = 0;
    s.heroes[0].resources = 2;
  });
  const lands = make(s, W.loneLands);
  s.activeLocation = lands;
  progressLocation(s, lands, 1);
  flush(s);
  assert.match(s.choice!.title, /Lone-Lands/);
  const picked = s.choice!.options[0].id;
  s = choose(s, picked);
  s = run(s);
  assert.equal(get(s, picked)!.resources, 9);
  assert.equal(seatView(s, 1).heroes[0].resources, 1);
  hooks.encounter!(s, W.campfire, false, true);
  flush(s);
  assert.match(s.choice!.title, /No Campfire/);
  s = choose(s, "threat");
  assert.equal(seatView(s, 0).threat, 24);
  const deck = s.encounterDeck.length;
  s = choose(s, "reveal");
  assert.ok(s.encounterDeck.length < deck);
  const bert = stage(s, W.bert);
  bert.shadows = [W.pickle];
  bert.revealedShadowCount = 1;
  combat(s, bert.id);
  const before = s.encounterDeck.length;
  hooks.shadow!(s, W.pickle);
  assert.equal(s.encounterDeck.length, before + 1);
  assert.deepEqual(bert.shadows, []);
  s.encounterDiscard = [W.rain, W.grocer];
  hooks.shadow!(s, W.hobbitLands);
  assert.equal(s.encounterDeck[0], W.grocer);
  hooks.shadow!(s, W.rain);
  assert.equal(s.combat!.defensePenalty, 1);
  hooks.shadow!(s, W.campfire);
  flush(s);
  assert.equal(seatView(s, 0).threat, 26);
});

test("Roast Mutton advances as soon as a reveal empties the deck, before a second queued reveal could refill it", () => {
  let s = base(2, 2);
  for (const code of WMA_TROLLS) stage(s, code);
  s.phase = "staging";
  s.encounterDeck = [W.loneLands];
  s.encounterDiscard = [W.rain, W.grocer];
  s.queue = [fx("reveal", { player: 0 }), fx("reveal", { player: 1 })];
  s = run(s);
  assert.equal(s.status, "won");
  assert.equal(s.stage, 3);
});
