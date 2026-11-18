import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  CAVES,
  CAVES_ENCOUNTERS,
  CAVES_QUESTS,
  CAVES_RECIPES,
  cavesRecipe,
} from "../src/game/caves-nibin-dum-support";
import { OATH_ENCOUNTERS } from "../src/game/the-oath-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-caves-of-nibin-dum-import.json";
import starter from "../src/data/pending/the-caves-of-nibin-dum-limited-collector-s-edition-import.json";
import art from "./caves-nibin-dum-art.json";
import quantities from "./caves-nibin-dum-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (id: "Q00.02A" | "Q00.02B" | "E00.02B", code: string) =>
  CAVES_RECIPES.find((r) => r.id === id)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Caves of Nibin-Dûm keeps both editions' Hall of Beorn quantities and pins two immutable snapshots", () => {
  // The Dark of Mirkwood (2022): 26 cards, standard and easy recipes. The
  // Goblins set's 8 cards are The Oath's, with its corrected data.
  assert.equal(snapshot.cards.length, 26);
  assert.equal(snapshot.artwork.length, 30);
  const goblins = new Set(OATH_ENCOUNTERS.map((c) => c.code));
  assert.deepEqual(
    snapshot.cards
      .filter((c) => goblins.has(c.code))
      .map((c) => c.name)
      .sort(),
    [
      "Eyes in the Dark",
      "Goblin Runners",
      "Goblin Sniper",
      "Goblin Troop",
      "Goblins are Upon You!",
      "Goblintown Scavengers",
      "Obsidian Arrows",
      "Wild Wargs",
    ],
  );
  assert.deepEqual(
    [...CAVES_ENCOUNTERS, ...CAVES_QUESTS].map((c) => c.code).sort(),
    snapshot.cards
      .filter((c) => !goblins.has(c.code))
      .map((c) => c.code)
      .sort(),
  );
  // The Two-Player Limited Edition Starter (2018): 23 of the same cards.
  assert.equal(starter.cards.length, 23);
  assert.equal(starter.artwork.length, 27);
  const codes = new Set(snapshot.cards.map((c) => c.code));
  assert.ok(starter.cards.every((c) => codes.has(c.code)));
  assert.deepEqual(
    snapshot.cards
      .filter((c) => !starter.cards.some((x) => x.code === c.code))
      .map((c) => c.name)
      .sort(),
    ["Crumbling Stairs", "Obsidian Arrows", "Wild Wargs"],
  );
  assert.deepEqual(
    CAVES_RECIPES.map((r) => r.id),
    ["Q00.02A", "E00.02B", "Q00.02B"],
  );
  assert.deepEqual(CAVES_RECIPES[0], starter.recipes[0]);
  assert.deepEqual(CAVES_RECIPES.slice(1), snapshot.recipes);
  for (const row of quantities) {
    assert.equal(total("Q00.02A", row.code), row.starter, row.name);
    assert.equal(total("Q00.02B", row.code), row.normal, row.name);
    assert.equal(total("E00.02B", row.code), row.easy, row.name);
    // The Starter printed the same gold easy-mode icons.
    assert.equal(
      cavesRecipe("the-caves-of-nibin-dum-2018", true)
        .cards.filter((c) => c.code === row.code)
        .reduce((n, c) => n + c.quantity, 0),
      row.starterEasy,
      row.name,
    );
  }
  // Hall of Beorn: 32 (easy 24) encounter cards in 2018, 36 (easy 28) in
  // 2022, plus 4 quest cards.
  const sum = (key: "starter" | "starterEasy" | "normal" | "easy") =>
    quantities.reduce((n, r) => n + r[key], 0);
  assert.deepEqual(
    [sum("starter"), sum("starterEasy"), sum("normal"), sum("easy")],
    [32 + 4, 24 + 4, 36 + 4, 28 + 4],
  );
  // Easy mode removes the same gold cards from both editions.
  assert.deepEqual(
    quantities
      .filter((r) => r.normal !== r.easy)
      .map((r) => r.name)
      .sort(),
    [
      "Branching Paths",
      "Goblin Runners",
      "Goblins are Upon You!",
      "Great Cave-troll",
      "Watchful Eyes",
    ],
  );
  assert.deepEqual(
    quantities.filter((r) => r.starter !== r.starterEasy).map((r) => r.name),
    quantities.filter((r) => r.normal !== r.easy).map((r) => r.name),
  );
  // Each location but Crumbling Stairs has two copies.
  assert.deepEqual(
    quantities
      .filter((r) => card(r.code).type_code === "location")
      .map((r) => [r.name, r.normal]),
    [
      ["Goblin Tunnels", 2],
      ["Lightless Passage", 2],
      ["Branching Paths", 2],
      ["Collapsed Mine", 2],
      ["Goblin Dungeon", 2],
      ["Cracked Pillar", 1],
      ["Crumbling Stairs", 1],
    ],
  );
  assert.equal(
    hash("src/data/pending/the-caves-of-nibin-dum-import.json"),
    "f972ca825e6d64df4b53a5eb96d999fdf5e447e8409bf0a66fb483c53056fabd",
  );
  assert.equal(
    hash(
      "src/data/pending/the-caves-of-nibin-dum-limited-collector-s-edition-import.json",
    ),
    "9af0dd0b2b4e4897e439d017786faa6b2946d19be9f27c9279ee0a9037c4841e",
  );
});

