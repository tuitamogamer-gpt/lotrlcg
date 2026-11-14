import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState, stageInfo } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  canGainResources,
  draw,
  get,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { check, damage, nextRound, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities, canPlay } from "../src/game/actions";
import { combatDefenderDefense } from "../src/game/combat";
import { reduceThreat } from "../src/game/threat-reduction";
import {
  forOwner,
  globalPlayerOrder,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  FB,
  FB_ARM,
  FB_STAGE_THREE,
  FOG_BARROW_RECIPES,
  fbArea,
  fbBarrowArea,
  fbCurrentQuest,
} from "../src/game/fog-barrow";
import {
  activate,
  allies,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./fog-barrow-fixtures";
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
const SNOWBOURN = "01016",
  GUARD = "01013",
  GLEOWINE = "01062",
  STEWARD = "01026",
  GANDALF = "01073";
const count = (list: string[], code: string) =>
  list.filter((c) => c === code).length;

test("Setup sets Great Barrow, Standing Stones and Hollow Circle aside in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.fogBarrow!;
      const recipe = FOG_BARROW_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const total = (section: string) =>
        recipe.cards
          .filter((c) => c.section === section)
          .reduce((n, c) => n + c.quantity, 0);
      assert.equal(q.currentQuest, FB.house);
      assert.equal(s.stage, 1);
      assert.equal(count(q.setAside, FB.great), easy ? 3 : 5);
      assert.equal(count(q.setAside, FB.standing), 1);
      assert.equal(count(q.setAside, FB.hollow), 1);
      // Round 1 has no quest phase, so no encounter card has left the deck.
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length,
        total("sharedEncounterDeck"),
      );
      assert.equal(total("sharedEncounterDeck"), easy ? 27 : 34);
      assert.ok(ringBearer(s), "the first player controls the Ring-bearer");
      assert.equal(count(s.encounterDeck, FB.waiting), easy ? 0 : 2);
    }
});

test("The House of Tom Bombadil skips the quest phase and places 1 progress at the end of the round", () => {
  let s = base(2);
  deck(s, Array(10).fill(GUARD));
  deck(s, Array(10).fill(GUARD), 1);
  s.encounterDeck = [
    FB.northDowns,
    FB.stoneRing,
    ...Array(10).fill(FB.northDowns),
  ];
  // The planning phase passes to the quest phase, which is skipped.
  for (let n = 0; n < 6 && s.phase === "planning"; n++) {
    s = act(s, { type: "NEXT" });
    s = settle(s);
  }
  assert.notEqual(s.phase, "quest");
  assert.notEqual(s.phase, "staging");
  assert.equal(s.staging.length, 0, "no encounter card is revealed");
  // At the end of the round 1 progress defeats stage 1; 2A follows.
  s.phase = "refresh";
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  s = settle(s);
  const q = s.fogBarrow!;
  assert.equal(q.currentQuest, FB.across);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === FB.hollow));
  assert.ok(!q.setAside.includes(FB.hollow));
  // Each player revealed 1 encounter card.
  assert.equal(
    s.staging.filter((u) => u.code !== FB.hollow).length,
    2,
    JSON.stringify(s.staging.map((u) => card(u.code).name)),
  );
});

test("Across the Downs raises each threat at the end of the refresh phase and needs Hollow Circle in the victory display", () => {
  let s = base(2, 2);
  s.progress = 20;
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [21, 21],
  );
  assert.equal(
    s.fogBarrow!.currentQuest,
    FB.across,
    "Hollow Circle is missing",
  );
  // With Hollow Circle in the victory display, 14 progress advances to 3A.
  s.victoryCards = [FB.hollow];
  s.victory = 3;
  s.encounterDiscard = [FB.chill, FB.frozen];
  s.encounterDeck = [FB.northDowns, ...Array(6).fill(FB.stoneRing)];
  forOwner(s, 0, () => check(s));
  flush(s);
  s = settle(s);
  const q = s.fogBarrow!;
  assert.equal(q.currentQuest, FB.lost);
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === FB.standing));
  // Only the second player revealed a card (North Downs).
  assert.equal(s.staging.filter((u) => u.code === FB.northDowns).length, 1);
  // The discard pile and the five Great Barrows went into the deck.
  assert.equal(count(s.encounterDeck, FB.great), 5);
  assert.equal(count(s.encounterDeck, FB.chill), 1);
  assert.equal(count(s.encounterDeck, FB.frozen), 1);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(q.setAside.length, 0);
});

