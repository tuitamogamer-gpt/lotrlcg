import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  progressLocation,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { hasResourceIcon, hasTrait } from "../src/game/expansion-passives";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import {
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import { consideredEngaged } from "../src/game/considered-engagement";
import { MOUNTAIN_FIRE_ONE_RING, ringBearer } from "../src/game/lotr-saga";
import {
  CIRITH_UNGOL_HOOKS,
  CIRITH_UNGOL_RECIPES,
  CU,
  CU_CHAMBER_PROGRESS,
  CU_ESCAPE_PROGRESS,
  cirithUngolPublicState,
  cirithUngolStageInfo,
} from "../src/game/cirith-ungol";
import {
  FILLER,
  activate,
  allies,
  base,
  choose,
  created,
  engaged,
  flipped,
  frodo,
  hand,
  host,
  reload,
  ring,
  settle,
  stage,
  watchers,
} from "./cirith-ungol-fixtures";
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
/** An engaged enemy attacks; a considered-engaged enemy is dealt the top encounter card. */
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
/** Travel to a location in the staging area. */
const travel = (s: GameState, u: Unit) => {
  s.phase = "travel";
  return act(s, { type: "TRAVEL", id: u.id });
};
const deckSize = (easy: boolean) =>
  CIRITH_UNGOL_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);
const GUARD = "01013",
  SNOWBOURN = "01016",
  BLADE = "01039";
/** An enemy engages the active player. */
const engageEnemy = (s: GameState, u: Unit) => {
  engage(s, u);
  flush(s);
  return s;
};
const hero = (s: GameState, p = 0) =>
  seatView(s, p).heroes.find(
    (h) => !h.attachments.some((a) => a.code === CU.company),
  )!;

test("Setup: The Two Watchers and Topmost Chamber are in the staging area, Shagrat is set aside, the Ring-bearer is captive and the first player attaches Last of the Company and The One Ring to a hero, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = created(players, easy, 601 + players);
      assert.deepEqual(
        s.staging.map((u) => u.code),
        [CU.twoWatchers, CU.chamber],
      );
      assert.equal(s.activeLocation, null);
      assert.deepEqual(s.cirithUngol!.setAside, [CU.shagrat]);
      assert.equal(s.encounterDeck.length, deckSize(easy));
      assert.equal(s.cirithUngol!.captive?.code, "146001");
      assert.ok(
        !seatView(s, firstPlayer(s)).heroes.some((h) => h.code === "146001"),
        "the first player loses control of the Ring-bearer",
      );
      assert.equal(ring(s), undefined, "The One Ring waits for its hero");
      assert.equal(s.cirithUngol!.ring?.code, MOUNTAIN_FIRE_ONE_RING);
      assert.equal(s.cirithUngol!.ringPlaced, false);
      assert.equal(s.status, "playing");
      assert.match(
        s.choice!.title,
        /^Pass the Two Watchers · Attach Last of the Company and The One Ring to a hero/,
      );
      assert.deepEqual(
        s.choice!.options.map((o) => o.id),
        seatView(s, firstPlayer(s)).heroes.map((h) => h.id),
      );
      assert.equal(cirithUngolPublicState(s)!.captive, true);
    }
  assert.equal(deckSize(false), 36);
  assert.equal(deckSize(true), 30);
  let s = created(2, false, 611);
  const second = s.choice!.options[1].id;
  s = choose(s, second);
  s = settle(s);
  const bearer = get(s, second)!;
  assert.deepEqual(
    bearer.attachments.map((a) => a.code),
    [CU.company, MOUNTAIN_FIRE_ONE_RING],
  );
  assert.equal(ringBearer(s)?.id, bearer.id);
  assert.ok(
    hasTrait(bearer, "Ring-bearer"),
    "Last of the Company grants the trait",
  );
  assert.ok(
    hasResourceIcon(bearer, "fellowship"),
    "Last of the Company grants the Fellowship sphere",
  );
  assert.equal(s.cirithUngol!.ringPlaced, true);
  assert.equal(s.round, 1);
});

