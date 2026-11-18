import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  EK,
  EK_ENCOUNTERS,
  EK_QUESTS,
  EK_RECIPES,
  EK_SETS,
  ekCost,
  ekPhysical,
  ekRecipe,
} from "../src/game/escape-khazad-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/escape-from-khazad-dum-import.json";
import catalog from "../public/catalog.json";
import art from "./escape-khazad-art.json";
import quantities from "./escape-khazad-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
type Raw = { code: string; [k: string]: unknown };
const catalogCards = (
  Array.isArray(catalog) ? catalog : (catalog as { cards: Raw[] }).cards
) as Raw[];
/** The catalog entry: the snapshot's, or (Durin's Bane) the catalog's own. */
const original = (code: string) =>
  ((snapshot.cards as Raw[]).find((c) => c.code === code) ??
    catalogCards.find((c) => c.code === code)!) as Raw & {
    text?: string;
    back_text?: string;
    back_name?: string;
    traits?: string;
  };
const total = (code: string) =>
  ekRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Escape from Khazad-dûm keeps the recipe's quantities, 14 encounter sets of 5 cards costing 3 each, and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 50);
  assert.equal(snapshot.artwork.length, 57);
  // Durin's Bane is Dark Pit's other side, the catalog's own card.
  assert.deepEqual(
    [...EK_ENCOUNTERS, ...EK_QUESTS]
      .map((c) => c.code)
      .filter((c) => c !== EK.bane)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.ok(catalogCards.some((c) => c.code === EK.bane));
  assert.equal(ekPhysical(EK.bane), EK.pit);
  assert.equal(card(EK.bane).flip_of, EK.pit);
  assert.equal(card(EK.pit).back_name, "Durin's Bane");
  assert.equal(total(EK.bane), 0, "it is no card of the recipe");
  assert.deepEqual(EK_RECIPES, snapshot.recipes);
  assert.deepEqual(
    EK_RECIPES.map((r) => r.id),
    ["Q99.14"],
  );
  assert.equal(
    automatedScenarioId({ name: "Escape from Khazad-dûm", mode: "standard" }),
    "escape-from-khazad-dum",
  );
  assert.equal(quantities.length, 50);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
    if (row.cost !== null) assert.equal(ekCost(row.code), row.cost, row.name);
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
  // The recipe lists the encounter sets as its quest deck section.
  assert.deepEqual(Object.keys(snapshot.recipes[0].sections).sort(), [
    "sharedQuestDeck",
    "sharedSetAside",
  ]);
  assert.deepEqual(
    Object.entries(snapshot.recipes[0].sections.sharedSetAside)
      .map(([c, n]) => `${card(c).back_name ?? card(c).name} ${n}`)
      .sort(),
    [
      "A Way Up 1",
      "A Wrong Turn 1",
      "Durin's Bane 1",
      "Last Lord of Moria 1",
      "Old One Lair 1",
      "Out of the Depths 1",
      "The Bridge of Khazad-dûm 1",
      "The Rear Guard 1",
    ],
    "Dark Pit is named by its back here",
  );
  // Each set: 5 cards with a total cost of 3, numbered 15 to 28.
  const sets = new Map<number, typeof quantities>();
  for (const row of quantities)
    if (row.set !== null)
      sets.set(row.set, [...(sets.get(row.set) ?? []), row]);
  assert.deepEqual(
    [...sets.keys()].sort((a, b) => a - b),
    [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
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
      [...(EK_SETS.find((x) => x.number === n)?.cards ?? [])].sort(),
      rows.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
    );
  }
  assert.equal(
    hash("src/data/pending/escape-from-khazad-dum-import.json"),
    "a477a352e242cd7fcb7058f470c2bc78468abaf2a4d1aca5cd6b33f52ae62374",
  );
});