test("Hollow Circle's travel engages a Wight with each player; it is immune to player card effects", () => {
  let s = base(2, 2);
  const hollow = stage(s, FB.hollow);
  s.encounterDeck = [FB.northDowns, FB.coldWight, FB.northDowns];
  s.encounterDiscard = [FB.barrowWight];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: hollow.id });
  // The first player chooses a Wight from the deck or the discard pile.
  assert.match(s.choice!.title, /^Hollow Circle/);
  s = choose(s, `discard-${FB.barrowWight}`);
  assert.match(s.choice!.title, /^Hollow Circle/);
  s = choose(s, `deck-${FB.coldWight}`);
  s = settle(s);
  assert.deepEqual(
    seatView(s, 0).engaged.map((u) => u.code),
    [FB.barrowWight],
  );
  assert.deepEqual(
    seatView(s, 1).engaged.map((u) => u.code),
    [FB.coldWight],
  );
  assert.equal(s.activeLocation?.id, hollow.id);
  assert.match(card(FB.hollow).text!, /Immune to player card effects/);
});

test("A Great Barrow traps its player in his own barrow at stage 4A, and stage 3B stays in play without players", () => {
  let s = base(1, 3);
  const guard = allies(s, [GUARD, GLEOWINE])[0];
  const north = stage(s, FB.northDowns);
  s.encounterDeck = [FB.chill, FB.stoneRing, FB.darkWight, FB.northDowns];
  s.phase = "staging";
  for (const h of s.heroes) h.committed = true;
  s.committedIds = s.heroes.map((h) => h.id);
  reveal(s, FB.great);
  s = settle(s);
  const q = s.fogBarrow!;
  assert.ok(q.split);
  const three = q.areas.find((a) => a.id === FB_STAGE_THREE)!;
  assert.deepEqual(three.players, []);
  assert.ok(three.staging.some((u) => u.code === FB.great));
  assert.ok(three.staging.some((u) => u.id === north.id));
  assert.equal(fbCurrentQuest(s), FB.trapped);
  assert.equal(stageInfo(s).questNumber, 4, "the trapped player is at stage 4");
  // The characters were removed from the quest.
  assert.ok(s.heroes.every((h) => !h.committed));
  assert.deepEqual(s.committedIds, []);
  // 4A: the quest phase ends here; Dark-wight is the first Wight discarded.
  assert.deepEqual(q.ended, [fbBarrowArea(0)]);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [FB.darkWight],
  );
  assert.deepEqual(s.encounterDiscard, [FB.chill, FB.stoneRing]);
  // No enemy is engaged: every ally is discarded.
  assert.equal(s.allies.length, 0);
  assert.ok(s.discard.includes(GUARD) && s.discard.includes(GLEOWINE));
  assert.equal(get(s, guard.id), undefined);
  reload(s);
});

test("4A keeps one ally for each enemy engaged with the trapped player", () => {
  let s = base(1, 3);
  allies(s, [GUARD, GLEOWINE, SNOWBOURN]);
  engaged(s, FB.barrowWight);
  s.encounterDeck = [FB.coldWight];
  s.phase = "staging";
  reveal(s, FB.great);
  // One enemy engaged: discard two of the three allies.
  assert.match(s.choice!.title, /^Trapped Inside a Barrow · Discard an ally/);
  s = choose(s, s.allies.find((a) => a.code === GUARD)!.id);
  assert.match(s.choice!.title, /^Trapped Inside a Barrow · Discard an ally/);
  s = choose(s, s.allies.find((a) => a.code === SNOWBOURN)!.id);
  assert.deepEqual(
    s.allies.map((a) => a.code),
    [GLEOWINE],
  );
});

test("Inside the barrow a revealed location is cancelled and discarded, and the player raises his threat by its threat", () => {
  let s = base(1, 3);
  s.phase = "staging";
  s.encounterDeck = [FB.coldWight, FB.stoneRing, FB.stoneRing];
  reveal(s, FB.great);
  s = settle(s);
  const before = s.threat;
  s.phase = "staging";
  stage(s, FB.stoneRing);
  reveal(s, FB.northDowns);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.code === FB.northDowns));
  assert.ok(s.encounterDiscard.includes(FB.northDowns));
  // North Downs has 2 threat.
  assert.equal(s.threat, before + 2);
});

