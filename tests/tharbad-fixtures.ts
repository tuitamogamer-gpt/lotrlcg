import { base as fixture } from "./against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { THARBAD as T } from "../src/game/tharbad-support.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1) {
  const s = fixture("trouble-in-tharbad", players);
  s.stage = 1;
  s.stageRevealing = false;
  s.tharbad!.time = 4;
  s.tharbad!.elimination = 50;
  s.tharbad!.advancing = false;
  s.tharbad!.removedSources = [];
  s.allies = [make(s, T.nalir)];
  return s;
}