test("The One Ring: if it leaves play with the hero carrying it, the players lose; Last of the Company keeps the first player token until 3A, then the Ring-bearer follows the token", () => {
  let s = base(2, 1);
  s = run(s, "refreshEnd");
  assert.equal(firstPlayer(s), 0, "Last of the Company keeps the token");
  assert.equal(CIRITH_UNGOL_HOOKS.keepFirstPlayer!(s), true);
  s = base(2, 3);
  assert.equal(CIRITH_UNGOL_HOOKS.keepFirstPlayer!(s), false);
  s = run(s, "refreshEnd");
  assert.equal(firstPlayer(s), 1);
  assert.ok(
    seatView(s, 1).heroes.some((h) => h.code === "146001"),
    "the Ring-bearer follows the first player token",
  );
  s = base(1, 1);
  const bearer = host(s)!;
  destroy(s, bearer, false);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason ?? "", /The One Ring has left play/);
});

test("Pass the Two Watchers: each non-unique location gets -1 threat and cannot leave the staging area; The Two Watchers' location threat is twice the stage number and travelling there flips it to its enemy side in the staging area, considered engaged with each player", () => {
  let s = base(2, 1);
  assert.equal(
    stagingThreat(s),
    2 + 1,
    "The Two Watchers (X = 2) and Topmost Chamber",
  );
  const passage = stage(s, CU.passage);
  assert.equal(threatOf(s, passage), 0, "1 - 1 at 1B");
  const chamber = s.staging.find((u) => u.code === CU.chamber)!;
  assert.equal(threatOf(s, chamber), 1, "Topmost Chamber is unique");
  assert.equal(CIRITH_UNGOL_HOOKS.cannotLeave!(s, passage), true);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotLeave!(s, chamber), false);
  progressLocation(s, passage, 5);
  flush(s);
  assert.ok(
    s.staging.some((u) => u.id === passage.id),
    "a non-unique location stays in the staging area, even with full progress",
  );
  assert.equal(passage.progress, 5);
  s.phase = "travel";
  assert.match(
    String(canTravel(s, passage)),
    /non-unique locations cannot leave/,
  );
  assert.match(
    String(canTravel(s, chamber)),
    new RegExp(`at least ${CU_CHAMBER_PROGRESS} progress on stage 2B`),
  );
  assert.equal(CIRITH_UNGOL_HOOKS.immune!(s, watchers(s)!), true);
  assert.equal(CIRITH_UNGOL_HOOKS.immune!(s, chamber), true);
  const id = watchers(s)!.id;
  s = travel(s, watchers(s)!);
  s = settle(s);
  const w = watchers(s)!;
  assert.equal(w.code, CU.watchersEnemy);
  assert.equal(w.id, id, "the same physical card");
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === id));
  assert.equal(cirithUngolPublicState(s)!.watchers, "enemy");
  for (const p of playerOrder(s)) assert.ok(consideredEngaged(s, w, p));
  assert.equal(threatOf(s, w), 2);
  assert.deepEqual(
    [stats(s, w).attack, stats(s, w).defense, stats(s, w).health],
    [5, 2, 4],
  );
  assert.equal(engagementCost(s, w), 50);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotEngage!(s, w), true);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotOptionallyEngage!(s, w), true);
  assert.equal(CIRITH_UNGOL_HOOKS.immune!(s, w), true);
  // 1B cannot be defeated while The Two Watchers is in play.
  s.progress = 5;
  check(s);
  flush(s);
  assert.equal(s.stage, 1);
});

