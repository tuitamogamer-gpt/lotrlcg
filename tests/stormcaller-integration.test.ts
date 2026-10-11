import assert from "node:assert/strict";
import test from "node:test";
import { applyAction } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stats } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { RAID as R } from "../src/game/raid-grey-havens-support";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import { STORMCALLER as V } from "../src/game/stormcaller-support";
import { STORMCALLER_PLAYER as P } from "../src/game/stormcaller-player-support";
import { stormcallerCharactersCommitted } from "../src/game/stormcaller";
import { stormcallerPlayerHand as hand } from "./stormcaller-player-fixtures";
import { base as stormBase } from "./stormcaller-fixtures";
import { base as dikeBase } from "./deadmens-dike-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";

test("Tides sees Battle-Hardened's token-based attack increase before actual combat damage", () => {
  let s = stormBase();
  const enemy = make(s, V.pirate),
    defender = s.heroes[0],
    event = hand(s, P.tides);
  enemy.resources = 1;
  enemy.shadows = [R.hardened];
  defender.phaseResourceIcons = ["spirit", "tactics"];
  s.engaged.push(enemy);
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderIds: [defender.id],
  });
  assert.equal(get(s, enemy.id)!.resources, 3);
  assert.equal(s.combat!.attackBonus, 0, "tokens change the actual stat");
  assert.equal(stats(s, get(s, enemy.id)!).attack, 5);
  assert.match(s.choice!.title, /Tides of Fate/);
  assert.equal(get(s, defender.id)!.damage, 0, "Response precedes damage");
  s = choose(reload(s), event.id);
  s = choose(reload(s), defender.id);
  s = choose(reload(s), "skip");
  assert.equal(
    get(s, defender.id)!.damage,
    Math.max(0, 5 - card(defender.code).defense! - 3),
  );
  assert.ok(s.discard.includes(P.tides));
});

test("A non-shadow Seafarer resource gain cannot open Tides in the same combat context", () => {
  const s = stormBase(),
    enemy = make(s, V.seafarer),
    defender = s.heroes[0];
  s.engaged.push(enemy);
  hand(s, P.tides);
  s.phase = "defense";
  s.combat = { enemyId: enemy.id, defenderId: defender.id, attackBonus: 0 };
  const before = stats(s, enemy).attack;
  stormcallerCharactersCommitted(s, [defender]);
  flush(s);
  assert.equal(stats(s, enemy).attack, before + 1);
  assert.equal(s.choice, null);
  assert.equal(s.queue.length, 0);
});

test("A deferred Terror shadow retains its cause through Miner's Response and save/reload", () => {
  let s = dikeBase();
  const enemy = make(s, "01096"),
    defender = s.heroes[0],
    event = hand(s, P.tides);
  enemy.shadows = [D.terror];
  defender.phaseResourceIcons = ["spirit", "tactics"];
  s.engaged.push(enemy);
  s.deck = ["12066", "01026", "01050", ...s.deck];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderIds: [defender.id],
  });
  assert.match(s.choice!.title, /Miner/);
  assert.equal(
    s.combat!.attackBonus,
    0,
    "deferred bonus waits for the discard batch",
  );
  assert.ok(s.queue.some((e) => e.shadowEnemyId === enemy.id));
  s = choose(reload(s), "skip");
  assert.match(s.choice!.title, /Tides of Fate/);
  assert.equal(s.combat!.attackBonus, 3);
  assert.deepEqual(s.discard, ["12066", "01026", "01050"]);
  assert.equal(get(s, defender.id)!.damage, 0);
  s = choose(reload(s), event.id);
  s = choose(reload(s), defender.id);
  s = choose(reload(s), "skip");
  assert.equal(
    get(s, defender.id)!.damage,
    Math.max(0, card(enemy.code).attack! - card(defender.code).defense!),
  );
});

test("Deferred shadow metadata from another enemy cannot open the current attack's Tides", () => {
  const s = dikeBase(),
    enemy = make(s, "01096"),
    original = make(s, "01082"),
    defender = s.heroes[0];
  s.engaged.push(enemy, original);
  hand(s, P.tides);
  s.phase = "defense";
  s.combat = { enemyId: enemy.id, defenderId: defender.id, attackBonus: 0 };
  handle(
    s,
    fx("dikeShadowTerrorBonus", {
      target: enemy.id,
      ids: ["01013"],
      shadowEnemyId: original.id,
    }),
  );
  flush(s);
  assert.equal(s.combat.attackBonus, 1);
  assert.equal(s.choice, null);
});

test("A Ship enemy's nested immediate attack offers legal ships and restores the original attack after reload", () => {
  let s = stormBase();
  const enemy = make(s, V.skiff),
    original = make(s, "01082"),
    defender = s.allies.find((u) => u.code === V.narelenya)!;
  s.engaged.push(enemy, original);
  s.phase = "defense";
  s.combat = {
    enemyId: original.id,
    defenderId: s.heroes[0].id,
    attackBonus: 2,
  };
  s.encounterDeck = ["01085", ...s.encounterDeck];
  s.queue.push(fx("immediateAttack", { target: enemy.id }));
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.ok(s.choice!.options.some((o) => o.id === defender.id));
  assert.ok(!s.choice!.options.some((o) => o.id === s.heroes[0].id));
  assert.equal(s.suspendedCombats[0].enemyId, original.id);
  s = choose(reload(s), defender.id);
  assert.equal(
    get(s, defender.id)!.damage,
    Math.max(0, card(enemy.code).attack! + 1 - card(defender.code).defense!),
  );
  assert.equal(s.combat!.enemyId, original.id);
  assert.equal(s.combat!.attackBonus, 2);
  assert.equal(s.suspendedCombats.length, 0);
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
  assert.ok(s.encounterDiscard.includes("01085"));
  reload(s);
});
