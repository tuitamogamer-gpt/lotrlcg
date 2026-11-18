import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  createGame,
  optionalEngagementProblem,
  publicState,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { engagementCost, fx, stats } from "../src/game/core";
import { check, damage, progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { forOwner, seatView } from "../src/game/table";
import {
  WOODLAND_REALM_HOOKS,
  WR,
  WR_SETS,
  WR_STAGE2,
  WR_STAGE3,
  woodlandRealmPublicState,
  wrCost,
  wrRecipe,
} from "../src/game/woodland-realm";
import { WOODLAND_REALM_ADVENTURES } from "../src/game/woodland-realm-scenario-data";
import {
  atQuest,
  base,
  choose,
  engaged,
  hand,
  mendor,
  reload,
  settle,
  stage,
  start,
  takeBox,
} from "./woodland-realm-fixtures";
import type { GameState } from "../src/game/types";

const H = WOODLAND_REALM_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** Check the quest stage after progress was placed. */
const advance = (s: GameState) => {
  check(s);
  flush(s);
  return s;
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
/** A new game, stopped at the first quick-build decision after the opening hands. */
function opening(players = 1, seed = 919) {
  let s = createGame(
    seed,
    STARTERS[0].cards,
    STARTERS[0].heroes,
    STARTERS[0].id,
    {
      scenarioId: "the-woodland-realm",
      ...(players > 1
        ? {
            seats: STARTERS.slice(0, players).map((d) => ({
              deckId: d.id,
              heroes: [...d.heroes],
            })),
          }
        : {}),
    },
  );
  for (let n = 0; !s.choice; n++) {
    assert.ok(n < 50);
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : { type: "KEEP" },
    );
  }
  return s;
}
const TEST_OF_WILL = "01050";

test("Setup: the first player builds the quest deck from Captured by Spiders and one stage 2 and one stage 3 card and the encounter deck from 7 of the 14 encounter sets; 1A adds Spider Den and one different 0 cost enemy or location per player", () => {
  const recipe = wrRecipe();
  assert.equal(recipe.id, "Q99.12");
  assert.equal(
    recipe.cards.reduce((n, c) => n + c.quantity, 0),
    78,
    "70 encounter cards in 14 sets of 5, Spider Den and the 7 quest cards",
  );
  assert.equal(WR_SETS.length, 14);
  assert.deepEqual(
    WR_SETS.map((x) => x.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
  for (const set of WR_SETS) {
    assert.equal(set.cards.length, 5, `set ${set.number} has 5 cards`);
    assert.equal(
      set.cards.reduce((n, c) => n + wrCost(c), 0),
      3,
      `set ${set.number} costs 3 in total`,
    );
  }
  // The first options: Lost in the Dark, The Forest of Great Fear, sets 1-7.
  const zeroNames = [
    "Abandoned Camp",
    "Black Forest Bats",
    "Dark Black Woods",
    "Forest Grove",
  ];
  for (const players of [1, 2, 3, 4]) {
    const s = start(players);
    const q = s.woodlandRealm!;
    assert.equal(q.building, null);
    assert.equal(q.currentQuest, WR.request);
    assert.equal(s.stage, 1);
    assert.equal(s.round, 1);
    assert.deepEqual(q.questDeck, [WR.dark, WR.fear]);
    assert.deepEqual(q.sets, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(q.defeated, []);
    assert.equal(
      s.staging.filter((u) => u.code === WR.den).length,
      1,
      "Spider Den is in the staging area",
    );
    const zero = s.staging.filter((u) => u.code !== WR.den);
    assert.deepEqual(
      zero.map((u) => card(u.code).name),
      zeroNames.slice(0, players),
      "one different 0 cost card per player",
    );
    for (const u of zero) {
      assert.equal(wrCost(u.code), 0);
      assert.ok(["enemy", "location"].includes(card(u.code).type_code));
    }
    // The encounter deck holds the 35 cards of the chosen sets; the box the rest.
    const chosen = WR_SETS.slice(0, 7).flatMap((x) => x.cards);
    assert.deepEqual(
      [...s.encounterDeck, ...zero.map((u) => u.code)].sort(),
      [...chosen].sort(),
    );
    assert.equal(q.box.length, 78 - 35 - 3 - 1);
    for (const c of [WR.path, WR.ambush, WR.halls, WR.escape])
      assert.ok(q.box.includes(c), card(c).back_name);
    assert.ok(!q.box.includes(WR.den));
    assert.equal(s.encounterDiscard.length, 0);
    const view = woodlandRealmPublicState(s)!;
    assert.deepEqual(
      {
        side: view.side,
        stage2: view.stage2,
        stage3: view.stage3,
        den: view.den,
        mendor: view.mendor,
        marked: view.marked,
        cap: view.cap,
        turned: view.turned,
      },
      {
        side: "1B",
        stage2: WR.dark,
        stage3: WR.fear,
        den: "staging",
        mendor: null,
        marked: null,
        cap: null,
        turned: 0,
      },
    );
    assert.deepEqual(publicState(s).woodlandRealm, view);
    reload(s);
  }
  assert.deepEqual(
    WOODLAND_REALM_ADVENTURES.map((a) => [
      a.id,
      a.stageCount,
      a.stages.map((x) => [x.stage, x.name, x.quest]),
    ]),
    [
      [
        "the-woodland-realm",
        3,
        [
          [1, "Captured by Spiders", 10],
          [2, "Lost in the Dark", 20],
          [2, '"Don\'t Leave the Path"', 20],
          [2, "Ambushed at Night", 20],
          [3, "The Forest of Great Fear", 15],
          [3, "To the Elvenking's Halls", 0],
          [3, "Escape from Taur-nu-Fuin", 20],
        ],
      ],
    ],
  );
});

test("The quick build: the first player chooses each card and set or lets them be chosen at random, deterministically by seed", () => {
  let s = opening(2);
  assert.match(
    s.choice!.title,
    /^The Woodland Realm · Choose the stage 2 quest card/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...WR_STAGE2, "random"],
  );
  assert.equal(woodlandRealmPublicState(s)!.building, true);
  s = choose(s, WR.ambush);
  assert.match(s.choice!.title, /Choose the stage 3 quest card/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...WR_STAGE3, "random"],
  );
  s = choose(s, WR.escape);
  assert.match(s.choice!.title, /Choose encounter set 1 of 7/);
  assert.equal(s.choice!.options.length, 15);
  assert.match(
    s.choice!.options.find((o) => o.id === "set:4")!.label,
    /^Set 4: Spiders of Mirkwood ×3, The Spiders' Ring, Caught in a Web$/,
  );
  s = choose(s, "set:14");
  s = choose(s, "set:4");
  assert.match(s.choice!.title, /Choose encounter set 3 of 7/);
  assert.ok(!s.choice!.options.some((o) => o.id === "set:14"));
  s = choose(s, "random");
  // 1A: the opposing team's search for each player.
  assert.match(
    s.choice!.title,
    /^Captured by Spiders · The opposing team adds a different 0 cost enemy or location/,
  );
  s = settle(s);
  const q = s.woodlandRealm!;
  assert.deepEqual(q.questDeck, [WR.ambush, WR.escape]);
  assert.equal(q.sets.length, 7);
  assert.ok(q.sets.includes(14) && q.sets.includes(4));
  assert.deepEqual(
    q.sets,
    [...q.sets].sort((a, b) => a - b),
  );
  assert.equal(s.encounterDeck.length + s.staging.length - 1, 35);
  // Random choices depend only on the seed.
  const random = (seed: number) => {
    let r = opening(1, seed);
    r = choose(r, "random");
    r = choose(r, "random");
    r = choose(r, "random");
    r = settle(r);
    return [...r.woodlandRealm!.questDeck, ...r.woodlandRealm!.sets];
  };
  assert.deepEqual(random(5), random(5));
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const [stage2, stage3, ...sets] = random(seed);
    assert.ok((WR_STAGE2 as readonly unknown[]).includes(stage2));
    assert.ok((WR_STAGE3 as readonly unknown[]).includes(stage3));
    assert.equal(new Set(sets).size, 7);
    seen.add(`${stage2}/${stage3}`);
  }
  assert.ok(seen.size > 1, "different seeds build different quest decks");
  reload(s);
});

test("Spider Den: immune to player card effects; its travel cost adds a 0 cost enemy (1 cost or less with two or more players) from the encounter deck or discard pile", () => {
  for (const [players, names] of [
    [1, ["Spiders of Mirkwood"]],
    [2, ["Giant Spider", "Spiders of Mirkwood"]],
  ] as const) {
    let s = base(players);
    takeBox(s, WR.den);
    const den = stage(s, WR.den);
    assert.equal(playerEffectImmune(s, den), true);
    s.encounterDiscard = [WR.spiders, WR.giant, WR.beast];
    s.encounterDeck = [WR.trail, WR.trail, WR.giant];
    s.phase = "travel";
    s = act(s, { type: "TRAVEL", id: den.id });
    assert.match(
      s.choice!.title,
      new RegExp(
        `^Spider Den · The opposing team adds an enemy with cost ${players === 1 ? 0 : 1} or less to the staging area`,
      ),
    );
    assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
      ...names,
    ]);
    const pick = s.choice!.options.at(-1)!.code!;
    s = choose(s, pick);
    s = settle(s);
    assert.equal(s.activeLocation?.code, WR.den);
    assert.ok(s.staging.some((u) => u.code === pick));
    assert.equal(
      s.encounterDeck.length + s.encounterDiscard.length,
      5,
      "one copy is taken from the deck or discard pile",
    );
    assert.ok(
      s.log.some((l) =>
        /^Spider Den: .* is added to the staging area/.test(l.text),
      ),
    );
    assert.equal(woodlandRealmPublicState(s)!.den, "active");
    reload(s);
  }
  // No enemy with a low enough cost: the deck is shuffled.
  let s = base();
  takeBox(s, WR.den);
  const den = stage(s, WR.den);
  s.encounterDiscard = [WR.pack];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: den.id });
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /Spider Den: there is no enemy with cost 0 or less/.test(l.text),
    ),
  );
  assert.equal(s.activeLocation?.code, WR.den);
  reload(s);
});

