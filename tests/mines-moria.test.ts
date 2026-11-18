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
import { fx, stats, threatOf } from "../src/game/core";
import { check, damage, progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { engagedEnemies } from "../src/game/considered-engagement";
import { forOwner, seatView } from "../src/game/table";
import {
  MINES_MORIA_HOOKS,
  MM,
  MM_SETS,
  MM_STAGE2,
  MM_STAGE3,
  minesMoriaPublicState,
  mmCost,
  mmRecipe,
} from "../src/game/mines-moria";
import { MINES_MORIA_ADVENTURES } from "../src/game/mines-moria-scenario-data";
import {
  activate,
  allies,
  atQuest,
  base,
  chamber,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
  takeBox,
  watcher,
} from "./mines-moria-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = MINES_MORIA_HOOKS;
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
/** A new game, stopped at the first quick-build decision after the opening hands. */
function opening(players = 1, seed = 919) {
  let s = createGame(
    seed,
    STARTERS[0].cards,
    STARTERS[0].heroes,
    STARTERS[0].id,
    {
      scenarioId: "the-mines-of-moria",
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
const BLADE = "01039",
  STEWARD = "01026",
  COURAGE = "01057";
/** Attach a player attachment from the core set to a character. */
const attach = (u: Unit, code: string, owner = 0) => {
  const a = {
    id: `att-${code}-${u.attachments.length}-${u.id}`,
    code,
    exhausted: false,
    owner,
  } as Unit["attachments"][number];
  u.attachments.push(a);
  return a;
};

test("Setup: the first player builds the quest deck from To the West-door and one stage 2 and one stage 3 card and the encounter deck from 7 of the 14 encounter sets; 1A gives each hero a resource and adds The Watcher", () => {
  const recipe = mmRecipe();
  assert.equal(recipe.id, "Q99.13");
  assert.equal(
    recipe.cards.reduce((n, c) => n + c.quantity, 0),
    78,
    "70 encounter cards in 14 sets of 5, The Watcher and the 7 quest cards",
  );
  assert.deepEqual(
    MM_SETS.map((x) => x.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
  for (const set of MM_SETS) {
    assert.equal(set.cards.length, 5, `set ${set.number} has 5 cards`);
    assert.equal(
      set.cards.reduce((n, c) => n + mmCost(c), 0),
      3,
      `set ${set.number} costs 3 in total`,
    );
  }
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true]) {
      const s = start(players, easy);
      const q = s.minesMoria!;
      assert.equal(q.building, null);
      assert.equal(q.currentQuest, MM.request);
      assert.equal(s.stage, 1);
      assert.equal(s.round, 1);
      assert.deepEqual(q.questDeck, [MM.presence, MM.drums]);
      assert.deepEqual(q.sets, [1, 2, 3, 4, 5, 6, 7]);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [MM.watcher],
        "1A adds only The Watcher",
      );
      // 1 resource from 1A, 1 from the first resource phase (+1 in easy mode).
      for (const p of Array.from({ length: players }, (_, i) => i))
        assert.ok(
          seatView(s, p).heroes.every((h) => h.resources === (easy ? 3 : 2)),
          `player ${p}'s heroes have ${easy ? 3 : 2} resources`,
        );
      const chosen = MM_SETS.slice(0, 7).flatMap((x) => x.cards);
      assert.deepEqual([...s.encounterDeck].sort(), [...chosen].sort());
      assert.equal(q.box.length, 78 - 35 - 3 - 1);
      for (const c of [MM.longDark, MM.narrow, MM.balin, MM.eastward])
        assert.ok(q.box.includes(c), card(c).back_name);
      const view = minesMoriaPublicState(s)!;
      assert.deepEqual(
        {
          side: view.side,
          stage2: view.stage2,
          stage3: view.stage3,
          watcher: view.watcher,
          chamber: view.chamber,
          guarded: view.guarded,
          hidden: view.hidden,
          cap: view.cap,
        },
        {
          side: "1B",
          stage2: MM.presence,
          stage3: MM.drums,
          watcher: "staging",
          chamber: "out",
          guarded: 0,
          hidden: 0,
          cap: null,
        },
      );
      assert.deepEqual(publicState(s).minesMoria, view);
      reload(s);
    }
  assert.deepEqual(
    MINES_MORIA_ADVENTURES.map((a) => [
      a.id,
      a.stageCount,
      a.stages.map((x) => [x.stage, x.name, x.quest]),
    ]),
    [
      [
        "the-mines-of-moria",
        3,
        [
          [1, "To the West-door", 5],
          [2, "A Presence in the Dark", 20],
          [2, "The Long Dark of Moria", 20],
          [2, "Narrow Paths", 20],
          [3, "Drums in the Deep", 10],
          [3, "The Fate of Balin", 20],
          [3, "Continuing Eastward", 15],
        ],
      ],
    ],
  );
});

test("The quick build: the first player chooses each card and set or lets them be chosen at random, deterministically by seed", () => {
  let s = opening(2);
  assert.match(
    s.choice!.title,
    /^The Mines of Moria · Choose the stage 2 quest card/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...MM_STAGE2, "random"],
  );
  s = choose(s, MM.narrow);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...MM_STAGE3, "random"],
  );
  s = choose(s, MM.eastward);
  assert.match(s.choice!.title, /Choose encounter set 1 of 7/);
  assert.match(
    s.choice!.options.find((o) => o.id === "set:9")!.label,
    /^Set 9: Great Cave-troll, Zigil Mineshaft, Dark and Dreadful ×3$/,
  );
  s = choose(s, "set:9");
  s = choose(s, "random");
  s = settle(s);
  const q = s.minesMoria!;
  assert.deepEqual(q.questDeck, [MM.narrow, MM.eastward]);
  assert.equal(q.sets.length, 7);
  assert.ok(q.sets.includes(9));
  assert.equal(s.encounterDeck.length, 35);
  const random = (seed: number) => {
    let r = opening(1, seed);
    r = choose(r, "random");
    r = choose(r, "random");
    r = choose(r, "random");
    r = settle(r);
    return [...r.minesMoria!.questDeck, ...r.minesMoria!.sets];
  };
  assert.deepEqual(random(5), random(5));
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const [stage2, stage3] = random(seed);
    seen.add(`${stage2}/${stage3}`);
  }
  assert.ok(seen.size > 1, "different seeds build different quest decks");
  reload(s);
});

