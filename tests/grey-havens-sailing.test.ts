import assert from "node:assert/strict";
import test from "node:test";
import { createGame } from "../src/game/setup";
import {
  applyAction,
  canCommit,
  canPlay,
  publicState,
} from "../src/game/actions";
import { STARTERS, card } from "../src/game/cards";
import { make, fx, stagingThreat } from "../src/game/core";
import { damage, destroy } from "../src/game/board";
import { flush } from "../src/game/effects";
import { beginEnemyAttack, playerAttack } from "../src/game/combat";
import { validateSave, restoreSave } from "../src/game/save";
import { VOYAGE as V } from "../src/game/voyage-belegaer-support";
import {
  allCharacters,
  attackersFor,
  defendersFor,
  ownerOf,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  beginSailingTest,
  sailingCandidates,
  sailingCommitCount,
  sailingContinue,
  sailingEffect,
  sailingOnCourse,
  sailingSymbols,
  shiftHeading,
} from "../src/game/sailing";
import {
  isShipEnemy,
  isShipObjective,
  shipUndefendedTargets,
} from "../src/game/ships";
import type { GameState } from "../src/game/types";

const leadership = STARTERS.find((d) => d.id === "leadership")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;
function fleet(multiplayer = false) {
  let s = createGame(47, leadership.cards, leadership.heroes, leadership.id, {
    scenarioId: "voyage-across-belegaer",
    guided: false,
    ...(multiplayer
      ? {
          seats: [
            { heroes: leadership.heroes, deckId: leadership.id },
            { heroes: spirit.heroes, deckId: spirit.id },
          ],
        }
      : {}),
  });
  let attempts = 0;
  while (s.phase === "setup" && s.status === "playing") {
    assert.ok(attempts++ < 40, "Fleet setup must complete");
    s = s.choice
      ? applyAction(s, {
          type: "CHOOSE",
          id: (
            s.choice.options.find((o) => o.id === "resolve") ??
            s.choice.options[0]
          ).id,
        })
      : applyAction(s, { type: "KEEP" });
  }
  assert.equal(s.status, "playing");
  s.phase = "quest";
  s.queue = [];
  s.choice = null;
  s.staging = [];
  s.engaged = [];
  s.activeLocation = null;
  s.sailing!.heading = 0;
  for (const u of allCharacters(s)) {
    u.exhausted = false;
    u.damage = 0;
    u.committed = false;
  }
  syncSeat(s);
  return s;
}
function commit(s: GameState, id: string) {
  s.choice = null;
  sailingEffect(s, fx("sailingCommit", { target: id }));
  flush(s);
}
function done(s: GameState) {
  s.choice = null;
  sailingEffect(s, fx("sailingCommitDone"));
}
function finish(s: GameState, shifts: number) {
  s.choice = null;
  sailingEffect(s, fx("sailingFinish", { value: shifts }));
}

test("Sailing uses verified printed wheel symbols, not encounter ability text", () => {
  assert.equal(sailingSymbols(V.calm), 2);
  for (const code of [V.rough, V.thrown, V.winds, V.starlit, V.rolling])
    assert.equal(sailingSymbols(code), 1);
  assert.equal(sailingSymbols(V.warship), 0);
});

test("Sailing shifts off-course first, counts Dream-chaser twice and keeps quest commitment separate", () => {
  const s = fleet();
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  beginSailingTest(s);
  assert.equal(s.sailing!.heading, 1);
  commit(s, dream.id);
  assert.equal(sailingCommitCount(s), 2);
  assert.ok(dream.exhausted);
  assert.equal(dream.committed, false);
  assert.equal(canCommit(s, s.heroes[0]), false);
  done(s);
  s.encounterDeck = [V.calm, V.thrown];
  s.encounterDiscard = [];
  const threat = s.threat;
  sailingContinue(s);
  assert.equal(s.sailing!.test!.successes, 3);
  assert.equal(s.staging.length, 0);
  assert.equal(
    s.threat,
    threat,
    "Looked cards do not resolve encounter effects",
  );
  assert.ok(s.choice?.options.some((o) => o.id === "sailing-heading-0"));
  finish(s, 1);
  assert.ok(sailingOnCourse(s));
  assert.deepEqual(s.encounterDiscard, [V.calm, V.thrown]);
  assert.equal(s.sailing!.test, undefined);
});

