import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import snapshot from "../src/data/pending/a-storm-on-cobas-haven-import.json";
import encounters from "../src/data/cobas-encounter-cards.json";
import quests from "../src/data/cobas-quest-cards.json";
import recipes from "../src/data/cobas-recipes.json";
import players from "../src/data/cobas-player-cards.json";
import symbols from "../src/data/cobas-sailing-icons.json";
import { SCRIPTED, playerCards } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";
import { COBAS_ADVENTURES } from "../src/game/cobas-scenario-data";

const bytes = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const runtimeCards = [...encounters, ...quests];
const byName = (name: string) =>
  snapshot.cards.find((card) => card.name === name)!;
const runtime = (name: string) =>
  runtimeCards.find((card) => card.name === name)!;
const playerImageHashes: Record<string, string> = {
  "12109": "d402715b8dca2d00bfa67435babeacf2805cd56aa077c88c6c893335f5d94ba7",
  "12110": "81e0f1fb49ca3754132b578eff042e1ec59d699c15fb66955bd51b2967a0fd24",
  "12111": "e01451591d168fc01e89b91881a2712c2ef2fb3f2324178b0932b98e18107efd",
  "12112": "415cf9c115846918fdba7d9a37544f9f92e9a10a0534d3521dffca1fc0a488e2",
  "12113": "cb4d4e338c8a344a4b8bd261f5efc48877e87b021bc56955038856c98634703c",
  "12114": "3d665f1db6f10c073545fbc5dae53bdde61bac2e27ec9acf982495741e11ae1c",
  "12115": "bc1cb71605c961d26c75bf256c03d73b9ed4d797dbd130608448a3a0114d16c6",
  "12116": "05258440a235216c69ed0bf32a8e084ed5c44662cdee439d6e3939aaee326906",
  "12117": "60a6e51edeadd8a2f102b7506dc2d110358332542392673855b498486499d71d",
  "12118": "94826cf711c6ba419c64ae3cd3246a709f8aa4f6cf7a3022f55d6a4c7493b937",
  "12119": "282d955630f07af288e33ffdd2f46b94aecedbfc128c0f38b6c1e519c3b16d25",
};

test("Cobas import: immutable sources retain all 38 original identities", () => {
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
      "src/data/pending/a-storm-on-cobas-haven-import.json",
      "44ef0bff2f11c0e06d3f6996b37ded2a51398da51dcb42de61f0361df8f97af8",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
  assert.equal(snapshot.cards.length, 38);
  assert.deepEqual(COBAS_ADVENTURES[0].sets, [
    "A Storm on Cobas Haven",
    "Voyage Across Belegaer",
    "Umbar Fleet",
    "Corsair Pirates",
    "Corsair Raiders",
    "The Dream-chaser's Fleet",
  ]);
  assert.equal(new Set(snapshot.cards.map((card) => card.code)).size, 38);
  assert.equal(
    snapshot.cards.filter((card) => card.type_code === "rules").length,
    1,
  );
  assert.equal(
    snapshot.cards.filter((card) => card.pack_code === "SoCH").length,
    19,
  );
  for (const card of snapshot.cards) {
    assert.equal(
      SCRIPTED.has(card.code),
      card.type_code !== "rules",
      card.name,
    );
    if (card.type_code === "rules") continue;
    const promoted = runtimeCards.find((entry) => entry.code === card.code)!;
    assert.ok(promoted, `${card.name}: original physical identity is retained`);
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
    ] as const)
      assert.deepEqual(promoted[field], card[field], `${card.name}: ${field}`);
  }
});

test("Cobas import: recipes apply only the proxy exclusion and five printed easy removals", () => {
  assert.deepEqual(recipes.map((recipe) => recipe.id).sort(), [
    "E06.8",
    "Q06.8",
  ]);
  const proxy = byName("A Storm on Cobas Haven").code;
  const easyRemovals = new Map([
    [byName("Siege Ship").code, 1],
    [byName("Heavy Cruiser").code, 1],
    [byName("Coast of Anfalas").code, 2],
    [byName("Taking on Water").code, 1],
  ]);
  for (const source of snapshot.recipes) {
    const promoted = recipes.find((recipe) => recipe.id === source.id)!;
    const expectedCards = source.cards
      .filter((card) => card.code !== proxy)
      .map((card) => ({
        ...card,
        quantity:
          card.quantity -
          (source.mode === "easy" && card.section === "sharedEncounterDeck"
            ? (easyRemovals.get(card.code) ?? 0)
            : 0),
      }))
      .filter((card) => card.quantity > 0);
    const expectedSections = Object.fromEntries(
      Object.keys(source.sections).map((section) => [
        section,
        Object.fromEntries(
          expectedCards
            .filter((card) => card.section === section)
            .map((card) => [card.code, card.quantity]),
        ),
      ]),
    );
    assert.deepEqual(promoted, {
      ...source,
      automated: true,
      card_codes: source.card_codes.filter((code) =>
        expectedCards.some((card) => card.code === code),
      ),
      cards: expectedCards,
      sections: expectedSections,
    });
    const sizes = Object.fromEntries(
      Object.entries(promoted.sections).map(([section, entries]) => [
        section,
        Object.values(entries).reduce((n, quantity) => n + quantity, 0),
      ]),
    );
    assert.deepEqual(sizes, {
      sharedQuestDeck: 3,
      sharedEncounterDeck: source.mode === "easy" ? 23 : 33,
      sharedEncounterDeck2: source.mode === "easy" ? 12 : 16,
      sharedSetAside: 7,
      sharedStagingArea: 6,
    });
    assert.equal(
      promoted.cards.reduce((sum, card) => sum + card.quantity, 0),
      source.mode === "easy" ? 51 : 65,
    );
  }
  assert.equal(
    players.reduce((sum, card) => sum + card.quantity, 0),
    31,
  );
  assert.equal(
    runtimeCards
      .filter((card) => card.pack_code === "SoCH")
      .reduce((sum, card) => sum + card.quantity, 0),
    29,
  );
});