test("Captured by Spiders (1B): explored, Spider Den is flipped over and Mendor is put into play under the first player's control, ready; the stage cannot be defeated unless the first player controls Mendor", () => {
  let s = base(2);
  takeBox(s, WR.den);
  const den = stage(s, WR.den);
  assert.equal(H.stageInfo!(s)!.quest, 10);
  s.progress = 12;
  advance(s);
  assert.equal(s.stage, 1, "1B cannot be defeated without Mendor");
  s.progress = 0;
  s.staging = s.staging.filter((u) => u.id !== den.id);
  s.activeLocation = den;
  progress(s, 1);
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(
    !s.encounterDiscard.includes(WR.den),
    "Spider Den is not discarded",
  );
  const m = seatView(s, 0).allies.find((u) => u.code === WR.mendor)!;
  assert.ok(m, "Mendor is under the first player's control");
  assert.equal(m.exhausted, false);
  assert.equal(s.woodlandRealm!.mendorId, m.id);
  assert.equal(seatView(s, 1).allies.length, 0);
  assert.deepEqual(
    {
      den: woodlandRealmPublicState(s)!.den,
      mendor: woodlandRealmPublicState(s)!.mendor,
    },
    { den: "out", mendor: 0 },
  );
  assert.deepEqual(stats(s, m), { will: 2, attack: 2, defense: 2, health: 5 });
  assert.match(card(m.code).text ?? "", /^Ranged\. Sentinel\./);
  // Under the second player's control, 1B cannot be defeated.
  forOwner(s, 0, () => (s.allies = s.allies.filter((u) => u.id !== m.id)));
  forOwner(s, 1, () => s.allies.push(m));
  s.progress = 10;
  advance(s);
  assert.equal(s.stage, 1);
  forOwner(s, 1, () => (s.allies = s.allies.filter((u) => u.id !== m.id)));
  forOwner(s, 0, () => s.allies.push(m));
  advance(s);
  assert.equal(
    s.stage,
    2,
    "with the first player controlling Mendor, 1B is defeated",
  );
  assert.equal(s.stageRevealing, true);
  assert.match(
    s.choice!.title,
    /^A Chosen Path · The opposing team chooses a card with cost 2 or less from the top 5 encounter cards to reveal/,
  );
  reload(s);
});

