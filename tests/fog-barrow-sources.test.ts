import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FB,
  FOG_BARROW_ENCOUNTERS,
  FOG_BARROW_QUESTS,
  FOG_BARROW_RECIPES,
} from "../src/game/fog-barrow-support";
import { ONE_RING, SAGA_FRODO } from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/fog-on-the-barrow-downs-import.json";
import art from "./fog-barrow-art.json";
import quantities from "./fog-barrow-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  FOG_BARROW_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Fog on the Barrow-downs keeps the catalog's recipe, Hall of Beorn's easy quantities and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.artwork.length, 25);
  assert.deepEqual(
    [
      ...FOG_BARROW_ENCOUNTERS.map((c) => c.code),
      ...FOG_BARROW_QUESTS.map((c) => c.code),
      SAGA_FRODO,
      ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  // The catalog has the standard recipe only; the easy one is Hall of Beorn's.
  assert.equal(snapshot.recipes.length, 1);
  assert.deepEqual(
    FOG_BARROW_RECIPES.find((r) => r.mode === "standard"),
    snapshot.recipes[0],
  );
  const easy = FOG_BARROW_RECIPES.find((r) => r.mode === "easy")!;
  assert.equal(easy.id, "Q99.05-easy");
  assert.equal(easy.source, "hallofbeorn");
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 41 and 32 encounter cards without the campaign card, plus
  // the quest cards (four copies of Trapped Inside a Barrow, one for each
  // player), Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    41 + 7 + 2,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    32 + 7 + 2,
  );
  assert.equal(
    hash("src/data/pending/fog-on-the-barrow-downs-import.json"),
    "481b1e3b4a296a9268423bfe9c07f230da4e88115e879aaf968309def5731ab4",
  );
});

test("All 25 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 25);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    FOG_BARROW_QUESTS.map((q) => [q.name, q.back_name, q.back_quest ?? null]),
    [
      ["The House of Tom Bombadil", "The House of Tom Bombadil", 1],
      ["Across the Downs", "Across the Downs", 14],
      ["Lost in the Fog", "Lost in the Fog", 16],
      ["Trapped Inside a Barrow", "Trapped Inside a Barrow", 9],
    ],
  );
  // The printed cards restore these words.
  assert.equal(original(FB.trapped).back_name, "Inside the Barrow");
  assert.match(original(FB.trapped).text!, /^When Revealed:End your/);
  assert.match(card(FB.trapped).text!, /^When Revealed: End your quest phase/);
  assert.match(
    card(FB.trapped).back_text!,
    /\(combining staging areas with stage 3B\)/,
  );
  assert.match(card(FB.song).text!, /Attach to a questing hero you control\./);
  assert.match(original(FB.song).text!, /questing character you control/);
  assert.match(card(FB.waiting).text!, /I'm Waiting for You! gains surge\./);
  assert.equal(card(FB.tom).is_unique, true);
  assert.equal(original(FB.tom).is_unique, false);
  for (const c of [...FOG_BARROW_ENCOUNTERS, ...FOG_BARROW_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$|<b>|<i>/, `${c.name}: tidy text`);
    assert.doesNotMatch(
      c.back_text ?? "",
      /  |\s$|<b>|<i>/,
      `${c.name}: tidy text`,
    );
  }
  // Statistics from the scans.
  assert.deepEqual(
    [FB.barrowWight, FB.darkWight, FB.coldWight].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [30, 3, 5, 1, 6],
      [40, 2, 3, 1, 7],
      [35, 2, 4, 1, 5],
    ],
  );
  assert.deepEqual(
    [
      FB.ancient,
      FB.stoneRing,
      FB.northDowns,
      FB.hollow,
      FB.standing,
      FB.great,
    ].map((code) => {
      const c = card(code);
      return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
    }),
    [
      // Ancient Barrow's threat is X, 1 plus the cards under it.
      [null, 4, null, false],
      [3, 3, null, false],
      [2, 5, null, false],
      [3, 3, 3, true],
      [4, 4, 3, true],
      [1, 1, 5, false],
    ],
  );
  assert.deepEqual(
    [
      card(FB.tom).willpower,
      card(FB.tom).attack,
      card(FB.tom).defense,
      card(FB.tom).health,
    ],
    [3, 3, 3, 6],
  );
});
