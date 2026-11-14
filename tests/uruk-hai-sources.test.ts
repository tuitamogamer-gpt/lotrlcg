import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  UH,
  URUK_HAI_ENCOUNTERS,
  URUK_HAI_QUESTS,
  URUK_HAI_RECIPES,
} from "../src/game/uruk-hai-support";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-uruk-hai-import.json";
import art from "./uruk-hai-art.json";
import quantities from "./uruk-hai-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  URUK_HAI_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Uruk-hai keeps the catalog's recipes, Hall of Beorn's quantities and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 19);
  assert.equal(snapshot.artwork.length, 21);
  assert.deepEqual(
    [
      ...URUK_HAI_ENCOUNTERS.map((c) => c.code),
      ...URUK_HAI_QUESTS.map((c) => c.code),
      TOS_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(URUK_HAI_RECIPES.map((r) => r.id).sort(), [
    "E0B.07",
    "Q0B.07",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      URUK_HAI_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 37 and 29 encounter cards without the campaign card, plus
  // 2 quest cards and the Fellowship Aragorn. Hall of Beorn keeps Grishnákh
  // in easy mode; his scan has the gold easy-mode ring, as the recipe has it.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    37 + 2 + 1,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    29 - 1 + 2 + 1,
  );
  assert.equal(count("easy", UH.grishnakh), 0);
  assert.equal(
    hash("src/data/pending/the-uruk-hai-import.json"),
    "3aba5cc95e7aafca008b6552f852919fc50ac93a4f1dcf8ec408a16e715342cc",
  );
});

test("All 21 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 21);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // The printed cards restore these words.
  assert.match(original(UH.follow).text!, /Add Ugluk and To Isengard!/);
  assert.match(
    card(UH.follow).text!,
    /Add Uglúk and To Isengard! to the staging area\./,
  );
  assert.match(
    card(UH.follow).text!,
    /\(If playing campaign mode, choose each "captive" from the Campaign Log instead\.\)/,
  );
  assert.match(
    card(UH.follow).back_text!,
    /^X is the pursuit value\.\nUglúk cannot leave/,
  );
  assert.match(card(UH.rescue).back_text!, /while Uglúk is in play/);
  assert.match(original(UH.grishnakh).text!, /After Grishnakh enters play/);
  assert.match(card(UH.grishnakh).text!, /After Grishnákh enters play/);
  assert.match(original(UH.snaga).text!, /the discarded card's cost\./);
  assert.match(card(UH.snaga).text!, /the discarded card's printed cost\./);
  for (const c of [...URUK_HAI_ENCOUNTERS, ...URUK_HAI_QUESTS]) {
    assert.doesNotMatch(
      c.text ?? "",
      /  |\s$|<b>|<i>|Ugluk|Grishnakh/,
      `${c.name}: tidy text`,
    );
    assert.doesNotMatch(
      c.back_text ?? "",
      /  |\s$|<b>|<i>|Ugluk/,
      `${c.name}: tidy text`,
    );
  }
  // Statistics from the scans.
  assert.deepEqual(
    [UH.ugluk, UH.grishnakh, UH.uruks, UH.uruk, UH.fighter, UH.snaga].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat, c.attack, c.defense, c.health];
      },
    ),
    [
      [10, 3, 5, 1, 6],
      [40, 4, 3, 4, 5],
      [38, 2, 4, 2, 5],
      [34, 2, 3, 1, 4],
      [29, 3, 3, 2, 3],
      [44, 1, 3, 1, 3],
    ],
  );
  assert.deepEqual(
    [UH.wold, UH.eastemnet, UH.plains, UH.banks].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest];
    }),
    // Plains of Rohan's threat is X, the locations in the staging area.
    [
      [2, 2],
      [2, 3],
      [null, 4],
      [3, 5],
    ],
  );
  assert.deepEqual(
    [card(UH.ugluk).victory, card(UH.grishnakh).victory],
    [5, 3],
  );
  // The Fellowship Aragorn: threat 0, 2 willpower, 3 attack, 2 defense, 5 hit points.
  const aragorn = card(TOS_ARAGORN);
  assert.deepEqual(
    [
      aragorn.sphere_code,
      aragorn.threat,
      aragorn.willpower,
      aragorn.attack,
      aragorn.defense,
      aragorn.health,
    ],
    ["fellowship", 0, 2, 3, 2, 5],
  );
  assert.equal(aragorn.imagesrc, "/cards/143001.png");
  // Quest points are X, the pursuit value.
  assert.ok(URUK_HAI_QUESTS.every((q) => q.back_quest === undefined));
});
