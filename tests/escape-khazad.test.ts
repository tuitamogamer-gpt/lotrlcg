import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  canTravel,
  createGame,
  optionalEngagementProblem,
  publicState,
  validateSave,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, stats, threatOf } from "../src/game/core";
import { check, damage, progress } from "../src/game/board";
import { reduceThreat } from "../src/game/threat-reduction";
import { flush } from "../src/game/effects";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { engagedEnemies } from "../src/game/considered-engagement";
import { forOwner, seatView } from "../src/game/table";
import {
  ESCAPE_KHAZAD_HOOKS,
  EK,
  EK_SETS,
  EK_STAGE2,
  EK_STAGE3,
  escapeKhazadPublicState,
  ekCost,
  ekRecipe,
} from "../src/game/escape-khazad";
import { ESCAPE_KHAZAD_ADVENTURES } from "../src/game/escape-khazad-scenario-data";
import {
  activate,
  atQuest,
  bane,
  baneAside,
  base,
  choose,
  deck,
  engaged,
  hand,
  pit,
  reload,
  settle,
  stage,
  start,
} from "./escape-khazad-fixtures";
import type { GameState } from "../src/game/types";

const H = ESCAPE_KHAZAD_HOOKS;
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
      scenarioId: "escape-from-khazad-dum",
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
const view = (s: GameState) => escapeKhazadPublicState(s)!;

test("Setup: the first player builds the quest deck from Out of the Depths and one stage 2 and one stage 3 card and the encounter deck from 7 of the 14 encounter sets; 1A adds Dark Pit and one different 0 cost enemy or location per player", () => {
  const recipe = ekRecipe();
  assert.equal(recipe.id, "Q99.14");
  assert.equal(
    recipe.cards.reduce((n, c) => n + c.quantity, 0),
    78,
    "70 encounter cards in 14 sets of 5, Dark Pit and the 7 quest cards",
  );
  assert.deepEqual(
    EK_SETS.map((x) => x.number),
    [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
  );
  for (const set of EK_SETS) {
    assert.equal(set.cards.length, 5, `set ${set.number} has 5 cards`);
    assert.equal(
      set.cards.reduce((n, c) => n + ekCost(c), 0),
      3,
      `set ${set.number} costs 3 in total`,
    );
  }
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true]) {
      const s = start(players, easy);
      const q = s.escapeKhazad!;
      assert.equal(q.building, null);
      assert.equal(q.currentQuest, EK.depths);
      assert.equal(s.stage, 1);
      assert.equal(s.round, 1);
      assert.deepEqual(q.questDeck, [EK.lair, EK.bridge]);
      assert.deepEqual(q.sets, [15, 16, 17, 18, 19, 20, 21]);
      const staged = s.staging.map((u) => u.code);
      assert.equal(staged[0], EK.pit, "1A adds Dark Pit");
      assert.equal(staged.length, 1 + players, "and one card per player");
      assert.equal(
        new Set(staged.slice(1).map((c) => card(c).name)).size,
        players,
        "the cards are different",
      );
      for (const c of staged.slice(1)) {
        assert.ok(["enemy", "location"].includes(card(c).type_code));
        assert.equal(ekCost(c), 0);
      }
      // Only the first resource phase: 1 resource (+1 in easy mode).
      for (const p of Array.from({ length: players }, (_, i) => i))
        assert.ok(
          seatView(s, p).heroes.every((h) => h.resources === (easy ? 2 : 1)),
          `player ${p}'s heroes have ${easy ? 2 : 1} resources`,
        );
      const chosen = EK_SETS.slice(0, 7).flatMap((x) => x.cards);
      assert.deepEqual(
        [...s.encounterDeck, ...staged.slice(1)].sort(),
        [...chosen].sort(),
      );
      assert.equal(q.box.length, 78 - 35 - 3 - 1);
      for (const c of [EK.wrongTurn, EK.wayUp, EK.lastLord, EK.rearGuard])
        assert.ok(q.box.includes(c), card(c).back_name);
      const v = view(s);
      assert.deepEqual(
        {
          side: v.side,
          stage2: v.stage2,
          stage3: v.stage3,
          pit: v.pit,
          bane: v.bane,
          bridgeDamage: v.bridgeDamage,
          bridgeCap: v.bridgeCap,
          lair: v.lair,
          dungeon: v.dungeon,
          nameless: v.nameless,
        },
        {
          side: "1B",
          stage2: EK.lair,
          stage3: EK.bridge,
          pit: "staging",
          bane: "out",
          bridgeDamage: 0,
          bridgeCap: null,
          lair: false,
          dungeon: 0,
          nameless: 0,
        },
      );
      assert.deepEqual(publicState(s).escapeKhazad, v);
      reload(s);
    }
  assert.deepEqual(
    ESCAPE_KHAZAD_ADVENTURES.map((a) => [
      a.id,
      a.stageCount,
      a.stages.map((x) => [x.stage, x.name, x.quest]),
    ]),
    [
      [
        "escape-from-khazad-dum",
        3,
        [
          [1, "Out of the Depths", 10],
          [2, "Old One Lair", 10],
          [2, "A Wrong Turn", 15],
          [2, "A Way Up", 20],
          [3, "The Bridge of Khazad-dûm", 10],
          [3, "Last Lord of Moria", 15],
          [3, "The Rear Guard", 20],
        ],
      ],
    ],
  );
});

