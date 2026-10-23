import test from "node:test";
import assert from "node:assert/strict";
import { card } from "../src/game/cards";
import { GUNDABAD as G } from "../src/game/mount-gundabad-support";
import { currentQuestInspection } from "../src/ui/quest-inspection";
import { base } from "./mount-gundabad-fixtures";

test("selected Gundabad side A cannot disclose its reverse through inspection metadata", () => {
  const s = base();
  s.stage = 2;
  s.mountGundabad!.questFront = true;
  const references = [G.upper, G.darkness, G.worm];
  const shown = references.map((code) => {
    s.mountGundabad!.currentQuest = code;
    return currentQuestInspection(s, card(code));
  });
  for (const c of shown) {
    assert.deepEqual(c, shown[0]);
    assert.equal(c.initialReverse, false);
    assert.equal(
      Object.keys(c).some((key) => key.startsWith("back_")),
      false,
    );
  }
  assert.ok(card(G.worm).back_text, "printed reference stays complete");
  s.mountGundabad!.questFront = false;
  const revealed = currentQuestInspection(s, card(G.worm));
  assert.equal(revealed.back_name, card(G.worm).back_name);
  assert.equal(revealed.initialReverse, true);
});

test("double-sided quests outside Mount Gundabad open on side A", () => {
  const s = base();
  s.mountGundabad = undefined;
  const printed = card("octgn:adf2480a-644a-47ee-8deb-bd08ff32bf31");
  const shown = currentQuestInspection(s, printed);
  assert.equal(shown.initialReverse, undefined);
  assert.match(shown.text ?? "", /^Setup:/);
  assert.notEqual(shown.text, printed.back_text);
});
