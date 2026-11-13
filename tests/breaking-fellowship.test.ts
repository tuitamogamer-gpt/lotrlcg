import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { check, damage, engage, progress } from "../src/game/board";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { flush } from "../src/game/effects";
import { forOwner, playerOrder, seatView, selectSeat } from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  ROAD_DARKENS_FRODO,
  ROAD_DARKENS_ONE_RING,
} from "../src/game/lotr-saga-codes";
import {
  BF,
  BREAKING_FELLOWSHIP_HOOKS,
  bfArea,
  bfAreaUnits,
  breakingFellowshipPublicState,
} from "../src/game/breaking-fellowship";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  reload,
  settle,
  stage,
  start,
} from "./breaking-fellowship-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const H = BREAKING_FELLOWSHIP_HOOKS;
const run = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Reveal encounter cards as the given player during staging. */
const reveal = (s: GameState, codes: string[], player = 0) => {
  s.phase = "staging";
  s.encounterDeck = [...codes, ...s.encounterDeck];
  run(s, fx("reveal", { player }));
  return s;
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
  act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
const GUARD = "01013";
/** Divide a 2-player stage 2 table: player 0 takes the first offered 3A. */
function divided(players = 2, staging: string[] = []) {
  let s = base(players, 2);
  for (const c of staging) stage(s, c);
  s.phase = "refresh";
  run(s, ...H.roundEnd!(s));
  for (let n = 0; s.choice && n < 40; n++)
    s = choose(s, s.choice.options[0].id);
  return s;
}

test("Setup: The Argonath and Sarn Gebir in the staging area; Frodo's Choice, Seat of Seeing and Parth Galen set aside", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.breakingFellowship!;
      assert.deepEqual(
        [...q.setAside].sort(),
        [BF.choice, BF.seeing, BF.parth].sort(),
      );
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [BF.argonath, BF.sarn].sort(),
      );
      assert.equal(s.stage, 1);
      assert.equal(s.encounterDeck.length, easy ? 23 : 30);
      const bearer = ringBearer(s)!;
      assert.equal(bearer.code, ROAD_DARKENS_FRODO);
      assert.ok(
        bearer.attachments.some((a) => a.code === ROAD_DARKENS_ONE_RING),
      );
      reload(s);
    }
});

test("The Great River: enemies get +2 defense and cannot be engaged; the encounter phase is skipped; The Argonath blocks advancing and travel waits for Sarn Gebir", () => {
  let s = base(2, 1);
  const tracker = stage(s, BF.tracker);
  assert.equal(stats(s, tracker).defense, 3);
  engage(s, tracker);
  assert.ok(
    s.staging.some((u) => u.id === tracker.id),
    "cannot be engaged",
  );
  assert.ok(H.cannotOptionallyEngage!(s, tracker));
  // The encounter phase is skipped: the combat phase begins at once.
  run(s, fx("startEncounter"));
  assert.ok(s.log.some((l) => /skip the encounter phase/.test(l.text)));
  assert.ok(["defense", "attack"].includes(s.phase), "combat follows");
  // The Argonath: X threat; no travel while Sarn Gebir is in play.
  s = base(3, 1);
  const argonath = stage(s, BF.argonath);
  const sarn = stage(s, BF.sarn);
  assert.equal(threatOf(s, argonath), 3);
  s.phase = "travel";
  assert.match(canTravel(s, argonath) ?? "", /Sarn Gebir/);
  s.staging = s.staging.filter((u) => u.id !== sarn.id);
  assert.equal(canTravel(s, argonath), null);
  // 12 progress cannot advance while The Argonath is in play.
  s = base(1, 1);
  stage(s, BF.argonath);
  s.progress = 12;
  check(s);
  assert.equal(s.stage, 1);
  s.staging = [];
  check(s);
  flush(s);
  assert.equal(s.stage, 2);
  reload(s);
});

