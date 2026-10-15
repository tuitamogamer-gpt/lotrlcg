import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import snapshot from "../src/data/pending/the-city-of-corsairs-import.json";
import encounters from "../src/data/city-encounter-cards.json";
import quests from "../src/data/city-quest-cards.json";
import recipes from "../src/data/city-recipes.json";
import players from "../src/data/city-player-cards.json";
import symbols from "../src/data/city-sailing-icons.json";
import { SCRIPTED, playerCards } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";

const bytes = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const runtimeCards = [...encounters, ...quests];
const original = (name: string) =>
  snapshot.cards.find((card) => card.name === name)!;
const runtime = (name: string) =>
  runtimeCards.find((card) => card.name === name)!;
const playerImageHashes: Record<string, string> = {
  "12138": "9aa2174680691979fc3a045f00be9b8f95cf79dddb2856f8d883579f37ce7cf3",
  "12139": "16cee74bc2d4b60de8332a72aa931f38ac1834d81aafcaf40c57b2933618e800",
  "12140": "23711f2a486f178184f6eddec8cec107c5923871807e8ebac56dd2d108e7c25c",
  "12141": "e126c3827d2307328ccea0ec039b8f3a0dec898aba9a68d7f4c7b05073fff331",
  "12142": "58a15f91f4d5ee5cb7732a83071747819876ba235aa535bf8803bababe9f3961",
  "12143": "02b340214a54a2bb69b889e2703a3fdad0c93db232f75e73bf331d09033b7e71",
  "12144": "55a092aa4df3608c606667c4c32dfcc1c1c57c987ec525bc91fdc877672b92dd",
  "12145": "a45fed6dccef4b17fc49340b6ad1a784a85d6b1bef3f346914f9c113ad7b0b26",
  "12146": "1009a15f12c0acbfdcbd56e1a75a4d462e7f91e465c9b7af7994a5efd2fc9051",
};

test("City import: immutable original sources retain all 38 scenario identities", () => {
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
      "src/data/pending/the-city-of-corsairs-import.json",
      "3a97eabbb41c8f9d424b8dcd95fa8706ffc80956b1a258c73523f5681e264804",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
  assert.equal(snapshot.cards.length, 38);
  assert.equal(new Set(snapshot.cards.map((card) => card.code)).size, 38);
  assert.equal(
    snapshot.cards.filter((card) => card.pack_code === "CoC").length,
    19,
  );
  assert.equal(
    snapshot.cards.filter((card) => card.type_code === "rules").length,
    0,
  );
  assert.equal(encounters.length, 34);
  assert.equal(quests.length, 4);
  for (const card of snapshot.cards) {
    const promoted = runtimeCards.find((entry) => entry.code === card.code)!;
    assert.ok(promoted, `${card.name}: original physical identity`);
    assert.equal(SCRIPTED.has(card.code), true, card.name);
    for (const field of [
      "octgnid",
      "pack_code",
      "pack_name",
      "quantity",
      "source",
      "source_url",
      "official",
      "nightmare",
      "packs",
    ] as const)
      assert.deepEqual(promoted[field], card[field], `${card.name}: ${field}`);
  }
});

test("City import: original recipes correct only the missing Slave Ship easy removal", () => {
  assert.deepEqual(recipes.map((recipe) => recipe.id).sort(), [
    "E06.9",
    "Q06.9",
  ]);
  const slave = original("Slave Ship").code;
  for (const source of snapshot.recipes) {
    const promoted = recipes.find((recipe) => recipe.id === source.id)!;
    const expected = structuredClone(source);
    if (source.mode === "easy") {
      expected.sections.sharedEncounterDeck[
        slave as keyof typeof expected.sections.sharedEncounterDeck
      ]--;
      expected.cards.find((card) => card.code === slave)!.quantity--;
    }
    assert.deepEqual(promoted, { ...expected, automated: true });
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(promoted.sections).map(([section, entries]) => [
          section,
          Object.values(entries).reduce((sum, count) => sum + count, 0),
        ]),
      ),
      {
        sharedQuestDeck: 4,
        sharedEncounterDeck: source.mode === "easy" ? 21 : 32,
        sharedEncounterDeck2: source.mode === "easy" ? 6 : 10,
        sharedEncounterDeck3: source.mode === "easy" ? 11 : 15,
        sharedSetAside: 7,
        sharedStagingArea: 3,
      },
    );
    assert.equal(
      promoted.cards.reduce((sum, card) => sum + card.quantity, 0),
      source.mode === "easy" ? 52 : 71,
    );
  }
  assert.equal(
    players.reduce((sum, card) => sum + card.quantity, 0),
    25,
  );
  assert.equal(
    runtimeCards
      .filter((card) => card.pack_code === "CoC")
      .reduce((sum, card) => sum + card.quantity, 0),
    35,
  );
});

