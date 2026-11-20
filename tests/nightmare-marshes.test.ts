import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { progressLocation, revealed } from "../src/game/board";
import { fx, get, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { reduceThreat } from "../src/game/threat-reduction";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import {
  POM,
  mireValue,
  pomGollum,
  pomSmeagol,
} from "../src/game/passage-marshes";
import {
  NIGHTMARE,
  NIGHTMARE_LOS as L,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";
import {
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./passage-marshes-fixtures";

const ID = "the-passage-of-the-marshes";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture). */
function board(players = 1, stageNumber = 1) {
  const s = base(players, stageNumber);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
/** Resolve the queue, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 120, "decisions terminate");
    s = choose(s, answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const threats = (s: GameState) =>
  playerOrder(s).map((p) => seatView(s, p).threat);
/** A combat with `attacker` (shadow `code` resolved) against the defending player. */
function shadowOf(s: GameState, attacker: Unit, code: string, defender?: Unit) {
  s.combat = {
    enemyId: attacker.id,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  attacker.shadows = [code];
  attacker.revealedShadowCount = 1;
  return hooks(s).shadow!(s, code);
}
/** Snowbourn Scout (0 [defense], 1 hit point). */
const SCOUT = "01016";
/** Guard of the Citadel, a filler for hands. */
const GUARD = "01013";

test("Nightmare: The Passage of the Marshes' setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(L.marshesCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Passage of the Marshes",
      "nightmare",
      "nightmare",
      "The Passage of the Marshes - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Passage of the Marshes scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Groping Dead\n3x Dead Things\n3x Soft Mires\n3x Haunted Mere\n3x Bitter Reek\nThen, /,
    'paragraphs and "standard encounter deck" (the catalogue had neither)',
  );
  assert.match(c.text!, /remains active throughout the game/);
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When a location in the staging area is explored, raise each player's threat by X, where X is that location's Mire value.",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.type_code, x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(L.pale), ["enemy", 30, 2, 4, 3, 5]);
  assert.deepEqual(stat(L.rotting), ["enemy", 34, 4, 6, 3, 8]);
  assert.equal(card(L.pale).text!.split("\n").length, 2);
  assert.equal(card(L.rotting).text!.split("\n").length, 3);
  assert.match(card(L.pale).shadow!, /, where X is the Mire X value/);
  assert.deepEqual(
    [L.festering, L.candle, L.thicket].map((code) => [
      card(code).threat,
      card(code).quest,
      card(code).victory,
      mireValue(code),
    ]),
    [
      [5, 6, 2, 2],
      [4, 5, 3, 3],
      [2, 3, 2, 2],
    ],
  );
  assert.match(
    card(L.candle).text!,
    /Travel: Spend 2 \[fellowship\] resources/,
  );
  assert.match(card(L.thicket).text!, /flip Sméagol to Gollum/);
  assert.match(card(L.rage).text!, /^Peril\. Surge\.\n/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Passage of the Marshes - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((x) => set.some((y) => y.code === x.code)).length, 9);
});

test("Nightmare: The Passage of the Marshes' Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N0B.10")!;
  const pile = recipe.cards
    .filter((c) => c.section === "sharedEncounterDeck")
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(L.marshesCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    assert.equal(nightmareCardOf(s), L.marshesCard);
    const inPlay = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...playerOrder(s).flatMap((p) =>
        seatView(s, p).engaged.map((u) => u.code),
      ),
    ].filter((code) => code !== POM.gollum);
    assert.deepEqual(tally(inPlay), tally(pile));
    assert.match(
      nightmareStatus(s)[0],
      /^The Passage of the Marshes · Nightmare mode: when a location in the staging area is explored/,
    );
    assert.ok(valid(s));
  }
});

test("Nightmare: a location explored in the staging area raises each player's threat by its Mire value; the active location's does not", () => {
  let s = board(2);
  const pool = stage(s, L.candle);
  progressLocation(s, pool, card(L.candle).quest!);
  s = run(s);
  assert.deepEqual(threats(s), [23, 23], "Mire 3");
  assert.ok(!s.staging.some((u) => u.id === pool.id));
  // The active location: no threat.
  s = board(2);
  const active = make(s, L.thicket);
  s.activeLocation = active;
  progressLocation(s, active, card(L.thicket).quest!);
  s = run(s);
  assert.deepEqual(threats(s), [20, 20]);
});

