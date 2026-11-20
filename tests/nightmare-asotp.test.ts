import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { hideValue, resolveHideTest } from "../src/game/hide-test";
import { oneRing } from "../src/game/lotr-saga";
import {
  SHADOW_PAST_QUESTS,
  SHADOW_PAST_RECIPES,
  SP,
} from "../src/game/shadow-past";
import { allQuestUnits } from "../src/game/quest-state";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_TBR as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
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

const ID = "a-shadow-of-the-past";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A location without an effect in the staging area (the standard Green Hill Country), threat 2. */
const QUIET = SP.greenHill;
/** A treachery: 0 threat when a Hide test discards it. */
const ZERO = SP.lure;
/** The Marish: 3 threat when a Hide test discards it. */
const HEAVY = SP.marish;
/** A quiet board on stage 1: nothing in the staging area, no active location, no failed Hide test. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
    staging: [],
    hideFailures: [],
  });
  delete s.hideTest;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [] });
      // The One Ring stays with the Ring-bearer; without resources Frodo
      // Baggins cannot cancel a revealed card.
      for (const h of [...s.heroes, ...s.allies])
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          resources: 0,
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
function place(s: GameState, code: string, active = false) {
  const u = make(s, code);
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
function enemy(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function run(s: GameState) {
  for (let i = 0; i < 60; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const logText = (s: GameState) =>
  s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** Commit no character to the pending Hide test, discard, and resolve it. */
function noCommit(s: GameState) {
  assert.match(s.choice!.title, /Hide \d+ test · Commit characters/);
  pick(s, "done");
  assert.equal(s.hideTest?.phase, "actions");
  resolveHideTest(s);
  return s;
}
const threatOf = (s: GameState, p: number) => seatView(s, p).threat;
const characters = (s: GameState, p: number): Unit[] => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];

test("Nightmare: A Shadow of the Past's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.shadowCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "A Shadow of the Past - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n3x Evil Crow\n1x Woody End\n1x Bamfurlong\n1x Stock-brook\n3x Green Hill Country\n3x Pathless Country\n2x Rode Like a Gale\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When stage 3A is revealed, if Khamûl the Easterling is not in play, the first player searches the encounter deck, discard pile, and victory display for Khamûl the Easterling and adds it to the staging area. Shuffle the encounter deck.",
  );
  const k = card(N.khamul);
  assert.deepEqual(
    [
      k.is_unique,
      k.traits,
      k.engagement,
      k.threat,
      k.attack,
      k.defense,
      k.health,
    ],
    [true, "Nazgûl.", 40, 5, 6, 4, 8],
  );
  assert.equal(
    k.text,
    "Cannot have non-Morgul attachments.\nKhamûl the Easterling gets -30 engagement cost while The One Ring is exhausted.\nForced: At the beginning of the refresh phase, the engaged player makes a Hide 2 test. If the engaged player fails the hide test, Khamûl the Easterling makes an immediate attack.",
  );
  assert.equal(
    card(N.horseman).text,
    "Peril. Hide 2.\nCannot have non-Morgul attachments.\nWhile Dark Horseman is engaged with you, characters you control get -1 [willpower] during Hide tests.",
  );
  assert.match(
    card(N.eastfarthing).text!,
    /on it\.\nForced: After a player fails a Hide test/,
  );
  assert.equal(
    card(N.greenHill).shadow,
    "Shadow: After this attack, attacking enemy engages the next player then makes an immediate attack.",
  );
  assert.match(
    card(N.stockWoods).text!,
    /to a Hide test\.\nTravel: The first player makes a Hide 1 test\.$/,
  );
  assert.equal(
    card(N.sniffing).text,
    "Doomed 2.\nWhen Revealed: The first player must either exhaust The One Ring and reveal an encounter card, or make a Hide 3 test.",
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "A Shadow of the Past - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: A Shadow of the Past's Nightmare deck matches its source recipe for one and two players", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.shadowCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const want = pile(
    recipes.find((r) => r.id === "N0B.01")!,
    "sharedEncounterDeck",
  );
  const standard = pile(
    SHADOW_PAST_RECIPES.find((r) => r.mode === "standard")!,
    "sharedEncounterDeck",
  );
  assert.deepEqual(count(nightmareEncounterDeck(ID, standard)), count(want));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.shadowCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.shadowCard);
    assert.ok(valid(s));
    assert.deepEqual(count(s.encounterDeck), count(want));
    assert.equal(s.activeLocation?.code, SP.bagEnd);
    assert.deepEqual(
      s.staging.map((u) => u.code),
      [SP.rider],
    );
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /when stage 3A is revealed, Khamûl the Easterling joins the staging area/,
  );
  // The audit counts the standard Nightmare recipe, not the campaign mode one
  // (Nightmare mode is played outside campaign mode).
  for (const id of ["N0B.01", "N0C.01"]) {
    const r = recipes.find((x) => x.id === id) as unknown as {
      name: string;
      mode: string;
      campaign: boolean;
    };
    assert.equal(automatedScenarioId(r), id === "N0B.01" ? ID : null, id);
  }
});

