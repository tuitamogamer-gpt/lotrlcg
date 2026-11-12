import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  BOFA as B,
  BOFA_ENCOUNTERS,
  BOFA_QUESTS,
  BOFA_RECIPES,
} from "../src/game/battle-five-armies-support";
import { FAS_ENCOUNTERS } from "../src/game/flies-spiders-support";
import { card } from "../src/game/cards";
import { OTD_BILBO } from "../src/game/hobbit-saga";
import snapshot from "../src/data/pending/the-battle-of-five-armies-import.json";
import art from "./battle-five-armies-art.json";
import quantities from "./battle-five-armies-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

test("The Battle of Five Armies keeps Hall of Beorn's normal and easy quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 25);
  assert.equal(snapshot.artwork.length, 30);
  const wilderland = new Set(FAS_ENCOUNTERS.map((c) => c.code));
  assert.deepEqual(
    [...BOFA_ENCOUNTERS, ...BOFA_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .map((c) => c.code)
      .filter((c) => c !== OTD_BILBO && !wilderland.has(c))
      .sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = BOFA_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter((c) => c.code === row.code)
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
    assert.deepEqual(
      recipe,
      snapshot.recipes.find((r) => r.mode === mode),
    );
  }
  assert.equal(
    hash("src/data/pending/the-battle-of-five-armies-import.json"),
    "fad8a73b3f11a632af1e3ad19bdf4b534022bc98e2f4d7a832aa542a407a9ea2",
  );
});

test("All 30 faces are pinned and the reviewed scans add the Battle and Siege keywords the catalog omits", () => {
  assert.equal(art.length, 30);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    BOFA_QUESTS.map((q) => q.back_quest ?? null),
    [null, 8, 8, 8, null],
  );
  assert.match(card(B.dale).back_text!, /^Battle\. /m);
  assert.match(card(B.ravenhill).back_text!, /^Siege\. /m);
  assert.doesNotMatch(card(B.spur).back_text!, /Battle\.|Siege\./);
  const original = (code: string) =>
    snapshot.cards.find((c) => c.code === code)!.back_text!;
  assert.doesNotMatch(original(B.dale), /Battle\./);
  assert.doesNotMatch(original(B.ravenhill), /Siege\./);
  assert.deepEqual(
    [
      card(B.bolg).threat ?? null,
      card(B.bolg).attack,
      card(B.bolg).defense,
      card(B.bolg).health,
      card(B.bolg).engagement,
    ],
    [null, 6, 3, 8, 50],
  );
  for (const code of [B.gate, B.ruins, B.ravenhillLocation]) {
    assert.equal(card(code).victory, 3);
    assert.match(card(code).text!, /Immune to player card effects/);
  }
  assert.equal(card(B.eagle).type_code, "objective-ally");
});
