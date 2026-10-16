import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
import { MUMAKIL_PLAYER as P } from "../src/game/mumakil-player-support";
export {
  drownedPlayerAlly as mumakilPlayerAlly,
  drownedPlayerHand as mumakilPlayerHand,
  drownedPlayerAttach as mumakilPlayerAttach,
} from "./drowned-player-fixtures";

export function mumakilPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  const groups = [
    [P.kahliel, "01006", "01007"],
    ["01001", "01004", "01012"],
    ["01002", "01005", "01009"],
    ["01003", "01008", "01011"],
  ];
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.heroes = groups[player].map((code) => ({
        ...make(s, code),
        resources: 10,
        phaseResourceIcons: ["leadership", "tactics", "spirit", "lore"],
      }));
      s.startingHeroes = s.heroes.map((h) => h.code);
    });
  return s;
}