test("Nightmare: Festering Mire, discarded by the Mire keyword, discards each player's hand; its travel cost discards a random card from each hand", () => {
  let s = board(2);
  const mire = stage(s, L.festering);
  mire.resources = 1;
  hand(s, [GUARD, GUARD], 0);
  hand(s, [GUARD], 1);
  queue(s, fx("pomMireRound", { player: 0 }));
  s = run(s);
  assert.ok(!s.staging.some((u) => u.id === mire.id), "discarded at 2 tokens");
  assert.ok(s.encounterDiscard.includes(L.festering));
  assert.deepEqual(
    playerOrder(s).map((p) => [
      seatView(s, p).hand.length,
      seatView(s, p).discard.length,
    ]),
    [
      [0, 2],
      [0, 1],
    ],
  );
  // Travel: each player discards 1 random card; an empty hand cannot pay.
  s = board(2);
  const target = stage(s, L.festering);
  hand(s, [GUARD, GUARD], 0);
  assert.match(
    hooks(s).travelProblem!(s, target) ?? "",
    /each player discards 1 random card/,
  );
  hand(s, [GUARD], 1);
  assert.equal(hooks(s).travelProblem!(s, target), null);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: target.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, target.id);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    [1, 0],
  );
});

test("Nightmare: Candle-lit Pool, discarded by the Mire keyword, engages an Undead enemy with each player; its travel costs 2 Fellowship resources", () => {
  let s = board(2);
  const pool = stage(s, L.candle);
  pool.resources = 2;
  s.encounterDeck = [L.pale, L.rotting, POM.softMires];
  queue(s, fx("pomMireRound", { player: 0 }));
  s = run(s);
  assert.ok(s.encounterDiscard.includes(L.candle));
  assert.deepEqual(
    playerOrder(s).map(
      (p) =>
        seatView(s, p).engaged.filter((u) =>
          [L.pale, L.rotting].includes(u.code as never),
        ).length,
    ),
    [1, 1],
  );
  assert.deepEqual(s.encounterDeck, [POM.softMires]);
  // Travel: Frodo's 2 Fellowship resources.
  s = board();
  const target = stage(s, L.candle);
  assert.equal(hooks(s).travelProblem!(s, target), null);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: target.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, target.id);
  assert.equal(
    s.heroes.find((h) => card(h.code).sphere_code === "fellowship")!.resources,
    0,
  );
  s = board();
  s.heroes.find((h) => card(h.code).sphere_code === "fellowship")!.resources =
    1;
  assert.match(
    hooks(s).travelProblem!(s, stage(s, L.candle)) ?? "",
    /spend 2 Fellowship resources/,
  );
});

test("Nightmare: Great Reed Thicket, discarded by the Mire keyword, flips Sméagol to Gollum or makes Gollum attack; its travel exhausts Sméagol", () => {
  let s = board(1, 2);
  const thicket = stage(s, L.thicket);
  thicket.resources = 1;
  queue(s, fx("pomMireRound", { player: 0 }));
  s = run(s);
  assert.equal(pomSmeagol(s), undefined);
  assert.ok(pomGollum(s), "Sméagol flipped to Gollum");
  // With Gollum in play: his immediate attack.
  s = board();
  const other = stage(s, L.thicket);
  other.resources = 1;
  queue(s, fx("pomMireRound", { player: 0 }));
  flush(s);
  assert.equal(s.combat?.enemyId, pomGollum(s)!.id);
  assert.equal(s.combat?.immediate, true);
  // Travel: Sméagol must be ready.
  s = board(1, 2);
  const target = stage(s, L.thicket);
  assert.equal(hooks(s).travelProblem!(s, target), null);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: target.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, target.id);
  assert.equal(pomSmeagol(s)!.exhausted, true);
  s = board();
  assert.match(
    hooks(s).travelProblem!(s, stage(s, L.thicket)) ?? "",
    /exhaust Sméagol/,
  );
});

test("Nightmare: Pale Faces stops threat reduction, raises the defending player's threat by 4 as it attacks, and its shadow adds the active location's Mire value", () => {
  let s = board();
  const pale = engaged(s, L.pale);
  reduceThreat(s, 5);
  assert.equal(s.threat, 20, "the engaged player cannot reduce their threat");
  s.phase = "defense";
  s.engaged = s.engaged.filter((u) => u.code !== POM.gollum);
  s = act(s, { type: "DEFEND", enemyId: pale.id, defenderId: s.heroes[0].id });
  s = settle(s);
  assert.equal(s.threat, 24);
  // Its shadow.
  s = board();
  s.activeLocation = make(s, L.candle);
  const foe = engaged(s, L.rotting);
  shadowOf(s, foe, L.pale);
  assert.equal(s.combat!.attackBonus, 3);
  s = board();
  shadowOf(s, engaged(s, L.rotting), L.pale);
  assert.equal(s.combat!.attackBonus, 0, "no active location");
});

