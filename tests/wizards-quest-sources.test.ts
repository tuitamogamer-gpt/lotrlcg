import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  WQ,
  WQ_ENCOUNTERS,
  WQ_QUESTS,
  WQ_RECIPES,
  WQ_SETS,
  wqCost,
  wqPhysical,
  wqRecipe,
} from "../src/game/wizards-quest-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/the-wizard-s-quest-import.json";
import art from "./wizards-quest-art.json";
import quantities from "./wizards-quest-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (code: string) =>
  wqRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Wizard's Quest keeps Hall of Beorn's quantities, 14 encounter sets of 5 cards costing 3 each, and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 51);
  assert.equal(snapshot.artwork.length, 59);
  // Rider of Mirkwood is Rhosgobel's enemy side, a separate playable face.
  assert.deepEqual(
    [...WQ_ENCOUNTERS, ...WQ_QUESTS]
      .map((c) => c.code)
      .filter((c) => c !== WQ.rider)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.equal(wqPhysical(WQ.rider), WQ.rhosgobel);
  assert.equal(card(WQ.rider).flip_of, WQ.rhosgobel);
  assert.deepEqual(WQ_RECIPES, snapshot.recipes);
  assert.deepEqual(
    WQ_RECIPES.map((r) => r.id),
    ["Q99.11"],
  );
  assert.equal(
    automatedScenarioId({ name: "The Wizard's Quest", mode: "standard" }),
    "the-wizards-quest",
  );
  assert.equal(quantities.length, 51);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
    if (row.cost !== null) assert.equal(wqCost(row.code), row.cost, row.name);
  }
  // 70 encounter cards in 14 sets, plus Rhosgobel and the 7 quest cards set aside.
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
      "A Fork in the Road 1",
      "A New Terror Abroad 1",
      "Carried Away 1",
      "Dungeons of the Necromancer 1",
      "Radagast's Request 1",
      "Return to Rhosgobel 1",
      "Rider of Mirkwood 1",
      "The Tower of Sorcery 1",
    ],
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
      [...(WQ_SETS.find((x) => x.number === n)?.cards ?? [])].sort(),
      rows.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
    );
  }
  // Each set has one or two enemies, locations and treacheries.
  const kinds = (n: number) =>
    ["enemy", "location", "treachery"].map((t) =>
      sets
        .get(n)!
        .filter((r) => r.type === t)
        .reduce((x, r) => x + r.quantity, 0),
    );
  assert.deepEqual(kinds(15), [1, 2, 2]);
  assert.deepEqual(kinds(28), [3, 1, 1]);
  assert.equal(
    hash("src/data/pending/the-wizard-s-quest-import.json"),
    "6882eb18bce09da2c32a3f67ae86dd447e84575ff9927c8c2a7e57449851f4ea",
  );
});

