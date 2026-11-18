import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  HD,
  HD_CORSAIR_DECK,
  HD_DAMAGED,
  HD_ENCOUNTERS,
  HD_QUESTS,
  HD_RECIPES,
  hdBack,
  hdPhysical,
  hdRecipe,
} from "../src/game/hunt-dreadnaught-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/the-hunt-for-the-dreadnaught-import.json";
import art from "./hunt-dreadnaught-art.json";
import quantities from "./hunt-dreadnaught-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
type Raw = {
  code: string;
  text?: string;
  back_text?: string;
  traits?: string;
  [k: string]: unknown;
};
const original = (code: string) =>
  (snapshot.cards as Raw[]).find((c) => c.code === hdPhysical(code))!;
const total = (code: string) =>
  hdRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Hunt for the Dreadnaught keeps the recipe's quantities (2 quest cards, 43 encounter cards, the 13-card Corsair deck and 20 set-aside cards) and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 46);
  assert.equal(snapshot.artwork.length, 58);
  // The other sides are their own definitions whose physical card is the front.
  const backs = HD_ENCOUNTERS.filter((c) => c.code.endsWith(":B"));
  assert.deepEqual(backs.map((c) => card(hdPhysical(c.code)).name).sort(), [
    "Dreadnaught",
    "Easy Mode",
    "Eithiliant",
    "Golden Wing",
    "Hard Mode",
    "Pride of Lebennin",
    "Silent Mist",
    "Standard Mode",
    "Swan Ship of Dol Amroth",
    "Twilight's Call",
  ]);
  assert.deepEqual(
    [...HD_ENCOUNTERS, ...HD_QUESTS]
      .filter((c) => !c.code.endsWith(":B"))
      .map((c) => c.code)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const b of backs) {
    assert.equal(total(b.code), 0, `${b.name}: no card of the recipe`);
    assert.equal(
      (b as { physical_code?: string }).physical_code,
      hdPhysical(b.code),
    );
    assert.equal(b.imagesrc, card(hdPhysical(b.code)).back_imagesrc);
  }
  assert.deepEqual(HD_RECIPES, snapshot.recipes);
  assert.deepEqual(
    HD_RECIPES.map((r) => r.id),
    ["Q99.15"],
  );
  assert.equal(
    automatedScenarioId({
      name: "The Hunt for the Dreadnaught",
      mode: "standard",
    }),
    "the-hunt-for-the-dreadnaught",
  );
  assert.equal(quantities.length, 46);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
  }
  const sum = (section: string) =>
    quantities
      .filter((r) => r.section === section)
      .reduce((n, r) => n + r.quantity, 0);
  assert.equal(sum("sharedQuestDeck"), 2);
  assert.equal(sum("sharedEncounterDeck"), 43);
  assert.equal(sum("sharedEncounterDeck2"), 13);
  assert.equal(sum("sharedSetAside"), 20);
  // The Corsair deck: the 13 non-Ship, non-unique Corsair enemies (18 to 30).
  assert.equal(HD_CORSAIR_DECK.length, 13);
  assert.ok(
    HD_CORSAIR_DECK.every(
      (c) =>
        card(c).type_code === "enemy" &&
        !card(c).is_unique &&
        /Corsair/.test(card(c).traits ?? ""),
    ),
  );
  assert.equal(
    hash("src/data/pending/the-hunt-for-the-dreadnaught-import.json"),
    "465640783813851677c26eab076af3821168b0fb8a727a6e5ac101a697a6de24",
  );
});

