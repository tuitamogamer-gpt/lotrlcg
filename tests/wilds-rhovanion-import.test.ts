import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import anduin from "../src/data/pending/journey-up-the-anduin-import.json";
import mirkwood from "../src/data/pending/lost-in-mirkwood-import.json";
import kings from "../src/data/pending/the-king-s-quest-import.json";
import encounters from "../src/data/wilds-rhovanion-encounter-cards.json";
import quests from "../src/data/wilds-rhovanion-quest-cards.json";
import recipes from "../src/data/wilds-rhovanion-recipes.json";
import { SCRIPTED, card } from "../src/game/cards";
import { WILDS_RHOVANION as W } from "../src/game/wilds-rhovanion-support";
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const bytes = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));
const snapshots = [anduin, mirkwood, kings];
test("Wilds original immutable catalog and all three pending imports remain exact", () => {
  for (const [path, expected] of [
    [
      "public/catalog.json",
      "cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63",
    ],
    [
      "public/scenarios.json",
      "00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f",
    ],
    [
      "src/data/official-player-cards.json",
      "9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd",
    ],
    [
      "src/data/pending/journey-up-the-anduin-import.json",
      "1e9546bd65a90e11acccd1e92b100f924821825b77ba772d280b71d3dac34e45",
    ],
    [
      "src/data/pending/lost-in-mirkwood-import.json",
      "be88807a6062d9734bc1470828270d5bbd9a29cb69af3f816db43fa6e322d2a3",
    ],
    [
      "src/data/pending/the-king-s-quest-import.json",
      "69cf09709d4388b7eeedc47e019aaac42d88c87321513947725955b6edd533ff",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
});
test("Wilds original deluxe contains 102 encounter cards and 13 quests, including one physical Haldan reverse", () => {
  assert.equal(encounters.filter((c) => c.code !== W.haldan).length, 51);
  assert.equal(quests.length, 13);
  assert.equal(
    encounters
      .filter((c) => c.code !== W.haldan)
      .reduce((n, c) => n + c.quantity, 0),
    102,
  );
  assert.equal(
    quests.reduce((n, c) => n + c.quantity, 0),
    13,
  );
  assert.equal(card(W.haldan).imagesrc, card(W.village).back_imagesrc);
  assert.deepEqual(
    [
      card(W.haldan).willpower,
      card(W.haldan).attack,
      card(W.haldan).defense,
      card(W.haldan).health,
    ],
    [2, 3, 1, 4],
  );
  for (const c of [...encounters, ...quests]) {
    assert.equal(c.official, true, c.name);
    assert.equal(c.nightmare, false, c.name);
    assert.equal(c.pack_code, "TWoR");
    assert.equal(SCRIPTED.has(c.code), true, c.name);
  }
});
test("Wilds standard/easy recipes preserve original piles and correct only missing easy Stone-troll", () => {
  const totals: Record<string, Record<string, number>> = {
    "Q08.1": {
      sharedQuestDeck: 3,
      sharedEncounterDeck: 35,
      sharedEncounterDeck2: 8,
      sharedSetAside: 2,
    },
    "E08.1": {
      sharedQuestDeck: 3,
      sharedEncounterDeck: 22,
      sharedEncounterDeck2: 6,
      sharedSetAside: 2,
    },
    "Q08.2": {
      sharedQuestDeck: 7,
      sharedEncounterDeck: 32,
      sharedEncounterDeck2: 12,
      sharedEncounterDeck3: 14,
      sharedStagingArea: 5,
      player1Play1: 1,
    },
    "E08.2": {
      sharedQuestDeck: 7,
      sharedEncounterDeck: 24,
      sharedEncounterDeck2: 8,
      sharedEncounterDeck3: 9,
      sharedStagingArea: 5,
      player1Play1: 1,
    },
    "Q08.3": {
      sharedQuestDeck: 3,
      sharedEncounterDeck: 35,
      sharedSetAside: 6,
      sharedEncounterDeck2: 6,
    },
    "E08.3": {
      sharedQuestDeck: 3,
      sharedEncounterDeck: 26,
      sharedSetAside: 4,
      sharedEncounterDeck2: 6,
    },
  };
  for (const r of recipes) {
    const source = structuredClone(
      snapshots.flatMap((b) => b.recipes).find((v) => v.id === r.id)!,
    );
    if (r.id === "E08.3") {
      const row = source.cards.find((c) => c.code === W.troll)!;
      assert.equal(row.quantity, 1);
      row.quantity = 2;
      (source.sections.sharedEncounterDeck as Record<string, number>)[W.troll] =
        2;
    }
    assert.equal(r.automated, true);
    assert.deepEqual(r.cards, source.cards);
    assert.deepEqual(r.sections, source.sections);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(r.sections).map(([k, v]) => [
          k,
          Object.values(v).reduce((n, q) => n + q, 0),
        ]),
      ),
      totals[r.id],
    );
    assert.equal(r.campaign, false);
  }
});
test("Wilds all 106 original scenario faces decode locally and match immutable download pins", () => {
  const art = [
    ...new Map(
      snapshots.flatMap((b) => b.artwork).map((a) => [a.localPath, a]),
    ).values(),
  ];
  assert.equal(art.length, 106);
  for (const a of art) {
    const b = bytes(`public${a.localPath}`);
    assert.equal(b.length, a.bytes, a.localPath);
    assert.equal(hash(b), a.sha256, a.localPath);
    assert.ok(
      (b[0] === 255 && b[1] === 216) || (b[0] === 137 && b[1] === 80),
      a.localPath,
    );
    assert.match(
      a.source,
      /^https:\/\/(dragncards-lotrlcg\.s3\.amazonaws\.com|ringsdb\.com)\//,
    );
  }
  for (const source of snapshots.flatMap((b) => b.cards)) {
    const c = card(source.code);
    if (source.pack_code === "TWoR") {
      assert.equal(c.official, true);
      assert.equal(c.nightmare, false);
    }
    if (source.pack_code === "TWoR") assert.equal(c.imagesrc, source.imagesrc);
    if (source.back_imagesrc)
      assert.equal(c.back_imagesrc, source.back_imagesrc);
  }
});
test("Wilds printed variable Fire-drake and Stone-troll restrictions retain source corrections", () => {
  assert.equal(card(W.drake).attack, 7);
  assert.equal(card(W.drake).health, 17);
  assert.equal(card(W.drake).engagement, 35);
  assert.match(card(W.drake).text!, /X is 1 more than the number of players/);
  assert.match(card(W.troll).text!, /Cannot have player card attachments/);
  assert.match(
    kings.cards.find((c) => c.code === W.troll)!.text!,
    /non-objective/,
  );
  for (const c of quests)
    assert.ok(c.back_imagesrc && typeof c.back_quest === "number");
});