test("The Two Watchers attacks each player: its damage is canceled and raises the defending player's threat instead; destroying it defeats 1B, and 2A shuffles the discard pile in and adds X enemies to the staging area", () => {
  let s = base(2, 1);
  const w = flipped(s);
  const defender = hero(s, 0);
  const def = stats(s, defender).defense;
  s = defend(s, w, defender);
  s = settle(s);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(seatView(s, 0).threat, 20 + (5 - def));
  // Undefended: the damage to a hero is canceled as well.
  s.table!.turn = 1;
  s = act(s, { type: "SELECT_SEAT", seat: 1 });
  s = defend(s, get(s, w.id)!, null);
  s = settle(s);
  assert.equal(seatView(s, 1).threat, 25);
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 0));
  // Destroying it: 1B is defeated and 2A adds one enemy per player.
  s = base(2, 1);
  const enemyAgain = flipped(s);
  s.encounterDeck = [CU.orc, CU.passage, CU.archer, CU.passage];
  s.encounterDiscard = [CU.hall];
  destroy(s, enemyAgain, true);
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.cirithUngol!.currentQuest, CU.tower);
  assert.ok(s.victoryCards!.includes(CU.watchersEnemy));
  assert.equal(cirithUngolPublicState(s)!.watchers, "victory");
  const enemies = s.staging.filter((u) => card(u.code).type_code === "enemy");
  assert.deepEqual(
    enemies.map((u) => u.code).sort(),
    [CU.archer, CU.orc].sort(),
  );
  assert.ok(
    s.encounterDiscard.every((c) => card(c).type_code !== "enemy"),
    "only non-enemies are discarded",
  );
  assert.equal(
    s.encounterDeck.length + s.encounterDiscard.length + enemies.length,
    5,
  );
  assert.equal(cirithUngolStageInfo(s)!.quest, 18);
});

test("Fighting in the Tower: at the beginning of each quest phase an enemy is discarded from the encounter deck; its copy in the staging area is discarded with it, else it joins the staging area; 2B cannot be defeated unless Topmost Chamber is in the victory display", () => {
  let s = base(1, 2);
  assert.deepEqual(
    CIRITH_UNGOL_HOOKS.questBegin!(s).map((e) => e.kind),
    ["cuTowerBegin"],
  );
  s.encounterDeck = [CU.passage, CU.orc, CU.archer, CU.orc, CU.passage];
  s = run(s, "cuTowerBegin");
  assert.deepEqual(s.encounterDiscard, [CU.passage]);
  assert.ok(s.staging.some((u) => u.code === CU.orc));
  s = run(s, "cuTowerBegin");
  assert.ok(s.staging.some((u) => u.code === CU.archer));
  s = run(s, "cuTowerBegin");
  assert.ok(
    !s.staging.some((u) => u.code === CU.orc),
    "the copy in the staging area is discarded too",
  );
  assert.equal(s.encounterDiscard.filter((c) => c === CU.orc).length, 2);
  s.progress = 30;
  check(s);
  flush(s);
  assert.equal(s.stage, 2, "Topmost Chamber is not in the victory display");
  // Torch-lit Hall resolves the same search after the players travel there.
  s = base(1, 2);
  const hall = stage(s, CU.hall);
  s.encounterDeck = [CU.passage, CU.wounded, CU.passage];
  s = travel(s, hall);
  s = settle(s);
  const uruk = s.staging.find((u) => u.code === CU.wounded)!;
  assert.ok(uruk, "Torch-lit Hall adds the enemy");
  assert.equal(uruk.damage, 2, "Wounded Uruk enters play with 2 damage");
});

