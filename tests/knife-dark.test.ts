import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  enemyAttackPrevented,
  validateSave,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stats,
  threatOf,
} from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { engage } from "../src/game/board";
import { playerOrder, seatView } from "../src/game/table";
import { optionalEngagementProblem as canOptionallyEngage } from "../src/game/actions";
import {
  ONE_RING,
  SAGA_FRODO,
  oneRing,
  ringBearer,
} from "../src/game/lotr-saga";
import {
  KD,
  KNIFE_DARK_HOOKS as H,
  KNIFE_DARK_RECIPES,
  isKdNazgul,
  knifeDarkPublicState,
} from "../src/game/knife-dark";
import {
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./knife-dark-fixtures";
import type { Effect, GameState } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
const play = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  return run(s);
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Reveal one encounter card as the given player during staging. */
const reveal = (
  s: GameState,
  code: string,
  rest: string[] = [],
  player = 0,
) => {
  s.phase = "staging";
  s.encounterDeck = [code, ...rest];
  handle(s, fx("reveal", { player }));
  return run(s);
};
const wraiths = (s: GameState) =>
  s.knifeDark!.setAside.filter((c) => c === KD.ringwraith).length;
/** Begin an attack by an engaged enemy against the first player's hero. */
const attacking = (s: GameState, enemyId: string, defender?: string) => {
  s.combat = {
    enemyId,
    defenderId: defender ?? null,
    defenderIds: defender ? [defender] : [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  return s.combat;
};

test("Setup: Bill Ferny and The Prancing Pony wait in the staging area; the Ringwraiths, The Witch-king, Midgewater and Weathertop are set aside; the first player claims The One Ring", () => {
  for (const [easy, deckSize, ringwraiths] of [
    [false, 35, 4],
    [true, 24, 2],
  ] as const) {
    const recipe = KNIFE_DARK_RECIPES.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    )!;
    assert.equal(
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((n, c) => n + c.quantity, 0),
      deckSize,
    );
    for (const players of [1, 2, 3]) {
      const s = start(players, easy, 60 + players);
      assert.equal(s.encounterDeck.length, deckSize);
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [KD.ferny, KD.pony].sort(),
      );
      assert.equal(s.activeLocation, null);
      assert.deepEqual(
        [...s.knifeDark!.setAside].sort(),
        [
          KD.witchKing,
          KD.midgewater,
          KD.weathertop,
          ...Array(ringwraiths).fill(KD.ringwraith),
        ].sort(),
      );
      assert.ok(
        !s.encounterDeck.some((c) => [KD.ringwraith, KD.witchKing].includes(c)),
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === KD.rider).length,
        easy ? 0 : 2,
      );
      const bearer = ringBearer(s)!;
      assert.equal(bearer.code, SAGA_FRODO);
      const first = s.table?.first ?? 0;
      assert.ok(seatView(s, first).heroes.some((h) => h.id === bearer.id));
      assert.equal(oneRing(s)!.code, ONE_RING);
      assert.equal(s.knifeDark!.currentQuest, KD.bree);
    }
  }
});

test("Stage 1B cannot be defeated while The Prancing Pony is in play; travelling there puts an ally into play from the first player's hand", () => {
  let s = base();
  const pony = stage(s, KD.pony);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 9, player: 0 }));
  run(s);
  assert.equal(s.stage, 1, "The Prancing Pony is in play");
  assert.equal(s.progress, 9);
  // Travel to The Prancing Pony: the first player may put an ally into play.
  s.progress = 0;
  s.phase = "travel";
  const [guard, faramir] = hand(s, ["01013", "01014"]);
  s = act(s, { type: "TRAVEL", id: pony.id });
  assert.match(s.choice!.title, /The Prancing Pony · Put an ally into play/);
  assert.ok(s.choice!.options.some((o) => o.id === "skip"));
  s = choose(s, faramir.id);
  s = settle(s);
  assert.ok(s.allies.some((u) => u.id === faramir.id));
  assert.ok(s.hand.some((u) => u.id === guard.id));
  assert.equal(s.activeLocation!.id, pony.id);
});

