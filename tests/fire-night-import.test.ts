import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import crypto from "node:crypto";
import raw from "../src/data/pending/fire-in-the-night-import.json";
import {
  FIRE_NIGHT as F,
  FIRE_NIGHT_ENCOUNTERS,
  FIRE_NIGHT_QUESTS,
  FIRE_NIGHT_RECIPES,
  FIRE_NIGHT_SIDE_QUESTS,
} from "../src/game/fire-night-support";
import { card } from "../src/game/cards";
test("Fire original snapshot stays immutable while scan-backed runtime repairs remain explicit", () => {
  const original = (code: string) => raw.cards.find((c) => c.code === code)!;
  assert.equal(raw.cards.length, 24);
  assert.equal(raw.artwork.length, 25);
  assert.equal(FIRE_NIGHT_ENCOUNTERS.length, 23);
  assert.equal(FIRE_NIGHT_QUESTS.length, 1);
  assert.equal(original(F.rout).quest, 10);
  assert.ok(!original(F.rout).text.includes("+5 quest points"));
  assert.equal(card(F.rout).quest, 5);
  assert.match(card(F.rout).text!, /\+5 quest points/);
  assert.equal(original(F.dagnir).threat, 0);
  assert.equal(card(F.dagnir).printed_stats?.threat, "X");
  assert.equal(card(F.dagnir).victory, 5);
  assert.equal(card(F.dagnir).quest, undefined);
  for (const code of FIRE_NIGHT_SIDE_QUESTS)
    assert.equal(card(code).victory, 10);
  assert.equal(original(F.bats).name, "Swarms of Bats");
  assert.equal(card(F.bats).name, "Swarm of Bats");
  const rawEasy = raw.recipes.find((r) => r.mode === "easy")!,
    easy = FIRE_NIGHT_RECIPES.find((r) => r.mode === "easy")!;
  assert.equal(rawEasy.cards.find((c) => c.code === F.thrall)!.quantity, 1);
  assert.equal(easy.cards.find((c) => c.code === F.thrall)!.quantity, 3);
});
test("every Fire original face is a nonempty hash-matching local original scan", () => {
  const paths = [...FIRE_NIGHT_ENCOUNTERS, ...FIRE_NIGHT_QUESTS].flatMap((c) =>
    [c.imagesrc, c.back_imagesrc].filter((p): p is string => !!p),
  );
  assert.equal(paths.length, 25);
  for (const a of raw.artwork) {
    assert.ok(paths.includes(a.localPath));
    const bytes = fs.readFileSync(`public${a.localPath}`);
    assert.ok(bytes.length > 10000);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
    );
  }
});
