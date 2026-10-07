import { base as fixture } from "./against-shadow-final-fixtures.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1) {
  const s = fixture("to-catch-an-orc", players);
  s.stage = 2;
  s.catchOrc = {
    initialized: true,
    time: 2,
    decks: {},
    searched: [],
    setAside: [],
  };
  return s;
}
