import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  GC,
  GREY_COMPANY_ENCOUNTERS,
  GREY_COMPANY_QUESTS,
  GREY_COMPANY_RECIPES,
} from "../src/game/grey-company-support";
import { FLAME_WEST_ARAGORN } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-passing-of-the-grey-company-import.json";
import art from "./grey-company-art.json";
import quantities from "./grey-company-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  GREY_COMPANY_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Passing of the Grey Company keeps the catalog's recipes, Hall of Beorn's normal quantities, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 20);
  assert.equal(snapshot.artwork.length, 24);
  assert.deepEqual(
    [
      ...GREY_COMPANY_ENCOUNTERS.map((c) => c.code),
      ...GREY_COMPANY_QUESTS.map((c) => c.code),
      FLAME_WEST_ARAGORN,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(GREY_COMPANY_RECIPES.map((r) => r.id).sort(), [
    "E0B.13",
    "Q0B.13",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      GREY_COMPANY_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // The scans' set numbers: 34 encounter cards (Army of the Dead is "1/34",
  // No Turning Back "33/34" and "34/34"): the 32 of the encounter deck with
  // The Stone of Erech and Army of the Dead. Hall of Beorn's 39 normal
  // encounter cards are these 34, the 4 copies of Overcome by Fear and the
  // campaign card, which the import replaces with the rules card.
  assert.equal(count("standard", GC.fear), 4);
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    34 + 4 + 1 + 3 + 1,
  );
  assert.equal(39, 34 + 4 + 1);
  // Easy: Hall of Beorn keeps 2 Shadow Host and 3 Blood Runs Chill where
  // recipe E0B.13 keeps 1 and 1; the import follows the recipe.
  assert.equal(count("easy", GC.host), 1);
  assert.equal(count("easy", GC.chill), 1);
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    36,
  );
  assert.equal(
    hash("src/data/pending/the-passing-of-the-grey-company-import.json"),
    "24d6ca9e8cc4ab22cde321ed7a6ed1e9c5f8ddcbbbbfdaf7d10ab68e752f0165",
  );
});

test("All 24 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 24);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Aragorn: "leaves play, the players lose the game".
  assert.match(original(FLAME_WEST_ARAGORN).text!, /play,the players/);
  assert.equal(
    card(FLAME_WEST_ARAGORN).text,
    "The first player gains control of Aragorn. If Aragorn leaves play, the players lose the game.\nWhile Aragorn has an Artifact attached, he gains sentinel and does not exhaust to quest.",
  );
  // Overcome by Fear: "Then, you may spend".
  assert.match(original(GC.fear).text!, /Then you may spend/);
  assert.match(card(GC.fear).text!, /Then, you may spend 1 \[fellowship\]/);
  // "a threat of 35 or higher".
  assert.match(original(GC.haunted).text!, /player with threat 35/);
  assert.match(
    card(GC.haunted).text!,
    /each player with a threat of 35 or higher/,
  );
  assert.match(original(GC.chill).text!, /player with threat 35/);
  assert.match(
    card(GC.chill).text!,
    /Each player with a threat of 35 or higher/,
  );
  // Shadow Host: "When Shadow Host engages you".
  assert.match(original(GC.host).text!, /After Shadow Host engages you/);
  assert.match(card(GC.host).text!, /Forced: When Shadow Host engages you/);
  // 3B: "While The Stone of Erech is the active location".
  assert.match(original(GC.following).back_text!, /While Stone of Erech/);
  assert.match(
    card(GC.following).back_text!,
    /^While The Stone of Erech is the active location, each Oathbreaker enemy loses the Phantom keyword and gets -20 engagement cost\./,
  );
  assert.equal(card(GC.following).back_quest, 5);
  // The keyword lines the catalog lists as traits head the text boxes.
  for (const [code, keywords] of [
    [GC.chill, "Doomed 1."],
    [GC.shut, "Peril. Surge."],
    [GC.whispers, "Peril."],
  ] as const) {
    assert.equal(original(code).traits, keywords);
    assert.equal(card(code).traits, "");
    assert.ok(card(code).text!.startsWith(`${keywords}\n`), code);
  }
  // Army of the Dead's printed threat is X.
  assert.equal(card(GC.army).printed_stats?.threat, "X");
  // Every new encounter card shows its local scan.
  for (const c of [...GREY_COMPANY_ENCOUNTERS, ...GREY_COMPANY_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
  for (const c of [...GREY_COMPANY_ENCOUNTERS, ...GREY_COMPANY_QUESTS])
    assert.ok(
      !`${c.text ?? ""}${c.back_text ?? ""}`.includes("  "),
      `${c.name} has no double space`,
    );
  for (const c of [...GREY_COMPANY_ENCOUNTERS, ...GREY_COMPANY_QUESTS])
    assert.equal(
      `${c.text ?? ""}${c.back_text ?? ""}`.trim(),
      `${c.text ?? ""}${c.back_text ?? ""}`.trim().replace(/\s+$/gm, ""),
      `${c.name} has no trailing space`,
    );
});