test("The quick build: the first player chooses each card and set or lets them be chosen at random, deterministically by seed", () => {
  let s = opening(2);
  assert.match(
    s.choice!.title,
    /^Escape from Khazad-dûm · Choose the stage 2 quest card/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...EK_STAGE2, "random"],
  );
  s = choose(s, EK.wayUp);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [...EK_STAGE3, "random"],
  );
  s = choose(s, EK.rearGuard);
  assert.match(s.choice!.title, /Choose encounter set 1 of 7/);
  assert.match(
    s.choice!.options.find((o) => o.id === "set:23")!.label,
    /^Set 23: Elder Nameless Thing, Silent Caverns ×2, Dark Places ×2$/,
  );
  s = choose(s, "set:23");
  s = choose(s, "random");
  s = settle(s);
  const q = s.escapeKhazad!;
  assert.deepEqual(q.questDeck, [EK.wayUp, EK.rearGuard]);
  assert.equal(q.sets.length, 7);
  assert.ok(q.sets.includes(23));
  assert.equal(s.encounterDeck.length + s.staging.length - 1, 35);
  const random = (seed: number) => {
    let r = opening(1, seed);
    r = choose(r, "random");
    r = choose(r, "random");
    r = choose(r, "random");
    r = settle(r);
    return [...r.escapeKhazad!.questDeck, ...r.escapeKhazad!.sets];
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

test("Out of the Depths (1B): traveling to Dark Pit reveals a card from the top 5 (cost 1 or less, 2 or less with two or more players) whose 'when revealed' effects cannot be canceled; explored, it flips over and Durin's Bane is set aside, and each player searches the top 5 cards of his deck for a card; the stage cannot be defeated while Dark Pit is in play", () => {
  let s = base(2);
  const p = pit(s);
  assert.equal(playerEffectImmune(s, p), true);
  assert.equal(threatOf(s, p), 1);
  // The stage cannot be defeated while Dark Pit is in play.
  s.progress = 10;
  advance(s);
  assert.equal(s.stage, 1);
  s.progress = 0;
  s.encounterDeck = [
    EK.greatBridge,
    EK.hobgoblin,
    EK.mithril,
    EK.mithril,
    EK.mithril,
    EK.mithril,
  ];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: p.id });
  assert.match(
    s.choice!.title,
    /^Dark Pit · The opposing team chooses a card with cost 2 or less from the top 5 encounter cards to reveal/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Hobgoblin", "Mithril Lode"],
    "The Great Bridge costs 3",
  );
  assert.equal(H.cannotCancel!(s, false, EK.hobgoblin), false);
  s = choose(s, EK.hobgoblin);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === EK.hobgoblin));
  assert.ok(
    s.log.some((l) =>
      /^Dark Pit: Hobgoblin is set aside, the encounter deck is shuffled and it is revealed\.$/.test(
        l.text,
      ),
    ),
  );
  assert.equal(s.activeLocation?.code, EK.pit);
  assert.equal(view(s).pit, "active");
  // Alone, the search takes a card with cost 1 or less.
  let solo = base();
  const sp = pit(solo);
  solo.encounterDeck = [EK.hobgoblin, EK.caveSpider, EK.mithril];
  solo.phase = "travel";
  solo = act(solo, { type: "TRAVEL", id: sp.id });
  assert.match(solo.choice!.title, /with cost 1 or less/);
  assert.deepEqual(
    solo.choice!.options.map((o) => card(o.code!).name),
    ["Cave Spider", "Mithril Lode"],
  );
  // Explored: Durin's Bane is set aside; each player searches the top 5 cards.
  deck(s, ["01013", "01016", "01017", "01020", "01021", "01022"], 0);
  deck(s, ["01028", "01029", "01039"], 1);
  progress(s, 1);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Out of the Depths · Search the top 5 cards of your deck for a card to add to your hand/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    ["01013", "01016", "01017", "01020", "01021"],
    "the top 5 cards",
  );
  s = choose(s, "01017");
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    ["01028", "01029", "01039"],
  );
  s = choose(s, "01039");
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    ["01017"],
  );
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    ["01039"],
  );
  assert.deepEqual([...seatView(s, 0).deck].sort(), [
    "01013",
    "01016",
    "01020",
    "01021",
    "01022",
  ]);
  assert.equal(s.activeLocation, null);
  assert.ok(!s.encounterDiscard.includes(EK.pit));
  assert.ok(!(s.victoryCards ?? []).includes(EK.pit));
  assert.deepEqual(
    { pit: view(s).pit, bane: view(s).bane },
    { pit: "out", bane: "aside" },
  );
  assert.equal(s.escapeKhazad!.baneAside, true);
  reload(s);
  // Now the stage is defeated and 2A searches the top 5 (cost 2 or less).
  s.encounterDeck = Array(6).fill(EK.mithril);
  s.progress = 10;
  advance(s);
  assert.equal(s.stage, 2);
  assert.match(
    s.choice!.title,
    /^Search for an Exit · The opposing team chooses a card with cost 2 or less from the top 5 encounter cards to reveal/,
  );
  reload(s);
});

