import { mkdirSync, writeFileSync } from "node:fs";
import { STARTERS } from "../src/game/cards";
import { createGame, applyAction, validateSave } from "../src/game/engine";
import { startGuided } from "../src/game/presentation";
import type { GameState, Unit } from "../src/game/types";
const make = () => {
  const d = STARTERS[0];
  const s = applyAction(createGame(77, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  s.hand = [];
  return startGuided(s);
};
const unit = (s: GameState, code: string): Unit => ({
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
});
const encounter = make();
encounter.phase = "quest";
encounter.heroes[0].exhausted = true;
encounter.encounterDeck = ["01093", "01099"];
const combat = make();
combat.phase = "defense";
combat.staging = [];
combat.engaged = [unit(combat, "01089")];
combat.engaged[0].shadows = ["01085"];
const quest = make();
quest.phase = "staging";
quest.staging = [];
quest.heroes[0].committed = true;
quest.heroes[0].exhausted = true;
const victory = make();
victory.phase = "staging";
victory.stage = 3;
victory.branch = "beorn";
victory.progress = 9;
victory.staging = [];
victory.heroes[0].committed = true;
const fixtures = { encounter, combat, quest, victory };
for (const s of Object.values(fixtures))
  if (!validateSave(s)) throw Error("Invalid presentation fixture");
mkdirSync("output/presentation", { recursive: true });
writeFileSync("output/presentation/fixtures.json", JSON.stringify(fixtures));