test("Mendor: the first player gains control of it, and if it leaves play the players lose; a blank Mendor leaves play without that loss and returns to its Spider Den side", () => {
  // The first player token passes: Mendor follows it.
  let s = base(2);
  const m = mendor(s, 0);
  s.table!.first = 1;
  H.firstPlayerChanged!(s, true);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === m.id));
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === m.id));
  assert.equal(woodlandRealmPublicState(s)!.mendor, 1);
  assert.ok(
    s.log.some((l) => /The first player gains control of Mendor/.test(l.text)),
  );
  reload(s);
  // Destroyed: the players lose.
  s = base(2);
  const n = mendor(s, 0);
  damage(s, n.id, 5);
  flush(s);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason ?? "", /Mendor leaves play: the players lose the game/);
  // With a blank text box (Despair), it leaves play without the loss.
  s = base();
  const o = mendor(s, 0);
  s.woodlandRealm!.despairRound = s.round;
  check(s);
  assert.equal(stats(s, o).health, 5);
  damage(s, o.id, 5);
  flush(s);
  check(s);
  flush(s);
  assert.equal(s.status, "playing");
  assert.ok(
    s.encounterDiscard.includes(WR.den),
    "the card returns to its Spider Den side",
  );
  assert.ok(!s.encounterDiscard.includes(WR.mendor));
  reload(s);
  // The first player is eliminated with Mendor: the players lose.
  s = base(2);
  mendor(s, 0);
  forOwner(s, 0, () => (s.threat = 50));
  check(s);
  assert.equal(s.status, "lost");
  assert.match(
    s.reason ?? "",
    /Mendor leaves play with the eliminated player's cards/,
  );
});

