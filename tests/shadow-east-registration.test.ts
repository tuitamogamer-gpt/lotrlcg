import test from "node:test";
import assert from "node:assert/strict";
import recipes from "../public/scenarios.json";
import { automatedScenarioId } from "../src/game/support";

test("all six original Shadow in the East recipes remain selectable despite the catalog's shortened Temple title", () => {
  for (const [number, id] of [
    [1, "the-river-running"],
    [2, "danger-in-dorwinion"],
    [3, "temple-of-doom"],
  ] as const) {
    for (const prefix of ["Q", "E"]) {
      const source = recipes.find((r) => r.id === `${prefix}09.${number}`);
      assert.ok(source);
      assert.equal(automatedScenarioId(source), id);
    }
  }
  for (const name of ["Temple of Doom", "The Temple of Doom"]) {
    assert.equal(
      automatedScenarioId({ name, mode: "standard" }),
      "temple-of-doom",
    );
    assert.equal(
      automatedScenarioId({ name: `${name} (Easy)`, mode: "easy" }),
      "temple-of-doom",
    );
    assert.equal(automatedScenarioId({ name, mode: "nightmare" }), null);
    assert.equal(
      automatedScenarioId({ name: `${name} (Campaign)`, mode: "campaign" }),
      null,
    );
  }
});
