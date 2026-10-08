import { base as fixture } from "./against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import {
  TRIALS as T,
  TRIAL_SET_ASIDE,
} from "../src/game/three-trials-support.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1, trial = T.strength) {
  const s = fixture("the-three-trials", players);
  s.stage = 2;
  s.stageRevealing = false;
  s.victory = 0;
  s.victoryCards = [];
  s.threeTrials = {
    initialized: true,
    activeQuest: trial,
    completed: [],
    setAside: TRIAL_SET_ASIDE.map((code) => make(s, code)),
    revealing: [],
  };
  return s;
}
