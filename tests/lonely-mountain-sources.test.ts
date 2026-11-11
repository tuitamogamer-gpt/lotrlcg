import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  BURGLES,
  TLM as T,
  TLM_ENCOUNTERS,
  TLM_QUESTS,
  TLM_RECIPES,
} from "../src/game/lonely-mountain-support";
import { FAS_ENCOUNTERS } from "../src/game/flies-spiders-support";
import { card } from "../src/game/cards";
import { EREBOR_TREASURES, OTD_BILBO } from "../src/game/hobbit-saga";
import snapshot from "../src/data/pending/the-lonely-mountain-import.json";
import art from "./lonely-mountain-art.json";
import quantities from "./lonely-mountain-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const setupSections = [
  "sharedEncounterDeck",
  "sharedSetAside",
  "sharedStagingArea",
];

test("The Lonely Mountain keeps Hall of Beorn's quantities, corrects the easy Wilderland cards and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 27);
  assert.equal(snapshot.artwork.length, 31);
  const wilderland = new Set(FAS_ENCOUNTERS.map((c) => c.code));
  assert.deepEqual(
    [...TLM_ENCOUNTERS, ...TLM_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .map((c) => c.code)
      .filter(
        (c) =>
          c !== OTD_BILBO &&
          !EREBOR_TREASURES.includes(c) &&
          !wilderland.has(c),
      )
      .sort(),
  );
  for (const mode of ["standard", "easy"] as const) {
    const recipe = TLM_RECIPES.find((r) => r.mode === mode)!;
    for (const row of quantities)
      assert.equal(
        recipe.cards
          .filter(
            (c) => c.code === row.code && setupSections.includes(c.section),
          )
          .reduce((n, c) => n + c.quantity, 0),
        mode === "easy" ? row.easy : row.normal,
        `${row.name} (${mode})`,
      );
    assert.deepEqual(
      recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck2")
        .map((c) => c.code)
        .sort(),
      [...EREBOR_TREASURES].sort(),
    );
  }
  // The source easy recipe lists two Weighed Down and two Fighting Among
  // Friends; the Wilderland set's easy cards are one and none.
  const sourceEasy = snapshot.recipes.find((r) => r.mode === "easy")!;
  const count = (cards: { code: string; quantity: number }[], code: string) =>
    cards.filter((c) => c.code === code).reduce((n, c) => n + c.quantity, 0);
  assert.equal(count(sourceEasy.cards, T.weighed), 2);
  assert.equal(count(sourceEasy.cards, T.friends), 2);
  const easy = TLM_RECIPES.find((r) => r.mode === "easy")!;
  assert.equal(count(easy.cards, T.weighed), 1);
  assert.equal(count(easy.cards, T.friends), 0);
  assert.ok(!easy.card_codes.includes(T.friends));
  assert.deepEqual(
    TLM_RECIPES.find((r) => r.mode === "standard"),
    snapshot.recipes.find((r) => r.mode === "standard"),
  );
  assert.equal(
    hash("src/data/pending/the-lonely-mountain-import.json"),
    "0c8b25bc6528418cb7e3b607acbd165bb431c6670b00206457bb2c11db9cc730",
  );
});

test("All 31 faces are pinned and the reviewed scans match the card data, with Secret Entrance's look-at errata and the Golden Cup's victory points", () => {
  assert.equal(art.length, 31);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    TLM_QUESTS.map((q) => q.back_quest ?? null),
    [null, null, 20, 7],
  );
  assert.deepEqual(
    [
      card(T.golden).threat ?? null,
      card(T.golden).attack,
      card(T.golden).defense,
      card(T.golden).health,
      card(T.golden).engagement,
    ],
    [null, 6, 9, 20, 50],
  );
  assert.deepEqual(
    [
      card(T.magnificent).threat,
      card(T.magnificent).attack,
      card(T.magnificent).defense,
      card(T.magnificent).health,
    ],
    [6, 8, 8, 20],
  );
  assert.deepEqual(
    [card(T.mountain).threat, card(T.mountain).quest, card(T.mountain).victory],
    [12, 4, 10],
  );
  // FAQ 1.07: Secret Entrance looks at the top card (the reviewed scan agrees).
  assert.match(card(T.entrance).text!, /look at the top card/);
  assert.doesNotMatch(card(T.entrance).text!, /reveal the top card/);
  const original = snapshot.cards.find((c) => c.code === T.entrance)!;
  assert.match(original.text!, /reveal the top card/);
  // Every burgle effect is printed on its card.
  for (const [code, burgle] of Object.entries(BURGLES)) {
    const text = card(code).text!;
    assert.match(text, /Burgle: The first player shuffles his deck/);
    assert.match(text, new RegExp(`discard ${burgle.cards} card`));
  }
  assert.equal(card("132024").victory, 3);
  assert.equal(
    snapshot.cards.find((c) => c.code === "132024")!.victory ?? null,
    null,
    "the catalog omits the printed Victory 3",
  );
});