test("The Argonath skips the combat phase while active; Sarn Gebir deals 1 damage to each exhausted character when explored", () => {
  let s = base(1, 1);
  activate(s, BF.argonath);
  stage(s, BF.tracker);
  run(s, fx("startCombat"));
  assert.ok(
    s.log.some((l) => /skip the combat phase/.test(l.text)),
    "the combat phase is skipped",
  );
  assert.ok(!s.queue.some((e) => e.kind === "heirsArchery"));
  s = base(1, 1);
  const sarn = activate(s, BF.sarn);
  const [hero] = s.heroes.filter((h) => h.id !== ringBearer(s)!.id);
  hero.exhausted = true;
  sarn.progress = 3;
  progress(s, 1);
  flush(s);
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.ok(s.victoryCards!.includes(BF.sarn));
});

test("The Company Divided (2A): the Ring-bearer leaves the game without losing it, enemies have 0 engagement cost and the travel phase is skipped", () => {
  let s = base(2, 1);
  s.progress = 12;
  const archer = stage(s, BF.archer);
  check(s);
  flush(s);
  s = settle(s);
  const q = s.breakingFellowship!;
  assert.equal(s.stage, 2);
  assert.ok(q.ringBearerOut, "the Ring-bearer is removed from the game");
  assert.equal(ringBearer(s), undefined);
  assert.ok(
    q.ringBearerOut!.attachments.some((a) => a.code === ROAD_DARKENS_ONE_RING),
  );
  check(s);
  assert.equal(s.status, "playing", "The One Ring's text is blank");
  // Engagement cost 0 until the end of the encounter phase.
  s.phase = "encounter";
  assert.equal(engagementCost(s, get(s, archer.id)!), 0);
  s.phase = "defense";
  assert.equal(engagementCost(s, get(s, archer.id)!), 44);
  // The travel phase is skipped this round.
  s.phase = "quest";
  run(s, fx("startTravel"));
  assert.ok(s.log.some((l) => /skip this travel phase/.test(l.text)));
  reload(s);
});

test("The Company Divided (2B): at the end of the refresh phase each player takes a different stage 3A and the stage 2 cards are shared out in player order", () => {
  let s = base(2, 2);
  const a = stage(s, BF.anduin);
  const b = stage(s, BF.slopes);
  const c = stage(s, BF.tracker);
  const location = activate(s, BF.shoreline);
  s.encounterDiscard = [BF.hunter];
  s.encounterDeck = [BF.anduin, BF.anduin, BF.anduin];
  s.phase = "refresh";
  run(s, ...H.roundEnd!(s));
  const q = s.breakingFellowship!;
  // Seat of Seeing and Frodo's Choice join the discard pile, now under the deck.
  assert.deepEqual(q.setAside, [BF.parth]);
  assert.equal(s.encounterDiscard.length, 0);
  assert.deepEqual(s.encounterDeck.slice(0, 3), [
    BF.anduin,
    BF.anduin,
    BF.anduin,
  ]);
  assert.deepEqual(
    [...s.encounterDeck.slice(3)].sort(),
    [BF.hunter, BF.seeing, BF.choice].sort(),
  );
  assert.ok(q.split);
  // Player 0 picks first; player 1 cannot take the same stage.
  assert.match(s.choice!.title, /Advance to a different stage 3A/);
  s = choose(s, BF.hobbits);
  assert.ok(!s.choice!.options.some((o) => o.id === BF.hobbits));
  s = choose(s, BF.seat);
  // In player order, each player moves 1 card from stage 2's staging area.
  assert.match(s.choice!.title, /Move an encounter card/);
  s = choose(s, a.id);
  s = choose(s, b.id);
  s = choose(s, c.id);
  s = settle(s);
  const areas = s.breakingFellowship!.areas;
  assert.equal(areas.length, 2);
  assert.deepEqual(
    areas.map((x) => x.questCode),
    [BF.hobbits, BF.seat],
  );
  const zone = (p: number) => {
    selectSeat(s, p);
    return [...s.staging.map((u) => u.id)];
  };
  assert.ok(zone(0).includes(a.id) && zone(0).includes(c.id));
  assert.ok(zone(1).includes(b.id));
  // The active location stays with the first player.
  selectSeat(s, 0);
  assert.equal(s.activeLocation?.id, location.id);
  // 3A: an area with less than 4 threat reveals a card (River Anduin).
  assert.equal(s.stage, 3);
  assert.ok(stagingThreat(s) >= 2);
  reload(s);
});

