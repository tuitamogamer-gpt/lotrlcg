import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeDamageContext,
  readDamageContext,
  normalizeDamageContext,
  validDamageContextEffectText,
} from "../src/game/damage-context.ts";

test("Damage context round trips all cancellation and replacement flags", () => {
  const context = {
    enemyId: "troll",
    combatDamage: true,
    bypassFrodo: true,
    bypassDori: true,
    bypassDiscipline: true,
    mockingVisited: ["frodo", "aragorn"],
    questEffect: true,
    bypassEredFinal: false,
    eredFinalPrevented: ["shirt-c14", "hound-c21"],
  };
  assert.deepEqual(
    readDamageContext({ text: encodeDamageContext(context) }),
    context,
  );
});
test("Saved damage contexts validate prevention flags without requiring sources to remain in play", () => {
  assert.equal(validDamageContextEffectText(undefined), true);
  assert.equal(validDamageContextEffectText("legacy effect text"), true);
  assert.equal(validDamageContextEffectText('["old-song-target"]'), true);
  assert.equal(validDamageContextEffectText('{"otherEffect":true}'), true);
  assert.equal(
    validDamageContextEffectText(
      encodeDamageContext({
        questEffect: true,
        bypassEredFinal: false,
        eredFinalPrevented: ["discarded-shirt", "discarded-hound"],
      }),
    ),
    true,
  );
  for (const damageContext of [
    null,
    [],
    { questEffect: 1 },
    { bypassEredFinal: "false" },
    { eredFinalPrevented: [1] },
    { eredFinalPrevented: ["same", "same"] },
    { enemyId: false },
    { combatDamage: "true" },
    { mockingVisited: [null] },
  ])
    assert.equal(
      validDamageContextEffectText(JSON.stringify({ damageContext })),
      false,
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
