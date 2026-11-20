import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { revealed } from "../src/game/board";
import { engagementCost, fx, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  BOFA,
  BOFA_RECIPES,
  bofaStageProgress,
} from "../src/game/battle-five-armies";
import {
  NIGHTMARE,
  NIGHTMARE_OTD as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Hidden Path: a location with no effect while in the staging area. */
const QUIET = BOFA.path;
const ID = "the-battle-of-five-armies";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board with the three stages in play (The Eastern Spur current) and Bolg staged. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    stage: 2,
    stageRevealing: false,
    encounterDeck: Array(20).fill(QUIET),
    encounterDiscard: [],
    nightmare: {},
  });
  s.staging = s.staging.filter((u) => u.code === BOFA.bolg);
  Object.assign(s.battleFiveArmies!, {
    currentQuest: BOFA.spur,
    stageProgress: { [BOFA.dale]: 0, [BOFA.ravenhill]: 0 },
    chosenRound: s.round,
    advancing: false,
    resolving: [],
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, allies: [], engaged: [], hand: [] });
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  return s;
}
/** Stage 5B: The Clouds Burst. */
function stageFive(s: GameState) {
  Object.assign(s.battleFiveArmies!, {
    currentQuest: BOFA.clouds,
    stageProgress: {},
  });
  s.stage = 5;
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
function run(s: GameState, effects: GameState["queue"] = []) {
  s.queue.unshift(...effects);
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const threats = (s: GameState) =>
  seatIndices(s).map((p) => {
    let t = 0;
    forOwner(s, p, () => (t = s.threat));
    return t;
  });
const progressOf = (s: GameState) =>
  [BOFA.spur, BOFA.dale, BOFA.ravenhill].map((c) => bofaStageProgress(s, c));

test("Nightmare: The Battle of Five Armies' setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.bofaCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Battle of Five Armies - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Dark Bats\n3x Hidden Path\n2x Fighting Among Friends\n1x Vanguard of Bolg\n1x Ravenous Warg\n4x Gundabad Climber\n3x Gundabad Wolf Rider\n1x Misty Mountain Eagle\n/,
  );
  assert.match(c.back_text!, /^You are playing Nightmare mode\.\n/);
  assert.match(c.back_text!, /players are instructed to remove/);
  assert.match(c.back_text!, /\n4 players: X equals 11$/);
  const elite = card(N.elite);
  assert.deepEqual(
    [elite.engagement, elite.threat, elite.attack, elite.defense, elite.health],
    [40, 2, 5, 3, 5],
  );
  assert.match(card(N.valley).text!, /\nTravel: The players \(as a group\)/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Battle of Five Armies - Nightmare",
  );
  assert.equal(set.length, 7);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((a) => set.some((x) => x.code === a.code)).length, 8);
});

test("Nightmare: The Battle of Five Armies' Nightmare deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const pile = (
    cards: { code: string; quantity: number; section: string }[],
    section: string,
  ) =>
    cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const nightmare = recipes.find((r) => r.id === "N0A.6")!.cards;
  const standard = BOFA_RECIPES.find((r) => r.mode === "standard")!.cards;
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, pile(standard, "sharedEncounterDeck"))),
    count(pile(nightmare, "sharedEncounterDeck")),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.bofaCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.bofaCard);
    assert.deepEqual(
      count(s.encounterDeck),
      count(pile(nightmare, "sharedEncounterDeck")),
    );
  }
  assert.match(nightmareStatus(game())[0], /with 5 \(0 now\)/);
  assert.match(nightmareStatus(two())[0], /with 7 \(0 now\)/);
  assert.ok(valid(opening(game())));
});

test("Nightmare: at stage 5B each instruction to remove progress places 1 progress on the setup card instead, and the players lose at X", () => {
  // Before stage 5, progress is removed as usual.
  const s = board("planning");
  s.progress = 3;
  run(s, [fx("bofaRemoveProgress", { value: 2, text: "Test", player: 0 })]);
  assert.equal(s.progress, 1);
  assert.equal(s.nightmare?.bofaProgress, undefined);
  // Stage 5B: each instruction places 1 progress on the setup card.
  stageFive(s);
  for (let i = 1; i <= 4; i++) {
    run(s, [fx("bofaRemoveProgress", { value: 99, player: 0 })]);
    assert.equal(s.nightmare?.bofaProgress, i);
  }
  assert.equal(s.status, "playing");
  assert.match(nightmareStatus(s)[0], /with 5 \(4 now\)/);
  // A Ruins location's instruction counts too.
  run(s, [fx("bofaRuins", { code: BOFA.ruins, player: 0 })]);
  assert.equal(s.nightmare?.bofaProgress, 5);
  assert.equal(s.status, "lost");
  // Two players: X is 7.
  const t = stageFive(board("planning", opening(two())));
  for (let i = 0; i < 6; i++)
    run(t, [fx("bofaRemoveProgress", { value: 1, player: 0 })]);
  assert.equal(t.status, "playing");
  run(t, [fx("bofaRemoveProgress", { value: 1, player: 0 })]);
  assert.equal(t.status, "lost");
});

