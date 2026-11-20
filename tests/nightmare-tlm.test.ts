import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { EREBOR_TREASURES, bagginsBilbo } from "../src/game/hobbit-saga";
import {
  BURGLES,
  TLM,
  TLM_NIGHTMARE_BURGLES,
  TLM_RECIPES,
} from "../src/game/lonely-mountain";
import {
  NIGHTMARE,
  NIGHTMARE_OTD as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  valid,
} from "./nightmare-fixtures";

/** Hidden Path: a location with no effect while in the staging area. */
const QUIET = TLM.path;
const GUARD = "01013"; // Guard of the Citadel: leadership ally, cost 2
const ID = "the-lonely-mountain";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at stage 2B: Smaug the Golden and The Lonely Mountain over the five treasures. */
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
  });
  s.staging = s.staging.filter((u) =>
    [TLM.golden, TLM.mountain].includes(u.code),
  );
  for (const u of s.staging) Object.assign(u, { progress: 0, damage: 0 });
  Object.assign(s.lonelyMountain!, {
    currentQuest: TLM.burglar,
    advancing: false,
    stack: [...EREBOR_TREASURES],
    resolving: [],
    treasures: [],
    burgle: null,
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, allies: [], engaged: [], hand: [] });
      for (const h of s.heroes)
        Object.assign(h, { damage: 0, exhausted: false, committed: false });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
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
const golden = (s: GameState) => s.staging.find((u) => u.code === TLM.golden)!;
const threats = (s: GameState) =>
  seatIndices(s).map((p) => {
    let t = 0;
    forOwner(s, p, () => (t = s.threat));
    return t;
  });
/** A successful burgle attempt through Erebor Bats (2 cards of the revealed card's cost and type). */
function burgle(s: GameState) {
  s.encounterDeck = [QUIET, N.ereborBats, QUIET];
  forOwner(s, 0, () => {
    s.deck = Array(4).fill(GUARD);
    s.hand = [make(s, GUARD), make(s, GUARD)];
  });
  s.phase = "quest";
  handle(s, fx("questSucceeded", { value: 1, player: 0 }));
  run(s);
  assert.match(s.choice!.title, /Erebor Bats · Burgle attempt/);
  return pick(s, "discard");
}

test("Nightmare: The Lonely Mountain's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.tlmCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Lonely Mountain - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Dark Bats\n2x Fighting Among Friends\n3x Western Slopes\n2x Secret Entrance\n4x Belching Fire\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nWhile there is at least 1 card stacked underneath The Lonely Mountain, the players cannot advance to stage 3.\nSmaug the Magnificent cannot take damage unless A Bare Patch is attached to him.",
  );
  const bats = card(N.ereborBats);
  assert.deepEqual(
    [bats.engagement, bats.threat, bats.attack, bats.defense, bats.health],
    [15, 3, 3, 2, 5],
  );
  for (const code of [N.ereborBats, N.frontGate, N.lust])
    assert.match(card(code).text!, /\nBurgle: /, card(code).name);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Lonely Mountain - Nightmare",
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

test("Nightmare: The Lonely Mountain's Nightmare deck matches its source recipe, and its burgle cards join the burgle attempts", () => {
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
  const nightmare = recipes.find((r) => r.id === "N0A.5")!.cards;
  const standard = TLM_RECIPES.find((r) => r.mode === "standard")!.cards;
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, pile(standard, "sharedEncounterDeck"))),
    count(pile(nightmare, "sharedEncounterDeck")),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.tlmCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.tlmCard);
    assert.deepEqual(
      count(s.encounterDeck),
      count(pile(nightmare, "sharedEncounterDeck")),
    );
    assert.match(nightmareStatus(s)[0], /\(5 now\)/);
  }
  assert.deepEqual(BURGLES[TLM_NIGHTMARE_BURGLES.bats], {
    items: ["cost", "type"],
    cards: 2,
  });
  assert.deepEqual(BURGLES[TLM_NIGHTMARE_BURGLES.gate], {
    items: ["cost"],
    cards: 3,
  });
  assert.deepEqual(BURGLES[TLM_NIGHTMARE_BURGLES.lust], {
    items: ["sphere", "type", "cost"],
    cards: 1,
  });
  assert.ok(valid(opening(game())));
});

test("Nightmare: the players cannot advance to stage 3 while a treasure remains under The Lonely Mountain", () => {
  let s = board("planning");
  s.lonelyMountain!.stack = [EREBOR_TREASURES[0], EREBOR_TREASURES[1]];
  s = burgle(s);
  assert.deepEqual(s.lonelyMountain!.stack, [EREBOR_TREASURES[1]]);
  assert.equal(s.choice, null, "no stage 3 choice");
  assert.ok(
    s.log.some((l) => /cannot advance to stage 3/.test(l.text)),
    "the log says why",
  );
  run(s, [fx("tlmStageThree", { player: 0 })]);
  assert.equal(s.lonelyMountain!.currentQuest, TLM.burglar);
  // The last treasure: stage 3 can follow.
  s = burgle(s);
  assert.deepEqual(s.lonelyMountain!.stack, []);
  assert.match(s.choice!.title, /Advance to stage 3/);
  s = pick(s, "advance");
  assert.equal(s.lonelyMountain!.currentQuest, TLM.inside);
});