test("Separate stages: each area stages and resolves its own quest; a failed quest raises only that player's threat", () => {
  let s = divided(2);
  const q = s.breakingFellowship!;
  assert.ok(q.split);
  // Clear both areas, then stage a threat for player 1 only.
  for (const p of [0, 1]) {
    selectSeat(s, p);
    s.staging = [];
  }
  selectSeat(s, 1);
  stage(s, BF.captain);
  selectSeat(s, 0);
  s.encounterDeck = Array(10).fill(BF.anduin);
  s.phase = "quest";
  // No character commits: each area reveals 1 card per player in it.
  for (const p of [0, 1])
    forOwner(s, p, () => {
      for (const h of s.heroes) h.exhausted = true;
    });
  H.beginStaging!(s);
  flush(s);
  s = settle(s);
  // Player 0 resolves first (River Anduin, 2 threat), then player 1.
  const before = [seatView(s, 0).threat, seatView(s, 1).threat];
  for (let n = 0; s.status === "playing" && s.phase === "staging" && n < 4; n++)
    s = settle(act(s, { type: "NEXT" }));
  assert.equal(seatView(s, 0).threat, before[0] + 2);
  assert.equal(seatView(s, 1).threat, before[1] + 3 + 2);
  reload(s);
});

test("3B: progress discards encounter cards instead; Frodo's Choice is revealed instead of discarded, gives the Ring-bearer and the first player token, and its stage advances to 4A", () => {
  let s = divided(2);
  // Player 1 quests: 3 progress discards 2 cards, then finds Frodo's Choice.
  selectSeat(s, 1);
  s.staging = [];
  s.encounterDeck = [BF.anduin, BF.slopes, BF.choice, BF.tracker];
  s.phase = "staging";
  addCurrentQuestProgress(s, 3);
  flush(s);
  s = settle(s);
  const q = s.breakingFellowship!;
  assert.equal(s.progress, 0, "no progress is placed");
  assert.deepEqual(s.encounterDiscard, [BF.anduin, BF.slopes]);
  assert.equal(q.frodoPlayer, 1);
  assert.equal(q.ringBearerOut, null);
  const bearer = ringBearer(s)!;
  assert.ok(seatView(s, 1).heroes.some((h) => h.id === bearer.id));
  assert.ok(bearer.attachments.some((a) => a.code === BF.choice));
  assert.equal(s.table!.first, 1);
  assert.ok(H.keepFirstPlayer!(s));
  // Player 1's stage advanced to 4A; Parth Galen entered his staging area.
  assert.equal(bfArea(s, 1)!.questCode, BF.setsOut);
  assert.equal(s.stage, 4);
  selectSeat(s, 1);
  assert.ok(s.staging.some((u) => u.code === BF.parth));
  // It was the quest phase: the phase ended there without resolving.
  assert.ok(q.ended.includes(bfArea(s, 1)!.id));
  // Once Frodo's Choice is in play, progress is placed normally at stage 3.
  selectSeat(s, 0);
  addCurrentQuestProgress(s, 2);
  assert.equal(s.progress, 2);
  reload(s);
});

