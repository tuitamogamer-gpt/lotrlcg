import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import original from "../src/data/pending/race-across-harad-import.json";
import encounters from "../src/data/race-harad-encounter-cards.json";
import quests from "../src/data/race-harad-quest-cards.json";
import recipes from "../src/data/race-harad-recipes.json";
import players from "../src/data/race-harad-player-cards.json";
import haradEncounters from "../src/data/harad-encounter-cards.json";
import { SCRIPTED, playerCards } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";
import type { Card } from "../src/game/types";

const bytes = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const runtime = [...encounters, ...quests] as Card[];
const byPosition = (position: number) =>
  runtime.find((c) => c.position === position)!;
const playerHashes: Record<string, string> = {
  "17028": "e48bcdb2847259cd1e06387fa8da6190ac5c4437e51340c2e801c065c2122745",
  "17029": "8ca107124d28d98f27a754470dcd0d9781ffc1be7175653f76fd4bcebfe2318d",
  "17030": "062a536e4a2e7335c65ee95e04886ae99fa1e8ea24abc8380922f96d376c4d2c",
  "17031": "0307f7b8e48619b2f63a15a318363c9d557129e72eee8bcb013342ae8057ab77",
  "17032": "82cd657e5c5cc74db3752046021ed347d1bbe384ad1631d21002899823654241",
  "17033": "cf28270f540109e229605cad7dff8d82c9a270c99b7311941f97f30f6ba59bb5",
  "17034": "a11e58c7e807d4f0a5b5d635bdd73e6e61c28c331e5c8941e317f20d235f678d",
  "17035": "b05603881ba943d36f99b2d53ae3b9e312d32c9b3ceb5eb8abc602f154f29bec",
  "17036": "189509247fbd0e87a1d6695b0aec147a3979c4e1d2300f5526e59164fba6a391",
  "17037": "a10363cf1adb26c8190ee87f0eb156028888e121ecf80db6457ca3d0db16d39a",
};
const easyCorrections: Record<string, number> = {
  "octgn:25b9113d-1096-4b8d-a2d3-1eb134fbca62": 3,
  "octgn:2ce0c7c6-e7ae-4847-a02d-2be874afa3d4": 3,
  "octgn:27d6c3df-c7dc-4ea0-941f-dcad65b3f1eb": 2,
};

test("Race Harad import: original inputs and 28-identity snapshot stay immutable", () => {
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
      "src/data/pending/race-across-harad-import.json",
      "8d9a6672bf7a35ecdab637d6f43718499479faa698a600d24d87f6631fcc3385",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
  assert.equal(original.cards.length, 28);
  assert.equal(new Set(original.cards.map((c) => c.code)).size, 28);
  assert.equal(encounters.length, 9);
  assert.equal(quests.length, 8);
  assert.equal(original.cards.filter((c) => c.pack_code === "TSoH").length, 11);
  for (const source of original.cards) {
    const promoted = [...runtime, ...haradEncounters].find(
      (c) => c.code === source.code,
    )!;
    assert.ok(promoted, source.name);
    assert.deepEqual(promoted.packs, source.packs, source.name);
    assert.equal(promoted.official, true);
    assert.equal(promoted.nightmare, false);
    assert.equal(SCRIPTED.has(source.code), true, source.name);
  }
  assert.ok(
    runtime.every((c) => c.pack_code === "RAH"),
    "shared Harad definitions are reused",
  );
});

test("Race Harad import: original physical recipes retain only the three documented easy corrections", () => {
  const totals: Record<string, Record<string, number>> = {
    "Q07.5": {
      sharedQuestDeck: 4,
      sharedQuestDeck2: 3,
      sharedEncounterDeck: 33,
      sharedSetAside: 13,
    },
    "E07.5": {
      sharedQuestDeck: 4,
      sharedQuestDeck2: 3,
      sharedEncounterDeck: 29,
      sharedSetAside: 13,
    },
  };
  assert.deepEqual(recipes.map((r) => r.id).sort(), ["E07.5", "Q07.5"]);
  for (const recipe of recipes) {
    const source = structuredClone(
      original.recipes.find((r) => r.id === recipe.id)!,
    );
    assert.equal(recipe.automated, true);
    assert.equal(recipe.campaign, false);
    if (recipe.mode === "easy") {
      for (const row of source.cards)
        if (
          row.section === "sharedEncounterDeck" &&
          easyCorrections[row.code]
        ) {
          assert.equal(row.quantity, easyCorrections[row.code] - 1);
          row.quantity = easyCorrections[row.code];
          source.sections.sharedEncounterDeck[
            row.code as keyof typeof source.sections.sharedEncounterDeck
          ] = row.quantity;
        }
    }
    assert.deepEqual(recipe.cards, source.cards);
    assert.deepEqual(recipe.card_codes, source.card_codes);
    assert.deepEqual(recipe.sections, source.sections);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(recipe.sections).map(([k, v]) => [
          k,
          Object.values(v).reduce((n, q) => n + q, 0),
        ]),
      ),
      totals[recipe.id],
    );
    const reconstructed: Record<string, Record<string, number>> = {};
    for (const row of recipe.cards) {
      assert.ok(Number.isSafeInteger(row.quantity) && row.quantity > 0);
      const section = (reconstructed[row.section] ??= {});
      section[row.code] = (section[row.code] ?? 0) + row.quantity;
    }
    assert.deepEqual(reconstructed, recipe.sections);
  }
  assert.equal(
    encounters.reduce((n, c) => n + c.quantity, 0),
    24,
  );
  assert.equal(
    quests.reduce((n, c) => n + c.quantity, 0),
    8,
  );
  assert.equal(
    players.reduce((n, c) => n + c.quantity, 0),
    28,
  );
  assert.equal(24 + 8 + 28, 60, "original MEC57 component count");
});

