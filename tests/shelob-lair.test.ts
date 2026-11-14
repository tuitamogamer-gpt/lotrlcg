import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  stagingThreat,
  stats,
} from "../src/game/core";
import { check, damage, progress, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { firstPlayer, globalEngaged, seatView } from "../src/game/table";
import { oneRing } from "../src/game/lotr-saga";
import {
  SHELOB_LAIR_HOOKS,
  SHELOB_LAIR_RECIPES,
  SL,
  shelobLairPublicState,
} from "../src/game/shelob-lair";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  shelob,
  stage,
  start,
} from "./shelob-lair-fixtures";
import type { GameState } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0, extra = {}) => {
  s.queue.push(fx(kind, { player: p, ...extra }));
  flush(s);
  return s;
};
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = choose(s, "resolve");
  return s;
};
const GUARD = "01013",
  GANDALF = "01073";
const recipe = (easy: boolean) =>
  SHELOB_LAIR_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!;
const count = (easy: boolean, section: string) =>
  recipe(easy)
    .cards.filter((c) => c.section === section)
    .reduce((n, c) => n + c.quantity, 0);
const smeagolOf = (s: GameState) =>
  seatView(s, firstPlayer(s)).allies.find((u) => u.code === SL.smeagol);

test("Setup: Morgul Vale is active, Sméagol's Secret Way is in the staging area, Sméagol joins the first player and Shelob, Cleft of Cirith Ungol and The Great Spider are set aside", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy, 600 + players);
      const q = s.shelobLair!;
      assert.equal(s.activeLocation?.code, SL.vale);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [SL.secretWay],
      );
      assert.ok(smeagolOf(s), "the first player controls Sméagol");
      assert.equal(
        q.setAside.length,
        count(easy, "sharedSetAside") + count(easy, "sharedEncounterDeck2"),
      );
      assert.ok(q.setAside.includes(SL.shelob));
      assert.ok(q.setAside.includes(SL.cleft));
      assert.equal(s.encounterDeck.length, count(easy, "sharedEncounterDeck"));
      assert.equal(s.stage, 1);
      assert.equal(s.round, 1);
      assert.equal(shelob(s), undefined);
    }
});

test("The Stairs of Cirith Ungol: no progress on Underground locations; after Sméagol's Secret Way is explored each player exhausts a character or discards, and at the end of the quest phase the players advance to The Spider's Pass", () => {
  let s = base(1, 1);
  const den = activate(s, SL.den);
  progressLocation(s, den, 3);
  flush(s);
  assert.equal(den.progress ?? 0, 0, "Underground: no progress");
  // Sméagol's Secret Way explored: each player's Forced choice.
  s = base(2, 1);
  const way = activate(s, SL.secretWay);
  hand(s, [GUARD], 0);
  hand(s, [GUARD], 1);
  progressLocation(s, way, 2);
  flush(s);
  assert.ok(s.victoryCards!.includes(SL.secretWay));
  assert.match(
    s.choice!.title,
    /^Sméagol's Secret Way · Exhaust a character or discard a random card/,
  );
  s = choose(s, "discard");
  assert.match(s.choice!.title, /^Sméagol's Secret Way · Exhaust a character/);
  s = settle(s);
  // At the end of the quest phase: stage 2A.
  s.phase = "quest";
  run(s, "finishQuestPhase");
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.shelobLair!.currentQuest, SL.pass);
  assert.ok(shelob(s), "Shelob is in the staging area");
  assert.deepEqual(s.shelobLair!.setAside, [SL.cleft]);
  assert.equal(
    s.encounterDeck.filter((c) =>
      [SL.tunnel, SL.poison, SL.malice, SL.rage].includes(c as never),
    ).length,
    10,
    "The Great Spider is shuffled into the encounter deck",
  );
});

test("The Stairs of Cirith Ungol's Response discards 3 random cards from each player's hand to discard each Nazgûl enemy in the staging area", () => {
  let s = base(1, 1);
  const way = activate(s, SL.secretWay);
  stage(s, SL.wraith);
  hand(s, [GUARD, GUARD, GUARD, GUARD]);
  progressLocation(s, way, 2);
  flush(s);
  s = choose(s, "discard");
  assert.match(
    s.choice!.title,
    /^The Stairs of Cirith Ungol · Discard each Nazgûl enemy\?/,
  );
  s = choose(s, "discard");
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === SL.wraith));
  assert.ok(s.encounterDiscard.includes(SL.wraith));
  assert.equal(
    s.hand.length,
    0,
    "1 discarded by the Forced effect, 3 by the Response",
  );
  // Not offered without 3 cards in each player's hand.
  s = base(1, 1);
  const way2 = activate(s, SL.secretWay);
  stage(s, SL.wraith);
  hand(s, [GUARD, GUARD]);
  progressLocation(s, way2, 2);
  flush(s);
  s = choose(s, "discard");
  assert.equal(s.choice, null);
  assert.ok(s.staging.some((u) => u.code === SL.wraith));
});