test("4B: extra reveals for each player in the game; any player may engage a revealed enemy once a round; 16 progress wins unless Parth Galen is in play", () => {
  let s = divided(2);
  selectSeat(s, 1);
  s.staging = [];
  s.encounterDeck = [BF.choice, ...Array(10).fill(BF.anduin)];
  s.phase = "staging";
  addCurrentQuestProgress(s, 1);
  flush(s);
  s = settle(s);
  assert.equal(bfArea(s, 1)!.questCode, BF.setsOut);
  // 4B reveals 1 card for the player there and 1 more for each player.
  s.phase = "quest";
  s.breakingFellowship!.ended = [];
  s.encounterDeck = [BF.hunter, BF.anduin, BF.anduin, BF.anduin];
  for (const p of [0, 1])
    forOwner(s, p, () => {
      for (const h of s.heroes) h.exhausted = true;
      s.staging = s.staging.filter((u) => u.code === BF.parth);
    });
  H.beginStaging!(s);
  flush(s);
  // The Hunter is revealed at stage 4: player 0 may engage it.
  for (let n = 0; s.choice && n < 20; n++) {
    if (/Response: raise your threat/.test(s.choice.title)) {
      s = choose(s, "engage-0");
      break;
    }
    s = choose(
      s,
      s.choice.options.find((o) => o.id.startsWith("reveal-"))?.id ??
        s.choice.options[0].id,
    );
  }
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === BF.hunter));
  assert.equal(seatView(s, 0).threat, 20 + 2);
  selectSeat(s, 1);
  // 1 reveal for the player at stage 4 and 1 for each of the 2 players:
  // the Hunter and 2 River Anduin, plus the River the Hunter made him reveal.
  assert.equal(s.staging.filter((u) => u.code === BF.anduin).length, 3);
  // Victory needs 16 progress and Parth Galen out of play.
  s.progress = 16;
  check(s);
  assert.equal(s.status, "playing");
  s.staging = s.staging.filter((u) => u.code !== BF.parth);
  check(s);
  assert.equal(s.status, "won");
});

test("River Anduin: at the end of the travel phase each player at its stage raises his threat by 1, then it moves to the staging area to the left", () => {
  let s = divided(3);
  for (const p of [0, 1, 2])
    forOwner(s, p, () => {
      s.staging = [];
      s.threat = 20;
    });
  selectSeat(s, 0);
  const river = stage(s, BF.anduin);
  run(s, fx("startEncounter"));
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 20);
  selectSeat(s, 1);
  assert.ok(
    s.staging.some((u) => u.id === river.id),
    "it moved to player 1",
  );
  selectSeat(s, 0);
  assert.ok(!s.staging.some((u) => u.id === river.id));
  // Alone, it stays where it is.
  s = base(1, 1);
  const lone = stage(s, BF.anduin);
  run(s, fx("startEncounter"));
  assert.ok(s.staging.some((u) => u.id === lone.id));
  assert.equal(s.threat, 21);
  reload(s);
});

test("Uruk-hai: Toughness reduces damage; the Captain cannot have attachments and weaker allies cannot defend it; the Tracker hits weak defenders harder; the Archer's X", () => {
  let s = base(2, 2);
  const captain = engaged(s, BF.captain);
  damage(s, captain.id, 3);
  assert.equal(get(s, captain.id)!.damage, 1, "Toughness 2");
  const tracker = engaged(s, BF.tracker);
  damage(s, tracker.id, 1);
  assert.equal(get(s, tracker.id)!.damage, 0, "Toughness 1");
  assert.ok(H.cannotAttach!(s, captain, "01040"));
  const [guard] = allies(s, [GUARD]);
  assert.equal(card(GUARD).health, 2);
  assert.ok(H.cannotDefend!(s, captain, guard), "2 printed hit points < 3");
  assert.ok(!H.cannotDefend!(s, captain, s.heroes[0]), "heroes may defend");
  // The Tracker: +2 attack against a defender with 2 or fewer printed hit points.
  s = base(1, 2);
  const t2 = engaged(s, BF.tracker);
  t2.shadows = [];
  const [g2] = allies(s, [GUARD]);
  s.phase = "defense";
  s = defend(s, t2, g2);
  assert.ok(s.log.some((l) => /Uruk-hai Tracker gets \+2 attack/.test(l.text)));
  // The Archer's threat is the number of players at its stage.
  s = base(3, 1);
  const archer = stage(s, BF.archer);
  assert.equal(threatOf(s, archer), 3);
  reload(s);
});

