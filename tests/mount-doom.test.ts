import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canPlay, canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, stagingThreat, stats, threatOf } from "../src/game/core";
import { check, engage } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { threatElimination } from "../src/game/threat-elimination";
import { angmarValour } from "../src/game/angmar-player-support";
import { hideCandidates, hideThreat, hideValue } from "../src/game/hide-test";
import { playerCardImmune } from "../src/game/card-immunity";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "../src/game/table";
import { MOUNTAIN_FIRE_FRODO } from "../src/game/lotr-saga-codes";
import {
  MD,
  MD_GASP_PROGRESS,
  MOUNT_DOOM_HOOKS,
  MOUNT_DOOM_RECIPES,
  mountDoomPublicState,
  mountDoomStageInfo,
} from "../src/game/mount-doom";
import {
  FILLER,
  activate,
  allies,
  base,
  choose,
  created,
  doom,
  engaged,
  frodo,
  hand,
  reload,
  ring,
  settle,
  stage,
  start,
} from "./mount-doom-fixtures";
import type { GameState, Unit } from "../src/game/types";

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
/** Commit the given heroes to the current Fortitude test, then resolve it. */
const fortitude = (s: GameState, commit: Unit[] = [], resolve = true) => {
  for (const u of commit) s = choose(s, u.id);
  s = choose(s, "done");
  return resolve ? act(s, { type: "RESOLVE_HIDE" }) : s;
};
/** An engaged enemy attacks with the given shadow cards (facedown). */
const defend = (
  s: GameState,
  enemy: Unit,
  defender: Unit | null,
  shadows: string[] = [],
) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const travel = (s: GameState, u: Unit) => {
  s.phase = "travel";
  return act(s, { type: "TRAVEL", id: u.id });
};
const deckSize = (easy: boolean) =>
  MOUNT_DOOM_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);
const GUARD = "01013",
  BLADE = "01039",
  TEST_OF_WILL = "01050";
/** A hero of a player other than Frodo. */
const hero = (s: GameState, p = 0) =>
  seatView(s, p).heroes.find((h) => h.code !== MOUNTAIN_FIRE_FRODO)!;
const heroes = (s: GameState, p = 0) =>
  seatView(s, p).heroes.filter((h) => h.code !== MOUNTAIN_FIRE_FRODO);

test("Setup: Mount Doom and The Tower of Barad-dûr in the staging area, Brake of Thorns active and its damage, the Ring-bearer with The One Ring, Dire, and each player's search for a different location, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = created(players, easy, 701 + players);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [MD.doom, MD.tower],
      );
      assert.equal(s.activeLocation?.code, MD.brake);
      // The locations of the recipe's staging area wait in the deck for the searches.
      assert.equal(s.encounterDeck.length, deckSize(easy) + 5);
      assert.equal(threatElimination(s), 99);
      assert.equal(frodo(s)?.code, MOUNTAIN_FIRE_FRODO);
      assert.ok(seatView(s, firstPlayer(s)).heroes.some((h) => h === frodo(s)));
      assert.ok(ring(s), "The One Ring is attached to the Ring-bearer");
      // Brake of Thorns' Forced effect resolves at setup.
      assert.match(s.choice!.title, /^Brake of Thorns · Assign damage/);
      const done = start(players, easy, 701 + players);
      const searched = done.staging
        .filter((u) => u.code !== MD.doom && u.code !== MD.tower)
        .map((u) => card(u.code).name);
      assert.equal(searched.length, players);
      assert.equal(new Set(searched).size, players, "different locations");
      assert.equal(done.encounterDeck.length, deckSize(easy) + 5 - players);
      assert.ok(done.mountDoom!.ready);
      for (const p of playerOrder(done)) {
        const v = seatView(done, p);
        // Damage on the characters still in play, and on the ones it destroyed.
        const dealt =
          [...v.heroes, ...v.allies].reduce((n, u) => n + u.damage, 0) +
          seatView(s, p)
            .heroes.filter((h) => !v.heroes.some((x) => x.id === h.id))
            .reduce((n, h) => n + (card(h.code).health ?? 0), 0);
        const before = seatView(s, p).threat;
        assert.equal(dealt, Math.floor(before / 10), `player ${p} damage`);
      }
    }
});

