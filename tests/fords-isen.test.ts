import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  availableAbilities,
  canPlay,
  canTravel,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS } from "../src/game/cards.ts";
import {
  canGainResources,
  draw,
  fx,
  get,
  locationQuest,
  make,
  stats,
  threatOf,
} from "../src/game/core.ts";
import {
  check,
  damage,
  discardCharacter,
  discardHandCard,
  engage,
  enterAlly,
  nextRound,
  phaseEnd,
  progressLocation,
  revealed,
  shadow,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import { currentQuestUnit } from "../src/game/quest-state.ts";
import { forOwner, ownerOf, playerOrder, seatView } from "../src/game/table.ts";
import { fordsEncounter, fordsRemoveTime } from "../src/game/fords-isen.ts";
import {
  FORDS as F,
  FORDS_ISEN_ENCOUNTERS,
  FORDS_ISEN_QUESTS,
  FORDS_ISEN_RECIPES,
} from "../src/game/fords-isen-support.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import { base, choose, reload } from "./fords-isen-fixtures.ts";
import type { GameState } from "../src/game/types.ts";

const hand = (s: GameState, n: number) =>
  (s.hand = Array.from({ length: n }, () => make(s, "01022")));
function settle(s: GameState, limit = 150) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < limit, "choice chain terminates");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function readyStage(s: GameState, stage: number) {
  s.stage = stage;
  s.fordsIsen!.time = [5, 2, 3][stage - 1];
}