test("Sailing optional successes, Rough Waters cancellations and Calm Waters extra looks are exact", () => {
  const s = fleet();
  s.sailing!.heading = 1;
  beginSailingTest(s);
  commit(s, s.heroes[0].id);
  done(s);
  s.activeLocation = make(s, V.calm);
  s.staging = [make(s, V.rough), make(s, V.rough)];
  s.encounterDeck = [V.calm, V.starlit, V.scout];
  s.encounterDiscard = [];
  sailingContinue(s);
  assert.deepEqual(s.sailing!.test!.looked, [V.calm, V.starlit, V.scout]);
  assert.equal(s.sailing!.test!.successes, 1);
  assert.equal(s.choice!.options.length, 2);
  finish(s, 0);
  assert.equal(
    s.sailing!.heading,
    2,
    "Player may decline successful on-course shifts",
  );
  assert.deepEqual(s.encounterDiscard, [V.calm, V.starlit, V.scout]);
});

test("Sailing refills before looking and Calm Waters permits extra looks with no characters committed", () => {
  const s = fleet();
  s.sailing!.heading = 3;
  beginSailingTest(s);
  commit(s, s.heroes[0].id);
  commit(s, s.heroes[1].id);
  done(s);
  s.encounterDeck = [V.calm];
  s.encounterDiscard = [V.calm];
  sailingContinue(s);
  assert.equal(s.sailing!.test!.looked!.length, 2);
  assert.equal(s.sailing!.test!.successes, 4);
  finish(s, 3);
  assert.equal(s.sailing!.heading, 0);
  s.activeLocation = make(s, V.calm);
  s.encounterDeck = [V.calm, V.calm];
  s.encounterDiscard = [];
  beginSailingTest(s);
  done(s);
  sailingContinue(s);
  assert.equal(s.sailing!.test!.successes, 4);
  assert.equal(s.sailing!.test!.looked!.length, 2);
  finish(s, 1);
  assert.equal(s.sailing!.heading, 0);
  shiftHeading(s, 10);
  assert.equal(s.sailing!.heading, 3);
  shiftHeading(s, -10);
  assert.equal(s.sailing!.heading, 0);
});

test("Sailing multiplayer commitment belongs to the first player except the Dream-chaser", () => {
  const s = fleet(true);
  const first = s.table!.first;
  const other = first === 0 ? 1 : 0;
  // Move the Dream-chaser to the other player to exercise the printed exception.
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  const controller = ownerOf(s, dream);
  selectSeat(s, controller);
  s.allies = s.allies.filter((u) => u.id !== dream.id);
  syncSeat(s);
  selectSeat(s, other);
  s.allies.push(dream);
  dream.owner = other;
  dream.controller = other;
  syncSeat(s);
  selectSeat(s, first);
  beginSailingTest(s);
  const ids = sailingCandidates(s).map((u) => u.id);
  assert.ok(ids.includes(dream.id));
  assert.ok(seatView(s, first).heroes.every((u) => ids.includes(u.id)));
  assert.ok(seatView(s, other).heroes.every((u) => !ids.includes(u.id)));
  assert.throws(() => commit(s, seatView(s, other).heroes[0].id), /eligible/);
  commit(s, dream.id);
  assert.equal(sailingCommitCount(s), 2);
});

test("Sailing saves every decision and blocks player Actions throughout its framework test", () => {
  let s = fleet();
  beginSailingTest(s);
  assert.ok(validateSave(s));
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s)))?.sailing?.test);
  assert.equal(publicState(s).sailing?.test?.phase, "committing");
  s = applyAction(s, { type: "CHOOSE", id: "done" });
  assert.ok(validateSave(s));
  assert.throws(() => applyAction(s, { type: "COMMIT" }), /Sailing/);
  assert.throws(
    () => applyAction(s, { type: "ABILITY", id: s.heroes[0].id }),
    /Sailing/,
  );
  assert.match(canPlay(s, s.hand[0])!, /Sailing/);
  const bad = structuredClone(s);
  bad.sailing!.heading = 4 as never;
  assert.equal(validateSave(bad), false);
  const badPlayer = structuredClone(s);
  badPlayer.sailing!.test!.player = 3;
  assert.equal(validateSave(badPlayer), false);
  const duplicate = structuredClone(s);
  duplicate.sailing!.test!.committedIds = [s.heroes[0].id, s.heroes[0].id];
  assert.equal(validateSave(duplicate), false);
  const invented = structuredClone(s);
  invented.sailing!.test!.committedIds = ["c999999"];
  assert.equal(validateSave(invented), false);
});

test("Sailing looked results and queued quest continuation survive restoration", () => {
  const s = fleet(true);
  const player = s.table!.first;
  selectSeat(s, player);
  const continuation = fx("draw", { value: 0, player });
  beginSailingTest(s, [continuation]);
  commit(s, s.heroes[0].id);
  done(s);
  s.encounterDeck = [V.calm];
  s.encounterDiscard = [];
  sailingContinue(s);
  syncSeat(s);
  assert.ok(validateSave(s));
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.deepEqual(restored.sailing?.test, s.sailing!.test);
  assert.equal(restored.sailing!.test!.phase, "results");
  assert.deepEqual(publicState(restored).sailing?.test?.looked, [V.calm]);
  restored.choice = null;
  finish(restored, 1);
  assert.deepEqual(restored.queue, [continuation]);
  assert.deepEqual(restored.encounterDiscard, [V.calm]);
});