test("While separated, each stage reveals its own cards, resolves its own quest and makes its own travel decision", () => {
  let s = base(2, 3);
  s.encounterDeck = [FB.coldWight, ...Array(12).fill(FB.northDowns)];
  s.phase = "staging";
  reveal(s, FB.great, 1);
  s = settle(s);
  assert.equal(fbCurrentQuest(s, 1), FB.trapped);
  // A new round from the planning phase, through the real actions.
  s.phase = "planning";
  if (s.table) s.table.turn = 0;
  selectSeat(s, 0);
  const logStart = s.log.length;
  for (
    let n = 0;
    n < 60 && !["travel", "encounter", "defense", "attack"].includes(s.phase);
    n++
  ) {
    if (s.choice || s.flow?.pending) s = settle(s);
    else if (s.phase === "quest") {
      const ready = s.heroes.find(
        (h) => !h.exhausted && !h.committed && !s.committedIds.includes(h.id),
      );
      s = act(
        s,
        ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" },
      );
    } else s = act(s, { type: "NEXT" });
  }
  assert.equal(s.phase, "travel");
  const lines = s.log.slice(logStart).map((l) => l.text);
  assert.ok(
    lines.some((l) => /^Lost in the Fog · \d+ willpower/.test(l)),
    lines.join("\n"),
  );
  assert.ok(
    lines.some((l) => /^Trapped Inside a Barrow · \d+ willpower/.test(l)),
    lines.join("\n"),
  );
  // The barrow's North Downs was cancelled; stage 3B's stayed.
  assert.ok(lines.some((l) => /North Downs's effects are cancelled/.test(l)));
  const three = s.fogBarrow!.areas.find((a) => a.id === FB_STAGE_THREE)!;
  selectSeat(s, 0);
  assert.ok(
    s.staging.some((u) => u.code === FB.northDowns) ||
      three.staging.some((u) => u.code === FB.northDowns),
  );
  // Travel: the first stage decides, then the barrow.
  const north = s.staging.find((u) => u.code === FB.northDowns)!;
  if (s.table) s.table.turn = 0;
  s = act(s, { type: "TRAVEL", id: north.id });
  s = settle(s);
  assert.equal(s.phase, "travel");
  assert.equal(s.table!.active, 1);
  s = act(s, { type: "NEXT" });
  s = settle(s);
  assert.notEqual(s.phase, "travel");
});

test("Lost in the Fog takes no progress while a Great Barrow is in play", () => {
  let s = base(1, 3);
  stage(s, FB.great);
  s.phase = "staging";
  for (const h of s.heroes) h.committed = true;
  s.committedIds = s.heroes.map((h) => h.id);
  s.queue.push({ kind: "questSucceeded", value: 5, player: 0 });
  flush(s);
  assert.equal(s.progress, 0);
  s.staging = s.staging.filter((u) => u.code !== FB.great);
  s.queue.push({ kind: "questSucceeded", value: 5, player: 0 });
  flush(s);
  assert.equal(s.progress, 5);
});

test("Defeating 4B sends the player back to 3B at the beginning of the travel phase and explores a Great Barrow", () => {
  let s = base(2, 3);
  // The second player is trapped; the first stays at Lost in the Fog.
  s.encounterDeck = [FB.coldWight, FB.northDowns];
  s.phase = "staging";
  reveal(s, FB.great, 1);
  s = settle(s);
  const q = s.fogBarrow!;
  assert.ok(q.split);
  assert.deepEqual(
    q.areas.map((a) => [a.id, a.players]),
    [
      [FB_STAGE_THREE, [0]],
      [fbBarrowArea(1), [1]],
    ],
  );
  // The barrow has its own staging area with the Cold-wight.
  selectSeat(s, 1);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [FB.coldWight],
  );
  // 9 progress defeats 4B.
  s.progress = 9;
  forOwner(s, 1, () => check(s));
  flush(s);
  s = settle(s);
  assert.deepEqual(s.fogBarrow!.escaped, [fbBarrowArea(1)]);
  // At the beginning of the travel phase the staging areas combine.
  s.queue.push({ kind: "startTravel", player: 0 });
  flush(s);
  s = settle(s);
  const after = s.fogBarrow!;
  assert.equal(after.split, false);
  assert.equal(fbCurrentQuest(s, 1), FB.lost);
  assert.ok(s.staging.some((u) => u.code === FB.coldWight));
  assert.ok(!s.staging.some((u) => u.code === FB.great));
  assert.ok(s.victoryCards!.includes(FB.great));
  assert.equal(s.victory, 5);
});

test("A solo player escaping the barrow reunites with stage 3B's staging area", () => {
  let s = base(1, 3);
  const north = stage(s, FB.northDowns);
  s.progress = 7;
  s.encounterDeck = [FB.barrowWight];
  s.phase = "staging";
  reveal(s, FB.great);
  s = settle(s);
  assert.equal(s.progress, 0, "the barrow has its own progress");
  s.progress = 9;
  forOwner(s, 0, () => check(s));
  flush(s);
  s = settle(s);
  s.queue.push({ kind: "startTravel", player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(s.fogBarrow!.split, false);
  assert.equal(s.progress, 7, "stage 3B keeps its progress");
  assert.ok(s.staging.some((u) => u.id === north.id));
  assert.ok(s.staging.some((u) => u.code === FB.barrowWight));
  assert.ok(s.victoryCards!.includes(FB.great));
});

test("Standing Stones' travel adds a Great Barrow from the victory display and traps the first player", () => {
  let s = base(2, 3);
  const stones = stage(s, FB.standing);
  s.victoryCards = [FB.great];
  s.victory = 5;
  s.encounterDeck = [FB.northDowns, FB.darkWight];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stones.id });
  assert.match(s.choice!.title, /^Standing Stones/);
  s = choose(s, "victory");
  s = settle(s);
  assert.equal(s.victory, 0);
  assert.deepEqual(s.victoryCards, []);
  const q = s.fogBarrow!;
  assert.ok(q.split);
  assert.equal(fbCurrentQuest(s, 0), FB.trapped);
  assert.equal(fbCurrentQuest(s, 1), FB.lost);
  // It is the travel phase: the quest phase does not end.
  assert.deepEqual(q.ended, []);
});

test("Lost in the Fog is won with 16 progress, every player at the stage and Standing Stones in the victory display", () => {
  let s = base(1, 3);
  s.progress = 16;
  forOwner(s, 0, () => check(s));
  flush(s);
  assert.equal(
    s.status,
    "playing",
    "Standing Stones is not in the victory display",
  );
  s.victoryCards = [FB.standing];
  forOwner(s, 0, () => check(s));
  flush(s);
  assert.equal(s.status, "won");
});

test("An eliminated player's barrow is discarded and each player at Lost in the Fog raises his threat by 10", () => {
  let s = base(2, 3);
  s.encounterDeck = [FB.coldWight];
  s.phase = "staging";
  reveal(s, FB.great, 1);
  s = settle(s);
  s.phase = "planning";
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  forOwner(s, 0, () => check(s));
  flush(s);
  s = settle(s);
  assert.ok(s.table!.seats[1].eliminated);
  assert.equal(s.fogBarrow!.split, false);
  assert.equal(seatView(s, 0).threat, 30);
  assert.ok(s.encounterDiscard.includes(FB.coldWight));
});

test("Barrow-wight, Dark-wight and Cold-wight stop threat reduction, resource gains and draws, and Stone Ring spreads them to the stage", () => {
  let s = base(2, 3);
  engaged(s, FB.barrowWight, 0);
  engaged(s, FB.darkWight, 0);
  engaged(s, FB.coldWight, 0);
  deck(s, [GUARD, GUARD]);
  deck(s, [GUARD, GUARD], 1);
  // Only the engaged player is affected.
  reduceThreat(s, 2, "player-card");
  assert.equal(s.threat, 20);
  assert.equal(canGainResources(s, s.heroes[0]), false);
  draw(s, 1);
  assert.equal(s.hand.length, 0);
  forOwner(s, 1, () => {
    reduceThreat(s, 2, "player-card");
    assert.equal(s.threat, 18);
    assert.equal(canGainResources(s, s.heroes[0]), true);
    draw(s, 1);
    assert.equal(s.hand.length, 1);
  });
  // Stone Ring: each player at this stage, and the Wights get +1/+1.
  stage(s, FB.stoneRing);
  forOwner(s, 1, () => {
    reduceThreat(s, 2, "player-card");
    assert.equal(s.threat, 18);
    assert.equal(canGainResources(s, s.heroes[0]), false);
    draw(s, 1);
    assert.equal(s.hand.length, 1);
  });
  const wight = seatView(s, 0).engaged[0];
  assert.deepEqual([stats(s, wight).attack, stats(s, wight).defense], [6, 2]);
});

test("A Wight that destroys a character triggers its forced effect", () => {
  for (const [code, check] of [
    [FB.barrowWight, (s: GameState) => assert.equal(s.threat, 22)],
    [
      FB.darkWight,
      (s: GameState) => assert.ok(s.heroes.every((h) => h.resources === 0)),
    ],
    [FB.coldWight, (s: GameState) => assert.equal(s.hand.length, 1)],
  ] as const) {
    let s = base(1, 3);
    hand(s, [GUARD, GUARD]);
    const wight = engaged(s, code);
    const [scout] = allies(s, [SNOWBOURN]);
    s.phase = "defense";
    s = act(s, { type: "DEFEND", enemyId: wight.id, defenderId: scout.id });
    s = settle(s);
    assert.equal(get(s, scout.id), undefined, card(code).name);
    check(s);
  }
});

test("North Downs makes characters defend against Wights with their willpower, and its shadow punishes a kill", () => {
  let s = base(1, 3);
  const wight = engaged(s, FB.barrowWight);
  const troll = engaged(s, "01082");
  const hero = s.heroes[0];
  const combat = { defensePenalty: 0 } as NonNullable<GameState["combat"]>;
  assert.equal(
    combatDefenderDefense(s, hero, wight, combat),
    stats(s, hero).defense,
  );
  stage(s, FB.northDowns);
  assert.equal(
    combatDefenderDefense(s, hero, wight, combat),
    stats(s, hero).will,
  );
  assert.equal(
    combatDefenderDefense(s, hero, troll, combat),
    stats(s, hero).defense,
  );
  // Shadow: +2 attack; a destroyed character raises each player's threat by 2.
  s.staging = [];
  const [scout] = allies(s, [SNOWBOURN]);
  wight.shadows = [FB.northDowns];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: wight.id, defenderId: scout.id });
  s = settle(s);
  assert.equal(get(s, scout.id), undefined);
  // Barrow-wight's own forced effect adds 2, North Downs 2 more.
  assert.equal(s.threat, 24);
});