test("Uruk-hai Hunter and Archer when revealed; the Captain's and Tracker's shadows", () => {
  let s = base(2, 2);
  s = reveal(s, [BF.hunter], 1);
  assert.match(s.choice!.title, /^Uruk-hai Hunter · Choose/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["reveal-0", "reveal-1", "attack"],
  );
  s = choose(s, "attack");
  assert.ok(s.combat?.immediate);
  assert.equal(s.combat!.attackPlayer, 1);
  s = settle(s);
  // Uruk-hai Archer: discard an ally you control.
  s = base(1, 2);
  const [guard] = allies(s, [GUARD]);
  s = reveal(s, [BF.archer]);
  assert.match(s.choice!.title, /^Uruk-hai Archer · Discard an ally/);
  s = choose(s, guard.id);
  assert.equal(get(s, guard.id), undefined);
  // Captain's shadow: an additional attack; Tracker's: discard an attachment.
  s = base(1, 2);
  const orc = engaged(s, BF.hunter);
  orc.shadows = [BF.captain];
  s.phase = "defense";
  s = defend(s, orc, s.heroes[1]);
  s = settle(s);
  assert.ok(
    s.log.some((l) => /makes an additional attack after this one/.test(l.text)),
  );
  assert.ok(
    s.log.filter((l) => /^Uruk-hai Hunter attacks for/.test(l.text)).length >=
      2,
    "two attacks",
  );
  s = base(1, 2);
  const o2 = engaged(s, BF.hunter);
  o2.shadows = [BF.tracker];
  s.heroes[1].attachments.push({ id: "a1", code: "01040", exhausted: false });
  s.phase = "defense";
  s = defend(s, o2, s.heroes[2]);
  s = settle(s);
  assert.ok(!s.heroes[1].attachments.some((a) => a.code === "01040"));
});

test("Growing Threat: move an engaged enemy to the first player's staging area, or doomed 2 and surge; its shadow moves the attacker after the attack", () => {
  let s = divided(2);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      s.staging = [];
      s.threat = 20;
    });
  const hunter = engaged(s, BF.hunter, 1);
  s.encounterDeck = [BF.anduin, ...s.encounterDeck];
  s = reveal(s, [BF.growing], 1);
  assert.match(s.choice!.title, /^Growing Threat · Choose/);
  s = choose(s, hunter.id);
  s = settle(s);
  assert.ok(!seatView(s, 1).engaged.some((u) => u.id === hunter.id));
  selectSeat(s, 0);
  assert.ok(
    s.staging.some((u) => u.id === hunter.id),
    "first player's staging area",
  );
  // Without an engaged enemy: doomed 2 and surge.
  s = base(1, 2);
  s.encounterDeck = [BF.anduin, ...s.encounterDeck];
  s = reveal(s, [BF.growing]);
  s = settle(s);
  assert.equal(s.threat, 22);
  assert.ok(
    s.staging.some((u) => u.code === BF.anduin),
    "surge",
  );
  // Shadow: after the attack, the attacker moves to the first player's area.
  s = base(2, 2);
  const h2 = engaged(s, BF.hunter, 1);
  h2.shadows = [BF.growing];
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.phase = "defense";
  s = defend(s, h2, seatView(s, 1).heroes[1]);
  s = settle(s);
  assert.ok(!seatView(s, 1).engaged.some((u) => u.id === h2.id));
  assert.ok(s.staging.some((u) => u.id === h2.id));
});

