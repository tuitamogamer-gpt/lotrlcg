import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  createGame,
  optionalEngagementProblem,
  publicState,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { engagementCost, fx, get, stats, threatOf } from "../src/game/core";
import { check, damage, progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { forOwner, seatView } from "../src/game/table";
import {
  WIZARDS_QUEST_HOOKS,
  WQ,
  WQ_SETS,
  WQ_STAGE2,
  WQ_STAGE3,
  wizardsQuestPublicState,
  wqCost,
  wqRecipe,
} from "../src/game/wizards-quest";
import { WIZARDS_QUEST_ADVENTURES } from "../src/game/wizards-quest-scenario-data";
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
  start,
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
/** Check the quest stage after progress was placed. */
const advance = (s: GameState) => {
  check(s);
  flush(s);
  return s;
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
/** Take a card out of the box (it is put into play by the test). */
const fromBox = (s: GameState, code: string) => {
  const box = s.wizardsQuest!.box;
  const i = box.indexOf(code);
  assert.ok(i >= 0, `${card(code).name} is in the box`);
  box.splice(i, 1);
};
/** A new game, stopped at the first quick-build decision after the opening hands. */
function opening(players = 1, seed = 919) {
  let s = createGame(
    seed,
    STARTERS[0].cards,
    STARTERS[0].heroes,
    STARTERS[0].id,
    {
      scenarioId: "the-wizards-quest",
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
const GUARD = "01013",
  SNOWBOURN = "01016",
  ARCHER = "01017",
  AXEHAND = "01028";

test("Setup: the first player builds the quest deck from Radagast's Request and one stage 2 and one stage 3 card and the encounter deck from 7 of the 14 encounter sets; 1A adds Rhosgobel and one different 0 cost enemy or location per player", () => {
  const recipe = wqRecipe();
  assert.equal(recipe.id, "Q99.11");
  assert.equal(
    recipe.cards.reduce((n, c) => n + c.quantity, 0),
    78,
    "70 encounter cards in 14 sets of 5, Rhosgobel and the 7 quest cards",
  );
  assert.equal(WQ_SETS.length, 14);
  assert.deepEqual(
    WQ_SETS.map((x) => x.number),
    [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
  );
  for (const set of WQ_SETS) {
    assert.equal(set.cards.length, 5, `set ${set.number} has 5 cards`);
    assert.equal(
      set.cards.reduce((n, c) => n + wqCost(c), 0),
      3,
      `set ${set.number} costs 3 in total`,
    );
  }
  // The first options: A Fork in the Road, The Tower of Sorcery, sets 15-21.
  for (const players of [1, 2, 3, 4]) {
    const s = start(players);
    const q = s.wizardsQuest!;
    assert.equal(q.building, null);
    assert.equal(q.currentQuest, WQ.request);
    assert.equal(s.stage, 1);
    assert.equal(s.round, 1);
    assert.deepEqual(q.questDeck, [WQ.fork, WQ.sorcery]);
    assert.deepEqual(q.sets, [15, 16, 17, 18, 19, 20, 21]);
    assert.deepEqual(q.defeated, []);
    assert.equal(
      s.staging.filter((u) => u.code === WQ.rhosgobel).length,
      1,
      "Rhosgobel is in the staging area",
    );
    const zero = s.staging.filter((u) => u.code !== WQ.rhosgobel);
    assert.equal(zero.length, players, "one 0 cost card per player");
    assert.equal(new Set(zero.map((u) => card(u.code).name)).size, players);
    for (const u of zero) {
      assert.equal(wqCost(u.code), 0);
      assert.ok(["enemy", "location"].includes(card(u.code).type_code));
    }
    // The encounter deck holds the 35 cards of the chosen sets; the box the rest.
    const chosen = WQ_SETS.slice(0, 7).flatMap((x) => x.cards);
    assert.deepEqual(
      [...s.encounterDeck, ...zero.map((u) => u.code)].sort(),
      [...chosen].sort(),
    );
    assert.equal(q.box.length, 78 - 35 - 3 - 1);
    for (const c of [WQ.carried, WQ.terror, WQ.dungeons, WQ.return])
      assert.ok(q.box.includes(c), card(c).back_name);
    assert.equal(s.encounterDiscard.length, 0);
    const view = wizardsQuestPublicState(s)!;
    assert.deepEqual(
      {
        side: view.side,
        stage2: view.stage2,
        stage3: view.stage3,
        rhosgobel: view.rhosgobel,
        rider: view.rider,
      },
      {
        side: "1B",
        stage2: WQ.fork,
        stage3: WQ.sorcery,
        rhosgobel: "staging",
        rider: "out",
      },
    );
    assert.deepEqual(publicState(s).wizardsQuest, view);
    reload(s);
  }
  assert.deepEqual(
    WIZARDS_QUEST_ADVENTURES.map((a) => [
      a.id,
      a.stages.map((x) => [x.name, x.quest]),
    ]),
    [
      [
        "the-wizards-quest",
        [
          ["Radagast's Request", 10],
          ["A Fork in the Road", 5],
          ["Carried Away", 20],
          ["A New Terror Abroad", 5],
          ["The Tower of Sorcery", 20],
          ["Dungeons of the Necromancer", 15],
          ["Return to Rhosgobel", 10],
        ],
      ],
    ],
  );
});

test("The quick build: the first player chooses each card and set or lets them be chosen at random, deterministically by seed", () => {
  let s = opening(2);
  assert.match(
    s.choice!.title,
    /^The Wizard's Quest · Choose the stage 2 quest card/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...WQ_STAGE2, "random"],
  );
  assert.equal(wizardsQuestPublicState(s)!.building, true);
  s = choose(s, WQ.terror);
  assert.match(s.choice!.title, /Choose the stage 3 quest card/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...WQ_STAGE3, "random"],
  );
  s = choose(s, WQ.return);
  assert.match(s.choice!.title, /Choose encounter set 1 of 7/);
  assert.equal(s.choice!.options.length, 15);
  assert.match(
    s.choice!.options.find((o) => o.id === "set:28")!.label,
    /^Set 28: Howling Warg ×3, The Wargs' Glade, Weighed Down$/,
  );
  s = choose(s, "set:28");
  s = choose(s, "set:22");
  assert.match(s.choice!.title, /Choose encounter set 3 of 7/);
  assert.ok(!s.choice!.options.some((o) => o.id === "set:28"));
  s = choose(s, "random");
  // 1A: the opposing team's search for each player.
  assert.match(
    s.choice!.title,
    /^Radagast's Request · The opposing team adds a different 0 cost enemy or location/,
  );
  s = settle(s);
  const q = s.wizardsQuest!;
  assert.deepEqual(q.questDeck, [WQ.terror, WQ.return]);
  assert.equal(q.sets.length, 7);
  assert.ok(q.sets.includes(28) && q.sets.includes(22));
  assert.deepEqual(
    q.sets,
    [...q.sets].sort((a, b) => a - b),
  );
  assert.equal(new Set(q.sets).size, 7);
  assert.equal(s.encounterDeck.length + s.staging.length - 1, 35);
  // Random choices depend only on the seed.
  const random = (seed: number) => {
    let r = opening(1, seed);
    r = choose(r, "random");
    r = choose(r, "random");
    r = choose(r, "random");
    r = settle(r);
    return [...r.wizardsQuest!.questDeck, ...r.wizardsQuest!.sets];
  };
  assert.deepEqual(random(5), random(5));
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const [stage2, stage3, ...sets] = random(seed);
    assert.ok((WQ_STAGE2 as readonly unknown[]).includes(stage2));
    assert.ok((WQ_STAGE3 as readonly unknown[]).includes(stage3));
    assert.equal(new Set(sets).size, 7);
    seen.add(`${stage2}/${stage3}`);
  }
  assert.ok(seen.size > 1, "different seeds build different quest decks");
  reload(s);
});

test("Radagast's Request (1B): it cannot be defeated while Rhosgobel is in play; after the players travel there each hero gains a resource and each player draws a card; explored, Rhosgobel is flipped over to Rider of Mirkwood", () => {
  let s = base(2);
  fromBox(s, WQ.rhosgobel);
  const rhosgobel = stage(s, WQ.rhosgobel);
  assert.equal(playerEffectImmune(s, rhosgobel), true);
  assert.equal(H.stageInfo!(s)!.quest, 10);
  s.progress = 12;
  advance(s);
  assert.equal(s.stage, 1, "1B cannot be defeated while Rhosgobel is in play");
  s.progress = 0;
  for (const p of [0, 1]) deck(s, [GUARD, GUARD], p);
  const resources = () => s.heroes.map((h) => h.resources);
  const before = resources();
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: rhosgobel.id });
  assert.match(
    s.choice!.title,
    /^Rhosgobel · Response: each hero gains 1 resource and each player draws 1 card\?/,
  );
  s = choose(s, "use");
  s = settle(s);
  assert.equal(s.activeLocation?.code, WQ.rhosgobel);
  assert.deepEqual(
    resources(),
    before.map((n) => n + 1),
  );
  for (const p of [0, 1]) {
    assert.equal(seatView(s, p).hand.length, 1, `player ${p} draws a card`);
    assert.ok(seatView(s, p).heroes.every((h) => h.resources === 11));
  }
  // Still in play as the active location.
  s.progress = 12;
  advance(s);
  assert.equal(s.stage, 1);
  assert.equal(wizardsQuestPublicState(s)!.rhosgobel, "active");
  // Explored: Rhosgobel is flipped over and Rider of Mirkwood is staged.
  s.progress = 0;
  progress(s, 1);
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  const rider = s.staging.find((u) => u.code === WQ.rider)!;
  assert.ok(rider, "Rider of Mirkwood is in the staging area");
  assert.ok(!s.encounterDiscard.includes(WQ.rhosgobel));
  assert.equal(wizardsQuestPublicState(s)!.rider, "staging");
  assert.equal(wizardsQuestPublicState(s)!.rhosgobel, "out");
  // Rider of Mirkwood: immune, X = stage + 1, cannot leave before 3B.
  assert.equal(playerEffectImmune(s, rider), true);
  assert.equal(threatOf(s, rider), 2);
  assert.equal(stats(s, rider).attack, 6);
  assert.equal(H.cannotEngage!(s, rider), true);
  assert.equal(H.cannotLeave!(s, rider, false), true);
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, rider));
  // 10 progress now defeat 1B.
  s.phase = "planning";
  s.progress = 10;
  advance(s);
  assert.equal(s.stage, 2);
  assert.deepEqual(s.wizardsQuest!.defeated, [WQ.request]);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.code === WQ.rider)!,
    ),
    3,
  );
  reload(s);
});

