import { fixture as eredFixture } from "./ered-mithrin-player-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder, syncSeat } from "../src/game/table";
export {
  act,
  ability,
  hand,
  ally,
  attach,
  pick,
  play,
  reload,
  settle,
} from "./ered-mithrin-player-fixtures";

export function fixture(players = 1) {
  const s = eredFixture(players),
    groups = [
      ["19112", "19145", "01001"],
      ["10140", "10054", "10115"],
      ["19084", "01007", "01012"],
      ["01004", "01005", "01006"],
    ];
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.heroes = groups[player].map((code) => make(s, code));
      s.startingHeroes = s.heroes.map((u) => u.code);
      for (const u of s.heroes) {
        u.resources = 15;
        u.phaseResourceIcons = ["leadership", "lore", "spirit", "tactics"];
      }
    });
  syncSeat(s);
  return s;
}