test("Nightmare: A Shadow of the Past's setup card brings Khamûl the Easterling when stage 3A is revealed, unless he is in play", () => {
  const stageTwo = (s: GameState) => {
    s.stage = 2;
    s.shadowPast!.currentQuest = SHADOW_PAST_QUESTS[1].code;
    return s;
  };
  // From the encounter deck, after the stage's own effects.
  let s = stageTwo(board("quest"));
  s.encounterDeck = [ZERO, N.khamul, ZERO];
  s.queue.unshift(fx("spNextStage", { player: 0 }));
  run(s);
  assert.equal(s.stage, 3);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [SP.ferry, N.khamul],
  );
  assert.ok(!s.encounterDeck.includes(N.khamul));
  assert.match(
    logText(s),
    /Stage 3A: Khamûl the Easterling is added to the staging area/,
  );
  // From the discard pile, then the victory display.
  s = stageTwo(board("quest"));
  s.encounterDiscard = [N.khamul];
  s.queue.unshift(fx("spNextStage", { player: 0 }));
  run(s);
  assert.ok(s.staging.some((u) => u.code === N.khamul));
  assert.deepEqual(s.encounterDiscard, []);
  s = stageTwo(board("quest"));
  s.victoryCards = [N.khamul];
  s.queue.unshift(fx("spNextStage", { player: 0 }));
  run(s);
  assert.ok(s.staging.some((u) => u.code === N.khamul));
  assert.deepEqual(s.victoryCards, []);
  // In play: no second Khamûl.
  s = stageTwo(board("quest"));
  enemy(s, N.khamul, 0);
  s.encounterDiscard = [N.khamul];
  s.queue.unshift(fx("spNextStage", { player: 0 }));
  run(s);
  assert.ok(!s.staging.some((u) => u.code === N.khamul));
  assert.deepEqual(s.encounterDiscard, [N.khamul]);
});

test("Nightmare: Khamûl the Easterling engages early with The One Ring exhausted, and his refresh-phase Hide test brings his attack before the failure's Forced effects", () => {
  let s = board("refresh");
  const k = enemy(s, N.khamul, 0);
  assert.equal(hooks(s).engagementBonus!(s, k), 0);
  oneRing(s)!.exhausted = true;
  assert.equal(hooks(s).engagementBonus!(s, k), -30);
  oneRing(s)!.exhausted = false;
  s.encounterDeck = [HEAVY, HEAVY, QUIET];
  s.queue.unshift(...hooks(s).refreshStart!(s));
  run(s);
  assert.deepEqual(
    [s.hideTest?.source, s.hideTest?.value, s.hideTest?.player],
    [N.khamul, 2, 0],
  );
  noCommit(s);
  assert.equal(s.queue[0].kind, "nshKhamulAttack");
  assert.ok(s.queue.some((e) => e.kind === "spFailForced"));
  run(s);
  assert.equal(s.combat?.enemyId, k.id);
  // A passed test: no attack.
  s = board("refresh");
  enemy(s, N.khamul, 0);
  s.encounterDeck = [ZERO, ZERO, QUIET];
  s.queue.unshift(...hooks(s).refreshStart!(s));
  run(s);
  noCommit(s);
  assert.ok(!s.queue.some((e) => e.kind === "nshKhamulAttack"));
});

