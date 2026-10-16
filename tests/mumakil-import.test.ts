import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import original from "../src/data/pending/the-mumakil-import.json";
import encounters from "../src/data/mumakil-encounter-cards.json";
import quests from "../src/data/mumakil-quest-cards.json";
import recipes from "../src/data/mumakil-recipes.json";
import players from "../src/data/mumakil-player-cards.json";
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
  "17001": "c5d7235e3e389522a956a2ef546c7f33a6d5bb764780e7dc9486961ad2e6729b",
  "17002": "f5301f0d147dd20fe6ce6046a9d58c956ec48c877821391ca8c0cc14ec0fd47d",
  "17003": "c56c69b30f3f9b2b2edb7584e511bc55fb61ec223e8689fcc149618bd894a98b",
  "17004": "c6cec5ef5a78597b6600da26f66f359ff9d69a7cb407a387ea09fc5bf06220d0",
  "17005": "4174ab0909df9cedd7321ae7e7e338f083af227cc293ee720ace7c2e985adb19",
  "17006": "23456ca523f0639b0ace4381a1f34d9e6f5dfd8445302dd0cfcfb2ef8356bf5e",
  "17007": "925217bd06104abcd14f84f382fd9e8769b1423667a7abf19fed80f81e0ec43a",
  "17008": "191ee19a5b1808001fbce12b87a65b8de49a060abf6e6fb882872ed4c0b46843",
  "17009": "6a0d67c34cabee59d888b94bd4f42e6d3b757694f2d116fc45189c828512e654",
  "17010": "0a4e4fedc2b2520e1b9e77e51f2827f6c498a8c09151e854568ce15dd17daa70",
};

test("Mûmakil import: original catalogs and 21-identity snapshot stay immutable", () => {
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
      "src/data/pending/the-mumakil-import.json",
      "2a1b8c1723dbf013c7d512f5f980c02be2f6f031f5cfffc59bdc65e96fb548ae",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
  assert.equal(original.cards.length, 21);
  assert.equal(new Set(original.cards.map((c) => c.code)).size, 21);
  assert.equal(encounters.length, 15);
  assert.equal(quests.length, 2);
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
  assert.equal(original.cards.filter((c) => c.pack_code === "TSoH").length, 4);
  assert.equal(
    runtime.some((c) => c.pack_code !== "M"),
    false,
    "shared Jungle Forest definitions are reused",
  );
});

test("Mûmakil import: all original standard/easy physical rows are preserved", () => {
  const sectionTotals: Record<string, Record<string, number>> = {
    "Q07.4": {
      sharedQuestDeck: 2,
      sharedEncounterDeck: 28,
      sharedSetAside: 12,
    },
    "E07.4": {
      sharedQuestDeck: 2,
      sharedEncounterDeck: 21,
      sharedSetAside: 12,
    },
  };
  assert.deepEqual(recipes.map((r) => r.id).sort(), ["E07.4", "Q07.4"]);
  for (const recipe of recipes) {
    const source = original.recipes.find((r) => r.id === recipe.id)!;
    assert.equal(recipe.automated, true);
    assert.equal(recipe.campaign, false);
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
      sectionTotals[recipe.id],
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
    30,
  );
  assert.equal(
    quests.reduce((n, c) => n + c.quantity, 0),
    2,
  );
  assert.equal(
    players.reduce((n, c) => n + c.quantity, 0),
    28,
  );
  assert.equal(30 + 2 + 28, 60, "original MEC56 component count");
});

test("Mûmakil import: runtime copies restore omitted original printed rules", () => {
  assert.equal(byPosition(15).name, "Wild Mûmak");
  assert.equal(byPosition(15).traits, "Creature.");
  assert.match(byPosition(15).text!, /At the end of the round/);
  assert.match(byPosition(15).text!, /or it makes an immediate attack/);
  assert.match(byPosition(16).text!, /attacks and destroys a character/);
  assert.match(byPosition(16).shadow!, /additional attack against you/);
  assert.match(byPosition(20).text!, /Raise each player’s threat by 1/);
  assert.match(byPosition(21).text!, /attack the first player/);
  assert.match(byPosition(21).text!, /If no attacks are made this way/);
  assert.match(byPosition(25).text!, /Each location gets \+1 \[threat\]/);
  assert.match(byPosition(25).text!, /current quest/);
  assert.equal(byPosition(27).name, "Capture the Oliphaunts");
  assert.equal(byPosition(27).back_name, "Capture the Oliphaunts");
  assert.deepEqual(
    quests.map((c) => c.back_quest),
    [12, 8],
  );
  const immutableMumak = original.cards.find(
    (c) => c.position === 15 && c.pack_code === "M",
  )!;
  assert.equal(immutableMumak.name, "Wild Mumak");
  assert.doesNotMatch(immutableMumak.text, /At the end of the round/);
  const sideQuest = playerCards.find((c) => c.code === "17003")!;
  assert.equal(sideQuest.quest, 6);
  assert.equal(sideQuest.victory, 1);
});

test("Mûmakil import: all 23 original scenario faces retain pinned local bytes", () => {
  assert.equal(original.artwork.length, 23);
  assert.equal(new Set(original.artwork.map((f) => f.localPath)).size, 23);
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

test("Mûmakil import: ten original player identities resolve once with pinned scans", () => {
  assert.deepEqual(
    players.map((c) => c.code).sort(),
    Array.from({ length: 10 }, (_, i) => String(17001 + i)),
  );
  const catalog = JSON.parse(bytes("public/catalog.json").toString()) as Card[];
  for (const player of players) {
    assert.deepEqual(
      player,
      catalog.find((c) => c.code === player.code),
      player.name,
    );
    assert.equal(player.pack_code, "M");
    assert.equal(player.quantity, player.code === "17001" ? 1 : 3);
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
