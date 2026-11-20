import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  oneRing,
  ringBearer,
  ringBearerRevealOptions,
} from "../src/game/lotr-saga";
import {
  KD,
  KNIFE_DARK_QUESTS,
  KNIFE_DARK_RECIPES,
} from "../src/game/knife-dark";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_TBR as N,
  nightmareCardOf,
  nightmareEncounterDecks,
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

const ID = "a-knife-in-the-dark";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** Chetwood: a location without a When Revealed effect. */
const QUIET = KD.chetwood;
/** A quiet board on stage 1: nothing in the staging area, no active location, the setup's cards set aside. */
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
  });
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
  oneRing(s)!.exhausted = false;
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
const threatOf = (s: GameState, p: number) => seatView(s, p).threat;
const characters = (s: GameState, p: number): Unit[] => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const aside = (s: GameState, code: string) =>
  s.knifeDark!.setAside.filter((c) => c === code).length;

test("Nightmare: A Knife in the Dark's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.knifeCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "A Knife in the Dark - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n4x Shady Bree-lander\n3x Weather Hills\n1x Unwanted Attention\n3x Pathless Country\n1x Weathertop\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    'You are playing Nightmare mode.\nWhile Bill Ferny is in the staging area, he gains: "Immune to player card effects."',
  );
  assert.equal(
    card(N.wraith).text,
    "Cannot have non-Morgul attachments.\nForced: After The One Ring is exhausted, Menacing Wraith engages the first player and makes an immediate attack.",
  );
  const w = card(N.weathertop);
  assert.deepEqual(
    [w.is_unique, w.traits, w.threat, w.quest, w.victory],
    [true, "Hills. Ruins.", 4, 6, 3],
  );
  assert.equal(
    w.text,
    "Immune to player card effects.\nThe Witch-king cannot be damaged.\nForced: After Weathertop becomes the active location, exhaust The One Ring. The One Ring cannot ready while Weathertop is the active location.",
  );
  assert.equal(
    card(N.spy).shadow,
    "Shadow: Defending character gets -1 [defense] (-3 [defense] instead if The One Ring is exhausted).",
  );
  assert.match(
    card(N.oldRoad).text!,
    /on it\.\nForced: At the end of the round/,
  );
  assert.match(
    card(N.inn).text!,
    /controls\.\nTravel: The first player searches/,
  );
  assert.equal(card(N.bladeTip).text, "Surge. Doomed 1.");
  const set = encounterCards.filter(
    (x) => x.encounter_set === "A Knife in the Dark - Nightmare",
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

test("Nightmare: A Knife in the Dark's Nightmare deck and set-aside cards match its source recipe, its Weathertop in the scenario's place", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    name: string;
    mode: string;
    campaign: boolean;
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
      .filter((c) => c.section === section && c.code !== N.knifeCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.02")!;
  const standard = KNIFE_DARK_RECIPES.find((r) => r.mode === "standard")!;
  const [deck, setAside] = nightmareEncounterDecks(
    ID,
    [pile(standard, "sharedEncounterDeck"), pile(standard, "sharedSetAside")],
    (code) => (code === N.weathertop ? 1 : 0),
  );
  assert.deepEqual(count(deck), count(pile(nightmare, "sharedEncounterDeck")));
  assert.deepEqual(count(setAside), count(pile(nightmare, "sharedSetAside")));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.knifeCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.knifeCard);
    assert.ok(valid(s));
    assert.deepEqual(
      count(s.encounterDeck),
      count(pile(nightmare, "sharedEncounterDeck")),
    );
    assert.equal(aside(s, N.weathertop), 1);
    assert.equal(aside(s, KD.weathertop), 0);
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /while Bill Ferny is in the staging area, he is immune to player card effects/,
  );
  for (const id of ["N0B.02", "N0C.02"])
    assert.equal(
      automatedScenarioId(recipes.find((r) => r.id === id)!),
      id === "N0B.02" ? ID : null,
      id,
    );
});

test("Nightmare: A Knife in the Dark's setup card makes Bill Ferny immune to player card effects in the staging area only", () => {
  const s = board("planning");
  const ferny = enemy(s, KD.ferny);
  assert.equal(hooks(s).immune!(s, ferny), true);
  s.staging = [];
  forOwner(s, 0, () => s.engaged.push(ferny));
  assert.equal(!!hooks(s).immune!(s, ferny), false);
});

