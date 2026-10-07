import { base as fixture } from "./against-shadow-final-fixtures.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1) {
  const s = fixture("into-fangorn", players);
  s.stage = 1;
  s.fangorn = { time: 4 };
  return s;
}
