import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import snapshot from "../src/data/pending/the-drowned-ruins-import.json";
import encounters from "../src/data/drowned-encounter-cards.json";
import quests from "../src/data/drowned-quest-cards.json";
import recipes from "../src/data/drowned-recipes.json";
import players from "../src/data/drowned-player-cards.json";
import { SCRIPTED, playerCards } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";

const bytes = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const originals = new Set(snapshot.cards.map((card) => card.code));
const runtimeCards = [...encounters, ...quests];
const playerImageHashes: Record<string, string> = {
  "12082": "4a5751e323007e7f6a493b0c840a428f65c5c343083c31576be52095752e9a70",
  "12083": "39f9d009f50227da492da0a3515f1af6c0e171d077c3fa7cfa4fe945b39e72e1",
  "12084": "877ad9044a2a33712af6ad2a0f0057e1dd859f3b0108e9ee5b82b854b16f720c",
  "12085": "a96468014cd11a0a5f092bd7d2ff1409352b5ed9ee224debe7e4866fa52247b1",
  "12086": "08dcdfe2fb96bebabcc6846a031087b2cc628e496c525ba10a16ee3844d0db17",
  "12087": "ce0095d5489fabc38478431dcf11813d4f6f2a185d5e5ae640c9ec43b504394f",
  "12088": "f718ff4e0604c3efdf0bbbf4ab801177e9a0b8282cb9c2602495d4d8e2bc4904",
  "12089": "e1e32ddee3c715067f19758fd923f57c3a83006d1e6aa72eb9347decd7a1e9bd",
  "12090": "74f026aa77ba0e4691a4ce186a127b68b1a58837bf5682838dc4b7ac503f97b9",
  "12091": "32f6a36b5c8b0d07c1da25e05fa6dc4798a3b2fd48462876613b96b7ed740a81",
};

test("Drowned import: immutable references retain every original source identity", () => {
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
      "src/data/pending/the-drowned-ruins-import.json",
      "a01c25f96f5d16d27ec1d40c4610843209f42e79fc28d7f03487521d881c58e2",
    ],
  ]) {
    assert.equal(hash(bytes(path)), expected, path);
  }
  assert.equal(snapshot.cards.length, 23);
  assert.equal(originals.size, 23);
  assert.equal(
    snapshot.cards.filter((card) => card.type_code === "rules").length,
    1,
  );
  for (const card of snapshot.cards) {
    assert.equal(
      SCRIPTED.has(card.code),
      card.type_code !== "rules",
      `${card.name}: the rulesheet proxy is retained only as a reference`,
    );
    if (card.type_code === "rules") continue;
    const runtime = runtimeCards.find((entry) => entry.code === card.code)!;
    assert.ok(
      runtime,
      `${card.name}: the original physical identity is retained`,
    );
    for (const field of [
      "octgnid",
      "pack_code",
      "pack_name",
      "position",
      "quantity",
      "source",
      "source_url",
      "official",
      "nightmare",
      "packs",
    ] as const) {
      assert.deepEqual(runtime[field], card[field], `${card.name}: ${field}`);
    }
  }
});

test("Drowned import: runtime recipes remove only the rulesheet and preserve physical quantities", () => {
  const proxies = new Set(
    snapshot.cards
      .filter((card) => card.type_code === "rules")
      .map((card) => card.code),
  );
  assert.deepEqual(recipes.map((recipe) => recipe.id).sort(), [
    "E06.7",
    "Q06.7",
  ]);
  for (const source of snapshot.recipes) {
    const runtime = recipes.find((recipe) => recipe.id === source.id)!;
    assert.deepEqual(runtime, {
      ...source,
      card_codes: source.card_codes.filter((code) => !proxies.has(code)),
      cards: source.cards.filter((card) => !proxies.has(card.code)),
      sections: Object.fromEntries(
        Object.entries(source.sections).map(([section, entries]) => [
          section,
          Object.fromEntries(
            Object.entries(entries).filter(([code]) => !proxies.has(code)),
          ),
        ]),
      ),
    });
    const sectionSize = (section: keyof typeof runtime.sections) =>
      Object.values(runtime.sections[section]).reduce(
        (sum, quantity) => sum + quantity,
        0,
      );
    assert.equal(sectionSize("sharedQuestDeck"), 2);
    assert.equal(
      sectionSize("sharedEncounterDeck"),
      source.mode === "easy" ? 21 : 30,
    );
    assert.equal(sectionSize("sharedEncounterDeck2"), 8);
    assert.equal(sectionSize("sharedSetAside"), 1);
    assert.equal(sectionSize("player1Play1"), 1);
    assert.equal(sectionSize("sharedStagingArea"), 1);
    assert.equal(
      runtime.cards.reduce((sum, card) => sum + card.quantity, 0),
      source.mode === "easy" ? 34 : 43,
    );
    assert.ok(
      runtime.card_codes.every((code) => originals.has(code)),
      "face aliases never add physical copies",
    );
  }
  assert.equal(
    players.reduce((sum, card) => sum + card.quantity, 0),
    28,
  );
  assert.equal(
    runtimeCards
      .filter((card) => card.pack_code === "DR" && originals.has(card.code))
      .reduce((sum, card) => sum + card.quantity, 0),
    32,
    "30 original encounter cards and two quests complete the 60-card pack",
  );
});