test("Sailing restores looked Heading and Ship objectives discarded by a player's elimination", () => {
  let s = fleet(true);
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  const eliminated = ownerOf(s, dream);
  selectSeat(s, eliminated);
  s.phase = "planning";
  s.threat = 50;
  s.encounterDeck = [];
  s.encounterDiscard = [V.calm];
  syncSeat(s);
  s = applyAction(s, { type: "NEXT" });
  assert.equal(seatView(s, eliminated).eliminated, true);
  assert.equal(
    s.status,
    "playing",
    "elimination discards ships without destroying them",
  );
  assert.ok(s.encounterDiscard.includes(V.heading));
  assert.ok(s.encounterDiscard.includes(V.dream));
  assert.ok(!allCharacters(s).some((u) => u.id === dream.id));
  s.phase = "quest";
  s.queue = [];
  s.choice = null;
  beginSailingTest(s);
  for (const hero of [...s.heroes]) commit(s, hero.id);
  done(s);
  s = applyAction(s, { type: "RESOLVE_SAILING" });
  assert.equal(s.sailing!.test!.phase, "results");
  assert.deepEqual(
    new Set(s.sailing!.test!.looked),
    new Set([V.heading, V.dream, V.calm]),
  );
  assert.equal(
    s.sailing!.test!.successes,
    2,
    "discarded objectives contribute no Sailing symbols",
  );
  assert.ok(validateSave(s));
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.ok(restored);
  assert.deepEqual(restored.sailing!.test, s.sailing!.test);
  s = applyAction(restored, { type: "CHOOSE", id: "sailing-heading-1" });
  assert.equal(s.sailing!.test, undefined);
  assert.deepEqual(
    new Set([...s.encounterDeck, ...s.encounterDiscard]),
    new Set([V.heading, V.dream, V.calm]),
  );
  assert.ok(validateSave(s));
});

test("Sailing looked validation still rejects player cards and quest cards", () => {
  const s = fleet();
  beginSailingTest(s);
  commit(s, s.heroes[0].id);
  done(s);
  s.encounterDeck = [V.calm];
  s.encounterDiscard = [];
  sailingContinue(s);
  for (const code of ["01001", "01016", V.departure, "rc135"]) {
    const invalid = structuredClone(s);
    invalid.sailing!.test!.looked = [code];
    invalid.sailing!.test!.successes = 0;
    assert.equal(
      validateSave(invalid),
      false,
      `${card(code).name} is not an encounter card looked at by Sailing`,
    );
  }
});

test("Ship combat allows ordinary attackers against ships but keeps defenses and ship attacks separate", () => {
  const s = fleet();
  s.phase = "defense";
  const ship = allCharacters(s).find(isShipObjective)!;
  const enemy = make(s, V.scout),
    corsair = make(s, V.sailor);
  s.engaged = [enemy, corsair];
  assert.ok(isShipEnemy(enemy));
  assert.ok(defendersFor(s, enemy).some((u) => u.id === ship.id));
  assert.ok(defendersFor(s, enemy).every(isShipObjective));
  assert.ok(defendersFor(s, corsair).every((u) => !isShipObjective(u)));
  assert.throws(() => beginEnemyAttack(s, enemy, [s.heroes[0].id]), /defend/);
  assert.throws(() => beginEnemyAttack(s, corsair, [ship.id]), /defend/);
  assert.ok(shipUndefendedTargets(s, enemy).every(isShipObjective));
  s.phase = "attack";
  assert.ok(attackersFor(s, enemy).some((u) => u.id === s.heroes[0].id));
  assert.ok(attackersFor(s, enemy).some((u) => u.id === ship.id));
  assert.ok(attackersFor(s, corsair).every((u) => !isShipObjective(u)));
  assert.throws(() => playerAttack(s, corsair, [ship.id]), /cannot attack/);
  s.staging = [make(s, V.scout)];
  s.engaged = [];
  assert.equal(stagingThreat(s), card(V.scout).threat);
});

test("Ship destruction ends the Dream-chaser voyage and eliminates an ordinary ship's controller", () => {
  const s = fleet();
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  damage(s, dream.id, card(V.dream).health!);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Dream-chaser/);
  assert.ok(!s.discard.includes(V.dream));
  const ordinary = fleet();
  const otherShip = allCharacters(ordinary).find(
    (u) => isShipObjective(u) && u.code !== V.dream,
  )!;
  destroy(ordinary, otherShip);
  assert.equal(ordinary.status, "lost");
  assert.ok(!ordinary.discard.includes(otherShip.code));
});
