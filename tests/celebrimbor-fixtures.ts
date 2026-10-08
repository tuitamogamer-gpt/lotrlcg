import { base as fixture } from "./against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { CELEBRIMBOR as C } from "../src/game/celebrimbor-support.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1, stage = 1) {
  const s = fixture("celebrimbors-secret", players);
  s.stage = stage;
  s.stageRevealing = false;
  s.celebrimbor = {
    initialized: true,
    time: 3,
    search: [],
    setupLocations: [],
    stagingLocations: [],
  };
  s.staging = [make(s, C.search)];
  return s;
}
