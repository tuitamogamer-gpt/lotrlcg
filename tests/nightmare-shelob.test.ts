import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { readyCharacter } from "../src/game/board";
import { fx, get, locationQuest, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { playerCardImmune } from "../src/game/card-immunity";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { SL } from "../src/game/shelob-lair";
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
  shelob,
  stage,
} from "./shelob-lair-fixtures";

const ID = "shelobs-lair";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table at a stage (the scenario's own fixture). */
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
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** The given player reveals a known card from the top of the encounter deck. */
function reveal(s: GameState, code: string, p = 0) {
  s.encounterDeck.unshift(code);
  s.queue.push(fx("reveal", { player: p }));
  flush(s);
  return s;
}
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
  const handled = hooks(s).shadow!(s, code);
  flush(s);
  return handled;
}
/** The attack of the combat in progress destroys a character. */
function kill(s: GameState, victim: Unit) {
  hooks(s).characterDestroyed!(s, victim, {
    combatDamage: true,
    enemyId: s.combat!.enemyId,
  });
  s.queue.push(...hooks(s).attackFinished!(s, s.combat!, false));
  flush(s);
  return s;
}
/** Guard of the Citadel. */
const GUARD = "01013";

test("Nightmare: Shelob's Lair's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(L.lairCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "Shelob's Lair",
      "nightmare",
      "nightmare",
      "Shelob's Lair - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Shelob's Lair scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n4x Morgul Orc\n2x The Under-way\n3x Deep Dark Passage\n2x Many Openings\nThen, /,
    'paragraphs and "standard encounter deck" (the catalogue had neither)',
  );
  assert.match(c.text!, /remains active throughout the game/);
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nDo not discard unresolved shadow cards from Shelob at the end of the combat phase.\nWhile Cleft of Cirith Ungol is in the staging area, players cannot travel to locations not named Cleft of Cirith Ungol.",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health, x.traits];
  };
  assert.deepEqual(stat(L.minasOrc), [35, 2, 3, 2, 4, "Orc."]);
  assert.deepEqual(stat(L.sentry), [30, 3, 5, 3, 5, "Orc. Uruk."]);
  for (const [code, threat, quest] of [
    [L.foulCave, 4, 1],
    [L.torech, 2, 4],
    [L.cobwebbed, 2, 5],
  ] as const)
    assert.deepEqual(
      [card(code).threat, card(code).quest, card(code).traits],
      [threat, quest, "Underground."],
    );
  assert.equal(
    card(L.torech).text,
    "While Torech Ungol is in the staging area, Shelob gets +1 [attack] and +1 [defense].\nTravel: Exhaust Sméagol to travel here.",
    "two paragraphs and the accent (the catalogue had neither)",
  );
  assert.equal(
    card(L.cobwebbed).text,
    "Immune to player card effects.\nWhile Cobwebbed Tunnel is in the staging area, each Underground location in the staging area gets +1 [threat] and +5 quest points.\nTravel: The first player reveals an encounter card to travel here.",
  );
  assert.match(card(L.stench).text!, /^Surge\.\nWhen Revealed: /);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Shelob's Lair - Nightmare",
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

test("Nightmare: Shelob's Lair's Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N0B.12")!;
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(L.lairCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    assert.equal(nightmareCardOf(s), L.lairCard);
    const inPlay = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...playerOrder(s).flatMap((p) =>
        seatView(s, p).engaged.map((u) => u.code),
      ),
    ].filter((code) => code !== SL.gollum && code !== SL.secretWay);
    assert.deepEqual(tally(inPlay), tally(section("sharedEncounterDeck")));
    assert.deepEqual(
      tally(s.shelobLair!.setAside),
      tally([...section("sharedSetAside"), ...section("sharedEncounterDeck2")]),
    );
    assert.match(
      nightmareStatus(s)[0],
      /^Shelob's Lair · Nightmare mode: unresolved shadow cards stay on Shelob/,
    );
    assert.ok(valid(s));
  }
});

test("Nightmare: Shelob keeps her unresolved shadow cards at the end of the combat phase, and only Cleft of Cirith Ungol can be travelled to while it is staged", () => {
  let s = board(1, 3);
  const spider = shelob(s)!;
  spider.shadows = [SL.rage, L.stench];
  spider.revealedShadowCount = 1;
  const orc = engaged(s, SL.cirithOrc);
  orc.shadows = [SL.malice];
  queue(s, fx("endCombat"));
  flush(s);
  assert.deepEqual(shelob(s)!.shadows, [L.stench], "the unresolved card");
  assert.equal(shelob(s)!.revealedShadowCount, 0);
  assert.ok(s.encounterDiscard.includes(SL.rage), "the resolved one");
  assert.ok(s.encounterDiscard.includes(SL.malice), "another enemy's");
  // Cleft of Cirith Ungol in the staging area: no other destination.
  s = board(1, 3);
  const den = stage(s, SL.den);
  const cleft = s.staging.find((u) => u.code === SL.cleft)!;
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: den.id }),
    /while Cleft of Cirith Ungol is in the staging area/,
  );
  s = settle(act(s, { type: "TRAVEL", id: cleft.id }));
  assert.equal(s.activeLocation?.id, cleft.id);
  assert.equal(shelob(s)!.resources, 1, "Cleft's own travel cost");
});

