import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  HD,
  HELMS_DEEP_ENCOUNTERS,
  HELMS_DEEP_QUESTS,
  HELMS_DEEP_RECIPES,
} from "../src/game/helms-deep-support";
import { WHITE_HAND } from "../src/game/white-hand";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/helm-s-deep-import.json";
import art from "./helms-deep-art.json";
import quantities from "./helms-deep-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  HELMS_DEEP_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Helm's Deep keeps the catalog's recipes, Hall of Beorn's quantities and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 23);
  assert.equal(snapshot.artwork.length, 28);
  // The Orcs of the White Hand and the Fellowship Aragorn come from The Uruk-hai.
  assert.deepEqual(
    [
      ...HELMS_DEEP_ENCOUNTERS.map((c) => c.code),
      ...HELMS_DEEP_QUESTS.map((c) => c.code),
      ...Object.values(WHITE_HAND),
      TOS_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(HELMS_DEEP_RECIPES.map((r) => r.id).sort(), [
    "E0B.08",
    "Q0B.08",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      HELMS_DEEP_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 45 and 35 encounter cards without the campaign card
  // (Poisoned Counsels included), plus 5 quest cards and the Fellowship Aragorn.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    45 + 5 + 1,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    35 + 5 + 1,
  );
  assert.equal(
    hash("src/data/pending/helm-s-deep-import.json"),
    "a2fb209102dc42ab01d4aa97252949404f89ddae7bfb43d2e738240c27de10e8",
  );
});

test("All 28 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 28);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // The printed Devilry of Saruman.
  assert.match(original(HD.devilry).text!, /on the current quest/);
  assert.match(original(HD.devilry).text!, /as it was blank/);
  assert.match(card(HD.devilry).text!, /Place 3 progress on the main quest/);
  assert.match(
    card(HD.devilry).text!,
    /as if it was blank \(except for Traits\)/,
  );
  // Siege and Corruption are traits.
  assert.equal(card(HD.defense).traits, "Siege.");
  assert.equal(card(HD.counsels).traits, "Corruption.");
  for (const c of [...HELMS_DEEP_ENCOUNTERS, ...HELMS_DEEP_QUESTS]) {
    assert.doesNotMatch(
      c.text ?? "",
      /  |\s$|<b>|<i>|\r/,
      `${c.name}: tidy text`,
    );
    assert.doesNotMatch(
      c.back_text ?? "",
      /  |\s$|<b>|<i>|\r/,
      `${c.name}: tidy text`,
    );
  }
  // Quest points from the scans: 1B and 5B have none, the Defense stages 8.
  assert.deepEqual(
    HELMS_DEEP_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["The King of the Golden Hall", null],
      ["Assault on Helm's Deep", 8],
      ["The Hosts of Isengard", 8],
      ["The Wall is Breached!", 8],
      ["The King Rides Out", null],
    ],
  );
  // Statistics from the scans.
  assert.deepEqual(
    [HD.hillman, HD.warrior, HD.soldier].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [24, 3, 3, 2, 3],
      [44, 4, 5, 1, 5],
      [39, 4, 4, 1, 4],
    ],
  );
  assert.deepEqual(
    [HD.hornburg, HD.wall, HD.culvert, HD.postern, HD.gate].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest];
    }),
    // Deeping Culvert's threat is X.
    [
      [3, 3],
      [4, 4],
      [null, 2],
      [3, 2],
      [5, 3],
    ],
  );
  assert.equal(card(HD.defense).victory, 8);
});
