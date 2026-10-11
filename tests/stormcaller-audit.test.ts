import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, get, make } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { allCharacters } from "../src/game/table";
import { beginSailingTest } from "../src/game/sailing";
import { stormcallerTravelStart } from "../src/game/stormcaller";
import { STORMCALLER as C } from "../src/game/stormcaller-support";
import {
  base,
  choose,
  reload,
  setEnemyStage,
  setPlayerStage,
  settle,
} from "./stormcaller-fixtures";
import type { GameState } from "../src/game/types";

const ships = (s: GameState) =>
  allCharacters(s).filter((u) => card(u.code).type_code === "ship-objective");
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
const cape = (players = 1) => {
  const s = setPlayerStage(base(players), 4);
  setEnemyStage(s, 4);
  return s;
};

test("4B damages every ship at its stage even when A Test of Will cancels the revealed Weather effect", () => {
  let s = cape(2);
  s.phase = "staging";
  s.heroes[0].code = "01007";
  s.heroes[0].resources = 2;
  s.hand = [make(s, "01050")];
  const bossId = s.stormcaller!.stormcallerId;
  revealed(s, C.sudden);
  flush(s);
  const cancel = s.choice?.options.find((o) => o.id.startsWith("cancel"));
  assert.ok(cancel, "the actual treachery cancellation window is available");
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.equal(
    s.sailing!.heading,
    0,
    "canceled Weather does not shift heading",
  );
  assert.ok(s.discard.includes("01050"));
  assert.ok(ships(s).every((u) => u.damage === 1));
  assert.equal(get(s, bossId)!.damage, 1);
  assert.ok(validateSave(reload(s)));
});

test("4B excludes ships in the Stormcaller's area at a different main stage", () => {
  let s = setPlayerStage(base(), 4);
  const bossId = s.stormcaller!.stormcallerId;
  s.phase = "staging";
  revealed(s, C.sudden);
  s = finish(s);
  assert.ok(ships(s).every((u) => u.damage === 1));
  assert.equal(get(s, bossId)!.damage, 0);
  assert.ok(validateSave(reload(s)));
});

test("4A's discarded Weather replay resolves only its When Revealed effect without a4B reveal trigger", () => {
  let s = cape();
  s.phase = "staging";
  s.encounterDeck = [C.calm, C.sudden, C.rolling];
  handle(s, fx("stormcallerCapeWeather"));
  s = finish(s);
  assert.equal(
    s.sailing!.heading,
    1,
    "the discarded Weather effect still resolves",
  );
  assert.ok(ships(s).every((u) => u.damage === 0));
  assert.equal(get(s, s.stormcaller!.stormcallerId)!.damage, 0);
  assert.deepEqual(s.encounterDiscard, [C.calm, C.sudden]);
  assert.deepEqual(s.encounterDeck, [C.rolling]);
  assert.ok(validateSave(reload(s)));
});

test("end-round Weather discard advances the pursuit without revealing the Weather or damaging ships", () => {
  let s = cape();
  s.phase = "refresh";
  s.encounterDeck = [C.sudden];
  handle(s, fx("stormcallerEnemyRound"));
  s = finish(s);
  assert.equal(s.stormcaller!.enemyProgress, 2);
  assert.equal(s.sailing!.heading, 0);
  assert.ok(ships(s).every((u) => u.damage === 0));
  assert.equal(get(s, s.stormcaller!.stormcallerId)!.damage, 0);
  assert.deepEqual(s.encounterDiscard, [C.sudden]);
  assert.ok(validateSave(reload(s)));
});

test("Sailing looks at a Weather card without its reveal effect or4B ship damage", () => {
  let s = cape();
  s.phase = "quest";
  s.encounterDeck = [C.sudden, C.rolling];
  beginSailingTest(s);
  s = choose(reload(s), s.heroes[0].id);
  s = choose(reload(s), "done");
  s = applyAction(reload(s), { type: "RESOLVE_SAILING" });
  s = finish(s);
  assert.equal(s.sailing!.heading, 1);
  assert.ok(ships(s).every((u) => u.damage === 0));
  assert.equal(get(s, s.stormcaller!.stormcallerId)!.damage, 0);
  assert.deepEqual(s.encounterDiscard, [C.sudden]);
  assert.deepEqual(s.encounterDeck, [C.rolling]);
  assert.ok(validateSave(reload(s)));
});

test("Stormcaller damage limits count actual cumulative placements through healing, saves and a stage transition", () => {
  let s = setPlayerStage(base(), 2);
  const bossId = s.stormcaller!.stormcallerId;
  damage(s, bossId, 3);
  damage(s, bossId, 4);
  assert.equal(get(s, bossId)!.damage, 4);
  assert.equal(s.stormcaller!.damageThisRound, 4);
  handle(s, fx("heal", { target: bossId, value: 4 }));
  assert.equal(get(s, bossId)!.damage, 0);
  s = reload(s);
  damage(s, bossId, 2);
  assert.equal(
    get(s, bossId)!.damage,
    0,
    "healing never refunds the round cap",
  );
  setEnemyStage(s, 3);
  damage(s, bossId, 9);
  assert.equal(get(s, bossId)!.damage, 4);
  assert.equal(s.stormcaller!.damageThisRound, 8);
  s = reload(s);
  damage(s, bossId, 1);
  assert.equal(get(s, bossId)!.damage, 4);
  handle(s, fx("nextRound"));
  s = finish(s);
  damage(s, bossId, 2);
  assert.equal(get(s, bossId)!.damage, 6);
  assert.equal(s.stormcaller!.damageThisRound, 2);
  assert.ok(validateSave(reload(s)));
});

test("Man Overboard permits discarding a questing companion ship without applying its destruction elimination", () => {
  let s = base();
  s.phase = "staging";
  const companion = ships(s).find((u) => u.code === C.narelenya)!;
  const dream = ships(s).find((u) => u.code === C.dream)!;
  for (const u of [companion, dream, s.heroes[0]]) u.committed = true;
  revealed(s, C.overboard);
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === companion.id));
  s = choose(reload(s), companion.id);
  s = finish(s);
  assert.equal(s.status, "playing");
  assert.ok(!get(s, companion.id));
  assert.ok(get(s, dream.id));
  assert.equal(s.threat, 20);
  assert.ok(validateSave(reload(s)));
});

test("an offstage-area Jagged Reef remains in play and resolves its unqualified travel-phase Forced ability", () => {
  let s = base(2);
  const reef = make(s, C.reef);
  s.stormcaller!.area.push(reef);
  s.phase = "travel";
  stormcallerTravelStart(s);
  s = finish(s);
  assert.equal(get(s, reef.id)!.progress, 2);
  assert.ok(s.stormcaller!.area.some((u) => u.id === reef.id));
  assert.ok(!s.staging.some((u) => u.id === reef.id));
  assert.ok(ships(s).every((u) => u.damage === 0));
  s = reload(s);
  s.sailing!.heading = 1;
  stormcallerTravelStart(s);
  s = finish(s);
  assert.ok(ships(s).every((u) => u.damage === 2));
  assert.ok(validateSave(reload(s)));
});