test("Topmost Chamber: no travel before 18 progress on 2B, its Travel cost adds Shagrat to the staging area and exploring it frees the Ring-bearer; then 2B is defeated and 3A brings The One Ring to Frodo, exhausted, Last of the Company to the victory display and The Two Watchers back as a location while each other player reveals an encounter card", () => {
  let s = base(2, 2);
  const chamber = s.staging.find((u) => u.code === CU.chamber)!;
  s.phase = "travel";
  s.progress = CU_CHAMBER_PROGRESS - 1;
  assert.match(String(canTravel(s, chamber)), /at least 18 progress/);
  s.progress = CU_CHAMBER_PROGRESS;
  assert.equal(canTravel(s, chamber), null);
  s = travel(s, chamber);
  s = settle(s);
  assert.equal(s.activeLocation?.id, chamber.id);
  assert.ok(s.staging.some((u) => u.code === CU.shagrat));
  assert.deepEqual(s.cirithUngol!.setAside, []);
  assert.equal(cirithUngolPublicState(s)!.shagrat, "out");
  assert.equal(s.stage, 2);
  const bearer = host(s)!;
  s.encounterDeck = [CU.passage, CU.passage, CU.passage];
  progressLocation(s, s.activeLocation!, 1);
  flush(s);
  assert.ok(s.victoryCards!.includes(CU.chamber));
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.cirithUngol!.currentQuest, CU.escape);
  assert.equal(s.cirithUngol!.captive, undefined);
  const f = seatView(s, firstPlayer(s)).heroes.find(
    (h) => h.code === "146001",
  )!;
  assert.ok(f, "the first player controls Frodo");
  assert.equal(ringBearer(s)?.id, f.id, "The One Ring is attached to Frodo");
  assert.ok(f.exhausted, "the Ring-bearer is exhausted");
  assert.ok(!get(s, bearer.id)!.attachments.length);
  assert.equal(host(s), undefined);
  assert.ok(s.victoryCards!.includes(CU.company));
  assert.ok(!s.victoryCards!.some((c) => c === CU.watchersEnemy));
  assert.equal(watchers(s)?.code, CU.twoWatchers, "location side faceup");
  assert.equal(s.victory, 2, "Topmost Chamber");
  assert.equal(
    s.staging.filter((u) => u.code === CU.passage).length,
    1,
    "the other player revealed an encounter card",
  );
  assert.equal(cirithUngolStageInfo(s)!.quest, CU_ESCAPE_PROGRESS);
});

test("Escape from Cirith Ungol: no travel to The Two Watchers before 12 progress, X is 6, the enemy side gets +3 threat and +3 defense, and destroying it with 12 progress wins the game", () => {
  let s = base(1, 3);
  const loc = watchers(s)!;
  assert.equal(threatOf(s, loc), 6);
  s.phase = "travel";
  assert.match(String(canTravel(s, loc)), /at least 12 progress on this stage/);
  s.progress = CU_ESCAPE_PROGRESS;
  assert.equal(canTravel(s, loc), null);
  s = travel(s, loc);
  s = settle(s);
  const w = watchers(s)!;
  assert.equal(w.code, CU.watchersEnemy);
  assert.equal(threatOf(s, w), 5);
  assert.equal(stats(s, w).defense, 5);
  assert.ok(consideredEngaged(s, w, 0));
  assert.equal(
    s.status,
    "playing",
    "3B cannot be defeated while it is in play",
  );
  destroy(s, w, true);
  check(s);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason ?? "", /Ring-bearer is free of the tower/);
});

test("Last of the Company: exhaust The One Ring and raise your threat by 1 to give an enemy, even The Two Watchers, -X threat until the end of the phase, X being the bearer's willpower", () => {
  let s = base(1, 1);
  const w = flipped(s);
  const bearer = host(s)!;
  const lotc = bearer.attachments.find((a) => a.code === CU.company)!;
  const will = stats(s, bearer).will;
  s.phase = "quest";
  s = act(s, { type: "ABILITY", id: bearer.id, attachmentId: lotc.id });
  assert.equal(ring(s)!.exhausted, true);
  assert.equal(s.threat, 21);
  assert.match(s.choice!.title, /^Last of the Company · Choose an enemy/);
  s = choose(s, w.id);
  assert.equal(threatOf(s, get(s, w.id)!), Math.max(0, 2 - will));
  assert.equal(
    CIRITH_UNGOL_HOOKS.abilityProblem!(s, get(s, bearer.id)!, lotc.id),
    "The One Ring is exhausted.",
  );
  s.phase = "travel";
  assert.equal(threatOf(s, get(s, w.id)!), 2, "until the end of the phase");
  s = base(1, 1);
  const b2 = host(s)!;
  assert.equal(
    CIRITH_UNGOL_HOOKS.abilityProblem!(
      s,
      b2,
      b2.attachments.find((a) => a.code === CU.company)!.id,
    ),
    "Choose an enemy in play.",
  );
});

