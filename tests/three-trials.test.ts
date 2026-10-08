import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  createGame,
  validateSave,
  canTravel,
  playTargets,
  publicState,
} from "../src/game/engine.ts";
import { card, imageUrl, STARTERS, SCRIPTED } from "../src/game/cards.ts";
import {
  make,
  fx,
  get,
  stats,
  threatOf,
  stageInfo,
  locationQuest,
} from "../src/game/core.ts";
import {
  check,
  damage,
  destroy,
  discardCharacter,
  discardAttachment,
  progress,
  progressLocation,
  engage,
  revealed,
  placeEncounter,
} from "../src/game/board.ts";
import { flush, handle as effect } from "../src/game/effects.ts";
import {
  forOwner,
  seatView,
  playerOrder,
  syncSeat,
  allEngaged,
  allCharacters,
  ownerOf,
} from "../src/game/table.ts";
import {
  TRIALS as T,
  TRIAL_QUESTS,
  TRIAL_GUARDIANS,
  TRIAL_KEYS,
  TRIAL_BARROWS,
  THREE_TRIALS_ENCOUNTERS,
  THREE_TRIALS_QUESTS,
  THREE_TRIALS_RECIPES,
  guardianTimeLimit,
} from "../src/game/three-trials-support.ts";
import {
  trialsCheck,
  trialsShadow,
  trialsEncounter,
  trialsRemoveEnemyTime,
  trialsRemoveTime,
  trialsTimeOptions,
  trialsKeys,
} from "../src/game/three-trials.ts";
import { syncAttachmentText } from "../src/game/attachment-text.ts";
import { playerCardImmune } from "../src/game/card-immunity.ts";
import { playerAttack } from "../src/game/combat.ts";
import { automatedScenarioId } from "../src/game/support.ts";
import { FANGORN as F } from "../src/game/fangorn-support.ts";
import { base, choose, reload } from "./three-trials-fixtures.ts";
import type { GameState, Unit } from "../src/game/types.ts";
function settle(s: GameState, stopTrial = false) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 120, "choices terminate");
    if (stopTrial && s.choice.title === "Choose the next trial") break;
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
function attach(s: GameState, u: Unit, code: string) {
  const a = { id: `attached-${s.nextId++}`, code, exhausted: false };
  u.attachments.push(a);
  s.threeTrials!.setAside = s.threeTrials!.setAside.filter(
    (u) => u.code !== code,
  );
  return a;
}
function enemy(s: GameState, code = T.boar, player = 0) {
  let u: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    u.timeCounters = guardianTimeLimit(code);
    s.engaged.push(u);
  });
  s.threeTrials!.setAside = s.threeTrials!.setAside.filter(
    (u) => u.code !== code,
  );
  return u!;
}
function start(trial: string, players = 1) {
  let s = base(players);
  effect(s, fx("trialsStart", { code: trial }));
  return settle(s);
}
test("Three Trials imports exact 36/28 recipes, sixteen encounters, five quests and twenty-six local faces", () => {
  assert.equal(THREE_TRIALS_ENCOUNTERS.length, 16);
  assert.equal(THREE_TRIALS_QUESTS.length, 5);
  for (const r of THREE_TRIALS_RECIPES) {
    const rows = r.cards.filter((c) => c.section !== "sharedQuestDeck");
    assert.equal(
      rows.reduce((n, c) => n + c.quantity, 0),
      r.mode === "easy" ? 28 : 36,
    );
    for (const c of rows)
      assert.equal(
        r.mode === "easy" ? card(c.code).easy_quantity : card(c.code).quantity,
        c.quantity,
      );
  }
  let count = 0;
  for (const c of [...THREE_TRIALS_ENCOUNTERS, ...THREE_TRIALS_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code));
    assert.match(imageUrl(c), /^\/cards\//);
    count++;
    if (c.back_imagesrc) {
      assert.match(imageUrl({ ...c, imagesrc: c.back_imagesrc }), /^\/cards\//);
      count++;
    }
  }
  assert.equal(count, 26);
  for (const mode of ["standard", "easy"])
    assert.equal(
      automatedScenarioId({ name: "The Three Trials", mode }),
      "the-three-trials",
    );
  for (const mode of ["nightmare", "campaign"])
    assert.equal(automatedScenarioId({ name: "The Three Trials", mode }), null);
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    for (const trial of TRIAL_QUESTS)
      test(`Trials opening hands ${players} players / ${easy ? "easy" : "normal"} / ${card(trial).name}`, () => {
        const d = STARTERS[0];
        let s = createGame(21, d.cards, d.heroes, d.id, {
          scenarioId: "the-three-trials",
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
        assert.equal(s.encounterDeck.length, easy ? 18 : 26);
        assert.equal(s.threeTrials!.setAside.length, 10);
        assert.equal(s.choice, null);
        for (let p = 0; p < players; p++) {
          s = applyAction(reload(s), { type: "MULLIGAN" });
          assert.equal(allEngaged(s).length, 0);
          s = applyAction(reload(s), { type: "KEEP" });
        }
        assert.equal(s.choice!.title, "Choose the next trial");
        assert.equal(s.choice!.options.length, 3);
        s = choose(reload(s), trial);
        s = settle(s);
        assert.equal(s.phase, "resource");
        assert.equal(s.round, 1);
        assert.equal(s.stage, 2);
        assert.equal(s.threeTrials!.activeQuest, trial);
        assert.equal(s.threeTrials!.setAside.length, 7);
        assert.equal(allEngaged(s).length, 1);
        const g = allEngaged(s)[0],
          barrow = s.staging.find((u) => TRIAL_BARROWS.includes(u.code))!;
        assert.ok(barrow);
        assert.equal(g.timeCounters, guardianTimeLimit(g.code));
        assert.equal(ownerOf(s, g), 0);
        assert.equal(
          s.threeTrials!.currentKey,
          TRIAL_KEYS[TRIAL_GUARDIANS.indexOf(g.code)],
        );
        if (trial === T.strength)
          assert.equal(g.attachments[0].code, s.threeTrials!.currentKey);
        else if (trial === T.perseverance)
          assert.equal(barrow.attachments[0].code, s.threeTrials!.currentKey);
        else {
          assert.ok(
            s.encounterDeck.slice(-11).includes(s.threeTrials!.currentKey!),
          );
          assert.equal(
            s.encounterDeck.filter((c) => c === s.threeTrials!.currentKey)
              .length,
            1,
          );
        }
        assert.match(stageInfo(s).questImage!, /^\/cards\/.+\.B\.jpg$/);
        reload(s);
      });
test("Seeded random trial pairs and buried key order survive identical saved setup", () => {
  for (const trial of TRIAL_QUESTS)
    assert.deepEqual(start(trial), start(trial));
});
const orders = TRIAL_QUESTS.flatMap((a) =>
  TRIAL_QUESTS.filter((b) => b !== a).map((b) => [
    a,
    b,
    TRIAL_QUESTS.find((c) => c !== a && c !== b)!,
  ]),
);
for (const order of orders)
  test(`All trials can be completed once in order ${order.map((c) => card(c).name.replace("The Trial of ", "")).join(" / ")}`, () => {
    let s = base();
    for (const [i, trial] of order.entries()) {
      if (s.choice) s = choose(reload(s), trial);
      else effect(s, fx("trialsStart", { code: trial }));
      s = settle(s);
      const key = s.threeTrials!.currentKey!,
        g = allEngaged(s).find((u) =>
          u.attachments.some((a) => a.code === key),
        ),
        l = s.staging.find((u) => u.attachments.some((a) => a.code === key));
      if (trial === T.strength) {
        assert.ok(g);
        damage(s, g.id, 100);
      } else if (trial === T.perseverance) {
        assert.ok(l);
        progressLocation(s, l, locationQuest(s, l));
      } else {
        const index = s.encounterDeck.indexOf(key);
        assert.ok(index >= 0);
        progress(s, index + 1);
      }
      check(s);
      flush(s);
      assert.match(s.choice!.title, /Claim Key/);
      s = choose(reload(s), s.heroes[0].id);
      s = settle(s, true);
      assert.equal(s.threeTrials!.completed.length, i + 1);
      assert.equal(trialsKeys(s).length, i + 1);
      if (i < 2) {
        assert.equal(s.choice!.options.length, 2 - i);
        assert.ok(
          s.choice!.options.every(
            (o) => !s.threeTrials!.completed.includes(o.id),
          ),
        );
      }
    }
    assert.equal(s.stage, 3);
    assert.equal(s.threeTrials!.activeQuest, T.crown);
    assert.equal(allEngaged(s).length, 3);
    assert.equal(
      s.staging.some((u) => u.code === T.circle),
      true,
    );
    progress(s, 1);
    check(s);
    assert.equal(s.status, "playing");
    for (const g of [...allEngaged(s)]) damage(s, g.id, 100);
    s = settle(s);
    s.phase = "travel";
    const circle = s.staging.find((u) => u.code === T.circle)!;
    s = applyAction(reload(s), { type: "TRAVEL", id: circle.id });
    s = settle(s);
    assert.ok(trialsKeys(s).every((x) => x.key.exhausted));
    progress(s, 12);
    check(s);
    flush(s);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards!.includes(T.circle));
    reload(s);
  });
test("Strength Barrows reject player progress, attachments, travel and forced active-location effects", () => {
  const s = base(),
    l = make(s, T.hill);
  s.staging = [l];
  s.phase = "travel";
  syncAttachmentText(s);
  assert.ok(playerCardImmune(l));
  assert.match(canTravel(s, l)!, /Barrow/);
  effect(s, fx("locationProgress", { target: l.id, value: 6 }));
  assert.equal(l.progress, 0);
  effect(s, fx("travelEnter", { target: l.id }));
  assert.equal(s.activeLocation, null);
  const a = make(s, "01056");
  s.hand = [a];
  assert.equal(
    playTargets(s, a).some((u) => u.id === l.id),
    false,
  );
  s.threeTrials!.activeQuest = T.perseverance;
  syncAttachmentText(s);
  assert.equal(playerCardImmune(l), false);
  effect(s, fx("locationProgress", { target: l.id, value: 1 }));
  assert.equal(l.progress, 1);
});
test("Perseverance Guardians cannot take any damage or leave by destruction/discard, but quest effects can remove them", () => {
  let s = base(1, T.perseverance);
  const g = enemy(s);
  assert.equal(damage(s, g.id, 100), false);
  destroy(s, g);
  discardCharacter(s, g);
  assert.ok(get(s, g.id));
  g.damage = 100;
  check(s);
  assert.ok(get(s, g.id));
  g.damage = 0;
  s.threeTrials!.currentKey = T.boarKey;
  attach(s, s.heroes[0], T.boarKey);
  check(s);
  s = settle(s, true);
  assert.ok(s.victoryCards!.includes(T.boar));
  assert.equal(get(s, g.id), undefined);
});
test("Guardians reject non-Key attachments and Spirit of the Wild rejects all attachments", () => {
  const s = base(),
    g = enemy(s),
    spirit = make(s, T.spirit);
  s.engaged.push(spirit);
  const snare = make(s, "01069");
  s.hand = [snare];
  assert.ok(
    !playTargets(s, snare).some((u) => [g.id, spirit.id].includes(u.id)),
  );
  attach(s, g, snare.code);
  check(s);
  assert.equal(g.attachments.length, 0);
  assert.ok(s.discard.includes(snare.code));
});
test("Keys retain identity and mandatory first-player ownership when a hero leaves play", () => {
  let s = base(2);
  const a = attach(s, s.heroes[0], T.boarKey);
  s.table!.first = 1;
  discardCharacter(s, s.heroes[0]);
  flush(s);
  assert.ok(
    s.choice!.options.every((o) =>
      o.effects.every((e) => e.player !== undefined),
    ),
  );
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
  const hero = seatView(s, 1).heroes[1];
  s = choose(reload(s), hero.id);
  assert.equal(get(s, hero.id)!.attachments[0].id, a.id);
  assert.equal(s.encounterDiscard.includes(T.boarKey), false);
});
test("Discard-pile Keys are recovered before encounter reshuffle and claimed without exhausting their hero", () => {
  let s = base();
  s.encounterDiscard = [T.wolfKey, T.ravenKey];
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(trialsKeys(s).length, 2);
  assert.equal(s.heroes[0].exhausted, false);
  assert.ok(!s.encounterDiscard.some((c) => TRIAL_KEYS.includes(c)));
  reload(s);
});
test("Stage two Guardians follow first player; final Guardians follow matching Key controllers", () => {
  const s = base(2),
    g = enemy(s, T.boar);
  s.table!.first = 1;
  check(s);
  assert.equal(ownerOf(s, g), 1);
  attach(s, seatView(s, 0).heroes[0], T.boarKey);
  s.stage = 3;
  s.threeTrials!.activeQuest = T.crown;
  check(s);
  assert.equal(ownerOf(s, g), 0);
});
test("Cave Barrow caps allies across the table and lets the first player choose each discard", () => {
  let s = base(2);
  s.staging = [make(s, T.cave)];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies = Array.from({ length: 4 }, () => make(s, "01013"));
    });
  s.table!.first = 1;
  check(s);
  flush(s);
  assert.ok(
    s.choice!.options.every((o) =>
      o.effects.every((e) => e.player !== undefined),
    ),
  );
  assert.equal(s.choice!.options.length, 8);
  s = settle(s);
  assert.equal(
    allCharacters(s).filter((u) => card(u.code).type_code === "ally").length,
    5,
  );
  reload(s);
});
test("Guardian reveal initializes Time, direct addition does not", () => {
  let s = base();
  placeEncounter(s, T.raven, false, 0, undefined, true);
  check(s);
  s = settle(s);
  assert.equal(allEngaged(s)[0].timeCounters, 4);
  s = base();
  placeEncounter(s, T.wolf);
  check(s);
  s = settle(s);
  assert.equal(allEngaged(s)[0].timeCounters, 0);
});
test("Boar Time expiry discards an ally controlled by its engaged player before resetting", () => {
  let s = base(2);
  s.table!.first = 1;
  const g = enemy(s, T.boar, 1);
  g.timeCounters = 1;
  forOwner(s, 1, () => (s.allies = [make(s, "01013"), make(s, "01014")]));
  s.allies = [make(s, "01013")];
  trialsRemoveEnemyTime(s);
  flush(s);
  assert.equal(get(s, g.id)!.timeCounters, 0);
  assert.ok(
    s.choice!.options.every((o) =>
      o.effects.every((e) => e.player !== undefined),
    ),
  );
  const discarded = s.choice!.options[1].id;
  s = choose(reload(s), discarded);
  s = settle(s);
  assert.equal(get(s, g.id)!.timeCounters, 2);
  assert.equal(seatView(s, 0).allies.length, 1);
  assert.equal(seatView(s, 1).allies.length, 1);
});
test("Raven Time expiry damages only its engaged player and resets after damage", () => {
  let s = base(2);
  s.table!.first = 1;
  const g = enemy(s, T.raven, 1);
  g.timeCounters = 1;
  trialsRemoveEnemyTime(s);
  s = settle(s);
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 1));
  assert.equal(get(s, g.id)!.timeCounters, 4);
});
test("Wolf Time expiry makes a full immediate attack before resetting", () => {
  let s = base();
  const g = enemy(s, T.wolf);
  g.timeCounters = 1;
  s.encounterDeck = [T.circle];
  trialsRemoveEnemyTime(s);
  flush(s);
  assert.equal(g.timeCounters, 0);
  assert.match(s.choice!.title, /Immediate attack/i);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 3);
  assert.equal(get(s, g.id)!.timeCounters, 3);
  assert.equal(s.combat, null);
});
test("Wild Tenacity removes player-count Time simultaneously, clamps at zero, and orders expiry effects", () => {
  let s = base(2);
  const boar = enemy(s, T.boar),
    raven = enemy(s, T.raven);
  boar.timeCounters = 1;
  raven.timeCounters = 2;
  trialsEncounter(s, T.tenacity);
  flush(s);
  assert.equal(boar.timeCounters, 0);
  assert.equal(raven.timeCounters, 0);
  assert.equal(s.choice!.options.length, 2);
  s = settle(s);
  assert.equal(get(s, boar.id)!.timeCounters, 2);
  assert.equal(get(s, raven.id)!.timeCounters, 4);
  assert.equal(s.heroes[0].damage, 1);
});
test("Already-empty or blanked Time enemies do not repeatedly trigger deadlines", () => {
  const s = base(),
    g = enemy(s);
  g.timeCounters = 0;
  assert.deepEqual(trialsRemoveTime(s, g, 3), []);
  g.timeCounters = 1;
  g.blanked = true;
  assert.deepEqual(trialsRemoveTime(s, g, 3), []);
  assert.equal(trialsTimeOptions(s).length, 0);
});
test("Guardian Fury returns a defeated Guardian without Time because it adds rather than reveals", () => {
  let s = base();
  s.victoryCards = [T.wolf];
  s.victory = 3;
  trialsEncounter(s, T.fury);
  s = settle(s);
  assert.equal(allEngaged(s)[0].code, T.wolf);
  assert.equal(allEngaged(s)[0].timeCounters, 0);
  assert.equal(s.victory, 0);
});
test("Spirit stats and key shadows count controlled keys across all players", () => {
  const s = base(2);
  attach(s, s.heroes[0], T.boarKey);
  attach(s, seatView(s, 1).heroes[0], T.wolfKey);
  const g = enemy(s, T.spirit);
  assert.equal(stats(s, g).attack, 3);
  assert.equal(threatOf(s, g), 3);
  s.combat = { enemyId: g.id, attackBonus: 0 };
  trialsShadow(s, T.spirit);
  trialsShadow(s, T.curse);
  assert.equal(s.combat.attackBonus, 4);
});
test("Key shadow removes its physical shadow before shuffling it back, preserving other shadow cards", () => {
  let s = base();
  const g = enemy(s);
  g.shadows = [T.wolfKey, T.circle];
  s.combat = { enemyId: g.id, attackBonus: 0 };
  trialsShadow(s, T.wolfKey);
  assert.deepEqual(g.shadows, [T.circle]);
  assert.equal(s.encounterDeck.filter((c) => c === T.wolfKey).length, 1);
  s = reload(s);
  assert.equal(s.combat!.attackBonus, 0);
});
test("Wild Tenacity resolves both added shadow cards during the current Guardian attack", () => {
  let s = base();
  const g = enemy(s, T.raven);
  attach(s, s.heroes[0], T.boarKey);
  s.encounterDeck = [T.tenacity, T.spirit, T.curse];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 3);
  assert.equal(s.combat, null);
  assert.equal(s.encounterDiscard.length, 3);
});
test("Hill Barrow deals an additional shadow before defender declaration", () => {
  let s = base();
  s.staging = [make(s, T.hill)];
  const g = enemy(s, T.raven);
  attach(s, s.heroes[0], T.boarKey);
  s.encounterDeck = [T.circle, T.spirit];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  assert.equal(g.shadows.length, 2);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 2);
});
test("Stone Barrow raises every player threat after a Guardian attack", () => {
  let s = base(2);
  s.staging = [make(s, T.stone)];
  const g = enemy(s, T.raven);
  s.encounterDeck = [T.circle];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 23);
});
test("Cursed Forest shadow triggers only after actual attack destruction and can expire another Guardian", () => {
  let s = base();
  const g = enemy(s, T.raven),
    b = enemy(s, T.boar);
  b.timeCounters = 1;
  s.allies = [make(s, "01013")];
  s.encounterDeck = [T.forest];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  s = choose(reload(s), s.allies[0].id);
  assert.match(s.choice!.title, /lose a time/);
  s = choose(reload(s), `time:${b.id}`);
  s = settle(s);
  assert.equal(s.allies.length, 0);
  assert.equal(get(s, b.id)!.timeCounters, 2);
});
test("Grim Foothills absorbs quest progress before active location and Intuition mill", () => {
  let s = base(1, T.intuition);
  const hill = make(s, T.foothills),
    active = make(s, T.forest);
  s.staging = [hill];
  s.activeLocation = active;
  s.encounterDeck = Array(10).fill(T.circle);
  progress(s, 8);
  s = settle(s);
  assert.equal(s.staging.length, 0);
  assert.equal(s.activeLocation, null);
  assert.equal(s.encounterDeck.length, 8);
  assert.equal(s.progress, 0);
});
test("Multiple Grim Foothills allow first-player ordering before direct active-location progress", () => {
  let s = base(2, T.intuition);
  const a = make(s, T.foothills),
    b = make(s, T.foothills),
    active = make(s, T.forest);
  s.staging = [a, b];
  s.activeLocation = active;
  progressLocation(s, active, 5);
  assert.equal(s.choice!.options.length, 2);
  s = choose(reload(s), b.id);
  s = settle(s);
  assert.equal(s.staging.length, 1);
  assert.equal(s.staging[0].id, a.id);
  assert.equal(s.staging[0].progress, 2);
  assert.equal(s.activeLocation!.progress, 0);
});
test("Grim Foothills does not redirect quest progress when there is no active location", () => {
  let s = base(1, T.intuition);
  const hill = make(s, T.foothills);
  s.staging = [hill];
  const n = s.encounterDeck.length;
  progress(s, 5);
  s = settle(s);
  assert.equal(get(s, hill.id)!.progress, 0);
  assert.equal(s.encounterDeck.length, n - 5);
});
test("Intuition stops milling when its deck is empty and does not recycle the discard pile", () => {
  let s = base(1, T.intuition);
  s.encounterDeck = [T.forest, T.circle];
  s.encounterDiscard = [T.foothills];
  progress(s, 20);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.encounterDiscard.length, 3);
  assert.equal(s.progress, 0);
});
test("Cursed Forest travel searches a Spirit, obeys Tangled Woods and shuffles the deck", () => {
  let s = base(1, T.intuition);
  s.phase = "travel";
  const l = make(s, T.forest);
  s.staging = [l, make(s, F.tangled)];
  s.encounterDeck = [T.spirit, ...Array(10).fill(T.circle)];
  assert.equal(canTravel(s, l), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, l.id);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(s.staging.filter((u) => u.code === T.spirit).length, 1);
  assert.equal(s.encounterDeck.includes(T.spirit), false);
});
test("Cursed Forest travel cannot be paid without an available Spirit", () => {
  const s = base();
  s.phase = "travel";
  const l = make(s, T.forest);
  s.staging = [l];
  assert.match(canTravel(s, l)!, /Spirit/);
});
test("Circle travel exhausts keys, not heroes, and requires all three keys to be ready", () => {
  let s = base();
  s.stage = 3;
  s.threeTrials!.activeQuest = T.crown;
  s.phase = "travel";
  for (const code of TRIAL_KEYS) attach(s, s.heroes[0], code);
  const l = make(s, T.circle);
  s.staging = [l];
  assert.equal(canTravel(s, l), null);
  s.heroes[0].attachments[0].exhausted = true;
  assert.match(canTravel(s, l)!, /ready/);
  s.heroes[0].attachments[0].exhausted = false;
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = settle(s);
  assert.ok(trialsKeys(s).every((x) => x.key.exhausted));
  assert.equal(s.heroes[0].exhausted, false);
});
test("Curse damages nonunique characters only and surges only after all three keys are held", () => {
  let s = base();
  s.allies = [make(s, "01013"), make(s, "01073")];
  s.encounterDeck = [T.foothills];
  trialsEncounter(s, T.curse);
  s = settle(s);
  assert.equal(s.allies[0].damage, 1);
  assert.equal(s.allies[1].damage, 0);
  assert.ok(s.heroes.every((h) => h.damage === 0));
  assert.equal(s.encounterDeck.length, 1);
  for (const code of TRIAL_KEYS) attach(s, s.heroes[0], code);
  trialsEncounter(s, T.curse);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 0);
  assert.equal(s.threat, 22);
});
test("Save validation rejects forged trial state, duplicate aside identities and invalid Guardian Time", () => {
  const original = base();
  for (const change of [
    (s: GameState) => {
      s.threeTrials!.completed = [T.strength, T.strength];
    },
    (s: GameState) => {
      s.threeTrials!.activeQuest = T.crown;
    },
    (s: GameState) => {
      s.threeTrials!.setAside[1].id = s.threeTrials!.setAside[0].id;
    },
    (s: GameState) => {
      s.threeTrials!.setAside[0].timeCounters = 99;
    },
    (s: GameState) => {
      s.threeTrials!.setAside[0].timeCounters = -1;
    },
  ]) {
    const s = structuredClone(original);
    change(s);
    assert.equal(validateSave(s), false);
  }
  assert.ok(validateSave(original));
});
test("Public state exposes current trial, completed trials, held keys and enemy Time without hidden aside cards", () => {
  const s = base(),
    g = enemy(s);
  attach(s, s.heroes[0], T.boarKey);
  const p = publicState(s);
  assert.equal(p.currentTrial, T.strength);
  assert.equal(p.keysHeld![0].hero, s.heroes[0].id);
  assert.deepEqual(p.enemyTime, [{ id: g.id, code: T.boar, time: 2 }]);
  assert.equal("setAside" in p, false);
});
test("Warden of Arnor cannot place pre-entry progress on a Strength Barrow", () => {
  let s = base();
  s.heroes[0].committed = true;
  attach(s, s.heroes[0], "08031");
  revealed(s, T.hill);
  s = settle(s);
  const l = s.staging.find((u) => u.code === T.hill)!;
  assert.equal(l.progress, 0);
  assert.ok(playerCardImmune(l));
});
test("Perseverance permits declaring attacks but prevents their damage", () => {
  let s = base(1, T.perseverance);
  s.phase = "attack";
  const g = enemy(s);
  s.heroes[0].tempAttack = 30;
  playerAttack(s, g, [s.heroes[0].id]);
  s = settle(s);
  assert.ok(s.heroes[0].exhausted);
  assert.equal(get(s, g.id)!.damage, 0);
});
test("Shared Turned Around offers individual enemy Time and active-location return", () => {
  let s = base();
  const g = enemy(s, T.wolf);
  s.activeLocation = make(s, T.forest);
  effect(s, fx("fangornTurned"));
  assert.ok(s.choice!.options.some((o) => o.id === "location"));
  assert.ok(s.choice!.options.some((o) => o.id === `time:${g.id}`));
  s = choose(reload(s), `time:${g.id}`);
  assert.equal(get(s, g.id)!.timeCounters, 2);
  assert.equal(s.activeLocation!.code, T.forest);
});
test("Canceling Curse When Revealed prevents its conditional surge even with three controlled Keys", () => {
  let s = base();
  for (const code of TRIAL_KEYS) attach(s, s.heroes[0], code);
  s.allies = [make(s, "01013")];
  s.encounterDeck = [T.foothills];
  placeEncounter(s, T.curse, true);
  s = settle(s);
  assert.equal(s.allies[0].damage, 0);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.threat, 20);
});
test("A Key shuffled away as an added shadow does not skip the following physical shadow", () => {
  let s = base();
  const g = enemy(s, T.raven);
  attach(s, s.heroes[0], T.boarKey);
  s.encounterDeck = [T.tenacity, T.wolfKey, T.spirit];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  s = choose(reload(s), s.heroes[0].id);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.encounterDeck.filter((c) => c === T.wolfKey).length, 1);
  assert.ok(!s.encounterDiscard.includes(T.wolfKey));
});
test("Guardian Fury shadow causes a second fresh-shadow attack after the first completes", () => {
  let s = base();
  const g = enemy(s, T.raven);
  s.allies = [make(s, "01013"), make(s, "01013")];
  s.encounterDeck = [T.fury, T.circle];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  s = choose(reload(s), s.allies[0].id);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(reload(s), s.allies[0].id);
  s = settle(s);
  assert.equal(s.allies.length, 0);
  assert.equal(s.combat, null);
  assert.equal(s.encounterDiscard.length, 2);
});
test("Hill Barrow shadows retain Silver Lamp face-up visibility before defender selection", () => {
  const s = base();
  s.staging = [make(s, T.hill)];
  const g = enemy(s, T.raven);
  attach(s, s.heroes[0], "07009");
  s.encounterDeck = [T.circle, T.forest];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  assert.equal(g.shadows.length, 2);
  assert.deepEqual(g.faceupShadows, [true, true]);
});
test("Stone Barrow still raises threat when the attacking Guardian dies to a defender response", () => {
  let s = base();
  s.staging = [make(s, T.stone)];
  const g = enemy(s, T.raven);
  g.damage = 7;
  s.allies = [make(s, "01029")];
  s.encounterDeck = [T.circle];
  effect(s, fx("immediateAttack", { target: g.id }));
  flush(s);
  s = choose(reload(s), s.allies[0].id);
  s = settle(s);
  assert.equal(get(s, g.id), undefined);
  assert.equal(s.threat, 23);
  assert.equal(s.allies[0].damage, 0);
});
