import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pending from "../src/data/pending/intruders-in-chetwood-import.json";
import { cachedImageSource, imageUrl, SCRIPTED } from "../src/game/cards";
import { automatedScenarioId, isAutomatedCard } from "../src/game/support";
import type { Card } from "../src/game/types";

const catalog: Card[] = JSON.parse(
  readFileSync(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const recipes = JSON.parse(
  readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
);
test("Chetwood import preserves all original identities and physical normal/easy recipe sections", () => {
  assert.equal(pending.cards.length, 19);
  assert.equal(new Set(pending.cards.map((c) => c.code)).size, 19);
  assert.equal(pending.status, "pending-rules");
  for (const recipe of pending.recipes) {
    assert.deepEqual(
      recipe,
      recipes.find((r: { id: string }) => r.id === recipe.id),
    );
    assert.equal(
      Object.values(recipe.sections.sharedEncounterDeck).reduce(
        (a, n) => a + n,
        0,
      ),
      recipe.mode === "standard" ? 36 : 24,
    );
    assert.equal(
      Object.values(recipe.sections.sharedStagingArea).reduce(
        (a, n) => a + n,
        0,
      ),
      1,
    );
    assert.ok(
      recipe.card_codes.every((code) =>
        pending.cards.some((c) => c.code === code),
      ),
    );
  }
  for (const c of pending.cards) {
    const source = catalog.find((x) => x.code === c.code)!;
    assert.ok(source && source.official && !source.nightmare);
    const restored = { ...c, imagesrc: source.imagesrc };
    if ("back_imagesrc" in c)
      Object.assign(restored, { back_imagesrc: source.back_imagesrc });
    assert.deepEqual(restored, source);
  }
});
test("all twenty Chetwood faces retain local bytes, hashes and original source mappings", () => {
  assert.equal(pending.artwork.length, 20);
  for (const art of pending.artwork) {
    assert.match(
      art.source,
      /^https:\/\/dragncards-lotrlcg\.s3\.amazonaws\.com\/cards\/English\//,
    );
    const bytes = readFileSync(
      new URL(`../public${art.localPath}`, import.meta.url),
    );
    assert.equal(bytes.length, art.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), art.sha256);
    assert.equal(cachedImageSource(art.source), art.localPath);
    if (art.face === "front")
      assert.equal(
        imageUrl(catalog.find((c) => c.code === art.code)!),
        art.localPath,
      );
  }
});
test("Chetwood source snapshots now resolve to scripted normal/easy rules", () => {
  for (const c of pending.cards) {
    assert.ok(SCRIPTED.has(c.code));
    assert.equal(isAutomatedCard(c as Card), true);
  }
  for (const r of pending.recipes)
    assert.equal(automatedScenarioId(r), "intruders-in-chetwood");
});

for (const [slug, count, faces, encounterDeck, engineId] of [
  ["the-weather-hills", 23, 26, 31, "the-weather-hills"],
  ["deadmen-s-dike", 21, 23, 41, "deadmens-dike"],
  ["the-wastes-of-eriador", 25, 29, 44, "wastes-of-eriador"],
  ["escape-from-mount-gram", 20, 23, 20, "escape-from-mount-gram"],
  ["across-the-ettenmoors", 30, 34, 36, "across-the-ettenmoors"],
  ["the-treachery-of-rhudaur", 27, 33, 41, "the-treachery-of-rhudaur"],
  ["the-battle-of-carn-dum", 23, 27, 42, "the-battle-of-carn-dum"],
  ["the-dread-realm", 24, 28, 46, "the-dread-realm"],
] as const) {
  test(`${slug}: original definitions, every recipe zone and local faces remain intact as scripted support expands`, () => {
    const bundle = JSON.parse(
      readFileSync(
        new URL(`../src/data/pending/${slug}-import.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(bundle.cards.length, count);
    assert.equal(bundle.artwork.length, faces);
    assert.equal(bundle.status, "pending-rules");
    for (const c of bundle.cards) {
      const source = catalog.find((x) => x.code === c.code)!;
      const restored = { ...c, imagesrc: source.imagesrc };
      if (c.back_imagesrc) restored.back_imagesrc = source.back_imagesrc;
      assert.deepEqual(restored, source);
      assert.equal(isAutomatedCard(c), SCRIPTED.has(c.engine_code ?? c.code));
      assert.equal(
        isAutomatedCard(c),
        c.type_code !== "rules",
        `${c.name}: rulesheet references remain outside the playable card pool`,
      );
    }
    for (const recipe of bundle.recipes) {
      assert.deepEqual(
        recipe,
        recipes.find((r: { id: string }) => r.id === recipe.id),
      );
      assert.equal(automatedScenarioId(recipe), engineId);
      if (recipe.mode === "standard")
        assert.equal(
          Object.values(recipe.sections.sharedEncounterDeck).reduce(
            (n: number, q) => n + Number(q),
            0,
          ),
          encounterDeck,
        );
    }
    for (const art of bundle.artwork) {
      const bytes = readFileSync(
        new URL(`../public${art.localPath}`, import.meta.url),
      );
      assert.equal(bytes.length, art.bytes);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        art.sha256,
      );
      assert.equal(cachedImageSource(art.source), art.localPath);
    }
  });
}