test("Frodo Baggins (The Mountain of Fire): a Planning Action exhausts The One Ring, wherever it is attached, to add 1 resource to a hero's pool", async () => {
  const { mountainFirePlayerAbilityProblem } =
    await import("../src/game/mountain-fire-player-cards");
  let s = base(1, 3);
  const f = frodo(s)!;
  const target = hero(s);
  const before = target.resources;
  s.phase = "quest";
  assert.equal(
    mountainFirePlayerAbilityProblem(s, f),
    "Frodo Baggins' ability is a Planning Action.",
  );
  s.phase = "planning";
  assert.equal(mountainFirePlayerAbilityProblem(s, f), undefined);
  s = act(s, { type: "ABILITY", id: f.id });
  assert.equal(ring(s)!.exhausted, true);
  assert.match(
    s.choice!.title,
    /^Frodo Baggins · Add 1 resource to a hero's pool/,
  );
  s = choose(s, target.id);
  assert.equal(get(s, target.id)!.resources, before + 1);
  assert.equal(
    mountainFirePlayerAbilityProblem(s, get(s, f.id)!),
    "The One Ring is exhausted.",
  );
  // 2B, once the Ring-bearer is free: The One Ring is still with Last of the Company.
  s = base(1, 2);
  const freed = s.cirithUngol!.captive!;
  delete s.cirithUngol!.captive;
  freed.owner = 0;
  freed.controller = 0;
  s.heroes.push(freed);
  assert.equal(mountainFirePlayerAbilityProblem(s, freed), undefined);
  s = act(s, { type: "ABILITY", id: freed.id });
  s = choose(s, freed.id);
  assert.equal(
    host(s)!.attachments.find((a) => a.code === MOUNTAIN_FIRE_ONE_RING)!
      .exhausted,
    true,
  );
  assert.equal(get(s, freed.id)!.resources, 1);
});

test("Locations: Echoing Passage, Bloodied Courtyard and Winding Stairs", () => {
  let s = base(2, 2);
  const passage = stage(s, CU.passage);
  const orc = stage(s, CU.orc);
  stage(s, CU.archer);
  assert.equal(
    threatOf(s, passage),
    1 + 2,
    "+1 threat for each enemy in the staging area",
  );
  activate(s, CU.passage);
  assert.equal(
    stats(s, orc).defense,
    1 + 2,
    "+2 defense while Echoing Passage is active",
  );
  // Bloodied Courtyard: each player raises his threat by 1 to travel there; active, it damages entering enemies.
  s = base(2, 2);
  const yard = stage(s, CU.courtyard);
  s = travel(s, yard);
  s = settle(s);
  assert.equal(s.activeLocation?.id, yard.id);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [21, 21],
  );
  s.phase = "staging";
  s = reveal(s, CU.archer);
  s = pastReveal(settle(s));
  const archer = s.staging.find((u) => u.code === CU.archer)!;
  assert.equal(archer.damage, 1);
  // Winding Stairs: each player exhausts a character to travel there; active, +10 engagement cost.
  s = base(2, 2);
  const stairs = stage(s, CU.stairs);
  const soldier = stage(s, CU.soldier);
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.exhausted = true)));
  s.phase = "travel";
  assert.match(
    String(canTravel(s, stairs)),
    /each player must exhaust a character/,
  );
  forOwner(s, 1, () => (s.heroes[0].exhausted = false));
  s = travel(s, stairs);
  assert.match(
    s.choice!.title,
    /^Winding Stairs · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(s.activeLocation?.id, stairs.id);
  assert.ok(seatView(s, 1).heroes.every((h) => h.exhausted));
  assert.equal(seatView(s, 0).heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(engagementCost(s, get(s, soldier.id)!), 38 + 10);
});

