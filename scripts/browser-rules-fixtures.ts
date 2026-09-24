import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { STARTERS } from "../src/game/cards";
import {
  applyAction as act,
  createGame,
  validateSave,
} from "../src/game/engine";
import { startGuided } from "../src/game/presentation";
import { selectSeat, syncSeat } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";

function game(deckId = "leadership", hot = false, campaign = false) {
  const d = STARTERS.find((d) => d.id === deckId)!;
  let s = createGame(42, d.cards, d.heroes, d.id, {
    playMode: campaign ? "campaign" : "normal",
    ...(hot
      ? {
          seats: [
            { heroes: ["01001"], deckId: "leadership" },
            { heroes: ["01007"], deckId: "spirit" },
            { heroes: ["01005"], deckId: "tactics" },
          ],
        }
      : {}),
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  s.staging = [];
  s.activeLocation = null;
  for (let i = 0; i < (s.table?.seats.length ?? 1); i++) {
    selectSeat(s, i);
    s.hand = [];
    s.engaged = [];
    s.heroes.forEach((h) => {
      h.resources = 10;
    });
    syncSeat(s);
  }
  selectSeat(s, 0);
  return s;
}
function unit(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    code,
    owner: s.table?.active ?? 0,
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
function attach(s: GameState, hero: Unit, code: string) {
  hero.attachments.push({
    id: `a${s.nextId++}`,
    code,
    owner: 0,
    exhausted: false,
  });
}
const restricted = game("tactics");
attach(restricted, restricted.heroes[0], "01039");
attach(restricted, restricted.heroes[0], "01041");
restricted.hand = [unit(restricted, "01040")];
const objective = structuredClone(restricted);
objective.hand = [];
objective.scenarioId = "dol-guldur";
objective.staging = [unit(objective, "01109")];
const progress = game("tactics");
progress.phase = "attack";
progress.progress = 7;
attach(progress, progress.heroes[1], "01039");
progress.engaged = [unit(progress, "01097")];
let beorn = game();
const ally = unit(beorn, "01031"),
  sneak = unit(beorn, "01023");
beorn.hand = [ally, sneak];
beorn = act(beorn, { type: "PLAY", id: sneak.id });
beorn = act(beorn, { type: "CHOOSE", id: ally.id });
beorn = act(beorn, { type: "ABILITY", id: ally.id });
beorn = act(beorn, { type: "NEXT" });
let miner = game("lore");
miner.shackles = 1;
const m = unit(miner, "01061");
miner.hand = [m];
miner = act(miner, { type: "PLAY", id: m.id });
let fog = game("leadership", true);
fog.phase = "quest";
fog.encounterDeck = ["01118", "01113", "01114", "01099"];
for (let i = 0; i < 3; i++) fog = act(fog, { type: "COMMIT" });
let valor = game("leadership", true, true);
valor.scenarioId = "anduin";
valor.campaign!.completed = [{ scenarioId: "mirkwood", score: 0, rounds: 1 }];
valor.phase = "attack";
const troll = unit(valor, "01082");
troll.damage = 8;
valor.engaged = [troll];
valor.heroes[0].tempAttack = 10;
syncSeat(valor);
valor = act(valor, {
  type: "ATTACK",
  enemyId: troll.id,
  attackerIds: [valor.heroes[0].id],
});
const prevention = game();
prevention.phase = "defense";
const feinted = unit(prevention, "01096"),
  trapped = unit(prevention, "01096");
feinted.feinted = true;
feinted.preventedAttacks = [0];
attach(prevention, trapped, "01069");
prevention.engaged = [feinted, trapped, unit(prevention, "01096")];
let wolf = game();
wolf.phase = "defense";
const wolfHost = unit(wolf, "01096");
wolfHost.shadows = ["01081"];
wolf.engaged = [wolfHost];
wolf.encounterDeck = ["01099"];
wolf = act(wolf, {
  type: "DEFEND",
  enemyId: wolfHost.id,
  defenderId: wolf.heroes[0].id,
});
wolf = act(wolf, { type: "CHOOSE", id: wolf.heroes[2].id });
const fixtures = {
  restricted,
  objective,
  progress,
  beorn,
  miner,
  fog,
  valor,
  prevention,
  wolf,
};
for (const s of Object.values(fixtures)) {
  startGuided(s);
  syncSeat(s);
  assert.ok(validateSave(s));
}
mkdirSync("output/rules-regression", { recursive: true });
writeFileSync(
  "output/rules-regression/fixtures.json",
  JSON.stringify(fixtures),
);
