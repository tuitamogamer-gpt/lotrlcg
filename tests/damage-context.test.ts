import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeDamageContext,
  readDamageContext,
  normalizeDamageContext,
} from "../src/game/damage-context.ts";

test("Damage context round trips all cancellation and replacement flags", () => {
  const context = {
    enemyId: "troll",
    combatDamage: true,
    bypassFrodo: true,
    bypassDori: true,
    bypassDiscipline: true,
    mockingVisited: ["frodo", "aragorn"],
  };
  assert.deepEqual(
    readDamageContext({ text: encodeDamageContext(context) }),
    context,
  );
});
test("Old Song and Frodo saved effects retain enemy and visited heroes", () => {
  assert.deepEqual(readDamageContext({ source: "troll", ids: ["frodo"] }), {
    enemyId: "troll",
    combatDamage: true,
    mockingVisited: ["frodo"],
  });
  assert.deepEqual(
    readDamageContext({ source: "troll", text: '["aragorn"]' }),
    { enemyId: "troll", combatDamage: true, mockingVisited: ["aragorn"] },
  );
});
test("Malformed saved context cannot inject invalid damage flags", () => {
  assert.deepEqual(
    readDamageContext({
      text: '{"damageContext":{"combatDamage":"true","bypassFrodo":false,"mockingVisited":[1]}}',
    }),
    { bypassFrodo: false },
  );
  assert.deepEqual(readDamageContext({ source: "troll", text: "invalid" }), {
    enemyId: "troll",
    combatDamage: true,
  });
  assert.deepEqual(normalizeDamageContext("troll", ["frodo"]), {
    enemyId: "troll",
    combatDamage: true,
    mockingVisited: ["frodo"],
  });
});