test("Old One Lair (2B): when revealed, the opposing team adds an enemy with cost 2 or less from the encounter deck or discard pile with a resource on it; it is immune to player card effects, and no progress can be placed on the stage while it is in play", () => {
  let s = base();
  baneAside(s);
  s.encounterDeck = [
    EK.mithril,
    EK.mithril,
    EK.mithril,
    EK.mithril,
    EK.mithril,
    EK.hobgoblin,
    EK.adder,
  ];
  s.encounterDiscard = [EK.chieftain, EK.caveSpider];
  s.progress = 10;
  advance(s);
  s = choose(s, EK.mithril);
  assert.match(
    s.choice!.title,
    /^Old One Lair · The opposing team adds an enemy with cost 2 or less to the staging area and places a resource on it/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Cave Spider", "Hobgoblin", "Rock Adder"],
    "Chieftain of the Pit costs 3",
  );
  s = choose(s, EK.hobgoblin);
  s = settle(s);
  const u = s.staging.find((x) => x.code === EK.hobgoblin)!;
  assert.equal(u.resources, 1);
  assert.equal(s.escapeKhazad!.lair, u.id);
  assert.equal(view(s).lair, true);
  assert.equal(playerEffectImmune(s, u), true);
  progress(s, 5);
  flush(s);
  assert.equal(s.progress, 0, "no progress while the enemy is in play");
  damage(s, u.id, 5, { combatDamage: true });
  flush(s);
  s = settle(s);
  assert.ok(!s.staging.some((x) => x.id === u.id));
  progress(s, 5);
  flush(s);
  assert.equal(s.progress, 5);
  reload(s);
});

test("A Wrong Turn (2B): when revealed, each player chooses 1 card in his hand and shuffles the rest into his deck", () => {
  let s = base(2);
  baneAside(s);
  s.escapeKhazad!.questDeck = [EK.wrongTurn, EK.bridge];
  hand(s, ["01013", "01016", "01020"], 0);
  hand(s, ["01028"], 1);
  deck(s, ["01014"], 0);
  s.encounterDeck = Array(6).fill(EK.mithril);
  s.progress = 10;
  advance(s);
  s = choose(s, EK.mithril);
  assert.match(
    s.choice!.title,
    /^A Wrong Turn · Choose 1 card in your hand to keep; the rest are shuffled into your deck/,
  );
  s = choose(s, s.choice!.options.find((o) => o.code === "01016")!.id);
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    ["01016"],
  );
  assert.deepEqual([...seatView(s, 0).deck].sort(), [
    "01013",
    "01014",
    "01020",
  ]);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    ["01028"],
    "a single card is kept",
  );
  reload(s);
});

test("A Way Up (2B): the active location's threat is added to the staging area, and during the travel phase the players must travel to a location, if able", () => {
  const s = base();
  baneAside(s);
  atQuest(s, EK.wayUp);
  assert.equal(H.stagingThreat!(s), 0);
  activate(s, EK.greatBridge);
  assert.equal(H.stagingThreat!(s), 4);
  s.activeLocation = null;
  s.phase = "travel";
  assert.equal(H.mustTravel!(s), false, "no location to travel to");
  stage(s, EK.mithril);
  assert.equal(H.mustTravel!(s), true);
  atQuest(s, EK.lair);
  assert.equal(H.mustTravel!(s), false);
  reload(s);
});

