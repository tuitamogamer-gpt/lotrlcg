import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  RI,
  ROAD_ISENGARD_ENCOUNTERS,
  ROAD_ISENGARD_QUESTS,
  ROAD_ISENGARD_RECIPES,
} from "../src/game/road-isengard-support";
import { SNAGA_ORCS } from "../src/game/snaga-orcs";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-road-to-isengard-import.json";
import art from "./road-isengard-art.json";
import quantities from "./road-isengard-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  ROAD_ISENGARD_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Road to Isengard keeps the catalog's recipes, Hall of Beorn's quantities and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 23);
  assert.equal(snapshot.artwork.length, 26);
  // The Snaga Orcs and the Fellowship Aragorn come from The Uruk-hai.
  assert.deepEqual(
    [
      ...ROAD_ISENGARD_ENCOUNTERS.map((c) => c.code),
      ...ROAD_ISENGARD_QUESTS.map((c) => c.code),
      ...Object.values(SNAGA_ORCS),
      TOS_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(ROAD_ISENGARD_RECIPES.map((r) => r.id).sort(), [
    "E0B.09",
    "Q0B.09",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      ROAD_ISENGARD_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 40 and 31 encounter cards without the campaign cards,
  // plus 3 quest cards and the Fellowship Aragorn. Gríma's gold encounter set
  // icon keeps it out of the easy deck, as recipe E0B.09 does, although Hall
  // of Beorn counts it in easy mode.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    40 + 3 + 1,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    31 - 1 + 3 + 1,
  );
  assert.equal(count("easy", RI.grima), 0);
  assert.equal(
    hash("src/data/pending/the-road-to-isengard-import.json"),
    "29f786bdeca187b4de4d71c992e51b1b690b50fedc210b7cf7be8558fd850882",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Saruman and Wolf of Isengard react to a shadow card "with a Wizardry effect".
  assert.match(original(RI.saruman).text!, /with the Wizardry keyword/);
  assert.match(
    card(RI.saruman).text!,
    /with a Wizardry effect, the defending player resolves that Wizardry effect as if he is the only player in the game/,
  );
  assert.match(original(RI.wolf).text!, /with the Wizardry keyword/);
  assert.match(card(RI.wolf).text!, /with a Wizardry effect, either/);
  // Poisoned Vapour blanks the text box "as if it were blank (except for Traits)".
  assert.match(original(RI.vapour).text!, /as if was blank\.$/);
  assert.match(
    card(RI.vapour).text!,
    /as if it were blank \(except for Traits\)\.$/,
  );
  // Gates of Isengard prints Victory 1.
  assert.equal(original(RI.gates).victory, undefined);
  assert.equal(card(RI.gates).victory, 1);
  for (const c of [...ROAD_ISENGARD_ENCOUNTERS, ...ROAD_ISENGARD_QUESTS]) {
    for (const text of [c.text, c.back_text, c.shadow])
      assert.doesNotMatch(
        text ?? "",
        /  |\s$|<b>|<i>|\r/,
        `${c.name}: tidy text`,
      );
  }
  // Quest points from the scans: only The Voice of Saruman has them.
  assert.deepEqual(
    ROAD_ISENGARD_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Rouse the Ents", null],
      ["Breaking Isengard", null],
      ["The Voice of Saruman", 15],
    ],
  );
  // Statistics from the scans.
  assert.deepEqual(
    [RI.saruman, RI.grima, RI.lieutenant, RI.orc, RI.wolf].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [50, 4, 6, 4, 6],
      [1, 3, 2, 3, 3],
      [36, 3, 4, 3, 5],
      [29, 1, 2, 1, 3],
      [25, 2, 3, 1, 4],
    ],
  );
  assert.deepEqual(
    [
      RI.gates,
      RI.orthanc,
      RI.vent,
      RI.pit,
      RI.plain,
      RI.armoury,
      RI.ringWall,
    ].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest, !!c.is_unique];
    }),
    // Plain of Isengard's threat is X.
    [
      [3, 1, true],
      [2, 1, true],
      [3, 4, false],
      [2, 3, false],
      [null, 3, false],
      [4, 3, false],
      [2, 2, false],
    ],
  );
  const ent = card(RI.ent);
  assert.equal(ent.type_code, "objective-ally");
  assert.deepEqual(
    [ent.willpower, ent.attack, ent.defense, ent.health],
    [2, 4, 3, 4],
  );
  // Gríma and Poisoned Vapour carry the gold icon of the cards left out in easy mode.
  assert.equal(count("easy", RI.vapour), 0);
});