test("A Chosen Path (2A) and On the Trail (3A): the opposing team reveals a card from the top 5 with the printed cost limit, whose 'when revealed' effects cannot be canceled", () => {
  // Ungoliant's Spawn (3), Beast (2), Giant Spider (1), Spiders of Mirkwood (0), Wild Bear (1), then Mirkwood Path.
  const top = [WR.spawn, WR.beast, WR.giant, WR.spiders, WR.bear, WR.trail];
  for (const [stageNumber, players, max] of [
    [2, 1, 1],
    [2, 2, 2],
    [3, 1, 2],
    [3, 2, 3],
  ] as const) {
    let s = base(players);
    mendor(s, 0);
    if (stageNumber === 3) {
      atQuest(s, WR.dark);
      s.woodlandRealm!.defeated = [WR.request];
    }
    s.encounterDeck = [...top];
    s.progress = stageNumber === 2 ? 10 : 20;
    advance(s);
    assert.equal(s.stage, stageNumber);
    assert.equal(woodlandRealmPublicState(s)!.side, `${stageNumber}A`);
    assert.match(
      s.choice!.title,
      new RegExp(
        `^${stageNumber === 2 ? "A Chosen Path" : "On the Trail"} · The opposing team chooses a card with cost ${max} or less from the top 5 encounter cards to reveal`,
      ),
    );
    assert.equal(
      s.choice!.options.some((o) => o.code === WR.spawn),
      max === 3,
    );
    assert.equal(
      s.choice!.options.some((o) => o.code === WR.beast),
      max >= 2,
    );
    assert.ok(!s.choice!.options.some((o) => o.code === WR.trail));
    s = choose(s, WR.giant);
    s = settle(s);
    assert.ok(
      s.staging.some((u) => u.code === WR.giant) ||
        s.engaged.some((u) => u.code === WR.giant),
    );
    assert.equal(s.woodlandRealm!.noCancel, null);
    reload(s);
  }
  // Its 'when revealed' effects cannot be canceled while it is revealed.
  const q = base().woodlandRealm!;
  assert.equal(
    H.cannotCancel!(
      Object.assign(base(), { woodlandRealm: { ...q, noCancel: WR.gloom } }),
      false,
      WR.gloom,
    ),
    true,
  );
});