test("When The Prancing Pony leaves play, cards are discarded from the encounter deck until X enemies are found, and they enter play engaged with the first player; then stage 1B can be defeated and 2B adds Midgewater and 1 progress per player", () => {
  let s = base(2);
  const first = s.table!.first;
  s.activeLocation = make(s, KD.pony);
  s.encounterDeck = [
    KD.hills,
    KD.shady,
    KD.chetwood,
    KD.squint,
    KD.shady,
    KD.hills,
  ];
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 4, player: first }));
  run(s);
  s = settle(s);
  assert.ok(s.victoryCards!.includes(KD.pony), "Victory 1");
  assert.deepEqual(
    seatView(s, first)
      .engaged.map((u) => u.code)
      .sort(),
    [KD.shady, KD.squint].sort(),
    "two players: two enemies, engaged with the first player",
  );
  assert.deepEqual(s.encounterDiscard, [KD.hills, KD.chetwood]);
  assert.deepEqual(s.encounterDeck, [KD.shady, KD.hills]);
  assert.equal(s.stage, 1, "the quest itself still needs its progress");
  handle(s, fx("successfulQuestProgress", { value: 8, player: first }));
  run(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.knifeDark!.currentQuest, KD.wild);
  assert.ok(s.staging.some((u) => u.code === KD.midgewater));
  assert.ok(!s.knifeDark!.setAside.includes(KD.midgewater));
  assert.equal(s.progress, 2, "each player places 1 progress");
});

test("The Prancing Pony's discards stop when the encounter deck runs out; the discard pile is not shuffled back during the quest phase", () => {
  let s = base(4);
  const first = s.table!.first;
  s.activeLocation = make(s, KD.pony);
  s.encounterDeck = [KD.hills, KD.shady, KD.chetwood];
  s.encounterDiscard = [KD.hills, KD.hills];
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 4, player: first }));
  run(s);
  s = settle(s);
  assert.deepEqual(
    seatView(s, first).engaged.map((u) => u.code),
    [KD.shady],
    "four players, but only one enemy was left",
  );
  // Every other card was discarded once; the generic empty-deck rule may
  // reshuffle them afterwards.
  assert.deepEqual(
    [...s.encounterDeck, ...s.encounterDiscard].sort(),
    [KD.hills, KD.hills, KD.hills, KD.chetwood].sort(),
  );
  assert.ok(
    s.log.some((l) =>
      /3 cards are discarded|2 cards are discarded/.test(l.text),
    ),
  );
});

test("Bill Ferny: at the beginning of the staging step the first player shuffles an out of play Ringwraith into the encounter deck or each player raises their threat for each non-Fellowship hero they committed; he cannot be optionally engaged", () => {
  let s = base();
  stage(s, KD.ferny);
  s.phase = "quest";
  s.encounterDeck = Array(4).fill(KD.hills);
  const [aragorn, théodred] = s.heroes;
  const frodo = ringBearer(s)!;
  for (const id of [aragorn.id, théodred.id, frodo.id])
    s = act(s, { type: "TOGGLE_QUEST", id });
  s = act(s, { type: "COMMIT" });
  // Théodred's own response to committing comes first.
  for (let n = 0; n < 5 && !/Bill Ferny/.test(s.choice?.title ?? ""); n++)
    s = choose(s, s.choice!.options[0].id);
  assert.match(s.choice!.title, /Bill Ferny/);
  const threat = s.threat;
  s = choose(s, "threat");
  assert.equal(s.threat, threat + 2, "Frodo is a Fellowship hero");
  assert.ok(
    s.staging.some((u) => u.code === KD.hills),
    "staging continues",
  );
  // The other option shuffles a Ringwraith into the encounter deck.
  let t = base();
  stage(t, KD.ferny);
  t.phase = "quest";
  t.encounterDeck = Array(4).fill(KD.hills);
  t = act(t, { type: "COMMIT" });
  t = choose(t, "ringwraith");
  assert.equal(wraiths(t), 3);
  assert.ok(
    [...t.encounterDeck, ...t.staging.map((u) => u.code)].includes(
      KD.ringwraith,
    ),
  );
  // No Ringwraith left out of play: threat it is.
  let u = base();
  stage(u, KD.ferny);
  u.knifeDark!.setAside = u.knifeDark!.setAside.filter(
    (c) => c !== KD.ringwraith,
  );
  u.phase = "quest";
  u.encounterDeck = Array(4).fill(KD.hills);
  u = act(u, { type: "TOGGLE_QUEST", id: u.heroes[0].id });
  u = act(u, { type: "COMMIT" });
  // Aragorn's own response to committing comes first.
  for (let n = 0; n < 5 && /response/.test(u.choice?.title ?? ""); n++)
    u = choose(
      u,
      (u.choice!.options.find((o) => o.id === "skip") ?? u.choice!.options[0])
        .id,
    );
  assert.ok(!u.choice?.title.includes("Bill Ferny"));
  assert.ok(u.log.some((l) => /Bill Ferny: each player raises/.test(l.text)));
  const ferny = stage(base(), KD.ferny);
  const v = base();
  v.staging.push(ferny);
  v.threat = 45;
  assert.match(canOptionallyEngage(v, ferny) ?? "", /cannot be optionally/);
});