test("Nightmare: Dark Horseman's Hide 2 resolves as it is revealed, and it weakens only its engaged player's characters in Hide tests", () => {
  const s = board("staging", opening(two()));
  revealed(s, N.horseman);
  run(s);
  assert.deepEqual([s.hideTest?.source, s.hideTest?.value], [N.horseman, 2]);
  const t = board("quest", opening(two()));
  enemy(t, N.horseman, 1);
  const [mine] = characters(t, 0),
    theirs = characters(t, 1)[0];
  assert.equal(hooks(t).hideWillpower!(t, mine), 0);
  assert.equal(hooks(t).hideWillpower!(t, theirs), -1);
  enemy(t, N.horseman, 1);
  assert.equal(hooks(t).hideWillpower!(t, theirs), -2);
});

test("Nightmare: Eastfarthing takes a resource token after each failed Hide test, in the staging area or active, each worth 2 threat", () => {
  const s = board("quest");
  const staged = place(s, N.eastfarthing),
    active = place(s, N.eastfarthing, true);
  assert.equal(hooks(s).threatBonus!(s, staged), 0);
  s.queue.unshift(...hooks(s).hideFailed!(s, 0, ZERO));
  run(s);
  assert.deepEqual([staged.resources, active.resources], [1, 1]);
  assert.equal(hooks(s).threatBonus!(s, staged), 2);
  s.queue.unshift(...hooks(s).hideFailed!(s, 0, ZERO));
  run(s);
  assert.equal(hooks(s).threatBonus!(s, staged), 4);
  assert.match(
    logText(s),
    /Eastfarthing: a resource token is placed on it \(2, \+4 \[threat\]\)/,
  );
});

test("Nightmare: Green-Hill Country raises each Hide X value, makes a Hide 1 test as its Travel cost, and its shadow sends the attacker to the next player", () => {
  const s = board("quest");
  place(s, N.greenHill);
  place(s, N.greenHill);
  s.queue.unshift(fx("hideBegin", { value: 1, code: ZERO, player: 0 }));
  run(s);
  assert.equal(hideValue(s), 3);
  const t = board("travel");
  const g = place(t, N.greenHill);
  assert.deepEqual(hooks(t).travelEffects!(t, g), [
    fx("hideBegin", { value: 1, code: N.greenHill, player: 0 }),
  ]);
  // Two players: the attacker engages the second player and attacks.
  const u = board("combat", opening(two()));
  const attacker = enemy(u, SP.rider, 0);
  shadow(u, attacker, N.greenHill, characters(u, 0)[0], 0);
  assert.equal(u.combat!.nmEngageNext, 1);
  const after = hooks(u).attackFinished!(u, u.combat!);
  assert.deepEqual(after, [
    fx("nshEngageNext", { target: attacker.id, player: 1 }),
  ]);
  u.combat = null;
  u.queue.unshift(...after);
  run(u);
  assert.ok(seatView(u, 1).engaged.some((x) => x.id === attacker.id));
  assert.equal(u.combat?.enemyId, attacker.id);
  // One player: there is no next player.
  const v = board("combat");
  const solo = enemy(v, SP.rider, 0);
  shadow(v, solo, N.greenHill, characters(v, 0)[0], 0);
  assert.deepEqual(hooks(v).attackFinished!(v, v.combat!), []);
});

test("Nightmare: Stock Woods limits each Hide test to 2 committed characters, makes a Hide 1 test as its Travel cost, and its shadow hits harder after a failed test", () => {
  const s = board("quest");
  place(s, N.stockWoods);
  s.queue.unshift(fx("hideBegin", { value: 1, code: ZERO, player: 0 }));
  run(s);
  assert.match(s.choice!.description!, /\(at most 2 characters\)/);
  const ids = options(s).filter((id) => id !== "done");
  assert.ok(ids.length >= 3);
  pick(s, ids[0]);
  pick(s, ids[1]);
  assert.deepEqual(options(s), ["done"]);
  const t = board("travel");
  const w = place(t, N.stockWoods);
  assert.deepEqual(hooks(t).travelEffects!(t, w), [
    fx("hideBegin", { value: 1, code: N.stockWoods, player: 0 }),
  ]);
  const u = board("combat");
  const attacker = enemy(u, SP.rider, 0);
  shadow(u, attacker, N.stockWoods, characters(u, 0)[0], 0);
  assert.equal(u.combat!.attackBonus, 2);
  u.hideFailures = [{ player: 0, round: u.round, phase: "quest" }];
  shadow(u, attacker, N.stockWoods, characters(u, 0)[0], 0);
  assert.equal(u.combat!.attackBonus, 3);
});

