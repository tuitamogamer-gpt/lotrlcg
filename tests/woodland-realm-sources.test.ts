import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  WR,
  WR_ENCOUNTERS,
  WR_QUESTS,
  WR_RECIPES,
  WR_SETS,
  wrCost,
  wrPhysical,
  wrRecipe,
} from "../src/game/woodland-realm-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/the-woodland-realm-import.json";
import art from "./woodland-realm-art.json";
import quantities from "./woodland-realm-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (code: string) =>
  wrRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Woodland Realm keeps Hall of Beorn's quantities, 14 encounter sets of 5 cards costing 3 each, and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 50);
  assert.equal(snapshot.artwork.length, 58);
  // Mendor is Spider Den's objective-ally side, a separate playable face.
  assert.deepEqual(
    [...WR_ENCOUNTERS, ...WR_QUESTS]
      .map((c) => c.code)
      .filter((c) => c !== WR.mendor)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.equal(wrPhysical(WR.mendor), WR.den);
  assert.equal(card(WR.mendor).flip_of, WR.den);
  assert.deepEqual(WR_RECIPES, snapshot.recipes);
  assert.deepEqual(
    WR_RECIPES.map((r) => r.id),
    ["Q99.12"],
  );
  assert.equal(
    automatedScenarioId({ name: "The Woodland Realm", mode: "standard" }),
    "the-woodland-realm",
  );
  assert.equal(quantities.length, 50);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
    if (row.cost !== null) assert.equal(wrCost(row.code), row.cost, row.name);
  }
  // 70 encounter cards in 14 sets, plus Spider Den and the 7 quest cards set aside.
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
      '"Don\'t Leave the Path" 1',
      "Ambushed at Night 1",
      "Captured by Spiders 1",
      "Escape from Taur-nu-Fuin 1",
      "Lost in the Dark 1",
      "Mendor 1",
      "The Forest of Great Fear 1",
      "To the Elvenking's Halls 1",
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
      [...(WR_SETS.find((x) => x.number === n)?.cards ?? [])].sort(),
      rows.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
    );
  }
  // Each set has one to three enemies, locations and treacheries.
  const kinds = (n: number) =>
    ["enemy", "location", "treachery"].map((t) =>
      sets
        .get(n)!
        .filter((r) => r.type === t)
        .reduce((x, r) => x + r.quantity, 0),
    );
  assert.deepEqual(kinds(1), [1, 2, 2]);
  assert.deepEqual(kinds(4), [3, 1, 1]);
  assert.deepEqual(kinds(14), [1, 2, 2]);
  assert.equal(
    hash("src/data/pending/the-woodland-realm-import.json"),
    "14682dbe432c78f9bb5a340d99b1a1e679259490f49010891c25a38968d2d7e6",
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
  // The quest cards: stage 1, the three stage 2 and the three stage 3 cards.
  assert.deepEqual(
    WR_QUESTS.map((q) => [q.name, q.back_name, q.cost, q.back_quest ?? null]),
    [
      ["Captured by Spiders", "Captured by Spiders", 1, 10],
      ["A Chosen Path", "Lost in the Dark", 2, 20],
      ["A Chosen Path", '"Don\'t Leave the Path"', 2, 20],
      ["A Chosen Path", "Ambushed at Night", 2, 20],
      ["On the Trail", "The Forest of Great Fear", 3, 15],
      ["On the Trail", "To the Elvenking's Halls", 3, null],
      ["On the Trail", "Escape from Taur-nu-Fuin", 3, 20],
    ],
  );
  // Mendor, from the scan of Spider Den's back.
  const mendor = card(WR.mendor);
  assert.deepEqual(
    [
      mendor.type_code,
      mendor.traits,
      mendor.is_unique,
      mendor.willpower,
      mendor.attack,
      mendor.defense,
      mendor.health,
    ],
    ["objective-ally", "Silvan. Scout.", true, 2, 2, 2, 5],
  );
  assert.equal(original(WR.den).back_name, "Mendor");
  // Typos and omissions in the catalog, read from the scans.
  const fixes: [string, "text" | "back_text" | "name", RegExp, RegExp][] = [
    [
      WR.request,
      "text",
      /per player and adds them to/,
      /per player and adds it to/,
    ],
    [
      WR.request,
      "back_text",
      /^Forced: When Spider Den is explored/,
      /^Setup: Add Spider Den/,
    ],
    [
      WR.dark,
      "text",
      /The opposing team searches.*\(cost 2 or less if/s,
      /The opposing teach.*\(2 or less if/s,
    ],
    [
      WR.fear,
      "text",
      /\(cost 3 or less if.*Its 'when revealed'/s,
      /\(3 or less if.*It's 'when revealed'/s,
    ],
    [
      WR.fear,
      "back_text",
      /then places a resource.*the enemy with a resource is in play/s,
      /the places a resource.*the enemy witha resource/s,
    ],
    [
      WR.escape,
      "back_name",
      /^Escape from Taur-nu-Fuin$/,
      /^Escape from Taur-Nu-Fuin$/,
    ],
    [
      WR.den,
      "text",
      /\(1 cost or less instead if there are two/,
      /\(1 cost or less if there are two/,
    ],
    [WR.stream, "name", /^Enchanted Stream$/, /^Enchanted Steam$/],
    [
      WR.stream,
      "text",
      /^While Enchanted Stream is in the staging area/,
      /^While Enchanted Steam/,
    ],
    [WR.caves, "name", /^The Goblins' Caves$/, /^The Goblins' Cave$/],
    [
      WR.caves,
      "text",
      /While The Goblins' Caves.*When The Goblins' Caves/s,
      /The Goblin's Cave/,
    ],
    [
      WR.web,
      "text",
      /first spends 2 resources from its pool/,
      /spends 2 resource from/,
    ],
    [
      WR.giantWeb,
      "text",
      /Return any previous active location/,
      /Return any previous location/,
    ],
    [
      WR.watercourse,
      "text",
      /While Dry Watercourse is in the staging area/,
      /in in the staging area/,
    ],
    [
      WR.wasted,
      "text",
      /each of his heroes' resource pools/,
      /his heroe's resource pools/,
    ],
  ];
  for (const [code, field, fixed, typo] of fixes) {
    const was =
      field === "name"
        ? original(code).name
        : field === "back_text"
          ? original(code).back_text
          : field === "back_name"
            ? original(code).back_name
            : original(code).text;
    assert.match(
      (card(code) as Record<string, unknown>)[field] as string,
      fixed,
      `${card(code).name} ${field}`,
    );
    assert.match(was ?? "", typo, `${card(code).name} ${field}`);
  }
  // The printed text of The Spiders' Ring keeps its own spelling.
  assert.match(
    card(WR.ring).text ?? "",
    /While The Spiders' Ring.*When The Spider's Ring is explored/s,
  );
  // Traits the catalog lacks or misspells.
  assert.deepEqual(
    [WR.stream, WR.mountains, WR.flock, WR.pack, WR.road].map((c) => [
      card(c).traits,
      original(c).traits,
    ]),
    [
      ["Forest. River.", ""],
      ["Mountain.", "Mountains."],
      ["Creature.", ""],
      ["Warg.", ""],
      ["Forest.", ""],
    ],
  );
  // X values printed as X: Forest Grove (threat and quest points), Wild Bear (threat and defense).
  for (const [code, fields] of [
    [WR.grove, ["threat", "quest"]],
    [WR.bear, ["threat", "defense"]],
  ] as const)
    for (const f of fields) {
      assert.equal((card(code) as Record<string, unknown>)[f], 0);
      assert.equal(
        (card(code).printed_stats as Record<string, string>)[f],
        "X",
        `${card(code).name} ${f}`,
      );
    }
  // The catalog prints no shadow effects; the scans have 23.
  const shadows = WR_ENCOUNTERS.filter((c) => c.shadow).map((c) => c.name);
  assert.equal(shadows.length, 23);
  assert.ok(snapshot.cards.every((c) => !(c as { shadow?: string }).shadow));
  for (const name of [
    "Despair",
    "Gathering Gloom",
    "Black Forest Bats",
    "Hatred Rekindled",
    "Ambushing Orcs",
    "Wasted Provisions",
  ])
    assert.ok(shadows.includes(name), name);
  // The catalog runs paragraphs together; the scans break them.
  const breaks: [string, "text" | "back_text", RegExp][] = [
    [WR.request, "back_text", /ready\.\nThis stage cannot be defeated/],
    [
      WR.path,
      "back_text",
      /staging area\.\nDuring the travel phase.*if able\.\nForced:/s,
    ],
    [WR.ambush, "back_text", /cannot take damage\.\nForced:/],
    [WR.fear, "back_text", /card effects\.\nThis stage cannot be defeated/],
    [
      WR.halls,
      "back_text",
      /threat level\.\nEach player's threat.*each round\.\nForced:.*encounter deck\.\nIf the players defeat/s,
    ],
    [WR.escape, "back_text", /staging area\.\nIf the players defeat/],
    [WR.den, "text", /^Immune to player card effects\.\nTravel:/],
    [WR.spawn, "text", /damage\.\nWhile Ungoliant's Spawn/],
    [WR.grove, "text", /main quest\.\nTravel:/],
    [WR.stream, "text", /main quest\.\nTravel:/],
    [WR.dark, "back_text", /cannot be canceled\.\nForced:/],
  ];
  for (const [code, field, broken] of breaks)
    assert.match(card(code)[field]!, broken, `${card(code).name} ${field}`);
  for (const c of [...WR_ENCOUNTERS, ...WR_QUESTS])
    for (const field of ["text", "back_text", "shadow", "traits"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(
        v,
        /  |\s$|`|[a-z]\.[A-Z]|\."[A-Z]|\d (Attack|Defense)\b/,
        `${c.name}: tidy ${field}`,
      );
    }
  // Statistics from the scans.
  assert.deepEqual(
    [WR.spawn, WR.ufthak, WR.bats, WR.patrol, WR.wicked, WR.orcs].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat, c.attack, c.defense, c.health];
      },
    ),
    [
      [38, 3, 6, 3, 8],
      [36, 3, 6, 3, 6],
      [13, 1, 2, 1, 3],
      [34, 3, 4, 3, 5],
      [34, 2, 4, 2, 4],
      [30, 2, 3, 1, 4],
    ],
  );
  assert.deepEqual(
    [WR.den, WR.camp, WR.stream, WR.ring, WR.caves, WR.road, WR.trail].map(
      (code) => [card(code).threat, card(code).quest],
    ),
    [
      [1, 1],
      [2, 2],
      [2, 6],
      [4, 4],
      [3, 5],
      [4, 4],
      [3, 1],
    ],
  );
  // The unique cards.
  assert.deepEqual(
    WR_ENCOUNTERS.filter((c) => c.is_unique)
      .map((c) => c.name)
      .sort(),
    [
      "Chieftain Ufthak",
      "Enchanted Stream",
      "Mendor",
      "Spider Den",
      "The Goblins' Caves",
      "The Spiders' Ring",
      "Ungoliant's Spawn",
    ],
  );
});
