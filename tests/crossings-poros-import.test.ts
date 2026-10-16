import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import source from "../src/data/pending/the-crossings-of-poros-import.json";
import encounters from "../src/data/crossings-poros-encounter-cards.json";
import quests from "../src/data/crossings-poros-quest-cards.json";
import recipes from "../src/data/crossings-poros-recipes.json";
import { SCRIPTED, card } from "../src/game/cards";
import { cachedImageSource } from "../src/game/scenario-image-source";
const bytes = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url));
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
test("Poros import preserves original catalog, recipes and player inputs", () => {
  for (const [p, h] of [
    [
      "public/catalog.json",
      "cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63",
    ],
    [
      "public/scenarios.json",
      "00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f",
    ],
    [
      "src/data/official-player-cards.json",
      "9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd",
    ],
  ])
    assert.equal(hash(bytes(p)), h, p);
  assert.equal(source.cards.length, 38);
  assert.equal(encounters.length, 31);
  assert.equal(quests.length, 7);
  assert.equal(
    source.sources.expansionRules,
    "https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec61_web_the_crossing_of_poros-rules.pdf",
  );
  for (const c of source.cards) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.deepEqual(card(c.code).packs, c.packs, c.name);
  }
});
test("Poros physical recipes contain 64 standard / 50 easy encounters plus seven quests", () => {
  for (const r of recipes) {
    assert.equal(r.automated, true);
    assert.equal(r.campaign, false);
    const sums = Object.fromEntries(
      Object.entries(r.sections).map(([k, v]) => [
        k,
        Object.values(v).reduce((a, b) => a + b, 0),
      ]),
    );
    assert.deepEqual(
      sums,
      r.mode === "standard"
        ? {
            sharedQuestDeck: 7,
            sharedSetAside: 48,
            sharedStagingArea: 1,
            sharedEncounterDeck: 15,
          }
        : {
            sharedQuestDeck: 7,
            sharedSetAside: 37,
            sharedStagingArea: 1,
            sharedEncounterDeck: 12,
          },
    );
    const g = encounters.find((c) => c.name === "Poros Garrison")!,
      b = encounters.find((c) => c.name === "The Black Serpent")!;
    assert.equal(
      r.cards.find((c) => c.code === g.code)!.section,
      "sharedSetAside",
    );
    assert.equal(
      r.cards.find((c) => c.code === b.code)!.section,
      "sharedStagingArea",
    );
    const w = encounters.find((c) => c.name === "Mordor Warg")!;
    assert.equal(r.cards.find((c) => c.code === w.code)!.quantity, 2);
  }
});
test("Poros promoted definitions restore missing Garrison stats, first-player control, printed X and Dúath accent", () => {
  const g = encounters.find((c) => c.name === "Poros Garrison")!;
  assert.deepEqual([g.willpower, g.attack, g.defense, g.health], [3, 4, 3, 6]);
  assert.equal(g.traits, "Gondor.");
  assert.equal(g.is_unique, true);
  assert.match(g.text, /first player/);
  assert.equal(
    encounters.find((c) => c.name === "Desolate Land")!.printed_stats.threat,
    "X",
  );
  assert.ok(quests.some((c) => c.name === "The Ephel Dúath"));
  assert.deepEqual(
    quests.map((c) => c.back_quest).sort((a, b) => a - b),
    [0, 10, 10, 15, 15, 15, 20],
  );
});
test("Poros pins all 45 original faces to immutable local scans", () => {
  assert.equal(source.artwork.length, 45);
  for (const f of source.artwork) {
    const b = bytes(`public${f.localPath}`);
    assert.equal(b.length, f.bytes, f.localPath);
    assert.equal(hash(b), f.sha256, f.localPath);
    assert.equal(cachedImageSource(f.source), f.localPath);
    const c = card(f.code);
    assert.equal(f.face === "back" ? c.back_imagesrc : c.imagesrc, f.localPath);
  }
});
