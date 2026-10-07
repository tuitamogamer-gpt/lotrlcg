import { base as fixture } from "./against-shadow-final-fixtures.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1) {
  const s = fixture("the-dunland-trap", players);
  s.stage = 1;
  s.dunlandTrap!.time = 2;
  return s;
}