test("Race Harad import: runtime copies restore original setup, traits and printed variable stats", () => {
  assert.equal(byPosition(38).name, "Tamed Mûmak");
  assert.equal(byPosition(38).willpower, 2);
  assert.equal(byPosition(38).attack, 5);
  assert.equal(byPosition(38).defense, 2);
  assert.equal(byPosition(38).health, 8);
  assert.match(
    byPosition(47).text!,
    /Set River Harnen and 1 copy of Uruk Warg-rider aside/,
  );
  assert.match(byPosition(47).text!, /Place Uruk Chieftain in the Orcs’ area/);
  assert.equal(byPosition(47).back_quest, 0);
  assert.equal(byPosition(41).printed_stats?.threat, "X");
  assert.equal(byPosition(42).traits, "Desert.");
  assert.deepEqual(
    quests.map((c) => c.back_quest),
    [0, 15, 20, 20, 10, 15, 20, 20],
  );
  assert.match(
    byPosition(54).back_text!,
    /total \[threat\] of each engaged enemy/,
  );
  const sourceSetup = original.cards.find(
    (c) => c.position === 47 && c.pack_code === "RAH",
  )!;
  assert.match(sourceSetup.text, /Set Ford of Harnen/);
  const sourceRoad = original.cards.find(
    (c) => c.position === 42 && c.pack_code === "RAH",
  )!;
  assert.equal(sourceRoad.traits, "Desert. Road.");
  const sideQuest = playerCards.find((c) => c.code === "17036")!;
  assert.equal(sideQuest.quest, 6);
  assert.equal(sideQuest.victory, 1);
});

test("Race Harad import: all 36 original scenario faces retain pinned local bytes", () => {
  assert.equal(original.artwork.length, 36);
  assert.equal(new Set(original.artwork.map((f) => f.localPath)).size, 36);
  for (const face of original.artwork) {
    const data = bytes(`public${face.localPath}`);
    assert.equal(data.length, face.bytes, face.localPath);
    assert.equal(hash(data), face.sha256, face.localPath);
    assert.equal(data.readUInt16BE(0), 0xffd8, face.localPath);
    assert.equal(cachedImageSource(face.source), face.localPath);
    const card = [...runtime, ...haradEncounters].find(
      (c) => c.code === face.code,
    )!;
    assert.equal(
      face.face === "back" ? card.back_imagesrc : card.imagesrc,
      face.localPath,
    );
  }
});

test("Race Harad import: all ten original player identities resolve once with pinned original scans", () => {
  assert.deepEqual(
    players.map((c) => c.code).sort(),
    Array.from({ length: 10 }, (_, i) => String(17028 + i)),
  );
  const catalog = JSON.parse(bytes("public/catalog.json").toString()) as Card[];
  for (const player of players) {
    assert.deepEqual(
      player,
      catalog.find((c) => c.code === player.code),
      player.name,
    );
    assert.equal(player.pack_code, "RAH");
    assert.equal(player.quantity, player.code === "17028" ? 1 : 3);
    assert.equal(
      playerCards.filter((c) => c.code === player.code).length,
      1,
      player.name,
    );
    assert.equal(SCRIPTED.has(player.code), true, player.name);
    const path = cachedImageSource(player.imagesrc)!;
    assert.equal(path, `/cards/${player.code}.jpg`);
    const data = bytes(`public${path}`);
    assert.equal(data.readUInt16BE(0), 0xffd8, player.name);
    assert.equal(hash(data), playerHashes[player.code], player.name);
  }
});
