import fs from "node:fs/promises";
import { STARTERS } from "../src/game/cards";
import { createGame } from "../src/game/engine";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import type { Unit } from "../src/game/types";
const unit = (code: string): Unit => ({
  id: "fixture-card",
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
});
const fixtures: Record<string, unknown> = {};
for (const [sphere, code] of [
  ["leadership", "01026"],
  ["spirit", "01051"],
  ["lore", "01067"],
  ["tactics", "01038"],
]) {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = applyAction(createGame(8, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  s.hand = [unit(code)];
  s.staging = [];
  if (sphere === "spirit") s.discard = ["01044"];
  if (sphere === "tactics") {
    s.phase = "defense";
    s.engaged = [{ ...unit("01096"), id: "fixture-enemy" }];
  }
  fixtures[sphere] = s;
}
const d = STARTERS[2];
const win = applyAction(createGame(8, d.cards, d.heroes, d.id), {
  type: "KEEP",
});
win.stage = 3;
win.branch = "beorn";
win.progress = 9;
win.phase = "staging";
win.staging = [];
win.heroes[0].committed = true;
win.heroes[0].exhausted = true;
fixtures.victory = win;
await fs.mkdir("output/browser", { recursive: true });
await fs.writeFile("output/browser/fixtures.json", JSON.stringify(fixtures));
