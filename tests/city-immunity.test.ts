import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, playTargets } from "../src/game/engine";
import { card } from "../src/game/cards";
import { choose, fx, get, make, stats } from "../src/game/core";
import { beginEnemyAttack } from "../src/game/combat";
import { flush } from "../src/game/effects";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import {
  activePlayerAbilityCode,
  finishPlayerAbilitySource,
  resolvePlayerAbility,
} from "../src/game/player-ability-triggers";
import { CITY as C } from "../src/game/city-support";
import { base, choose as pick, reload, setStage } from "./city-fixtures";
import type { GameState } from "../src/game/types";

function land() {
  const s = setStage(base(), 3);
  const index = s.city!.setAside.findIndex((u) => u.code === C.monument);
  s.staging.push(s.city!.setAside.splice(index, 1)[0]);
  s.heroes = [make(s, "01004"), make(s, "01005"), make(s, "01001")];
  s.startingHeroes = s.heroes.map((u) => u.code);
  for (const hero of s.heroes) {
    hero.resources = 10;
    hero.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
  }
  return s;
}
function enemy(s: GameState, code = C.raider, resources = 1, staged = false) {
  const u = make(s, code);
  u.resources = resources;
  (staged ? s.staging : s.engaged).push(u);
  return u;
}
function hand(s: GameState, code: string) {
  const u = make(s, code);
  s.hand.push(u);
  return u;
}
function play(s: GameState, code: string, target?: string) {
  const u = hand(s, code);
  return applyAction(reload(s), { type: "PLAY", id: u.id, target });
}

test("Monument immunity uses the event source, current resources, actual trait and unblanked in-play location", () => {
  const s = land(),
    protectedEnemy = enemy(s);
  const monument = s.staging.find((u) => u.code === C.monument)!;
  assert.equal(playerEffectImmune(s, protectedEnemy, "01034"), true);
  assert.equal(playerEffectImmune(s, protectedEnemy, "12144"), false);
  assert.equal(playerEffectImmune(s, protectedEnemy, "01004"), false);
  assert.equal(playerEffectImmune(s, protectedEnemy), false);
  protectedEnemy.resources = 0;
  assert.equal(playerEffectImmune(s, protectedEnemy, "01034"), false);
  protectedEnemy.resources = 1;
  monument.blanked = true;
  assert.equal(playerEffectImmune(s, protectedEnemy, "01034"), false);
  monument.blanked = false;
  s.staging = [];
  assert.equal(playerEffectImmune(s, protectedEnemy, "01034"), false);
  s.activeLocation = monument;
  assert.equal(playerEffectImmune(s, protectedEnemy, "01034"), true);
  assert.equal(playerEffectImmune(s, enemy(s, "01082", 3), "01034"), false);
  protectedEnemy.immuneToPlayerEffects = true;
  assert.equal(playerEffectImmune(s, protectedEnemy, "12144"), true);
});

test("Feint cannot choose a protected Raider, while a resource-free Raider remains a legal target", () => {
  const s = land(),
    protectedEnemy = enemy(s),
    freeEnemy = enemy(s, C.infiltrator, 0);
  s.phase = "defense";
  const feint = hand(s, "01034");
  assert.deepEqual(
    playTargets(s, feint).map((u) => u.id),
    [freeEnemy.id],
  );
  assert.throws(() =>
    applyAction(reload(s), {
      type: "PLAY",
      id: feint.id,
      target: protectedEnemy.id,
    }),
  );
  const result = applyAction(reload(s), {
    type: "PLAY",
    id: feint.id,
    target: freeEnemy.id,
  });
  assert.equal(get(result, freeEnemy.id)?.feinted, true);
  assert.ok(!get(result, protectedEnemy.id)?.feinted);
  assert.equal(result.playerAbilitySources, undefined);
});

