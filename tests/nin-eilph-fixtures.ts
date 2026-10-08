import { base as fixture } from "./against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { NIN as N } from "../src/game/nin-eilph-support.ts";
export { choose, reload } from "./against-shadow-final-fixtures.ts";
export function base(players = 1, quest = N.noEnd) {
  const s = fixture("the-nin-in-eilph", players);
  s.stage = [N.noEnd, N.weary, N.forgotten].includes(quest)
    ? 2
    : quest === N.out
      ? 4
      : 3;
  s.stageRevealing = false;
  s.ninEilph!.activeQuest = quest;
  s.ninEilph!.time = s.stage === 4 ? 2 : 3;
  s.ninEilph!.advancing = false;
  s.allies = [make(s, N.nalir)];
  return s;
}