test("To the West-door (1B): with 5 progress The Watcher is considered engaged with each player and attacks each of them; defeated, it flips to Chamber of Mazarbul, and the stage cannot be defeated while it is in play", () => {
  let s = base(2);
  const w = watcher(s);
  assert.equal(playerEffectImmune(s, w), true);
  assert.equal(threatOf(s, w), 2 + 2 * 2);
  assert.equal(stats(s, w).health, 4 + 4 * 2);
  assert.equal(stats(s, w).attack, 4);
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, w));
  // Fewer than 5 progress: not engaged.
  s.progress = 4;
  for (const p of [0, 1])
    assert.ok(!engagedEnemies(s, p).some((u) => u.id === w.id));
  s.progress = 5;
  for (const p of [0, 1])
    assert.ok(
      engagedEnemies(s, p).some((u) => u.id === w.id),
      `The Watcher is considered engaged with player ${p}`,
    );
  // The stage cannot be defeated while The Watcher is in play.
  s.phase = "planning";
  advance(s);
  assert.equal(s.stage, 1);
  // Defeated: Chamber of Mazarbul joins the staging area.
  w.damage = stats(s, w).health - 1;
  damage(s, w.id, 1, { combatDamage: true });
  flush(s);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === MM.watcher));
  const c = s.staging.find((u) => u.code === MM.chamber)!;
  assert.ok(c, "Chamber of Mazarbul is in the staging area");
  assert.ok(!s.encounterDiscard.includes(MM.watcher));
  assert.ok(!(s.victoryCards ?? []).includes(MM.watcher));
  assert.deepEqual(
    {
      watcher: minesMoriaPublicState(s)!.watcher,
      chamber: minesMoriaPublicState(s)!.chamber,
    },
    { watcher: "out", chamber: "staging" },
  );
  advance(s);
  s = settle(s);
  assert.equal(s.stage, 2, "the 5 progress now defeat the stage");
  assert.equal(minesMoriaPublicState(s)!.side, "2B");
  assert.ok(
    s.log.some((l) =>
      /^Journey in the Black Pit: Dwarven Forge is set aside, the encounter deck is shuffled and it is revealed/.test(
        l.text,
      ),
    ),
    "2A reveals a card from the top 5",
  );
  reload(s);
  // The Watcher attacks each player in turn order during the combat phase.
  let t = base(2);
  const v = watcher(t);
  t.progress = 5;
  t.encounterDeck = [MM.forge, MM.forge, MM.forge];
  t.phase = "defense";
  for (const p of [0, 1]) {
    forOwner(t, p, () => {
      t.heroes[0].exhausted = false;
    });
  }
  t = act(t, {
    type: "DEFEND",
    enemyId: v.id,
    defenderId: seatView(t, 0).heroes[0].id,
  });
  t = settle(t);
  assert.ok(
    t.log.some((l) => /The Watcher attacks/.test(l.text)),
    "The Watcher attacks",
  );
  void hand;
  void allies;
});

