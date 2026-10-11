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
  stagingThreat,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  discardCharacter,
  engage,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
} from "../src/game/table";
import { mainQuestUnit } from "../src/game/quest-state";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { beginSailingTest, sailingSymbols } from "../src/game/sailing";
import {
  STORMCALLER as C,
  STORMCALLER_ENCOUNTERS,
  STORMCALLER_MAIN_QUESTS,
  STORMCALLER_ENEMY_QUESTS,
  STORMCALLER_QUESTS,
  STORMCALLER_RECIPES,
  validateStormcaller,
} from "../src/game/stormcaller-support";
import {
  stormcallerArea,
  stormcallerAreaImmune,
  stormcallerCharactersCommitted,
  stormcallerDamageAmount,
  stormcallerEndQuest,
  stormcallerEndStaging,
  stormcallerSailingCommitDone,
  stormcallerShadow,
  stormcallerSyncArea,
  stormcallerTravelStart,
} from "../src/game/stormcaller";
import {
  base,
  start,
  settle,
  reload,
  choose,
  setPlayerStage,
  setEnemyStage,
} from "./stormcaller-fixtures";
import type { Unit, GameState } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const enemy = (s: GameState, code: string, player = 0) => {
  const u = make(s, code);
  u.owner = player;
  forOwner(s, player, () => s.engaged.push(u));
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Stormcaller ${easy ? "easy" : "normal"} ${players} players: original physical fleet, piles and stage decks persist`, () => {
      const s = start(players, easy),
        q = s.stormcaller!;
      assert.ok(q.initialized);
      assert.equal(q.currentQuest, C.departure);
      assert.equal(q.enemyQuest, C.fullEnemy);
      assert.deepEqual(q.questDeck, STORMCALLER_MAIN_QUESTS.slice(1));
      assert.deepEqual(q.enemyQuestDeck, STORMCALLER_ENEMY_QUESTS.slice(1));
      assert.equal(q.area.length, 1);
      assert.equal(q.area[0].code, C.stormcaller);
      assert.equal(q.enemyProgress, 0);
      assert.equal(
        s.staging.filter((u) => u.code === C.rolling).length,
        easy ? 1 : players >= 3 ? 2 : 1,
      );
      assert.equal(s.encounterDeck.length, easy ? 23 : players >= 3 ? 31 : 32);
      assert.equal(q.corsairDeck.length, easy ? 10 : 13);
      assert.equal(
        allCharacters(s).filter(
          (u) => card(u.code).type_code === "ship-objective",
        ).length,
        players === 1 ? 2 : players,
      );
      assert.equal(
        allCharacters(s).filter((u) => u.code === C.dream).length,
        1,
      );
      assert.ok(validateSave(reload(s)));
      const totalRolling = [
        ...s.encounterDeck,
        ...s.staging.map((u) => u.code),
      ].filter((c) => c === C.rolling).length;
      assert.equal(totalRolling, easy ? 1 : 3);
    });

test("Stormcaller supported originals retain source identities and printed corrections without registering reference rules", () => {
  assert.equal(
    STORMCALLER_RECIPES.find((r) => r.mode === "standard")!.id,
    "Q06.4",
  );
  assert.equal(STORMCALLER_RECIPES.find((r) => r.mode === "easy")!.id, "E06.4");
  for (const c of [...STORMCALLER_ENCOUNTERS, ...STORMCALLER_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    for (const src of [imageUrl(c), c.back_imagesrc].filter(Boolean))
      assert.ok(existsSync(`public${src}`), String(src));
  }
  assert.match(card(C.foulEnemy).text!, /Search.*Sahír's Escort/);
  assert.equal(card(C.squall).traits, "Weather.");
  assert.equal(card(C.stormcaller).name, "Stormcaller");
  assert.ok(!SCRIPTED.has("octgn:5484e07e-b5a2-470a-84ba-be78062a61f2"));
  assert.equal(sailingSymbols(C.skiff), 1);
  assert.equal(sailingSymbols(C.coast), 1);
  assert.equal(sailingSymbols(C.escort), 0);
});

test("separate area becomes staging at matching main stage, preserves physical IDs and reclassifies when either stage changes", () => {
  const s = base(),
    boss = s.stormcaller!.area[0],
    coast = make(s, C.coast);
  s.stormcaller!.area.push(coast);
  assert.ok(stormcallerAreaImmune(s, boss));
  assert.equal(stagingThreat(s), 0);
  assert.equal(get(s, boss.id), boss);
  setPlayerStage(s, 2);
  assert.equal(s.stormcaller!.area.length, 0);
  assert.ok(s.staging.includes(boss));
  assert.equal(stagingThreat(s), 8);
  assert.ok(!stormcallerAreaImmune(s, boss));
  setEnemyStage(s, 3);
  assert.equal(s.stormcaller!.area.length, 2);
  assert.equal(s.staging.length, 0);
  assert.ok(stormcallerAreaImmune(s, coast));
  assert.deepEqual(
    stormcallerArea(reload(s))
      .map((u) => u.id)
      .sort(),
    [boss.id, coast.id].sort(),
  );
});

test("revealed Escort and Vast Coastland enter area; canceled relocation enters ordinary staging", () => {
  let s = base();
  revealed(s, C.escort);
  s = finish(s);
  assert.ok(stormcallerArea(s).some((u) => u.code === C.escort));
  assert.equal(s.staging.length, 0);
  revealed(s, C.coast);
  s = finish(s);
  assert.ok(stormcallerArea(s).some((u) => u.code === C.coast));
  handle(
    s,
    fx("placeEncounter", { code: C.coast, flag: true, text: "revealed" }),
  );
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === C.coast));
});

test("matching-stage area ships engage with Boarding and area locations travel without duplication", () => {
  let s = setPlayerStage(base(2), 2);
  s.stormcaller!.corsairDeck = [C.sailor, C.blade, C.seafarer];
  s.phase = "encounter";
  const boss = get(s, s.stormcaller!.stormcallerId)!;
  s = applyAction(s, { type: "ENGAGE", id: boss.id });
  s = settle(s);
  assert.ok(allEngaged(s).some((u) => u.id === boss.id));
  assert.equal(stormcallerArea(s).length, 0);
  assert.equal(
    allEngaged(s).filter((u) => [C.sailor, C.blade].includes(u.code)).length,
    2,
  );
  const coast = staged(s, C.coast);
  coast.stormcallerArea = true;
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: coast.id });
  assert.equal(s.activeLocation!.id, coast.id);
  assert.ok(!s.activeLocation!.stormcallerArea);
  assert.ok(validateSave(reload(s)));
});

test("player stage1 advances and searches Swift Raider; defeating the same stage catches the Stormcaller", () => {
  let s = base();
  s.encounterDeck = [C.swift, C.calm];
  s.progress = 8;
  check(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === C.swift));
  assert.equal(s.stormcaller!.currentQuest, C.full);
  s.progress = 12;
  check(s);
  s = finish(s);
  assert.equal(s.status, "won");
});

test("stage2 caps cumulative progress at8 or4 offcourse across removal, heading changes and reload", () => {
  let s = setPlayerStage(base(), 2);
  setEnemyStage(s, 3);
  s.phase = "quest";
  s = reload(s);
  addCurrentQuestProgress(s, 7);
  assert.equal(s.progress, 7);
  s.progress -= 5;
  s.sailing!.heading = 1;
  addCurrentQuestProgress(s, 10);
  assert.equal(s.progress, 2);
  s.sailing!.heading = 0;
  addCurrentQuestProgress(s, 10);
  assert.equal(s.progress, 3);
  assert.equal(s.stormcaller!.progressThisRound, 8);
  s = reload(s);
  s.round++;
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 7);
});

test("stage3 offcourse staging end reveals a real extra card once while oncourse does not", () => {
  let s = setPlayerStage(base(), 3);
  setEnemyStage(s, 4);
  s.phase = "staging";
  s.sailing!.heading = 1;
  s.encounterDeck = [C.coast, C.calm];
  stormcallerEndStaging(s);
  s = finish(s);
  assert.deepEqual(s.encounterDeck, [C.calm]);
  assert.ok(stormcallerArea(s).some((u) => u.code === C.coast));
  s.sailing!.heading = 0;
  stormcallerEndStaging(s);
  s = finish(s);
  assert.deepEqual(s.encounterDeck, [C.calm]);
});

test("Swift Departure transfers at most two existing main progress and never creates progress", () => {
  let s = base();
  s.sailing!.heading = 1;
  s.progress = 1;
  stormcallerEndQuest(s);
  s = finish(s);
  assert.equal(s.progress, 0);
  assert.equal(s.stormcaller!.enemyProgress, 1);
  stormcallerEndQuest(s);
  s = finish(s);
  assert.equal(s.stormcaller!.enemyProgress, 1);
  s.progress = 5;
  s.sailing!.heading = 0;
  stormcallerEndQuest(s);
  s = finish(s);
  assert.equal(s.progress, 5);
});

test("endround Stormcaller progress uses boss threat plus one discarded card and physically present Escorts, without revealing or refilling", () => {
  let s = base();
  const escort = make(s, C.escort);
  s.stormcaller!.area.push(escort);
  s.sailing!.heading = 1;
  s.phase = "refresh";
  s.encounterDeck = [C.coast];
  handle(s, fx("stormcallerEnemyRound"));
  s = finish(s);
  assert.equal(s.stormcaller!.enemyProgress, 12 % 12);
  assert.equal(s.stormcaller!.enemyStage, 3);
  assert.equal(s.encounterDiscard.includes(C.coast), true);
  assert.ok(!stormcallerArea(s).some((u) => u.code === C.coast));
  const q = s.stormcaller!;
  q.enemyProgress = 0;
  s.encounterDeck = [];
  s.encounterDiscard = [C.coast];
  handle(s, fx("stormcallerEnemyRound"));
  s = finish(s);
  assert.equal(q.enemyProgress, 6);
  assert.deepEqual(s.encounterDiscard, [C.coast]);
  assert.equal(s.encounterDeck.length, 0);
});

test("pursuer advancement returns only Stormcaller, preserves damage, adds printed3C Escort and offers Serpent attacks", () => {
  let s = setPlayerStage(base(2), 2);
  const boss = get(s, s.stormcaller!.stormcallerId)!;
  engage(s, boss);
  s = finish(s);
  boss.damage = 3;
  const blade = enemy(s, C.blade, 1);
  s.stormcaller!.enemyProgress = 12;
  s.encounterDeck = [C.escort, C.calm];
  handle(s, fx("stormcallerEnemyAdvance"));
  flush(s);
  assert.equal(s.stormcaller!.enemyStage, 3);
  assert.ok(stormcallerArea(s).some((u) => u.id === boss.id));
  assert.equal(get(s, boss.id)!.damage, 3);
  assert.ok(
    s.choice!.options.some((o) => o.effects.some((e) => e.target === blade.id)),
  );
  const search = s.choice!.options.find((o) =>
    o.effects.some((e) => e.kind === "stormcallerEnemyReveal"),
  )!;
  s = choose(reload(s), search.id);
  assert.match(s.choice!.title, /Sahír's Escort/);
});

test("Stormcaller defeat of4D loses; player defeat of4B and legal boss leave each win", () => {
  let s = setEnemyStage(base(), 4);
  s.stormcaller!.enemyProgress = 24;
  handle(s, fx("stormcallerEnemyAdvance"));
  assert.equal(s.status, "lost");
  s = setPlayerStage(base(), 4);
  s.progress = 24;
  check(s);
  s = finish(s);
  assert.equal(s.status, "won");
  s = setPlayerStage(base(), 2);
  discardCharacter(s, get(s, s.stormcaller!.stormcallerId)!);
  assert.equal(s.status, "won");
});

test("Swift Raider commitment threshold respects Dream-chaser double Sailing count and actual owner", () => {
  let s = base(2);
  const swift = staged(s, C.swift);
  s.phase = "quest";
  beginSailingTest(s);
  const dream = allCharacters(s).find((u) => u.code === C.dream)!;
  const heroes = s.heroes.slice(0, 2);
  s.sailing!.test!.committedIds = [dream.id, ...heroes.map((u) => u.id)];
  stormcallerSailingCommitDone(s);
  s.choice = null;
  s = finish(s);
  assert.ok(allEngaged(s).some((u) => u.id === swift.id));
  s = base(2);
  const other = staged(s, C.swift),
    foreign = allCharacters(s).find((u) => u.code === C.narelenya)!;
  foreign.code = C.dream;
  s.phase = "quest";
  beginSailingTest(s);
  s.sailing!.test!.committedIds = [foreign.id, ...s.heroes.map((u) => u.id)];
  stormcallerSailingCommitDone(s);
  s.choice = null;
  s = finish(s);
  assert.ok(s.staging.some((u) => u.id === other.id));
});

test("existing Seafarers steal real resources per hero commitment; new Boarding Seafarers do not steal retroactively", () => {
  let s = base(2);
  const seafarer = enemy(s, C.seafarer, 0),
    other = enemy(s, C.seafarer, 1);
  s.heroes[0].resources = 2;
  s.heroes[1].resources = 0;
  stormcallerCharactersCommitted(s, s.heroes.slice(0, 2));
  s = finish(s);
  assert.equal(get(s, seafarer.id)!.resources, 1);
  assert.equal(other.resources, 0);
  assert.equal(stats(s, get(s, seafarer.id)!).attack, 3);
  s = base();
  const swift = staged(s, C.swift);
  s.stormcaller!.corsairDeck = [C.seafarer, C.blade];
  const chars = [...s.heroes, s.allies[0]];
  for (const u of chars) u.committed = true;
  stormcallerCharactersCommitted(s, chars);
  s = finish(s);
  assert.ok(allEngaged(s).some((u) => u.id === swift.id));
  assert.equal(allEngaged(s).find((u) => u.code === C.seafarer)!.resources, 0);
});

test("Corsair Skiff gives the engaged owner a threat3 versus Boarding1 choice and does not repeat after transfer", () => {
  let s = base(2);
  const skiff = staged(s, C.skiff);
  forOwner(s, 1, () => engage(s, skiff));
  flush(s);
  assert.match(s.choice!.title, /Corsair Skiff/);
  s = choose(reload(s), "threat");
  assert.equal(s.table!.seats[1].threat, 23);
  assert.equal(s.table!.seats[0].threat, 20);
  s = base();
  const second = staged(s, C.skiff);
  s.stormcaller!.corsairDeck = [C.seafarer, C.blade];
  engage(s, second);
  flush(s);
  s = choose(reload(s), "board");
  assert.equal(allEngaged(s).filter((u) => u.code === C.seafarer).length, 1);
});

test("Jagged Reef resolves per staging or active copy: progress oncourse and fleet damage offcourse", () => {
  let s = base(2);
  const first = staged(s, C.reef),
    second = make(s, C.reef);
  s.activeLocation = second;
  stormcallerTravelStart(s);
  s = finish(s);
  assert.equal(first.progress, 2);
  assert.equal(second.progress, 2);
  s.sailing!.heading = 1;
  stormcallerTravelStart(s);
  s = finish(s);
  assert.ok(
    allCharacters(s)
      .filter((u) => card(u.code).type_code === "ship-objective")
      .every((u) => u.damage === 4),
  );
});

test("Hidden Cove requires two main progress, advances pursuer before travel response, and offers optional fleet heal", () => {
  let s = base();
  const cove = staged(s, C.cove);
  s.phase = "travel";
  s.progress = 1;
  assert.match(canTravel(s, cove)!, /requires moving 2 progress/);
  s.progress = 3;
  s.stormcaller!.enemyProgress = 10;
  s.encounterDeck = [C.escort];
  assert.equal(canTravel(s, cove), null);
  s = applyAction(s, { type: "TRAVEL", id: cove.id });
  s = settle(s);
  assert.equal(s.stormcaller!.enemyStage, 3);
  assert.equal(s.progress, 1);
  assert.equal(s.activeLocation!.id, cove.id);
});

test("Raging Squall attaches physically, damages all committed allies including ships and excludes heroes", () => {
  let s = base();
  s.sailing!.heading = 1;
  revealed(s, C.squall);
  s = finish(s);
  assert.equal(
    mainQuestUnit(s)!.attachments.filter((a) => a.code === C.squall).length,
    1,
  );
  assert.ok(!s.encounterDiscard.includes(C.squall));
  const chars = allCharacters(s);
  for (const u of chars) u.committed = true;
  stormcallerCharactersCommitted(s, chars);
  s = finish(s);
  assert.ok(s.allies.every((u) => u.damage === 1));
  assert.ok(s.heroes.every((u) => u.damage === 0));
});

test("new shadows use enemy stage and same-stage matching; capped Stormcaller damage stays cumulative through healing", () => {
  const s = base(),
    attacker = enemy(s, C.blade);
  s.combat = {
    enemyId: attacker.id,
    attackPlayer: 0,
    defenderId: null,
    attackBonus: 0,
  };
  stormcallerShadow(s, C.overboard);
  assert.equal(s.combat.attackBonus, 2);
  stormcallerShadow(s, C.coast);
  assert.equal(s.combat.attackBonus, 2);
  setPlayerStage(s, 2);
  stormcallerShadow(s, C.coast);
  assert.equal(s.combat.attackBonus, 4);
  const boss = get(s, s.stormcaller!.stormcallerId)!;
  damage(s, boss.id, 3);
  assert.equal(boss.damage, 3);
  boss.damage = 0;
  assert.equal(stormcallerDamageAmount(s, boss, 10), 1);
  damage(s, boss.id, 10);
  assert.equal(boss.damage, 1);
  assert.equal(s.stormcaller!.damageThisRound, 4);
});

test("malformed Stormcaller saves reject impossible quest order, wrong pile kinds, negative counters and duplicate area IDs safely", () => {
  const s = start();
  for (const change of [
    (q: any) => q.questDeck.reverse(),
    (q: any) => (q.enemyStage = 1),
    (q: any) => q.corsairDeck.push(C.coast),
    (q: any) => (q.damageThisRound = -1),
    (q: any) => q.area.push(q.area[0]),
    (q: any) => (q.enemyQuestDeck = null),
  ]) {
    const copy = JSON.parse(JSON.stringify(s));
    change(copy.stormcaller);
    assert.doesNotThrow(() => validateSave(copy));
    assert.equal(validateSave(copy), false);
  }
  assert.ok(validateStormcaller(s, (u) => !!u));
});

test("Cape4A discarded Raging Squall attaches its physical card without Doomed, reveal damage or a discard duplicate", () => {
  let s = setPlayerStage(base(), 4);
  setEnemyStage(s, 4);
  s.phase = "quest";
  s.encounterDeck = [C.skiff, C.squall, C.winds];
  const before = s.threat;
  handle(s, fx("stormcallerCapeWeather"));
  s = finish(s);
  assert.equal(s.threat, before);
  assert.equal(
    mainQuestUnit(s)!.attachments.filter((a) => a.code === C.squall).length,
    1,
  );
  assert.ok(!s.encounterDiscard.includes(C.squall));
  assert.ok(s.encounterDiscard.includes(C.skiff));
  assert.deepEqual(s.encounterDeck, [C.winds]);
  assert.ok(
    allCharacters(s)
      .filter((u) => card(u.code).type_code === "ship-objective")
      .every((u) => u.damage === 0),
  );
  assert.ok(validateSave(reload(s)));
});

test("an offstage location retaining enough progress explores when the main quest catches up, before stage reveal", () => {
  let s = base();
  const reef = make(s, C.reef);
  reef.progress = 4;
  s.stormcaller!.area.push(reef);
  setPlayerStage(s, 2);
  s = finish(s);
  assert.ok(!stormcallerArea(s).some((u) => u.id === reef.id));
  assert.ok(!s.staging.some((u) => u.id === reef.id));
  assert.equal(s.encounterDiscard.filter((c) => c === C.reef).length, 1);
  assert.ok(validateSave(reload(s)));
});

test("4B Weather still damages enemy ships after the first player's companion ship destruction eliminates that player", () => {
  let s = setEnemyStage(setPlayerStage(base(2), 4), 4);
  s.phase = "staging";
  const dream = allCharacters(s).find((u) => u.code === C.dream)!;
  const companion = allCharacters(s).find((u) => u.code === C.narelenya)!;
  forOwner(s, 0, () => {
    s.allies = s.allies.filter((u) => u.id !== dream.id);
    s.allies.push(companion);
  });
  forOwner(s, 1, () => {
    s.allies = s.allies.filter((u) => u.id !== companion.id);
    s.allies.push(dream);
  });
  dream.owner = dream.controller = 1;
  companion.owner = companion.controller = 0;
  companion.damage = (card(companion.code).health ?? 0) - 1;
  const bossId = s.stormcaller!.stormcallerId;
  handle(s, fx("afterEncounterRevealed", { code: C.squall }));
  assert.ok(
    s.queue.some((e) => e.kind === "stormcallerWeatherShipDamage"),
  );
  s = finish(reload(s));
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.ok(!get(s, companion.id));
  assert.equal(get(s, dream.id)!.damage, 1);
  assert.equal(get(s, bossId)!.damage, 1);
  assert.ok(validateSave(reload(s)));
});