test("Into the Wild: at the end of the round the first player removes X progress or shuffles an out of play Ringwraith; the players cannot advance while Midgewater is in play", () => {
  let s = base(2);
  const first = s.table!.first;
  s.stage = 2;
  s.knifeDark!.currentQuest = KD.wild;
  s.knifeDark!.setAside = s.knifeDark!.setAside.filter(
    (c) => c !== KD.midgewater,
  );
  const midgewater = stage(s, KD.midgewater);
  s.progress = 5;
  play(s, ...H.roundEnd!(s));
  assert.match(s.choice!.title, /Into the Wild/);
  s = choose(s, "progress");
  assert.equal(s.progress, 3, "two players: 2 progress removed");
  play(s, ...H.roundEnd!(s));
  s = choose(s, "ringwraith");
  assert.equal(s.progress, 3);
  assert.equal(wraiths(s), 3);
  // Too little progress: the Ringwraith must be shuffled in.
  s.progress = 1;
  play(s, ...H.roundEnd!(s));
  assert.equal(s.choice, null);
  assert.equal(wraiths(s), 2);
  // Neither option can be fully resolved: the remaining progress is removed.
  s.knifeDark!.setAside = s.knifeDark!.setAside.filter(
    (c) => c !== KD.ringwraith,
  );
  play(s, ...H.roundEnd!(s));
  assert.equal(s.progress, 0);
  // Midgewater blocks the advance.
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 7, player: first }));
  run(s);
  assert.equal(s.stage, 2, "Midgewater is in play");
  s.staging = s.staging.filter((u) => u.id !== midgewater.id);
  s.victoryCards = [KD.midgewater];
  s.encounterDeck = Array(6).fill(KD.hills);
  handle(s, fx("successfulQuestProgress", { value: 1, player: first }));
  run(s);
  s = settle(s);
  assert.equal(s.stage, 3);
});

test("Midgewater: after it becomes the active location each engaged enemy returns to the staging area; while it is active enemies cannot attack, take damage or be engaged", () => {
  let s = base();
  const shady = engaged(s, KD.shady);
  const midgewater = stage(s, KD.midgewater);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: midgewater.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, midgewater.id);
  assert.equal(s.engaged.length, 0);
  const back = s.staging.find((u) => u.id === shady.id)!;
  assert.ok(back, "returned to the staging area");
  assert.ok(enemyAttackPrevented(s, back));
  play(s, fx("damage", { target: back.id, value: 3, player: 0 }));
  assert.equal(get(s, back.id)!.damage, 0, "cannot take damage");
  engage(s, back);
  assert.ok(
    s.staging.some((u) => u.id === back.id),
    "cannot be engaged",
  );
  s.threat = 50;
  assert.match(canOptionallyEngage(s, back) ?? "", /cannot be optionally/);
  // Once it is gone, the enemy can be engaged and damaged again.
  s.activeLocation = null;
  assert.equal(enemyAttackPrevented(s, back), false);
  play(s, fx("damage", { target: back.id, value: 1, player: 0 }));
  assert.equal(get(s, back.id)!.damage, 1);
});

