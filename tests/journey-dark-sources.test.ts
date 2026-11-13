import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  JD,
  JOURNEY_DARK_ENCOUNTERS,
  JOURNEY_DARK_QUESTS,
  JOURNEY_DARK_RECIPES,
} from "../src/game/journey-dark-support";
import {
  ROAD_DARKENS_FRODO,
  ROAD_DARKENS_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/journey-in-the-dark-import.json";
import art from "./journey-dark-art.json";
import quantities from "./journey-dark-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  JOURNEY_DARK_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Journey in the Dark keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 22);
  assert.equal(snapshot.artwork.length, 25);
  assert.deepEqual(
    [
      ...JOURNEY_DARK_ENCOUNTERS.map((c) => c.code),
      ...JOURNEY_DARK_QUESTS.map((c) => c.code),
      ROAD_DARKENS_FRODO,
      ROAD_DARKENS_ONE_RING,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  for (const mode of ["standard", "easy"])
    assert.deepEqual(
      JOURNEY_DARK_RECIPES.find((r) => r.mode === mode),
      snapshot.recipes.find((r) => r.mode === mode),
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // Hall of Beorn: 38 and 30 encounter cards without the campaign card, plus
  // 3 quest cards, Frodo Baggins and The One Ring.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    38 + 3 + 2,
  );
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    30 + 3 + 2,
  );
  // The recipe's prepared staging area holds Doom, Doom, Doom and the 4
  // locations stage 1A lets the players choose from the encounter deck.
  const staged = JOURNEY_DARK_RECIPES.find((r) => r.mode === "standard")!
    .cards.filter((c) => c.section === "sharedStagingArea")
    .map((c) => c.code);
  assert.deepEqual(
    [...staged].sort(),
    [JD.doom, JD.hall, JD.stairway, JD.guardroom, JD.mines].sort(),
  );
  assert.equal(
    hash("src/data/pending/journey-in-the-dark-import.json"),
    "c1ba4c762a33b7918aa22e4fa132cdd624cdd4f496e6624971c70c48d3660990",
  );
});

test("All 25 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 25);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    JOURNEY_DARK_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["The Long Dark of Moria", 14],
      ["Drums in the Deep", 9],
      ["The Bridge of Khazad-dûm", 15],
    ],
  );
  // Printed names and text from the scans.
  assert.equal(original(JD.bridgeStage).name, "The Bridge of Kazad-dûm");
  assert.equal(original(JD.chieftain).name, "Orc-chieftan");
  assert.equal(original(JD.hall).name, "Many-pillard Hall");
  assert.match(card(JD.mazarbul).text!, /must be Orc-chieftain, if able/);
  assert.match(original(JD.mazarbul).text!, /Orc-chieftan/);
  assert.match(
    card(JD.chieftain).text!,
    /Allies cannot defend against Orc-chieftain\./,
  );
  assert.match(
    card(JD.hall).text!,
    /^Many-pillared Hall gets \+1 \[threat\] for each Many-pillared Hall in play\.$/,
  );
  for (const c of [...JOURNEY_DARK_ENCOUNTERS, ...JOURNEY_DARK_QUESTS]) {
    assert.doesNotMatch(c.text ?? "", /  |\s$|<b>|<i>/, `${c.name}: tidy text`);
    assert.doesNotMatch(
      c.back_text ?? "",
      /  |\s$|<b>|<i>/,
      `${c.name}: tidy text`,
    );
  }
  // Statistics from the scans.
  assert.deepEqual(
    [JD.balrog, JD.chieftain, JD.troll, JD.uruk, JD.orc, JD.archer].map(
      (code) => {
        const c = card(code);
        return [c.engagement, c.threat ?? null, c.attack, c.defense, c.health];
      },
    ),
    [
      [50, 5, 8, 9, 25],
      [40, 4, 4, 3, 6],
      [36, 3, 6, 4, 6],
      [34, 2, 4, 2, 5],
      [38, 2, 3, 1, 3],
      // Moria Archer's threat is X, the number of players.
      [42, null, 3, 3, 3],
    ],
  );
  assert.deepEqual(
    [JD.bridge, JD.mazarbul, JD.mines, JD.hall, JD.stairway, JD.guardroom].map(
      (code) => {
        const c = card(code);
        return [c.threat ?? null, c.quest, c.victory ?? null, !!c.is_unique];
      },
    ),
    [
      [5, 5, 5, true],
      [4, 4, 4, true],
      [2, 4, null, false],
      [1, 6, null, false],
      [4, 2, null, false],
      [3, 3, null, false],
    ],
  );
  assert.equal(card(JD.balrog).victory, 50);
  assert.ok(card(JD.balrog).is_unique);
  assert.equal(card(JD.doom).type_code, "objective");
});