test("Mirkwood Forest (2A) and The Necromancer's Tower (3A): the opposing team reveals a card from the top 5 with the printed cost limit, whose 'when revealed' effects cannot be canceled", () => {
  // Nazgûl (3), Spider (2), Patch of Midnight (1), Forest Gate (0), Hill Troll (1), then Eastern Crows (0).
  const top = [WQ.nazgul, WQ.spider, WQ.patch, WQ.gate, WQ.troll, WQ.crows];
  const offered = (s: GameState) =>
    s.choice!.options.map((o) => card(o.code!).name).sort();
  for (const [players, names] of [
    [1, ["Forest Gate", "Hill Troll", "Patch of Midnight"]],
    [
      2,
      [
        "Forest Gate",
        "Hill Troll",
        "Patch of Midnight",
        "Spider of Dol Guldur",
      ],
    ],
  ] as const) {
    let s = base(players);
    s.encounterDeck = [...top];
    s.progress = 10;
    advance(s);
    assert.equal(s.stage, 2);
    assert.equal(s.stageRevealing, true, "2A is in play");
    assert.equal(wizardsQuestPublicState(s)!.side, "2A");
    assert.match(
      s.choice!.title,
      new RegExp(
        `^Mirkwood Forest · The opposing team chooses a card with cost ${players === 1 ? 1 : 2} or less from the top 5 encounter cards to reveal`,
      ),
    );
    assert.deepEqual(offered(s), [...names]);
    s = choose(s, WQ.patch);
    // While it is revealed its 'when revealed' effects cannot be canceled.
    assert.equal(s.wizardsQuest!.noCancel, null);
    assert.ok(s.staging.some((u) => u.code === WQ.patch));
    assert.equal(s.encounterDeck.length, 5);
    assert.ok(!s.encounterDeck.includes(WQ.patch));
    // Then 2B: A Fork in the Road's search.
    assert.equal(s.stageRevealing, false);
    assert.match(s.choice!.title, /^A Fork in the Road · /);
    reload(s);
  }
  // Eleanor could cancel a treachery revealed by the encounter deck, but not
  // the one 2A reveals.
  let e = base(3);
  e.encounterDeck = [WQ.eyes, WQ.gate, WQ.gate, WQ.gate, WQ.gate, WQ.gate];
  e.progress = 10;
  advance(e);
  e = choose(e, WQ.eyes);
  assert.doesNotMatch(e.choice?.title ?? "", /^Revealed:/);
  assert.ok(e.log.some((l) => /Revealed Eyes in the Dark/.test(l.text)));
  assert.ok(e.encounterDiscard.includes(WQ.eyes));
  e = base(3);
  e.encounterDeck = [WQ.eyes];
  run(e, fx("reveal"));
  assert.match(e.choice!.title, /^Revealed: Eyes in the Dark/);
  assert.equal(
    H.cannotCancel!(
      Object.assign(base(), {
        wizardsQuest: { ...base().wizardsQuest!, noCancel: WQ.reach },
      }),
      false,
      WQ.reach,
    ),
    true,
  );
  // 3A: cost 2 or less, 3 or less with two or more players.
  for (const [players, max] of [
    [1, 2],
    [2, 3],
  ] as const) {
    let s = base(players);
    atQuest(s, WQ.fork);
    s.wizardsQuest!.defeated = [WQ.request];
    s.encounterDeck = [...top];
    s.progress = 5;
    advance(s);
    assert.equal(s.stage, 3);
    assert.match(
      s.choice!.title,
      new RegExp(
        `^The Necromancer's Tower · The opposing team chooses a card with cost ${max} or less`,
      ),
    );
    assert.equal(
      s.choice!.options.some((o) => o.code === WQ.nazgul),
      max === 3,
    );
    assert.ok(!s.choice!.options.some((o) => o.code === WQ.crows));
    reload(s);
  }
  // No card with a low enough cost: the deck is shuffled and nothing is revealed.
  let s = base();
  s.encounterDeck = [
    WQ.nazgul,
    WQ.nazgul,
    WQ.bane,
    WQ.bane,
    WQ.spider,
    WQ.gate,
  ];
  s.progress = 10;
  advance(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.ok(
    s.log.some((l) =>
      /no card with cost 1 or less among the top 5 encounter cards/.test(
        l.text,
      ),
    ),
  );
  assert.equal(s.encounterDeck.length + s.staging.length, 6);
  reload(s);
});

test("A Fork in the Road (2B): a location with cost 2 or less from the deck or discard pile gets a resource; it is immune to player card effects, cannot be traveled to while the stage has quest points left, and must leave play before the stage is defeated", () => {
  let s = base(2);
  s.encounterDeck = [WQ.gate, WQ.gate, WQ.gate, WQ.gate, WQ.gate, WQ.troll];
  s.encounterDiscard = [WQ.tower, WQ.hall];
  s.progress = 10;
  advance(s);
  s = choose(s, WQ.gate);
  assert.match(
    s.choice!.title,
    /^A Fork in the Road · The opposing team adds a location with cost 2 or less to the staging area/,
  );
  // The Sorcerer's Tower (2) from the discard pile; Twilight Hall costs 3.
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Forest Gate",
    "The Sorcerer's Tower",
  ]);
  s = choose(s, WQ.tower);
  s = settle(s);
  const q = s.wizardsQuest!;
  const fork = s.staging.find((u) => u.code === WQ.tower)!;
  assert.equal(fork.resources, 1);
  assert.equal(q.forkId, fork.id);
  assert.deepEqual(s.encounterDiscard, [WQ.hall]);
  assert.equal(H.immune!(s, fork), true);
  s.phase = "travel";
  assert.match(
    canTravel(s, fork) ?? "",
    /cannot travel there while the stage has quest points remaining/,
  );
  // 5 progress do not defeat it while the location is in play.
  s.progress = 5;
  advance(s);
  assert.equal(s.stage, 2);
  assert.equal(canTravel(s, fork), null);
  s = act(s, { type: "TRAVEL", id: fork.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, fork.id);
  // Explored (4 quest points), the stage can be defeated.
  progress(s, 4);
  flush(s);
  s = settle(s);
  advance(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.deepEqual(s.wizardsQuest!.defeated, [WQ.request, WQ.fork]);
  reload(s);
});

test("Carried Away (2B): the opposing team guards an ally of each player under the stage; allies with those titles cannot be played or put into play, and they return to their owners' hands when the stage is defeated", () => {
  let s = base(2);
  s.wizardsQuest!.questDeck = [WQ.carried, WQ.sorcery];
  const q = () => s.wizardsQuest!;
  const [guard] = allies(s, [GUARD, SNOWBOURN], 0);
  const [archer] = allies(s, [ARCHER], 1);
  guard.damage = 1;
  guard.resources = 2;
  s.progress = 10;
  advance(s);
  s = choose(s, WQ.gate);
  assert.match(
    s.choice!.title,
    /^Carried Away · The opposing team chooses an ally of Aragorn & Théodred & Glóin to guard under the stage/,
  );
  assert.equal(s.choice!.options.length, 2);
  s = choose(s, guard.id);
  assert.match(s.choice!.title, /an ally of Gimli & Legolas & Thalin/);
  s = choose(s, archer.id);
  s = settle(s);
  assert.equal(H.stageInfo!(s)!.quest, 20);
  assert.equal(q().carried.length, 2);
  assert.deepEqual(
    seatView(s, 0).allies.map((u) => u.code),
    [SNOWBOURN],
  );
  assert.equal(seatView(s, 1).allies.length, 0);
  const held = q().carried.find((x) => x.ally.code === GUARD)!.ally;
  assert.equal(held.damage, 0, "a guarded objective keeps no tokens");
  assert.equal(held.resources, 0);
  assert.equal(wizardsQuestPublicState(s)!.carried, 2);
  // Allies sharing a title cannot be played or put into play.
  assert.match(H.playProblem!(s, GUARD)!, /Carried Away/);
  assert.match(H.allyEntryProblem!(s, ARCHER)!, /Carried Away/);
  assert.equal(H.playProblem!(s, SNOWBOURN), null);
  // Defeated: each guarded ally returns to its owner's hand.
  s.progress = 20;
  advance(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(q().carried.length, 0);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === GUARD));
  assert.ok(seatView(s, 1).hand.some((u) => u.code === ARCHER));
  assert.equal(H.playProblem!(s, GUARD), null);
  reload(s);
});

