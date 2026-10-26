import { fixture as previous } from "./shadow-east-player-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder, syncSeat } from "../src/game/table";
import { WRATH_RUIN_PLAYER as P } from "../src/game/wrath-ruin-player-support";
export {
  act,
  pick,
  hand,
  ally,
  attach,
  play,
  reload,
  settle,
  ring,
  fellowship,
} from "./shadow-east-player-fixtures";
export function fixture(players = 1) {
  const s = previous(players);
  forOwner(s, 0, () => {
    s.heroes = [P.thorin, "01004", "21002"].map((code) => make(s, code));
    s.startingHeroes = s.heroes.map((h) => h.code);
    for (const h of s.heroes) {
      h.resources = 15;
      h.phaseResourceIcons = ["leadership", "lore", "spirit", "tactics"];
    }
  });
  for (const player of playerOrder(s)) {
    s.eredEagleReserves![player] = 0;
    (s.wrathBombadilReserves ??= {})[player] = 3;
  }
  syncSeat(s);
  return s;
}