test("Ancient Barrow buries an ally of each player, has X threat, and returns them to hand when explored", () => {
  let s = base(2, 3);
  allies(s, [GUARD, SNOWBOURN], 0);
  allies(s, [GLEOWINE], 1);
  s.phase = "staging";
  reveal(s, FB.ancient);
  assert.match(s.choice!.title, /^Ancient Barrow/);
  s = choose(s, s.allies.find((a) => a.code === GUARD)!.id);
  s = settle(s);
  const q = s.fogBarrow!;
  assert.deepEqual(
    q.buried.map((b) => [b.code, b.owner]),
    [
      [GUARD, 0],
      [GLEOWINE, 1],
    ],
  );
  const barrow = s.staging.find((u) => u.code === FB.ancient)!;
  assert.equal(threatOf(s, barrow), 3);
  assert.deepEqual(
    seatView(s, 0).allies.map((a) => a.code),
    [SNOWBOURN],
  );
  progressLocation(s, barrow, 4);
  flush(s);
  assert.deepEqual(q.buried, []);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === GUARD));
  assert.ok(seatView(s, 1).hand.some((u) => u.code === GLEOWINE));
});

test("Dreadful Song attaches to a questing hero, sets its willpower to 0 and raises threat for each engaged Wight", () => {
  let s = base(1, 3);
  const hero = s.heroes[0];
  hero.committed = true;
  s.committedIds = [hero.id];
  s.phase = "staging";
  reveal(s, FB.song);
  assert.match(s.choice!.title, /^Dreadful Song/);
  s = choose(s, hero.id);
  s = settle(s);
  const now = get(s, hero.id)!;
  assert.ok(now.attachments.some((a) => a.code === FB.song));
  assert.equal(stats(s, now).will, 0);
  engaged(s, FB.barrowWight);
  engaged(s, FB.coldWight);
  s.phase = "refresh";
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(s.threat, 22);
});

