import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { engagementCost, fx, get, stats, threatOf } from "../src/game/core";
import { progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { canPlay } from "../src/game/actions";
import {
  effectiveKeyword,
  questExhausts,
} from "../src/game/expansion-passives";
import { playerCardImmune } from "../src/game/card-immunity";
import { reduceThreat } from "../src/game/threat-reduction";
import {
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  FLAME_WEST_ARAGORN,
  fellowshipAragorn,
  sagaHero,
} from "../src/game/lotr-saga";
import {
  GC,
  GREY_COMPANY_HOOKS,
  GREY_COMPANY_RECIPES,
  gcFear,
  gcPhantom,
  greyCompanyPublicState,
  greyCompanyStageInfo,
} from "../src/game/grey-company";
import {
  activate,
  allies,
  base,
  choose,
  created,
  engaged,
  fearAside,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./grey-company-fixtures";
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
/** Continue past the optional responses offered as a card is revealed. */
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = choose(s, "resolve");
  return s;
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
const threatOfSeat = (s: GameState, p: number) => seatView(s, p).threat;
const GUARD = "01013",
  SNOWBOURN = "01016",
  STONE_ARTIFACT = "01027";
const deckSize = (easy: boolean) =>
  GREY_COMPANY_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);

test("Setup: the first player controls the Fellowship Aragorn, each player begins Overcome by Fear and the other copies leave the game, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = created(players, easy, 901 + players);
      const first = firstPlayer(s);
      const aragorn = sagaHero(s)!;
      assert.equal(aragorn.code, FLAME_WEST_ARAGORN);
      assert.ok(seatView(s, first).heroes.some((h) => h.id === aragorn.id));
      for (const p of playerOrder(s)) assert.ok(gcFear(s, p), `${p}`);
      const q = s.greyCompany!;
      assert.equal(q.fearAside, 0);
      assert.equal(q.fearRemoved, 4 - players);
      assert.deepEqual(q.setAside.sort(), [GC.stone, GC.army, GC.rules].sort());
      assert.equal(s.encounterDeck.length, deckSize(easy));
      assert.equal(s.staging.length, 0);
      assert.equal(s.stage, 1);
      // 1B is revealed after the opening hands: each player may take resources.
      assert.match(s.choice!.title, /^The Forbidden Door · Add resources/);
      assert.equal(greyCompanyStageInfo(s)!.quest, 0);
      assert.equal(greyCompanyStageInfo(s)!.name, "The Forbidden Door");
    }
  assert.equal(deckSize(false), 32);
  assert.equal(deckSize(true), 25);
  // The Forbidden Door: 1 resource on each hero for 3 threat, player by player.
  let s = created(2, false, 911);
  const before = [0, 1].map((p) => threatOfSeat(s, p));
  const heroes = [0, 1].map((p) =>
    seatView(s, p).heroes.map((h) => h.resources),
  );
  s = choose(s, "resources");
  assert.match(s.choice!.title, /^The Forbidden Door · Add resources/);
  s = choose(s, "skip");
  s = settle(s);
  assert.equal(threatOfSeat(s, 0), before[0] + 3 + 1 - 1);
  assert.ok(
    seatView(s, 0).heroes.every((h, i) => h.resources >= heroes[0][i] + 1),
  );
  assert.equal(threatOfSeat(s, 1), before[1]);
});

test("The Forbidden Door: at the end of the planning phase each hand is discarded and The Paths of the Dead find a different location for each player", () => {
  let s = base(2, 1);
  hand(s, [GUARD, SNOWBOURN], 0);
  hand(s, [GUARD], 1);
  s.encounterDeck = [
    GC.haunted,
    GC.haunted,
    GC.deadly,
    GC.ghosts,
    GC.trysting,
    GC.darkDoor,
  ];
  s.queue.push(fx("phaseEnd"), fx("startQuest"));
  flush(s);
  assert.equal(seatView(s, 0).hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.deepEqual(seatView(s, 0).discard.sort(), [GUARD, SNOWBOURN].sort());
  assert.equal(s.stage, 2);
  assert.match(
    s.choice!.title,
    /^The Paths of the Dead · Search the encounter deck/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.code).sort(),
    [GC.haunted, GC.deadly, GC.trysting, GC.darkDoor].sort(),
  );
  s = choose(s, GC.haunted);
  // The second player cannot take another Haunted Path.
  assert.ok(!s.choice!.options.some((o) => o.code === GC.haunted));
  s = choose(s, GC.darkDoor);
  s = settle(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [GC.haunted, GC.darkDoor].sort(),
  );
  assert.equal(s.encounterDeck.length, 4);
  assert.equal(s.greyCompany!.searched, undefined);
  assert.ok(
    s.log.some((l) =>
      /The Paths of the Dead: the encounter deck is shuffled/.test(l.text),
    ),
  );
});