test("Feint rechecks immunity if spending its cost gives Umbar Slaver its first resource", () => {
  const s = land(),
    slaver = enemy(s, C.slaver, 0);
  s.phase = "defense";
  const feint = hand(s, "01034");
  assert.ok(playTargets(s, feint).some((u) => u.id === slaver.id));
  const result = applyAction(reload(s), {
    type: "PLAY",
    id: feint.id,
    target: slaver.id,
  });
  assert.equal(get(result, slaver.id)?.resources, 1);
  assert.ok(!get(result, slaver.id)?.feinted);
  assert.ok(result.discard.includes("01034"));
  assert.equal(result.playerAbilitySources, undefined);
});

test("Rain of Arrows ignores each protected Raider but damages other engaged enemies", () => {
  let s = land();
  const protectedEnemy = enemy(s),
    freeEnemy = enemy(s, C.infiltrator, 0),
    ordinary = enemy(s, "01082", 2);
  s = play(s, "01033", s.heroes[1].id);
  assert.equal(get(s, protectedEnemy.id)?.damage, 0);
  assert.equal(get(s, freeEnemy.id)?.damage, 1);
  assert.equal(get(s, ordinary.id)?.damage, 1);
  assert.equal(s.heroes[1].exhausted, true);
  assert.equal(s.playerAbilitySources, undefined);
});

test("Thicket of Spears leaves protected Raiders able to attack while protecting against other enemies", () => {
  const s = land(),
    protectedEnemy = enemy(s),
    freeEnemy = enemy(s, C.infiltrator, 0);
  s.phase = "defense";
  const thicket = hand(s, "01036");
  const result = applyAction(reload(s), {
    type: "PLAY",
    id: thicket.id,
    payment: Object.fromEntries(s.heroes.map((h) => [h.id, 1])),
  });
  assert.ok(!get(result, protectedEnemy.id)?.feinted);
  assert.equal(get(result, freeEnemy.id)?.feinted, true);
  assert.equal(result.playerAbilitySources, undefined);
});

test("Hail of Stones excludes protected staging enemies and deals actual event damage to an unprotected target", () => {
  let s = land();
  const protectedEnemy = enemy(s, C.raider, 1, true),
    freeEnemy = enemy(s, C.infiltrator, 0, true);
  const hail = hand(s, "04032");
  assert.deepEqual(
    playTargets(s, hail).map((u) => u.id),
    [freeEnemy.id],
  );
  s = applyAction(reload(s), {
    type: "PLAY",
    id: hail.id,
    target: freeEnemy.id,
  });
  s = pick(reload(s), s.heroes[0].id);
  s = pick(reload(s), "exhaust");
  assert.equal(get(s, protectedEnemy.id)?.damage, 0);
  assert.equal(get(s, freeEnemy.id)?.damage, 1);
  assert.equal(s.playerAbilitySources, undefined);
});

test("Quick Strike makes a framework attack against a protected engaged Raider", () => {
  let s = land();
  const slaver = enemy(s, C.slaver, 1),
    attacker = s.heroes[0];
  attacker.tempAttack = 4;
  const expected = stats(s, attacker).attack - stats(s, slaver).defense;
  assert.ok(expected > 0 && expected < card(slaver.code).health!);
  s = play(s, "01035", attacker.id);
  assert.equal(s.choice?.title, "Quick Strike");
  assert.ok(s.choice!.options.some((option) => option.id === slaver.id));
  s = pick(reload(s), slaver.id);
  assert.equal(get(s, slaver.id)?.damage, expected);
  assert.equal(s.playerAbilitySources, undefined);
});

test("Hands Upon the Bow excludes protected staging enemies at initial and suspended target choices", () => {
  let s = land();
  const protectedEnemy = enemy(s, C.raider, 1, true),
    freeEnemy = enemy(s, C.infiltrator, 0, true);
  s = play(s, "04131", s.heroes[1].id);
  assert.match(s.choice!.title, /Hands Upon the Bow/);
  assert.ok(
    !s.choice!.options.some((option) => option.id === protectedEnemy.id),
  );
  assert.ok(s.choice!.options.some((option) => option.id === freeEnemy.id));
  assert.equal(activePlayerAbilityCode(reload(s)), "04131");
});