test("Nightmare: Great Warg clears the current quest when it destroys a character, and its shadow takes an attachment", () => {
  const s = board("attack");
  s.progress = 5;
  const warg = add(s, N.greatWarg, true);
  s.combat = {
    enemyId: warg.id,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  const ctx = { combatDamage: true, enemyId: warg.id };
  hooks(s).characterDestroyed!(s, s.heroes[0], ctx);
  hooks(s).characterDestroyed!(s, s.heroes[1], ctx);
  run(s);
  assert.equal(s.progress, 0);
  // At stage 5B a second destroyed character in the same attack adds nothing.
  const t = stageFive(board("attack"));
  const w2 = add(t, N.greatWarg, true);
  t.combat = {
    enemyId: w2.id,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  const c2 = { combatDamage: true, enemyId: w2.id };
  hooks(t).characterDestroyed!(t, t.heroes[0], c2);
  hooks(t).characterDestroyed!(t, t.heroes[1], c2);
  run(t);
  assert.equal(t.nightmare?.bofaProgress, 1);
  // Its shadow: the defending player discards an attachment they control.
  let u = board("attack");
  const h = u.heroes[0];
  h.attachments.push({ id: "a1", code: "01040", exhausted: false, owner: 0 });
  shadow(u, add(u, N.frenzied, true), N.greatWarg);
  run(u);
  u = pick(u, "a1");
  assert.equal(h.attachments.length, 0);
});

test("Nightmare: Frenzied Warg-Rider strips every stage as it attacks, and its shadow hurts more on an empty quest", () => {
  const s = board("attack");
  s.progress = 2;
  s.battleFiveArmies!.stageProgress = { [BOFA.dale]: 1, [BOFA.ravenhill]: 0 };
  hooks(s).enemyAttackStarted!(s, add(s, N.frenzied, true), 0);
  run(s);
  assert.deepEqual(progressOf(s), [1, 0, 0]);
  const t = board("attack");
  const d = t.heroes[0];
  shadow(t, add(t, N.frenzied, true), N.frenzied, d);
  assert.equal(d.damage, 2, "the current quest has no progress");
  const u = board("attack");
  u.progress = 1;
  shadow(u, add(u, N.frenzied, true), N.frenzied, u.heroes[0]);
  assert.equal(u.heroes[0].damage, 1);
});

test("Nightmare: Gundabad Elite cannot be optionally engaged, and at the end of the round takes 2 progress or attacks the first player", () => {
  let s = board("refresh");
  const elite = add(s, N.elite);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, elite), true);
  assert.equal(engagementCost(s, elite), 40);
  s.progress = 3;
  run(s, hooks(s).roundEnd!(s));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["progress", "attack"],
  );
  s = pick(s, "progress");
  assert.equal(s.progress, 1);
  // With fewer than 2 progress, it attacks.
  const t = board("refresh");
  add(t, N.elite);
  t.progress = 1;
  run(t, hooks(t).roundEnd!(t));
  assert.ok(t.combat?.immediate, "an immediate attack");
});

test("Nightmare: Embattled Valley and Eastern Ridge punish the empty stages at the end of the round", () => {
  // Three empty stages: 3 damage assigned among each player's heroes, and 3 threat.
  let s = board("refresh");
  add(s, N.valley);
  add(s, N.ridge);
  run(s, hooks(s).roundEnd!(s));
  for (let i = 0; i < 3; i++) s = pick(s, s.heroes[0].id);
  run(s);
  assert.equal(s.heroes[0].damage, 3);
  assert.equal(s.threat, 23);
  // Embattled Valley's Travel: the players exhaust X characters.
  let t = board("travel");
  t.progress = 1;
  const valley = add(t, N.valley);
  assert.equal(hooks(t).travelProblem!(t, valley), null);
  run(t, hooks(t).travelEffects!(t, valley));
  t = pick(t, t.heroes[0].id);
  t = pick(t, t.heroes[1].id);
  assert.equal(t.choice, null);
  assert.deepEqual(
    t.heroes.slice(0, 3).map((h) => h.exhausted),
    [true, true, false],
  );
  // Eastern Ridge's shadow: +1 [defense] for each empty stage this phase.
  const u = board("attack");
  const enemy = add(u, N.greatWarg, true);
  const before = stats(u, enemy).defense;
  shadow(u, enemy, N.ridge);
  assert.equal(stats(u, enemy).defense, before + 3);
  u.phase = "refresh";
  assert.equal(stats(u, enemy).defense, before);
});

test("Nightmare: Dread Has Come! sends Bolg at each player, and a destroyed character stops the round's progress", () => {
  const s = board("staging", opening(two()));
  const bolg = s.staging.find((u) => u.code === BOFA.bolg)!;
  revealed(s, N.dread);
  run(s);
  assert.equal(s.combat?.enemyId, bolg.id);
  assert.equal(s.nightmare?.bofaDread, 1);
  hooks(s).characterDestroyed!(s, s.heroes[0], {
    combatDamage: true,
    enemyId: bolg.id,
  });
  assert.equal(s.nightmare?.bofaNoProgress, s.round);
  const quest = mainQuestUnit(s)!;
  const before = s.progress;
  addCurrentQuestProgress(s, 3, quest);
  assert.equal(s.progress, before, "no progress this round");
  // Its shadow: +2 [attack].
  const t = board("attack");
  shadow(t, add(t, N.frenzied, true), N.dread);
  assert.equal(t.combat!.attackBonus, 2);
});

test("Nightmare: The Battle of Five Armies' Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    bofaProgress: 2,
    bofaDread: 1,
    bofaNoProgress: 1,
    bofaRidge: [{ enemy: "u1", amount: 2, round: 1, phase: "combat" }],
  };
  assert.ok(valid(s));
  s.nightmare = { bofaProgress: -1 };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
