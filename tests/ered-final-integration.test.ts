import test from "node:test";
import assert from "node:assert/strict";
import { get, make } from "../src/game/core";
import {
  act,
  attach,
  fixture,
  hand,
  pick,
  reload,
  settle,
} from "./ered-mithrin-player-fixtures";
import type { GameState } from "../src/game/types";

function reviews(s: GameState) {
  for (let n = 0; s.flow?.pending; n++) {
    assert.ok(n < 30);
    s = act(s, { type: "CONTINUE", stepId: s.flow.pending.id });
  }
  return s;
}

test("Round Shield responds to a real shadow canceled by Hasty Stroke before combat damage", () => {
  let s = fixture();
  const defender = s.heroes[1],
    shield = attach(s, defender, "19118"),
    enemy = make(s, "01089");
  enemy.tempAttack = 1;
  enemy.shadows = ["01085"];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  hand(s, "01048");
  s.phase = "defense";
  s = reviews(
    act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: defender.id }),
  );
  assert.equal(s.choice?.title, "A shadow falls");
  s = reviews(pick(s, "cancel"));
  assert.match(s.choice!.title, /Round Shield/);
  assert.equal(get(s, defender.id)!.damage, 0);
  s = settle(pick(reload(s), "use"));
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(
    get(s, defender.id)!.attachments.find((a) => a.id === shield.id)!.exhausted,
    true,
  );
  assert.ok(s.discard.includes("01048"));
  reload(s);
});

test("A shadow card without effective shadow text never offers Round Shield", () => {
  let s = fixture();
  const defender = s.heroes[1],
    shield = attach(s, defender, "19118"),
    enemy = make(s, "01089");
  enemy.shadows = ["01099"];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  s.phase = "defense";
  s = settle(
    act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: defender.id }),
  );
  assert.equal(
    get(s, defender.id)!.attachments.find((a) => a.id === shield.id)!.exhausted,
    false,
  );
  assert.equal(get(s, defender.id)!.damage, 1);
  reload(s);
});

test("Sting can destroy an enemy on defender declaration before its shadow is revealed", () => {
  let s = fixture();
  const defender = make(s, "19112");
  s.heroes = [defender, ...s.heroes.slice(1)];
  s.startingHeroes = s.heroes.map((h) => h.code);
  attach(s, defender, "19117");
  const enemy = make(s, "01089");
  enemy.damage = 2;
  enemy.shadows = ["01092"];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  s.phase = "defense";
  s = reviews(
    act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: defender.id }),
  );
  assert.match(s.choice!.title, /Sting/);
  s = settle(pick(reload(s), "use"));
  assert.equal(get(s, enemy.id), undefined);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.ok(get(s, defender.id)!.attachments.some((a) => a.code === "19117"));
  assert.ok(s.encounterDiscard.includes("01092"));
  assert.equal(s.combat, null);
  reload(s);
});