test("Nightmare: Smaug the Magnificent takes no damage until A Bare Patch is attached to him", () => {
  const s = board("planning");
  s.lonelyMountain!.stack = [];
  run(s, [fx("tlmStageThree", { player: 0 })]);
  const m = s.staging.find((u) => u.code === TLM.magnificent)!;
  damage(s, m.id, 5);
  assert.equal(m.damage, 0);
  const patch = s.staging.find((u) => u.code === TLM.patch)!;
  s.staging = s.staging.filter((u) => u.id !== patch.id);
  m.attachments.push({ id: patch.id, code: patch.code, exhausted: false });
  damage(s, m.id, 5);
  assert.equal(m.damage, 5);
});

test("Nightmare: Erebor Bats takes a random card from the defending player's hand; Secret Tunnel punishes a failed burgle and costs Bilbo to travel to", () => {
  const s = board("attack");
  const bats = add(s, N.ereborBats);
  s.hand = [make(s, GUARD), make(s, GUARD)];
  hooks(s).enemyAttackStarted!(s, bats, 0);
  run(s);
  assert.equal(s.hand.length, 1);
  // Secret Tunnel: a failed burgle raises each player's threat by 2.
  const t = board("planning", opening(two()));
  add(t, N.tunnel);
  run(t, [fx("tlmBurgleFail", { text: "patch", player: 0 })]);
  assert.deepEqual(threats(t), [22, 22]);
  // Travel: exhaust Bilbo Baggins and spend 1 Baggins resource.
  const u = board("travel");
  const tunnel = add(u, N.tunnel);
  const bilbo = bagginsBilbo(u)!;
  bilbo.resources = 0;
  assert.match(hooks(u).travelProblem!(u, tunnel) ?? "", /Bilbo Baggins/);
  bilbo.resources = 2;
  assert.equal(hooks(u).travelProblem!(u, tunnel), null);
  run(u, hooks(u).travelEffects!(u, tunnel));
  assert.equal(bilbo.exhausted, true);
  assert.equal(bilbo.resources, 1);
});

test("Nightmare: Southern Spur taxes the players who played allies in the planning phase, and its shadow makes a destroyed character cost everyone 3 threat", () => {
  const s = board("planning", opening(two()));
  add(s, N.spur);
  let ally!: Unit;
  forOwner(s, 1, () => {
    ally = make(s, GUARD);
    ally.owner = 1;
    s.allies.push(ally);
  });
  hooks(s).allyEntered!(s, ally, true, true);
  hooks(s).planningEnd!(s);
  run(s);
  assert.deepEqual(threats(s), [20, 21]);
  assert.equal(s.nightmare?.tlmAllies, undefined);
  // Its shadow: +2 [attack]; a destroyed character raises each threat by 3, once.
  const t = board("attack", opening(two()));
  const enemy = add(t, N.ereborBats);
  t.combat = {
    enemyId: enemy.id,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  hooks(t).shadow!(t, N.spur);
  assert.equal(t.combat!.attackBonus, 2);
  const ctx = { combatDamage: true, enemyId: enemy.id };
  hooks(t).characterDestroyed!(t, t.heroes[0], ctx);
  hooks(t).characterDestroyed!(t, t.heroes[1], ctx);
  run(t);
  assert.deepEqual(threats(t), [23, 23]);
});

test("Nightmare: The Front Gate sends each Dragon at the first player with a shadow card, and The Dragon's Ire attacks everyone and feeds Smaug the Golden", () => {
  const s = board("travel");
  const gate = add(s, N.frontGate);
  hooks(s).explored!(s, gate, true);
  run(s);
  assert.equal(s.combat?.enemyId, golden(s).id);
  assert.equal(golden(s).shadows.length, 1, "a shadow card is dealt");
  // The Dragon's Ire: Doomed 1, attacks without shadow cards.
  const t = board("staging");
  revealed(t, N.ire);
  run(t);
  assert.equal(t.threat, 21, "Doomed 1");
  assert.equal(t.combat?.enemyId, golden(t).id);
  assert.equal(golden(t).shadows.length, 0, "no shadow card");
  assert.equal(t.nightmare?.tlmIre, 1);
  // A character destroyed by one of these attacks: 1 progress on Smaug the Golden.
  hooks(t).characterDestroyed!(t, t.heroes[0], {
    combatDamage: true,
    enemyId: golden(t).id,
  });
  t.combat = null;
  t.choice = null;
  t.queue = t.queue.filter((e) => e.kind !== "immediateChooseDefender");
  run(t);
  assert.equal(golden(t).progress, 1);
  assert.equal(t.nightmare?.tlmIre, undefined, "the attacks are over");
});

test("Nightmare: Lust for Treasure charges each player for the attachments on their characters", () => {
  const s = board("staging");
  s.heroes[0].attachments.push(
    { id: "x1", code: "01043", exhausted: false },
    { id: "x2", code: "01040", exhausted: false },
  );
  revealed(s, N.lust);
  run(s);
  assert.equal(s.threat, 23, "Doomed 1 and 2 attachments");
  assert.ok(s.encounterDiscard.includes(N.lust));
});

test("Nightmare: The Lonely Mountain's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { tlmIre: 1, tlmAllies: { round: 1, players: [0] } };
  assert.ok(valid(s));
  s.nightmare = { tlmAllies: { round: 1, players: [3] } };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