test("City import: printed faces correct Stormcaller, Sahír and the final quest", () => {
  assert.equal(original("Stormcaller").health, 16);
  assert.equal(runtime("Stormcaller").health, 18);
  assert.equal(runtime("Stormcaller").printed_stats.health, "18");
  assert.equal(original("Captain Sahír").victory, undefined);
  assert.equal(runtime("Captain Sahír").victory, 20);
  assert.equal(runtime("Captain Sahír").printed_stats.victory, "20");
  assert.match(
    original("Final Confrontation").back_text!,
    /While another enemy/,
  );
  assert.match(
    runtime("Final Confrontation").back_text!,
    /While any enemy has resources on it/,
  );
  assert.equal(runtime("City of Corsairs").printed_stats.threat, "X");
  assert.equal(runtime("City of Corsairs").position, 161);
  assert.equal(runtime("Umbar Harbor").position, 162);
  assert.equal(
    runtime("Fate of The Dream-chaser").encounter_set,
    "The City of Corsairs",
  );
  for (const name of ["Southern Belfalas", "Corsair Waters"]) {
    assert.match(original(name).text, /Shadow Text:Shadow:/);
    assert.ok(!runtime(name).text.includes("Shadow Text:"));
    assert.match(runtime(name).shadow!, /^Shadow:/);
  }
  assert.match(runtime("Starlit Sea").text, /Starlit Sea gains/);
  assert.deepEqual(
    [
      runtime("The Coast of Umbar").back_quest,
      runtime("Fate of The Dream-chaser").back_quest,
      runtime("The Haven of Umbar").back_quest,
      runtime("Final Confrontation").back_quest,
    ],
    [15, 0, 18, 0],
  );
  assert.equal(
    runtime("The Haven of Umbar").back_text,
    undefined,
    "the original 3B face has flavor text only",
  );
});

test("City import: all 43 original scenario faces retain pinned local bytes and direction", () => {
  assert.equal(snapshot.artwork.length, 43);
  assert.equal(
    new Set(snapshot.artwork.map((face) => face.localPath)).size,
    43,
  );
  assert.equal(
    snapshot.artwork.filter(
      (face) =>
        original(snapshot.cards.find((card) => card.code === face.code)!.name)
          .pack_code === "CoC",
    ).length,
    23,
  );
  for (const face of snapshot.artwork) {
    const data = bytes(`public${face.localPath}`);
    assert.equal(data.length, face.bytes, face.localPath);
    assert.equal(hash(data), face.sha256, face.localPath);
    assert.equal(data.readUInt16BE(0), 0xffd8, `${face.localPath}: JPEG`);
    const promoted = runtimeCards.find((card) => card.code === face.code)!;
    assert.equal(
      face.face === "back" ? promoted.back_imagesrc : promoted.imagesrc,
      face.localPath,
    );
    assert.equal(cachedImageSource(face.source), face.localPath);
  }
});

test("City import: Sailing symbols are visually pinned for all fifteen new encounter fronts", () => {
  assert.equal(symbols.cards.length, 15);
  assert.deepEqual(
    symbols.cards.map((card) => card.code).sort(),
    encounters
      .filter((card) => card.pack_code === "CoC")
      .map((card) => card.code)
      .sort(),
  );
  for (const card of symbols.cards) {
    assert.equal(
      card.sailingSymbols,
      ["Southern Belfalas", "Corsair Waters"].includes(card.name) ? 1 : 0,
      card.name,
    );
    const front = snapshot.artwork.find(
      (face) => face.code === card.code && face.face === "front",
    )!;
    assert.equal(card.image, front.localPath);
    assert.equal(card.sha256, front.sha256);
    assert.equal(hash(bytes(`public${card.image}`)), card.sha256);
  }
});

test("City import: nine original player designs resolve once with their original scans", () => {
  assert.deepEqual(
    players.map((card) => card.code).sort(),
    Array.from({ length: 9 }, (_, i) => String(12138 + i)),
  );
  for (const card of players) {
    assert.equal(card.pack_code, "CoC");
    assert.equal(card.position, Number(card.code) - 12000);
    assert.equal(card.quantity, card.code === "12138" ? 1 : 3);
    assert.equal(
      playerCards.filter((entry) => entry.code === card.code).length,
      1,
      card.name,
    );
    assert.equal(SCRIPTED.has(card.code), true, card.name);
    const path = cachedImageSource(card.imagesrc)!;
    assert.equal(path, `/cards/${card.code}.jpg`);
    const data = bytes(`public${path}`);
    assert.ok(data.length > 10_000, `${card.name}: full scan`);
    assert.equal(hash(data), playerImageHashes[card.code], card.name);
    assert.equal(data.readUInt16BE(0), 0xffd8);
  }
});