test("The Paths of the Dead: X is the highest threat, threat stays at or above its initial level, and each planning phase costs 1 threat or the right to play cards", () => {
  let s = base(2, 2);
  forOwner(s, 1, () => (s.threat = 31));
  assert.equal(greyCompanyStageInfo(s)!.quest, 31);
  s.progress = 30;
  assert.equal(GREY_COMPANY_HOOKS.advance!(s), true);
  assert.equal(s.greyCompany!.advancing, false);
  s.progress = 31;
  GREY_COMPANY_HOOKS.advance!(s);
  assert.equal(s.greyCompany!.advancing, true);
  s = settle(reload((flush(s), s)));
  assert.equal(s.stage, 3);
  // The initial threat level is the floor.
  s = base(1, 2);
  fearAside(s, 0);
  s.threat = (s.startingThreat ?? 0) + 2;
  assert.equal(reduceThreat(s, 5), 2);
  assert.equal(s.threat, s.startingThreat);
  // Overcome by Fear: no reduction at all.
  s = base(1, 1);
  s.threat = 30;
  assert.equal(reduceThreat(s, 3), 0);
  assert.equal(s.threat, 30);
  // Planning phase: raise the threat by 1, or play no card.
  s = base(2, 2);
  const [guard] = hand(s, [GUARD], 0);
  hand(s, [GUARD], 1);
  s.queue.push(fx("startPlanning"));
  flush(s);
  assert.match(s.choice!.title, /^The Paths of the Dead · Choose one/);
  s = choose(s, "noplay");
  s = choose(s, "threat");
  assert.equal(threatOfSeat(s, 1), 21);
  assert.equal(threatOfSeat(s, 0), 20);
  assert.match(canPlay(s, guard)!, /cannot play cards this phase/);
  assert.deepEqual(greyCompanyPublicState(s)!.noPlay, [0]);
  forOwner(s, 1, () => {
    assert.doesNotMatch(canPlay(s, s.hand[0]) ?? "", /cannot play cards/);
  });
});

test("The Dead are Following: The Stone of Erech and Army of the Dead join the staging area, Overcome by Fear can be traded for 3 threat, and exploring the Stone after paying 5 progress wins", () => {
  let s = base(2, 2);
  s.queue.push(fx("gcStageThree", { player: 0 }));
  flush(s);
  assert.ok(s.staging.some((u) => u.code === GC.stone));
  assert.ok(s.staging.some((u) => u.code === GC.army));
  assert.deepEqual(s.greyCompany!.setAside, [GC.rules]);
  assert.match(s.choice!.title, /^The Dead are Following · Overcome by Fear/);
  s = choose(s, "detach");
  s = choose(s, "skip");
  s = settle(s);
  assert.ok(!gcFear(s, 0));
  assert.ok(gcFear(s, 1));
  assert.equal(threatOfSeat(s, 0), 23);
  assert.equal(s.greyCompany!.fearAside, 1);
  // Army of the Dead: X is twice the number of players; immune to player cards.
  const army = s.staging.find((u) => u.code === GC.army)!;
  assert.equal(threatOf(s, army), 4);
  assert.ok(playerCardImmune(army));
  // Travel to The Stone of Erech: 5 progress removed from stage 3B.
  s.phase = "travel";
  const stone = s.staging.find((u) => u.code === GC.stone)!;
  s.progress = 4;
  assert.match(
    GREY_COMPANY_HOOKS.travelProblem!(s, stone)!,
    /remove 5 progress/,
  );
  s.progress = 7;
  s.encounterDeck = [GC.deadMan, GC.ghosts, GC.deadly];
  s.encounterDiscard = [GC.host];
  s = act(s, { type: "TRAVEL", id: stone.id });
  assert.equal(s.progress, 2);
  assert.equal(s.activeLocation?.code, GC.stone);
  // Each player searches for an Oathbreaker enemy.
  assert.match(
    s.choice!.title,
    /^The Stone of Erech · Search for an Oathbreaker enemy/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [`deck-${GC.deadMan}`, `deck-${GC.ghosts}`, `discard-${GC.host}`].sort(),
  );
  s = choose(s, `discard-${GC.host}`);
  s = choose(s, `deck-${GC.ghosts}`);
  s = settle(s);
  const host = s.staging.find((u) => u.code === GC.host)!;
  assert.ok(host);
  // Oathbreakers lose Phantom and get -20 engagement cost.
  assert.equal(engagementCost(s, host), 45 - 20);
  assert.equal(gcPhantom(s, host), false);
  assert.equal(engagementCost(s, army), 50 - 20);
  // 5 progress explores the Stone: the players win.
  s.phase = "quest";
  progressLocation(s, s.activeLocation!, 5);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /The Stone of Erech is explored/);
});

