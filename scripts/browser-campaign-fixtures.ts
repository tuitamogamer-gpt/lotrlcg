import fs from "node:fs/promises";
import { STARTERS } from "../src/game/cards";
import { createGame, applyAction, validateSave } from "../src/game/engine";
const d = STARTERS[0];
let s = applyAction(
  createGame(42, d.cards, d.heroes, d.id, { playMode: "campaign" }),
  { type: "KEEP" },
);
s.stage = 3;
s.branch = "beorn";
s.progress = 9;
s.phase = "staging";
s.staging = [];
s.activeLocation = null;
s.heroes[0].committed = true;
s.heroes[0].exhausted = true;
if (!validateSave(s)) throw new Error("Invalid campaign fixture");
await fs.mkdir("output/core-campaign", { recursive: true });
await fs.writeFile(
  "output/core-campaign/fixtures.json",
  JSON.stringify({ mirkwood: s }),
);
