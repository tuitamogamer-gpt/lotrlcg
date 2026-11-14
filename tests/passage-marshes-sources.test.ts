import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  POM,
  PASSAGE_MARSHES_ENCOUNTERS,
  PASSAGE_MARSHES_QUESTS,
  PASSAGE_MARSHES_RECIPES,
} from "../src/game/passage-marshes-support";
import {
  LAND_SHADOW_FRODO,
  LAND_SHADOW_ONE_RING,
} from "../src/game/lotr-saga-codes";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/the-passage-of-the-marshes-import.json";
import art from "./passage-marshes-art.json";
import quantities from "./passage-marshes-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const count = (mode: string, code: string) =>
  PASSAGE_MARSHES_RECIPES.find((r) => r.mode === mode)!
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);
const RULES = "octgn:ba62a8f1-1857-4449-8f49-7b584b9aaa7d";

test("The Passage of the Marshes keeps the catalog's recipes, the printed set numbers and an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.artwork.length, 26);
  // Sméagol is Gollum's back; the rules card explains the Mire keyword.
  assert.deepEqual(
    [
      ...PASSAGE_MARSHES_ENCOUNTERS.filter((c) => !c.code.endsWith(":B")).map(
        (c) => c.code,
      ),
      ...PASSAGE_MARSHES_QUESTS.map((c) => c.code),
      LAND_SHADOW_FRODO,
      LAND_SHADOW_ONE_RING,
      RULES,
    ].sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(PASSAGE_MARSHES_RECIPES.map((r) => r.id).sort(), [
    "E0B.10",
    "Q0B.10",
  ]);
  for (const recipe of snapshot.recipes)
    assert.deepEqual(
      PASSAGE_MARSHES_RECIPES.find((r) => r.id === recipe.id),
      recipe,
    );
  for (const row of quantities) {
    assert.equal(count("standard", row.code), row.normal, `${row.name} normal`);
    assert.equal(count("easy", row.code), row.easy, `${row.name} easy`);
  }
  // The scans' set numbers: 30 cards of The Passage of the Marshes, 3 of
  // Gollum (with Sméagol on the back) and 4 of Morgul Nazgûl, plus 3 quest
  // cards, Frodo and The One Ring. Hall of Beorn's 42 add the four campaign
  // burdens and the campaign card.
  assert.equal(
    quantities.reduce((n, r) => n + r.normal, 0),
    30 + 3 + 4 + 3 + 2,
  );
  assert.equal(42 - 4 - 1, 30 + 3 + 4);
  // Easy: 25 encounter cards and Gollum. Hall of Beorn lists 3 copies of
  // Haunted Mere in easy mode; recipe E0B.10 keeps 2.
  assert.equal(
    quantities.reduce((n, r) => n + r.easy, 0),
    25 + 1 + 3 + 2,
  );
  assert.equal(count("easy", POM.mere), 2);
  assert.equal(
    hash("src/data/pending/the-passage-of-the-marshes-import.json"),
    "c7dff8eb6139bae913af9aa6f6f683c42e53ff175f2a80d8602b24907cabb6c3",
  );
});

test("All 26 faces are pinned and the reviewed scans correct the catalog", () => {
  assert.equal(art.length, 26);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  // Names as printed.
  assert.equal(original(POM.hates).name, "We Hates Them");
  assert.equal(card(POM.hates).name, "We Hates Them!");
  assert.equal(original(POM.taming).name, "The Taming of Smeagol");
  assert.equal(card(POM.taming).name, "The Taming of Sméagol");
  assert.equal(original(POM.across).back_name, "Across the Dead Marshes");
  assert.equal(card(POM.across).back_name, "Across the Marshes");
  // Sméagol keeps his accent; the Forced effects stand on their own lines.
  assert.match(original(POM.gollum).text!, /flip him to Smeagol/);
  assert.match(
    card(POM.gollum).text!,
    /\nForced: When Gollum is defeated, flip him to Sméagol and exhaust Sméagol\./,
  );
  assert.match(original(POM.fens).text!, /Evilsmelling Fens/);
  assert.match(
    card(POM.fens).text!,
    /When Evil-smelling Fens is discarded by the Mire keyword, deal 1 damage to each character\.\nTravel: Each player must raise his threat by 1 to travel here\./,
  );
  assert.match(
    card(POM.pools).text!,
    /each player must raise his threat by 5\.\nStagnant Pools gets \+1 \[threat\] for each mire token on it\.\nTravel: Exhaust Sméagol to travel here\./,
  );
  // Sméagol: the objective-ally back, with his printed statistics.
  const smeagol = card(POM.smeagol);
  assert.equal(smeagol.name, "Sméagol");
  assert.equal(smeagol.type_code, "objective-ally");
  assert.deepEqual(
    [smeagol.willpower, smeagol.attack, smeagol.defense, smeagol.health],
    [2, 2, 2, 5],
  );
  assert.equal(
    smeagol.imagesrc,
    "/cards/32993141-956c-4426-98d9-8705de6fee00.B.jpg",
  );
  assert.equal(
    smeagol.text,
    original(POM.gollum)
      .back_text!.replace(/Smeagol/g, "Sméagol")
      .replace(/\.  /g, ".\n"),
  );
  // The Land of Shadow's Ring-bearer.
  assert.equal(card(LAND_SHADOW_FRODO).sphere_code, "fellowship");
  assert.equal(card(LAND_SHADOW_ONE_RING).pack_code, "LoS");
  // Every encounter card shows its local scan.
  for (const c of [...PASSAGE_MARSHES_ENCOUNTERS, ...PASSAGE_MARSHES_QUESTS])
    assert.ok(
      art.some((a) => a.localPath === c.imagesrc),
      `${c.name} uses a pinned scan`,
    );
});