test("Nightmare: Menacing Wraith engages the first player and attacks after The One Ring exhausts, whatever exhausted it", () => {
  // Lure of the Ring's exhaust, with the Wraith engaged with the second player.
  let s = board("staging", opening(two()));
  const wraith = enemy(s, N.wraith, 1);
  s.queue.unshift(fx("spLureExhaust", { player: 0 }));
  run(s);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.ok(seatView(s, 0).engaged.some((x) => x.id === wraith.id));
  assert.equal(s.combat?.enemyId, wraith.id);
  // Frodo Baggins' cancel exhausts The One Ring too.
  s = board("staging");
  const staged = enemy(s, N.wraith);
  ringBearer(s)!.resources = 1;
  s.encounterDeck = [QUIET, QUIET];
  revealed(s, QUIET);
  run(s);
  const frodo = options(s).find((id) => id.startsWith("saga-frodo"))!;
  pick(s, frodo);
  run(s);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.ok(s.engaged.some((x) => x.id === staged.id));
  assert.match(
    logText(s),
    /Menacing Wraith: The One Ring is exhausted; it engages you/,
  );
});

test("Nightmare: Southern Spy shuffles an out of play Ringwraith or attacks the revealing player, and its shadow lowers the defense", () => {
  let s = board("staging");
  const before = aside(s, KD.ringwraith);
  revealed(s, N.spy);
  run(s);
  assert.deepEqual(options(s), ["ringwraith", "attack"]);
  pick(s, "ringwraith");
  run(s);
  assert.equal(aside(s, KD.ringwraith), before - 1);
  assert.ok(s.encounterDeck.includes(KD.ringwraith));
  // Without an out of play Ringwraith: the attack.
  s = board("staging");
  s.knifeDark!.setAside = s.knifeDark!.setAside.filter(
    (c) => c !== KD.ringwraith,
  );
  revealed(s, N.spy);
  run(s);
  assert.equal(s.combat?.enemyId, s.staging.find((u) => u.code === N.spy)!.id);
  // The shadow.
  const t = board("combat");
  const attacker = enemy(t, KD.rider, 0);
  shadow(t, attacker, N.spy, characters(t, 0)[0], 0);
  assert.equal(t.combat!.defensePenalty, 1);
  oneRing(t)!.exhausted = true;
  shadow(t, attacker, N.spy, characters(t, 0)[0], 0);
  assert.equal(t.combat!.defensePenalty, 3);
});

test("Nightmare: Weathertop joins at stage 3, is immune, shields The Witch-king, and exhausts The One Ring for good while it is the active location", () => {
  const s = board("quest");
  s.stage = 2;
  s.knifeDark!.currentQuest = KNIFE_DARK_QUESTS[1].code;
  s.queue.unshift(fx("kdNextStage", { player: 0 }));
  run(s);
  assert.equal(s.stage, 3);
  const top = s.staging.find((u) => u.code === N.weathertop)!;
  const king = s.staging.find((u) => u.code === KD.witchKing)!;
  assert.ok(top && king);
  assert.equal(hooks(s).immune!(s, top), true);
  damage(s, king.id, 3);
  run(s);
  assert.equal(king.damage, 0);
  assert.match(logText(s), /Weathertop: The Witch-king cannot be damaged/);
  // Becoming the active location: The One Ring exhausts and cannot ready.
  s.staging = s.staging.filter((u) => u.id !== top.id);
  s.activeLocation = top;
  hooks(s).travelEntered!(s, top, true);
  run(s);
  const frodo = ringBearer(s)!;
  const ring = oneRing(s)!;
  assert.equal(ring.exhausted, true);
  assert.equal(hooks(s).attachmentCannotReady!(s, frodo, ring), true);
  s.activeLocation = null;
  assert.equal(hooks(s).attachmentCannotReady!(s, frodo, ring), false);
});

test("Nightmare: Weather Hills refuses progress at stage 1, grows with The One Ring exhausted, and its shadow adds 2 attack", () => {
  const s = board("quest");
  const hills = place(s, N.hills);
  assert.equal(hooks(s).locationProgressBlocked!(s, hills), true);
  s.stage = 2;
  assert.equal(hooks(s).locationProgressBlocked!(s, hills), false);
  assert.equal(hooks(s).threatBonus!(s, hills), 0);
  oneRing(s)!.exhausted = true;
  assert.equal(hooks(s).threatBonus!(s, hills), 2);
  const t = board("combat");
  shadow(t, enemy(t, KD.rider, 0), N.hills, characters(t, 0)[0], 0);
  assert.equal(t.combat!.attackBonus, 2);
});