test("Stage 3A adds Weathertop, The Witch-king and each Nazgûl enemy in the encounter deck and discard pile to the staging area; 3B is won when no Nazgûl enemy is in play", () => {
  let s = base();
  s.stage = 2;
  s.knifeDark!.currentQuest = KD.wild;
  s.knifeDark!.setAside = [KD.witchKing, KD.weathertop, KD.ringwraith];
  s.encounterDeck = [KD.hills, KD.ringwraith, KD.rider, KD.hills];
  s.encounterDiscard = [KD.ringwraith, KD.chetwood];
  play(s, fx("kdNextStage", { player: 0 }));
  assert.equal(s.stage, 3);
  assert.equal(s.knifeDark!.currentQuest, KD.attack);
  assert.ok(s.knifeDark!.finale);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [
      KD.weathertop,
      KD.witchKing,
      KD.ringwraith,
      KD.rider,
      KD.ringwraith,
    ].sort(),
  );
  assert.deepEqual(s.encounterDeck, [KD.hills, KD.hills]);
  assert.deepEqual(s.encounterDiscard, [KD.chetwood]);
  assert.deepEqual(
    s.knifeDark!.setAside,
    [KD.ringwraith],
    "an out of play Ringwraith stays out of play",
  );
  assert.equal(s.status, "playing");
  // Drive off every Nazgûl: the players win.
  for (const u of s.staging.filter((x) => isKdNazgul(x)))
    s.staging = s.staging.filter((x) => x.id !== u.id);
  play(s, fx("kdMidgewaterReturn", { player: 0 }));
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /Nazgûl/);
});

test("Weathertop: immune to player card effects; the first player must exhaust The One Ring to travel there; in the victory display each enemy gets −1 threat", () => {
  let s = base();
  const top = stage(s, KD.weathertop);
  assert.equal(H.immune!(s, top), true);
  s.phase = "travel";
  oneRing(s)!.exhausted = true;
  assert.match(canTravel(s, top) ?? "", /exhaust The One Ring/);
  oneRing(s)!.exhausted = false;
  assert.equal(canTravel(s, top), null);
  s = act(s, { type: "TRAVEL", id: top.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, top.id);
  assert.equal(oneRing(s)!.exhausted, true);
  const t = base();
  const shady = stage(t, KD.shady);
  assert.equal(threatOf(t, shady), 2);
  t.victoryCards = [KD.weathertop];
  assert.equal(threatOf(t, shady), 1);
});

test("Weather Hills: after the players travel there they may place a non-unique enemy in play facedown under it, out of play; it returns to the staging area when the location leaves play", () => {
  let s = base();
  const hills = stage(s, KD.hills);
  const wraith = engaged(s, KD.ringwraith);
  wraith.damage = 2;
  wraith.attachments.push({ id: "blade-1", code: KD.blade, exhausted: false });
  stage(s, KD.witchKing);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: hills.id });
  assert.match(s.choice!.title, /Weather Hills/);
  assert.ok(
    !s.choice!.options.some((o) => o.code === KD.witchKing),
    "unique enemies cannot be placed",
  );
  s = choose(s, wraith.id);
  s = settle(s);
  assert.equal(s.engaged.length, 0);
  assert.deepEqual(s.knifeDark!.hills, [
    { location: hills.id, codes: [KD.ringwraith] },
  ]);
  assert.ok(s.encounterDiscard.includes(KD.blade), "attachments are discarded");
  assert.equal(knifeDarkPublicState(s)!.hidden, 1);
  // Exploring Weather Hills returns the enemy face-up, undamaged.
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 2, player: 0 }));
  run(s);
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(KD.hills));
  const back = s.staging.find((u) => u.code === KD.ringwraith)!;
  assert.ok(back);
  assert.equal(back.damage, 0);
  assert.deepEqual(s.knifeDark!.hills, []);
});

test("Weather Hills at stage 3B: a Nazgûl hidden under it is out of play, so the players can win", () => {
  let s = base();
  s.stage = 3;
  s.knifeDark!.currentQuest = KD.attack;
  s.knifeDark!.finale = true;
  const hills = stage(s, KD.hills);
  const wraith = stage(s, KD.ringwraith);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: hills.id });
  s = choose(s, wraith.id);
  assert.equal(s.status, "won");
});

