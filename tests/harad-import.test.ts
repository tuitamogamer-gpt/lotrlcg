import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import umbar from "../src/data/pending/escape-from-umbar-import.json";
import desert from "../src/data/pending/desert-crossing-import.json";
import mordor from "../src/data/pending/the-long-arm-of-mordor-import.json";
import encounters from "../src/data/harad-encounter-cards.json";
import quests from "../src/data/harad-quest-cards.json";
import recipes from "../src/data/harad-recipes.json";
import players from "../src/data/harad-player-cards.json";
import { SCRIPTED, playerCards } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";
import type { Card } from "../src/game/types";

const bytes = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const snapshots = [umbar, desert, mordor];
const runtime = [...encounters, ...quests] as Card[];
const byPosition = (position: number) =>
  runtime.find((card) => card.position === position)!;
const sourcePosition = (position: number) =>
  snapshots.flatMap((s) => s.cards).find((card) => card.position === position)!;
const playerHashes: Record<string, string> = {
  "16001": "09e6a150217f4e5323a40e0a42d2cfb649d22f2c1d39dba833666798f2b57e5e",
  "16002": "12519bc06c5abb02670b1f848932767f8cae202318c5f527d94cd8bb3def0077",
  "16003": "8ef705c40c7b919de13b88c5327ed1d858b01d6b70dbe8dc0a682380d107c5f9",
  "16004": "b5b5f0e623ca0f77735bc957045f5520badb1e1ac900166e9f8860aac2ed48c9",
  "16005": "8622c7857256afc2dee90696364d7a204f7ec82e84eae2df943139c74475f7cf",
  "16006": "9ce72504b1bc3abedda18b09e946fcb4dddc50bf803502b2ae1eb43a2c62b45a",
  "16007": "4d9ccdb59b293b8026b9122b978f9aa657435e9fd1579ee4c78f3d4b6c92dd0d",
  "16008": "b9fa1937c4a437664a864e947848c52be31aaba78f34703accd714745e6ae5f7",
  "16009": "bb686acaec8b5e73053a9e20ba2f38873e18fd40d9d9e51d843947e0b73b5450",
  "16010": "99e5c0971b9cd7eb0613c7f73457aec36df9c1a469f57747bd1e6136dae57e24",
  "16011": "2a86bd0cad1e0df23934c66bbf96c1fa05446bb2d76d35a522773708140e4499",
  "16012": "9934883378a18a27f51c9b43812376c247da52db92980087a64675f66a4ca752",
  "16013": "55799e113965ca9547f0d7c82545fb1033ba54341ad08ceadd021094705f5284",
};

test("Harad import: immutable original sources retain all 61 identities", () => {
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
      "src/data/pending/escape-from-umbar-import.json",
      "01e62c5a0b06f85f08f8f979d4d7f0491362bbc2b1abe393957bbb207ced5c79",
    ],
    [
      "src/data/pending/desert-crossing-import.json",
      "5669f15003685692abd29da2cec842dd2061f501be3eeb98fbd57a2ba17810aa",
    ],
    [
      "src/data/pending/the-long-arm-of-mordor-import.json",
      "01b6e33045dcaaeb249e4980d7147a030ac6335e433fd7eb823b58e10ad2ea6b",
    ],
  ])
    assert.equal(hash(bytes(path)), expected, path);
  assert.deepEqual(
    snapshots.map((s) => s.cards.length),
    [18, 20, 23],
  );
  const originalCards = snapshots.flatMap((s) => s.cards);
  assert.equal(new Set(originalCards.map((c) => c.code)).size, 61);
  assert.equal(encounters.length, 52);
  assert.equal(quests.length, 9);
  for (const original of originalCards) {
    const promoted = runtime.find((c) => c.code === original.code)!;
    assert.ok(promoted, original.name);
    assert.equal(SCRIPTED.has(original.code), true, original.name);
    assert.equal(promoted.pack_code, "TSoH");
    assert.equal(promoted.official, true);
    assert.equal(promoted.nightmare, false);
    assert.deepEqual(
      promoted.packs,
      original.packs,
      `${original.name}: immutable original print identity`,
    );
  }
});