test("A New Terror Abroad (2B): 5 quest points plus 5 per player; at the beginning of the quest phase Rider of Mirkwood makes an immediate attack against the first player", () => {
  for (const players of [1, 3]) {
    const s = base(players);
    atQuest(s, WQ.terror);
    assert.equal(H.stageInfo!(s)!.quest, 5 + 5 * players);
  }
  let s = base(2);
  atQuest(s, WQ.terror);
  fromBox(s, WQ.rhosgobel);
  const rider = stage(s, WQ.rider);
  assert.equal(threatOf(s, rider), 3);
  const [guard] = allies(s, [GUARD], 0);
  // Each player ends the planning phase.
  while (s.phase === "planning" && !s.choice) s = act(s, { type: "NEXT" });
  assert.equal(s.phase, "quest");
  assert.match(s.choice?.title ?? "", /^Rider of Mirkwood · Immediate attack/);
  s = choose(s, guard.id);
  s = settle(s);
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === guard.id));
  assert.ok(
    s.log.some((l) =>
      /A New Terror Abroad: Rider of Mirkwood makes an immediate attack against the first player/.test(
        l.text,
      ),
    ),
  );
  // It stays in the staging area: it cannot leave before 3B.
  assert.ok(s.staging.some((u) => u.id === rider.id));
  // Without Rider of Mirkwood in play nothing happens.
  s = base();
  atQuest(s, WQ.terror);
  assert.deepEqual(H.questBegin!(s), []);
  reload(s);
});

