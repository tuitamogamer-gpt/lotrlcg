import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, prepend, stats } from "../src/game/core";
import {
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  progress,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  selectSeat,
} from "../src/game/table";
import { isShipObjective } from "../src/game/ships";
import { sailingSymbols } from "../src/game/sailing";
import {
  CITY as C,
  CITY_CORSAIRS,
  CITY_ENCOUNTERS,
  CITY_MAIN_QUESTS,
  CITY_RECIPES,
} from "../src/game/city-support";
import {
  cityCombatStart,
  cityDamageAmount,
  cityEffect,
  cityImmuneToEvents,
  cityIndestructible,
  cityPublicState,
  cityResourcesBegin,
  cityRoundEnd,
  cityNormalAttackPending,
  cityNormalAttackMarked,
} from "../src/game/city";
import { base, start, choose, reload, settle, setStage } from "./city-fixtures";
import type { GameState } from "../src/game/types";
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`City original ${players}p ${easy ? "easy" : "standard"} setup prepares two encounter decks and the original fleet`, () => {
      const s = reload(start(players, easy));
      assert.equal(s.city!.currentQuest, C.coast);
      assert.equal(s.stage, 1);
      assert.equal(s.city!.secondDeck.length, easy ? 13 : 17);
      assert.equal(s.city!.corsairDeck.length, easy ? 6 : 10);
      assert.equal(
        s.encounterDeck.length,
        (easy ? 21 : 32) + (players < 3 ? 1 : 0),
      );
      assert.equal(
        s.staging.filter((u) => u.code === C.belfalas).length,
        players < 3 ? 1 : 2,
      );
      assert.equal(s.staging.filter((u) => u.code === C.stormcaller).length, 1);
      assert.equal(
        allCharacters(s).filter(isShipObjective).length,
        players === 1 ? 2 : players,
      );
      assert.ok(allCharacters(s).some((u) => u.code === C.dream));
      assert.equal(s.sailing!.heading, 0);
      assert.equal(card(C.stormcaller).health, 18);
    });