test("Chetwood: Spy enemies get +1 threat and +1 attack for each Chetwood in the staging area; its shadow discards a random card from the defending player's hand", () => {
  const s = base();
  const shady = stage(s, KD.shady);
  const wraith = stage(s, KD.ringwraith);
  stage(s, KD.chetwood);
  stage(s, KD.chetwood);
  assert.equal(threatOf(s, shady), 4);
  assert.equal(stats(s, shady).attack, 5);
  assert.equal(threatOf(s, wraith), 3, "not a Spy");
  const t = base();
  hand(t, ["01013", "01014", "01015"]);
  const enemy = engaged(t, KD.shady);
  attacking(t, enemy.id);
  H.shadow!(t, KD.chetwood);
  assert.equal(t.hand.length, 2);
  assert.equal(t.discard.length, 1);
});

test("Rider of Mordor: characters of its engaged player get −1 willpower; −10 engagement cost while The One Ring is exhausted; no non-Morgul attachments", () => {
  const s = base(2);
  const first = s.table!.first;
  const other = playerOrder(s).find((p) => p !== first)!;
  const before = stats(s, seatView(s, first).heroes[0]).will;
  const rider = engaged(s, KD.rider, first);
  assert.equal(stats(s, seatView(s, first).heroes[0]).will, before - 1);
  assert.equal(
    stats(s, seatView(s, other).heroes[0]).will,
    card(seatView(s, other).heroes[0].code).willpower,
  );
  const staged = stage(s, KD.rider);
  const cost = engagementCost(s, staged);
  oneRing(s)!.exhausted = true;
  assert.equal(engagementCost(s, staged), cost - 10);
  assert.equal(H.cannotAttach!(s, rider, "01041"), true);
  assert.equal(H.cannotAttach!(s, rider, KD.blade), false);
});

test("Ringwraith: when it attacks with The One Ring exhausted it is dealt an additional shadow card; its own shadow shuffles it back into the encounter deck", () => {
  let s = base();
  const wraith = engaged(s, KD.ringwraith);
  oneRing(s)!.exhausted = true;
  wraith.shadows = [KD.hills];
  s.encounterDeck = [KD.chetwood, KD.hills];
  const dealt = wraith.shadows.length;
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: wraith.id,
    defenderId: s.heroes[0].id,
  });
  assert.ok(
    s.log.some((l) => /dealt an additional shadow card/.test(l.text)),
    `extra shadow (dealt ${dealt})`,
  );
  // Its shadow: the card returns to the encounter deck.
  const t = base();
  const enemy = engaged(t, KD.shady);
  enemy.shadows = [KD.ringwraith];
  attacking(t, enemy.id);
  t.encounterDeck = [KD.hills];
  H.shadow!(t, KD.ringwraith);
  assert.deepEqual(get(t, enemy.id)!.shadows, []);
  assert.ok(t.encounterDeck.includes(KD.ringwraith));
});

test("The Witch-king: immune to player card effects; −30 engagement cost while The One Ring is exhausted; characters with 1 willpower or less cannot defend his attacks", () => {
  const s = base();
  const king = stage(s, KD.witchKing);
  assert.equal(H.immune!(s, king), true);
  assert.equal(engagementCost(s, king), 45);
  oneRing(s)!.exhausted = true;
  assert.equal(engagementCost(s, king), 15);
  const [aragorn, théodred] = s.heroes;
  assert.equal(H.cannotDefend!(s, king, théodred), true, "1 willpower");
  assert.equal(H.cannotDefend!(s, king, aragorn), false, "2 willpower");
});

test("Shady Bree-lander cannot be optionally engaged while The One Ring is exhausted; its shadow gives −1 defense, −2 with The One Ring exhausted", () => {
  const s = base();
  const shady = stage(s, KD.shady);
  s.threat = 40;
  s.phase = "encounter";
  assert.equal(canOptionallyEngage(s, shady), null);
  oneRing(s)!.exhausted = true;
  assert.match(canOptionallyEngage(s, shady) ?? "", /cannot be optionally/);
  for (const exhausted of [false, true]) {
    const t = base();
    oneRing(t)!.exhausted = exhausted;
    const enemy = engaged(t, KD.ringwraith);
    const c = attacking(t, enemy.id, t.heroes[0].id);
    H.shadow!(t, KD.shady);
    assert.equal(c.defensePenalty, exhausted ? 2 : 1);
  }
});