test("Shagrat: no non-boon attachments, no non-combat damage, no allies attacking or defending, and progress placed on the quest lowers his engagement cost until the end of the round", () => {
  let s = base(1, 2);
  const shagrat = stage(s, CU.shagrat);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotAttach!(s, shagrat, BLADE), true);
  damage(s, shagrat.id, 3);
  assert.equal(shagrat.damage, 0, "Shagrat cannot take non-combat damage");
  damage(s, shagrat.id, 3, { combatDamage: true });
  assert.equal(shagrat.damage, 3);
  const [guard] = allies(s, [GUARD]);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotAttack!(s, guard, shagrat), true);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotDefend!(s, shagrat, guard), true);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotDefend!(s, shagrat, hero(s)), false);
  assert.equal(engagementCost(s, shagrat), 46);
  CIRITH_UNGOL_HOOKS.questProgressPlaced!(s, s.cirithUngol!.currentQuest, 5);
  CIRITH_UNGOL_HOOKS.questProgressPlaced!(s, s.cirithUngol!.currentQuest, 3);
  assert.equal(engagementCost(s, shagrat), 46 - 8);
  s.round += 1;
  assert.equal(engagementCost(s, shagrat), 46, "until the end of the round");
  const gorbag = stage(s, CU.gorbag);
  assert.equal(CIRITH_UNGOL_HOOKS.cannotAttach!(s, gorbag, BLADE), true);
});