test("Nightmare: In the Name of Mordor! attaches to the current quest with its surge, and each copy discards a random card after a failed Hide test", () => {
  const s = board("staging");
  s.encounterDeck = [QUIET, QUIET];
  revealed(s, N.mordor);
  run(s);
  const quest = allQuestUnits(s)[0];
  assert.deepEqual(
    quest.attachments.map((a) => a.code),
    [N.mordor],
  );
  assert.ok(!s.encounterDiscard.includes(N.mordor));
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "its printed surge",
  );
  s.hand = [make(s, "01062"), make(s, "01062"), make(s, "01062")];
  s.queue.unshift(...hooks(s).hideFailed!(s, 0, ZERO));
  run(s);
  assert.equal(s.hand.length, 2);
  assert.match(logText(s), /In the Name of Mordor!: .* is discarded at random/);
});

test("Nightmare: Followed by Shadows makes each player in turn take a Hide 2 test, failing ones raising their threat by 5, and its shadow leaves a failed player undefended", () => {
  const s = board("staging", opening(two()));
  s.encounterDeck = Array(8).fill(HEAVY);
  revealed(s, N.followed);
  run(s);
  assert.equal(s.hideTest?.player, 0);
  noCommit(s);
  run(s);
  assert.equal(threatOf(s, 0), 25);
  assert.equal(s.hideTest?.player, 1);
  noCommit(s);
  run(s);
  assert.equal(threatOf(s, 1), 25);
  assert.ok(s.encounterDiscard.includes(N.followed));
  // The shadow.
  const t = board("combat");
  const attacker = enemy(t, SP.rider, 0);
  const defender = characters(t, 0)[0];
  shadow(t, attacker, N.followed, defender, 0);
  assert.equal(t.combat!.defenderId, defender.id);
  t.hideFailures = [{ player: 0, round: t.round, phase: "quest" }];
  shadow(t, attacker, N.followed, defender, 0);
  assert.equal(t.combat!.defenderId, null);
  assert.deepEqual(t.combat!.defenderIds, []);
});

test("Nightmare: Sniffing and Hissing exhausts The One Ring for another card or makes a Hide 3 test, and its shadow's kill raises the defending player's threat by 3", () => {
  let s = board("staging");
  s.encounterDeck = [QUIET, QUIET];
  revealed(s, N.sniffing);
  run(s);
  assert.equal(threatOf(s, 0), 22, "its printed doomed 2");
  assert.deepEqual(options(s), ["ring", "hide"]);
  pick(s, "ring");
  run(s);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "the revealed card",
  );
  // With The One Ring exhausted: the Hide 3 test.
  s = board("staging");
  oneRing(s)!.exhausted = true;
  revealed(s, N.sniffing);
  run(s);
  assert.deepEqual([s.hideTest?.source, s.hideTest?.value], [N.sniffing, 3]);
  // The shadow.
  const t = board("combat");
  const attacker = enemy(t, SP.rider, 0);
  const ally = make(t, "01062");
  t.allies.push(ally);
  shadow(t, attacker, N.sniffing, ally, 0);
  assert.equal(t.combat!.attackBonus, 2);
  damage(t, ally.id, 9, { combatDamage: true, enemyId: attacker.id });
  run(t);
  assert.equal(threatOf(t, 0), 23);
});

test("Nightmare: A Shadow of the Past's Hide tests keep their failure effects through saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "refresh");
  s.hideTest = {
    phase: "committing",
    player: 0,
    value: 2,
    source: N.khamul,
    committedIds: [],
    discarded: [],
    continuation: [],
    onFail: [fx("nshKhamulAttack", { target: "c1", player: 0 })],
  };
  assert.ok(valid(s));
  s.hideTest.onFail = "x" as never;
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
