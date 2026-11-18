import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  MM,
  MM_ENCOUNTERS,
  MM_QUESTS,
  MM_RECIPES,
  MM_SETS,
  mmCost,
  mmPhysical,
  mmRecipe,
} from "../src/game/mines-moria-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/the-mines-of-moria-import.json";
import art from "./mines-moria-art.json";
import quantities from "./mines-moria-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (code: string) =>
  mmRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Mines of Moria keeps Hall of Beorn's quantities, 14 encounter sets of 5 cards costing 3 each, and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 50);
  assert.equal(snapshot.artwork.length, 58);
  // Chamber of Mazarbul is The Watcher's location side, a separate playable face.
  assert.deepEqual(
    [...MM_ENCOUNTERS, ...MM_QUESTS]
      .map((c) => c.code)
      .filter((c) => c !== MM.chamber)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.equal(mmPhysical(MM.chamber), MM.watcher);
  assert.equal(card(MM.chamber).flip_of, MM.watcher);
  assert.deepEqual(MM_RECIPES, snapshot.recipes);
  assert.deepEqual(
    MM_RECIPES.map((r) => r.id),
    ["Q99.13"],
  );
  assert.equal(
    automatedScenarioId({ name: "The Mines of Moria", mode: "standard" }),
    "the-mines-of-moria",
  );
  assert.equal(quantities.length, 50);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
    if (row.cost !== null) assert.equal(mmCost(row.code), row.cost, row.name);
  }
  const sum = (filter: (r: (typeof quantities)[number]) => boolean) =>
    quantities.filter(filter).reduce((n, r) => n + r.quantity, 0);
  assert.equal(
    sum(() => true),
    78,
  );
  assert.equal(
    sum((r) => r.set !== null),
    70,
  );
  assert.equal(
    sum((r) => r.type === "quest"),
    7,
  );
  assert.deepEqual(
    Object.entries(snapshot.recipes[0].sections.sharedSetAside)
      .map(([c, n]) => `${card(c).back_name ?? card(c).name} ${n}`)
      .sort(),
    [
      "A Presence in the Dark 1",
      "Chamber of Mazarbul 1",
      "Continuing Eastward 1",
      "Drums in the Deep 1",
      "Narrow Paths 1",
      "The Fate of Balin 1",
      "The Long Dark of Moria 1",
      "To the West-door 1",
    ],
  );
  // Each set: 5 cards with a total cost of 3, numbered 1 to 14.
  const sets = new Map<number, typeof quantities>();
  for (const row of quantities)
    if (row.set !== null)
      sets.set(row.set, [...(sets.get(row.set) ?? []), row]);
  assert.deepEqual(
    [...sets.keys()].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  );
  for (const [n, rows] of sets) {
    assert.equal(
      rows.reduce((t, r) => t + r.quantity, 0),
      5,
      `set ${n}: 5 cards`,
    );
    assert.equal(
      rows.reduce((t, r) => t + r.quantity * (r.cost ?? 0), 0),
      3,
      `set ${n}: total cost 3`,
    );
    assert.deepEqual(
      [...(MM_SETS.find((x) => x.number === n)?.cards ?? [])].sort(),
      rows.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
    );
  }
  assert.equal(
    hash("src/data/pending/the-mines-of-moria-import.json"),
    "f083be9236e0c641012afc05809ecc30ea59e1f647012f33e2cc0442be8daf41",
  );
});

