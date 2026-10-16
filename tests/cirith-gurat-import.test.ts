import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import bundle from "../src/data/pending/the-dungeons-of-cirith-gurat-import.json";
import {
  CIRITH_GURAT as C,
  CIRITH_GURAT_ENCOUNTERS,
  CIRITH_GURAT_QUESTS,
  CIRITH_GURAT_RECIPES,
} from "../src/game/cirith-gurat-support";
import { card, SCRIPTED } from "../src/game/cards";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
test("Cirith Gurat import retains all original physical cards, sources and 28 decoded-face hashes", () => {
  assert.equal(bundle.cards.length, 25);
  assert.equal(bundle.artwork.length, 28);
  assert.equal(CIRITH_GURAT_ENCOUNTERS.length, 13);
  assert.equal(CIRITH_GURAT_QUESTS.length, 3);
  for (const c of bundle.cards) {
    assert.ok(c.official && !c.nightmare);
    assert.ok(SCRIPTED.has(c.code), c.name);
    if (c.pack_code === "DoCG") assert.equal(card(c.code).name, c.name);
  }
  for (const a of bundle.artwork)
    assert.equal(
      hash(readFileSync(new URL(`../public${a.localPath}`, import.meta.url))),
      a.sha256,
      a.localPath,
    );
  assert.match(
    CIRITH_GURAT_QUESTS[0].back_text!,
    /Each enemy and location in the staging area that is guarding an objective is immune/,
  );
  assert.deepEqual(
    CIRITH_GURAT_QUESTS.map((c) => c.back_quest),
    [10, 15, 10],
  );
});
test("Cirith Gurat immutable source recipes have standard/easy 49/39 physical scenario cards", () => {
  const source = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  );
  for (const r of CIRITH_GURAT_RECIPES) {
    assert.deepEqual(
      r,
      source.find((s: { id: string }) => s.id === r.id),
    );
    assert.equal(
      r.cards.reduce((n, row) => n + row.quantity, 0),
      r.mode === "easy" ? 39 : 49,
    );
    assert.equal(
      r.cards
        .filter((x) => x.section === "sharedEncounterDeck")
        .reduce((n, x) => n + x.quantity, 0),
      r.mode === "easy" ? 28 : 38,
    );
  }
  assert.equal(
    CIRITH_GURAT_ENCOUNTERS.find((c) => c.code === C.prisoner)!.easy_quantity,
    1,
  );
  assert.equal(
    CIRITH_GURAT_ENCOUNTERS.find((c) => c.code === C.warg)!.easy_quantity,
    2,
  );
});