test("Morgul Vale: exploring it adds a Morgul Wraith to the staging area, shuffles the deck, then the first player exhausts The One Ring or each player discards", () => {
  let s = base(2, 1);
  const vale = activate(s, SL.vale);
  s.encounterDeck = [SL.den, SL.wraith, SL.den];
  hand(s, [GUARD], 0);
  hand(s, [GUARD], 1);
  progressLocation(s, vale, 2);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === SL.wraith));
  assert.ok(s.victoryCards!.includes(SL.vale));
  assert.match(s.choice!.title, /^Morgul Vale · The first player must choose/);
  s = choose(s, "ring");
  assert.equal(oneRing(s)!.exhausted, true);
  // Morgul Wraith answers The One Ring.
  const wraith = s.staging.find((u) => u.code === SL.wraith)!;
  assert.equal(engagementCost(s, wraith), card(SL.wraith).engagement! - 30);
  s = base(2, 1);
  const vale2 = activate(s, SL.vale);
  hand(s, [GUARD], 0);
  hand(s, [GUARD], 1);
  progressLocation(s, vale2, 2);
  flush(s);
  s = choose(s, "discard");
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length + seatView(s, 1).hand.length, 0);
});

test("The Spider's Pass: Shelob cannot leave the staging area, Sméagol cannot attack or defend, 1 ally per player each round and at most 4 progress each round; defeated, Gollum's Betrayal adds Cleft of Cirith Ungol, flips Sméagol, heals Shelob and feeds her", () => {
  let s = base(2, 2);
  const spider = shelob(s)!;
  s.phase = "encounter";
  assert.throws(
    () => act(s, { type: "ENGAGE", id: spider.id }),
    /cannot be optionally engaged/,
  );
  const smeagol = smeagolOf(s)!;
  const enemy = engaged(s, SL.morgulOrc);
  assert.equal(SHELOB_LAIR_HOOKS.cannotDefend!(s, enemy, smeagol), true);
  assert.equal(SHELOB_LAIR_HOOKS.cannotAttack!(s, smeagol, enemy), true);
  // One ally each round.
  assert.equal(SHELOB_LAIR_HOOKS.allyEntryProblem!(s, GANDALF), null);
  allies(s, [GANDALF]);
  SHELOB_LAIR_HOOKS.allyEntering!(s, s.allies[s.allies.length - 1]);
  assert.match(
    SHELOB_LAIR_HOOKS.allyEntryProblem!(s, GUARD)!,
    /more than 1 ally/,
  );
  // Four progress each round: questing 6 places 4, and nothing more this round.
  s = base(1, 2);
  s.phase = "quest";
  s.progress = 0;
  progress(s, 6, false, true);
  flush(s);
  assert.equal(s.progress, 4);
  progress(s, 2, true);
  flush(s);
  assert.equal(s.progress, 4, "no more progress this round");
  assert.ok(s.log.some((l) => /no more than 4 progress/.test(l.text)));
  assert.equal(shelobLairPublicState(s)!.passProgress, 4);
  // Defeat at 16.
  s = base(2, 2);
  const spider2 = shelob(s)!;
  spider2.damage = 3;
  s.progress = 16;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.shelobLair!.currentQuest, SL.betrayal);
  assert.ok(s.staging.some((u) => u.code === SL.cleft));
  assert.ok(
    globalEngaged(s).some((u) => u.code === SL.gollum),
    "Sméagol flips to Gollum",
  );
  assert.equal(shelob(s)!.damage, 0);
  assert.equal(
    shelob(s)!.resources,
    2,
    "each player places 1 resource on Shelob",
  );
});