test("Overcome by Fear: +1 threat at the end of each round, and Aragorn's controller may spend a Fellowship resource to set it aside; encounter cards attach the set-aside copies, one per threat dial", () => {
  let s = base(2, 2);
  const aragorn = fellowshipAragorn(s)!;
  assert.equal(firstPlayer(s), 0);
  s.queue.push(fx("endRound"));
  flush(s);
  assert.match(
    s.choice!.title,
    /^Overcome by Fear · Spend 1 Fellowship resource/,
  );
  s = choose(s, "detach");
  s = settle(s);
  assert.equal(threatOfSeat(s, 0), 21);
  assert.equal(
    threatOfSeat(s, 1),
    21,
    "the second player cannot spend Aragorn's resource",
  );
  assert.ok(!gcFear(s, 0));
  assert.ok(gcFear(s, 1));
  assert.ok(
    s.log.some((l) =>
      /^Overcome by Fear \(Aragorn spends 1 Fellowship resource\)/.test(l.text),
    ),
  );
  assert.ok(get(s, aragorn.id));
  assert.equal(s.greyCompany!.fearAside, 1);
  // Whispers in the Dark: the set-aside copy may come back.
  s = base(1, 2);
  fearAside(s, 0);
  s = reveal(s, GC.whispers);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Whispers in the Dark · Choose one/);
  s = choose(s, "fear");
  assert.ok(gcFear(s, 0));
  assert.equal(s.greyCompany!.fearAside, 0);
  // With Overcome by Fear already attached, the other option resolves alone.
  s = settle(s);
  const before = stats(s, s.heroes[0]).will;
  s = reveal(s, GC.whispers);
  s = settle(pastReveal(s));
  assert.equal(stats(s, s.heroes[0]).will, before - 1);
  assert.equal(
    stats(s, s.heroes[0]).defense,
    card(s.heroes[0].code).defense! - 1,
  );
});

test("Phantom: the damage of an attack by a Phantom enemy raises the defending player's threat instead, defended or undefended; Faithless Dead's shadow removes Phantom for that attack", () => {
  let s = base(1, 2);
  const guard = allies(s, [GUARD])[0];
  const dead = engaged(s, GC.deadMan);
  s = defend(s, dead, guard);
  s = settle(s);
  // 2 attack against 0 defense: 2 threat, no damage.
  assert.equal(get(s, guard.id)!.damage, 0);
  assert.equal(s.threat, 22);
  assert.ok(s.log.some((l) => /^Phantom: the 2 damage/.test(l.text)));
  // Undefended: the hero would take the damage.
  s = base(1, 2);
  const host = engaged(s, GC.host);
  s = defend(s, host, null);
  s = settle(s);
  assert.ok(s.heroes.every((h) => h.damage === 0));
  assert.equal(s.threat, 24);
  // Faithless Dead's shadow: +1 attack and no Phantom for this attack.
  s = base(1, 2);
  const guard2 = allies(s, [GUARD])[0];
  const dead2 = engaged(s, GC.deadMan);
  s = defend(s, dead2, guard2, [GC.faithless]);
  s = settle(s);
  assert.equal(s.threat, 20);
  assert.ok(!get(s, guard2.id), "the Guard of the Citadel is destroyed");
  assert.ok(s.log.some((l) => /loses the Phantom keyword/.test(l.text)));
});