test("A Chosen Path (2B): after characters are committed, no more than 5 progress can be placed on the stage this round, 10 if Mendor is committed", () => {
  for (const withMendor of [false, true]) {
    let s = base();
    const m = mendor(s, 0);
    atQuest(s, WR.path);
    s.woodlandRealm!.defeated = [WR.request];
    s.encounterDeck = Array(10).fill(WR.trail);
    s.phase = "quest";
    s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
    if (withMendor) s = act(s, { type: "TOGGLE_QUEST", id: m.id });
    s = act(s, { type: "COMMIT" });
    s = settle(s);
    const limit = withMendor ? 10 : 5;
    assert.deepEqual(s.woodlandRealm!.cap, {
      round: s.round,
      limit,
      placed: 0,
    });
    assert.ok(
      s.log.some((l) =>
        new RegExp(
          `no more than ${limit} progress can be placed on the stage this round`,
        ).test(l.text),
      ),
    );
    progress(s, 3);
    assert.equal(s.progress, 3);
    assert.equal(woodlandRealmPublicState(s)!.cap, limit - 3);
    progress(s, 12);
    assert.equal(s.progress, limit, "the excess progress is not placed");
    assert.equal(woodlandRealmPublicState(s)!.cap, 0);
    // The next round, the cap is gone until the next commit.
    s.round++;
    progress(s, 2);
    assert.equal(s.progress, limit + 2);
    assert.equal(woodlandRealmPublicState(s)!.cap, null);
    reload(s);
  }
});

test("Lost in the Dark (2B): the first treachery revealed each round gains Doomed 1 and its 'when revealed' effects cannot be canceled", () => {
  // The third seat plays the spirit deck: A Test of Will and Eleanor.
  let s = base(3);
  mendor(s, 0);
  atQuest(s, WR.dark);
  s.woodlandRealm!.defeated = [WR.request];
  hand(s, [TEST_OF_WILL], 2);
  s.encounterDeck = [WR.gloom, WR.gloom, WR.trail];
  s.phase = "staging";
  const cancels = (x: GameState) =>
    (x.choice?.options ?? []).filter((o) =>
      [TEST_OF_WILL, "01008"].includes(o.code ?? ""),
    ).length;
  run(s, fx("reveal"));
  assert.equal(cancels(s), 0, "neither A Test of Will nor Eleanor is offered");
  s = settle(s, "skip");
  // Doomed 1 and Gathering Gloom's own X = 3 (stage 2 + 1) for each player.
  assert.deepEqual(threats(s), [24, 24, 24]);
  assert.ok(seatView(s, 2).hand.some((u) => u.code === TEST_OF_WILL));
  // The second treachery this round is an ordinary reveal: it may be canceled.
  run(s, fx("reveal"));
  assert.ok(cancels(s) > 0, "the second treachery can be canceled");
  s = settle(s, "skip");
  assert.deepEqual(
    threats(s),
    [27, 27, 27],
    "no Doomed for the second treachery",
  );
  // The next round, the first treachery is doomed again.
  s.round++;
  s.encounterDeck = [WR.gloom];
  s.encounterDiscard = s.encounterDiscard.filter((c) => c !== WR.gloom);
  run(s, fx("reveal"));
  s = settle(s, "skip");
  assert.deepEqual(threats(s), [31, 31, 31]);
  assert.equal(H.revealedDoomed!(s, WR.trail, "encounter"), 0);
  reload(s);
});