test("All 58 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 58);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  const extra = art.filter(
    (a) => !snapshot.artwork.some((x) => x.sha256 === a.sha256),
  );
  assert.deepEqual(
    extra.map((a) => [a.code, a.face, a.localPath]),
    [[EK.bane, "front", "/cards/846794c2-be0f-4016-b9fe-fe6266d7fddd.jpg"]],
    "Durin's Bane's face, from its catalog entry",
  );
  assert.equal(card(EK.pit).back_imagesrc, extra[0].localPath);
  assert.deepEqual(
    EK_QUESTS.map((q) => [q.name, q.back_name, q.cost, q.back_quest ?? null]),
    [
      ["Out of the Depths", "Out of the Depths", 1, 10],
      ["Search for an Exit", "Old One Lair", 2, 10],
      ["Search for an Exit", "A Wrong Turn", 2, 15],
      ["Search for an Exit", "A Way Up", 2, 20],
      ["Nearing the Gate", "The Bridge of Khazad-dûm", 3, 10],
      ["Nearing the Gate", "Last Lord of Moria", 3, 15],
      ["Nearing the Gate", "The Rear Guard", 3, 20],
    ],
  );
  // Dark Pit and Durin's Bane have no cost box.
  assert.deepEqual(
    [card(EK.pit), card(EK.bane)].map((c) => [
      c.type_code,
      c.traits,
      c.is_unique,
      (c as { corner_text?: string }).corner_text ?? null,
    ]),
    [
      ["location", "Underground.", true, null],
      ["enemy", "Balrog.", true, null],
    ],
  );
  // The catalog has no cost for any card; the scans give them.
  assert.ok(
    snapshot.cards.every((c) => !(c as { corner_text?: string }).corner_text),
  );
  assert.deepEqual(
    [
      EK.greatBridge,
      EK.chieftain,
      EK.elder,
      EK.nest,
      EK.den,
      EK.hobgoblin,
      EK.dweller,
      EK.adder,
    ].map((c) => ekCost(c)),
    [3, 3, 3, 2, 2, 2, 2, 0],
  );
  // Typos, omissions and the catalog's backticks, read from the scans.
  const fixes: [string, "text" | "back_text", RegExp, RegExp][] = [
    [
      EK.depths,
      "back_text",
      /^Forced: When Dark Pit is explored/,
      /^Shuffle the encounter deck\.Forced/,
    ],
    [
      EK.lair,
      "text",
      /Its 'when revealed' effects cannot be canceled\.$/,
      /It`s `when revealed`/,
    ],
    [
      EK.lair,
      "back_text",
      /The opposing team searches the encounter deck.*places a resource on it/s,
      /searchs the encounter deck.*places a resources on it/s,
    ],
    [
      EK.wayUp,
      "back_text",
      /must travel to a location, if able\.$/,
      /must travel, if able\.$/,
    ],
    [
      EK.bridge,
      "back_text",
      /If this stage is defeated, the players win/,
      /If this stage is defeated the players win/,
    ],
    [
      EK.lastLord,
      "back_text",
      /more than X damage each round/,
      /more than X damage per round/,
    ],
    [
      EK.rearGuard,
      "back_text",
      /reduced by player card effect\.\n/,
      /reduced by player card effects\./,
    ],
    [
      EK.pit,
      "text",
      /if there are two or more players/,
      /if there are 2 or more players/,
    ],
    [EK.bane, "text", /^Immune to player card effects\./, /^Immuned/],
    [EK.blackBats, "text", /Either raise/, /Eithe raise/],
    [EK.bones, "text", /^Surge\.\nWhen Revealed/, /^Surge\.\nSurge\./],
    [EK.stoneTroll, "text", /attacks and destroys/, /attachs and destroys/],
    [
      EK.chasm,
      "text",
      /the players must travel to Bottomless Chasm, if able/,
      /the player must choose Bottomless Chasm, if able/,
    ],
    [EK.lost, "text", /a questing character controlled/, /charactert/],
    [EK.hobgoblin, "text", /After Hobgoblin engages/, /Hobgobling/],
    [
      EK.unspeakable,
      "text",
      /Unspeakable Thing gets \+X/,
      /Unspeakable thing gets/,
    ],
    [
      EK.dweller,
      "text",
      /among characters you control/,
      /among character you control/,
    ],
    [EK.elder, "text", /first player\."$/, /first player\.$/],
    [
      EK.dungeon,
      "text",
      /faceup under Goblin Dungeon as a guarded objective/,
      /faceup as a guarded objective/,
    ],
    [
      EK.uruks,
      "text",
      /shadow card it is dealt for this attack/,
      /shadow card dealt for this attack/,
    ],
    [
      EK.raiders,
      "text",
      /After Orc Raiders engages/,
      /After Orc Raider engages/,
    ],
    [EK.nameless, "text", /guarded attachment\./, /guarded attached\./],
    [EK.mithril, "text", /While Mithril Lode is.*controls\."$/s, /Mitril/],
  ];
  for (const [code, field, fixed, typo] of fixes) {
    assert.match(card(code)[field]!, fixed, `${card(code).name} ${field}`);
    assert.match(
      String(original(code)[field] ?? ""),
      typo,
      `${card(code).name} ${field}`,
    );
  }
  assert.deepEqual(
    [card(EK.bridge).back_name, original(EK.bridge).back_name],
    ["The Bridge of Khazad-dûm", "The Bridge of Khazad-dum"],
  );
  assert.deepEqual(
    [card(EK.unspeakable).traits, original(EK.unspeakable).traits],
    ["Creature.", ""],
  );
  assert.deepEqual(
    [card(EK.raiders).traits, original(EK.raiders).traits],
    ["Orc. Uruk.", "Orc. uruk."],
  );
  assert.deepEqual(
    [card(EK.roots).printed_stats?.threat, card(EK.roots).threat],
    ["X", 0],
  );
  // The catalog prints no shadow effects; the scans have 22.
  const shadows = EK_ENCOUNTERS.filter((c) => c.shadow).map((c) => c.name);
  assert.equal(shadows.length, 22);
  assert.ok(snapshot.cards.every((c) => !(c as { shadow?: string }).shadow));
  // The catalog runs paragraphs together; the scans break them.
  const breaks: [string, "text" | "back_text", RegExp][] = [
    [EK.depths, "back_text", /his deck\.\nThis stage cannot be defeated/],
    [
      EK.bridge,
      "back_text",
      /each round\.\nForced:.*placed here\.\nIf this stage/s,
    ],
    [EK.pit, "text", /^Immune to player card effects\.\nTravel:/],
    [EK.caveTroll, "text", /attachments\.\nAllies cannot/],
    [
      EK.chieftain,
      "text",
      /damage\.\nShadow effects cannot be canceled\.\nForced:/,
    ],
    [EK.nest, "text", /\[threat\]\.\nForced:/],
    [EK.bane, "text", /effects\.\nCannot be optionally engaged\.\nForced:/],
  ];
  for (const [code, field, broken] of breaks)
    assert.match(card(code)[field]!, broken, `${card(code).name} ${field}`);
  for (const c of [...EK_ENCOUNTERS, ...EK_QUESTS])
    for (const field of ["text", "back_text", "shadow", "traits"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(
        v,
        /  |\s$|`|[a-z]\.[A-Z]|\."[A-Z]|\d (Attack|Defense)\b/,
        `${c.name}: tidy ${field}`,
      );
    }
  assert.deepEqual(
    [EK.bane, EK.elder, EK.chieftain, EK.dweller, EK.stoneTroll, EK.horn].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat, c.attack, c.defense, c.health];
      },
    ),
    [
      [50, 4, 8, 3, 15],
      [38, 3, 5, 3, 9],
      [35, 3, 5, 3, 8],
      [36, 3, 5, 3, 6],
      [33, 1, 6, 1, 8],
      [45, 2, 4, 3, 5],
    ],
  );
  assert.deepEqual(
    EK_ENCOUNTERS.filter((c) => c.is_unique)
      .map((c) => c.name)
      .sort(),
    [
      "Chieftain of the Pit",
      "Dark Pit",
      "Durin's Bane",
      "Elder Nameless Thing",
      "Frightful Den",
      "Nest of Vermin",
      "The Great Bridge",
    ],
  );
});