test("Nightmare: Foul-smelling Cave feeds Shelob when explored; Torech Ungol strengthens her from the staging area and costs Sméagol's exhaustion to travel", () => {
  let s = board(1, 2);
  const cave = stage(s, L.foulCave);
  hooks(s).explored!(s, cave, false);
  flush(s);
  assert.equal(shelob(s)!.resources, 1);
  s = board(1, 1);
  hooks(s).explored!(s, stage(s, L.foulCave), false);
  flush(s);
  assert.ok(
    s.log.some((l) => /Foul-smelling Cave: Shelob is not in play/.test(l.text)),
  );
  // Its shadow: +1, or +2 for Shelob.
  s = board(1, 2);
  shadowOf(s, engaged(s, SL.cirithOrc), L.foulCave);
  assert.equal(s.combat!.attackBonus, 1);
  s = board(1, 2);
  shadowOf(s, shelob(s)!, L.foulCave);
  assert.equal(s.combat!.attackBonus, 2);
  // Torech Ungol: +1 [attack] and +1 [defense] to Shelob for each copy staged.
  s = board(1, 2);
  const before = stats(s, shelob(s)!);
  stage(s, L.torech);
  const torech = stage(s, L.torech);
  assert.equal(stats(s, shelob(s)!).attack, before.attack + 2);
  assert.equal(stats(s, shelob(s)!).defense, before.defense + 2);
  const smeagol = s.allies.find((u) => u.code === SL.smeagol)!;
  smeagol.exhausted = true;
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: torech.id }),
    /exhaust Sméagol/,
  );
  smeagol.exhausted = false;
  s = settle(act(s, { type: "TRAVEL", id: torech.id }));
  assert.equal(s.activeLocation?.id, torech.id);
  assert.equal(get(s, smeagol.id)!.exhausted, true);
  assert.equal(stats(s, shelob(s)!).attack, before.attack + 1);
});

test("Nightmare: Cobwebbed Tunnel is immune, gives each Underground location in the staging area +1 [threat] and +5 quest points, and reveals an encounter card to travel there", () => {
  let s = board(1, 2);
  const tunnel = stage(s, L.cobwebbed);
  const cave = stage(s, L.foulCave);
  const way = stage(s, SL.secretWay);
  assert.equal(playerCardImmune(tunnel), true);
  assert.deepEqual(
    [threatOf(s, tunnel), locationQuest(s, tunnel)],
    [3, 10],
    "itself",
  );
  assert.deepEqual([threatOf(s, cave), locationQuest(s, cave)], [5, 6]);
  assert.equal(
    threatOf(s, way),
    card(SL.secretWay).threat,
    "Sméagol's Secret Way is a Mountain",
  );
  stage(s, L.cobwebbed);
  assert.deepEqual([threatOf(s, cave), locationQuest(s, cave)], [6, 11]);
  // Travel: an encounter card is revealed; the active Tunnel gives nothing.
  s = board(1, 2);
  const target = stage(s, L.cobwebbed);
  const torech = stage(s, L.torech);
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: target.id }));
  assert.equal(s.activeLocation?.id, target.id);
  assert.equal(
    s.staging.filter((u) => u.code === SL.den).length,
    1,
    "revealed",
  );
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.id === torech.id)!,
    ),
    2,
  );
});

test("Nightmare: Orc of Minas Morgul's Peril choice discards a random card or engages it and reveals another card; its shadow gives +2 [attack]", () => {
  let s = board();
  hand(s, [GUARD, GUARD]);
  s = reveal(s, L.minasOrc);
  assert.match(s.choice!.title, /^Orc of Minas Morgul · Choose one/);
  assert.deepEqual(options(s), ["discard", "engage"]);
  s = settle(choose(s, "discard"));
  assert.equal(s.hand.length, 1);
  assert.ok(s.staging.some((u) => u.code === L.minasOrc));
  // With an empty hand, the Orc engages and another card is revealed.
  s = board();
  s.encounterDeck = [SL.den, SL.den];
  s = reveal(s, L.minasOrc);
  assert.deepEqual(options(s), ["engage"]);
  s = settle(choose(s, "engage"));
  assert.ok(s.engaged.some((u) => u.code === L.minasOrc));
  assert.equal(s.staging.filter((u) => u.code === SL.den).length, 1);
  // Its shadow.
  s = board();
  shadowOf(s, engaged(s, SL.cirithOrc), L.minasOrc);
  assert.equal(s.combat!.attackBonus, 2);
});