test("City public state reveals pile counts without hidden deck order or definitions", () => {
  const s = base(2),
    before = JSON.stringify(cityPublicState(s));
  s.city!.corsairDeck.reverse();
  s.city!.secondDeck.reverse();
  assert.equal(JSON.stringify(cityPublicState(s)), before);
  assert.ok(!before.includes("corsairDeck"));
});
test("City original sailing fronts use printed helm symbols", () => {
  assert.equal(sailingSymbols(C.belfalas), 1);
  assert.equal(sailingSymbols(C.waters), 1);
  for (const c of CITY_ENCOUNTERS.filter(
    (c) => c.pack_code === "CoC" && ![C.belfalas, C.waters].includes(c.code),
  ))
    assert.equal(sailingSymbols(c.code), 0, c.name);
});
test("The Coast of Umbar prevents all quest progress while off-course", () => {
  const s = base();
  s.sailing!.heading = 1;
  progress(s, 10);
  assert.equal(s.progress, 0);
  s.sailing!.heading = 0;
  progress(s, 10);
  assert.equal(s.progress, 10);
  assert.equal(s.stage, 1);
});
test("Stage one advances at 15 progress and preserves Watch Towers already in play", () => {
  let s = base();
  const watch = add(s, C.watch),
    ship = add(s, C.stormcaller);
  s.encounterDeck = [C.watch, C.battle, C.belfalas];
  s.encounterDiscard = [C.watch, C.battle];
  const corsairs = s.city!.corsairDeck.length;
  progress(s, 15);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.equal(s.city!.currentQuest, C.haven);
  assert.equal(s.sailing, undefined);
  assert.ok(s.staging.some((u) => u.id === watch.id));
  assert.ok(!s.staging.some((u) => u.id === ship.id));
  assert.equal(s.city!.corsairDeck.length, 0);
  assert.equal(s.city!.corsairDiscard.length, 0);
  assert.equal(s.city!.secondDeck.length, 0);
  assert.equal(
    s.city!.inactiveDeck.filter((c) => c === C.watch || c === C.battle).length,
    0,
  );
  assert.equal(
    s.city!.inactiveDiscard.filter((c) => c === C.watch || c === C.battle)
      .length,
    0,
  );
  assert.ok(s.city!.inactiveDiscard.includes(C.stormcaller));
  assert.equal(
    [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...allEngaged(s).map((u) => u.code),
    ].filter((c) => CITY_CORSAIRS.includes(c)).length,
    corsairs,
  );
  assert.ok(s.city!.setAside.some((u) => u.code === C.sahir));
  assert.ok(s.city!.setAside.some((u) => u.code === C.monument));
  reload(s);
});
test("Destroying the original 18-hit-point Stormcaller advances without quest progress", () => {
  let s = base();
  const storm = add(s, C.stormcaller);
  damage(s, storm.id, 17);
  assert.equal(s.stage, 1);
  assert.equal(storm.damage, 17);
  damage(s, storm.id, 1);
  check(s);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.equal(s.city!.stormcallerDestroyed, true);
  assert.equal(s.progress, 0);
  reload(s);
});
test("Discarding Stormcaller does not qualify as destroying it", () => {
  const s = base();
  const storm = add(s, C.stormcaller);
  destroy(s, storm, false);
  check(s);
  assert.equal(s.city!.stormcallerDestroyed, false);
  assert.equal(s.stage, 1);
});
test("Fate assigns combined damage from every owned ship only to non-Ships before discarding the fleet", () => {
  let s = base(2);
  const owned = allCharacters(s).filter(
    (u) => isShipObjective(u) && ownerOf(s, u) === 0,
  );
  owned[0].damage = 2;
  s.progress = 15;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.ok(s.choice?.title.includes("Assign 2 damage"));
  assert.ok(
    s.choice!.options.every(
      (o) =>
        !allCharacters(s)
          .filter(isShipObjective)
          .some((u) => u.id === o.id),
    ),
  );
  reload(s);
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  s = choose(s, hero.id);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.equal(allCharacters(s).filter(isShipObjective).length, 0);
  assert.equal(s.heroes.find((u) => u.id === hero.id)?.damage, 2);
  assert.equal(s.status, "playing");
  reload(s);
});
test("Fate discards every Ocean location while retaining Coastland-only locations and actual attachments destination", () => {
  let s = base();
  const ocean = add(s, C.belfalas),
    watch = add(s, C.watch);
  s.activeLocation = ocean;
  s.staging = s.staging.filter((u) => u.id !== ocean.id);
  s.progress = 15;
  advanceQuest(s);
  s = finish(s);
  assert.ok(s.city!.inactiveDiscard.includes(C.belfalas));
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === watch.id));
  assert.equal(s.status, "playing");
  reload(s);
});
test("Stormcaller escape adds exactly one resource to every Raider after all Haven searches", () => {
  for (const destroyed of [false, true]) {
    let s = base();
    s.city!.stormcallerDestroyed = destroyed;
    const raider = add(s, C.raider);
    raider.resources = 2;
    s.progress = 15;
    advanceQuest(s);
    s = finish(s);
    assert.equal(
      s.staging.find((u) => u.id === raider.id)?.resources,
      destroyed ? 2 : 3,
    );
  }
});
test("The Haven advances at 18 to physical set-aside Sahir and Monument, then adds one to every Raider", () => {
  let s = setStage(base(2), 3);
  const oldSahir = s.city!.setAside.find((u) => u.code === C.sahir)!;
  s.encounterDeck = [C.raider, C.infiltrator, ...s.encounterDeck];
  s.progress = 18;
  advanceQuest(s);
  s = finish(s);
  assert.equal(s.stage, 4);
  assert.equal(s.city!.currentQuest, C.final);
  const sahir = allEngaged(s).find((u) => u.code === C.sahir)!;
  assert.ok(sahir);
  assert.equal(sahir.id, oldSahir.id);
  assert.equal(ownerOf(s, sahir), 0);
  assert.ok(s.staging.some((u) => u.code === C.monument));
  assert.ok(
    [...s.staging, ...allEngaged(s)]
      .filter((u) => (card(u.code).traits ?? "").includes("Raider"))
      .every((u) => u.resources >= 1),
  );
  assert.equal(
    s.city!.setAside.filter((u) => [C.sahir, C.monument].includes(u.code))
      .length,
    0,
  );
  reload(s);
});
test("Final Confrontation has no progress victory", () => {
  const s = setStage(base(), 4);
  s.progress = 100;
  advanceQuest(s);
  check(s);
  assert.equal(s.status, "playing");
});
test("Sahir's own resources grant indestructibility and cancel one point of damage per resource", () => {
  const s = setStage(base(), 4),
    sahir = add(s, C.sahir);
  sahir.resources = 3;
  assert.equal(cityIndestructible(s, sahir), true);
  assert.equal(cityDamageAmount(s, sahir, 2), 0);
  assert.equal(sahir.resources, 1);
  assert.equal(cityDamageAmount(s, sahir, 3), 2);
  assert.equal(sahir.resources, 0);
  assert.equal(cityIndestructible(s, sahir), false);
});
test("Other enemy resources preserve Sahir at lethal damage until the last resource disappears", () => {
  const s = setStage(base(), 4),
    sahir = add(s, C.sahir),
    other = add(s, C.raider);
  other.resources = 1;
  damage(s, sahir.id, 8);
  check(s);
  assert.ok([...s.staging, ...allEngaged(s)].some((u) => u.id === sahir.id));
  assert.equal(s.status, "playing");
  other.resources = 0;
  check(s);
  assert.ok(![...s.staging, ...allEngaged(s)].some((u) => u.id === sahir.id));
  check(s);
  assert.equal(s.status, "won");
});
test("Actual destroyed hero and enemy resources transfer to Sahir, while discard does not", () => {
  const s = setStage(base(2), 4),
    sahir = add(s, C.sahir),
    raider = add(s, C.raider);
  raider.resources = 3;
  destroy(s, raider);
  assert.equal(sahir.resources, 3);
  const discard = add(s, C.raider);
  discard.resources = 5;
  destroy(s, discard, false);
  assert.equal(sahir.resources, 3);
  const hero = s.heroes[0];
  hero.resources = 4;
  destroy(s, hero);
  assert.equal(sahir.resources, 7);
  assert.equal(s.status, "playing");
});
test("Sahir follows the first player without changing physical identity", () => {
  const s = setStage(base(2), 4),
    sahir = add(s, C.sahir);
  engage(s, sahir);
  s.table!.first = 1;
  check(s);
  assert.equal(allEngaged(s).find((u) => u.id === sahir.id)?.code, C.sahir);
  assert.equal(
    ownerOf(
      s,
      allEngaged(s).find((u) => u.id === sahir.id)!,
    ),
    1,
  );
  assert.equal(
    [...s.staging, ...allEngaged(s)].filter((u) => u.id === sahir.id).length,
    1,
  );
  reload(s);
});
test("Sahir's additional combat attacks are based on complete groups of five resources", () => {
  const s = setStage(base(), 4),
    sahir = add(s, C.sahir);
  engage(s, sahir);
  for (const [resources, extra] of [
    [0, 0],
    [4, 0],
    [5, 1],
    [9, 1],
    [10, 2],
  ]) {
    sahir.resources = resources;
    assert.equal(
      cityCombatStart(s).length,
      0,
      "the printed passive queues no phase-start immediate attacks",
    );
    for (let n = 0; n <= extra; n++) {
      assert.equal(cityNormalAttackPending(s, sahir), true);
      cityNormalAttackMarked(s, sahir);
    }
    assert.equal(cityNormalAttackPending(s, sahir), false);
  }
});
test("Sahir's live attack budget allows normal enemy ordering, fresh shadows and saved resource changes between attacks", () => {
  let s = setStage(base(), 4);
  const sahir = add(s, C.sahir),
    other = add(s, C.infiltrator);
  engage(s, sahir);
  engage(s, other);
  flush(s);
  s = settle(s);
  s.phase = "defense";
  get(s, sahir.id)!.resources = 5;
  get(s, sahir.id)!.shadows = [C.slaver];
  get(s, other.id)!.shadows = [C.fury];
  s.encounterDeck = [C.city, C.fury, C.slaver];
  cityCombatStart(s);
  const victims = Array.from({ length: 4 }, () => make(s, "01016"));
  s.allies.push(...victims);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: other.id,
    defenderId: victims[0].id,
  });
  assert.equal(
    s.city!.sahirAttacks!.count,
    0,
    "another enemy can attack before Sahir",
  );
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: sahir.id,
    defenderId: victims[1].id,
  });
  assert.equal(s.city!.sahirAttacks!.count, 1);
  assert.equal(s.phase, "defense");
  get(s, sahir.id)!.resources = 10;
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: sahir.id,
    defenderId: victims[2].id,
  });
  assert.equal(s.city!.sahirAttacks!.count, 2);
  assert.equal(
    s.phase,
    "defense",
    "resource gain creates a third normal attack opportunity",
  );
  assert.ok(
    s.encounterDiscard.includes(C.slaver),
    "the initial shadow is discarded before the second attack",
  );
  assert.equal(get(s, sahir.id)!.shadows[0], C.city);
  // Remove resources between attacks: the entitlement changes immediately.
  get(s, sahir.id)!.resources = 4;
  assert.equal(cityNormalAttackPending(s, get(s, sahir.id)!), false);
  get(s, sahir.id)!.resources = 10;
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: sahir.id,
    defenderId: victims[3].id,
  });
  assert.equal(s.city!.sahirAttacks!.count, 3);
  assert.equal(s.phase, "attack");
  assert.ok(
    s.encounterDiscard.includes(C.city),
    "the second attack's shadow is discarded before the third",
  );
  reload(s);
});
test("Fate discards every shadow from surviving Corsairs before the new encounter deck becomes active", () => {
  let s = base(2);
  const survivor = add(s, C.slaver);
  forOwner(s, 1, () => engage(s, survivor));
  flush(s);
  s = settle(s);
  const physical = get(s, survivor.id)!;
  physical.shadows = [C.slave, C.belfalas, C.watch, C.battle];
  physical.faceupShadows = [true, false, false, false];
  physical.revealedShadowCount = 1;
  s.progress = 15;
  advanceQuest(s);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.deepEqual(get(s, survivor.id)!.shadows, []);
  assert.equal(get(s, survivor.id)!.faceupShadows, undefined);
  assert.ok(s.city!.inactiveDiscard.includes(C.slave));
  assert.ok(s.city!.inactiveDiscard.includes(C.belfalas));
  assert.ok(!s.city!.inactiveDiscard.includes(C.watch));
  assert.ok(!s.city!.inactiveDiscard.includes(C.battle));
  assert.ok(
    [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
    ].includes(C.watch),
  );
  assert.ok(
    [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
    ].includes(C.battle),
  );
  reload(s);
});
test("The Shattered Monument applies on its active face and protects only resourced Raiders from events", () => {
  const s = setStage(base(), 4),
    monument = add(s, C.monument),
    raider = add(s, C.raider);
  raider.resources = 1;
  assert.equal(cityImmuneToEvents(s, raider), true);
  raider.resources = 0;
  assert.equal(cityImmuneToEvents(s, raider), false);
  raider.resources = 1;
  s.staging = s.staging.filter((u) => u.id !== monument.id);
  s.activeLocation = monument;
  assert.equal(cityImmuneToEvents(s, raider), true);
  assert.equal(cityResourcesBegin(s).length, 1);
  cityEffect(s, cityResourcesBegin(s)[0]);
  assert.equal(raider.resources, 2);
});
test("An engaged Stormcaller resolves the original end-round choice without re-entering play", () => {
  let s = base(),
    storm = add(s, C.stormcaller);
  engage(s, storm);
  s = finish(s);
  const actual = allEngaged(s).find((u) => u.id === storm.id)!;
  prepend(s, ...cityRoundEnd(s));
  flush(s);
  assert.ok(s.choice?.title.includes("Stormcaller"));
  reload(s);
  s = choose(s, "staging");
  assert.ok(s.staging.some((u) => u.id === actual.id));
  assert.ok(!allEngaged(s).some((u) => u.id === actual.id));
  reload(s);
});
test("Destroying Dream-chaser at sea loses the game; printed transition discarding it is safe", () => {
  const s = base(),
    dream = allCharacters(s).find((u) => u.code === C.dream)!;
  damage(s, dream.id, stats(s, dream).health);
  check(s);
  assert.equal(s.status, "lost");
});
test("City save validation rejects impossible quest order, duplicates and invalid land-pile leftovers", () => {
  const s = base();
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  const wrong = structuredClone(s);
  wrong.city!.questDeck.reverse();
  assert.equal(validateSave(wrong), false);
  const duplicate = structuredClone(s);
  duplicate.city!.setAside.push(structuredClone(duplicate.allies[0]));
  assert.equal(validateSave(duplicate), false);
  const land = setStage(base(), 3);
  land.city!.corsairDeck.push(C.raider);
  assert.equal(validateSave(land), false);
  assert.deepEqual(CITY_MAIN_QUESTS, [C.coast, C.fate, C.haven, C.final]);
  assert.equal(CITY_RECIPES.length, 2);
});
