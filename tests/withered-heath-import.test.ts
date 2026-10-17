import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import original from "../src/data/pending/the-withered-heath-import.json";
import recipes from "../src/data/withered-heath-recipes.json";
import { card } from "../src/game/cards";
import {
  WITHERED_HEATH as H,
  WITHERED_HEATH_QUESTS,
} from "../src/game/withered-heath-support";
test("Heath import preserves immutable original recipes and all physical setup sections", () => {
  const source = JSON.parse(fs.readFileSync("public/scenarios.json", "utf8"));
  for (const r of recipes) {
    assert.deepEqual(
      r,
      source.find((x: { id: string }) => x.id === r.id),
    );
    assert.deepEqual(
      r,
      original.recipes.find((x) => x.id === r.id),
    );
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(r.sections).map(([k, v]) => [
          k,
          Object.values(v).reduce((n, q) => n + q, 0),
        ]),
      ),
      {
        sharedQuestDeck: 4,
        sharedEncounterDeck: r.mode === "easy" ? 26 : 37,
        sharedEncounterDeck2: 6,
        sharedSetAside: 5,
      },
    );
  }
});
test("Heath runtime corrects source transcription only from printed English faces", () => {
  assert.deepEqual(
    WITHERED_HEATH_QUESTS.map((c) => c.back_quest),
    [6, 3, 0, 9],
  );
  assert.match(card(H.attack).back_text!, /equal to its hit points/);
  assert.match(
    card(H.attack).back_text!,
    /while Cold-Drake has hit points remaining/,
  );
  assert.match(card(H.hatchling).text!, /\+1 \[threat\] and \+1 \[attack\]/);
  assert.match(card(H.hatchling).shadow!, /\+1 \[attack\] and \+1 \[defense\]/);
  assert.equal(card(H.falls).printed_stats!.threat, "X");
  assert.match(
    original.cards.find((c) => c.code === H.attack)!.back_text!,
    /quest points/,
  );
  assert.match(
    original.cards.find((c) => c.code === H.attack)!.back_text!,
    /Ice Drake/,
  );
});
test("All31original Heath faces retain pinned local image bytes and registered card paths", () => {
  assert.equal(original.artwork.length, 31);
  assert.equal(new Set(original.artwork.map((a) => a.localPath)).size, 31);
  for (const a of original.artwork) {
    const bytes = fs.readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    assert.equal(
      a.face === "back" ? card(a.code).back_imagesrc : card(a.code).imagesrc,
      a.localPath,
    );
  }
});
