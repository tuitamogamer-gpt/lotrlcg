import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { oneRing, ringBearer } from "../src/game/lotr-saga";
import {
  FF,
  FLIGHT_FORD_QUESTS,
  FLIGHT_FORD_RECIPES,
} from "../src/game/flight-ford";
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

const ID = "flight-to-the-ford";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** The Troll's Camp: a location without an effect in the staging area. */
const QUIET = FF.camp;
/** A quiet board on stage 1: nothing in the staging area, no active location, the Ring-bearer at full life. */
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
  s.flightFord!.life = 15;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [] });
      // The One Ring and An Evil Wound stay with the Ring-bearer; without
      // resources Frodo Baggins cannot cancel a revealed card.
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
const lifeOf = (s: GameState) => s.flightFord!.life;
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
const characters = (s: GameState, p: number): Unit[] => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
/** A character other than the Ring-bearer (An Evil Wound turns its damage into life). */
const other = (s: GameState, p = 0) =>
  characters(s, p).find((u) => u.id !== ringBearer(s)?.id)!;

test("Nightmare: Flight to the Ford's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.fordCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Flight to the Ford - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n4x Fell Rider\n1x Ford of Bruinen\n1x The Troll's Camp\n3x Ettenmoors\n3x Pain Assailed Him\n3x The Old Road\n3x Pathless Country\n3x Stricken Dumb\n2x Rode Like a Gale\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nThe players cannot win while Ford of Bruinen is in play.",
  );
  const rider = card(N.fellRider);
  assert.deepEqual(
    [
      rider.traits,
      rider.engagement,
      rider.threat,
      rider.attack,
      rider.defense,
      rider.health,
    ],
    ["Nazgûl.", 30, 3, 5, 4, 6],
  );
  assert.equal(
    rider.text,
    "Cannot have non-Morgul attachments.\nForced: After Fell Rider attacks and destroys a character, reduce the Ring-bearer's life by 1.",
  );
  const ford = card(N.ford);
  assert.deepEqual(
    [ford.is_unique, ford.traits, ford.threat, ford.quest],
    [true, "River.", 3, 3],
  );
  assert.match(
    card(N.trollshaw).text!,
    /life by 1\."\nTravel: Reduce the Ring-bearer's life by 1 to travel here\.$/,
  );
  assert.match(
    card(N.eastRoad).text!,
    /in play\.\nWhile Great East Road is in the staging area/,
  );
  assert.match(
    card(N.wilderness).text!,
    /on it\.\nForced: At the end of the round/,
  );
  assert.match(
    card(N.twilight).text!,
    /^Doomed 2\.\nWhen Revealed: Attach to the Ring-bearer\. Limit 1 per hero\./,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Flight to the Ford - Nightmare",
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

test("Nightmare: Flight to the Ford's Nightmare deck matches its source recipe, its Fell Riders staged one for each player and its Ford of Bruinen set aside", () => {
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
      .filter((c) => c.section === section && c.code !== N.fordCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.03")!;
  const standard = FLIGHT_FORD_RECIPES.find((r) => r.mode === "standard")!;
  const sections = [
    "sharedEncounterDeck",
    "sharedStagingArea",
    "sharedSetAside",
  ];
  const piles = nightmareEncounterDecks(
    ID,
    sections.map((x) => pile(standard, x)),
    (code) => (code === N.fellRider ? 1 : code === N.ford ? 2 : 0),
  );
  sections.forEach((x, i) =>
    assert.deepEqual(count(piles[i]), count(pile(nightmare, x)), x),
  );
  assert.deepEqual(
    count(pile(standard, "sharedEncounterDeck2")),
    count(pile(nightmare, "sharedEncounterDeck2")),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.fordCard).text!.includes(`${n}x ${title}`), title);
  for (const [s, players] of [
    [opening(game()), 1],
    [opening(two()), 2],
  ] as const) {
    assert.equal(nightmareCardOf(s), N.fordCard);
    assert.ok(valid(s));
    assert.equal(
      s.staging.filter((u) => u.code === N.fellRider).length,
      players,
    );
    assert.equal(
      s.encounterDeck.filter((c) => c === N.fellRider).length,
      4 - players,
    );
    assert.ok(!s.encounterDeck.includes(FF.fell));
    assert.deepEqual(
      s.flightFord!.setAside.sort(),
      [N.ford, FF.witchKing].sort(),
    );
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /the players cannot win while Ford of Bruinen is in play/,
  );
  for (const id of ["N0B.03", "N0C.03"])
    assert.equal(
      automatedScenarioId(recipes.find((r) => r.id === id)!),
      id === "N0B.03" ? ID : null,
      id,
    );
});

test("Nightmare: Flight to the Ford's setup card keeps the players from winning while Ford of Bruinen is in play, and stage 2 brings the Nightmare Ford", () => {
  const s = board("quest");
  s.queue.unshift(fx("ffNextStage", { player: 0 }));
  run(s);
  assert.equal(s.stage, 2);
  const ford = s.staging.find((u) => u.code === N.ford)!;
  assert.ok(ford && s.staging.some((u) => u.code === FF.witchKing));
  assert.equal(hooks(s).immune!(s, ford), true);
  s.staging = s.staging.filter((u) => u.code === N.ford);
  s.flightFord!.currentQuest = FLIGHT_FORD_QUESTS[1].code;
  s.progress = 99;
  hooks(s).advance!(s);
  assert.equal(s.status, "playing");
  assert.equal(hooks(s).cannotWin!(s), true);
  s.staging = [];
  s.victoryCards = [N.ford];
  hooks(s).advance!(s);
  assert.equal(s.status, "won");
});

test("Nightmare: Fell Rider's kill costs the Ring-bearer 1 life, and its shadow adds 1 attack, 2 with The One Ring exhausted", () => {
  const s = board("combat");
  const rider = enemy(s, N.fellRider, 0);
  const victim = other(s);
  s.combat = {
    enemyId: rider.id,
    defenderId: victim.id,
    defenderIds: [victim.id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  damage(s, victim.id, 99, { combatDamage: true, enemyId: rider.id });
  run(s);
  assert.ok(s.combat!.ffDestroyed);
  s.queue.unshift(...hooks(s).attackFinished!(s, s.combat!));
  run(s);
  assert.equal(lifeOf(s), 14);
  const t = board("combat");
  const attacker = enemy(t, N.fellRider, 0);
  shadow(t, attacker, N.fellRider, other(t), 0);
  assert.equal(t.combat!.attackBonus, 1);
  oneRing(t)!.exhausted = true;
  shadow(t, attacker, N.fellRider, other(t), 0);
  assert.equal(t.combat!.attackBonus, 2);
});

test("Nightmare: Ford of Bruinen's Travel cost engages a Nazgûl enemy with each player", () => {
  const s = board("travel", opening(two()));
  const ford = place(s, N.ford);
  s.encounterDeck = [QUIET, N.fellRider, QUIET];
  s.encounterDiscard = [FF.ringwraith];
  s.queue.unshift(...hooks(s).travelEffects!(s, ford)!);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).engaged.map((u) => u.code)),
    [[N.fellRider], [FF.ringwraith]],
  );
  assert.match(logText(s), /Ford of Bruinen: Fell Rider → /);
});

