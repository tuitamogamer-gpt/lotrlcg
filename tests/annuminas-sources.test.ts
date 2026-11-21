import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SA,
  SA_ENCOUNTERS,
  SA_EPIC_QUESTS,
  SA_QUESTS,
  SA_RECIPES,
  saRecipe,
} from "../src/game/annuminas-support";
import { card } from "../src/game/cards";
import { automatedScenarioId } from "../src/game/support";
import snapshot from "../src/data/pending/the-siege-of-annuminas-import.json";
import art from "./annuminas-art.json";
import quantities from "./annuminas-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const EPIC_CODES = new Set([SA.epicMode, ...SA_EPIC_QUESTS.map((q) => q.code)]);
const total = (code: string) =>
  saRecipe()
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("The Siege of Annúminas keeps Hall of Beorn's standard-mode quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 28);
  assert.equal(snapshot.artwork.length, 35);
  // The epic multiplayer cards come from their own reviewed import
  // (tests/annuminas-epic.test.ts).
  assert.deepEqual(
    [...SA_ENCOUNTERS.filter((c) => c.code !== SA.epicMode), ...SA_QUESTS]
      .map((c) => c.code)
      .sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(SA_RECIPES, snapshot.recipes);
  // One recipe: the epic multiplayer recipe (Q99.09) is three copies of this
  // one, one for each team (tests/annuminas-epic.test.ts); the scenario
  // predates official easy mode.
  assert.deepEqual(
    SA_RECIPES.map((r) => r.id),
    ["Q99.08"],
  );
  // The catalog names the standard recipe after its setup card.
  assert.equal(
    automatedScenarioId({
      name: "Standard The Siege of Annúminas",
      mode: "standard",
    }),
    "the-siege-of-annuminas",
  );
  assert.equal(
    automatedScenarioId({
      name: "Epic The Siege of Annúminas",
      mode: "standard",
    }),
    "the-siege-of-annuminas",
  );
  assert.equal(quantities.length, 28);
  for (const row of quantities) {
    assert.equal(total(row.code), row.quantity, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
  }
  // Hall of Beorn lists 48 encounter cards with both setup cards; standard
  // mode uses 47 (no Epic Multiplayer Mode card), the 1A-3A quest deck and
  // the three rules cards.
  const sum = (type?: string) =>
    quantities
      .filter((r) => (type ? r.type === type : true))
      .reduce((n, r) => n + r.quantity, 0);
  assert.equal(sum(), 47 + 3 + 3);
  assert.equal(sum("quest"), 3);
  assert.equal(sum("rules"), 3);
  assert.equal(sum("campaign"), 1);
  const sections = snapshot.recipes[0].sections;
  assert.deepEqual(
    Object.keys(sections.sharedSetAside)
      .map((c) => card(c).name)
      .sort(),
    [
      "Annúminas",
      "Battering Ram",
      "Dúnedain of Annúminas",
      "Enemy Camp",
      "Host of Angmar",
      "Lieutenant of Angmar",
      "Siege Tunnel",
      "The Siege of Annúminas",
      "The Siege of Annúminas",
      "The Siege of Annúminas",
    ],
  );
  assert.equal(
    hash("src/data/pending/the-siege-of-annuminas-import.json"),
    "ec9d070e27eb5a43f9d495f28e12e6c39ae0448208a4090340930c98ec3562c4",
  );
});

test("All 49 faces are pinned and the reviewed scans correct the catalog", () => {
  // 35 standard faces and the 14 faces of the epic multiplayer cards.
  assert.equal(art.length, 49);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    snapshot.artwork.map((a) => a.sha256).sort(),
    art
      .filter((a) => !EPIC_CODES.has(a.code))
      .map((a) => a.sha256)
      .sort(),
  );
  assert.deepEqual(
    SA_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Rebuild the Defenses", null],
      ["Defend the City", 50],
      ["Lead the Sortie", null],
    ],
  );
  // The catalog drops the diacritics in card text.
  for (const c of [...SA_ENCOUNTERS, ...SA_QUESTS])
    for (const field of ["text", "back_text", "shadow"] as const) {
      const v = c[field] ?? "";
      assert.doesNotMatch(v, /Annuminas|Dunedain|Carn Dum\b/, c.name);
      assert.doesNotMatch(v, /  |\s$|`/, `${c.name}: tidy ${field}`);
    }
  assert.match(original(SA.city).text!, /Annuminas/);
  // Typos and missing text the scans correct.
  const fixes: [string, RegExp, RegExp][] = [
    [SA.tunnel, /At the end of the round, each team/, /end or the round/],
    [SA.warg, /exhaust a character you control/, /charater/],
    [SA.press, /you control, or each questing/, /you control or each/],
  ];
  for (const [code, fixed, typo] of fixes) {
    assert.match(card(code).text!, fixed, card(code).name);
    assert.match(original(code).text!, typo, card(code).name);
  }
  assert.match(
    card(SA.defend).back_text!,
    /Each player at that stage heals 1 damage from a character he controls\.$/,
  );
  assert.match(card(SA.orc).shadow!, /until end of round\.$/);
  assert.match(card(SA.werewolf).shadow!, /after this one\.$/);
  assert.match(card(SA.weary).shadow!, /^Shadow: Attacking enemy gets \+1/);
  assert.match(original(SA.weary).shadow!, /\+ 1/);
  // The rules sheet, from the scans.
  assert.match(card(SA.rules3).text!, /^City Strength/);
  assert.match(card(SA.rules3).back_text!, /^Frequently Asked Questions/);
  assert.match(card(SA.mode).back_text!, /deal 9 damage to Annúminas\.$/);
  // Statistics from the scans.
  assert.deepEqual(
    [
      SA.lieutenant,
      SA.host,
      SA.warg,
      SA.orc,
      SA.rider,
      SA.werewolf,
      SA.vanguard,
    ].map((code) => {
      const c = card(code);
      return [
        c.engagement,
        c.threat,
        c.attack,
        c.defense,
        c.health,
        c.victory ?? null,
      ];
    }),
    [
      [0, 4, 6, 4, 9, 4],
      [50, 4, 9, 4, 12, 4],
      [20, 1, 2, 1, 2, null],
      [30, 2, 4, 2, 3, null],
      [35, 2, 3, 2, 4, null],
      [40, 3, 5, 2, 5, null],
      [45, 3, 6, 3, 8, null],
    ],
  );
  assert.deepEqual(
    [
      SA.ram,
      SA.camp,
      SA.tunnel,
      SA.gate,
      SA.wall,
      SA.battlefield,
      SA.evendim,
      SA.nenuial,
    ].map((code) => {
      const c = card(code);
      return [c.printed_stats?.threat ?? c.threat, c.quest, c.victory ?? null];
    }),
    [
      ["X", 5, 5],
      ["5", 5, 5],
      ["5", 5, 5],
      ["X", 5, null],
      ["3", 4, null],
      ["3", 3, null],
      ["4", 4, null],
      ["2", 6, null],
    ],
  );
  const dunedain = card(SA.dunedain);
  assert.deepEqual(
    [dunedain.willpower, dunedain.attack, dunedain.defense, dunedain.health],
    [1, 2, 2, 3],
  );
});
