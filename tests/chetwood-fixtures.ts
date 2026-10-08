import { base as fixture } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { CHETWOOD as C } from "../src/game/chetwood-support";
export { choose, reload } from "./against-shadow-final-fixtures";
export function base(players = 1) {
  const s = fixture("intruders-in-chetwood", players);
  s.chetwood = {
    initialized: true,
    setupLocations: [],
    hiddenHands: {},
    progressRound: s.round,
    progressPlaced: {},
  };
  s.allies.push(make(s, C.iarion));
  return s;
}
