import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { WRATH_RUIN_PLAYER_ART } from "./wrath-ruin-player-art";
import { WRATH_RUIN_SCENARIO_ART } from "./wrath-ruin-scenario-art";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const snapshot = () => read("src/data/pending/wrath-and-ruin-import.json");
const encounters = () => read("src/data/wrath-ruin-encounter-cards.json");
const quests = () => read("src/data/wrath-ruin-quest-cards.json");
const players = () => read("src/data/wrath-ruin-player-cards.json");
const warriors = "octgn:bbc72a18-cf4c-469f-bd01-6b1d3492c2ff";

test("Wrath keeps the original source catalog and preparation snapshot immutable", () => {
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
      "src/data/pending/wrath-and-ruin-import.json",
      "d36c0fbcccf4b5d040c45c73f72f3e0b50f9d5c033299c2b68c2b57c94a1bd61",
    ],
  ])
    assert.equal(hash(path), expected, path);
});

test("Wrath adds only the omitted Warriors of the East to the original recipe identities and physical sections", () => {
  const original = snapshot();
  assert.equal(original.cards.length, 24);
  assert.equal(original.artwork.length, 26);
  assert.ok(!original.cards.some((c: any) => c.code === warriors));
  const runtime = [...encounters(), ...quests()];
  assert.equal(runtime.length, 25);
  assert.deepEqual(
    runtime.map((c: any) => c.code).sort(),
    [...original.cards.map((c: any) => c.code), warriors].sort(),
  );
  for (const recipe of read("src/data/wrath-ruin-recipes.json")) {
    const expected = structuredClone(
      original.recipes.find((r: any) => r.id === recipe.id),
    );
    expected.card_codes.push(warriors);
    expected.cards.push({
      code: warriors,
      quantity: 1,
      section: "sharedEncounterDeck",
    });
    expected.sections.sharedEncounterDeck[warriors] = 1;
    const { original_source, correction, ...actual } = recipe;
    assert.deepEqual(actual, expected);
    assert.equal(original_source.missing_card, warriors);
    assert.match(correction, /complete Easterling Raiders/);
  }
});

test("Wrath normal and easy totals match all 25 independently read inventory rows", () => {
  const quantities = read("tests/wrath-ruin-source-quantities.json");
  assert.equal(quantities.cards.length, 25);
  for (const recipe of read("src/data/wrath-ruin-recipes.json")) {
    const mode = recipe.mode === "easy" ? "easy" : "normal";
    for (const row of quantities.cards) {
      const actual = recipe.cards
        .filter((c: any) => c.code === row.code)
        .reduce((n: number, c: any) => n + c.quantity, 0);
      assert.equal(actual, row[mode], `${recipe.id}/${row.name}`);
    }
    assert.equal(
      recipe.cards.reduce((n: number, c: any) => n + c.quantity, 0),
      mode === "easy" ? 40 : 52,
    );
  }
  const pack = [...encounters(), ...quests()].filter(
    (c: any) => c.pack_code === "WaR",
  );
  assert.equal(pack.length, 15);
  assert.equal(
    pack.reduce((n: number, c: any) => n + c.quantity, 0),
    31,
  );
  assert.equal(
    players().reduce(
      (n: number, c: any) =>
        n + c.packs.find((p: any) => p.pack_code === "WaR").quantity,
      0,
    ),
    29,
  );
});

test("Wrath retains all 39 original scenario and player faces with pinned bytes", () => {
  assert.equal(WRATH_RUIN_SCENARIO_ART.length, 27);
  assert.equal(WRATH_RUIN_PLAYER_ART.length, 12);
  for (const row of [...WRATH_RUIN_SCENARIO_ART, ...WRATH_RUIN_PLAYER_ART]) {
    assert.equal(readFileSync(`public${row.localPath}`).length, row.bytes);
    assert.equal(
      hash(`public${row.localPath}`),
      row.sha256,
      `${row.code}/${row.face}`,
    );
  }
  assert.ok(WRATH_RUIN_SCENARIO_ART.some((row) => row.code === warriors));
  const hero = WRATH_RUIN_PLAYER_ART.find((row) => row.code === "22001")!;
  assert.match(hero.source, /e6e32f1f-fca8-44cc-8e04-0eaf6361b929/);
  assert.equal(
    players().find((c: any) => c.code === "22001").imagesrc,
    hero.localPath,
  );
});

test("Wrath restores the five omitted printed shadows without inventing shadows for other new encounters", () => {
  const pack = encounters().filter((c: any) => c.pack_code === "WaR");
  const at = (position: number) =>
    pack.find((c: any) => c.position === position);
  assert.deepEqual(
    pack
      .filter((c: any) => c.shadow)
      .map((c: any) => c.position)
      .sort((a: number, b: number) => a - b),
    [12, 20, 21, 22, 23],
  );
  assert.equal(at(12).shadow, "Shadow: Deal 1 damage to defending character.");
  assert.equal(
    at(20).shadow,
    "Shadow: Attacking enemy makes an additional attack against you after this one.",
  );
  assert.equal(
    at(21).shadow,
    "Shadow: Assign X damage among characters you control, where X is 1 more than the number of locations you control.",
  );
  assert.equal(
    at(22).shadow,
    "Shadow: Attacking enemy gets +1 [attack]. If this attack destroys a character, return the highest [threat] location you control to the staging area.",
  );
  assert.equal(
    at(23).shadow,
    "Shadow: Attacking enemy gets +1 [attack] for each location you control.",
  );
  assert.deepEqual(
    [
      at(11).threat,
      at(11).engagement,
      at(11).attack,
      at(11).defense,
      at(11).health,
      at(11).victory,
    ],
    [1, 50, 6, 4, 9, 6],
  );
  assert.equal(at(14).printed_stats.threat, "X");
  assert.deepEqual(
    quests()
      .sort((a: any, b: any) => a.cost - b.cost)
      .map((c: any) => c.back_quest),
    [4, 12],
  );
  assert.equal(at(13).text.match(/Surge/g)?.length, 1);
  assert.equal(at(23).text.match(/Doomed 1/g)?.length, 1);
});

test("Wrath player definitions include the original reprint identities and separate contract faces", () => {
  const cards = players();
  const source = read("src/data/official-player-cards.json").filter((c: any) =>
    c.packs.some((p: any) => p.pack_code === "WaR"),
  );
  assert.equal(cards.length, 11);
  assert.deepEqual(
    cards.map((c: any) => c.code).sort(),
    source.map((c: any) => c.code).sort(),
  );
  const at = (code: string) => cards.find((c: any) => c.code === code);
  assert.equal(at("22006").text.match(/Guarded/g)?.length, 1);
  assert.equal(at("22006").text.match(/Restricted/g)?.length, 1);
  assert.equal(at("22008").text.match(/Restricted/g)?.length, 1);
  assert.match(at("22005").text, /Add Tom Bombadillo! to the victory display/);
  assert.match(at("22007").text, /staging area as if it were engaged with you/);
  assert.equal(at("22010").cost, undefined);
  assert.equal(at("22010").printed_stats.cost, "-");
  assert.match(at("22010").text, /This effect cannot be cancelled/);
  assert.doesNotMatch(at("22024").text, /Side B|The active location gets/);
  assert.match(at("22024").text, /Choose 14 different/);
  assert.match(at("22024").back_text, /When the active location is explored/);
  assert.equal(at("22024").back_imagesrc, "/cards/22024.B.jpg");
});