test("Ghosts of Men, Dead Man of Dunharrow, Shadow Host and Faithless Dead: the either-or choices as they are revealed or engage", () => {
  // Ghosts of Men (Peril): with no copy set aside, the immediate attack.
  let s = base(1, 2);
  s = reveal(s, GC.ghosts);
  s = pastReveal(s);
  assert.ok(
    s.combat || /Immediate attack|defend/i.test(s.choice?.title ?? ""),
    JSON.stringify(s.choice?.title),
  );
  s = settle(s);
  assert.ok(s.threat > 20, "the Phantom attack raises the threat");
  // With a copy set aside, the player chooses.
  s = base(1, 2);
  fearAside(s, 0);
  s = reveal(s, GC.ghosts);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Ghosts of Men · Choose one/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["fear", "attack"],
  );
  s = choose(s, "fear");
  assert.ok(gcFear(s, 0));
  // Dead Man of Dunharrow: after it engages you, 2 threat (or the fear).
  s = base(1, 2);
  const dead = stage(s, GC.deadMan);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: dead.id });
  s = settle(s);
  assert.equal(s.threat, 22);
  // Shadow Host: when it engages you, an immediate attack (or the fear).
  s = base(1, 2);
  fearAside(s, 0);
  const host = stage(s, GC.host);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: host.id });
  assert.match(s.choice!.title, /^Shadow Host · Choose one/);
  s = choose(s, "attack");
  s = settle(s);
  assert.ok(s.threat > 20);
  // Faithless Dead (Peril): 2 threat for each player, or another card.
  s = base(2, 2);
  s = reveal(s, GC.faithless);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Faithless Dead · Choose one/);
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(threatOfSeat(s, 0), 22);
  assert.equal(threatOfSeat(s, 1), 22);
});

test("Army of the Dead: when it attacks, discard an ally or take back Overcome by Fear", () => {
  let s = base(1, 3);
  const [guard] = allies(s, [GUARD]);
  const army = engaged(s, GC.army);
  s.phase = "defense";
  s.combat = null;
  s = act(s, { type: "DEFEND", enemyId: army.id, defenderId: null });
  // Overcome by Fear is attached, so the ally goes.
  for (
    let n = 0;
    n < 5 && s.choice && !/Discard an ally/.test(s.choice.title);
    n++
  )
    s = choose(s, s.choice.options[0].id);
  assert.match(
    s.choice!.title,
    /^Army of the Dead · Discard an ally you control/,
  );
  s = choose(s, guard.id);
  assert.ok(!get(s, guard.id));
  assert.ok(s.discard.includes(GUARD));
});