test("All 59 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 59);
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
    WQ_QUESTS.map((q) => [q.name, q.back_name, q.cost, q.back_quest]),
    [
      ["Radagast's Request", "Radagast's Request", 1, 10],
      ["Mirkwood Forest", "A Fork in the Road", 2, 5],
      ["Mirkwood Forest", "Carried Away", 2, 20],
      ["Mirkwood Forest", "A New Terror Abroad", 2, 5],
      ["The Necromancer's Tower", "The Tower of Sorcery", 3, 20],
      ["The Necromancer's Tower", "Dungeons of the Necromancer", 3, 15],
      ["The Necromancer's Tower", "Return to Rhosgobel", 3, 10],
    ],
  );
  // Rider of Mirkwood, from the scan of Rhosgobel's back.
  const rider = card(WQ.rider);
  assert.deepEqual(
    [
      rider.type_code,
      rider.traits,
      rider.is_unique,
      rider.engagement,
      rider.printed_stats?.threat,
      rider.attack,
      rider.defense,
      rider.health,
      rider.victory,
    ],
    ["enemy", "Nazgûl.", true, 50, "X", 6, 3, 10, 6],
  );
  assert.equal(original(WQ.rhosgobel).back_name, "Rider of Mirkwood");
  assert.equal(original(WQ.rhosgobel).back_victory, 6);
  // Typos in the catalog, read from the scans.
  const fixes: [string, "text" | "back_text" | "shadow", RegExp, RegExp][] = [
    [
      WQ.fork,
      "text",
      /sets it aside, and shuffles the encounter deck/,
      /and shufles the/,
    ],
    [
      WQ.carried,
      "back_text",
      /faceup under this stage as guarded/,
      /under this stge as/,
    ],
    [
      WQ.dungeons,
      "back_text",
      /and attaches a hero he controls/,
      /and attached a hero/,
    ],
    [WQ.nazgul, "text", /either return it to the staging area/, /eithe return/],
    [
      WQ.blood,
      "text",
      /The opposing team attaches Smoking Blood.*surge\. \(Counts/s,
      /team attached Smoking Blood.*surge\.\(Counts/s,
    ],
    [
      WQ.mosquitoes,
      "text",
      /where X is 1 more than the stage number/,
      /where X is more than/,
    ],
    [
      WQ.sniper,
      "text",
      /each player deals 1 damage to a hero/,
      /easy player deals/,
    ],
    [
      WQ.sniper,
      "shadow",
      /does not count its \[defense\]\.$/,
      /count it's Defense/,
    ],
    [
      WQ.pine,
      "text",
      /Each Pine Slopes gets \+2 \[threat\]/,
      /Each Pine Slopes \+2/,
    ],
    [WQ.beastmaster, "text", /Shuffle the encounter deck\.$/, /enconter/],
    [
      WQ.storm,
      "text",
      /gets -1 \[willpower\] and cannot be healed/,
      /-1 A' and/,
    ],
    [
      WQ.crows,
      "text",
      /in the encounter discard pile/,
      /copy of Eastern Crows in the discard pile/,
    ],
    [
      WQ.tower,
      "text",
      /When The Sorcerer's Tower is explored/,
      /When the Sorcerer's Tower/,
    ],
    [WQ.troll, "text", /non-objective player card attachments/, /palyer/],
    [
      WQ.befouled,
      "text",
      /^When Revealed: Attach to the character/,
      /^When Revealed: \[attack\] to the/,
    ],
    [
      WQ.shadow,
      "text",
      /Counts as a Condition attachment/,
      /Counts as a condition attachment/,
    ],
    [
      WQ.glade,
      "text",
      /While The Wargs' Glade.*When The Wargs' Glade is explored/s,
      /The Warg's Glade/,
    ],
    [WQ.howling, "shadow", /if it has the Warg trait/, /the the Warg/],
    [WQ.orcs, "shadow", /gets -1 \[defense\] for each damage/, /-1 Defense/],
    [
      WQ.fog,
      "shadow",
      /\+1 \[attack\] and \+1 \[defense\]/,
      /\+1 Attack and \+1 Defense/,
    ],
  ];
  for (const [code, field, fixed, typo] of fixes) {
    assert.match(card(code)[field]!, fixed, `${card(code).name} ${field}`);
    assert.match(original(code)[field]!, typo, `${card(code).name} ${field}`);
  }
  // Icons: the catalog writes Attack, Defense and A' for the icons.
  for (const code of [
    WQ.pursued,
    WQ.mosquitoes,
    WQ.eyes,
    WQ.restless,
    WQ.reach,
    WQ.gate,
    WQ.bats,
    WQ.howling,
  ])
    assert.doesNotMatch(
      card(code).shadow ?? "",
      /\d (Attack|Defense)\b/,
      card(code).name,
    );
  // The catalog runs paragraphs together; the scans break them.
  const breaks: [string, "text" | "back_text", RegExp][] = [
    [
      WQ.request,
      "back_text",
      /Rider of Mirkwood to the staging area\.\nThis stage/,
    ],
    [
      WQ.fork,
      "back_text",
      /Shuffle the encounter deck\.\nThe location with a resource/,
    ],
    [WQ.terror, "back_text", /per player\.\nForced: At the beginning/],
    [WQ.sorcery, "back_text", /Reveal that treachery\.\nIf the players defeat/],
    [
      WQ.return,
      "back_text",
      /considered to be 0\.\nThe number of damage tokens.*this stage\.\nPlayers cannot defeat/s,
    ],
    [WQ.rhosgobel, "text", /^Immune to player card effects\.\nResponse:/],
    [
      WQ.rhosgobel,
      "back_text",
      /effects\.\nX is 1 more .* quest\.\nCannot leave/s,
    ],
    [
      WQ.hall,
      "text",
      /^Cannot have attachments\.\nTwilight Hall.*first player\.\nForced:/s,
    ],
    [WQ.bane, "text", /attachments\.\nForced:/],
    [WQ.grove, "text", /staging area\.\nTravel:/],
    [WQ.cave, "text", /draws 1 card\.\nTravel:/],
    [WQ.lookout, "text", /staging area\."\nTravel:/],
    [WQ.road, "text", /he controls\."\nTravel:/],
    [WQ.stream, "text", /main quest\."\nTravel:/],
  ];
  for (const [code, field, broken] of breaks)
    assert.match(card(code)[field]!, broken, `${card(code).name} ${field}`);
  for (const c of [...WQ_ENCOUNTERS, ...WQ_QUESTS])
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
    [WQ.nazgul, WQ.bane, WQ.sniper, WQ.troll, WQ.hunting, WQ.bats].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat, c.attack, c.defense, c.health];
      },
    ),
    [
      [36, 3, 6, 3, 9],
      [37, 3, 7, 1, 9],
      [38, 2, 4, 2, 5],
      [33, 1, 6, 2, 8],
      [32, 2, 3, 2, 4],
      [20, 2, 3, 1, 2],
    ],
  );
  assert.deepEqual(
    [WQ.rhosgobel, WQ.pass, WQ.hall, WQ.pine, WQ.tower, WQ.gate].map((code) => [
      card(code).threat,
      card(code).quest,
    ]),
    [
      [1, 1],
      [2, 2],
      [0, 6],
      [2, 4],
      [4, 4],
      [1, 5],
    ],
  );
  // The unique cards.
  assert.deepEqual(
    WQ_ENCOUNTERS.filter((c) => c.is_unique)
      .map((c) => c.name)
      .sort(),
    [
      "Bane of Amon Lanc",
      "Nazgûl of Dol Guldur",
      "Rhosgobel",
      "Rider of Mirkwood",
      "The Sorcerer's Tower",
      "The Wargs' Glade",
      "Twilight Hall",
    ],
  );
});