test("Orcs of the White Hand and Black Feathered Arrows", () => {
  let s = base(1, 2);
  const tracker = stage(s, BF.tracker);
  tracker.damage = 2;
  const hunter = engaged(s, BF.hunter);
  hunter.damage = 1;
  s = reveal(s, [BF.whiteHand]);
  s = settle(s);
  assert.equal(get(s, tracker.id)!.damage, 0);
  assert.equal(get(s, hunter.id)!.damage, 0);
  assert.equal(threatOf(s, get(s, tracker.id)!), 2);
  assert.equal(stats(s, get(s, hunter.id)!).attack, 5);
  assert.equal(stats(s, get(s, hunter.id)!).defense, 2);
  // Shadow: a defender with fewer printed hit points makes it undefended.
  s = base(1, 2);
  const h2 = engaged(s, BF.hunter);
  h2.shadows = [BF.whiteHand];
  const [guard] = allies(s, [GUARD]);
  s.phase = "defense";
  s = defend(s, h2, guard);
  assert.ok(s.log.some((l) => /considered undefended/.test(l.text)));
  s = settle(s);
  // Black Feathered Arrows: +1 archery per ally at this stage this round.
  s = base(1, 2);
  allies(s, [GUARD, GUARD]);
  s = reveal(s, [BF.arrows]);
  s = settle(s);
  stage(s, BF.tracker);
  H.combatBegin!(s);
  const archery = s.queue.find((e) => e.kind === "heirsArchery");
  assert.equal(archery?.value, 1 + 2);
  // Shadow: +1 attack, +2 against a defender with fewer printed hit points.
  s = base(1, 2);
  const h3 = engaged(s, BF.hunter);
  h3.shadows = [BF.arrows];
  const [g3] = allies(s, [GUARD]);
  s.phase = "defense";
  s = defend(s, h3, g3);
  assert.ok(
    s.log.some((l) =>
      /Black Feathered Arrows: the attacking enemy gets \+2/.test(l.text),
    ),
  );
});

test("Fallen into Evil: a non-Fellowship hero becomes an enemy in the first player's staging area; defeated, it goes to its owner's discard pile", () => {
  let s = base(2, 2);
  s = reveal(s, [BF.fallen], 1);
  assert.match(s.choice!.title, /^Fallen into Evil/);
  assert.ok(
    s.choice!.options.every((o) => card(o.code!).sphere_code !== "fellowship"),
  );
  const target = seatView(s, 1).heroes[0];
  s = choose(s, target.id);
  s = settle(s);
  assert.ok(!seatView(s, 1).heroes.some((h) => h.id === target.id));
  const enemy = s.staging.find((u) => u.id === target.id)!;
  assert.ok(enemy, "in the first player's staging area");
  assert.equal(
    threatOf(s, enemy),
    card(target.code).willpower,
    "threat equal to its willpower",
  );
  assert.equal(
    engagementCost(s, enemy),
    card(target.code).threat,
    "engagement cost equal to its threat cost",
  );
  assert.ok(!s.encounterDiscard.includes(BF.fallen));
  // Defeated as an enemy: its owner's discard pile.
  damage(s, enemy.id, 99);
  check(s);
  flush(s);
  assert.equal(get(s, enemy.id), undefined);
  assert.ok(seatView(s, 1).discard.includes(target.code));
  assert.ok(s.encounterDiscard.includes(BF.fallen));
  assert.deepEqual(s.breakingFellowship!.fallen, []);
  reload(s);
});