test("Gollum's Betrayal: Shelob's resources cancel damage, Gollum goes to the victory display, Cleft of Cirith Ungol takes Indestructible away, and the players win with both in the victory display", () => {
  let s = base(1, 3);
  const spider = shelob(s)!;
  spider.resources = 2;
  damage(s, spider.id, 5, {});
  assert.equal(spider.damage, 0);
  assert.equal(spider.resources, 1);
  assert.equal(SHELOB_LAIR_HOOKS.indestructible!(s, spider), true);
  // Gollum defeated: the victory display.
  const gollum = globalEngaged(s).find((u) => u.code === SL.gollum)!;
  damage(s, gollum.id, 9, {});
  flush(s);
  check(s);
  flush(s);
  assert.ok(s.victoryCards!.includes(SL.gollum));
  assert.ok(!globalEngaged(s).some((u) => u.code === SL.gollum));
  // Cleft of Cirith Ungol explored.
  const cleft = s.staging.find((u) => u.code === SL.cleft)!;
  s.staging = s.staging.filter((u) => u.id !== cleft.id);
  s.activeLocation = cleft;
  progressLocation(s, cleft, 4);
  flush(s);
  assert.ok(s.victoryCards!.includes(SL.cleft));
  assert.equal(SHELOB_LAIR_HOOKS.indestructible!(s, spider), false);
  assert.equal(stats(s, spider).attack, card(SL.shelob).attack! + 2);
  check(s);
  flush(s);
  assert.ok(
    seatView(s, 0).engaged.some((u) => u.code === SL.shelob),
    "Shelob engages the first player",
  );
  // Defeat Shelob, then the stage.
  spider.resources = 0;
  damage(s, spider.id, 8, {});
  flush(s);
  check(s);
  flush(s);
  assert.ok(s.victoryCards!.includes(SL.shelob));
  s.progress = 8;
  check(s);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /Shelob and Gollum in the victory display/);
});

test("Shelob's Forced effect at the beginning of the quest phase: a resource or an immediate attack against the first player", () => {
  let s = base(1, 2);
  const effects = SHELOB_LAIR_HOOKS.questBegin!(s) as ReturnType<typeof fx>[];
  s.queue.push(...effects);
  flush(s);
  assert.match(s.choice!.title, /^Shelob · Choose one/);
  s = choose(s, "resource");
  assert.equal(shelob(s)!.resources, 1);
  assert.equal(stagingThreat(s), card(SL.shelob).threat! + 1);
  s = base(1, 2);
  s.queue.push(
    ...(SHELOB_LAIR_HOOKS.questBegin!(s) as ReturnType<typeof fx>[]),
  );
  flush(s);
  s = choose(s, "attack");
  assert.ok(
    s.log.some((l) => /Shelob makes an immediate attack against/.test(l.text)),
  );
  s = settle(s);
});

test("Locations: The Spider's Lair, The Under-way, Deep Dark Passage, Den of Night, Blocked Tunnel, Sméagol's Secret Way and Cleft of Cirith Ungol", () => {
  // The Spider's Lair: an attack when it becomes active; a resource removed when explored.
  let s = base(1, 2);
  shelob(s)!.resources = 2;
  const lair = stage(s, SL.spidersLair);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: lair.id });
  assert.ok(
    s.log.some((l) =>
      /The Spider's Lair: Shelob makes an immediate attack/.test(l.text),
    ),
  );
  s = settle(s);
  progressLocation(s, s.activeLocation!, 4);
  flush(s);
  s = settle(s);
  assert.equal(shelob(s)!.resources, 1);
  // The Under-way: Orc enemies -5 engagement; engaging deals a shadow card.
  s = base(1, 2);
  stage(s, SL.underWay);
  const orc = stage(s, SL.cirithOrc);
  assert.equal(engagementCost(s, orc), card(SL.cirithOrc).engagement! - 5);
  s.phase = "encounter";
  s = settle(act(s, { type: "ENGAGE", id: orc.id }));
  assert.equal(s.engaged.find((u) => u.id === orc.id)!.shadows.length, 1);
  // Deep Dark Passage: progress on staged locations is reduced by 1; travel exhausts Sméagol.
  s = base(1, 2);
  const passage = stage(s, SL.passage);
  const den = stage(s, SL.den);
  progressLocation(s, den, 2);
  flush(s);
  assert.equal(den.progress, 1);
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: passage.id }));
  assert.equal(smeagolOf(s)!.exhausted, true);
  // Den of Night: travel places a resource on Shelob.
  s = base(1, 2);
  const den2 = stage(s, SL.den);
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: den2.id }));
  assert.equal(shelob(s)!.resources, 1);
  // At stage 1 Shelob is not in play: no travel to Den of Night.
  s = base(1, 1);
  const den3 = stage(s, SL.den);
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: den3.id }),
    /place 1 resource on Shelob/,
  );
  // Blocked Tunnel: revealed, it becomes the active location.
  s = base(1, 2);
  const prior = activate(s, SL.den);
  s.phase = "staging";
  reveal(s, SL.tunnel);
  s = settle(s);
  assert.equal(s.activeLocation?.code, SL.tunnel);
  assert.ok(s.staging.some((u) => u.id === prior.id));
  // Sméagol's Secret Way travel: exhaust Sméagol or discard from each hand.
  s = base(1, 1);
  const way = stage(s, SL.secretWay);
  hand(s, [GUARD]);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: way.id });
  assert.match(s.choice!.title, /^Sméagol's Secret Way · Travel cost/);
  s = choose(s, "smeagol");
  assert.equal(smeagolOf(s)!.exhausted, true);
});

