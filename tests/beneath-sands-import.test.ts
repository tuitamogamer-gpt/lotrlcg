import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import original from "../src/data/pending/beneath-the-sands-import.json";
import encounters from "../src/data/beneath-sands-encounter-cards.json";
import quests from "../src/data/beneath-sands-quest-cards.json";
import recipes from "../src/data/beneath-sands-recipes.json";
import players from "../src/data/beneath-sands-player-cards.json";
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
  "17055": "38bace4165673e8d0047f7245ca73412e30f259dc9a232ded0634a78a57f35c6",
  "17056": "0c147f0cc44a44a5fff07cde785965eb7a6e00e4da3c853176f2012fe336b8c1",
  "17057": "390e847bc567416676b01934be2b4b0f99deec98443c5d3b70774422d436a8ba",
  "17058": "ba2c3cdd1d42ebed13c15085c52d1364d3ac6301e32696d68b1e4a9271759b12",
  "17059": "b0cca52a476d918b992e13981b755863045c1c9cfb013f5af0659ce6464b82e1",
  "17060": "56b506b33cc761abf1f80dde9ba695903a92622b59334b0641a85bee702b759b",
  "17061": "da8487272bafd61d22e3f140394f474d2ac592e21494dbad434c4713977742ee",
  "17062": "38cf4e9a89ac6e8f51a86a610847620a4892d6960188cb3cc1dd3ad04a97b952",
  "17063": "7afdb2140a66b8965728607a1b426e9361e4085fd06fd3dabe1c2779ef9949d6",
  "17064": "b7757029e3c4fb5874fad4d1f3bd897ba256002c4cbdc85e38f340ff4c0a3b75",
};
const easyCorrections: Record<string, number> = {
  "octgn:9afed95c-399f-4823-a277-342ece74a9e4": 3,
  "octgn:f02f15ee-3262-435a-b894-8f4003068c32": 2,
  "octgn:8c15fd9d-0956-474a-9051-51f36890c7a5": 3,
  "octgn:a5aef3fe-7bb9-4165-ba0f-91127d8f21e3": 3,
};

test("Beneath Sands import: immutable original inputs retain 21 original scenario identities", () => {
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
      "src/data/pending/beneath-the-sands-import.json",
      "9f4316ea095634147e40c30807f53c3a10201fdaabec9c7ec95bc26f7f2df18d",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
  assert.equal(
    original.sources.expansionRules,
    "https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec58_web_beneath_the_sands-rules.pdf",
  );
  assert.equal(original.cards.length, 21);
  assert.equal(new Set(original.cards.map((c) => c.code)).size, 21);
  assert.equal(encounters.length, 12);
  assert.equal(quests.length, 3);
  assert.equal(original.cards.filter((c) => c.pack_code === "TSoH").length, 6);
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
    runtime.every((c) => c.pack_code === "BtS"),
    "shared original Harad records are reused",
  );
});

test("Beneath Sands import: physical recipes apply only the four printed easy corrections", () => {
  const totals: Record<string, Record<string, number>> = {
    "Q07.6": {
      sharedQuestDeck: 3,
      sharedEncounterDeck: 39,
      sharedSetAside: 1,
      sharedStagingArea: 1,
    },
    "E07.6": {
      sharedQuestDeck: 3,
      sharedEncounterDeck: 36,
      sharedSetAside: 1,
      sharedStagingArea: 1,
    },
  };
  assert.deepEqual(recipes.map((r) => r.id).sort(), ["E07.6", "Q07.6"]);
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
    29,
  );
  assert.equal(
    quests.reduce((n, c) => n + c.quantity, 0),
    3,
  );
  assert.equal(
    players.reduce((n, c) => n + c.quantity, 0),
    28,
  );
  assert.equal(29 + 3 + 28, 60, "original MEC58 component count");
  const standard = recipes.find((r) => r.mode === "standard")!;
  const easy = recipes.find((r) => r.mode === "easy")!;
  assert.deepEqual(
    standard.cards
      .filter(
        (r) =>
          r.quantity !== easy.cards.find((e) => e.code === r.code)?.quantity,
      )
      .map((r) => original.cards.find((c) => c.code === r.code)!.name)
      .sort(),
    ["Enfeebled", "Injured Companion", "Sand Viper"],
  );
});

test("Beneath Sands import: runtime Search, quest, Track marks and variable stats match original faces", () => {
  assert.match(byPosition(80).text!, /‘On Track’ in the lower right corner/);
  assert.match(byPosition(80).back_text!, /place 1 resource here/);
  assert.match(
    original.cards.find((c) => c.position === 80)!.back_text!,
    /place 1 progress here/,
  );
  assert.equal(byPosition(69).printed_stats?.threat, "X");
  assert.equal(byPosition(70).quest, 3);
  assert.equal(original.cards.find((c) => c.position === 70)!.quest, 4);
  assert.match(
    byPosition(75).text!,
    /ignore its Forced effects until the end of the phase/,
  );
  assert.equal(byPosition(75).quest, 5);
  assert.equal(byPosition(75).victory, 10);
  assert.equal(byPosition(78).name, "The Spiders’ Hive");
  assert.equal(byPosition(78).back_name, "The Spiders’ Hive");
  assert.deepEqual(
    quests.map((c) => c.back_quest),
    [5, 5, 5],
  );
  assert.ok(quests.every((c) => !c.back_text.startsWith("5\n")));
  assert.deepEqual(
    encounters
      .filter((c) => c.on_track)
      .map((c) => c.position)
      .sort((a, b) => a - b),
    [66, 67, 69, 70, 72],
  );
  assert.deepEqual(
    Object.fromEntries(
      encounters.filter((c) => c.track).map((c) => [c.position, c.track]),
    ),
    { "69": 4, "70": 3, "71": 2, "72": 2 },
  );
  assert.deepEqual(
    [
      byPosition(65).threat,
      byPosition(65).attack,
      byPosition(65).defense,
      byPosition(65).health,
      byPosition(65).engagement,
      byPosition(65).victory,
    ],
    [4, 6, 4, 12, 50, 4],
  );
  const player = (code: string) => playerCards.find((c) => c.code === code)!;
  assert.match(player("17056").text!, /Harad/);
  assert.doesNotMatch(player("17056").text!, /Haradrim<\/b>/);
  assert.equal(player("17058").victory, 1);
  assert.equal(player("17059").quest, 6);
  assert.equal(player("17059").victory, 1);
  assert.match(player("17060").text!, /exhaust to quest/);
  assert.equal(player("17062").name, "Dúnedain Lookout");
});

test("Beneath Sands import: all 25 original scenario faces retain pinned local bytes", () => {
  assert.equal(original.artwork.length, 25);
  assert.equal(new Set(original.artwork.map((f) => f.localPath)).size, 25);
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

test("Beneath Sands import: all ten original player identities resolve once with pinned original scans", () => {
  assert.deepEqual(
    players.map((c) => c.code).sort(),
    Array.from({ length: 10 }, (_, i) => String(17055 + i)),
  );
  const catalog = JSON.parse(bytes("public/catalog.json").toString()) as Card[];
  for (const player of players) {
    assert.deepEqual(
      player,
      catalog.find((c) => c.code === player.code),
      player.name,
    );
    assert.equal(player.pack_code, "BtS");
    assert.equal(player.quantity, player.code === "17055" ? 1 : 3);
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