test("Nearing the Gate (3A): the set-aside Durin's Bane is added to the staging area; it cannot take damage this round, and with more than 1 player it makes an immediate attack against the first player", () => {
  for (const players of [1, 2]) {
    let s = base(players);
    baneAside(s);
    atQuest(s, EK.lair);
    s.escapeKhazad!.defeated = [EK.depths];
    s.encounterDeck = Array(6).fill(EK.mithril);
    s.progress = 10;
    advance(s);
    s = settle(s, "undefended");
    assert.equal(s.stage, 3);
    const b = s.staging.find((u) => u.code === EK.bane)!;
    assert.ok(b, "Durin's Bane is in the staging area");
    assert.equal(s.escapeKhazad!.baneAside, false);
    assert.equal(view(s).bane, "staging");
    assert.equal(view(s).side, "3B");
    assert.ok(
      !s.log.some((l) =>
        /is set aside, the encounter deck is shuffled/.test(l.text),
      ),
      "3A does not search the top 5 cards",
    );
    assert.equal(
      s.log.some(
        (l) => l.text === "Durin's Bane attacks for 8 damage (undefended).",
      ),
      players > 1,
      `the immediate attack with ${players} player(s)`,
    );
    damage(s, b.id, 3, { combatDamage: true });
    flush(s);
    assert.equal(b.damage, 0, "it cannot take damage this round");
    s.round += 1;
    damage(s, b.id, 3, { combatDamage: true });
    flush(s);
    assert.equal(b.damage, 3);
    reload(s);
  }
});

test("Durin's Bane: immune to player card effects, no optional engagement, and after it attacks and destroys a character its controller raises his threat by 2 and 2 damage is healed from it", () => {
  let s = base();
  const b = bane(s);
  assert.equal(playerEffectImmune(s, b), true);
  assert.deepEqual(
    [
      threatOf(s, b),
      stats(s, b).attack,
      stats(s, b).defense,
      stats(s, b).health,
    ],
    [4, 8, 3, 15],
  );
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, b));
  b.damage = 5;
  s.encounterDeck = [EK.mithril, EK.mithril];
  const hero = s.heroes[1];
  s = run(s, fx("immediateAttack", { target: b.id, player: 0 }));
  s = choose(s, hero.id);
  s = settle(s);
  assert.ok(
    !s.heroes.some((h) => h.id === hero.id),
    "the defender is destroyed",
  );
  assert.equal(s.threat, 22);
  assert.equal(s.staging.find((u) => u.id === b.id)!.damage, 3);
  reload(s);
});

test("The Bridge of Khazad-dûm (3B): no more than 5 progress each round; at the beginning of the quest phase Durin's Bane attacks the first player and its undefended or excess damage is placed on the stage; with 10 damage the players lose, and defeating the stage wins", () => {
  let s = base();
  const b = bane(s);
  atQuest(s, EK.bridge);
  s.escapeKhazad!.defeated = [EK.depths, EK.lair];
  s.encounterDeck = Array(6).fill(EK.mithril);
  s.phase = "quest";
  assert.deepEqual(
    (H.questBegin!(s) ?? []).map((e) => e.kind),
    ["ekBridgeAttack"],
  );
  s = run(s, ...(H.questBegin!(s) ?? []));
  assert.match(s.choice!.title, /^Durin's Bane · Immediate attack/);
  s = choose(s, "undefended");
  s = settle(s);
  assert.equal(s.escapeKhazad!.bridgeDamage, 8, "the undefended damage");
  assert.ok(
    s.heroes.every((h) => h.damage === 0),
    "no hero takes it",
  );
  assert.equal(view(s).bridgeDamage, 8);
  // Defended by Théodred (1 defense, 4 hit points): 7 damage, 3 excess.
  const theodred = s.heroes.find((h) => h.code === "01002")!;
  s = run(s, ...(H.questBegin!(s) ?? []));
  s = choose(s, theodred.id);
  s = settle(s);
  assert.ok(!s.heroes.some((h) => h.id === theodred.id));
  assert.equal(s.status, "lost", "8 + 3 damage on the stage");
  assert.match(
    s.reason ?? "",
    /The Bridge of Khazad-dûm has damage equal to its quest points/,
  );
  // The progress cap and the victory.
  s = base();
  bane(s);
  atQuest(s, EK.bridge);
  s.escapeKhazad!.defeated = [EK.depths, EK.lair];
  progress(s, 8);
  flush(s);
  assert.equal(s.progress, 5);
  assert.equal(view(s).bridgeCap, 0);
  progress(s, 2);
  flush(s);
  assert.equal(s.progress, 5);
  s.round += 1;
  assert.equal(view(s).bridgeCap, 5);
  progress(s, 5);
  flush(s);
  advance(s);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /escape through the East Gate/);
  void b;
});

