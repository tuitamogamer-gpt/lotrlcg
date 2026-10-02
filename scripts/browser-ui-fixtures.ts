import fs from "node:fs/promises";
import { STARTERS } from "../src/game/cards";
import { createGame, validateSave } from "../src/game/engine";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import type { Unit } from "../src/game/types";
const d = STARTERS[0];
const s = applyAction(createGame(8, d.cards, d.heroes, d.id), { type: "KEEP" });
s.hand = ["01073", "01016", "01026", "01021", "01013"].map((code, i): Unit => ({
  id: `ui${i}`,
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
}));
s.heroes[2].attachments.push({
  id: "ui-stone",
  code: "01027",
  exhausted: false,
});
s.discard = ["01020"];
s.encounterDiscard = ["01091"];
if (!validateSave(s)) throw new Error("UI fixture invalid");
await fs.mkdir("output/ui-review", { recursive: true });
await fs.writeFile("output/ui-review/fixture.json", JSON.stringify(s));