test("Chamber of Mazarbul: X threat is 1 more than the stage number; the players cannot travel there unless they are at stage 3B; travel makes each player discard a random card; explored, it is worth 5 victory points", () => {
  let s = base(2);
  const c = chamber(s);
  assert.equal(playerEffectImmune(s, c), true);
  assert.equal(threatOf(s, c), 2);
  atQuest(s, MM.presence);
  assert.equal(threatOf(s, c), 3);
  s.phase = "travel";
  assert.match(canTravel(s, c) ?? "", /unless they are at stage 3B/);
  atQuest(s, MM.balin);
  assert.equal(threatOf(s, c), 4);
  s.stageRevealing = true;
  assert.match(canTravel(s, c) ?? "", /unless they are at stage 3B/);
  s.stageRevealing = false;
  assert.equal(canTravel(s, c), null);
  hand(s, ["01013", "01016"], 0);
  hand(s, ["01017"], 1);
  s = act(s, { type: "TRAVEL", id: c.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, MM.chamber);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.equal(minesMoriaPublicState(s)!.chamber, "active");
  progress(s, 5);
  flush(s);
  s = settle(s);
  assert.ok((s.victoryCards ?? []).includes(MM.chamber));
  assert.equal(minesMoriaPublicState(s)!.chamber, "victory");
  reload(s);
});

test("A Presence in the Dark (2B): at the beginning of the staging step the opposing team puts 1 of the top 2 encounter cards on the bottom and the other back on top", () => {
  let s = base();
  chamber(s);
  atQuest(s, MM.presence);
  s.minesMoria!.defeated = [MM.request];
  s.encounterDeck = [MM.hall, MM.savage, MM.forge, MM.forge];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[2].id });
  s = act(s, { type: "COMMIT" });
  assert.match(
    s.choice!.title,
    /^A Presence in the Dark · The opposing team puts 1 of the top 2 encounter cards on the bottom/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Many-pillared Hall", "Savage Werewolf"],
  );
  s = choose(s, "bottom:0");
  s = settle(s);
  // Savage Werewolf stayed on top and was revealed; Many-pillared Hall is at the bottom.
  assert.ok(s.staging.some((u) => u.code === MM.savage));
  assert.equal(s.encounterDeck.at(-1), MM.hall);
  reload(s);
});