test("Slopes of Amon Hen, Wooded Shoreline and Parth Galen travel; Seat of Seeing has no burden to remove", () => {
  let s = divided(2);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      s.staging = [];
      s.activeLocation = null;
    });
  selectSeat(s, 1);
  const hunter = stage(s, BF.hunter);
  selectSeat(s, 0);
  const slopes = stage(s, BF.slopes);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: slopes.id });
  assert.match(
    s.choice!.title,
    /^Slopes of Amon Hen · Engage an enemy in any staging area/,
  );
  s = choose(s, hunter.id);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === hunter.id));
  // Without an enemy in any staging area, Slopes of Amon Hen cannot be travelled to.
  let t = base(1, 2);
  const s2 = stage(t, BF.slopes);
  t.phase = "travel";
  assert.match(canTravel(t, s2) ?? "", /must engage an enemy/);
  // Wooded Shoreline: archery 2 in the staging area; travel finds an enemy.
  t = base(1, 2);
  const shore = stage(t, BF.shoreline);
  H.combatBegin!(t);
  assert.equal(t.queue.find((e) => e.kind === "heirsArchery")?.value, 2);
  t.queue = [];
  t.encounterDeck = [BF.anduin, BF.captain];
  t.phase = "travel";
  t = act(t, { type: "TRAVEL", id: shore.id });
  assert.match(t.choice!.title, /Search for an enemy/);
  t = choose(t, `deck-${BF.captain}`);
  t = settle(t);
  assert.ok(t.staging.some((u) => u.code === BF.captain));
  assert.equal(t.activeLocation?.code, BF.shoreline);
  // Seat of Seeing: no burden outside campaign mode.
  t = base(1, 2);
  const seeing = activate(t, BF.seeing);
  seeing.progress = 5;
  progress(t, 1);
  flush(t);
  assert.ok(t.log.some((l) => /no burden card/.test(l.text)));
});

test("3B responses after questing successfully: Searching the Woods, Guard the Hobbits, The Seat of Amon Hen and Orc Hunting", () => {
  const atStage = (code: string) => {
    const s = base(1, 2);
    const q = s.breakingFellowship!;
    q.currentQuest = code;
    s.stage = 3;
    // Frodo's Choice has returned the Ring-bearer.
    s.heroes.push(q.ringBearerOut!);
    q.ringBearerOut = null;
    return s;
  };
  let s = atStage(BF.woods);
  const river = stage(s, BF.anduin);
  stage(s, BF.parth);
  run(s, fx("btfStageResponse", { player: 0 }));
  assert.ok(
    !s.choice!.options.some((o) => card(o.code ?? BF.anduin).is_unique),
  );
  s = choose(s, river.id);
  assert.ok(!s.staging.some((u) => u.id === river.id));
  s = atStage(BF.hobbits);
  for (const h of s.heroes) h.exhausted = true;
  run(s, fx("btfStageResponse", { player: 0 }));
  s = choose(s, "ready-0");
  assert.ok(s.heroes.every((h) => !h.exhausted));
  s = atStage(BF.seat);
  s.deck = ["01013", "01013", "01013"];
  run(s, fx("btfStageResponse", { player: 0 }));
  s = choose(s, "draw-0");
  assert.equal(s.hand.length, 2);
  assert.equal(s.threat, 18);
  s = atStage(BF.hunting);
  const hunter = engaged(s, BF.hunter);
  run(s, fx("btfStageResponse", { player: 0 }));
  s = choose(s, hunter.id);
  assert.equal(get(s, hunter.id), undefined);
  assert.ok(s.encounterDiscard.includes(BF.hunter));
});

test("An eliminated player's stage and the encounter cards in its staging area are discarded", () => {
  let s = divided(2);
  selectSeat(s, 1);
  const hunter = stage(s, BF.hunter);
  const river = stage(s, BF.anduin);
  selectSeat(s, 0);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  flush(s);
  assert.ok(s.table!.seats[1].eliminated);
  assert.equal(s.breakingFellowship!.areas.length, 1);
  assert.ok(s.encounterDiscard.includes(hunter.code));
  assert.ok(s.encounterDiscard.includes(river.code));
  reload(s);
});

test("Public state, saves and the scenario panel data", () => {
  const s = divided(2);
  const p = publicState(reload(s)) as unknown as {
    breakingFellowship: ReturnType<typeof breakingFellowshipPublicState>;
  };
  assert.equal(p.breakingFellowship!.split, true);
  assert.equal(p.breakingFellowship!.areas.length, 2);
  assert.equal(p.breakingFellowship!.ringBearerOut, true);
  assert.ok(bfAreaUnits(s).length >= 2);
  assert.ok(make(s, BF.anduin));
  assert.ok(playerOrder(s).length >= 1);
});