test("All 30 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 30);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    snapshot.artwork.map((a) => a.sha256).sort(),
    art.map((a) => a.sha256).sort(),
  );
  assert.deepEqual(
    CAVES_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["The Dark of Nibin-Dûm", 8],
      ["Surprise Attack", 0],
      ["The Chasm", null],
      ["Oathkeepers", 8],
    ],
  );
  // The catalog glues each quest card's front text before its back text.
  for (const q of CAVES_QUESTS) {
    assert.ok(original(q.code).back_text!.startsWith(original(q.code).text!));
    assert.ok(!q.back_text!.startsWith(q.text!), q.name);
  }
  // Typos in the catalog, read from the scans.
  const fixes: [string, RegExp, RegExp][] = [
    [CAVES.dark, /The first player attaches Cave Torch/, /player attached/],
    [
      CAVES.torch,
      /^Attach to a hero\. Restricted\.\nAction: Exhaust/,
      /Exhause/,
    ],
    [CAVES.pillar, /Use Cracked Pillar's \[threat\]/, /Cracked Pillar`s/],
    [CAVES.chieftain, /quest\.\nCannot take damage/, /quest\.Cannot/],
  ];
  for (const [code, fixed, typo] of fixes) {
    assert.match(card(code).text!, fixed, card(code).name);
    assert.match(original(code).text!, typo, card(code).name);
  }
  assert.match(
    card(CAVES.surprise).back_text!,
    /each enemy's engagement cost as if it were 0\.\nThis stage gets \+4/,
  );
  assert.match(original(CAVES.surprise).back_text!, /enemy`s .*0\.The stage/);
  assert.match(
    card(CAVES.oathkeepers).back_text!,
    /loses the text "Cannot take damage\."\nThis stage cannot be defeated/,
  );
  assert.match(
    original(CAVES.oathkeepers).back_text!,
    /loses the text: `Cannot take damage\.`This stage/,
  );
  // The catalog leaves out the Caves set's shadow effects.
  const shadows: [string, RegExp][] = [
    [CAVES.warg, /^Shadow: If this attack destroys a character, return/],
    [CAVES.mine, /^Shadow: Raise your threat by 1 for each point of damage/],
    [CAVES.tunnels, /^Shadow: Attacking enemy gets \+1 \[attack\]\. \(\+3/],
    [CAVES.passage, /^Shadow: Cancel all combat damage dealt to attacking/],
    [CAVES.lost, /^Shadow: Deal 1 damage to the defending character\.$/],
  ];
  for (const [code, shadow] of shadows) {
    assert.match(card(code).shadow!, shadow, card(code).name);
    assert.equal(original(code).shadow ?? null, null, card(code).name);
  }
  for (const c of [...CAVES_ENCOUNTERS, ...CAVES_QUESTS]) {
    for (const text of [c.text, c.back_text, c.shadow]) {
      assert.doesNotMatch(text ?? "", /  |\s$|`/, `${c.name}: tidy text`);
      assert.doesNotMatch(text ?? "", /[a-z]\.[A-Z]/, `${c.name}: line breaks`);
    }
  }
  // Statistics from the scans.
  assert.deepEqual(
    [CAVES.chieftain, CAVES.troll, CAVES.warg].map((code) => {
      const c = card(code);
      return [
        c.engagement,
        c.threat ?? null,
        c.attack ?? null,
        c.defense ?? null,
        c.health,
      ];
    }),
    [
      [40, null, null, null, 8],
      [36, 3, 6, 4, 6],
      [33, 2, 3, 2, 3],
    ],
  );
  // Goblin Chieftain prints X threat, attack and defense.
  assert.deepEqual(
    [
      card(CAVES.chieftain).printed_stats?.threat,
      card(CAVES.chieftain).printed_stats?.attack,
      card(CAVES.chieftain).printed_stats?.defense,
    ],
    ["X", "X", "X"],
  );
  assert.deepEqual(
    [
      CAVES.tunnels,
      CAVES.passage,
      CAVES.branching,
      CAVES.mine,
      CAVES.dungeon,
      CAVES.stairs,
      CAVES.pillar,
    ].map((code) => [card(code).threat, card(code).quest]),
    [
      [2, 7],
      [4, 4],
      [1, 3],
      [2, 6],
      [3, 5],
      [3, 3],
      [2, 2],
    ],
  );
  // Trait lines: the Dark locations.
  assert.deepEqual(
    [...CAVES_ENCOUNTERS]
      .filter((c) => /\bDark\b/.test(c.traits ?? ""))
      .map((c) => c.name)
      .sort(),
    [
      "Branching Paths",
      "Collapsed Mine",
      "Goblin Tunnels",
      "Lightless Passage",
    ],
  );
});