test("Nightmare: Rotting Thing cannot have attachments, and its attack that destroys a character places a mire token on the active location for each excess point of damage", () => {
  let s = board();
  const rotting = engaged(s, L.rotting);
  assert.equal(hooks(s).cannotAttach!(s, rotting, "01057"), true);
  const pools = make(s, POM.pools);
  s.activeLocation = pools;
  const [scout] = allies(s, [SCOUT]);
  s.engaged = s.engaged.filter((u) => u.code !== POM.gollum);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: rotting.id, defenderId: scout.id });
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === scout.id), "destroyed");
  // 6 [attack] - 1 [defense] = 5 damage against 1 hit point: 4 excess.
  assert.equal(get(s, pools.id)?.resources, 4);
});

test("Nightmare: Rot and Vapors makes each player choose threat for their questing characters or damage to each of their characters; its shadow places a mire token after a kill", () => {
  let s = board(2);
  forOwner(s, 0, () => {
    s.heroes[0].committed = true;
    s.heroes[1].committed = true;
  });
  revealed(s, L.rot);
  let answered = 0;
  s = run(s, (x) =>
    x.choice!.title.includes("Rot and Vapors")
      ? answered++ === 0
        ? "threat"
        : "damage"
      : undefined,
  );
  assert.equal(seatView(s, 0).threat, 22, "2 questing characters");
  assert.ok(
    seatView(s, 1).heroes.every((h) => h.damage === 1),
    "1 damage to each character",
  );
  // Its shadow.
  s = board();
  s.activeLocation = make(s, POM.pools);
  const foe = engaged(s, L.pale);
  const [scout] = allies(s, [SCOUT]);
  shadowOf(s, foe, L.rot, scout);
  assert.equal(s.combat!.attackBonus, 1);
  assert.equal(s.combat!.nmMireOnKill, 1);
  hooks(s).characterDestroyed!(s, scout, {
    combatDamage: true,
    enemyId: foe.id,
  });
  s = run(s);
  assert.equal(s.activeLocation!.resources, 1);
});

test("Nightmare: Gollum's Rage surges and is dealt to Gollum facedown; its shadow gives Gollum +1 [attack] and an additional attack, also in an immediate attack", () => {
  let s = board();
  s.encounterDeck = [POM.softMires, POM.softMires];
  revealed(s, L.rage);
  s = run(s);
  const gollum = pomGollum(s)!;
  assert.deepEqual(gollum.shadows, [L.rage]);
  assert.equal(
    s.staging.filter((u) => u.code === POM.softMires).length,
    1,
    "surge",
  );
  // Sméagol in play: discarded.
  s = board(1, 2);
  s.encounterDeck = [POM.softMires, POM.softMires];
  revealed(s, L.rage);
  s = run(s);
  assert.ok(s.encounterDiscard.includes(L.rage));
  // Its shadow.
  s = board();
  shadowOf(s, pomGollum(s)!, L.rage);
  assert.deepEqual([s.combat!.attackBonus, s.combat!.extraAttacks], [1, 1]);
  s = board();
  shadowOf(s, engaged(s, L.pale), L.rage);
  assert.deepEqual(
    [s.combat!.attackBonus, s.combat!.extraAttacks],
    [0, undefined],
  );
  // Held facedown, it joins Gollum's immediate attack.
  s = board();
  const held = pomGollum(s)!;
  held.shadows = [L.rage];
  s.encounterDeck = [POM.softMires, POM.softMires, POM.softMires];
  queue(s, fx("immediateAttack", { target: held.id, player: 0 }));
  flush(s);
  assert.deepEqual(
    get(s, held.id)!.shadows.sort(),
    [L.rage, POM.softMires].sort(),
  );
  assert.deepEqual(s.combat!.immediatePreviousShadows, []);
});

test("Nightmare: The Passage of the Marshes' Nightmare combat records survive saves", () => {
  const s = board();
  const foe = engaged(s, L.rotting);
  s.combat = {
    enemyId: foe.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
    nmMireOnKill: 1,
    nmExcess: 3,
  };
  assert.ok(valid(s));
  s.combat.nmExcess = -1;
  assert.equal(valid(s), false);
});

test("Nightmare: The Passage of the Marshes Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