test("Nightmare: Under-gate Sentry's kills discard a random card, and its shadow discards one or exhausts a character", () => {
  let s = board();
  hand(s, [GUARD, GUARD]);
  const [guard] = allies(s, [GUARD]);
  const sentry = engaged(s, L.sentry);
  s.combat = {
    enemyId: sentry.id,
    defenderId: guard.id,
    defenderIds: [guard.id],
    attackBonus: 0,
    attackPlayer: 0,
  };
  kill(s, guard);
  assert.equal(s.hand.length, 1);
  assert.ok(
    s.log.some((l) =>
      /Under-gate Sentry: you discard a random card/.test(l.text),
    ),
  );
  // Its shadow.
  s = board();
  hand(s, [GUARD]);
  const hero = s.heroes[0];
  shadowOf(s, engaged(s, SL.cirithOrc), L.sentry);
  assert.match(s.choice!.title, /^Under-gate Sentry · Choose one/);
  assert.ok(options(s).includes("discard") && options(s).includes(hero.id));
  s = settle(choose(s, hero.id));
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(s.hand.length, 1);
});

test("Nightmare: Impenetrable Dark removes and exhausts a questing character for each player and stops player card readying for the round; its shadow exhausts a character that cannot ready", () => {
  let s = board(2);
  const [a, b] = playerOrder(s).map((p) => {
    let hero!: Unit;
    forOwner(s, p, () => {
      hero = s.heroes[0];
      hero.committed = true;
    });
    return hero;
  });
  s = reveal(s, L.impenetrable);
  for (let i = 0; i < 2; i++) {
    assert.match(s.choice!.title, /^Impenetrable Dark · Remove a character/);
    s = choose(s, s.choice!.options[0].id);
  }
  s = settle(s);
  for (const id of [a.id, b.id])
    assert.deepEqual(
      [get(s, id)!.committed, get(s, id)!.exhausted],
      [false, true],
    );
  // Player card effects cannot ready characters this round; the refresh can.
  const x = get(s, a.id)!;
  readyCharacter(s, x);
  assert.equal(x.exhausted, true);
  readyCharacter(s, x, false);
  assert.equal(x.exhausted, false);
  assert.ok(valid(s));
  hooks(s).roundEnd!(s);
  assert.equal(s.nightmare?.shelobDark, undefined);
  // Its shadow.
  s = board();
  const hero = s.heroes[0];
  shadowOf(s, engaged(s, SL.cirithOrc), L.impenetrable);
  assert.match(s.choice!.title, /^Impenetrable Dark · Exhaust a character/);
  s = settle(choose(s, hero.id));
  const held = get(s, hero.id)!;
  assert.equal(held.exhausted, true);
  readyCharacter(s, held, false);
  assert.equal(held.exhausted, true, "not even by the refresh");
  s.round += 1;
  readyCharacter(s, held, false);
  assert.equal(held.exhausted, false, "the next round");
});

test("Nightmare: Growing Stench surges onto Shelob facedown and resolves in her next attack; its shadow stops the defender's readying and feeds Shelob after a kill", () => {
  let s = board(1, 2);
  s.encounterDeck = [SL.den, SL.den];
  s = reveal(s, L.stench);
  assert.deepEqual(shelob(s)!.shadows, [L.stench]);
  assert.equal(s.staging.filter((u) => u.code === SL.den).length, 1, "surge");
  // Shelob set aside: discarded.
  s = board(1, 1);
  s.encounterDeck = [SL.den, SL.den];
  s = reveal(s, L.stench);
  assert.ok(s.encounterDiscard.includes(L.stench));
  // Held facedown, it joins her immediate attack.
  s = board(1, 2);
  const spider = shelob(s)!;
  spider.shadows = [L.stench];
  s.encounterDeck = [SL.den, SL.den, SL.den];
  queue(s, fx("immediateAttack", { target: spider.id, player: 0 }));
  flush(s);
  assert.deepEqual(
    [...get(s, spider.id)!.shadows].sort(),
    [L.stench, SL.den].sort(),
  );
  assert.deepEqual(s.combat!.immediatePreviousShadows, []);
  // Its shadow: the defender cannot ready; Shelob's kill feeds her.
  s = board(1, 2);
  const hero = s.heroes[0];
  const [guard] = allies(s, [GUARD]);
  shadowOf(s, shelob(s)!, L.stench, guard);
  assert.equal(s.combat!.nlrStench, 1);
  kill(s, guard);
  assert.equal(shelob(s)!.resources, 1);
  s = board(1, 2);
  shadowOf(s, engaged(s, SL.cirithOrc), L.stench, s.heroes[0]);
  assert.equal(s.combat!.nlrStench, undefined, "not Shelob");
  const defender = get(s, s.heroes[0].id)!;
  defender.exhausted = true;
  readyCharacter(s, defender, false);
  assert.equal(defender.exhausted, true);
  assert.ok(valid(s));
  assert.ok(hero);
});

test("Nightmare: Shelob's Lair's Nightmare records survive saves", () => {
  const s = board(1, 2);
  s.nightmare = {
    shelobDark: s.round,
    shelobNoReady: { round: s.round, ids: ["x"] },
  };
  s.combat = {
    enemyId: shelob(s)!.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
    nlrStench: 2,
  };
  assert.ok(valid(s));
  s.combat.nlrStench = -1;
  assert.equal(valid(s), false);
  s.combat.nlrStench = 1;
  s.nightmare.shelobNoReady = { round: -1, ids: [] };
  assert.equal(valid(s), false);
});

test("Nightmare: Shelob's Lair Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
