import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  RB,
  RB_ENCOUNTERS,
  RB_QUESTS,
  RB_RECIPES,
  printedDiscover,
  rbRecipe,
} from "../src/game/ruins-belegost-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-ruins-of-belegost-import.json";
import art from "./ruins-belegost-art.json";
import quantities from "./ruins-belegost-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (easy: boolean, code: string) =>
  rbRecipe(easy)
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Ruins of Belegost keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 32);
  assert.equal(snapshot.artwork.length, 40);
  assert.deepEqual(
    [...RB_ENCOUNTERS, ...RB_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(RB_RECIPES, snapshot.recipes);
  assert.deepEqual(
    RB_RECIPES.map((r) => r.id),
    ["E99.06", "Q99.06"],
  );
  assert.equal(rbRecipe(false).id, "Q99.06");
  assert.equal(rbRecipe(true).id, "E99.06");
  assert.equal(quantities.length, 32);
  for (const row of quantities) {
    assert.equal(total(false, row.code), row.normal, row.name);
    assert.equal(total(true, row.code), row.easy, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
  }
  // Hall of Beorn: 45 (easy 39) encounter cards, 7 quest cards and the two
  // scenario rules cards.
  const sum = (key: "normal" | "easy", type?: string) =>
    quantities
      .filter((r) => (type ? r.type === type : true))
      .reduce((n, r) => n + r[key], 0);
  assert.deepEqual([sum("normal"), sum("easy")], [45 + 7 + 2, 39 + 7 + 2]);
  assert.deepEqual([sum("normal", "quest"), sum("easy", "quest")], [7, 7]);
  assert.deepEqual([sum("normal", "rules"), sum("easy", "rules")], [2, 2]);
  // Easy mode removes the gold-bordered cards.
  assert.deepEqual(
    quantities
      .filter((r) => r.normal !== r.easy)
      .map((r) => [r.name, r.normal, r.easy]),
    [
      ["Old Stone Troll", 2, 0],
      ["Flooded Hall", 2, 0],
      ["Spawn of Thangorodrim", 2, 0],
    ],
  );
  // Setup zones: Stalking the Ruins and four Abandoned Mines staged (one per
  // player is kept), the quest-specific cards and five Loot set aside.
  const sections = snapshot.recipes.find((r) => r.id === "Q99.06")!.sections;
  assert.deepEqual(sections.sharedStagingArea, {
    [RB.stalking]: 1,
    [RB.mine]: 4,
  });
  assert.deepEqual(
    Object.keys(sections.sharedSetAside)
      .map((c) => card(c).name)
      .sort(),
    [
      "Blue Mountain Gem",
      "Book of Aulë's Children",
      "Dwarven Torch",
      "Keys of Belegost",
      "Lurker of the Depths",
      "Map of Ered Luin",
      "Naurlhûg",
      "Naurlhûg's Lair",
      "Scenario Rules 1",
      "Scenario Rules 2",
      "Sword of Belegost",
    ],
  );
  assert.equal(
    hash("src/data/pending/the-ruins-of-belegost-import.json"),
    "84b3fd6570543ec5888e459256826d73594068d12b3f1776794473be2d321844",
  );
});

test("All 40 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 40);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    snapshot.artwork.map((a) => a.sha256).sort(),
    art.map((a) => a.sha256).sort(),
  );
  // Seven quest cards, two of them alternative stage 2s and three stage 3s;
  // 4B has no quest points.
  assert.deepEqual(
    [
      RB.first,
      RB.evils,
      RB.deeper,
      RB.servants,
      RB.roots,
      RB.mines,
      RB.beast,
    ].map((code) => [card(code).name, card(code).back_quest ?? null]),
    [
      ["Ruins of the First Age", 6],
      ["Ancient Evils Disturbed", 9],
      ["Deeper into the Past", 9],
      ["The Servants of Morgoth", 6],
      ["The Roots of Ered Luin", 6],
      ["The Mines of Belegost", 6],
      ["The Beast of Belegost", null],
    ],
  );
  // The catalog spells the dragon Naurlhug and the Vala Aule, and five Loot
  // objectives say "the fist player".
  for (const c of [...RB_ENCOUNTERS, ...RB_QUESTS])
    for (const field of ["text", "back_text", "shadow"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(v, /Naurlhug|Aule's|fist player/, c.name);
      assert.doesNotMatch(v, /  |\s$|`/, `${c.name}: tidy ${field}`);
    }
  assert.match(original(RB.naurlhug).text!, /Naurlhug/);
  assert.match(original(RB.book).text!, /Aule's Children/);
  assert.deepEqual(
    [RB.book, RB.gem, RB.torch, RB.keys, RB.map].filter((c) =>
      /the fist player/.test(original(c).text!),
    ).length,
    5,
  );
  // Typos and wording the scans correct.
  const fixes: [string, RegExp, RegExp][] = [
    [
      RB.stalking,
      /place 1 resource on Stalking the Ruins/,
      /place 1 progress token on Stalking the Ruins/,
    ],
    [RB.keys, /that hero's pool\.$/, /that hero's resource pool\./],
    [RB.naurlhug, /effects\. Cannot take damage\./, /effects, Cannot/],
    [RB.beast, /Shuffle Sword of Belegost, and/, /Shuffle the Sword/],
  ];
  for (const [code, fixed, typo] of fixes) {
    assert.match(card(code).text!, fixed, card(code).name);
    assert.match(original(code).text!, typo, card(code).name);
  }
  const backFixes: [string, RegExp, RegExp][] = [
    [RB.first, /^The players cannot advance/, /^The player cannot advance/],
    [
      RB.first,
      /advance to stage 2C\. Otherwise, advance to stage 2A\.$/,
      /advace to stage 2C/,
    ],
    [RB.first, /stage 2A\.$/, /Stage 2A/],
    [RB.deeper, /^The players cannot advance/, /^The player cannot advance/],
    [RB.servants, /Otherwise, advance to stage 3C\.$/, /Otherwise advance/],
    [
      RB.roots,
      /^The Discover value of the active location/,
      /value on the active/,
    ],
  ];
  for (const [code, fixed, typo] of backFixes) {
    assert.match(card(code).back_text!, fixed, card(code).name);
    assert.match(original(code).back_text!, typo, card(code).name);
  }
  assert.match(card(RB.echoes).shadow!, /\+2 \[attack\]\.$/);
  assert.doesNotMatch(original(RB.echoes).shadow!, /\.$/);
  // Branching and stage requirements are printed on the quest cards.
  assert.match(
    card(RB.first).back_text!,
    /if Keys of Belegost is attached to a hero, advance to stage 2C/,
  );
  assert.match(
    card(RB.evils).back_text!,
    /Lurker of the Depths is in the victory display/,
  );
  assert.match(card(RB.deeper).back_text!, /at least 3 resources here/);
  assert.match(
    card(RB.servants).back_text!,
    /Dwarven Torch is attached to a hero, advance to stage 4A/,
  );
  assert.match(
    card(RB.roots).back_text!,
    /Map of Ered Luin is attached to a hero advance to stage 4A/,
  );
  assert.match(
    card(RB.mines).back_text!,
    /Blue Mountain Gem is attached to a hero advance to stage 4A/,
  );
  assert.match(
    card(RB.beast).back_text!,
    /When Naurlhûg is defeated, the players win the game\.$/,
  );
  // Statistics from the scans.
  assert.deepEqual(
    [RB.naurlhug, RB.lurker, RB.orc, RB.troll, RB.goblin, RB.dweller].map(
      (code) => {
        const c = card(code);
        const p = c.printed_stats ?? {};
        return [
          c.engagement,
          p.threat ?? c.threat,
          p.attack ?? c.attack,
          p.defense ?? c.defense,
          c.health,
          c.victory ?? null,
        ];
      },
    ),
    [
      [20, "X", "7", "5", 20, 7],
      [50, "4", "5", "2", 12, 5],
      [30, "2", "4", "2", 4, null],
      [50, "3", "6", "3", 8, null],
      [25, "1", "3", "2", 3, null],
      [35, "X", "X", "X", 5, null],
    ],
  );
  assert.deepEqual(
    [RB.lair, RB.tunnel, RB.treasury, RB.mine, RB.chamber, RB.hall].map(
      (code) => {
        const c = card(code);
        return [c.threat, c.quest, c.victory ?? null, printedDiscover(code)];
      },
    ),
    [
      [4, 6, 4, 5],
      [3, 3, null, 2],
      [1, 4, null, 3],
      [2, 3, null, 2],
      [3, 2, null, 3],
      [4, 4, null, 4],
    ],
  );
  // Hazards: two treacheries, two enemies and a location.
  assert.deepEqual(
    RB_ENCOUNTERS.filter((c) => /Hazard\./.test(c.traits ?? ""))
      .map((c) => c.name)
      .sort(),
    [
      "Concealed Spikes",
      "Covered Pit",
      "Nameless Cave Dweller",
      "Old Stone Troll",
      "Secret Chamber",
    ],
  );
});