test("The Long Dark of Moria (2B): when revealed, the opposing team adds one different 0 cost location per player from the encounter deck or discard pile", () => {
  let s = base(3);
  chamber(s);
  s.minesMoria!.questDeck = [MM.longDark, MM.drums];
  s.encounterDeck = [
    MM.forge,
    MM.forge,
    MM.forge,
    MM.forge,
    MM.forge,
    MM.hall,
    MM.mines,
  ];
  s.encounterDiscard = [MM.cavern, MM.zigil];
  s.progress = 5;
  advance(s);
  s = choose(s, MM.forge);
  assert.match(
    s.choice!.title,
    /^The Long Dark of Moria · The opposing team adds a different 0 cost location/,
  );
  // Zigil Mineshaft costs 1.
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    [
      "Abandoned Mines",
      "Cobwebbed Cavern",
      "Dwarven Forge",
      "Many-pillared Hall",
    ],
  );
  s = choose(s, MM.hall);
  assert.ok(!s.choice!.options.some((o) => o.code === MM.hall));
  s = choose(s, MM.cavern);
  s = choose(s, MM.mines);
  s = settle(s);
  for (const c of [MM.hall, MM.cavern, MM.mines])
    assert.ok(
      s.staging.some((u) => u.code === c),
      card(c).name,
    );
  assert.deepEqual(s.encounterDiscard, [MM.zigil]);
  reload(s);
});

test("Narrow Paths (2B): the opposing team guards an attachment controlled by each player under the stage; attachments with those titles cannot be played, and they return to their owners' hands when the stage is defeated", () => {
  let s = base(2);
  chamber(s);
  s.minesMoria!.questDeck = [MM.narrow, MM.drums];
  s.encounterDeck = Array(6).fill(MM.forge);
  const blade = attach(seatView(s, 0).heroes[0], BLADE, 0);
  attach(seatView(s, 0).heroes[1], STEWARD, 0);
  attach(seatView(s, 1).heroes[0], COURAGE, 1);
  s.progress = 5;
  advance(s);
  s = choose(s, MM.forge);
  assert.match(
    s.choice!.title,
    /^Narrow Paths · The opposing team chooses an attachment controlled by Aragorn & Théodred & Glóin to guard under the stage/,
  );
  assert.equal(s.choice!.options.length, 2);
  s = choose(s, blade.id);
  assert.match(s.choice!.title, /controlled by Gimli & Legolas & Thalin/);
  s = settle(s);
  const q = s.minesMoria!;
  assert.equal(q.guarded.length, 2);
  assert.deepEqual(q.guarded.map((g) => [g.owner, g.attachment.code]).sort(), [
    [0, BLADE],
    [1, COURAGE],
  ]);
  assert.equal(seatView(s, 0).heroes[0].attachments.length, 0);
  assert.equal(seatView(s, 0).heroes[1].attachments.length, 1);
  assert.equal(minesMoriaPublicState(s)!.guarded, 2);
  assert.match(H.playProblem!(s, BLADE)!, /Narrow Paths guards a copy/);
  assert.equal(H.playProblem!(s, STEWARD), null);
  // Defeated: each guarded attachment returns to its owner's hand.
  s.progress = 20;
  advance(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.minesMoria!.guarded.length, 0);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === BLADE));
  assert.ok(seatView(s, 1).hand.some((u) => u.code === COURAGE));
  assert.equal(H.playProblem!(s, BLADE), null);
  reload(s);
});