test("All 58 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 58);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    snapshot.artwork.map((a) => a.sha256).sort(),
    art.map((a) => a.sha256).sort(),
  );
  assert.deepEqual(
    MM_QUESTS.map((q) => [q.name, q.back_name, q.cost, q.back_quest ?? null]),
    [
      ["To the West-door", "To the West-door", 1, 5],
      ["Journey in the Black Pit", "A Presence in the Dark", 2, 20],
      ["Journey in the Black Pit", "The Long Dark of Moria", 2, 20],
      ["Journey in the Black Pit", "Narrow Paths", 2, 20],
      ["Search for the Chamber", "Drums in the Deep", 3, 10],
      ["Search for the Chamber", "The Fate of Balin", 3, 20],
      ["Search for the Chamber", "Continuing Eastward", 3, 15],
    ],
  );
  // Chamber of Mazarbul, from the scan of The Watcher's back.
  const chamber = card(MM.chamber);
  assert.deepEqual(
    [
      chamber.type_code,
      chamber.traits,
      chamber.is_unique,
      chamber.printed_stats?.threat,
      chamber.quest,
      chamber.victory,
    ],
    ["location", "Underground.", true, "X", 5, 5],
  );
  assert.equal(original(MM.watcher).back_name, "Chamber of Mazarbul");
  // The catalog has no cost for any card; the scans give them.
  assert.ok(
    snapshot.cards.every((c) => !(c as { corner_text?: string }).corner_text),
  );
  assert.deepEqual(
    [MM.savage, MM.brood, MM.stairs, MM.warlord, MM.tunnels, MM.denizen].map(
      (c) => mmCost(c),
    ),
    [2, 3, 3, 3, 2, 0],
  );
  // Typos, omissions and the catalog's backticks, read from the scans.
  const fixes: [string, "text" | "back_text", RegExp, RegExp][] = [
    [
      MM.request,
      "text",
      /each of his heroes' resource pools/,
      /heroes` resource pools/,
    ],
    [
      MM.presence,
      "text",
      /\(cost 2 or less instead if/,
      /\(2 or less instead if/,
    ],
    [
      MM.drums,
      "back_text",
      /^Enemies cannot take damage while Chamber of Mazarbul is in the staging area\.\nWhen Revealed/,
      /^When Revealed/,
    ],
    [
      MM.fear,
      "text",
      /The opposing team attaches Shadow of Fear/,
      /The opposing team attached Shadow of Fear/,
    ],
    [
      MM.denizen,
      "text",
      /Denizen of the Deep gains surge\. \(Counts as a Condition attachment/,
      /Denizens of the Deep gains surge\. \(Counts as Condition attachment/,
    ],
    [
      MM.zigil,
      "text",
      /to reduce the \[threat\] of Zigil Mineshaft/,
      /to reduce the total \[threat\] of Zigil Mineshaft/,
    ],
    [
      MM.follower,
      "text",
      /Goblin Follower engages that player\."$/,
      /Goblin Follower engages that player\.$/,
    ],
    [
      MM.stairs,
      "text",
      /While Stairs of Náin is.*When Stairs of Náin is explored/s,
      /Stairs of Nain/,
    ],
    [
      MM.warlord,
      "text",
      /non-combat damage\.\nForced/,
      /non-combat damageForced/,
    ],
  ];
  for (const [code, field, fixed, typo] of fixes) {
    assert.match(card(code)[field]!, fixed, `${card(code).name} ${field}`);
    assert.match(
      original(code)[field] ?? "",
      typo,
      `${card(code).name} ${field}`,
    );
  }
  assert.deepEqual(
    [card(MM.brood).traits, original(MM.brood).traits],
    ["Spider.", "Creature."],
  );
  // The catalog prints no shadow effects; the scans have 22.
  const shadows = MM_ENCOUNTERS.filter((c) => c.shadow).map((c) => c.name);
  assert.equal(shadows.length, 22);
  assert.ok(snapshot.cards.every((c) => !(c as { shadow?: string }).shadow));
  // The catalog runs paragraphs together; the scans break them.
  const breaks: [string, "text" | "back_text", RegExp][] = [
    [
      MM.request,
      "back_text",
      /each attack\.\)\nForced:.*staging area\.\nThis stage/s,
    ],
    [MM.balin, "back_text", /this phase\.\nThis stage cannot be defeated/],
    [
      MM.eastward,
      "back_text",
      /quest points\.\nForced:.*encounter deck\.\nThis stage/s,
    ],
    [
      MM.watcher,
      "text",
      /^Immune to player card effects\.\nCannot be optionally engaged\.\nThe Watcher gets/,
    ],
    [
      MM.chamber,
      "text",
      /main quest\.\nImmune.*effects\.\nThe players.*stage 3B\.\nTravel:/s,
    ],
    [MM.stairway, "text", /encounter deck\."\nTravel:/],
    [MM.guardroom, "text", /on it\.\nForced:.*here\.\nTravel:/s],
    [MM.brood, "text", /damage\.\nWhile Brood Mother/],
    [MM.troll, "text", /attachments\.\nWhile Great Cave-troll/],
  ];
  for (const [code, field, broken] of breaks)
    assert.match(card(code)[field]!, broken, `${card(code).name} ${field}`);
  for (const c of [...MM_ENCOUNTERS, ...MM_QUESTS])
    for (const field of ["text", "back_text", "shadow", "traits"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(
        v,
        /  |\s$|`|[a-z]\.[A-Z]|\."[A-Z]|\d (Attack|Defense)\b/,
        `${c.name}: tidy ${field}`,
      );
    }
  assert.deepEqual(
    [MM.watcher, MM.savage, MM.brood, MM.troll, MM.warlord, MM.follower].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat, c.attack, c.defense, c.health];
      },
    ),
    [
      [50, 2, 4, 1, 4],
      [32, 3, 5, 2, 6],
      [38, 3, 6, 4, 8],
      [36, 2, 6, 2, 9],
      [33, 2, 5, 4, 7],
      [50, 2, 2, 0, 3],
    ],
  );
  assert.deepEqual(
    MM_ENCOUNTERS.filter((c) => c.is_unique)
      .map((c) => c.name)
      .sort(),
    [
      "Brood Mother",
      "Chamber of Mazarbul",
      "Goblin Tunnels",
      "Goblin Warlord",
      "Spider Burrow",
      "Stairs of Náin",
      "The Watcher",
    ],
  );
});