test("Harad import: corrected physical recipes match all original standard/easy quantities", () => {
  const expected: Record<string, number> = {
    "Q07.1": 39,
    "E07.1": 32,
    "Q07.2": 40,
    "E07.2": 34,
    "Q07.3": 42,
    "E07.3": 36,
  };
  const corrections: Record<string, Record<number, number>> = {
    "Q07.1": { 16: 5, 21: 2 },
    "E07.1": { 17: 1, 21: 2 },
    "E07.2": { 29: 2 },
    "E07.3": { 64: 2 },
  };
  assert.deepEqual(
    recipes.map((r) => r.id).sort(),
    Object.keys(expected).sort(),
  );
  for (const source of snapshots.flatMap((s) => s.recipes)) {
    const promoted = recipes.find((r) => r.id === source.id)!;
    assert.equal(promoted.automated, true);
    assert.equal(promoted.campaign, false);
    assert.equal(
      promoted.cards.reduce((n, c) => n + c.quantity, 0),
      expected[source.id],
    );
    assert.deepEqual(promoted.card_codes, source.card_codes);
    const reconstructed: Record<string, Record<string, number>> = {};
    for (const row of promoted.cards) {
      assert.ok(Number.isSafeInteger(row.quantity) && row.quantity > 0);
      (reconstructed[row.section] ??= {})[row.code] =
        ((reconstructed[row.section] ?? {})[row.code] ?? 0) + row.quantity;
    }
    assert.deepEqual(reconstructed, promoted.sections);
    for (const original of snapshots
      .flatMap((s) => s.cards)
      .filter((c) => source.card_codes.includes(c.code))) {
      const before = source.cards
        .filter((c) => c.code === original.code)
        .reduce((n, c) => n + c.quantity, 0);
      const after = promoted.cards
        .filter((c) => c.code === original.code)
        .reduce((n, c) => n + c.quantity, 0);
      assert.equal(
        after,
        corrections[source.id]?.[original.position] ?? before,
        `${source.id}: ${original.name}`,
      );
    }
  }
  assert.equal(
    encounters.reduce((n, c) => n + c.quantity, 0),
    112,
    "printed expansion encounter component count",
  );
  assert.equal(
    quests.reduce((n, c) => n + c.quantity, 0),
    9,
  );
  assert.equal(
    players.reduce((n, c) => n + c.quantity, 0),
    35,
  );
  assert.equal(112 + 9 + 35, 156, "printed MEC55 component total");
});

test("Harad import: printed corrections preserve X stats and exact targeting", () => {
  for (const position of [19, 23, 26, 36]) {
    assert.equal(sourcePosition(position).printed_stats.threat, "0");
    assert.equal(byPosition(position).printed_stats!.threat, "X");
    assert.equal(byPosition(position).threat, 0, "dynamic runtime base");
  }
  assert.match(sourcePosition(42).shadow!, /Choose an enemy/);
  assert.match(byPosition(42).shadow!, /Choose a non-unique enemy/);
  assert.equal(sourcePosition(45).name, "In Hostile Territory");
  assert.equal(byPosition(45).name, "In Enemy Territory");
  assert.equal(sourcePosition(61).victory, 3);
  assert.equal(byPosition(61).victory, undefined);
  assert.equal(byPosition(61).printed_stats!.victory, undefined);
  assert.match(
    byPosition(17).text!,
    /While Umbar Street is the active location/,
  );
  assert.match(byPosition(35).text!, /stage number of the main quest/);
  assert.match(
    byPosition(71).back_text!,
    /After placing progress on this stage from questing successfully/,
  );
  assert.equal(
    byPosition(23).victory,
    undefined,
    "Were-worm has no printed Victory",
  );
  assert.deepEqual(
    [66, 67, 68, 69, 70, 71, 72, 73, 74].map((n) => byPosition(n).back_quest),
    [15, 15, 8, 14, 16, 0, 5, 10, 15],
  );
});

test("Harad import: all 70 original scenario faces retain pinned local bytes", () => {
  const faces = snapshots.flatMap((s) => s.artwork);
  assert.equal(faces.length, 70);
  assert.equal(new Set(faces.map((f) => f.localPath)).size, 70);
  for (const face of faces) {
    const data = bytes(`public${face.localPath}`);
    assert.equal(data.length, face.bytes, face.localPath);
    assert.equal(hash(data), face.sha256, face.localPath);
    assert.equal(
      data.readUInt16BE(0),
      0xffd8,
      `${face.localPath}: original JPEG`,
    );
    const card = runtime.find((c) => c.code === face.code)!;
    assert.equal(
      face.face === "back" ? card.back_imagesrc : card.imagesrc,
      face.localPath,
    );
    assert.equal(cachedImageSource(face.source), face.localPath);
  }
});

test("Harad import: all 13 original player designs resolve once with pinned original scans", () => {
  assert.deepEqual(
    players.map((c) => c.code).sort(),
    Array.from({ length: 13 }, (_, i) => String(16001 + i)),
  );
  for (const original of players) {
    assert.equal(original.pack_code, "TSoH");
    assert.equal(original.quantity, Number(original.code) <= 16002 ? 1 : 3);
    assert.equal(
      playerCards.filter((c) => c.code === original.code).length,
      1,
      original.name,
    );
    assert.equal(SCRIPTED.has(original.code), true, original.name);
    const path = cachedImageSource(original.imagesrc)!;
    assert.equal(
      path,
      `/cards/${original.code}.${original.code === "16006" ? "png" : "jpg"}`,
    );
    const data = bytes(`public${path}`);
    assert.ok(data.length > 10_000, original.name);
    assert.equal(hash(data), playerHashes[original.code], original.name);
    if (original.code === "16006")
      assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    else assert.equal(data.readUInt16BE(0), 0xffd8);
  }
});