test("Fortitude tests: the player exhausts heroes only, discards the tens digit of his threat in encounter cards and passes only with more willpower than their Sauron's Eye icons; Brake of Thorns in the staging area adds an icon; the deck reshuffles when empty", () => {
  let s = base(1);
  allies(s, [GUARD]);
  s.encounterDeck = [MD.master, MD.eye, ...Array(6).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  assert.equal(s.hideTest?.kind, "fortitude");
  assert.match(s.choice!.title, /^Fortitude test · Commit heroes/);
  assert.deepEqual(
    hideCandidates(s)
      .map((u) => u.code)
      .sort(),
    seatView(s, 0)
      .heroes.map((u) => u.code)
      .sort(),
    "only heroes may commit",
  );
  assert.equal(hideValue(s), 2, "threat 20: 2 cards");
  // 3 + 2 = 5 icons; 4 willpower (Aragorn 2, Glóin 2) fails.
  const [a, , c] = seatView(s, 0).heroes;
  s = fortitude(s, [a, c], false);
  assert.equal(s.hideTest?.phase, "actions");
  assert.equal(hideThreat(s), 5);
  s = act(s, { type: "RESOLVE_HIDE" });
  assert.equal(s.hideTest, undefined);
  assert.equal(s.threat, 30, "The Lidless Eye: +10 threat");
  assert.ok(seatView(s, 0).heroes.find((h) => h.id === a.id)!.exhausted);
  assert.deepEqual(MOUNT_DOOM_HOOKS.hideFailed && s.mountDoom!.failed, {
    round: s.round,
    players: [0],
  });
  // Equal willpower fails; more willpower passes.
  s = base(1);
  s.encounterDeck = [MD.uruk, MD.plain, ...Array(4).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  s = fortitude(s, [seatView(s, 0).heroes.find((h) => h.code === "01002")!]);
  assert.equal(s.threat, 30, "1 willpower against 1 icon fails");
  s = base(1);
  s.encounterDeck = [MD.uruk, MD.plain, ...Array(4).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  s = fortitude(s, [seatView(s, 0).heroes.find((h) => h.code === "01001")!]);
  assert.equal(s.threat, 20, "2 willpower against 1 icon passes");
  // Brake of Thorns in the staging area adds an icon to each test.
  s = base(1);
  stage(s, MD.brake);
  s.encounterDeck = [MD.uruk, MD.plain, ...Array(4).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  s = fortitude(
    s,
    [seatView(s, 0).heroes.find((h) => h.code === "01001")!],
    false,
  );
  assert.equal(hideThreat(s), 2);
  s = act(s, { type: "RESOLVE_HIDE" });
  assert.equal(s.threat, 30);
  // An empty deck: the discard pile is shuffled back, in any phase.
  s = base(1);
  s.encounterDeck = [];
  s.encounterDiscard = [MD.plain, MD.plain, MD.plain];
  s = run(s, "hideFortitude", 0, { code: MD.captain });
  s = fortitude(s, [], false);
  assert.equal(s.hideTest!.discarded.length, 2);
  assert.ok(s.log.some((l) => /discard pile is shuffled back/.test(l.text)));
  // With threat under 10 no card is discarded, and no willpower still fails.
  s = base(1);
  s.threat = 9;
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  assert.equal(hideValue(s), 0);
  s = fortitude(s);
  assert.equal(s.threat, 19, "0 willpower against 0 icons fails");
});

test("Gollum discarded during a Fortitude test enters play engaged with the first player, and the players ignore the Sauron's Eye icons of a discarded card; Heavy and Tired keeps its hero out of the test", () => {
  let s = base(2);
  forOwner(s, 1, () => (s.threat = 30));
  s.encounterDeck = [MD.gollum, MD.master, MD.eye, ...Array(4).fill(MD.plain)];
  s = run(s, "hideFortitude", 1, { code: MD.eye });
  s = fortitude(s, [], false);
  assert.ok(
    seatView(s, firstPlayer(s)).engaged.some((u) => u.code === MD.gollum),
    "Gollum is engaged with the first player",
  );
  assert.ok(!s.encounterDiscard.includes(MD.gollum));
  // “Wicked Master!” (3) and The Lidless Eye (2): the first player chooses.
  assert.match(s.choice!.title, /^Gollum · Choose an encounter card/);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.hideTest!.ignored, 1, "“Wicked Master!” is ignored");
  assert.equal(hideThreat(s), 2);
  s = reload(s);
  assert.equal(s.hideTest!.ignored, 1, "saved and restored");
  // Heavy and Tired: no Fortitude tests for its hero.
  s = base(1);
  const h = hero(s);
  h.attachments.push({ id: "heavy-1", code: MD.heavy, exhausted: false });
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  assert.ok(!hideCandidates(s).some((u) => u.id === h.id));
});

test("The Land of Mordor: +4 quest points for each player; the first treachery revealed each quest phase is immune to player card effects and gains surge", () => {
  for (const players of [1, 2, 3])
    assert.equal(mountDoomStageInfo(base(players))!.quest, 4 + 4 * players);
  let s = base(3, 1);
  const spirit = 2;
  hand(s, [TEST_OF_WILL, TEST_OF_WILL], spirit);
  forOwner(s, spirit, () => {
    for (const h of s.heroes) h.resources = 3;
  });
  s.phase = "staging";
  s.encounterDeck = [MD.plain, MD.plain, ...Array(6).fill(MD.plain)];
  s = reveal(s, MD.fumes);
  // No player card can cancel it: no cancel option is offered.
  assert.ok(
    !s.choice?.options.some((o) => o.code === TEST_OF_WILL),
    "the first treachery cannot be canceled",
  );
  s = pastReveal(s);
  assert.equal(s.mountDoom!.firstTreachery, s.round);
  assert.ok(
    s.log.some((l) =>
      /Foul Fumes is the first treachery revealed this quest phase/.test(
        l.text,
      ),
    ),
  );
  s = settle(s);
  assert.ok(
    s.log.some((l) => /Revealed Plain of Gorgoroth/.test(l.text)),
    "surge reveals another card",
  );
  // The second treachery of the phase can be canceled.
  s.encounterDeck.unshift(MD.fumes);
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  assert.ok(
    s.choice?.options.some((o) => o.code === TEST_OF_WILL),
    JSON.stringify(s.choice?.options),
  );
  // 1B is defeated with its quest points: 2A.
  s = base(1, 1);
  s.encounterDeck = [MD.mordorRoad, ...Array(6).fill(MD.plain)];
  s.progress = 8;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.mountDoom!.currentQuest, MD.road);
});

test("The Road to Isenmouthe: 2A brings Mordor Road and travels there; 2B tests each player after progress from a successful quest, a resource for a pass and an enemy for a failure, and advances with a resource for each player", () => {
  let s = base(2, 1);
  activate(s, MD.plain);
  s.encounterDeck = [
    MD.uruk,
    MD.plain,
    MD.mordorRoad,
    ...Array(6).fill(MD.plain),
  ];
  s.encounterDiscard = [MD.eye];
  s.progress = 12;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(
    s.activeLocation?.code,
    MD.mordorRoad,
    "the players travel to Mordor Road",
  );
  assert.ok(
    s.staging.some((u) => u.code === MD.plain),
    "the previous active location returns to the staging area",
  );
  // Mordor Road's Forced effect: each player discards the top card; enemies join the staging area.
  assert.ok(
    s.staging.some((u) => u.code === MD.uruk),
    "Big Uruk joins the staging area",
  );
  // 2B: after placing progress from a successful quest.
  s = base(2, 2);
  s.encounterDeck = [
    MD.plain,
    MD.plain, // player 1's test: no icon
    MD.master,
    MD.eye,
    MD.plain,
    MD.uruk, // player 2's test: 5 icons, then an enemy
    ...Array(6).fill(MD.plain),
  ];
  forOwner(s, 1, () => (s.threat = 20));
  MOUNT_DOOM_HOOKS.successfulQuestProgress!(s, 3);
  flush(s);
  s = fortitude(s, [hero(s, 0)]);
  assert.equal(s.mountDoom!.resources, 1, "a resource for the pass");
  s = fortitude(s, []);
  assert.ok(
    seatView(s, 1).engaged.some((u) => u.code === MD.uruk),
    "an enemy for the failure",
  );
  s = settle(s, "threat");
  // At the end of the quest phase, a resource for each player advances.
  s = base(2, 2);
  s.mountDoom!.resources = 2;
  s.encounterDeck = [
    MD.plain,
    MD.hold,
    MD.plain,
    MD.water,
    ...Array(6).fill(MD.plain),
  ];
  MOUNT_DOOM_HOOKS.endQuest!(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.mountDoom!.currentQuest, MD.gasp);
  // 3A: X locations (2 players) from the reshuffled deck join the staging area.
  const added = s.staging.filter(
    (u) => card(u.code).type_code === "location" && u.code !== MD.doom,
  );
  assert.equal(added.length, 2);
});

test("The Last Gasp: the first player's test at the beginning of the quest phase caps the progress at 5; no travel to Mount Doom before 20 progress; the travel tests each player and defeats the stage, and 4A brings an enemy for each player", () => {
  let s = base(1, 3);
  s.encounterDeck = [MD.master, MD.eye, ...Array(10).fill(MD.plain)];
  const effects = MOUNT_DOOM_HOOKS.questBegin!(s) as ReturnType<typeof fx>[];
  s.queue.push(...effects);
  flush(s);
  s = fortitude(s, []);
  assert.equal(s.mountDoom!.capped?.round, s.round);
  // Progress on the stage is capped at 5 this round.
  const quest = mainQuestUnit(s)!;
  assert.equal(MOUNT_DOOM_HOOKS.progress!(s, 8, quest), 5);
  MOUNT_DOOM_HOOKS.questProgressPlaced!(s, quest, 5);
  assert.equal(MOUNT_DOOM_HOOKS.progress!(s, 3, quest), 0);
  // Mount Doom: no travel before 20 progress.
  s = base(1, 3);
  s.phase = "travel";
  const m = doom(s)!;
  assert.match(canTravel(s, m) ?? "", /at least 20 progress/);
  s.progress = MD_GASP_PROGRESS;
  assert.equal(canTravel(s, m), null);
  s.encounterDeck = [
    MD.plain,
    MD.plain,
    MD.captain,
    MD.plain,
    ...Array(6).fill(MD.plain),
  ];
  s = travel(s, m);
  s = fortitude(s, [hero(s)]);
  s = settle(s);
  assert.equal(s.activeLocation?.code, MD.doom);
  assert.equal(s.stage, 4, "3B is defeated as soon as Mount Doom is active");
  assert.ok(
    s.staging.some((u) => u.code === MD.captain),
    "4A: an enemy for each player",
  );
  // A failed travel test raises that player's threat by 9.
  s = base(1, 3);
  s.progress = MD_GASP_PROGRESS;
  s.encounterDeck = [MD.master, MD.plain, ...Array(8).fill(MD.plain)];
  s = travel(s, doom(s)!);
  s = fortitude(s, []);
  assert.equal(s.threat, 29);
});

test("The Crack of Doom: no ally enters play, 'when revealed' effects cannot be canceled, and exploring Mount Doom calls the first player's last Fortitude test with an extra card for each player: win or lose", () => {
  let s = base(2, 4);
  const [guard] = hand(s, [GUARD]);
  s.phase = "planning";
  assert.match(canPlay(s, guard) ?? "", /allies cannot enter play/);
  assert.equal(MOUNT_DOOM_HOOKS.cannotCancel!(s, false, MD.eye), true);
  assert.equal(MOUNT_DOOM_HOOKS.cannotCancel!(s, true, MD.eye), false);
  // Exploring Mount Doom: threat 20, 2 cards + 2 extra for 2 players.
  const m = doom(s)!;
  s.staging = s.staging.filter((u) => u.id !== m.id);
  s.activeLocation = m;
  s.encounterDeck = Array(10).fill(MD.plain);
  MOUNT_DOOM_HOOKS.explored!(s, m, true);
  flush(s);
  assert.equal(hideValue(s), 4);
  s = fortitude(s, [hero(s)]);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /completes the quest/);
  s = base(1, 4);
  s.encounterDeck = [MD.master, MD.eye, MD.plain, ...Array(6).fill(MD.plain)];
  MOUNT_DOOM_HOOKS.explored!(s, doom(s)!, true);
  flush(s);
  s = fortitude(s, [hero(s)]);
  assert.equal(s.status, "lost");
  assert.match(s.reason ?? "", /claims The One Ring/);
});

test("The Tower of Barad-dûr: no threat raise at the end of the refresh phase; at the end of the round each player raises his threat by 1 for each non-Fellowship character", () => {
  let s = base(2);
  allies(s, [GUARD, GUARD], 1);
  assert.equal(MOUNT_DOOM_HOOKS.refreshThreatBonus!(s), -1);
  const effects = MOUNT_DOOM_HOOKS.roundEnd!(s);
  s.queue.push(...effects);
  flush(s);
  // Player 1: 3 heroes, Frodo is Fellowship; player 2: 3 heroes and 2 allies.
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 25);
});