test("Drums in the Deep (3B): enemies cannot take damage while Chamber of Mazarbul is in the staging area; when revealed, the opposing team adds an enemy; the stage cannot be defeated while an enemy is in play, then the players win", () => {
  let s = base();
  const c = chamber(s);
  atQuest(s, MM.presence);
  s.minesMoria!.defeated = [MM.request];
  s.encounterDeck = Array(6).fill(MM.forge);
  s.encounterDiscard = [MM.werewolf];
  s.progress = 20;
  advance(s);
  s = choose(s, MM.forge);
  assert.match(
    s.choice!.title,
    /^Drums in the Deep · The opposing team adds an enemy to the staging area/,
  );
  s = choose(s, MM.werewolf);
  s = settle(s);
  const wolf = s.staging.find((u) => u.code === MM.werewolf)!;
  assert.ok(wolf);
  assert.equal(H.damageAmount!(s, wolf, 3, { combatDamage: true }), 0);
  // The Chamber explored: enemies take damage again.
  s.staging = s.staging.filter((u) => u.id !== c.id);
  s.victoryCards = [MM.chamber];
  assert.equal(H.damageAmount!(s, wolf, 3, { combatDamage: true }), 3);
  s.progress = 10;
  advance(s);
  assert.equal(s.status, "playing", "an enemy is in play");
  s.staging = s.staging.filter((u) => u.id !== wolf.id);
  s.encounterDiscard.push(wolf.code);
  advance(s);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /learn the fate of Balin's colony/);
  reload(s);
});

test("The Fate of Balin (3B): at the beginning of the staging step the first player reveals another card or allows no more than 5 progress on the stage this phase; it cannot be defeated while Chamber of Mazarbul is in play", () => {
  for (const option of ["reveal", "cap"]) {
    let s = base();
    chamber(s);
    atQuest(s, MM.balin);
    s.minesMoria!.defeated = [MM.request, MM.presence];
    s.encounterDeck = Array(6).fill(MM.forge);
    s.phase = "quest";
    s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[2].id });
    s = act(s, { type: "COMMIT" });
    assert.match(
      s.choice!.title,
      /^The Fate of Balin · Reveal an additional encounter card this phase, or no more than 5 progress/,
    );
    s = choose(s, option);
    s = settle(s);
    assert.equal(
      s.staging.filter((u) => u.code === MM.forge).length,
      option === "reveal" ? 2 : 1,
    );
    if (option === "cap") {
      assert.equal(minesMoriaPublicState(s)!.cap, 5);
      assert.ok(
        s.log.some(
          (l) =>
            l.text ===
            "The Fate of Balin: no more than 5 progress can be placed on the current quest this phase.",
        ),
        "the cap is logged under the stage's B side",
      );
      progress(s, 8);
      assert.equal(s.progress, 5);
    }
    reload(s);
  }
  const s = base();
  const c = chamber(s);
  atQuest(s, MM.balin);
  s.progress = 20;
  advance(s);
  assert.equal(s.status, "playing", "Chamber of Mazarbul is in play");
  s.staging = s.staging.filter((u) => u.id !== c.id);
  s.victoryCards = [MM.chamber];
  advance(s);
  assert.equal(s.status, "won");
});

test("Continuing Eastward (3B): each location in the staging area gets +1 threat and +3 quest points; the explored active location reveals a card; it cannot be defeated while Chamber of Mazarbul is in play", () => {
  let s = base();
  const c = chamber(s);
  atQuest(s, MM.eastward);
  s.minesMoria!.defeated = [MM.request, MM.presence];
  const forge = stage(s, MM.forge);
  assert.equal(threatOf(s, forge), 3 + 1);
  assert.equal(threatOf(s, c), 4 + 1);
  assert.equal(H.locationQuestBonus!(s, forge), 3);
  s.staging = s.staging.filter((u) => u.id !== forge.id);
  s.activeLocation = forge;
  assert.equal(H.locationQuestBonus!(s, forge), 0, "active, it is printed");
  s.encounterDeck = [MM.hall, MM.forge];
  progress(s, 5);
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(
    s.staging.some((u) => u.code === MM.hall),
    "a card is revealed",
  );
  s.progress = 15;
  advance(s);
  assert.equal(s.status, "playing");
  s.staging = s.staging.filter((u) => u.code !== MM.chamber);
  s.victoryCards = [MM.chamber];
  advance(s);
  assert.equal(s.status, "won");
  void takeBox;
  void engaged;
  void activate;
});