test("Squint-eyed Southerner: its revealing player shuffles an out of play Ringwraith into the encounter deck or reveals an additional card", () => {
  let s = base();
  reveal(s, KD.squint, [KD.hills, KD.hills]);
  assert.match(s.choice!.title, /Squint-eyed Southerner/);
  s = choose(s, "reveal");
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === KD.hills).length, 1);
  assert.equal(wraiths(s), 4);
  let t = base();
  reveal(t, KD.squint, [KD.hills, KD.hills]);
  t = choose(t, "ringwraith");
  t = settle(t);
  assert.equal(wraiths(t), 3);
  assert.ok(!t.staging.some((u) => u.code === KD.hills));
  // No Ringwraith out of play: an additional card is revealed.
  let u = base();
  u.knifeDark!.setAside = [];
  reveal(u, KD.squint, [KD.hills, KD.hills]);
  u = settle(u);
  assert.equal(u.staging.filter((x) => x.code === KD.hills).length, 1);
});

test("Unwanted Attention: remove 2 committed heroes or shuffle an out of play Ringwraith; an option that can be fully resolved must be chosen; its shadow returns the attacker to the staging area", () => {
  let s = base();
  for (const h of s.heroes.slice(0, 3)) h.committed = true;
  reveal(s, KD.unwanted, [KD.hills]);
  assert.match(s.choice!.title, /^Unwanted Attention$/);
  s = choose(s, "remove");
  assert.match(s.choice!.title, /Remove a hero from the quest \(2 to remove\)/);
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[1].id);
  s = settle(s);
  assert.deepEqual(
    s.heroes.map((h) => h.committed),
    [false, false, true, false],
  );
  assert.ok(s.encounterDiscard.includes(KD.unwanted));
  // Fewer than 2 committed heroes: the Ringwraith must be shuffled in.
  let t = base();
  t.heroes[0].committed = true;
  reveal(t, KD.unwanted, [KD.hills]);
  t = settle(t);
  assert.equal(wraiths(t), 3);
  assert.equal(t.heroes[0].committed, true);
  // Neither option: the committed hero is removed.
  let u = base();
  u.heroes[0].committed = true;
  u.knifeDark!.setAside = [];
  reveal(u, KD.unwanted, [KD.hills]);
  u = settle(u);
  assert.equal(u.heroes[0].committed, false);
  // Shadow: return the attacking enemy after the attack.
  const v = base();
  const enemy = engaged(v, KD.shady);
  const c = attacking(v, enemy.id);
  H.shadow!(v, KD.unwanted);
  assert.equal(c.spReturn, true);
  play(v, ...H.attackFinished!(v, c));
  assert.ok(v.staging.some((x) => x.id === enemy.id));
});

test("Black Breath attaches to a hero its revealing player controls and reduces that hero's willpower, attack and defense to 0; limit 1 per hero", () => {
  let s = base();
  const aragorn = s.heroes[0];
  reveal(s, KD.breath, [KD.hills]);
  assert.match(s.choice!.title, /Black Breath · Attach to a hero you control/);
  s = choose(s, aragorn.id);
  s = settle(s);
  const hero = get(s, aragorn.id)!;
  assert.ok(hero.attachments.some((a) => a.code === KD.breath));
  assert.deepEqual(
    [stats(s, hero).will, stats(s, hero).attack, stats(s, hero).defense],
    [0, 0, 0],
  );
  assert.ok(!s.encounterDiscard.includes(KD.breath));
  reveal(s, KD.breath, [KD.hills]);
  assert.ok(!s.choice!.options.some((o) => o.id === aragorn.id), "limit 1");
});