test("The Tower of Sorcery (3B): after the players commit characters, the encounter deck is discarded until a treachery, which is revealed; defeating the stage wins the game", () => {
  let s = base();
  atQuest(s, WQ.sorcery);
  s.wizardsQuest!.defeated = [WQ.request, WQ.fork];
  s.encounterDeck = [WQ.gate, WQ.troll, WQ.reach, WQ.gate, WQ.gate];
  s.phase = "quest";
  s.heroes[0].exhausted = false;
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /The Tower of Sorcery: The Necromancer's Reach is discarded from the encounter deck and revealed/.test(
        l.text,
      ),
    ),
  );
  assert.ok(s.encounterDiscard.includes(WQ.gate));
  assert.ok(s.encounterDiscard.includes(WQ.troll));
  assert.ok(s.encounterDiscard.includes(WQ.reach));
  // The Necromancer's Reach dealt 1 damage to the exhausted (questing) hero.
  assert.equal(s.heroes[0].damage, 1);
  s = base();
  atQuest(s, WQ.sorcery);
  s.progress = 20;
  advance(s);
  assert.equal(s.status, "won");
  assert.match(
    s.reason ?? "",
    /return from Dol Guldur with news for Rhosgobel/,
  );
  reload(s);
});

test("Dungeons of the Necromancer (3B): the discard pile is shuffled into the deck and each player's hero is guarded by the first enemy discarded; an unguarded hero returns exhausted, and the stage cannot be defeated while a hero is guarded", () => {
  let s = base(2);
  const q = () => s.wizardsQuest!;
  q().questDeck = [WQ.dungeons];
  atQuest(s, WQ.carried);
  q().defeated = [WQ.request];
  s.encounterDeck = Array(10).fill(WQ.gate);
  s.encounterDiscard = [WQ.troll, WQ.crows];
  s.progress = 20;
  advance(s);
  s = choose(s, WQ.gate);
  assert.match(
    s.choice!.title,
    /^Dungeons of the Necromancer · Attach a hero you control to (Hill Troll|Eastern Crows) as a guarded objective/,
  );
  const [hero] = seatView(s, 0).heroes;
  hero.damage = 2;
  hero.resources = 3;
  s = choose(s, hero.id);
  s = settle(s);
  assert.equal(q().guardedHeroes.length, 2);
  const guards = s.staging.filter((u) => u.guarding);
  assert.equal(guards.length, 2);
  assert.deepEqual(
    guards.map((u) => u.code).sort(),
    [WQ.crows, WQ.troll].sort(),
  );
  const held = q().guardedHeroes.find((g) => g.player === 0)!;
  assert.equal(held.hero.damage, 0, "all tokens are discarded");
  assert.equal(held.hero.resources, 0);
  assert.ok(!seatView(s, 0).heroes.some((h) => h.id === hero.id));
  assert.equal(seatView(s, 0).heroes.length, 2);
  assert.equal(H.missingHeroAllowed!(s, 0), true);
  assert.equal(wizardsQuestPublicState(s)!.guardedHeroes, 2);
  // The stage cannot be defeated while a hero is guarded.
  s.progress = 15;
  advance(s);
  assert.equal(s.status, "playing");
  // The guard leaves play: its hero returns to its owner, exhausted.
  const guard = get(s, held.guardId)!;
  s.staging = s.staging.filter((u) => u.id !== guard.id);
  s.encounterDiscard.push(guard.code);
  advance(s);
  assert.equal(q().guardedHeroes.length, 1);
  const back = seatView(s, 0).heroes.find((h) => h.id === hero.id)!;
  assert.ok(back, "the hero returns to its owner's control");
  assert.equal(back.exhausted, true);
  assert.equal(s.status, "playing");
  // The last guard is destroyed: the players win.
  const other = q().guardedHeroes[0];
  s.staging = s.staging.filter((u) => u.id !== other.guardId);
  advance(s);
  assert.equal(s.status, "won");
  reload(s);
});