test("Nightmare: Trollshaw Forest costs the Ring-bearer life when a 'when revealed' effect is canceled, Frodo Baggins' cancel included, and to travel there", () => {
  const s = board("staging");
  place(s, N.trollshaw);
  place(s, N.trollshaw);
  hooks(s).whenRevealedCancelled!(s, N.comeBack);
  run(s);
  assert.equal(lifeOf(s), 13, "one for each copy in the staging area");
  // Frodo Baggins' cancel of a card with a When Revealed effect.
  const t = board("staging");
  place(t, N.trollshaw);
  ringBearer(t)!.resources = 1;
  t.encounterDeck = [QUIET, QUIET];
  revealed(t, N.comeBack);
  run(t);
  pick(
    t,
    options(t).find((id) => id.startsWith("saga-frodo"))!,
  );
  run(t);
  assert.equal(lifeOf(t), 14);
  const u = board("travel");
  const forest = place(u, N.trollshaw);
  assert.deepEqual(hooks(u).travelEffects!(u, forest), [
    fx("ffLife", { value: 1, code: N.trollshaw }),
  ]);
});

test("Nightmare: Great East Road's threat counts the Nazgûl in play, it lowers their engagement cost, and its shadow sends the attacker to the next player", () => {
  const s = board("planning", opening(two()));
  const road = place(s, N.eastRoad);
  assert.equal(hooks(s).threatBonus!(s, road), 1);
  const rider = enemy(s, N.fellRider);
  enemy(s, FF.ringwraith, 1);
  assert.equal(hooks(s).threatBonus!(s, road), 3);
  assert.equal(hooks(s).engagementBonus!(s, rider), -5);
  place(s, N.eastRoad);
  assert.equal(hooks(s).engagementBonus!(s, rider), -10);
  const t = board("combat", opening(two()));
  const attacker = enemy(t, FF.ringwraith, 0);
  shadow(t, attacker, N.eastRoad, other(t), 0);
  assert.deepEqual(hooks(t).attackFinished!(t, t.combat!), [
    fx("nffEngageNext", { target: attacker.id, player: 1 }),
  ]);
});