test("Pale Blade: Surge; attaches to a Nazgûl enemy in play, which gets +1 attack and cannot take non-combat damage; limit 1 per enemy", () => {
  let s = base();
  const wraith = stage(s, KD.ringwraith);
  reveal(s, KD.blade, [KD.hills, KD.hills]);
  s = choose(s, wraith.id);
  s = settle(s);
  const armed = get(s, wraith.id)!;
  assert.ok(armed.attachments.some((a) => a.code === KD.blade));
  assert.equal(stats(s, armed).attack, 6);
  assert.equal(s.staging.filter((u) => u.code === KD.hills).length, 1, "Surge");
  play(s, fx("damage", { target: armed.id, value: 3, player: 0 }));
  assert.equal(get(s, armed.id)!.damage, 0, "no non-combat damage");
  // No Nazgûl in play: discarded, still surges.
  let t = base();
  reveal(t, KD.blade, [KD.hills, KD.hills]);
  t = settle(t);
  assert.ok(t.encounterDiscard.includes(KD.blade));
  assert.equal(t.staging.filter((u) => u.code === KD.hills).length, 1);
});

test("Power in their Terror: each ally gets −1 willpower until the end of the round and each ally with 0 willpower takes 2 damage; its shadow discards a non-objective attachment the defending player controls", () => {
  let s = base();
  const [guard, faramir] = allies(s, ["01013", "01014"]);
  reveal(s, KD.terror, [KD.hills]);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id), "Guard: 1 → 0, 2 damage");
  assert.equal(get(s, faramir.id)!.roundWill, -1);
  assert.equal(stats(s, get(s, faramir.id)!).will, 1);
  assert.equal(get(s, faramir.id)!.damage, 0);
  play(s, fx("nextRound", { player: 0 }));
  // The penalty lasts until the end of the round.
  const t = base();
  const [ally] = allies(t, ["01014"]);
  ally.roundWill = -1;
  const raw = JSON.parse(JSON.stringify(t));
  assert.ok(validateSave(raw), "round willpower is saved");
  // Shadow: the One Ring is an objective and cannot be chosen.
  const u = base();
  const aragorn = u.heroes[0];
  aragorn.attachments.push({ id: "axe-1", code: "01041", exhausted: false });
  const enemy = engaged(u, KD.shady);
  attacking(u, enemy.id);
  H.shadow!(u, KD.terror);
  run(u);
  assert.ok(!get(u, aragorn.id)!.attachments.some((a) => a.code === "01041"));
  assert.ok(oneRing(u), "The One Ring stays");
  assert.ok(u.discard.includes("01041"));
});

test("Shared Hunted and Ring cards work in A Knife in the Dark: Piercing Cry finds a Ringwraith, Lure of the Ring, Pathless Country", () => {
  let s = base();
  s.encounterDiscard = [KD.ringwraith];
  reveal(s, KD.cry, [KD.hills]);
  s = choose(s, "engaged");
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === KD.ringwraith));
  let t = base();
  reveal(t, KD.lure, [KD.hills]);
  t = choose(t, "exhaust");
  t = settle(t);
  assert.equal(oneRing(t)!.exhausted, true);
  const u = base();
  const p = stage(u, KD.pathless);
  assert.equal(H.locationQuestBonus!(u, p), 4);
});

test("Saves keep the set-aside cards and the enemies under Weather Hills; malformed state is rejected", () => {
  const s = base();
  const hills = stage(s, KD.hills);
  s.knifeDark!.hills = [{ location: hills.id, codes: [KD.shady] }];
  const raw = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(raw));
  for (const broken of [
    { setAside: ["01013"] },
    { setAside: Array(5).fill(KD.ringwraith) },
    { setAside: [KD.weathertop, KD.weathertop] },
    { hills: [{ location: hills.id, codes: [KD.hills] }] },
    { hills: [{ location: hills.id, codes: [] }] },
    { finale: true },
    { currentQuest: KD.wild },
    { advancing: "no" },
  ]) {
    const bad = JSON.parse(JSON.stringify(s));
    Object.assign(bad.knifeDark, broken);
    assert.equal(validateSave(bad), false, JSON.stringify(broken));
  }
});

test("The scenario panel's public state reports the Ringwraiths out of play, The Prancing Pony, Midgewater, Weathertop and the Nazgûl in play", () => {
  const s = base();
  stage(s, KD.pony);
  engaged(s, KD.rider);
  assert.deepEqual(knifeDarkPublicState(s), {
    currentQuest: KD.bree,
    ringwraithsAside: 4,
    witchKingAside: true,
    midgewater: "aside",
    weathertop: "aside",
    ponyInPlay: true,
    hidden: 0,
    nazgul: 1,
    finale: false,
    resolving: 0,
  });
});
