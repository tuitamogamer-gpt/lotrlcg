import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import snapshot from "../src/data/pending/temple-of-the-deceived-import.json";
import encounters from "../src/data/temple-encounter-cards.json";
import quests from "../src/data/temple-quest-cards.json";
import recipes from "../src/data/temple-recipes.json";
import players from "../src/data/temple-player-cards.json";
import { SCRIPTED, playerCards } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";

const bytes = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url));
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const referenceCards = JSON.parse(bytes("public/catalog.json").toString()) as {
  code: string;
  text: string;
}[];

test("Temple import: the original reference catalog and recipes retain their pinned bytes", () => {
  assert.equal(
    hash(bytes("public/catalog.json")),
    "cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63",
  );
  assert.equal(
    hash(bytes("public/scenarios.json")),
    "00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f",
  );
  assert.equal(snapshot.cards.length, 27);
  const references = snapshot.cards.filter((c) => c.type_code === "rules");
  assert.equal(references.length, 2);
  for (const c of snapshot.cards)
    assert.equal(
      SCRIPTED.has(c.code),
      c.type_code !== "rules",
      `${c.name}: rulesheet proxies never become gameplay cards`,
    );
});

test("Temple import: runtime recipes only remove rulesheet proxies and restore the printed fourth Deeper copy", () => {
  const proxyCodes = new Set(
    snapshot.cards.filter((c) => c.type_code === "rules").map((c) => c.code),
  );
  const deeper = snapshot.cards.find(
    (c) => c.name === "Deeper into the Ruins",
  )!;
  assert.equal(
    deeper.quantity,
    3,
    "the pinned source quantity remains unchanged",
  );
  assert.equal(
    encounters.find((c) => c.code === deeper.code)!.quantity,
    4,
    "printed encounter indices 19–22 contain four copies",
  );
  assert.equal(
    players.reduce((n, c) => n + c.quantity, 0) +
      [...encounters, ...quests]
        .filter((c) => c.pack_code === "TotD" && !c.code.endsWith(":B"))
        .reduce((n, c) => n + c.quantity, 0),
    60,
    "28 player, 31 encounter and one quest card form the complete original pack",
  );
  assert.deepEqual(recipes.map((r) => r.id).sort(), ["E06.6", "Q06.6"]);
  for (const source of snapshot.recipes) {
    const runtime = recipes.find((r) => r.id === source.id)!;
    const expected = {
      ...source,
      card_codes: source.card_codes.filter((c) => !proxyCodes.has(c)),
      cards: source.cards
        .filter((c) => !proxyCodes.has(c.code))
        .map((c) => (c.code === deeper.code ? { ...c, quantity: 4 } : c)),
      sections: Object.fromEntries(
        Object.entries(source.sections).map(([section, entries]) => [
          section,
          Object.fromEntries(
            Object.entries(entries)
              .filter(([code]) => !proxyCodes.has(code))
              .map(([code, quantity]) => [
                code,
                code === deeper.code ? 4 : quantity,
              ]),
          ),
        ]),
      ),
    };
    assert.deepEqual(runtime, expected);
    const sectionSize = (section: keyof typeof runtime.sections) =>
      Object.values(runtime.sections[section]).reduce(
        (n, quantity) => n + quantity,
        0,
      );
    assert.equal(sectionSize("sharedQuestDeck"), 1);
    assert.equal(
      sectionSize("sharedEncounterDeck"),
      source.mode === "easy" ? 25 : 32,
    );
    assert.equal(sectionSize("sharedEncounterDeck2"), 15);
    assert.equal(sectionSize("sharedSetAside"), 4);
    assert.equal(
      runtime.cards.reduce((n, c) => n + c.quantity, 0),
      source.mode === "easy" ? 45 : 52,
    );
  }
});

test("Temple import: all forty original scenario scans retain their source bytes", () => {
  assert.equal(snapshot.artwork.length, 40);
  assert.equal(new Set(snapshot.artwork.map((a) => a.localPath)).size, 40);
  for (const image of snapshot.artwork) {
    const data = bytes(`public${image.localPath}`);
    assert.equal(data.length, image.bytes, image.localPath);
    assert.equal(hash(data), image.sha256, image.localPath);
    assert.equal(
      data.readUInt16BE(0),
      0xffd8,
      `${image.localPath}: original JPEG`,
    );
  }
  const allRuntimeCards = [...encounters, ...quests];
  for (const image of snapshot.artwork) {
    const sourceCard = snapshot.cards.find((c) => c.code === image.code)!;
    if (sourceCard.type_code === "rules") continue;
    const card = allRuntimeCards.find((c) => c.code === image.code)!;
    assert.ok(card, sourceCard.name);
    assert.equal(
      image.face === "back" ? card.back_imagesrc : card.imagesrc,
      image.localPath,
      `${sourceCard.name}: original face direction is preserved`,
    );
  }
});

test("Temple import: neutral Uncharted artwork does not encode a private reverse identity", () => {
  for (const [code, filename] of [
    ["temple-lost-island", "temple-lost-island.jpg"],
    ["temple-uncharted-temple", "temple-front.jpg"],
  ]) {
    const face = encounters.find((c) => c.code === code)!;
    assert.equal(
      face.quantity,
      0,
      "a shared face adds no physical recipe copy",
    );
    assert.equal(face.imagesrc, `/cards/${filename}`);
    const data = bytes(`public/cards/${filename}`);
    assert.ok(
      snapshot.artwork.some(
        (a) => a.face === "back" && a.sha256 === hash(data),
      ),
      `${filename}: the generic URL keeps the actual printed shared-face scan`,
    );
  }
});

test("Temple import: the printed grotto correction preserves the source transcription separately", () => {
  const grotto = encounters.find((c) => c.name === "The Grotto's Entrance")!;
  const source = referenceCards.find((c) => c.code === grotto.code)!;
  assert.match(source.text, /Immune to player card effects\./);
  assert.doesNotMatch(grotto.text, /Immune to player card effects\./);
  assert.match(grotto.back_text!, /Immune to player card effects\./);
  assert.match(grotto.text, /When the 8th progress is placed/);
});

test("Temple import: all ten original player designs resolve once in the supported pool", () => {
  assert.deepEqual(
    players.map((c) => c.code).sort(),
    Array.from({ length: 10 }, (_, i) => String(12057 + i)),
  );
  for (const card of players)
    assert.equal(
      playerCards.filter((c) => c.code === card.code).length,
      1,
      `${card.name}: canonical duplicates, including Ered Luin Miner, are reused`,
    );
});

test("Temple import: player inspection resolves the nine verified JPEG faces and Destrier PNG", () => {
  const paths = players.map((card) => cachedImageSource(card.imagesrc)!);
  assert.equal(new Set(paths).size, 10);
  assert.equal(paths.filter((path) => path.endsWith(".jpg")).length, 9);
  assert.equal(paths.filter((path) => path.endsWith(".png")).length, 1);
  for (const card of players) {
    const path = cachedImageSource(card.imagesrc)!;
    assert.equal(
      path,
      `/cards/${card.code}.${card.code === "12059" ? "png" : "jpg"}`,
    );
    const data = bytes(`public${path}`);
    assert.ok(
      data.length > 10_000,
      `${card.name}: a full card scan is present`,
    );
    if (card.code === "12059")
      assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    else assert.equal(data.readUInt16BE(0), 0xffd8);
  }
});