test("Locations: Orc-hold, Mordor Road, Plain of Gorgoroth, Brake of Thorns, Old Water-course and Mount Doom", () => {
  // Orc-hold: no progress on the other locations in the staging area.
  let s = base(1);
  const hold = stage(s, MD.hold);
  const plain = stage(s, MD.plain);
  assert.equal(MOUNT_DOOM_HOOKS.locationProgressBlocked!(s, plain), true);
  assert.equal(MOUNT_DOOM_HOOKS.locationProgressBlocked!(s, hold), false);
  // After it becomes active: an Orc enemy engaged with the first player.
  s.encounterDeck = [
    MD.plain,
    MD.gollum,
    MD.snuffler,
    ...Array(4).fill(MD.plain),
  ];
  s = travel(s, hold);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === MD.snuffler));
  // Mordor Road: +1 threat for each ally of the player with the most.
  s = base(2);
  const road = stage(s, MD.mordorRoad);
  allies(s, [GUARD, GUARD], 1);
  allies(s, [GUARD], 0);
  assert.equal(threatOf(s, road), 1 + 2);
  // Plain of Gorgoroth: +2 threat after a failed test this round; travel tests the first player.
  s = base(1);
  const p2 = stage(s, MD.plain);
  assert.equal(threatOf(s, p2), 2);
  s.mountDoom!.failed = { round: s.round, players: [0] };
  assert.equal(threatOf(s, p2), 4);
  s = base(2);
  const p3 = stage(s, MD.plain);
  s.encounterDeck = [MD.master, MD.plain, ...Array(6).fill(MD.plain)];
  s = travel(s, p3);
  s = fortitude(s, []);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [24, 24],
    "each player raises his threat by 4",
  );
  assert.equal(s.activeLocation?.code, MD.plain);
  // Brake of Thorns: X damage for each player after it becomes active.
  s = base(1);
  s.threat = 34;
  const brake = stage(s, MD.brake);
  s = travel(s, brake);
  assert.match(
    s.choice!.title,
    /^Brake of Thorns · Assign damage .* 3 remaining/,
  );
  s = settle(s);
  const total = [...seatView(s, 0).heroes].reduce((n, u) => n + u.damage, 0);
  assert.equal(total, 3);
  // Old Water-course: each player exhausts a hero to travel; its Response reduces threat by 5.
  s = base(2);
  const water = stage(s, MD.water);
  for (const h of seatView(s, 1).heroes) h.exhausted = true;
  s.phase = "travel";
  assert.match(canTravel(s, water) ?? "", /exhaust a hero/);
  s = base(2);
  const water2 = stage(s, MD.water);
  s = travel(s, water2);
  s = settle(s);
  assert.equal(s.activeLocation?.code, MD.water);
  assert.equal(
    playerOrder(s).filter((p) => seatView(s, p).heroes.some((h) => h.exhausted))
      .length,
    2,
  );
  s.threat = 40;
  MOUNT_DOOM_HOOKS.explored!(s, s.activeLocation!, true);
  flush(s);
  s = choose(s, "reduce");
  assert.equal(
    seatView(s, 0).threat,
    35,
    "an encounter effect: Dire does not limit it",
  );
  // Mount Doom: immune, X is the tens digit of the first player's threat.
  s = base(1);
  s.threat = 47;
  assert.equal(threatOf(s, doom(s)!), 4);
  assert.ok(playerCardImmune(doom(s)!));
});

