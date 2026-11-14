import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  OATH,
  OATH_ENCOUNTERS,
  OATH_QUESTS,
  OATH_RECIPES,
  oathRecipe,
} from "../src/game/the-oath-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-oath-import.json";
import starter from "../src/data/pending/the-oath-limited-collector-s-edition-import.json";
import art from "./the-oath-art.json";
import quantities from "./the-oath-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (id: "Q00.01A" | "Q00.01B" | "E00.01B", code: string) =>
  OATH_RECIPES.find((r) => r.id === id)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Oath keeps both editions' Hall of Beorn quantities and pins two immutable snapshots", () => {
  // The Dark of Mirkwood (2022): 22 cards, standard and easy recipes.
  assert.equal(snapshot.cards.length, 22);
  assert.equal(snapshot.artwork.length, 25);
  assert.deepEqual(
    [...OATH_ENCOUNTERS, ...OATH_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  // The Two-Player Limited Edition Starter (2018): 19 of the same cards.
  assert.equal(starter.cards.length, 19);
  assert.equal(starter.artwork.length, 22);
  const codes = new Set(snapshot.cards.map((c) => c.code));
  assert.ok(starter.cards.every((c) => codes.has(c.code)));
  assert.deepEqual(
    snapshot.cards
      .filter((c) => !starter.cards.some((x) => x.code === c.code))
      .map((c) => c.name)
      .sort(),
    ["Abandoned Camp", "Obsidian Arrows", "Wild Wargs"],
  );
  assert.deepEqual(
    OATH_RECIPES.map((r) => r.id),
    ["Q00.01A", "E00.01B", "Q00.01B"],
  );
  assert.deepEqual(OATH_RECIPES[0], starter.recipes[0]);
  assert.deepEqual(OATH_RECIPES.slice(1), snapshot.recipes);
  for (const row of quantities) {
    assert.equal(total("Q00.01A", row.code), row.starter, row.name);
    assert.equal(total("Q00.01B", row.code), row.normal, row.name);
    assert.equal(total("E00.01B", row.code), row.easy, row.name);
    // The Starter printed the same gold easy-mode icons.
    assert.equal(
      oathRecipe("the-oath-2018", true)
        .cards.filter((c) => c.code === row.code)
        .reduce((n, c) => n + c.quantity, 0),
      row.starterEasy,
      row.name,
    );
  }
  // Hall of Beorn: 29 (easy 21) encounter cards in 2018, 33 (easy 25) in
  // 2022, plus 3 quest cards.
  const sum = (key: "starter" | "starterEasy" | "normal" | "easy") =>
    quantities.reduce((n, r) => n + r[key], 0);
  assert.deepEqual(
    [sum("starter"), sum("starterEasy"), sum("normal"), sum("easy")],
    [29 + 3, 21 + 3, 33 + 3, 25 + 3],
  );
  // Easy mode removes the same gold cards from both editions.
  assert.deepEqual(
    quantities
      .filter((r) => r.normal !== r.easy)
      .map((r) => r.name)
      .sort(),
    [
      "Caught in a Web",
      "Goblin Runners",
      "Goblins are Upon You!",
      "Spiders of Mirkwood",
      "Tangled Grove",
    ],
  );
  assert.deepEqual(
    quantities.filter((r) => r.starter !== r.starterEasy).map((r) => r.name),
    quantities.filter((r) => r.normal !== r.easy).map((r) => r.name),
  );
  assert.equal(
    hash("src/data/pending/the-oath-import.json"),
    "883b7216099feec370a959c8f149e51096a6dfa06c2e70dfb925f6a6eab17c24",
  );
  assert.equal(
    hash("src/data/pending/the-oath-limited-collector-s-edition-import.json"),
    "305a7214c59a804d1831056374841a7108408ff93cf4682f7c5073518143ebb6",
  );
});