test("Treacheries: Exhalation of Decay, Many Openings, Shelob's Poison, Lurking Malice and Rage and Hunger", () => {
  // Shelob's Poison: attached to a hero, exhausted, blank and unable to ready.
  let s = base(1, 2);
  s.phase = "staging";
  reveal(s, SL.poison);
  s = pastReveal(s);
  assert.match(
    s.choice!.title,
    /^Shelob's Poison · Attach to a hero you control/,
  );
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  s = settle(s);
  const poisoned = get(s, hero.id)!;
  assert.ok(poisoned.attachments.some((a) => a.code === SL.poison));
  assert.equal(poisoned.exhausted, true);
  assert.equal(SHELOB_LAIR_HOOKS.cannotReady!(s, poisoned), true);
  assert.equal(SHELOB_LAIR_HOOKS.characterBlanked!(s, poisoned), true);
  // Lurking Malice: a resource or an attack.
  s = base(1, 2);
  s.phase = "staging";
  reveal(s, SL.malice);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Lurking Malice · Choose one/);
  s = choose(s, "resource");
  assert.equal(shelob(s)!.resources, 1);
  s = settle(s);
  // Rage and Hunger: +2 attack this phase and an attack against each player.
  s = base(2, 2);
  s.phase = "staging";
  reveal(s, SL.rage);
  s = pastReveal(s);
  assert.equal(stats(s, shelob(s)!).attack, card(SL.shelob).attack! + 2);
  assert.ok(
    s.log.some((l) => /Rage and Hunger: Shelob gets \+2 attack/.test(l.text)),
  );
  s = settle(s);
  // Many Openings: +1 threat for each staged location, and another card with too few.
  s = base(2, 2);
  stage(s, SL.den);
  s.encounterDeck = [SL.passage, SL.den];
  s.phase = "staging";
  const before = stagingThreat(s);
  reveal(s, SL.openings);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === SL.passage),
    "an additional card is revealed",
  );
  assert.ok(stagingThreat(s) >= before + 1 + card(SL.passage).threat!);
  // Exhalation of Decay: a random card and an attachment.
  s = base(1, 2);
  hand(s, [GUARD]);
  s.phase = "staging";
  reveal(s, SL.exhalation);
  s = settle(s);
  assert.equal(s.hand.length, 0);
});

test("Enemies and shadows: Morgul Orc and Orc of Cirith Ungol's Peril choices, and the shadow effects", () => {
  let s = base(1, 2);
  hand(s, [GUARD]);
  s.phase = "staging";
  reveal(s, SL.morgulOrc);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Morgul Orc · Choose one/);
  s = choose(s, "discard");
  assert.equal(s.hand.length, 0);
  s = base(2, 2);
  s.phase = "staging";
  reveal(s, SL.cirithOrc);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Orc of Cirith Ungol · Choose one/);
  s = settle(s, "discard");
  // Shadows.
  const attacking = (s: GameState, code: string) => {
    const enemy = code === SL.shelob ? shelob(s)! : engaged(s, code);
    s.combat = {
      enemyId: enemy.id,
      attackPlayer: 0,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
    };
    return enemy;
  };
  s = base(1, 2);
  attacking(s, SL.shelob);
  run(s, "shadowEffect", 0, { code: SL.rage });
  assert.equal(s.combat!.extraAttacks, 1);
  run(s, "shadowEffect", 0, { code: SL.malice });
  assert.equal(shelob(s)!.resources, 1);
  assert.equal(s.combat!.attackBonus, 1);
  s = base(1, 2);
  activate(s, SL.spidersLair);
  attacking(s, SL.morgulOrc);
  run(s, "shadowEffect", 0, { code: SL.openings });
  assert.equal(s.combat!.attackBonus, card(SL.spidersLair).threat);
  run(s, "shadowEffect", 0, { code: SL.morgulOrc });
  assert.equal(s.combat!.slDiscardOnKill, true);
  // Public state and saves.
  const view = publicState(s) as unknown as {
    shelobLair: { stage: number; shelobInPlay: boolean };
  };
  assert.equal(view.shelobLair.stage, 2);
  assert.equal(view.shelobLair.shelobInPlay, true);
  assert.ok(shelobLairPublicState(s));
  reload(s);
});
