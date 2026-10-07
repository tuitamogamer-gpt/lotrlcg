import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  createGame,
  publicState,
  validateSave,
} from "../src/game/engine.ts";
import { STARTERS, card } from "../src/game/cards.ts";
import {
  check,
  damage,
  engage,
  progress,
  progressLocation,
  revealed,
} from "../src/game/board.ts";
import {
  fx,
  make,
  questStat,
  stagingThreat,
  threatOf,
  locationQuest,
} from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { beginEnemyAttack } from "../src/game/combat.ts";
import { prepareEnemyShadows } from "../src/game/considered-engagement.ts";
import { forOwner, seatView, selectSeat, syncSeat } from "../src/game/table.ts";
import {
  bloodTakeHidden,
  bloodGondorEliminated,
} from "../src/game/blood-gondor.ts";
import {
  BLOOD_GONDOR as B,
  BLOOD_GONDOR_RECIPES,
} from "../src/game/blood-gondor-support.ts";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support.ts";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures.ts";
const base = (p = 1) => fixture("the-blood-of-gondor", p);
test("Blood original/easy encounter quantities match the published recipe, including setup cards", () => {
  for (const easy of [false, true]) {
    const r = BLOOD_GONDOR_RECIPES.find(
      (r) => r.mode === (easy ? "easy" : "standard"),
    )!;
    for (const row of r.cards.filter((r) => r.section !== "sharedQuestDeck"))
      assert.equal(
        easy
          ? (card(row.code).easy_quantity ?? card(row.code).quantity)
          : card(row.code).quantity,
        row.quantity,
      );
  }
});
test("Blood setup has both objective allies, siege Crossroads and the Black Numenorean", () => {
  const d = STARTERS[0],
    s = createGame(14, d.cards, d.heroes, d.id, {
      scenarioId: "the-blood-of-gondor",
    });
  assert.ok(s.staging.some((u) => u.code === B.crossroads));
  assert.ok(s.staging.some((u) => u.code === B.numenorean));
  assert.deepEqual(
    s.allies.map((u) => u.code),
    [B.faramir, B.alcaron],
  );
  assert.equal(questStat(s), "defense");
});
test("Hidden identities remain absent from the public state and reviews before turning", () => {
  const s = base();
  s.encounterDeck = [B.uruk];
  bloodTakeHidden(s, 0);
  const snapshot = JSON.stringify(publicState(s));
  assert.ok(!snapshot.includes(B.uruk));
  assert.ok(!snapshot.includes("Brutal Uruk"));
  assert.equal(s.bloodGondor!.hidden[0].length, 1);
  reload(s);
});
test("Taking hidden cards reshuffles outside quest phase; shadows do not consume them", () => {
  const s = base();
  s.phase = "travel";
  s.encounterDeck = [];
  s.encounterDiscard = [B.crow];
  bloodTakeHidden(s, 0);
  assert.equal(s.bloodGondor!.hidden[0][0].code, B.crow);
  assert.equal(s.encounterDiscard.length, 0);
});
test("FAQ snapshot: Evil Crow's new hidden card is not turned with the original group", () => {
  let s = base();
  s.encounterDeck = [B.crow, B.southern, B.uruk];
  bloodTakeHidden(s, 0, 2);
  s.queue = [fx("bloodTurnAll", { player: 0 })];
  flush(s);
  assert.equal(s.engaged[0].code, B.crow);
  assert.deepEqual(
    s.bloodGondor!.hidden[0].map((u) => u.code),
    [B.uruk],
  );
  assert.ok(s.encounterDiscard.includes(B.southern));
  s = reload(s);
});
test("Ordinary hidden treacheries are discarded without Surge or When Revealed", () => {
  const s = base();
  s.encounterDeck = [B.looms, B.uruk];
  bloodTakeHidden(s, 0);
  s.queue = [fx("bloodTurnAll", { player: 0 })];
  flush(s);
  assert.equal(s.bloodGondor!.hidden[0].length, 0);
  assert.equal(s.encounterDeck[0], B.uruk);
});
test("Lying in Wait puts hidden locations in staging and resolves text without Surge", () => {
  const s = base();
  s.encounterDeck = [B.southern, B.looms, B.uruk, B.crow];
  bloodTakeHidden(s, 0, 2);
  s.queue = [fx("bloodTurnAll", { player: 0, flag: true })];
  flush(s);
  assert.ok(s.staging.some((u) => u.code === B.southern));
  assert.deepEqual(
    s.bloodGondor!.hidden[0].map((u) => u.code),
    [B.uruk],
  );
  assert.equal(s.encounterDeck[0], B.crow);
});
test("An Orc Ambusher's forced discard targets its engaged player and excludes objective allies", () => {
  let s = base(2);
  const ordinary = make(s, "01013"),
    objective = make(s, B.faramir);
  ordinary.owner = 1;
  objective.owner = 1;
  forOwner(s, 1, () => s.allies.push(ordinary, objective));
  selectSeat(s, 1);
  engage(s, make(s, B.ambusher));
  flush(s);
  assert.equal(s.choice!.options.length, 1);
  assert.equal(s.choice!.options[0].id, ordinary.id);
  s = choose(s, ordinary.id);
  assert.ok(seatView(s, 1).discard.includes("01013"));
  assert.ok(!seatView(s, 1).discard.includes(B.faramir));
});
test("Stage two captures both physical allies without leaving play and turns hidden cards", () => {
  const s = base();
  s.allies = [make(s, B.faramir), make(s, B.alcaron)];
  const ids = s.allies.map((u) => u.id);
  s.encounterDeck = [B.uruk];
  bloodTakeHidden(s, 0);
  progress(s, 11);
  flush(s);
  assert.equal(s.stage, 2);
  assert.deepEqual(
    s.bloodGondor!.captured.map((u) => u.id),
    ids,
  );
  assert.equal(s.allies.length, 0);
  assert.equal(s.status, "playing");
  assert.equal(questStat(s), "attack");
  assert.ok(s.engaged.some((u) => u.code === B.uruk));
  reload(s);
});
test("Five hidden cards on Captured turn automatically, with later Crow draws left hidden", () => {
  const s = base();
  s.stage = 2;
  s.encounterDeck = [
    B.crow,
    B.southern,
    B.southern,
    B.southern,
    B.southern,
    B.uruk,
  ];
  bloodTakeHidden(s, 0, 5);
  flush(s);
  assert.equal(s.bloodGondor!.hidden[0].length, 1);
  assert.equal(s.bloodGondor!.hidden[0][0].code, B.uruk);
});
test("Travel to Eastern Road pays two hidden cards before the location becomes active", () => {
  let s = base();
  s.phase = "travel";
  const u = make(s, B.eastern);
  s.staging = [u];
  assert.equal(locationQuest(s, u), 7);
  s = applyAction(s, { type: "TRAVEL", id: u.id });
  assert.equal(s.bloodGondor!.hidden[0].length, 2);
  assert.equal(s.activeLocation!.id, u.id);
  assert.equal(locationQuest(s, s.activeLocation!), 2);
  reload(s);
});
test("Faramir chooses a hidden card of another player and damages that actual enemy", () => {
  let s = base(2);
  s.phase = "defense";
  s.allies = [make(s, B.faramir)];
  s.encounterDeck = [B.uruk];
  bloodTakeHidden(s, 1);
  const id = s.bloodGondor!.hidden[1][0].id;
  s = applyAction(s, { type: "ABILITY", id: s.allies[0].id });
  assert.ok(!JSON.stringify(s.choice).includes(B.uruk));
  s = reload(s);
  s = choose(s, id);
  assert.equal(seatView(s, 1).engaged.find((u) => u.id === id)!.damage, 3);
});
test("Black Numenorean counts all hidden cards and raises each player's own threat", () => {
  const s = base(2);
  const e = make(s, B.numenorean);
  s.staging = [e];
  bloodTakeHidden(s, 0, 2);
  bloodTakeHidden(s, 1, 1);
  assert.equal(threatOf(s, e), 3);
  s.queue = [fx("endRound")];
  flush(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 21);
});
test("Conflict counts engaged Orc threat, and its temporary effect ends with the phase", () => {
  const s = base(2);
  forOwner(s, 1, () => s.engaged.push(make(s, B.uruk)));
  revealed(s, B.conflict);
  s.encounterDeck = [];
  flush(s);
  assert.equal(stagingThreat(s), 3);
  s.queue = [fx("phaseEnd")];
  flush(s);
  assert.equal(stagingThreat(s), 0);
});
test("Exploring Dark Woods offers a face-down discard; it never reveals the chosen card", () => {
  let s = base();
  s.encounterDeck = [B.uruk, B.crow];
  bloodTakeHidden(s, 0, 2);
  const u = make(s, B.woods);
  s.activeLocation = u;
  progressLocation(s, u, 2);
  flush(s);
  assert.ok(!JSON.stringify(s.choice).includes(B.uruk));
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.bloodGondor!.hidden[0].length, 1);
  assert.equal(s.engaged.length, 0);
});
test("Objective death loses the game; elimination discards only that player's hidden cards", () => {
  const s = base(2);
  s.allies = [make(s, B.faramir)];
  bloodTakeHidden(s, 0);
  bloodTakeHidden(s, 1);
  bloodGondorEliminated(s, 1);
  assert.equal(s.bloodGondor!.hidden[1].length, 0);
  assert.equal(s.bloodGondor!.hidden[0].length, 1);
  damage(s, s.allies[0].id, 4);
  assert.equal(s.status, "lost");
});
test("Saved hidden queues reject duplicate physical identities", () => {
  const s = base();
  bloodTakeHidden(s, 0);
  syncSeat(s);
  s.bloodGondor!.hidden[0].push(structuredClone(s.bloodGondor!.hidden[0][0]));
  assert.equal(validateSave(s), false);
});
test("Blood stage-two quest progress wins after active-location buffering", () => {
  const s = base();
  s.stage = 2;
  s.activeLocation = make(s, B.southern);
  progress(s, 18);
  flush(s);
  assert.equal(s.status, "playing");
  progress(s, 1);
  flush(s);
  check(s);
  assert.equal(s.status, "won");
});
test("Combat begins with the hidden-card decision, then Archery, then shadow dealing", () => {
  let s = base();
  s.phase = "encounter";
  s.staging = [make(s, B.woods)];
  s.encounterDeck = [B.uruk, B.southern];
  bloodTakeHidden(s, 0);
  s.queue = [fx("startCombat")];
  flush(s);
  assert.match(s.choice!.title, /Hidden/);
  assert.equal(s.phase, "defense");
  s = reload(s);
  s = choose(s, "turn");
  assert.match(s.choice!.title, /Archery/);
  assert.equal(s.engaged[0].shadows.length, 0);
  s = choose(s, s.heroes[0].id);
  assert.deepEqual(s.engaged[0].shadows, [B.southern]);
  assert.equal(s.phase, "defense");
});
test("Brutal Uruk turns hidden cards after completing its attack and newly engaged enemies still attack", () => {
  const s = base();
  s.phase = "defense";
  const u = make(s, B.uruk);
  s.engaged = [u];
  s.allies = [make(s, "01016")];
  s.encounterDeck = [B.uruk, B.southern, B.northern];
  bloodTakeHidden(s, 0);
  prepareEnemyShadows(s, u);
  beginEnemyAttack(s, u, [s.allies[0].id]);
  flush(s);
  assert.equal(s.combat, null);
  assert.equal(s.engaged.length, 2);
  assert.equal(s.engaged[0].attacked, true);
  assert.equal(s.engaged[1].attacked, false);
  assert.deepEqual(s.engaged[1].shadows, [B.northern]);
  assert.equal(s.phase, "defense");
  reload(s);
});
test("Mordor Looms turns hidden cards after a kill without the Uruk's extra shadow instruction", () => {
  const s = base();
  s.phase = "defense";
  const u = make(s, B.ambusher);
  s.engaged = [u];
  s.allies = [make(s, "01016")];
  s.encounterDeck = [B.uruk, B.looms, B.northern];
  bloodTakeHidden(s, 0);
  prepareEnemyShadows(s, u);
  beginEnemyAttack(s, u, [s.allies[0].id]);
  flush(s);
  assert.equal(s.engaged.length, 2);
  assert.equal(s.engaged[1].shadows.length, 0);
  assert.equal(s.encounterDeck[0], B.northern);
});
