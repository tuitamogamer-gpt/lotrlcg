import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ADG,
  ADG_ENCOUNTERS,
  ADG_QUESTS,
  ADG_RECIPES,
  ADG_SIEGE,
  adgRecipe,
} from "../src/game/attack-dol-guldur-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/attack-on-dol-guldur-import.json";
import art from "./attack-dol-guldur-art.json";
import quantities from "./attack-dol-guldur-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (code: string) =>
  adgRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Attack on Dol Guldur keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 32);
  assert.equal(snapshot.artwork.length, 40);
  assert.deepEqual(
    [...ADG_ENCOUNTERS, ...ADG_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(ADG_RECIPES, snapshot.recipes);
  // One recipe: the scenario predates official easy mode, and its set-aside
  // cards hold both setup cards (standard mode leaves the epic one unused).
  assert.deepEqual(
    ADG_RECIPES.map((r) => r.id),
    ["Q99.10"],
  );
  assert.equal(
    automatedScenarioId({ name: "Attack on Dol Guldur", mode: "standard" }),
    "attack-on-dol-guldur",
  );
  assert.equal(quantities.length, 32);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
  }
  // Hall of Beorn lists 49 encounter cards (both setup cards) and the 6
  // quest cards.
  const sum = (type?: string) =>
    quantities
      .filter((r) => (type ? r.type === type : true))
      .reduce((n, r) => n + r.quantity, 0);
  assert.equal(sum(), 49 + 6);
  assert.equal(sum("quest"), 6);
  assert.equal(sum("campaign"), 2);
  const sections = snapshot.recipes[0].sections;
  assert.deepEqual(
    Object.keys(sections.sharedSetAside)
      .map((c) => card(c).name)
      .sort(),
    [
      "Bane of Amon Lanc",
      "Chieftain Morlug",
      "Dungeon Dweller",
      "Epic Multiplayer Mode",
      "Host of Lórien",
      "Sorcerer of Dol Guldur",
      "Standard Game Mode",
    ],
  );
  assert.deepEqual(
    Object.entries(sections.sharedStagingArea)
      .map(([c, n]) => `${card(c).name} ${n}`)
      .sort(),
    ["Dol Guldur 1", "Dol Guldur Marauder 4", "Power of Lórien 1"],
  );
  assert.equal(
    hash("src/data/pending/attack-on-dol-guldur-import.json"),
    "93571eb4356101315667757c63f2513c4f80142c6305cf6cf4a96e00bb7a92d8",
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
  // Every stage has "–" quest points.
  assert.deepEqual(
    ADG_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Assault on the Golden Wood", null],
      ["Crossing the Anduin", null],
      ["The Siege of Dol Guldur", null],
      ["The Tower of Sorcery", null],
      ["Battle Under the Trees", null],
      ["Dungeons of the Necromancer", null],
    ],
  );
  // The catalog glues each quest card's front text before its back text.
  for (const q of ADG_QUESTS) {
    assert.ok(original(q.code).back_text!.startsWith(original(q.code).text!));
    assert.ok(!q.back_text!.startsWith("When Revealed: Remove all tokens"));
  }
  assert.match(card(ADG.golden).back_text!, /^Forced: At the end of the round/);
  // The catalog drops the accent of Lórien.
  for (const c of [...ADG_ENCOUNTERS, ...ADG_QUESTS])
    for (const field of ["text", "back_text", "shadow", "traits"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(v, /Lorien/, c.name);
      assert.doesNotMatch(
        v,
        /  |\s$|`|[a-z]\.[A-Z]/,
        `${c.name}: tidy ${field}`,
      );
    }
  assert.match(original(ADG.power).text!, /Power of Lorien/);
  // Typos and missing text the scans correct.
  const fixes: [string, "text" | "back_text", RegExp, RegExp][] = [
    [ADG.gate, "text", /"The players cannot travel/, /"The player cannot/],
    [ADG.mode, "text", /increase its value/, /increase it's value/],
    [
      ADG.trees,
      "back_text",
      /remove an additional 5 progress to choose a non-unique enemy/,
      /additional 5 progress from this stage to choose a non-unique/,
    ],
    [
      ADG.dungeons,
      "back_text",
      /additional 5 progress to choose a player at any stage\. That player searches the top 10 cards of his deck for an ally and puts it into play\.$/,
      /from this stage to choose a player at any stage\. That player searches the top 10 cards of his deck for an ally an puts/,
    ],
    [
      ADG.epic,
      "text",
      /Create 3 separate staging areas,/,
      /Create 3 separate staging area,/,
    ],
    [ADG.epic, "back_text", /the siege fails/, /the siege falls/],
  ];
  for (const [code, field, fixed, typo] of fixes) {
    assert.match(card(code)[field]!, fixed, card(code).name);
    assert.match(original(code)[field]!, typo, card(code).name);
  }
  // The Tower of Sorcery keeps "from this stage" (3D's scan).
  assert.match(
    card(ADG.tower).back_text!,
    /remove an additional 5 progress from this stage to choose a player/,
  );
  assert.doesNotMatch(
    card(ADG.epic).text!,
    /removes their copy of Dol Guldur\. Each other team/,
  );
  // Dungeon Dweller is immune to player card effects (scan 7/47).
  assert.match(
    card(ADG.dweller).text!,
    /^Indestructible\. Immune to player card effects\./,
  );
  assert.doesNotMatch(original(ADG.dweller).text!, /Immune/);
  // Battle Warg has a shadow effect the catalog omits (scan 21/47).
  assert.equal(
    card(ADG.warg).shadow,
    "Shadow: Discard an attachment you control.",
  );
  assert.equal(original(ADG.warg).shadow ?? null, null);
  assert.match(
    card(ADG.woods).shadow!,
    /^Shadow: Attacking enemy gets \+1 \[attack\]\./,
  );
  assert.match(
    card(ADG.fastness).shadow!,
    /\+1 \[attack\] and \+1 \[defense\] .*\(\+2 \[attack\] and \+2 \[defense\] instead/,
  );
  assert.equal(card(ADG.power).traits, "Lórien.");
  // Statistics from the scans.
  assert.deepEqual(
    [
      ADG.bane,
      ADG.sorcerer,
      ADG.morlug,
      ADG.dweller,
      ADG.army,
      ADG.olog,
      ADG.beast,
      ADG.archer,
      ADG.marauder,
      ADG.warg,
    ].map((code) => {
      const c = card(code);
      return [
        c.engagement,
        c.printed_stats?.threat ?? c.threat,
        c.attack,
        c.defense,
        c.health,
        c.victory ?? null,
        ADG_SIEGE[code] ?? null,
      ];
    }),
    [
      [45, "3", 5, 3, 9, 5, null],
      [45, "3", 6, 2, 9, 5, null],
      [45, "3", 3, 4, 8, 5, null],
      [45, "3", 4, 3, 8, 5, null],
      [40, "X", 8, 4, 12, null, 4],
      [34, "4", 6, 4, 9, null, 3],
      [31, "3", 5, 3, 5, null, 2],
      [36, "2", 4, 1, 4, null, 1],
      [24, "2", 3, 1, 3, null, 1],
      [18, "1", 3, 2, 2, null, 1],
    ],
  );
  assert.deepEqual(
    [ADG.gate, ADG.sorcery, ADG.road, ADG.door, ADG.forest, ADG.woods].map(
      (code) => {
        const c = card(code);
        return [c.threat, c.quest, ADG_SIEGE[code] ?? null];
      },
    ),
    [
      [2, 4, 2],
      [2, 4, 2],
      [2, 4, 2],
      [2, 4, 2],
      [1, 5, null],
      [3, 3, null],
    ],
  );
  const host = card(ADG.host);
  assert.deepEqual(
    [host.willpower, host.attack, host.defense, host.health],
    [3, 3, 3, 6],
  );
  assert.equal(card(ADG.city).is_unique, true);
  assert.equal(card(ADG.power).is_unique, false);
});
