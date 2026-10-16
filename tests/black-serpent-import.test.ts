import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import original from "../src/data/pending/the-black-serpent-import.json";
import encounters from "../src/data/black-serpent-encounter-cards.json";
import quests from "../src/data/black-serpent-quest-cards.json";
import recipes from "../src/data/black-serpent-recipes.json";
import {
  BLACK_SERPENT as B,
  BLACK_SERPENT_OBJECTIVES,
} from "../src/game/black-serpent-support";
import { card } from "../src/game/cards";
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
test("Black Serpent import: exact original standard/easy physical recipe and immutable sources", () => {
  const source = JSON.parse(fs.readFileSync("public/scenarios.json", "utf8"));
  for (const r of recipes) {
    assert.deepEqual(
      r,
      source.find((x: { id: string }) => x.id === r.id),
    );
    const total = Object.fromEntries(
      Object.entries(r.sections).map(([k, v]) => [
        k,
        Object.values(v).reduce((n, q) => n + q, 0),
      ]),
    );
    assert.deepEqual(total, {
      sharedQuestDeck: 3,
      sharedEncounterDeck: r.mode === "easy" ? 29 : 37,
      sharedSetAside: 3,
      sharedStagingArea: 1,
    });
  }
  for (const [path, pin] of Object.entries({
    "public/catalog.json":
      "cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63",
    "public/scenarios.json":
      "00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f",
    "src/data/official-player-cards.json":
      "9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd",
  }))
    assert.equal(hash(fs.readFileSync(path)), pin, path);
  assert.equal(
    encounters.reduce((n, c) => n + c.quantity, 0),
    29,
  );
  assert.equal(
    quests.reduce((n, c) => n + c.quantity, 0),
    3,
  );
});
test("Black Serpent import: visually checked unique icons, keywords, quest points and names", () => {
  assert.deepEqual(
    quests.map((q) => q.back_quest),
    [6, 5, 6],
  );
  assert.equal(card(B.fort).name, "The Crossroads Fort");
  for (const code of [...BLACK_SERPENT_OBJECTIVES, B.serpent])
    assert.equal(card(code).is_unique, true);
  assert.match(card(B.bold).text!, /^Surge\. Doomed 1\./);
  assert.match(card(B.bastion).text!, /the players control/);
  assert.equal(card(B.serpent).health, 8);
  assert.equal(card(B.escape).victory, 10);
  assert.equal(
    original.cards.find((c) => c.code === B.campBattle)!.back_quest,
    6,
    "original snapshot retains upstream omission",
  );
});
test("Black Serpent import: all 25 original faces retain pinned local bytes", () => {
  assert.equal(original.artwork.length, 25);
  assert.equal(new Set(original.artwork.map((a) => a.localPath)).size, 25);
  for (const face of original.artwork) {
    const bytes = fs.readFileSync(`public${face.localPath}`);
    assert.equal(bytes.length, face.bytes);
    assert.equal(hash(bytes), face.sha256);
    assert.equal(
      face.face === "back"
        ? card(face.code).back_imagesrc
        : card(face.code).imagesrc,
      face.localPath,
    );
  }
});