test("All 58 faces are pinned and the reviewed scans correct the catalog: the other sides' stats, the missing shadow effects, Massive, the Setup cards and the typos", () => {
  assert.equal(art.length, 58);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // The Upgraded sides and the Damaged Dreadnaught, read from the scans.
  const side = (c: string) => {
    const x = card(hdBack(c));
    return [
      x.traits,
      x.willpower ?? null,
      x.threat ?? null,
      x.attack,
      x.defense,
      x.health ?? null,
    ];
  };
  assert.deepEqual(
    [
      HD.eithiliant,
      HD.goldenWing,
      HD.pride,
      HD.silentMist,
      HD.swan,
      HD.twilight,
      HD.dreadnaught,
    ].map(side),
    [
      ["Grey Havens. Ship. Upgraded.", 6, null, 4, 4, 15],
      ["Grey Havens. Ship. Upgraded.", 3, null, 6, 4, 18],
      ["Gondor. Ship. Upgraded.", 4, null, 3, 6, 19],
      ["Gondor. Ship. Upgraded.", 5, null, 4, 5, 17],
      ["Gondor. Ship. Upgraded.", 4, null, 5, 4, 20],
      ["Grey Havens. Ship. Upgraded.", 4, null, 5, 5, 22],
      ["Corsair. Ship. Damaged.", null, 3, 5, 3, null],
    ],
  );
  assert.equal(card(HD_DAMAGED).victory, 99);
  assert.equal(card(HD.dreadnaught).printed_stats?.health, "*");
  // Typos, omissions and the catalog's backticks, read from the scans.
  const fixes: [string, "text" | "back_text", RegExp, RegExp][] = [
    [HD.easy, "text", /Add the Cobas Haven location/, /loction/],
    [
      HD.standard,
      "text",
      /Set aside all 7 unique enemies/,
      /Set the following enemies aside: all 7/,
    ],
    [
      HD.standard,
      "back_text",
      /any group\. Reveal the top card of the encounter deck\. \(Group limit/,
      /any group\. \(Group limit/,
    ],
    [
      HD.hard,
      "text",
      /2 Wicked Cove locations instead if there are 3/,
      /2 Wicked Cove locations if there are 3/,
    ],
    [
      HD.goldenWing,
      "text",
      /\nSetup: Reduce your threat by 3\./,
      /point\.Reduce your threat by 3\./,
    ],
    [
      HD.goldenWing,
      "back_text",
      /gets \+2 hit points and gains ranged/,
      /gains \+2 hit points/,
    ],
    [
      HD.silentMist,
      "text",
      /with a cost of 3 or more/,
      /with a cost 3 or more/,
    ],
    [
      HD.silentMist,
      "back_text",
      /with a cost of 3 or more/,
      /with cost 3 or more/,
    ],
    [
      HD.swan,
      "back_text",
      /After Swan of Dol Amroth flips/,
      /After Swan Ship of Dol Amroth flips/,
    ],
    [
      HD.dreadnaught,
      "text",
      /^Archery 1 per player\. Massive\. Immune to player card effects\./,
      /^Archery 1 Per Player\.\nArchery 1 Per Player\. Immune/,
    ],
    [
      HD.hydraken,
      "text",
      /^Immune to player card effects\./,
      /player cards effects/,
    ],
    [
      HD.skiff,
      "text",
      /either raise.*gains Boarding 1/s,
      /eithe raise.*Bording 1/s,
    ],
    [
      HD.skirmisher,
      "text",
      /and gains the ship-objective/,
      /and gaines the ship-objective/,
    ],
    [HD.cobas, "text", /the Boarding value/, /the Boading value/],
    [
      HD.mouths,
      "text",
      /staging area, it gains: "Forced:/,
      /staging area, is gains/,
    ],
    [HD.tolfalas, "text", /^While Tolfalas Landing/, /^While Tofalas Landing/],
    [HD.ballista, "text", /each player's threat/, /each players threat/],
    [HD.tempest, "text", /assigns X damage among/, /assigns X among/],
  ];
  for (const [code, field, fixed, typo] of fixes) {
    assert.match(card(code)[field]!, fixed, `${card(code).name} ${field}`);
    assert.match(
      String(original(code)[field] ?? ""),
      typo,
      `${card(code).name} ${field}`,
    );
  }
  // The keyword line printed once (the catalog repeats it).
  assert.match(
    card(HD.eithiliant).text!,
    /^Immune to player card effects\. Sentinel\.\n/,
  );
  assert.match(String(original(HD.eithiliant).text), /^Sentinel\.\nImmune/);
  // The catalog prints no shadow effects; the scans have 14.
  const shadows = HD_ENCOUNTERS.filter((c) => c.shadow).map((c) => c.name);
  assert.deepEqual(shadows.sort(), [
    "Ballista Barrage",
    "Belfalas Shipyard",
    "Black Sails",
    "Boarding Party",
    "Gondorian Warship",
    "Grappled!",
    "Mouths of Anduin",
    "Out of the Mist",
    "Overworked",
    "Ramming Ship",
    "Taking on Water",
    "Tolfalas Landing",
    "Violent Tempest",
    "Wicked Cove",
  ]);
  assert.ok(snapshot.cards.every((c) => !(c as { shadow?: string }).shadow));
  for (const c of [...HD_ENCOUNTERS, ...HD_QUESTS])
    for (const field of ["text", "back_text", "shadow", "traits"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(
        v,
        /  |\s$|`|[a-z]\.[A-Z]|\."[A-Z]/,
        `${c.name}: tidy ${field}`,
      );
    }
  assert.deepEqual(
    HD_QUESTS.map((q) => [q.name, q.back_name]),
    [
      ["Searching the High Seas", "Searching the High Seas"],
      ["Destroy the Dreadnaught", "Destroy the Dreadnaught"],
    ],
  );
});