test('"Don\'t Leave the Path" (2B): progress cannot be placed on locations in the staging area, and in the travel phase the players must travel to a location, if able', () => {
  let s = base();
  mendor(s, 0);
  atQuest(s, WR.path);
  s.woodlandRealm!.defeated = [WR.request];
  const trail = stage(s, WR.trail);
  assert.equal(H.locationProgressBlocked!(s, trail), true);
  s.phase = "travel";
  assert.equal(H.mustTravel!(s), true);
  assert.throws(
    () => act(s, { type: "NEXT" }),
    /You must travel to the mandatory location, if able/,
  );
  s = act(s, { type: "TRAVEL", id: trail.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, trail.id);
  assert.equal(H.mustTravel!(s), false, "an active location: no travel");
  assert.equal(H.locationProgressBlocked!(s, trail), false);
  // With no location in the staging area the players may pass.
  const t = base();
  atQuest(t, WR.path);
  t.phase = "travel";
  assert.equal(H.mustTravel!(t), false);
  reload(s);
});

test("Ambushed at Night (2B): each enemy in the staging area gets -10 engagement cost, cannot be optionally engaged and cannot take damage", () => {
  const s = base();
  mendor(s, 0);
  atQuest(s, WR.ambush);
  s.woodlandRealm!.defeated = [WR.request];
  const bear = stage(s, WR.bear);
  assert.equal(engagementCost(s, bear), 33 - 10);
  assert.equal(H.engagementBonus!(s, bear), -10);
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, bear));
  assert.equal(H.damageAmount!(s, bear, 3, { combatDamage: false }), 0);
  // Engaged, it takes damage normally.
  const spider = engaged(s, WR.giant);
  assert.equal(H.damageAmount!(s, spider, 3, { combatDamage: true }), 3);
  assert.equal(H.engagementBonus!(s, spider), 0);
  reload(s);
});

test("The Forest of Great Fear (3B): the opposing team adds an enemy and places a resource on an enemy with cost 2 or higher, which gets +2 attack and +2 defense, is immune to player card effects and must leave play before the stage is defeated; then the players win", () => {
  let s = base(2);
  mendor(s, 0);
  atQuest(s, WR.dark);
  s.woodlandRealm!.defeated = [WR.request];
  s.encounterDeck = Array(6).fill(WR.trail);
  s.encounterDiscard = [WR.beast, WR.spiders];
  engaged(s, WR.pack, 1);
  s.progress = 20;
  advance(s);
  s = choose(s, WR.trail);
  assert.match(
    s.choice!.title,
    /^The Forest of Great Fear · The opposing team adds an enemy to the staging area/,
  );
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Beast of Taur-nu-Fuin",
    "Spiders of Mirkwood",
  ]);
  s = choose(s, WR.beast);
  assert.match(
    s.choice!.title,
    /^The Forest of Great Fear · The opposing team places a resource on an enemy in play with cost 2 or higher/,
  );
  // Pack of Wargs costs 1; Beast of Taur-nu-Fuin costs 2.
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Beast of Taur-nu-Fuin"],
  );
  s = choose(s, s.staging.find((u) => u.code === WR.beast)!.id);
  s = settle(s);
  const beast = s.staging.find((u) => u.code === WR.beast)!;
  const pack = seatView(s, 1).engaged.find((u) => u.code === WR.pack)!;
  assert.equal(beast.resources, 1);
  assert.equal(s.woodlandRealm!.markedId, beast.id);
  assert.equal(stats(s, beast).attack, 3 + 2);
  assert.equal(stats(s, beast).defense, 1 + 2);
  assert.equal(H.immune!(s, beast), true);
  assert.equal(stats(s, pack).attack, 4);
  assert.equal(woodlandRealmPublicState(s)!.marked, WR.beast);
  // It cannot be defeated while the enemy with a resource is in play.
  assert.equal(H.stageInfo!(s)!.quest, 15);
  s.progress = 15;
  advance(s);
  assert.equal(s.status, "playing");
  s.staging = s.staging.filter((u) => u.id !== beast.id);
  s.encounterDiscard.push(beast.code);
  advance(s);
  assert.equal(s.status, "won");
  assert.match(
    s.reason ?? "",
    /Mendor leads the players into the Elvenking's halls/,
  );
  reload(s);
});

