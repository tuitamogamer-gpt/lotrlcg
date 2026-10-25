import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { SHADOW_EAST_PLAYER_ART } from "./shadow-east-player-art";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const batches = [
  ["the-river-running", "river-running", 20, 22, 40, 30],
  ["danger-in-dorwinion", "danger-dorwinion", 26, 29, 45, 37],
  ["temple-of-doom", "temple-doom", 28, 33, 49, 37],
] as const;

test("Shadow East keeps the original catalog and preparation snapshots immutable", () => {
  for (const [path, expected] of [
    ["public/catalog.json", "cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63"],
    ["public/scenarios.json", "00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f"],
    ["src/data/official-player-cards.json", "9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd"],
    ["src/data/pending/the-river-running-import.json", "028d5de920e81b00b64895242f046aab8b1647dc72f2316caef2bb2e89d15b88"],
    ["src/data/pending/danger-in-dorwinion-import.json", "025a5ceee066199196b95fca166e10a17edb95b7669193438d49d97f637386db"],
    ["src/data/pending/temple-of-doom-import.json", "b44560f2aa8425ba7bfff40c812cd298ecd14414f631c91bd633d6121019a40a"],
  ]) assert.equal(hash(path), expected, path);
});

for (const [slug, prefix, identities, faces, normal, easy] of batches) {
  test(`${prefix} retains every original identity, image face and independent quantity`, () => {
    const source = read(`src/data/pending/${slug}-import.json`);
    const quantities = read("tests/shadow-east-source-quantities.json").find((v: any) => v.scenario === prefix);
    const runtime = [...read(`src/data/${prefix}-encounter-cards.json`), ...read(`src/data/${prefix}-quest-cards.json`)];
    assert.equal(source.cards.length, identities);
    assert.equal(source.artwork.length, faces);
    assert.deepEqual(runtime.map((c: any) => c.code).sort(), source.cards.map((c: any) => c.code).sort());
    assert.deepEqual(read(`src/data/${prefix}-recipes.json`), source.recipes);
    for (const recipe of source.recipes) {
      assert.equal(recipe.cards.reduce((n: number, c: any) => n + c.quantity, 0), recipe.mode === "easy" ? easy : normal);
      for (const c of quantities.cards) {
        const actual = recipe.cards.filter((v: any) => v.code === c.code).reduce((n: number, v: any) => n + v.quantity, 0);
        assert.equal(actual, recipe.mode === "easy" ? c.easy : c.normal, `${recipe.id}/${c.name}`);
      }
    }
    for (const art of source.artwork) {
      const bytes = readFileSync(`public${art.localPath}`);
      assert.equal(bytes.length, art.bytes);
      assert.equal(hash(`public${art.localPath}`), art.sha256, `${prefix}/${art.code}/${art.face}`);
    }
  });
}

test("Shadow East overlays restore printed goals, timing and distinct shadow effects", () => {
  const source = batches.flatMap(([, prefix]) => [...read(`src/data/${prefix}-encounter-cards.json`), ...read(`src/data/${prefix}-quest-cards.json`)]);
  const at = (position: number) => source.find((c: any) => c.position === position);
  for (const [position, goal] of [[24, 8], [29, 6], [43, 6], [52, 5], [53, 12], [65, 8]]) {
    assert.equal(at(position).quest, goal);
    assert.equal(at(position).victory, 10);
  }
  assert.match(at(20).shadow, /\+2 \[attack\]/);
  assert.doesNotMatch(at(20).shadow, /defense/);
  assert.match(at(24).text, /Forced: After an Easterling enemy enters play/);
  assert.match(at(28).shadow, /after this attack/);
  assert.match(at(61).shadow, /Discard the top card/);
  assert.match(at(64).shadow, /cannot ready until the end of the round/);
  assert.match(at(80).back_text, /^Skip the quest phase/);
  for (const position of [81, 83, 84, 85]) assert.equal(at(position).cost, 2);
  assert.deepEqual([81, 83, 84, 85].map((p) => at(p).back_quest), [8, 12, 16, 0]);
});

test("Shadow East player art, physical reverse and Stinker stay tied to original scans", () => {
  const players = read("src/data/shadow-east-player-cards.json");
  const encounters = read("src/data/shadow-east-encounter-players.json");
  assert.equal(players.length, 13);
  assert.deepEqual(players.map((c: any) => c.code).sort(), read("src/data/official-player-cards.json").filter((c: any) => c.pack_code === "ASitE").map((c: any) => c.code).sort());
  assert.equal(SHADOW_EAST_PLAYER_ART.length, 16);
  for (const art of SHADOW_EAST_PLAYER_ART) {
    const bytes = readFileSync(`public${art.localPath}`);
    assert.equal(bytes.length, art.bytes);
    assert.equal(hash(`public${art.localPath}`), art.sha256, `${art.code}/${art.face}`);
  }
  const smeagol = players.find((c: any) => c.code === "21072");
  const contract = players.find((c: any) => c.code === "21074");
  const gollum = encounters.find((c: any) => c.code === "21072.B");
  const stinker = encounters.find((c: any) => c.code === "21071");
  assert.doesNotMatch(smeagol.text, /Side B|Immune/);
  assert.equal(smeagol.back_name, "Gollum");
  assert.equal(gollum.octgnid, smeagol.octgnid);
  assert.equal(gollum.imagesrc, smeagol.back_imagesrc);
  assert.deepEqual([gollum.engagement, gollum.threat, gollum.attack, gollum.defense, gollum.health], [50, 2, 2, 2, 3]);
  assert.equal(stinker.quantity, 2);
  assert.equal(stinker.traits, "Gollum.");
  assert.match(stinker.shadow, /Shuffle Stinker back into the encounter deck/);
  assert.match(contract.text, /exactly 9 unique/);
  assert.match(contract.back_text, /After a character you control leaves play/);
  assert.match(players.find((c: any) => c.code === "21008").text, /When attached location is explored/);
});
