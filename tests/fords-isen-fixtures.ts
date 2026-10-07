import { base as fixture } from "./against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { FORDS as F } from "../src/game/fords-isen-support.ts";
import { forOwner } from "../src/game/table.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1) {
  const s = fixture("fords-of-isen", players);
  s.fordsIsen = { time: 5 };
  forOwner(s, 0, () => s.allies.push(make(s, F.grima)));
  return s;
}