test("Fords imports all 19 printed designs and original/easy encounter quantities, with local artwork", () => {
  assert.equal(FORDS_ISEN_ENCOUNTERS.length, 16);
  assert.deepEqual(
    FORDS_ISEN_QUESTS.map((c) => c.back_quest),
    [6, 14, 16],
  );
  for (const r of FORDS_ISEN_RECIPES) {
    let total = 0;
    for (const row of r.cards.filter((c) => c.section !== "sharedQuestDeck")) {
      assert.equal(
        r.mode === "easy"
          ? card(row.code).easy_quantity
          : card(row.code).quantity,
        row.quantity,
      );
      total += row.quantity;
    }
    assert.equal(total, r.mode === "easy" ? 24 : 34);
  }
  assert.ok(
    FORDS_ISEN_ENCOUNTERS.every((c) => imageUrl(c).startsWith("/cards/")),
  );
  assert.equal(
    automatedScenarioId({ name: "Fords of Isen", mode: "standard" }),
    "fords-of-isen",
  );
  assert.equal(
    automatedScenarioId({
      name: "The Fords of Isen (Nightmare)",
      mode: "nightmare",
    }),
    null,
  );
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Fords setup: ${players} players / ${easy ? "easy" : "normal"} search for different enemies without revealing them`, () => {
      const d = STARTERS[0];
      let s = createGame(44, d.cards, d.heroes, d.id, {
        scenarioId: "fords-of-isen",
        easy,
        ...(players > 1
          ? {
              seats: STARTERS.slice(0, players).map((d) => ({
                deckId: d.id,
                heroes: [...d.heroes],
              })),
            }
          : {}),
      });
      const chosen: string[] = [];
      for (let p = 0; p < players; p++) {
        assert.match(s.choice!.title, /different Dunland/);
        assert.ok(s.choice!.options.every((o) => !chosen.includes(o.code!)));
        const option =
          s.choice!.options.find((o) => o.code === F.prowler) ??
          s.choice!.options[0];
        chosen.push(option.code!);
        s = choose(reload(s), option.id);
      }
      assert.equal(s.choice, null);
      assert.equal(s.staging.length, 2 + players);
      assert.equal(s.encounterDeck.length, (easy ? 24 : 34) - 2 - players);
      assert.equal(s.fordsIsen!.time, 5);
      assert.equal(
        s.staging.find((u) => u.code === F.islet)!.guarding,
        s.staging.find((u) => u.code === F.grima)!.id,
      );
      for (const p of playerOrder(s))
        assert.equal(seatView(s, p).hand.length, 6);
    });
test("The unique Gríma hero is prohibited in every fellowship", () => {
  const d = STARTERS[0];
  assert.throws(
    () =>
      createGame(9, d.cards, d.heroes, d.id, {
        scenarioId: "fords-of-isen",
        seats: [{ deckId: d.id, heroes: ["07002", "01002", "01007"] }],
      }),
    /Gríma is reserved/,
  );
});
test("The Islet guards Gríma until explored, contributes victory, and stage one requires his rescue", () => {
  const d = STARTERS[0];
  let s = createGame(3, d.cards, d.heroes, d.id, {
    scenarioId: "fords-of-isen",
  });
  s = choose(s, F.bandit);
  s = applyAction(s, { type: "KEEP" });
  s.progress = 6;
  check(s);
  assert.equal(s.stage, 1);
  const islet = s.staging.find((u) => u.code === F.islet)!;
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: islet.id });
  progressLocation(s, get(s, islet.id)!, 1);
  check(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.fordsIsen!.time, 2);
  assert.ok(s.allies.some((u) => u.code === F.grima));
  assert.ok(s.victoryCards!.includes(F.islet));
});
test("Rescued Gríma follows the first player without readying and offers his draw action to his controller", () => {
  let s = base(2);
  const g = s.allies[0];
  s = applyAction(s, { type: "ABILITY", id: g.id });
  assert.ok(get(s, g.id)!.exhausted);
  assert.equal(s.hand.length, 1);
  s.table!.first = 1;
  check(s);
  assert.equal(ownerOf(s, get(s, g.id)!), 1);
  assert.ok(get(s, g.id)!.exhausted);
  assert.equal(seatView(s, 1).allies[0].id, g.id);
  reload(s);
});
test("Losing Gríma or eliminating his controller immediately loses the quest", () => {
  for (const elimination of [false, true]) {
    const s = base(2);
    if (elimination) {
      s.threat = 50;
      check(s);
    } else discardCharacter(s, s.allies[0]);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /Gríma/);
  }
});
test("Time expires at the end of refresh after the action window, not at refresh start", () => {
  let s = base();
  s.phase = "refresh";
  s.fordsIsen!.time = 1;
  assert.equal(s.status, "playing");
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.equal(s.fordsIsen!.time, 0);
  assert.ok(s.encounterDiscard.includes(F.grima));
});
test("Stage one timeout discards guarded Gríma too, preserving encounter identity", () => {
  const d = STARTERS[0];
  let s = createGame(2, d.cards, d.heroes, d.id, {
    scenarioId: "fords-of-isen",
  });
  s = choose(s, F.bandit);
  s.phase = "refresh";
  s.fordsIsen!.time = 1;
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.ok(!s.staging.some((u) => u.code === F.grima));
  assert.equal(s.encounterDiscard.filter((c) => c === F.grima).length, 1);
  reload(s);
});
test("Stage two distributes each player's hand-size damage and restores two counters after saved choices", () => {
  let s = base(2);
  readyStage(s, 2);
  s.fordsIsen!.time = 1;
  hand(s, 2);
  forOwner(s, 1, () => hand(s, 3));
  fordsRemoveTime(s);
  flush(s);
  assert.equal(s.fordsIsen!.time, 0);
  s = reload(s);
  const h0 = s.heroes[0].id,
    h1 = seatView(s, 1).heroes[0].id;
  s = choose(s, `${h0}:2`);
  s = choose(reload(s), `${h1}:3`);
  assert.equal(get(s, h0)!.damage, 2);
  assert.equal(get(s, h1)!.damage, 3);
  assert.equal(s.fordsIsen!.time, 2);
  reload(s);
});
test("Stage three discards exactly X without reshuffling and adds enemies without their reveal effects", () => {
  const s = base();
  readyStage(s, 3);
  s.fordsIsen!.time = 1;
  hand(s, 4);
  s.encounterDeck = [F.tribesman, F.hatreds, F.prowler];
  s.encounterDiscard = [F.raider];
  fordsRemoveTime(s);
  flush(s);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [F.tribesman, F.prowler],
  );
  assert.deepEqual(s.encounterDeck, []);
  assert.equal(s.hand.length, 4);
  assert.deepEqual(s.encounterDiscard, [F.raider, F.hatreds]);
  assert.equal(s.fordsIsen!.time, 3);
});
test("Progress cannot defeat Hold the Fords until all staging and engaged enemies are gone", () => {
  const s = base();
  readyStage(s, 3);
  s.progress = 16;
  const enemy = make(s, F.bandit);
  s.engaged.push(enemy);
  check(s);
  assert.equal(s.status, "playing");
  damage(s, enemy.id, 4);
  flush(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Fords of Isen/);
});
test("Stage transitions discard physical quest Conditions and use fresh Time values", () => {
  let s = base();
  fordsEncounter(s, F.hatreds);
  fordsEncounter(s, F.wild);
  s.queue = [];
  assert.equal(currentQuestUnit(s)!.attachments.length, 2);
  s.progress = 6;
  check(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(currentQuestUnit(s)!.attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(F.hatreds));
  assert.ok(s.encounterDiscard.includes(F.wild));
});
test("Fords of Isen blocks card resource gains and transfers but preserves framework resource collection", () => {
  let s = base();
  s.staging = [make(s, F.fords)];
  const h = s.heroes[0],
    tree = make(s, "08146");
  s.allies.push(tree);
  h.attachments = [{ id: "steward", code: "01026", exhausted: false }];
  assert.equal(canGainResources(s, h), false);
  assert.equal(canGainResources(s, h, false), true);
  assert.throws(
    () =>
      applyAction(s, { type: "ABILITY", id: h.id, attachmentId: "steward" }),
    /cannot collect/,
  );
  const before = h.resources;
  nextRound(s);
  assert.equal(h.resources, before + 1);
  assert.equal(tree.resources, 0);
  s.staging = [];
  assert.equal(canGainResources(s, h), true);
});
test("Travel to Fords draws up to five, triggers draw effects once, and lifts its resource restriction", () => {
  let s = base();
  s.phase = "travel";
  hand(s, 2);
  const location = make(s, F.fords),
    tribe = make(s, F.tribesman);
  s.staging = [location, tribe];
  s = applyAction(s, { type: "TRAVEL", id: location.id });
  s = settle(s);
  assert.equal(s.hand.length, 5);
  assert.equal(threatOf(s, get(s, tribe.id)!), 1);
  assert.equal(canGainResources(s, s.heroes[0]), true);
});
test("King's Road hand thresholds inspect every player and constrain travel and skipping", () => {
  const s = base(2);
  s.phase = "travel";
  const road = make(s, F.road),
    other = make(s, F.islet);
  s.staging = [road, other];
  assert.equal(locationQuest(s, road), 2);
  forOwner(s, 1, () => hand(s, 3));
  assert.equal(locationQuest(s, road), 5);
  forOwner(s, 1, () => hand(s, 5));
  assert.match(canTravel(s, other)!, /King/);
  assert.equal(canTravel(s, road), null);
  assert.throws(() => applyAction(s, { type: "NEXT" }), /King/);
  road.blanked = true;
  assert.equal(canTravel(s, other), null);
  assert.equal(locationQuest(s, road), 2);
});
test("Shrinking the last large hand can explore King's Road without further progress", () => {
  const s = base();
  const road = make(s, F.road);
  road.progress = 2;
  s.activeLocation = road;
  hand(s, 3);
  check(s);
  assert.ok(s.activeLocation);
  discardHandCard(s, s.hand[0].id);
  check(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(F.road));
});
test("Gap attack bonuses stack only in staging; Islet threat applies only while active", () => {
  const s = base();
  const enemy = make(s, F.bandit);
  s.engaged = [enemy];
  hand(s, 2);
  s.staging = [make(s, F.gap), make(s, F.gap)];
  assert.equal(stats(s, enemy).attack, 5);
  s.activeLocation = make(s, F.islet);
  assert.equal(threatOf(s, enemy), 3);
  s.activeLocation = s.staging.shift()!;
  assert.equal(stats(s, enemy).attack, 4);
  assert.equal(threatOf(s, enemy), 2);
  s.engaged = [];
  s.staging.push(enemy);
  assert.equal(stats(s, enemy).attack, 2);
});
test("Dunland Prowler's surge and threat use global hand sizes, but added enemies do not surge", () => {
  let s = base(2);
  forOwner(s, 1, () => hand(s, 5));
  s.encounterDeck = [F.gap];
  revealed(s, F.prowler);
  s = settle(s);
  assert.equal(s.staging.length, 2);
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.code === F.prowler)!,
    ),
    2,
  );
  forOwner(s, 1, () => hand(s, 2));
  assert.equal(
    threatOf(
      s,
      s.staging.find((u) => u.code === F.prowler)!,
    ),
    1,
  );
});
test("Dunland Tribesman draws for all players and its bonuses last the round, not just the phase", () => {
  let s = base(2);
  revealed(s, F.tribesman);
  s = settle(s);
  const id = s.staging.find((u) => u.code === F.tribesman)!.id;
  assert.equal(s.hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(threatOf(s, get(s, id)!), 2);
  phaseEnd(s);
  assert.equal(threatOf(s, get(s, id)!), 2);
  forOwner(s, 0, () => draw(s, 3));
  s = settle(s);
  assert.equal(threatOf(s, get(s, id)!), 3);
  forOwner(s, 0, () => (s.deck = []));
  forOwner(s, 1, () => (s.deck = []));
  nextRound(s);
  assert.equal(threatOf(s, get(s, id)!), 0);
});
test("Prevented and empty-deck draws do not trigger Dunland effects", () => {
  const s = base();
  const tribe = make(s, F.tribesman);
  s.staging = [tribe];
  s.deck = [];
  draw(s, 3);
  flush(s);
  assert.equal(threatOf(s, tribe), 0);
  s.deck = ["01022"];
  s.activeLocation = make(s, "01095");
  draw(s, 1);
  flush(s);
  assert.equal(s.hand.length, 0);
  assert.equal(threatOf(s, tribe), 0);
});
test("Old Hatreds and Wild Men attach to the quest, stack per draw, and allow saved Forced ordering", () => {
  let s = base();
  fordsEncounter(s, F.hatreds);
  fordsEncounter(s, F.hatreds);
  fordsEncounter(s, F.wild);
  draw(s, 3);
  flush(s);
  assert.match(s.choice!.title, /next Forced/);
  s = settle(reload(s));
  assert.equal(s.threat, 22);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  assert.equal(currentQuestUnit(s)!.attachments.length, 3);
});
test("Power of Orthanc can discard a Condition attached to the current quest", () => {
  let s = base();
  fordsEncounter(s, F.hatreds);
  s.hand = [make(s, "07014")];
  const event = s.hand[0];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.ok(s.choice!.options.some((o) => o.code === F.hatreds));
  s = choose(s, s.choice!.options.find((o) => o.code === F.hatreds)!.id);
  assert.equal(currentQuestUnit(s)!.attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(F.hatreds));
});
test("Ill Tidings is drawn by the first player, counts toward surge, and cannot be played or discarded", () => {
  let s = base(2);
  s.table!.first = 1;
  forOwner(s, 1, () => hand(s, 4));
  s.encounterDeck = [F.gap];
  revealed(s, F.tidings);
  s = settle(s);
  const owner = seatView(s, 1),
    ill = owner.hand.find((u) => u.code === F.tidings)!;
  assert.equal(owner.hand.length, 5);
  assert.ok(s.staging.some((u) => u.code === F.gap));
  forOwner(s, 1, () => {
    assert.match(canPlay(s, ill)!, /cannot leave/);
    discardHandCard(s, ill.id);
  });
  assert.ok(seatView(s, 1).hand.some((u) => u.id === ill.id));
  reload(s);
});
test("Ill Tidings' draw triggers Dunland reactions without drawing from the player's deck", () => {
  let s = base();
  s.deck = [];
  s.staging = [make(s, F.tribesman)];
  fordsEncounter(s, F.hatreds);
  revealed(s, F.tidings);
  s = settle(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.threat, 21);
  assert.equal(threatOf(s, s.staging[0]), 1);
});
test("Ill Tidings cannot pay Éowyn, Protector, Erestor, Gildor exchange or Message costs", () => {
  let s = base(2);
  const ill = make(s, F.tidings);
  s.hand = [ill];
  s.heroes.push(make(s, "01007"));
  const eowyn = s.heroes.at(-1)!;
  assert.equal(availableAbilities(s, eowyn)[0].disabled, true);
  assert.throws(
    () => applyAction(s, { type: "ABILITY", id: eowyn.id }),
    /requires a card/,
  );
  s.heroes[0].attachments = [
    { id: "protect", code: "01070", exhausted: false },
  ];
  assert.throws(
    () =>
      applyAction(s, {
        type: "ABILITY",
        id: s.heroes[0].id,
        attachmentId: "protect",
      }),
    /requires a card/,
  );
  effect(s, fx("ringMessageCard"));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["skip"],
  );
  s.choice = null;
  const erestor = make(s, "04077");
  s.allies.push(erestor);
  assert.equal(availableAbilities(s, erestor)[0].disabled, true);
  effect(s, fx("emynGildorHand", { value: 0, count: 2 }));
  assert.ok(!s.choice?.options.some((o) => o.id === ill.id));
  assert.ok(s.hand.some((u) => u.id === ill.id));
});
test("Pillaging and Burning draws first, then raises every player's threat by their own hand size", () => {
  let s = base(2);
  hand(s, 2);
  forOwner(s, 1, () => hand(s, 4));
  revealed(s, F.pillaging);
  s = settle(s);
  assert.equal(s.threat, 23);
  assert.equal(seatView(s, 1).threat, 25);
});
test("Down From The Hills cannot be canceled if any player has five cards, and offers independent choices", () => {
  let s = base(2);
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  forOwner(s, 1, () => hand(s, 5));
  s.encounterDeck = [F.bandit];
  revealed(s, F.hills);
  flush(s);
  assert.equal(s.choice!.title, "Down From The Hills");
  s = choose(reload(s), "time");
  assert.ok(
    s.choice!.options.every((o) => !o.code),
    "the deck remains private before choosing to search",
  );
  s = choose(reload(s), "search");
  s = choose(reload(s), F.bandit);
  assert.equal(s.fordsIsen!.time, 4);
  assert.ok(s.staging.some((u) => u.code === F.bandit));
  assert.ok(s.hand.some((u) => u.code === "01050"));
});
test("Canceling Down From The Hills is legal below the hand threshold", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  revealed(s, F.hills);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "cancel"));
  s = choose(s, "cancel");
  assert.equal(s.fordsIsen!.time, 5);
  assert.equal(s.choice, null);
});
test("Dunland Raider divides damage among the engaged player's characters only", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    hand(s, 3);
    engage(s, make(s, F.raider));
  });
  flush(s);
  const h = seatView(s, 1).heroes[0];
  assert.ok(
    s.choice!.options.every(
      (o) =>
        o.id.startsWith(h.id) ||
        seatView(s, 1).heroes.some((h) => o.id.startsWith(h.id)),
    ),
  );
  s = choose(reload(s), `${h.id}:3`);
  assert.equal(get(s, h.id)!.damage, 3);
  assert.equal(s.heroes[0].damage, 0);
});
test("Dunland Chieftain engages the topmost Dunland discard and invokes its engagement, not reveal effect", () => {
  let s = base();
  hand(s, 3);
  s.encounterDeck = [F.tribesman, F.gap, F.raider];
  engage(s, make(s, F.chieftain));
  flush(s);
  assert.ok(s.engaged.some((u) => u.code === F.raider));
  assert.equal(s.hand.length, 3);
  assert.match(s.choice!.title, /Dunland Raider/);
  s = choose(s, `${s.heroes[0].id}:3`);
  assert.ok(s.encounterDiscard.includes(F.tribesman));
  assert.ok(!s.encounterDiscard.includes(F.raider));
  reload(s);
});
test("Dunland Berserker attacks once for drawing multiple cards, suspending and restoring an existing combat", () => {
  let s = base();
  const berserker = make(s, F.berserker),
    outer = make(s, F.bandit);
  s.engaged = [berserker, outer];
  s.encounterDeck = [F.road];
  s.combat = { enemyId: outer.id, defenderId: s.heroes[1].id, attackBonus: 7 };
  const outerCombat = structuredClone(s.combat);
  draw(s, 3);
  flush(s);
  assert.equal(s.combat!.enemyId, berserker.id);
  assert.equal(s.suspendedCombats.length, 1);
  assert.match(s.choice!.title, /defend|attack/i);
  s = reload(s);
  const option = s.choice!.options.find((o) => o.id === s.heroes[0].id)!;
  assert.ok(option);
  s = choose(s, option.id);
  s = settle(s);
  assert.deepEqual(s.combat, outerCombat);
  assert.equal(s.suspendedCombats.length, 0);
  assert.equal(s.hand.length, 3);
});
test("Dunland Berserker reacts only to its engaged player and respects blanking", () => {
  const s = base(2);
  const b = make(s, F.berserker);
  s.engaged = [b];
  forOwner(s, 1, () => draw(s, 1));
  assert.equal(s.queue.length, 0);
  b.blanked = true;
  draw(s, 1);
  assert.equal(s.queue.length, 0);
});
test("Gap shadow consumes one time counter only when this attack actually destroys a character", () => {
  const s = base();
  const enemy = make(s, F.bandit);
  s.engaged = [enemy];
  s.combat = { enemyId: enemy.id, defenderId: s.heroes[0].id, attackBonus: 0 };
  shadow(s, F.gap);
  assert.equal(s.combat.attackBonus, 1);
  damage(s, s.heroes[0].id, 1, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(s.fordsIsen!.time, 5);
  damage(s, s.heroes[0].id, 99, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(s.fordsIsen!.time, 4);
});
test("Berserker shadow schedules an additional attack and all combat counters survive reload", () => {
  const s = base();
  const enemy = make(s, F.bandit);
  s.engaged = [enemy];
  s.combat = { enemyId: enemy.id, defenderId: s.heroes[0].id, attackBonus: 0 };
  shadow(s, F.berserker);
  shadow(s, F.berserker);
  shadow(s, F.gap);
  assert.equal(reload(s).combat!.fordsExtraAttacks, 2);
  assert.equal(reload(s).combat!.fordsTimeOnKill, 1);
});
test("Bandit shadow checks the defending player; Pillaging removes controlled attachments across the table", () => {
  let s = base(2);
  const enemy = make(s, F.bandit);
  s.engaged = [enemy];
  hand(s, 3);
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: null,
    attackBonus: 0,
  };
  shadow(s, F.bandit);
  assert.equal(s.combat.attackBonus, 2);
  forOwner(s, 1, () =>
    s.heroes[0].attachments.push({
      id: "borrowed-host",
      code: "01039",
      owner: 0,
      exhausted: false,
    }),
  );
  s.heroes[0].attachments = [{ id: "ours", code: "01026", exhausted: false }];
  shadow(s, F.pillaging);
  flush(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.equal(
    seatView(s, 1).heroes[0].attachments.length,
    1,
    "controller of the attached hero controls its attachment",
  );
});
test("Malformed Time, round-lasting threat and live/suspended shadow counters are rejected", () => {
  const s = base();
  const enemy = make(s, F.tribesman);
  s.staging = [enemy];
  for (const time of [-1, 6, 1.5, "2"]) {
    const bad = structuredClone(s);
    bad.fordsIsen!.time = time as number;
    assert.equal(validateSave(bad), false);
  }
  for (const value of [-1, 1.5, "1"]) {
    const bad = structuredClone(s);
    bad.staging[0].roundThreat = value as number;
    assert.equal(validateSave(bad), false);
  }
  const bad = structuredClone(s);
  bad.combat = {
    enemyId: enemy.id,
    defenderId: null,
    attackBonus: 0,
    fordsExtraAttacks: -1,
  };
  assert.equal(restoreSave(bad), null);
});

for (const code of ["01061", "142005"])
  test(`${card(code).name} removes physical quest Conditions`, () => {
    let s = base();
    fordsEncounter(s, F.wild);
    s.queue = [];
    enterAlly(s, make(s, code));
    flush(s);
    if (code === "142005") {
      s = choose(s, "use");
      s = choose(s, "condition");
    }
    const option = s.choice?.options.find((o) => o.code === F.wild);
    assert.ok(option, JSON.stringify(s.choice));
    s = choose(reload(s), option.id);
    assert.equal(currentQuestUnit(s)!.attachments.length, 0);
    assert.ok(s.encounterDiscard.includes(F.wild));
  });

test("Berserker's shadow resolves a real second attack with a fresh shadow, then returns to the combat phase", () => {
  let s = base();
  s.phase = "defense";
  const enemy = make(s, F.bandit);
  enemy.shadows = [F.berserker];
  s.engaged = [enemy];
  s.encounterDeck = [F.road];
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: s.heroes[0].id,
  });
  assert.equal(s.combat!.immediate, true);
  assert.deepEqual(get(s, enemy.id)!.shadows, [F.road]);
  s = choose(reload(s), s.heroes[1].id);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.equal(s.suspendedCombats.length, 0);
  assert.deepEqual(get(s, enemy.id)!.shadows, [F.berserker]);
  s = applyAction(s, { type: "END_ATTACKS" });
  assert.ok(s.encounterDiscard.includes(F.berserker));
});
test("A lethal Gap shadow can expire Time during combat and discard Gríma before the attack continues", () => {
  let s = base();
  s.phase = "defense";
  s.fordsIsen!.time = 1;
  const defender = make(s, "01016"),
    enemy = make(s, F.raider);
  s.allies.push(defender);
  enemy.shadows = [F.gap];
  s.engaged = [enemy];
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.equal(s.fordsIsen!.time, 0);
  assert.ok(s.encounterDiscard.includes(F.grima));
  reload(s);
});
test("Canceling Ill Tidings prevents both its hand entry and its conditional surge", () => {
  let s = base();
  hand(s, 4);
  s.hand.push(make(s, "01050"));
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.encounterDeck = [F.gap];
  revealed(s, F.tidings);
  flush(s);
  s = choose(s, "cancel");
  assert.ok(!s.hand.some((u) => u.code === F.tidings));
  assert.deepEqual(s.encounterDeck, [F.gap]);
  assert.ok(s.encounterDiscard.includes(F.tidings));
});