test("Long Groping Arm makes engaged Wights contribute their threat, or engages one from the deck", () => {
  let s = base(1, 3);
  s.phase = "staging";
  s.encounterDeck = [FB.northDowns, FB.darkWight];
  reveal(s, FB.arm);
  s = choose(s, `deck-${FB.darkWight}`);
  s = settle(s);
  assert.deepEqual(
    s.engaged.map((u) => u.code),
    [FB.darkWight],
  );
  assert.ok(s.used.includes(FB_ARM));
  assert.equal(stagingThreat(s), 2);
  // The phase ends: the Wight no longer contributes.
  s.queue.push({ kind: "phaseEnd", player: 0 });
  flush(s);
  assert.equal(stagingThreat(s), 0);
});

test("Chill Fog discards every resource for threat and surges without one; its shadow counts the damage", () => {
  let s = base(2, 3);
  for (const h of s.heroes) h.resources = 2;
  forOwner(s, 1, () => {
    for (const h of s.heroes) h.resources = 0;
  });
  s.phase = "staging";
  reveal(s, FB.chill);
  s = settle(s);
  assert.ok(seatView(s, 0).heroes.every((h) => h.resources === 0));
  // The first player's four heroes, Frodo included, held 2 resources each.
  assert.equal(seatView(s, 0).threat, 28);
  assert.equal(seatView(s, 1).threat, 20);
  // No resource left: surge.
  const before = s.encounterDeck.length;
  reveal(s, FB.chill);
  s = settle(s);
  assert.equal(s.encounterDeck.length, before - 1, "it gained surge");
  // Shadow: 1 threat for each damage dealt by the attack.
  s = base(1, 3);
  const wight = engaged(s, FB.coldWight);
  wight.shadows = [FB.chill];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: wight.id, defenderId: null });
  s = settle(s);
  assert.equal(s.threat, 24);
});

