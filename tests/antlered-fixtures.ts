import { base as fixture } from "./against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { ANTLERED as A } from "../src/game/antlered-support.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1, stage = 1) {
  const s = fixture("the-antlered-crown", players);
  s.stage = stage;
  s.stageRevealing = false;
  s.antlered = {
    initialized: true,
    time: stage === 3 ? 2 : 3,
    ravenDeck: [],
    ravenDiscard: [],
    setAside: [make(s, A.chief), make(s, A.camp)],
    setupEnemies: [],
  };
  s.allies.push(make(s, A.turch));
  return s;
}