test("Treacheries: No Turning Back, Blood Runs Chill and The Way is Shut", () => {
  // No Turning Back: each player discards an ally or takes Overcome by Fear.
  let s = base(2, 2);
  fearAside(s, 1);
  const [guard] = allies(s, [GUARD], 0);
  s = reveal(s, GC.noTurning);
  s = pastReveal(s);
  assert.match(
    s.choice!.title,
    /^No Turning Back · Discard an ally you control/,
  );
  s = choose(s, guard.id);
  assert.ok(!get(s, guard.id));
  // The second player has no ally: Overcome by Fear returns.
  s = settle(s);
  assert.ok(gcFear(s, 1));
  // Blood Runs Chill: 1 damage to each exhausted character at threat 35+.
  s = base(2, 2);
  forOwner(s, 0, () => {
    s.threat = 35;
    s.heroes[0].exhausted = true;
  });
  forOwner(s, 1, () => (s.heroes[0].exhausted = true));
  s = settle(pastReveal(reveal(s, GC.chill)));
  assert.equal(seatView(s, 0).heroes[0].damage, 1);
  assert.equal(seatView(s, 1).heroes[0].damage, 0);
  // Doomed 1: each player raises his threat by 1.
  assert.equal(threatOfSeat(s, 0), 36);
  assert.equal(threatOfSeat(s, 1), 21);
  // The Way is Shut: no progress on the current quest this round; surge.
  s = base(1, 2);
  s.encounterDeck = [GC.haunted, GC.deadly];
  s = settle(pastReveal(reveal(s, GC.shut)));
  assert.equal(s.greyCompany!.shutRound, s.round);
  assert.ok(
    s.staging.some((u) => u.code === GC.haunted),
    "Surge reveals Haunted Path",
  );
  s.queue.push(fx("successfulQuestProgress", { value: 4 }));
  flush(s);
  assert.equal(s.progress, 0);
  assert.equal(greyCompanyPublicState(s)!.shut, true);
});

test("Shadows: Haunted Path, Dead Man of Dunharrow, Blood Runs Chill, No Turning Back and Whispers in the Dark", () => {
  // Haunted Path: 2 threat, or the enemy returns to the staging area.
  let s = base(1, 2);
  const [guard] = allies(s, [GUARD]);
  const dead = engaged(s, GC.deadMan);
  s = defend(s, dead, guard, [GC.haunted]);
  for (
    let n = 0;
    n < 5 && s.choice && !/^Haunted Path/.test(s.choice.title);
    n++
  )
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /^Haunted Path · Choose one/);
  s = choose(s, "return");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === dead.id));
  // Dead Man of Dunharrow's shadow: +1 attack (3 threat through Phantom).
  s = base(1, 2);
  const [g2] = allies(s, [GUARD]);
  const d2 = engaged(s, GC.deadMan);
  s = settle(defend(s, d2, g2, [GC.deadMan]));
  assert.equal(s.threat, 23);
  // Whispers in the Dark: +2 attack when undefended.
  s = base(1, 2);
  const d3 = engaged(s, GC.deadMan);
  s = settle(defend(s, d3, null, [GC.whispers]));
  assert.equal(s.threat, 24);
  // Blood Runs Chill at threat 35: the defender cannot ready this round.
  s = base(1, 2);
  s.threat = 35;
  const [g4] = allies(s, [GUARD]);
  const d4 = engaged(s, GC.deadMan);
  s = settle(defend(s, d4, g4, [GC.chill]));
  assert.deepEqual(s.greyCompany!.chilled!.ids, [g4.id]);
  assert.ok(GREY_COMPANY_HOOKS.cannotReady!(s, get(s, g4.id)!));
  // No Turning Back: Overcome by Fear, or another attack.
  s = base(1, 2);
  fearAside(s, 0);
  const [g5] = allies(s, [GUARD]);
  const d5 = engaged(s, GC.deadMan);
  s = defend(s, d5, g5, [GC.noTurning]);
  for (
    let n = 0;
    n < 5 && s.choice && !/^No Turning Back/.test(s.choice.title);
    n++
  )
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /^No Turning Back · Choose one/);
  s = settle(choose(s, "attack"));
  assert.ok(
    s.log.some((l) =>
      /^No Turning Back: the attacking enemy makes an additional attack/.test(
        l.text,
      ),
    ),
  );
  // Two Phantom attacks of 2 against the Guard's 0 defense.
  assert.equal(
    s.log.filter((l) =>
      /^Phantom: the 2 damage Dead Man of Dunharrow/.test(l.text),
    ).length,
    2,
  );
  assert.equal(s.threat, 24);
});