test("All 25 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 25);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    snapshot.artwork.map((a) => a.sha256).sort(),
    art.map((a) => a.sha256).sort(),
  );
  assert.deepEqual(
    OATH_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["After the Raid", 9],
      ["Mirkwood Forest", 12],
      ["The Rearguard", 6],
    ],
  );
  // Typos in the catalog, read from the scans.
  const fixes: [string, RegExp, RegExp][] = [
    [OATH.raid, /Shuffle the encounter deck\.$/, /Shuffle of the/],
    [OATH.greatSpider, /After Great Spider engages/, /Gret Spider/],
    [OATH.scavengers, /Goblintown Scavengers' \[threat\]/, /Savengers/],
    [OATH.wargs, /discard the top card/, /discrad/],
    [OATH.camp, /their deck\. If that card is an ally, put/, /any ally/],
    [OATH.gate, /the first player may draw 2 cards/, /player draws 2/],
    [OATH.web, /attaches this card to one/, /attached this card/],
  ];
  for (const [code, fixed, typo] of fixes) {
    assert.match(card(code).text!, fixed, card(code).name);
    assert.match(original(code).text!, typo, card(code).name);
  }
  assert.match(card(OATH.forest).back_text!, /in the victory display\.$/);
  assert.match(original(OATH.forest).back_text!, /vitory display/);
  // 1B and 2A are flavour only; 3A holds The Rearguard's When Revealed.
  assert.equal(card(OATH.raid).back_text, "");
  assert.equal(card(OATH.forest).text, "");
  assert.match(card(OATH.rearguard).text!, /^When Revealed: The first player/);
  assert.match(
    card(OATH.rearguard).back_text!,
    /^This stage cannot be defeated while Goblin Troop is in play\./,
  );
  // The catalog leaves out every shadow effect.
  const shadows: [string, RegExp][] = [
    [OATH.spiders, /^Shadow: Choose and exhaust 1 character you control\./],
    [OATH.greatSpider, /^Shadow: Deal 1 damage to an exhausted character/],
    [OATH.troop, /^Shadow: Attacking enemy gets \+2 \[attack\]\.$/],
    [OATH.runners, /^Shadow: Attacking enemy makes an additional attack/],
    [OATH.upon, /^Shadow: Attacking enemy gets \+1 \[attack\] for each Goblin/],
    [OATH.eyes, /^Shadow: If this attack is undefended, discard an ally/],
    [OATH.driven, /^Shadow: Choose and discard 1 attachment/],
    [OATH.speed, /^Shadow: Attacking enemy gets \+1 \[attack\]\. Return/],
  ];
  for (const [code, shadow] of shadows) {
    assert.match(card(code).shadow!, shadow, card(code).name);
    assert.equal(original(code).shadow ?? null, null, card(code).name);
  }
  assert.match(card(OATH.arrows).shadow!, /^Shadow: Deal 1 damage/);
  for (const c of [...OATH_ENCOUNTERS, ...OATH_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$|`/, `${c.name}: tidy text`);
    assert.doesNotMatch(c.back_text ?? "", /  |\s$|`/, `${c.name}: tidy text`);
  }
  // Statistics from the scans.
  assert.deepEqual(
    [
      OATH.spiders,
      OATH.greatSpider,
      OATH.troop,
      OATH.sniper,
      OATH.runners,
      OATH.scavengers,
      OATH.wargs,
    ].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [18, 3, 2, 2, 4],
      [34, 2, 3, 1, 3],
      [35, 3, 5, 3, 6],
      [48, 2, 2, 0, 2],
      [20, 1, 3, 1, 2],
      [12, 1, 1, 0, 3],
      [28, 2, 2, 1, 3],
    ],
  );
  assert.deepEqual(
    [OATH.eaves, OATH.grove, OATH.gate, OATH.den, OATH.trail, OATH.camp].map(
      (code) => {
        const c = card(code);
        return [c.threat ?? null, c.quest, c.victory ?? null];
      },
    ),
    [
      [2, 2, null],
      [null, 3, null],
      [2, 4, null],
      [4, 4, null],
      [3, 6, 3],
      [2, 3, null],
    ],
  );
  // Tangled Grove prints X threat.
  assert.equal(card(OATH.grove).printed_stats?.threat, "X");
});