test("Drowned import: Grotto faces retain their eight physical reverse pairings", () => {
  const pairs = snapshot.cards.filter(
    (card) =>
      card.pack_code === "DR" &&
      card.type_code === "location" &&
      card.back_name &&
      card.name !== "Shrine to Morgoth",
  );
  assert.deepEqual(
    pairs.map((card) => [card.name, card.back_name, card.quantity]).sort(),
    [
      ["Cursed Caverns", "Sunken Temple", 1],
      ["Cursed Caverns", "Twisting Hollow", 2],
      ["Undersea Grotto", "Dark Abyss", 2],
      ["Undersea Grotto", "Twisting Hollow", 1],
      ["Water-Logged Halls", "Dark Abyss", 1],
      ["Water-Logged Halls", "Sunken Temple", 1],
    ].sort(),
  );
  for (const card of pairs) {
    const reverse = encounters.find(
      (entry) => entry.code === `${card.code}:B`,
    )!;
    assert.equal(reverse.physical_code, card.code);
    assert.equal(reverse.source_face, "back");
    assert.equal(reverse.name, card.back_name);
    assert.equal(reverse.imagesrc, card.back_imagesrc);
    assert.equal(reverse.quest, card.back_quest);
    assert.equal(reverse.victory, 2);
    assert.match(reverse.traits, /Underwater\./);
    assert.doesNotMatch(reverse.traits, /Grotto\./);
    const printedThreat: Record<string, number> = {
      "Dark Abyss": 5,
      "Twisting Hollow": 4,
      "Sunken Temple": 3,
    };
    assert.equal(reverse.threat, printedThreat[reverse.name]);
    assert.equal(
      reverse.traits.includes("Ruins."),
      reverse.name === "Sunken Temple",
    );
  }
  const shrine = encounters.find(
    (card) => card.name === "Shrine to Morgoth" && originals.has(card.code),
  )!;
  assert.equal(
    snapshot.cards.find((card) => card.code === shrine.code)!.is_unique,
    true,
    "the immutable source also preserves the unique symbol",
  );
  for (const code of [shrine.code, `${shrine.code}:B`]) {
    const face = encounters.find((card) => card.code === code)!;
    assert.equal(
      face.is_unique,
      true,
      "the original scan prints the unique diamond on both faces",
    );
    assert.equal(face.threat, 5);
    assert.equal(face.quest, 18);
    assert.equal(face.victory, 5);
  }
});

test("Drowned import: all 35 original scenario faces retain their source bytes and direction", () => {
  assert.equal(snapshot.artwork.length, 35);
  assert.equal(
    new Set(snapshot.artwork.map((image) => image.localPath)).size,
    35,
  );
  for (const image of snapshot.artwork) {
    const data = bytes(`public${image.localPath}`);
    assert.equal(data.length, image.bytes, image.localPath);
    assert.equal(hash(data), image.sha256, image.localPath);
    assert.equal(
      data.readUInt16BE(0),
      0xffd8,
      `${image.localPath}: original JPEG`,
    );
    const source = snapshot.cards.find((card) => card.code === image.code)!;
    if (source.type_code === "rules") continue;
    const card = runtimeCards.find((entry) => entry.code === image.code)!;
    assert.equal(
      image.face === "back" ? card.back_imagesrc : card.imagesrc,
      image.localPath,
      `${source.name}: original face direction`,
    );
  }
});

test("Drowned import: public Grotto faces reveal no physical reverse identity", () => {
  for (const code of [
    "drowned-undersea-grotto",
    "drowned-cursed-caverns",
    "drowned-water-logged-halls",
  ]) {
    const face = encounters.find((card) => card.code === code)!;
    assert.ok(face, code);
    assert.equal(face.quantity, 0, "shared display faces add no physical copy");
    assert.equal(face.back_name, undefined);
    assert.equal(face.back_imagesrc, undefined);
    assert.equal(face.physical_code, undefined);
    assert.equal(face.octgnid, undefined);
    assert.equal(face.packs, undefined);
    assert.equal(
      face.imagesrc,
      `/cards/${code}.jpg`,
      "the public image URL does not encode a physical pairing",
    );
    assert.ok(
      snapshot.artwork.some(
        (entry) =>
          entry.face === "front" &&
          entry.sha256 === hash(bytes(`public${face.imagesrc}`)),
      ),
      "public faces reuse unmodified printed artwork",
    );
  }
});

test("Drowned import: ten original player designs resolve once with local artwork", () => {
  assert.deepEqual(
    players.map((card) => card.code).sort(),
    Array.from({ length: 10 }, (_, index) => String(12082 + index)),
  );
  for (const card of players) {
    assert.equal(card.pack_code, "DR");
    assert.equal(card.position, Number(card.code) - 12000);
    assert.equal(card.quantity, card.code === "12082" ? 1 : 3);
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
    assert.equal(
      hash(data),
      playerImageHashes[card.code],
      `${card.name}: original RingsDB scan bytes`,
    );
    assert.equal(data.readUInt16BE(0), 0xffd8);
  }
});