test("Locations: Haunted Path, Deadly Road, Trysting Place and Dark Door", () => {
  // Haunted Path: +1 threat for each player at 35 or higher; travel raises each threat.
  let s = base(2, 2);
  const path = stage(s, GC.haunted);
  assert.equal(threatOf(s, path), 1);
  forOwner(s, 1, () => (s.threat = 36));
  assert.equal(threatOf(s, path), 2);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: path.id });
  s = settle(s);
  assert.equal(threatOfSeat(s, 0), 21);
  assert.equal(threatOfSeat(s, 1), 37);
  // Deadly Road: travel costs a Fellowship resource.
  s = base(1, 2);
  const road = stage(s, GC.deadly);
  const aragorn = fellowshipAragorn(s)!;
  aragorn.resources = 0;
  assert.match(
    GREY_COMPANY_HOOKS.travelProblem!(s, road)!,
    /Fellowship resource/,
  );
  aragorn.resources = 1;
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: road.id }));
  assert.equal(get(s, aragorn.id)!.resources, 0);
  // In the staging area: a canceled When Revealed effect raises each threat.
  s = base(2, 2);
  stage(s, GC.deadly);
  GREY_COMPANY_HOOKS.whenRevealedCancelled!(s, GC.whispers);
  flush(s);
  assert.equal(threatOfSeat(s, 0), 21);
  assert.equal(threatOfSeat(s, 1), 21);
  // Trysting Place: no damage to enemies in the staging area; travel engages an Oathbreaker.
  s = base(1, 2);
  const tryst = stage(s, GC.trysting);
  const ghost = stage(s, GC.ghosts);
  assert.equal(GREY_COMPANY_HOOKS.damageAmount!(s, ghost, 3, {}), 0);
  s.encounterDeck = [GC.deadly];
  s.encounterDiscard = [];
  assert.match(
    GREY_COMPANY_HOOKS.travelProblem!(s, tryst)!,
    /no Oathbreaker enemy/,
  );
  s.encounterDiscard = [GC.faithless];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: tryst.id });
  assert.match(
    s.choice!.title,
    /^Trysting Place · Search for an Oathbreaker enemy/,
  );
  s = choose(s, `discard-${GC.faithless}`);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === GC.faithless));
  // Dark Door: no progress on locations in the staging area; travel reveals a card.
  s = base(1, 2);
  stage(s, GC.darkDoor);
  const other = stage(s, GC.haunted);
  assert.equal(GREY_COMPANY_HOOKS.locationProgressBlocked!(s, other), true);
  assert.equal(globalEngaged(s).length, 0);
});

test("Aragorn: the Fellowship hero passes with the first player token; with an Artifact he gains sentinel and does not exhaust to quest; the players lose if he leaves play", () => {
  let s = base(2, 2);
  const aragorn = fellowshipAragorn(s)!;
  assert.ok(!effectiveKeyword(aragorn, "Sentinel"));
  assert.equal(questExhausts(s, aragorn), true);
  aragorn.attachments.push({
    id: `c${s.nextId++}`,
    code: STONE_ARTIFACT,
    exhausted: false,
    owner: 0,
  });
  assert.ok((card(STONE_ARTIFACT).traits ?? "").includes("Artifact"));
  assert.ok(effectiveKeyword(aragorn, "Sentinel"));
  assert.equal(questExhausts(s, aragorn), false);
  // The token passes in the refresh phase: Aragorn follows.
  s.queue.push(fx("refreshEnd"));
  flush(s);
  assert.equal(firstPlayer(s), 1);
  assert.ok(seatView(s, 1).heroes.some((h) => h.id === aragorn.id));
  // Aragorn leaves play: the players lose.
  s = base(1, 2);
  s.heroes = s.heroes.filter((h) => h.code !== FLAME_WEST_ARAGORN);
  GREY_COMPANY_HOOKS.check!(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Aragorn has left play/);
});

test("The scenario panel data and saves follow the scenario state", () => {
  let s = start(2, false, 77);
  const panel = greyCompanyPublicState(s)!;
  assert.equal(panel.stage >= 1, true);
  assert.equal(panel.fear.length, 2);
  assert.equal(panel.fearRemoved, 2);
  const view = publicState(s) as { greyCompany?: unknown };
  assert.ok(view.greyCompany);
  s = reload(s);
  assert.ok(s.greyCompany);
  activate(s, GC.stone);
  s.greyCompany!.currentQuest = GC.following;
  s.stage = 3;
  assert.equal(greyCompanyPublicState(s)!.stoneActive, true);
  reload(s);
});