test("A Elbereth offers no protected Raider return and rechecks Umbar Slaver after its resource payment", () => {
  for (const initialResources of [0, 1]) {
    let s = land();
    const slaver = enemy(s, C.slaver, initialResources);
    hand(s, "04132");
    s.threat = 25;
    s.phase = "defense";
    s.heroes[0].tempDefense = 20;
    beginEnemyAttack(s, slaver, [s.heroes[0].id]);
    flush(s);
    if (initialResources) {
      assert.ok(!s.choice?.title.includes("A Elbereth"));
      assert.ok(s.hand.some((u) => u.code === "04132"));
    } else {
      assert.match(s.choice!.title, /A Elbereth/);
      s = pick(reload(s), "play");
      assert.equal(
        get(s, slaver.id)?.resources,
        1,
        "paying the event gives Slaver its first resource",
      );
      assert.ok(
        s.engaged.some((u) => u.id === slaver.id),
        "the newly protected enemy remains engaged",
      );
      assert.ok(s.discard.includes("04132"), "the event was paid and resolved");
      assert.equal(s.playerAbilitySources, undefined);
    }
  }
});

for (const allyCode of ["12144", "01073"])
  test(`Sneak Attack uses ${allyCode === "12144" ? "Guardian's" : "Gandalf's"} own nested response against an event-immune Raider`, () => {
    let s = land();
    const protectedEnemy = enemy(s, C.slaver, 1),
      ally = hand(s, allyCode);
    s = play(s, "01023");
    assert.equal(activePlayerAbilityCode(reload(s)), "01023");
    s = pick(reload(s), ally.id);
    assert.match(
      s.choice!.title,
      allyCode === "12144" ? /Guardian of Ithilien/ : /Gandalf/,
    );
    assert.ok(
      s.choice!.options.some((option) => option.id === protectedEnemy.id),
    );
    s = pick(reload(s), protectedEnemy.id);
    if (allyCode === "12144")
      assert.ok(s.staging.some((u) => u.id === protectedEnemy.id));
    else assert.equal(get(s, protectedEnemy.id)?.damage, 4);
    assert.equal(s.playerAbilitySources, undefined);
  });

test("Nested source boundaries survive a pending save and restore the parent event after an ally response", () => {
  let s = land();
  const protectedEnemy = enemy(s),
    event = hand(s, "01023"),
    ally = make(s, "01073");
  s.hand = [];
  s.allies.push(ally);
  resolvePlayerAbility(
    s,
    { player: 0, source: event.id, code: event.code, type: "action" },
    () => {
      assert.equal(playerEffectImmune(s, protectedEnemy), true);
      resolvePlayerAbility(
        s,
        { player: 0, source: ally.id, code: ally.code, type: "response" },
        () => {
          assert.equal(playerEffectImmune(s, protectedEnemy), false);
          choose(s, "Finish nested ally response", [
            { id: "continue", label: "Continue", effects: [] },
          ]);
        },
      );
      s.queue.push(fx("damage", { target: protectedEnemy.id, value: 1 }));
    },
  );
  assert.equal(activePlayerAbilityCode(s), "01073");
  s = reload(s);
  assert.equal(activePlayerAbilityCode(s), "01073");
  assert.equal(playerEffectImmune(s, get(s, protectedEnemy.id)!), false);
  s = pick(s, "continue");
  assert.equal(
    get(s, protectedEnemy.id)?.damage,
    0,
    "after the ally finish boundary, the parent's queued event damage is immune",
  );
  assert.equal(s.playerAbilitySources, undefined);
});

test("Legacy finish boundaries and rejected synchronous abilities do not leak source frames", () => {
  const s = land();
  finishPlayerAbilitySource(s, "old-event", "01034");
  assert.equal(s.playerAbilitySources, undefined);
  assert.throws(() =>
    resolvePlayerAbility(
      s,
      { player: 0, source: "failed", code: "01034", type: "action" },
      () => {
        throw new Error("cannot initiate");
      },
    ),
  );
  assert.equal(s.playerAbilitySources, undefined);
});