test("Nightmare: The Old Road enters play with 3 resource tokens, loses one each round, and then shuffles out of play Ringwraiths into the encounter deck", () => {
  const s = board("staging");
  s.encounterDeck = [N.oldRoad, QUIET];
  revealed(s, N.oldRoad);
  run(s);
  const road = s.staging.find((u) => u.code === N.oldRoad)!;
  assert.equal(road.resources, 3);
  const before = aside(s, KD.ringwraith);
  for (let i = 0; i < 3; i++) {
    s.queue.unshift(...hooks(s).roundEnd!(s));
    run(s);
  }
  assert.equal(road.resources, 0);
  assert.equal(aside(s, KD.ringwraith), before - 1);
  s.queue.unshift(...hooks(s).roundEnd!(s));
  run(s);
  assert.equal(aside(s, KD.ringwraith), before - 2);
});

test("Nightmare: Forsaken Inn's threat counts the first player's characters, and its Travel cost reveals a Spy enemy into the staging area", () => {
  const s = board("travel");
  const inn = place(s, N.inn);
  assert.equal(hooks(s).threatBonus!(s, inn), characters(s, 0).length);
  s.encounterDeck = [QUIET, N.spy, QUIET];
  s.knifeDark!.setAside = s.knifeDark!.setAside.filter(
    (c) => c !== KD.ringwraith,
  );
  s.queue.unshift(...hooks(s).travelEffects!(s, inn)!);
  run(s);
  assert.ok(!s.encounterDeck.includes(N.spy));
  assert.ok(s.staging.some((u) => u.code === N.spy));
  assert.match(
    logText(s),
    /Forsaken Inn: Southern Spy is revealed from the encounter deck/,
  );
});

test("Nightmare: The Ring's Will raises each player's threat by 5, resists cancellation with The One Ring exhausted and the Ring-bearer's, and its shadow sends the attacker to the next player", () => {
  const s = board("staging", opening(two()));
  revealed(s, N.ringsWill);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => threatOf(s, p)),
    [25, 25],
  );
  assert.equal(hooks(s).cannotCancel!(s, false, N.ringsWill), false);
  oneRing(s)!.exhausted = true;
  assert.equal(hooks(s).cannotCancel!(s, false, N.ringsWill), true);
  oneRing(s)!.exhausted = false;
  ringBearer(s)!.resources = 1;
  assert.deepEqual(
    ringBearerRevealOptions(s, N.ringsWill, "encounter", fx("revealCard")),
    [],
  );
  const t = board("combat", opening(two()));
  const attacker = enemy(t, KD.rider, 0);
  shadow(t, attacker, N.ringsWill, characters(t, 0)[0], 0);
  const after = hooks(t).attackFinished!(t, t.combat!);
  assert.deepEqual(after, [
    fx("nkdEngageNext", { target: attacker.id, player: 1 }),
  ]);
  t.combat = null;
  t.queue.unshift(...after);
  run(t);
  assert.ok(seatView(t, 1).engaged.some((x) => x.id === attacker.id));
});

test("Nightmare: Blade Tip surges with doomed 1, and its shadow attaches it to a damaged defender, whose controller then raises their threat by 2 each refresh phase", () => {
  const s = board("staging");
  s.encounterDeck = [QUIET, QUIET];
  revealed(s, N.bladeTip);
  run(s);
  assert.equal(threatOf(s, 0), 21, "its printed doomed 1");
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "its printed surge",
  );
  const t = board("combat");
  const attacker = enemy(t, KD.rider, 0);
  const defender = characters(t, 0)[0];
  shadow(t, attacker, N.bladeTip, defender, 0);
  damage(t, defender.id, 1, { combatDamage: true, enemyId: attacker.id });
  run(t);
  assert.ok(defender.attachments.some((a) => a.code === N.bladeTip));
  assert.ok(!attacker.shadows.includes(N.bladeTip));
  t.queue.unshift(...hooks(t).refreshEndForced!(t));
  run(t);
  assert.equal(threatOf(t, 0), 22);
});

test("Nightmare: A Knife in the Dark's seeded Nightmare games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