test("Enemies: Gollum, Ringwraith of Sauron, Orc Captain, Big Uruk and Little Snuffler", () => {
  // Gollum engages the first player and is immune to non-Fellowship player cards.
  let s = base(2);
  s.phase = "staging";
  s.encounterDeck = Array(6).fill(MD.plain);
  s = reveal(s, MD.gollum, 1);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === MD.gollum));
  // Ringwraith of Sauron: after a failed test it engages that player and attacks.
  s = base(1);
  const wraith = stage(s, MD.wraith);
  assert.equal(MOUNT_DOOM_HOOKS.cannotAttach!(s, wraith, BLADE), true);
  s.encounterDeck = [MD.master, MD.plain, ...Array(6).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.captain });
  s = fortitude(s, []);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === wraith.id));
  assert.match(s.choice?.title ?? "", /Immediate attack/i);
  // Orc Captain: after it engages you, a test; a failure reveals a card.
  s = base(1);
  const captain = stage(s, MD.captain);
  s.encounterDeck = [MD.master, MD.plain, MD.plain, ...Array(6).fill(MD.plain)];
  forOwner(s, 0, () => engage(s, captain));
  flush(s);
  s = fortitude(s, []);
  s = settle(s);
  assert.ok(s.log.some((l) => /Revealed Plain of Gorgoroth/.test(l.text)));
  // Big Uruk: raise your threat by 4, or an immediate attack.
  s = base(1);
  const uruk = stage(s, MD.uruk);
  forOwner(s, 0, () => engage(s, uruk));
  flush(s);
  s = choose(s, "threat");
  assert.equal(s.threat, 24);
  // Little Snuffler: threat for each ally, or discard an ally.
  s = base(1);
  allies(s, [GUARD, GUARD]);
  s.phase = "staging";
  s.encounterDeck = Array(6).fill(MD.plain);
  s = reveal(s, MD.snuffler);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Little Snuffler · Choose one/);
  s = choose(s, "threat");
  assert.equal(s.threat, 22);
});

