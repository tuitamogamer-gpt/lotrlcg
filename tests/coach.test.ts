import { applyAction } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { createGame } from "../src/game/engine";
import { selectSeat } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
import { coachTip } from "../src/ui/coach";

function base() {
  const d = STARTERS[0];
  return applyAction(createGame(77, d.cards, d.heroes, d.id), { type: "KEEP" });
}
function unit(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    code,
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}
test("coaching describes a tied quest as a tie before encounter reveals", () => {
  const s = base();
  s.phase = "quest";
  s.staging = [];
  s.engaged = [];
  const tip = coachTip(s)!;
  assert.match(tip.title, /matches/);
  assert.equal(tip.tone, "info");
  assert.match(tip.text, /0 potential progress/);
});
test("Hunt coaching follows the Clue restriction on quest commitment", () => {
  let s = base();
  s.scenarioId = "hunt-for-gollum";
  s.stage = 3;
  s.phase = "quest";
  assert.throws(
    () => applyAction(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id }),
    /Clue/,
  );
  assert.match(coachTip(s)!.title, /Clue is required/);
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: "02014",
    exhausted: false,
  });
  s = applyAction(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
  assert.ok(!coachTip(s)!.title.includes("Clue is required"));
});
test("coaching does not advise actions for an inactive fellowship", () => {
  const d = STARTERS[0];
  const s = createGame(77, d.cards, d.heroes, d.id, {
    seats: [
      { deckId: "leadership", heroes: ["01001"] },
      { deckId: "spirit", heroes: ["01007"] },
    ],
  });
  selectSeat(s, 1);
  assert.equal(coachTip(s), null);
});
test("travel coaching respects The East Bight's mandatory travel rule", () => {
  const s = base();
  s.phase = "travel";
  s.staging = [unit(s, "01087"), unit(s, "01088")];
  assert.match(coachTip(s)!.title, /The East Bight/);
  assert.match(coachTip(s)!.text, /must travel/);
});
test("a response-only hand is not misdiagnosed as unaffordable", () => {
  const s = base();
  s.heroes.forEach((h) => (h.resources = 20));
  s.hand = [unit(s, "01024")];
  const tip = coachTip(s)!;
  assert.equal(tip.title, "No card plays available now");
  assert.match(tip.text, /response trigger/);
});
test("engagement coaching warns that already engaged enemies still attack", () => {
  const s = base();
  s.phase = "encounter";
  s.staging = [];
  s.engaged = [unit(s, "01089")];
  assert.match(coachTip(s)!.text, /Already engaged enemies still attack/);
});

test("coaching respects mandatory Rauros commitment and does not reserve a defender", () => {
  const s = base();
  s.scenarioId = "hills-of-emyn-muil";
  s.phase = "quest";
  s.activeLocation = unit(s, "octgn:51223bd0-ffd1-11df-a976-0801204c9011");
  s.engaged = [unit(s, "01082")];
  s.committedIds = s.heroes.map((h) => h.id);
  assert.match(coachTip(s)!.title, /All required questers/);
  assert.doesNotMatch(coachTip(s)!.text, /defender uncommitted/);
  s.committedIds.pop();
  assert.match(coachTip(s)!.title, /Every ready character/);
});
test("travel coaching never recommends immune Carrock or unpaid travel costs", () => {
  const s = base();
  s.phase = "travel";
  s.activeLocation = null;
  s.hand = [];
  s.staging = [
    unit(s, "octgn:51223bd0-ffd1-11df-a976-0801202c9027"),
    unit(s, "01094"),
  ];
  assert.match(coachTip(s)!.title, /No location/);
});
test("Amon Hen staging advice respects its event prohibition", () => {
  const s = base();
  s.phase = "staging";
  s.activeLocation = unit(s, "octgn:51223bd0-ffd1-11df-a976-0801204c9001");
  assert.match(coachTip(s)!.text, /Amon Hen prevents playing events/);
});