test("Return to Rhosgobel (3B): Rider of Mirkwood engages at cost 0, takes no more damage than the stage's progress, and must leave play before the stage is defeated to win", () => {
  let s = base(2);
  atQuest(s, WQ.return);
  fromBox(s, WQ.rhosgobel);
  const rider = stage(s, WQ.rider);
  assert.equal(threatOf(s, rider), 4);
  assert.ok(engagementCost(s, rider) <= 0);
  assert.equal(H.cannotEngage!(s, rider), false);
  assert.equal(H.cannotLeave!(s, rider, false), false);
  // The engagement check engages it with the highest threat.
  forOwner(s, 1, () => (s.threat = 25));
  s.phase = "encounter";
  s.queue.push(fx("engagementRound"));
  flush(s);
  s = settle(s);
  assert.ok(
    seatView(s, 1).engaged.some((u) => u.code === WQ.rider) ||
      s.engaged.some((u) => u.code === WQ.rider),
    "Rider of Mirkwood engages a player",
  );
  // Damage is capped by the progress on the stage.
  const r = [...seatView(s, 0).engaged, ...seatView(s, 1).engaged].find(
    (u) => u.code === WQ.rider,
  )!;
  s.progress = 4;
  assert.equal(H.damageAmount!(s, r, 6, { combatDamage: true }), 4);
  r.damage = 4;
  assert.equal(H.damageAmount!(s, r, 6, { combatDamage: true }), 0);
  s.progress = 10;
  advance(s);
  assert.equal(
    s.status,
    "playing",
    "the stage needs Rider of Mirkwood out of play",
  );
  // At 2B it could take any damage, and cannot leave the staging area.
  const t = base();
  atQuest(t, WQ.terror);
  const staged = stage(t, WQ.rider);
  assert.equal(H.damageAmount!(t, staged, 6, { combatDamage: true }), 6);
  assert.equal(H.engagementBonus!(t, staged), 0);
  // Destroyed, Rider of Mirkwood goes to the victory display; 10 progress win.
  r.damage = 9;
  damage(s, r.id, 1, { combatDamage: true });
  flush(s);
  advance(s);
  assert.ok(s.victoryCards!.includes(WQ.rider));
  assert.equal(wizardsQuestPublicState(s)!.rider, "victory");
  assert.equal(s.status, "won");
  assert.match(
    s.reason ?? "",
    /return from Dol Guldur with news for Rhosgobel/,
  );
  reload(s);
});