test("Nightmare: Pathless Wilderness enters play with 3 resource tokens, loses one each round, and then costs the Ring-bearer 3 life", () => {
  const s = board("staging");
  s.encounterDeck = [N.wilderness, QUIET];
  revealed(s, N.wilderness);
  run(s);
  const w = s.staging.find((u) => u.code === N.wilderness)!;
  assert.equal(w.resources, 3);
  for (let i = 0; i < 3; i++) {
    s.queue.unshift(
      ...hooks(s).roundEnd!(s).filter((e) => e.kind === "nffWilderness"),
    );
    run(s);
  }
  assert.equal(w.resources, 0);
  assert.equal(lifeOf(s), 12);
});

test("Nightmare: Ettendales shuffles a burden into the encounter deck when explored, and its shadow's kill costs 1 life", () => {
  const s = board("quest");
  const e = place(s, N.ettendales, true);
  const burdens = [...s.flightFord!.burdens];
  hooks(s).explored!(s, e, true);
  run(s);
  assert.deepEqual(s.flightFord!.burdens, burdens.slice(1));
  assert.ok(s.encounterDeck.includes(burdens[0]));
  const t = board("combat");
  const attacker = enemy(t, FF.ringwraith, 0);
  const victim = other(t);
  shadow(t, attacker, N.ettendales, victim, 0);
  assert.equal(t.combat!.attackBonus, 2);
  damage(t, victim.id, 99, { combatDamage: true, enemyId: attacker.id });
  run(t);
  t.queue.unshift(...hooks(t).attackFinished!(t, t.combat!));
  run(t);
  assert.equal(lifeOf(t), 14);
});

test("Nightmare: Come Back! costs 1 life and the current quest's progress with doomed 1, and its shadow costs 1 life or leaves the attack undefended", () => {
  const s = board("staging");
  s.progress = 4;
  revealed(s, N.comeBack);
  run(s);
  assert.equal(lifeOf(s), 14);
  assert.equal(s.progress, 0);
  assert.equal(seatView(s, 0).threat, 21, "its printed doomed 1");
  const t = board("combat");
  const attacker = enemy(t, FF.ringwraith, 0);
  const defender = other(t);
  shadow(t, attacker, N.comeBack, defender, 0);
  run(t);
  assert.deepEqual(options(t), ["life", "undefended"]);
  pick(t, "undefended");
  assert.equal(t.combat!.defenderId, null);
  assert.equal(lifeOf(t), 15);
});

test("Nightmare: The Twilight World attaches to the Ring-bearer once, and each planning phase exhausts The One Ring or costs 1 life", () => {
  const s = board("staging");
  revealed(s, N.twilight);
  run(s);
  const bearer = ringBearer(s)!;
  assert.equal(
    bearer.attachments.filter((a) => a.code === N.twilight).length,
    1,
  );
  assert.equal(seatView(s, 0).threat, 22, "its printed doomed 2");
  revealed(s, N.twilight);
  run(s);
  assert.equal(
    bearer.attachments.filter((a) => a.code === N.twilight).length,
    1,
  );
  assert.ok(s.encounterDiscard.includes(N.twilight));
  hooks(s).planningBegin!(s);
  run(s);
  assert.deepEqual(options(s), ["ring", "life"]);
  pick(s, "ring");
  run(s);
  assert.equal(oneRing(s)!.exhausted, true);
  hooks(s).planningBegin!(s);
  run(s);
  assert.equal(lifeOf(s), 14, "with The One Ring exhausted");
});

test("Nightmare: Flight to the Ford's seeded Nightmare games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