test("Enemies' engagement effects: Gorbag attacks at once, Wounded Uruk gets +2 attack this round, Orc of Mordor exhausts a character, Snaga Archer deals 2 damage and Uruk Soldier raises threat by 2", () => {
  let s = base(1, 2);
  const gorbag = stage(s, CU.gorbag);
  engageEnemy(s, gorbag);
  assert.equal(
    s.combat?.enemyId,
    gorbag.id,
    "Gorbag makes an immediate attack",
  );
  assert.match(s.choice!.title, /^Gorbag · Immediate attack/);
  s = base(1, 2);
  const uruk = stage(s, CU.wounded);
  engageEnemy(s, uruk);
  s = settle(s);
  assert.equal(stats(s, get(s, uruk.id)!).attack, 3 + 2);
  s.round += 1;
  assert.equal(stats(s, get(s, uruk.id)!).attack, 3);
  s = base(1, 2);
  engageEnemy(s, stage(s, CU.orc));
  assert.match(
    s.choice!.title,
    /^Orc of Mordor · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  s = base(1, 2);
  engageEnemy(s, stage(s, CU.archer));
  assert.match(
    s.choice!.title,
    /^Snaga Archer · Deal 2 damage to a character you control/,
  );
  const victim = s.choice!.options[0].id;
  s = choose(s, victim);
  s = settle(s);
  assert.equal(get(s, victim)!.damage, 2);
  s = base(1, 2);
  engageEnemy(s, stage(s, CU.soldier));
  s = settle(s);
  assert.equal(s.threat, 22);
});

test("Shadows: Gorbag and Deep Shadows add an attack, Wounded Uruk adds the attacker's damage, Snaga Archer +1 or +2, Uruk Soldier and Evil Vigilance +1 with their destruction riders, Orc of Mordor exhausts and Drawn to the Ring discards a non-objective attachment", () => {
  const attackWith = (
    shadow: string,
    enemyCode = CU.orc,
    prep?: (s: GameState, defender: Unit) => void,
  ) => {
    const s = base(1, 2);
    const enemy = engaged(s, enemyCode);
    const defender = hero(s);
    prep?.(s, defender);
    return { s: defend(s, enemy, defender, [shadow]), enemy, defender };
  };
  let { s } = attackWith(CU.gorbag);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.ok(
    s.log.some((l) => /makes an additional attack after this one/.test(l.text)),
  );
  ({ s } = attackWith(CU.deep));
  assert.ok(
    s.log.some((l) =>
      /Deep Shadows: the attacking enemy makes an additional attack/.test(
        l.text,
      ),
    ),
  );
  let r = attackWith(CU.wounded, CU.soldier, (s0) => {
    s0.engaged[0].damage = 3;
  });
  assert.ok(
    r.s.log.some((l) =>
      /Wounded Uruk: the attacking enemy gets \+3 attack/.test(l.text),
    ),
  );
  r = attackWith(CU.archer, CU.orc, (_s0, d) => {
    d.damage = 1;
  });
  assert.ok(
    r.s.log.some((l) =>
      /Snaga Archer: the attacking enemy gets \+2 attack/.test(l.text),
    ),
  );
  r = attackWith(CU.archer);
  assert.ok(
    r.s.log.some((l) =>
      /Snaga Archer: the attacking enemy gets \+1 attack/.test(l.text),
    ),
  );
  // Uruk Soldier: a destroyed character returns the attacker to the staging area.
  {
    const s0 = base(1, 2);
    const enemy = engaged(s0, CU.soldier);
    const [guard] = allies(s0, [GUARD]);
    let s1 = defend(s0, enemy, guard, [CU.soldier]);
    s1 = settle(s1);
    assert.ok(
      !s1.allies.some((u) => u.id === guard.id),
      "Guard of the Citadel is destroyed",
    );
    assert.ok(
      s1.staging.some((u) => u.id === enemy.id),
      "the attacker returns to the staging area",
    );
  }
  // Evil Vigilance: a destroyed character reveals the top card of the encounter deck.
  {
    const s0 = base(1, 2);
    const enemy = engaged(s0, CU.soldier);
    const [guard] = allies(s0, [GUARD]);
    s0.encounterDeck = [CU.hall, CU.passage];
    let s1 = defend(s0, enemy, guard, [CU.vigilance]);
    s1 = pastReveal(settle(s1));
    s1 = settle(s1);
    assert.ok(
      s1.staging.some((u) => u.code === CU.hall),
      "the top card is revealed",
    );
  }
  // Orc of Mordor: exhaust a character you control.
  ({ s } = attackWith(CU.orc));
  assert.match(
    s.choice!.title,
    /^Orc of Mordor · Exhaust a character you control/,
  );
  // Drawn to the Ring: discard a non-objective attachment you control (not Last of the Company or The One Ring).
  {
    const s0 = base(1, 2);
    const enemy = engaged(s0, CU.orc);
    const d = hero(s0);
    d.attachments.push({ id: "blade-1", code: BLADE, exhausted: false });
    let s1 = defend(s0, enemy, d, [CU.drawn]);
    assert.match(
      s1.choice!.title,
      /^Drawn to the Ring · Discard a non-objective attachment you control/,
    );
    assert.deepEqual(
      s1.choice!.options.map((o) => o.id),
      ["blade-1"],
    );
    s1 = choose(s1, "blade-1");
    assert.ok(!get(s1, d.id)!.attachments.some((a) => a.id === "blade-1"));
    assert.ok(s1.discard.includes(BLADE));
  }
  // Orcish Howls: the attack resolves against another enemy engaged with you.
  {
    const s0 = base(1, 2);
    const enemy = engaged(s0, CU.soldier);
    const other = engaged(s0, CU.orc);
    const d = hero(s0);
    let s1 = defend(s0, enemy, d, [CU.howls]);
    assert.match(
      s1.choice!.title,
      /^Orcish Howls · Resolve this attack against another enemy/,
    );
    s1 = choose(s1, other.id);
    s1 = settle(s1);
    assert.ok(
      !s1.engaged.some((u) => u.id === other.id),
      "the attack destroys Orc of Mordor",
    );
    assert.ok(s1.encounterDiscard.includes(CU.orc));
    assert.equal(get(s1, d.id)!.damage, 0);
  }
});

test("Treacheries: Orcish Howls, Drawn to the Ring, Deep Shadows and Evil Vigilance", () => {
  // Orcish Howls: 1 damage to each enemy in the staging area, +1 threat for each damage this phase.
  let s = base(1, 2);
  const archer = stage(s, CU.archer);
  const uruk = stage(s, CU.wounded);
  uruk.damage = 2;
  s.phase = "staging";
  s = reveal(s, CU.howls);
  s = pastReveal(settle(s));
  assert.equal(get(s, archer.id)!.damage, 1);
  assert.equal(get(s, uruk.id)!.damage, 3);
  assert.equal(threatOf(s, get(s, archer.id)!), 2 + 1);
  assert.equal(threatOf(s, get(s, uruk.id)!), 2 + 3);
  s.phase = "travel";
  assert.equal(
    threatOf(s, get(s, archer.id)!),
    2,
    "until the end of the phase",
  );
  // No enemy in the staging area: Orcish Howls gains surge.
  s = base(1, 2);
  assert.equal(CIRITH_UNGOL_HOOKS.revealedSurge!(s, CU.howls), true);
  stage(s, CU.orc);
  assert.equal(CIRITH_UNGOL_HOOKS.revealedSurge!(s, CU.howls), false);
  // Drawn to the Ring: the first player chooses.
  s = base(1, 2);
  s.phase = "staging";
  s.encounterDeck = [CU.drawn, CU.passage, CU.soldier, CU.passage];
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Drawn to the Ring · Choose one/);
  s = choose(s, "enemy");
  s = settle(s);
  assert.ok(
    s.engaged.some((u) => u.code === CU.soldier),
    "the enemy is put into play engaged",
  );
  assert.equal(s.threat, 22, "Uruk Soldier engaged the first player");
  assert.ok(s.encounterDiscard.includes(CU.passage));
  s = base(1, 2);
  s.phase = "staging";
  s.encounterDeck = [CU.drawn, CU.hall, CU.passage];
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  s = pastReveal(s);
  // No enemy in the encounter deck or discard pile: the Ring option resolves alone.
  s = pastReveal(settle(s));
  s = settle(s);
  assert.equal(ring(s)!.exhausted, true);
  assert.ok(
    s.staging.some((u) => u.code === CU.hall),
    "an encounter card is revealed",
  );
  // Deep Shadows: Doomed 2, then discard a hand of 3+ or reveal.
  s = base(2, 2);
  hand(s, [FILLER, FILLER, FILLER], 0);
  hand(s, [FILLER], 1);
  s.phase = "staging";
  s.encounterDeck = [CU.deep, CU.hall, CU.passage];
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  s = pastReveal(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
    "Doomed 2",
  );
  assert.match(s.choice!.title, /^Deep Shadows · Choose one/);
  s = choose(s, "hand");
  s = pastReveal(settle(s));
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 0).discard.length, 3);
  assert.equal(
    seatView(s, 1).hand.length,
    1,
    "a smaller hand cannot be discarded: reveal",
  );
  assert.ok(s.staging.some((u) => u.code === CU.hall));
  // Evil Vigilance: discard a questing character or raise threat by the number questing.
  s = base(1, 2);
  const [guard] = allies(s, [GUARD]);
  guard.committed = true;
  s.heroes[1].committed = true;
  s.phase = "staging";
  s = reveal(s, CU.vigilance);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Evil Vigilance · Choose one/);
  assert.ok(
    s.choice!.options.some((o) => o.id === "threat" && /by 2/.test(o.label)),
  );
  s = choose(s, `discard-${guard.id}`);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === guard.id));
  assert.ok(s.discard.includes(GUARD));
  assert.equal(s.threat, 20);
});

test("Snaga Archer's Archery 2 in the staging area and The Two Watchers' public state across the stages", () => {
  const s = base(1, 2);
  stage(s, CU.archer);
  stage(s, CU.archer);
  const begin = s.queue.length;
  CIRITH_UNGOL_HOOKS.combatBegin!(s);
  const archery = s.queue
    .slice(0, s.queue.length - begin + 1)
    .find((e) => e.kind === "heirsArchery");
  assert.equal(archery?.value, 4);
  assert.deepEqual(cirithUngolPublicState(base(1, 1)), {
    currentQuest: CU.watchers,
    stage: 1,
    watchers: "location",
    captive: true,
    chamber: "play",
    shagrat: "set-aside",
    resolving: 0,
  });
  assert.deepEqual(cirithUngolPublicState(base(1, 3)), {
    currentQuest: CU.escape,
    stage: 3,
    watchers: "location",
    captive: false,
    chamber: "victory",
    shagrat: "set-aside",
    resolving: 0,
  });
});