test("Cobas import: original printed metadata corrects Flagship timing, Islet victory and Haven shadow", () => {
  assert.match(
    byName("Raider Flagship").text,
    /At the beginning of the encounter phase/,
  );
  assert.match(
    runtime("Raider Flagship").text,
    /At the end of the encounter phase/,
  );
  assert.equal(runtime("Raider Flagship").victory, 20);
  assert.equal(runtime("Raider Flagship").is_unique, true);
  assert.equal(byName("Belfalas Islet").victory, undefined);
  assert.equal(runtime("Belfalas Islet").victory, 1);
  assert.match(byName("Cobas Haven").shadow!, /off-course/);
  assert.ok(
    !runtime("Cobas Haven").shadow,
    "the printed Haven face has no shadow divider or text",
  );
  assert.deepEqual(
    [
      runtime("Outmaneuver the Enemy").back_quest,
      runtime("Battle in the Bay").back_quest,
      runtime("Break Through the Fleet!").back_quest,
    ],
    [10, 16, 5],
  );
});

test("Cobas import: all 43 original scenario face bytes and face directions are preserved", () => {
  assert.equal(snapshot.artwork.length, 43);
  assert.equal(
    new Set(snapshot.artwork.map((face) => face.localPath)).size,
    43,
  );
  assert.equal(
    snapshot.artwork.filter(
      (face) =>
        snapshot.cards.find((card) => card.code === face.code)!.pack_code ===
        "SoCH",
    ).length,
    23,
  );
  for (const face of snapshot.artwork) {
    const data = bytes(`public${face.localPath}`);
    assert.equal(data.length, face.bytes, face.localPath);
    assert.equal(hash(data), face.sha256, face.localPath);
    assert.equal(data.readUInt16BE(0), 0xffd8, `${face.localPath}: JPEG`);
    const original = snapshot.cards.find((card) => card.code === face.code)!;
    if (original.type_code === "rules") continue;
    const promoted = runtimeCards.find((card) => card.code === face.code)!;
    assert.equal(
      face.face === "back" ? promoted.back_imagesrc : promoted.imagesrc,
      face.localPath,
      `${original.name}: original face direction`,
    );
    assert.equal(cachedImageSource(face.source), face.localPath);
  }
});

test("Cobas import: all fifteen new encounter fronts have visually verified Sailing metadata", () => {
  const expected = new Set([
    "Heavy Cruiser",
    "Coast of Anfalas",
    "Ramming Speed!",
    "The Raiders' Assault",
    "Sea-ward Tower",
    "Tower of the Gull",
    "The Beacon",
    "Tower of the Heron",
  ]);
  assert.equal(symbols.cards.length, 15);
  const encounterCodes = snapshot.cards
    .filter(
      (card) =>
        card.pack_code === "SoCH" &&
        !["quest", "rules"].includes(card.type_code),
    )
    .map((card) => card.code)
    .sort();
  assert.deepEqual(
    symbols.cards.map((card) => card.code).sort(),
    encounterCodes,
  );
  for (const card of symbols.cards) {
    assert.equal(
      card.sailingSymbols,
      expected.has(card.name) ? 1 : 0,
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

test("Cobas import: all eleven original player designs resolve once with pinned local scans", () => {
  assert.deepEqual(
    players.map((card) => card.code).sort(),
    Array.from({ length: 11 }, (_, i) => String(12109 + i)),
  );
  for (const card of players) {
    assert.equal(card.pack_code, "SoCH");
    assert.equal(card.position, Number(card.code) - 12000);
    assert.equal(card.quantity, card.code === "12109" ? 1 : 3);
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