test("To the Elvenking's Halls (3B): X is the highest threat; each player's threat cannot be reduced by more than 1 each round; 10 or more progress placed in a quest phase reveal the top encounter card", () => {
  let s = base(2);
  mendor(s, 0);
  atQuest(s, WR.halls);
  s.woodlandRealm!.defeated = [WR.request, WR.dark];
  forOwner(s, 1, () => (s.threat = 31));
  assert.equal(H.stageInfo!(s)!.quest, 31);
  // Threat reduction: at most 1 per player each round.
  forOwner(s, 0, () => reduceThreat(s, 3));
  forOwner(s, 0, () => reduceThreat(s, 2));
  forOwner(s, 1, () => reduceThreat(s, 2));
  assert.deepEqual(threats(s), [19, 30]);
  s.round++;
  forOwner(s, 0, () => reduceThreat(s, 4));
  assert.deepEqual(threats(s), [18, 30]);
  assert.equal(H.stageInfo!(s)!.quest, 30);
  // 10 progress in the quest phase: the top card is revealed after the quest succeeds.
  s.encounterDeck = [WR.trail, WR.trail];
  s.phase = "staging";
  progress(s, 10);
  H.successfulQuestProgress!(s, 10);
  flush(s);
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /To the Elvenking's Halls: 10 or more progress were placed this phase/.test(
        l.text,
      ),
    ),
  );
  assert.equal(s.staging.filter((u) => u.code === WR.trail).length, 1);
  // 9 progress: no reveal.
  const t = base();
  atQuest(t, WR.halls);
  t.phase = "staging";
  progress(t, 9);
  H.successfulQuestProgress!(t, 9);
  assert.equal(t.queue.length, 0);
  // Defeated, the players win.
  s.progress = 30;
  advance(s);
  assert.equal(s.status, "won");
  reload(s);
});

test("Escape from Taur-nu-Fuin (3B): at the beginning of the quest phase cards are discarded from the encounter deck until a location, which is added to the staging area", () => {
  let s = base();
  mendor(s, 0);
  atQuest(s, WR.escape);
  s.woodlandRealm!.defeated = [WR.request, WR.dark];
  s.encounterDeck = [WR.gloom, WR.spiders, WR.grove, WR.trail];
  s = run(s, ...H.questBegin!(s));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === WR.grove));
  assert.deepEqual(s.encounterDiscard, [WR.gloom, WR.spiders]);
  assert.deepEqual(s.encounterDeck, [WR.trail]);
  // An empty deck: the discard pile is shuffled back once.
  s.encounterDeck = [WR.gloom];
  s.encounterDiscard = [WR.road];
  s = run(s, ...H.questBegin!(s));
  assert.ok(s.staging.some((u) => u.code === WR.road));
  assert.ok(s.log.some((l) => /shuffled back into its deck/.test(l.text)));
  // No location at all.
  s.encounterDeck = [WR.gloom];
  s.encounterDiscard = [WR.spiders];
  s = run(s, ...H.questBegin!(s));
  assert.ok(
    s.log.some((l) =>
      /Escape from Taur-nu-Fuin: there is no location/.test(l.text),
    ),
  );
  // Defeated, the players win.
  s.progress = 20;
  advance(s);
  assert.equal(s.status, "won");
  reload(s);
});

test("Turned Around: 5 progress are removed and it attaches to the main quest, which gets +5 quest points", () => {
  let s = base();
  mendor(s, 0);
  atQuest(s, WR.fear);
  s.progress = 7;
  s.encounterDeck = [WR.turned];
  s.phase = "staging";
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(s.progress, 2);
  assert.equal(H.stageInfo!(s)!.quest, 15 + 5);
  assert.equal(woodlandRealmPublicState(s)!.turned, 1);
  assert.deepEqual(
    (s.questAttachments?.[WR.fear] ?? []).map((a) => a.code),
    [WR.turned],
  );
  reload(s);
});