test("Last Lord of Moria (3B): Durin's Bane engages the first player and follows the first player token; it cannot take more than X damage each round (X the progress on the stage), and the stage cannot be defeated while it is in play", () => {
  let s = base(2);
  const b = bane(s);
  atQuest(s, EK.lastLord);
  s.escapeKhazad!.defeated = [EK.depths, EK.lair];
  s = run(s, fx("ekLastLord", { player: 0 }));
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === b.id));
  assert.equal(view(s).bane, "engaged");
  s.progress = 3;
  damage(s, b.id, 5, { combatDamage: true });
  flush(s);
  assert.equal(b.damage, 3);
  damage(s, b.id, 2, { combatDamage: true });
  flush(s);
  assert.equal(b.damage, 3, "no more than 3 damage this round");
  s.round += 1;
  damage(s, b.id, 5, { combatDamage: true });
  flush(s);
  assert.equal(b.damage, 6);
  s.progress = 15;
  advance(s);
  assert.equal(s.status, "playing", "Durin's Bane is in play");
  // The first player token passes: Durin's Bane engages the new first player.
  s.table!.first = 1;
  H.firstPlayerChanged!(s, true);
  flush(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === b.id));
  assert.ok(!seatView(s, 0).engaged.some((u) => u.id === b.id));
  reload(s);
  // Revealed: Durin's Bane engages the first player.
  let t = base();
  baneAside(t);
  atQuest(t, EK.lair);
  t.escapeKhazad!.defeated = [EK.depths];
  t.escapeKhazad!.questDeck = [EK.lastLord];
  t.encounterDeck = Array(6).fill(EK.mithril);
  t.progress = 10;
  advance(t);
  t = settle(t);
  assert.equal(view(t).side, "3B");
  assert.ok(t.engaged.some((u) => u.code === EK.bane));
  // Destroyed (it goes to the victory display), the stage can be defeated.
  const tb = t.engaged.find((u) => u.code === EK.bane)!;
  t.round += 1;
  t.progress = 15;
  tb.damage = 14;
  damage(t, tb.id, 1, { combatDamage: true });
  flush(t);
  t = settle(t);
  assert.ok((t.victoryCards ?? []).includes(EK.bane));
  advance(t);
  assert.equal(t.status, "won");
});

test("The Rear Guard (3B): each player's threat cannot be reduced by player card effects, and Durin's Bane is considered engaged with each player and attacks each of them; defeating the stage wins", () => {
  let s = base(2);
  const b = bane(s);
  atQuest(s, EK.rearGuard);
  s.escapeKhazad!.defeated = [EK.depths, EK.lair];
  for (const p of [0, 1])
    assert.ok(
      engagedEnemies(s, p).some((u) => u.id === b.id),
      `Durin's Bane is considered engaged with player ${p}`,
    );
  forOwner(s, 0, () => {
    assert.equal(reduceThreat(s, 3, undefined, "player-card"), 0);
    assert.equal(reduceThreat(s, 2, undefined, "encounter"), 2);
  });
  assert.equal(seatView(s, 0).threat, 18);
  s.encounterDeck = Array(6).fill(EK.mithril);
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: b.id,
    defenderId: seatView(s, 0).heroes[0].id,
  });
  s = settle(s);
  assert.ok(s.log.some((l) => /Durin's Bane/.test(l.text)));
  s.progress = 20;
  advance(s);
  assert.equal(s.status, "won");
});

test("Saves: the scenario state round-trips, and malformed state is rejected", () => {
  const s = base(2);
  pit(s);
  reload(s);
  for (const bad of [
    { bridgeDamage: -1 },
    { baneAside: "yes" },
    { lair: 5 },
    { dungeon: [{ locationId: "x", player: -1, ally: {} }] },
    { nameless: [{ enemyId: "x", player: 0 }] },
    {
      penalties: [
        { id: "x", key: "1:quest", will: "1", attack: 0, defense: 0 },
      ],
    },
  ]) {
    const raw = JSON.parse(JSON.stringify(s));
    Object.assign(raw.escapeKhazad, bad);
    assert.equal(validateSave(raw), false, JSON.stringify(bad));
  }
  const raw = JSON.parse(JSON.stringify(s));
  delete raw.escapeKhazad;
  assert.equal(validateSave(raw), false, "the scenario state is required");
  void canTravel;
});
