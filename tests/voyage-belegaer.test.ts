import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card, SCRIPTED, imageUrl } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  engagementCost,
  stagingThreat,
} from "../src/game/core";
import { check, damage, destroy, engage, revealed } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import { mainQuestCode, mainQuestUnit } from "../src/game/quest-state";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import {
  beginSailingTest,
  sailingCandidates,
  sailingCommitCount,
  sailingContinue,
  sailingSymbols,
  shiftHeading,
} from "../src/game/sailing";
import {
  VOYAGE as V,
  VOYAGE_CORSAIRS,
  VOYAGE_ENCOUNTERS,
  VOYAGE_QUESTS,
  VOYAGE_RECIPES,
  VOYAGE_STAGE_TWO,
  validateVoyage,
} from "../src/game/voyage-belegaer-support";
import {
  voyageAfterAttack,
  voyageAttackStarted,
  voyageCanAttackEnemy,
  voyageCanCancelWhenRevealed,
  voyageCorsairDiscard,
  voyageDamageDealt,
  voyageDrawBonus,
  voyageEffect,
  voyageEndQuest,
  voyageEnemyCannotAttack,
  voyageNoEngagementCheck,
  voyagePlayCost,
  voyagePlayerCardPlayed,
  voyageArchery,
  voyageStats,
  voyageThreatBonus,
  voyageEngaged,
  voyageShadow,
  voyageTravelEntered,
} from "../src/game/voyage-belegaer";
import {
  base,
  choose,
  reload,
  settle,
  start,
} from "./voyage-belegaer-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
function pickTarget(s: GameState, id: string) {
  const o = s.choice!.options.find(
    (o) => o.id === id || o.effects.some((e) => e.target === id),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return o.id;
}
function changeQuest(s: GameState, code: string) {
  const q = s.voyageBelegaer!,
    all = [q.currentQuest, ...q.questDeck, ...q.completedQuests];
  q.currentQuest = code;
  q.questDeck = all.filter((c) => c !== code);
  q.completedQuests = [];
  s.stage = code === V.departure ? 1 : code === V.pursuit ? 3 : 2;
  s.progress = 0;
  return s;
}
function attack(s: GameState, enemy: Unit, defender?: Unit) {
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: ownerOf(s, enemy),
    defenderId: defender?.id ?? null,
    attackBonus: 0,
  };
}

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Voyage Belegaer ${easy ? "easy" : "normal"} ${players} players: physical fleet, decks and hidden quest order reload`, () => {
      const s = start(players, easy),
        q = s.voyageBelegaer!;
      assert.ok(q.initialized);
      assert.equal(q.currentQuest, V.departure);
      assert.equal(q.questDeck.length, 5);
      assert.equal(q.questDeck.at(-1), V.pursuit);
      assert.deepEqual(
        [...q.questDeck.slice(0, 4)].sort(),
        [...VOYAGE_STAGE_TWO].sort(),
      );
      const fleet = allCharacters(s).filter(
        (u) => card(u.code).type_code === "ship-objective",
      );
      assert.equal(fleet.length, players === 1 ? 2 : players);
      assert.equal(new Set(fleet.map((u) => u.code)).size, fleet.length);
      assert.equal(fleet.filter((u) => u.code === V.dream).length, 1);
      assert.equal(
        fleet.find((u) => u.code === V.dream)!.attachments[0].code,
        V.heading,
      );
      assert.equal(s.staging.filter((u) => u.code === V.scout).length, 1);
      assert.equal(s.staging.filter((u) => u.code === V.rolling).length, 1);
      assert.equal(q.corsairDeck.length, easy ? 7 : 9);
      assert.equal(s.encounterDeck.length, easy ? 19 : 27);
      assert.ok(!s.encounterDeck.some((c) => VOYAGE_CORSAIRS.includes(c)));
      assert.deepEqual(reload(s).voyageBelegaer, q);
    });
test("Voyage recipes and supported faces retain exact original identifiers and local artwork", () => {
  assert.deepEqual(
    VOYAGE_RECIPES.map((r) => r.id),
    ["E06.1", "Q06.1"],
  );
  assert.equal(VOYAGE_ENCOUNTERS.length, 22);
  assert.equal(VOYAGE_QUESTS.length, 6);
  for (const c of [...VOYAGE_ENCOUNTERS, ...VOYAGE_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.ok(existsSync(`public${imageUrl(c)}`), c.name);
  }
  assert.equal(sailingSymbols(V.calm), 2);
  for (const c of [V.rough, V.thrown, V.winds, V.starlit, V.rolling])
    assert.equal(sailingSymbols(c), 1);
  assert.equal(sailingSymbols(V.sudden), 0);
  assert.equal(sailingSymbols(V.scout), 0);
  assert.match(card(V.starlit).text!, /Starlit Sea gains/);
});
test("on-course advancement offers only two looked quest stages and moves the unchosen card to the bottom", () => {
  let s = base();
  s.voyageBelegaer!.questDeck = [
    V.storm,
    V.mists,
    V.divination,
    V.guidance,
    V.pursuit,
  ];
  s.progress = 8;
  check(s);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [V.storm, V.mists],
  );
  assert.ok(!s.choice!.description?.includes(card(V.divination).name));
  s = choose(reload(s), V.mists);
  s = settle(s);
  assert.equal(mainQuestCode(s), V.mists);
  assert.deepEqual(s.voyageBelegaer!.questDeck, [
    V.divination,
    V.guidance,
    V.pursuit,
    V.storm,
  ]);
  assert.equal(s.progress, 0);
});
test("off-course advancement follows the hidden top card without offering the next stage", () => {
  let s = base();
  s.voyageBelegaer!.questDeck = [
    V.storm,
    V.mists,
    V.divination,
    V.guidance,
    V.pursuit,
  ];
  s.sailing!.heading = 1;
  s.progress = 8;
  s = finish(s);
  assert.equal(mainQuestCode(s), V.storm);
  assert.deepEqual(s.voyageBelegaer!.questDeck, [
    V.mists,
    V.divination,
    V.guidance,
    V.pursuit,
  ]);
});
test("Pursuit searches two highest-threat physical ships for three players, forbids off-course progress, and wins by combat or ten progress", () => {
  let s = base(3);
  s.voyageBelegaer!.advancing = true;
  s.voyageBelegaer!.questDeck = [
    V.pursuit,
    V.storm,
    V.mists,
    V.guidance,
    V.divination,
  ];
  s.encounterDeck = [V.scout, V.warship, V.cruiser];
  s.encounterDiscard = [V.cruiser];
  handle(s, fx("voyageAdvanceTake", { code: V.pursuit }));
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [V.cruiser, V.cruiser],
  );
  s.sailing!.heading = 2;
  addCurrentQuestProgress(s, 10);
  assert.equal(s.progress, 0);
  s.sailing!.heading = 0;
  addCurrentQuestProgress(s, 10);
  check(s);
  assert.equal(s.status, "won");
  s = changeQuest(base(), V.pursuit);
  check(s);
  assert.equal(s.status, "won");
});
test("Sailing exhausts only the first player's characters plus any Dream-chaser; its double count and results survive reload", () => {
  let s = base(2);
  s.table!.first = 1;
  s.encounterDeck = [V.calm, V.thrown, V.sudden, V.scout];
  s.phase = "quest";
  beginSailingTest(s);
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  assert.ok(sailingCandidates(s).some((u) => u.id === dream.id));
  assert.ok(
    !sailingCandidates(s).some((u) => u.id === seatView(s, 0).heroes[0].id),
  );
  s = choose(reload(s), dream.id);
  assert.equal(sailingCommitCount(s), 2);
  assert.ok(get(s, dream.id)!.exhausted);
  s = choose(reload(s), "done");
  sailingContinue(s);
  assert.equal(s.sailing!.test!.successes, 3);
  s = choose(reload(s), "sailing-heading-1");
  assert.equal(s.sailing!.heading, 0);
  assert.ok(!s.sailing!.test);
  assert.deepEqual(s.encounterDiscard, [V.calm, V.thrown]);
});
test("Rough Waters cancels one icon per staged copy while active Calm Waters increases look count, without revealing cards", () => {
  let s = base();
  s.activeLocation = make(s, V.calm);
  staged(s, V.rough);
  staged(s, V.rough);
  s.encounterDeck = [V.calm, V.thrown, V.sudden, V.scout];
  s.phase = "quest";
  beginSailingTest(s);
  s = choose(reload(s), s.heroes[0].id);
  s = choose(reload(s), "done");
  sailingContinue(s);
  assert.equal(s.sailing!.test!.looked!.length, 3);
  assert.equal(s.sailing!.test!.successes, 1);
  assert.equal(s.staging.filter((u) => u.code === V.thrown).length, 0);
  s = choose(reload(s), "sailing-heading-1");
  assert.equal(s.encounterDiscard.length, 3);
});
test("publisher Sailing rules allow Calm Waters successes with zero commitment, while exhausted ships never qualify", () => {
  let s = base();
  s.activeLocation = make(s, V.calm);
  s.encounterDeck = [V.calm, V.calm];
  allCharacters(s).forEach((u) => (u.exhausted = true));
  s.phase = "quest";
  beginSailingTest(s);
  assert.equal(sailingCandidates(s).length, 0);
  s = choose(reload(s), "done");
  sailingContinue(s);
  assert.equal(s.sailing!.test!.successes, 4);
  s = choose(reload(s), "sailing-heading-1");
  assert.equal(s.sailing!.heading, 0);
  assert.ok(!s.sailing!.test);
});
test("Corsair Boarding uses its own physical deck, engages the correct owner, and replenishes only its own discard pile", () => {
  let s = base(2);
  s.voyageBelegaer!.corsairDeck = [V.pirate, V.sailor];
  s.voyageBelegaer!.corsairDiscard = [V.captain];
  const cruiser = staged(s, V.cruiser);
  forOwner(s, 1, () => engage(s, cruiser));
  flush(s);
  s = settle(s);
  assert.equal(
    allEngaged(s).filter((u) => VOYAGE_CORSAIRS.includes(u.code)).length,
    2,
  );
  assert.ok(
    allEngaged(s)
      .filter((u) => VOYAGE_CORSAIRS.includes(u.code))
      .every((u) => ownerOf(s, u) === 1),
  );
  assert.deepEqual(s.voyageBelegaer!.corsairDeck, [V.captain]);
  assert.equal(s.encounterDeck.length, 30);
  const pirate = allEngaged(s).find((u) => u.code === V.pirate)!;
  destroy(s, pirate);
  assert.ok(s.voyageBelegaer!.corsairDiscard.includes(V.pirate));
  assert.ok(!s.encounterDiscard.includes(V.pirate));
});
test("Boarding triggers only staging engagement and off-course Calphon adds one boarding card", () => {
  let s = changeQuest(base(), V.divination);
  s.sailing!.heading = 2;
  s.voyageBelegaer!.corsairDeck = [V.sailor, V.sailor, V.sailor];
  const scout = staged(s, V.scout);
  engage(s, scout);
  flush(s);
  s = settle(s);
  assert.equal(s.engaged.filter((u) => u.code === V.sailor).length, 2);
  const direct = make(s, V.scout);
  s.engaged.push(direct);
  const before = s.voyageBelegaer!.corsairDeck.length;
  voyageEffect(s, fx("voyageShift", { value: 0 }));
  assert.equal(s.voyageBelegaer!.corsairDeck.length, before);
  assert.equal(engagementCost(s, scout), 20);
});
test("Corsair resources use discarded printed costs; Marauder's attack damage is owner scoped", () => {
  let s = base(2);
  const pirate = staged(s, V.pirate);
  forOwner(s, 1, () => {
    s.heroes[0].attachments.push({
      id: "paid",
      code: "01069",
      exhausted: false,
    });
    engage(s, pirate);
  });
  flush(s);
  s = settle(s);
  const p = get(s, pirate.id)!;
  assert.equal(p.resources, 3);
  assert.equal(stats(s, p).attack, 5);
  assert.equal(stats(s, p).defense, 5);
  const marauder = staged(s, V.marauder);
  forOwner(s, 1, () => {
    s.hand = [make(s, "01073")];
    engage(s, marauder);
  });
  flush(s);
  s = settle(s);
  assert.equal(get(s, marauder.id)!.resources, 5);
  attack(s, get(s, marauder.id)!);
  voyageAttackStarted(s, get(s, marauder.id)!, 1);
  flush(s);
  assert.ok(s.choice!.options.every((o) => ownerOf(s, get(s, o.id)!) === 1));
  s = settle(s);
  assert.equal(
    allCharacters(s)
      .filter((u) => ownerOf(s, u) === 0)
      .reduce((n, u) => n + u.damage, 0),
    0,
  );
});
test("Marauder's mandatory damage can eliminate its attacked player before an immediate defender is declared", () => {
  let s = base(2);
  let lastHero!: Unit;
  let marauder!: Unit;
  forOwner(s, 1, () => {
    for (const hero of s.heroes.slice(1))
      damage(s, hero.id, stats(s, hero).health);
    lastHero = s.heroes[0];
    damage(s, lastHero.id, stats(s, lastHero).health - 1);
    marauder = make(s, V.marauder);
    marauder.owner = 1;
    marauder.resources = 1;
    marauder.attacked = true;
    marauder.shadows = [V.winds];
    s.engaged.push(marauder);
  });
  const nextEnemy = make(s, V.sailor);
  nextEnemy.owner = 0;
  s.engaged.push(nextEnemy);
  s.encounterDeck = [V.rough, ...s.encounterDeck];
  s.phase = "defense";
  s.queue.push(fx("immediateAttack", { target: marauder.id, player: 1 }));
  flush(s);
  assert.match(s.choice!.title, /Vicious Marauder.*Assign/);
  assert.ok(s.combat?.immediatePendingDeclaration);
  s = choose(reload(s), lastHero.id);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.combat, null);
  assert.equal(s.suspendedCombats.length, 0);
  assert.equal(s.choice, null);
  assert.equal(s.phase, "defense");
  assert.equal(s.table!.active, 0);
  assert.equal(s.table!.turn, 0);
  assert.ok(s.staging.some((u) => u.id === marauder.id));
  assert.deepEqual(get(s, marauder.id)!.shadows, []);
  assert.equal(s.encounterDiscard.filter((c) => c === V.winds).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === V.rough).length, 1);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: nextEnemy.id,
    defenderIds: [s.heroes[0].id],
  });
  s = settle(s);
  assert.equal(
    s.phase,
    "attack",
    "The remaining player's normal attack completes",
  );
  assert.equal(s.combat, null);
  assert.ok(validateSave(s));
});

test("eliminated immediate attack players release each nested physical shadow layer once", () => {
  let s = base(2);
  let lastHero!: Unit;
  let marauder!: Unit;
  forOwner(s, 1, () => {
    for (const hero of s.heroes.slice(1))
      damage(s, hero.id, stats(s, hero).health);
    lastHero = s.heroes[0];
    damage(s, lastHero.id, stats(s, lastHero).health - 1);
    marauder = make(s, V.marauder);
    marauder.owner = 1;
    marauder.resources = 1;
    marauder.shadows = [V.winds];
    s.engaged.push(marauder);
  });
  const remaining = make(s, V.sailor);
  remaining.owner = 0;
  s.engaged.push(remaining);
  s.phase = "defense";
  s.combat = {
    enemyId: marauder.id,
    attackPlayer: 1,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    immediate: true,
    immediatePendingDeclaration: true,
    immediatePreviousShadows: [V.thrown],
    immediatePreviousAttacked: false,
  };
  s.encounterDeck = [V.rough, ...s.encounterDeck];
  s.queue.push(fx("immediateAttack", { target: marauder.id, player: 1 }));
  flush(s);
  assert.equal(s.suspendedCombats.length, 1);
  s = choose(reload(s), lastHero.id);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.combat, null);
  assert.equal(s.suspendedCombats.length, 0);
  assert.equal(s.table!.active, 0);
  assert.equal(s.phase, "defense");
  assert.deepEqual(get(s, marauder.id)!.shadows, []);
  for (const code of [V.thrown, V.winds, V.rough])
    assert.equal(s.encounterDiscard.filter((c) => c === code).length, 1);
  assert.ok(validateSave(s));
});
test("Southron Sailor adds only its owner's engaged ships to staging threat and Umbar Captain blocks only that owner's attackers", () => {
  const s = base(2),
    scout = make(s, V.scout),
    sailor = make(s, V.sailor),
    captain = make(s, V.captain);
  forOwner(s, 1, () => {
    for (const u of [scout, sailor, captain]) {
      u.owner = 1;
      s.engaged.push(u);
    }
  });
  assert.equal(stagingThreat(s), 2);
  assert.ok(voyageCanAttackEnemy(s, scout, s.heroes[0]));
  assert.ok(!voyageCanAttackEnemy(s, scout, seatView(s, 1).heroes[0]));
});
test("Fog Bank restricts ship engagement, attacks and player attacks; staged Warship cannot take damage but is vulnerable engaged", () => {
  const s = base(),
    warship = staged(s, V.warship);
  s.activeLocation = make(s, V.fog);
  assert.ok(voyageNoEngagementCheck(s, warship));
  assert.ok(voyageEnemyCannotAttack(s, warship));
  assert.ok(!voyageCanAttackEnemy(s, warship, s.heroes[0]));
  damage(s, warship.id, 5);
  assert.equal(warship.damage, 0);
  s.activeLocation = null;
  engage(s, warship);
  s.queue = [];
  damage(s, warship.id, 5);
  assert.equal(warship.damage, 5);
});
test("worst-heading Waterspout travel is mandatory and its forced effect damages every player's ship", () => {
  let s = base(2);
  const waterspout = staged(s, V.waterspout),
    calm = staged(s, V.calm);
  s.phase = "travel";
  s.sailing!.heading = 3;
  assert.match(canTravel(s, calm)!, /Waterspout/);
  assert.equal(canTravel(s, waterspout), null);
  assert.throws(() => applyAction(reload(s), { type: "NEXT" }), /Waterspout/);
  voyageTravelEntered(s, waterspout);
  flush(s);
  s = settle(s);
  assert.ok(
    allCharacters(s)
      .filter((u) => card(u.code).type_code === "ship-objective")
      .every((u) => u.damage === 4),
  );
});
test("Rolling Seas and printed Starlit Sea pay travel costs; Into the Storm distributes five per player", () => {
  let s = base(2),
    rolling = staged(s, V.rolling);
  s.phase = "travel";
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: rolling.id }));
  assert.equal(s.sailing!.heading, 1);
  s = base(2);
  s.sailing!.heading = 1;
  const starlit = staged(s, V.starlit);
  s.phase = "travel";
  const before = playerOrder(s).map((p) => seatView(s, p).threat);
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: starlit.id }));
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    before.map((t) => t + 3),
  );
  s = changeQuest(base(2), V.storm);
  s.sailing!.heading = 1;
  voyageEndQuest(s);
  flush(s);
  while (s.choice) {
    const option = s.choice.options.find(
      (o) => o.code && card(o.code).type_code === "ship-objective",
    );
    assert.ok(option, JSON.stringify(s.choice));
    s = choose(reload(s), option.id);
  }
  for (const p of playerOrder(s))
    assert.equal(
      allCharacters(s)
        .filter((u) => ownerOf(s, u) === p)
        .reduce((n, u) => n + u.damage, 0),
      5,
    );
});
test("Winds cancellation depends on the worst heading; encounter choices preserve current-quest progress and exhausted-only damage", () => {
  let s = base();
  s.sailing!.heading = 3;
  assert.ok(!voyageCanCancelWhenRevealed(s, V.winds));
  s.sailing!.heading = 2;
  assert.ok(voyageCanCancelWhenRevealed(s, V.winds));
  s.progress = 3;
  revealed(s, V.thrown);
  flush(s);
  s = choose(reload(s), "progress");
  assert.equal(s.progress, 0);
  assert.equal(s.threat, 24);
  s.heroes[0].exhausted = true;
  revealed(s, V.sudden);
  flush(s);
  s = choose(reload(s), "damage");
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].damage, 0);
});
test("ship printed abilities modify starting threat, draws, hero attack and first ally discount", () => {
  const s = base(),
    q = s.voyageBelegaer!;
  const dawn = q.setAside.find((u) => u.code === V.dawn)!;
  voyageEffect(s, fx("voyageFleetTake", { target: dawn.id, player: 0 }));
  assert.equal(s.threat, 23);
  assert.equal(voyageDrawBonus(s), 1);
  const silver = q.setAside.find((u) => u.code === V.silver)!;
  voyageEffect(s, fx("voyageFleetTake", { target: silver.id, player: 0 }));
  assert.equal(s.threat, 20);
  assert.equal(
    stats(s, s.heroes[0]).attack,
    (card(s.heroes[0].code).attack ?? 0) + 1,
  );
  assert.equal(voyagePlayCost(s, card("01073")), -1);
  voyagePlayerCardPlayed(s, card("01073"));
  assert.equal(voyagePlayCost(s, card("01073")), 0);
});
test("all Voyage shadows apply their printed conditions and retained after-attack consequences", () => {
  const s = base(),
    enemy = make(s, V.scout),
    dream = allCharacters(s).find((u) => u.code === V.dream)!;
  s.engaged.push(enemy);
  attack(s, enemy, dream);
  voyageShadow(s, V.calm);
  assert.equal(s.combat!.attackBonus, 3);
  s.sailing!.heading = 1;
  voyageShadow(s, V.rough);
  assert.equal(s.combat!.attackBonus, 5);
  dream.exhausted = true;
  voyageShadow(s, V.boarding);
  assert.equal(s.combat!.attackBonus, 7);
  voyageShadow(s, V.starlit);
  assert.equal(s.combat!.attackBonus, 9);
  s.sailing!.heading = 3;
  voyageShadow(s, V.fog);
  assert.equal(s.combat!.extraAttacks, 1);
  s.sailing!.heading = 0;
  voyageShadow(s, V.rolling);
  voyageShadow(s, V.thrown);
  s.combat!.voyageCharacterKilled = true;
  s.combat!.voyageShipDamaged = true;
  voyageAfterAttack(s);
  assert.equal(s.sailing!.heading, 2);
  voyageShadow(s, V.winds);
  assert.ok(s.choice!.options.some((o) => o.id === "undefended"));
  voyageEffect(s, fx("voyageUndefended"));
  assert.equal(s.combat!.defenderId, null);
});
test("Sudden Storms excess assigns to a controlled ship and ship destruction eliminates its controller or loses with Dream-chaser", () => {
  let s = base();
  const enemy = make(s, V.scout);
  s.engaged.push(enemy);
  attack(s, enemy, s.heroes[0]);
  voyageShadow(s, V.sudden);
  const hero = s.heroes[0];
  hero.damage = 8;
  voyageDamageDealt(s, hero, 8, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.match(s.choice!.title, /Excess damage/);
  assert.ok(
    s.choice!.options.every(
      (o) => card(o.code!).type_code === "ship-objective",
    ),
  );
  s = base(2);
  const other = allCharacters(s).find(
    (u) => card(u.code).type_code === "ship-objective" && ownerOf(s, u) === 1,
  )!;
  damage(s, other.id, 99);
  check(s);
  assert.ok(s.table!.seats[1].eliminated);
  assert.equal(s.status, "playing");
  s = base();
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  damage(s, dream.id, 99);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Dream-chaser/);
});
test("Voyage save validator rejects forged quest inventories, deck kinds, fleet aliases and malformed state without throwing", () => {
  const s = base();
  assert.ok(validateSave(reload(s)));
  const mutation = (f: (s: GameState) => void) => {
    const t = JSON.parse(JSON.stringify(s));
    f(t);
    assert.equal(validateSave(t), false);
  };
  mutation((t) => t.voyageBelegaer!.questDeck.push(V.departure));
  mutation((t) => t.voyageBelegaer!.corsairDeck.push(V.scout));
  mutation((t) => (t.voyageBelegaer!.setAside[0].code = V.scout));
  mutation((t) => ((t.voyageBelegaer!.questDeck as unknown as {}) = {}));
  assert.ok(validateVoyage(s, () => true));
  const q = s.voyageBelegaer!;
  q.corsairDeck = [];
  q.corsairDiscard = [];
  assert.ok(voyageCorsairDiscard(s, V.pirate));
  assert.deepEqual(q.corsairDeck, [V.pirate]);
  shiftHeading(s, 99);
  assert.equal(s.sailing!.heading, 3);
  shiftHeading(s, -99);
  assert.equal(s.sailing!.heading, 0);
  assert.ok(mainQuestUnit(s));
});
test("every stage-two search uses the correct card and continuous penalties follow heading and Sword-thain's actual type", () => {
  for (const [quest, target] of [
    [V.storm, V.waterspout],
    [V.mists, V.fog],
    [V.divination, V.scout],
    [V.guidance, V.starlit],
  ]) {
    let s = changeQuest(base(), quest);
    s.encounterDeck = [target, V.sudden];
    s.encounterDiscard = [];
    voyageEffect(s, fx("voyageStageReveal"));
    assert.equal(s.choice!.options[0].code, target);
    s = choose(reload(s), s.choice!.options[0].id);
    assert.equal(s.staging[0].code, target);
  }
  let s = base();
  const dream = allCharacters(s).find((u) => u.code === V.dream)!;
  assert.equal(voyageStats(s, dream).will, 2);
  s.sailing!.heading = 1;
  assert.equal(voyageStats(s, dream).will, 0);
  s = changeQuest(s, V.mists);
  const ally = make(s, "01073");
  s.allies.push(ally);
  assert.equal(voyageStats(s, ally).will, -2);
  assert.equal(voyageStats(s, dream).will, 0);
  ally.attachments.push({ id: "sword-thain", code: "10149", exhausted: false });
  assert.equal(voyageStats(s, ally).will, 0);
  const silver = make(s, V.silver);
  s.allies.push(silver);
  assert.equal(voyageStats(s, ally).attack, 1);
  s = changeQuest(s, V.guidance);
  const ocean = staged(s, V.rolling);
  assert.equal(voyageThreatBonus(s, ocean), 1);
  s.sailing!.heading = 0;
  assert.equal(voyageThreatBonus(s, ocean), 0);
  const warship = staged(s, V.warship);
  assert.equal(voyageArchery(s, warship), 4);
  s.staging = s.staging.filter((u) => u.id !== warship.id);
  s.engaged.push(warship);
  assert.equal(voyageArchery(s, warship), 0);
});
test("a Light Cruiser Raider gets its boarding resource and player-to-player ship transfer does not repeat Boarding", () => {
  let s = base(2);
  s.voyageBelegaer!.corsairDeck = [V.pirate, V.sailor, V.marauder];
  const cruiser = staged(s, V.cruiser);
  engage(s, cruiser);
  flush(s);
  s = settle(s);
  assert.equal(
    get(s, allEngaged(s).find((u) => u.code === V.pirate)!.id)!.resources,
    1,
  );
  const before = s.voyageBelegaer!.corsairDeck.length;
  voyageEngaged(s, get(s, cruiser.id)!, false);
  flush(s);
  assert.equal(s.voyageBelegaer!.corsairDeck.length, before);
});
test("shadow attack consequences exclude Marauder ability damage and include Sudden Storms excess dealt to a ship", () => {
  let s = base();
  const enemy = make(s, V.marauder);
  s.engaged.push(enemy);
  attack(s, enemy, s.heroes[0]);
  damage(s, s.heroes[0].id, 99);
  voyageShadow(s, V.thrown);
  voyageAfterAttack(s);
  assert.equal(s.sailing!.heading, 0);
  s = base();
  const scout = make(s, V.scout);
  s.engaged.push(scout);
  attack(s, scout, s.heroes[0]);
  voyageShadow(s, V.sudden);
  voyageShadow(s, V.rolling);
  const hero = s.heroes[0];
  hero.damage = 8;
  voyageDamageDealt(s, hero, 8, { combatDamage: true, enemyId: scout.id });
  flush(s);
  s = choose(reload(s), s.choice!.options[0].id);
  assert.ok(s.combat!.voyageShipDamaged);
  voyageAfterAttack(s);
  assert.equal(s.sailing!.heading, 1);
});
test("Rolling Seas cannot pay its Travel cost at the worst heading, while movement that bypasses Travel costs stays legal", () => {
  let s = base();
  const rolling = staged(s, V.rolling);
  s.phase = "travel";
  s.sailing!.heading = 3;
  assert.match(canTravel(s, rolling)!, /cost cannot be paid/);
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: rolling.id }),
    /cost cannot be paid/,
  );
  handle(s, fx("travelEnter", { target: rolling.id }));
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation!.id, rolling.id);
  assert.equal(s.sailing!.heading, 3);
});