test("Treacheries: “Wicked Master!”, The Lidless Eye, Foul Fumes and Heavy and Tired", () => {
  // “Wicked Master!”: Gollum comes from the deck, engaged with the first player.
  let s = base(2);
  s.phase = "staging";
  s.encounterDeck = [MD.gollum, ...Array(6).fill(MD.plain)];
  s = reveal(s, MD.master, 1);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === MD.gollum));
  // With Gollum in play he attacks the first player.
  s = base(1);
  engaged(s, MD.gollum);
  s.phase = "staging";
  s.encounterDeck = Array(6).fill(MD.plain);
  s = reveal(s, MD.master);
  s = pastReveal(s);
  assert.match(s.choice?.title ?? "", /Immediate attack/i);
  // The Lidless Eye: 2 more icons while The One Ring is exhausted.
  s = base(1);
  ring(s)!.exhausted = true;
  s.encounterDeck = [MD.plain, MD.plain, ...Array(6).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  s = fortitude(s, [hero(s)], false);
  assert.equal(hideThreat(s), 2);
  // Foul Fumes: each player tests; a failure deals 1 damage to each of his
  // characters and blanks the damaged ones until the end of the round.
  s = base(1);
  allies(s, [GUARD]);
  s.phase = "staging";
  s.encounterDeck = [MD.master, MD.plain, ...Array(6).fill(MD.plain)];
  s = reveal(s, MD.fumes);
  s = pastReveal(s);
  s = fortitude(s, []);
  s = settle(s);
  const chars = [...seatView(s, 0).heroes, ...seatView(s, 0).allies];
  assert.ok(chars.every((u) => u.damage === 1));
  assert.ok(
    chars.every((u) => u.blanked),
    "their text boxes are blank",
  );
  // Heavy and Tired: the hero with the most attachments, exhausted.
  s = base(1);
  s.phase = "staging";
  s.encounterDeck = Array(6).fill(MD.plain);
  s = reveal(s, MD.heavy);
  s = settle(s);
  const host = frodo(s)!;
  assert.ok(
    host.attachments.some((a) => a.code === MD.heavy),
    "Frodo has The One Ring",
  );
  assert.ok(host.exhausted);
  // After a failed test: exhaust the hero and discard each non-objective attachment.
  host.exhausted = false;
  s.encounterDeck = [MD.master, MD.plain, ...Array(6).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.captain });
  s = fortitude(s, []);
  s = settle(s);
  const after = frodo(s)!;
  assert.ok(after.exhausted);
  assert.ok(!after.attachments.some((a) => a.code === MD.heavy));
  assert.ok(ring(s), "The One Ring is an objective and stays");
});