test("I'm Waiting for You! makes engaged Wights attack, and surges when none is engaged", () => {
  let s = base(1, 3);
  s.phase = "staging";
  const before = s.encounterDeck.length;
  reveal(s, FB.waiting);
  s = settle(s);
  assert.equal(s.encounterDeck.length, before - 1, "it gained surge");
  s = base(1, 3);
  const wight = engaged(s, FB.coldWight);
  s.phase = "staging";
  reveal(s, FB.waiting);
  assert.ok(s.combat || s.choice, "Cold-wight attacks");
  s = settle(s);
  assert.equal(get(s, wight.id)?.code, FB.coldWight);
});

test("Frozen by Fear stops Actions, events and Responses until the end of the round, and its shadow protects the attacker", () => {
  let s = base(1, 3);
  hand(s, ["01050"]);
  s.phase = "staging";
  reveal(s, FB.frozen);
  s = settle(s);
  assert.equal(s.fogBarrow!.frozen.round, s.round);
  assert.match(canPlay(s, s.hand[0]) ?? "", /Frozen by Fear/);
  for (const u of [...s.heroes, ...s.allies])
    assert.ok(availableAbilities(s, u).every((a) => a.disabled));
  nextRound(s);
  assert.equal(
    canPlay(s, s.hand[0])?.includes("Frozen by Fear") ?? false,
    false,
  );
  // Shadow: the attacking enemy cannot take damage this round.
  s = base(1, 3);
  const wight = engaged(s, FB.barrowWight);
  wight.shadows = [FB.frozen];
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: wight.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  const now = get(s, wight.id)!;
  assert.ok(now.roundCannotTakeDamage);
  damage(s, now.id, 3);
  assert.equal(get(s, now.id)!.damage, 0);
});

test("Tom Bombadil joins a player, ready and committed, and leaves at the end of the round", () => {
  let s = base(2, 3);
  s.phase = "staging";
  s.encounterDiscard = [FB.chill, FB.northDowns];
  reveal(s, FB.tom);
  assert.match(s.choice!.title, /^Tom Bombadil/);
  s = choose(s, "player-1");
  s = settle(s);
  const tom = seatView(s, 1).allies.find((u) => u.code === FB.tom)!;
  assert.ok(tom.committed && !tom.exhausted);
  s.phase = "refresh";
  s.queue.push({ kind: "endRound", player: 0 });
  flush(s);
  s = settle(s);
  assert.ok(!seatView(s, 1).allies.some((u) => u.code === FB.tom));
  assert.equal(s.encounterDiscard.length, 0);
  assert.ok(s.encounterDeck.includes(FB.tom));
});

test("Saves validate while separated, and the panel data shows each stage", () => {
  let s = base(2, 3);
  s.encounterDeck = [FB.coldWight];
  s.phase = "staging";
  reveal(s, FB.great, 0);
  s = settle(s);
  const restored = reload(s);
  assert.ok(restored.fogBarrow!.split);
  const view = publicState(restored) as unknown as {
    fogBarrow: { split: boolean; areas: { id: string; players: number[] }[] };
  };
  assert.ok(view.fogBarrow.split);
  assert.deepEqual(
    view.fogBarrow.areas.map((a) => [a.id, a.players]),
    [
      [FB_STAGE_THREE, [1]],
      [fbBarrowArea(0), [0]],
    ],
  );
  assert.equal(fbArea(restored, 0)?.id, fbBarrowArea(0));
  assert.deepEqual(globalPlayerOrder(restored), [0, 1]);
});