test("Shadows: Orc Captain, Big Uruk, Little Snuffler, “Wicked Master!”, The Lidless Eye and Foul Fumes, and the Deep Shadows set", () => {
  // Big Uruk: +1 attack for each ally you control.
  let s = base(1);
  allies(s, [GUARD, GUARD]);
  let enemy = engaged(s, MD.snuffler);
  s = defend(s, enemy, hero(s), [MD.uruk]);
  assert.ok(
    s.log.some((l) =>
      /Big Uruk: the attacking enemy gets \+2 attack/.test(l.text),
    ),
  );
  // The Lidless Eye: +2 after a failed test this round.
  s = base(1);
  s.mountDoom!.failed = { round: s.round, players: [0] };
  enemy = engaged(s, MD.snuffler);
  s = defend(s, enemy, hero(s), [MD.eye]);
  assert.ok(
    s.log.some((l) =>
      /The Lidless Eye: the attacking enemy gets \+2 attack/.test(l.text),
    ),
  );
  // Foul Fumes: undefended after a failed test.
  s = base(1);
  s.mountDoom!.failed = { round: s.round, players: [0] };
  enemy = engaged(s, MD.snuffler);
  s = defend(s, enemy, hero(s), [MD.fumes]);
  assert.ok(
    s.log.some((l) => /Foul Fumes: .*considered undefended/.test(l.text)),
  );
  // “Wicked Master!”: Gollum attacks again.
  s = base(1);
  enemy = engaged(s, MD.gollum);
  s = defend(s, enemy, hero(s), [MD.master]);
  assert.ok(
    s.log.some((l) => /Gollum makes an additional attack/.test(l.text)),
  );
  // Little Snuffler: exhaust a character you control.
  s = base(1);
  enemy = engaged(s, MD.snuffler);
  s = defend(s, enemy, hero(s), [MD.snuffler]);
  assert.match(s.choice?.title ?? "", /^Little Snuffler · Exhaust a character/);
  // Orc Captain: a destroyed character returns the attacker to the staging area.
  s = base(1);
  const [guard] = allies(s, [GUARD]);
  enemy = engaged(s, MD.captain);
  s = defend(s, enemy, guard, [MD.captain]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  // Deep Shadows: an additional attack.
  s = base(1);
  enemy = engaged(s, MD.snuffler);
  s = defend(s, enemy, hero(s), [MD.deep]);
  assert.ok(
    s.log.some((l) =>
      /Deep Shadows: the attacking enemy makes an additional attack/.test(
        l.text,
      ),
    ),
  );
});

test("Dire: threat elimination at 99, no more than 1 threat reduction each round from non-boon player cards, and Valour at 80", () => {
  let s = base(1);
  assert.equal(threatElimination(s), 99);
  s.threat = 70;
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(reduceThreat(s, 3, TEST_OF_WILL), 1, "only 1 this round");
  assert.equal(
    reduceThreat(s, 5, MD.water, "encounter"),
    5,
    "encounter effects in full",
  );
  s.threat = 80;
  assert.equal(angmarValour(s), true);
  s.threat = 99;
  check(s);
  assert.equal(s.status, "lost");
});

test("The public state follows the stage, the Fortitude failures, Mount Doom, The Tower and Gollum; saves restore mid-test", () => {
  let s = base(2, 2);
  s.mountDoom!.resources = 1;
  s.mountDoom!.failed = { round: s.round, players: [1] };
  engaged(s, MD.gollum);
  const view = mountDoomPublicState(s)!;
  assert.equal(view.stage, 2);
  assert.equal(view.resources, 1);
  assert.deepEqual(view.failed, [1]);
  assert.equal(view.tower, true);
  assert.equal(view.doom, "staging");
  assert.equal(view.gollum, "engaged");
  s.encounterDeck = [MD.master, ...Array(8).fill(MD.plain)];
  s = run(s, "hideFortitude", 0, { code: MD.eye });
  s = reload(s);
  assert.equal(s.hideTest?.kind, "fortitude");
  s = fortitude(s, [], false);
  s = reload(s);
  assert.equal(s.hideTest?.phase, "actions");
  assert.ok(stats(s, hero(s)));
  assert.ok(stagingThreat(s) >= 0);
  assert.ok(globalEngaged(s).length >= 1);
});
