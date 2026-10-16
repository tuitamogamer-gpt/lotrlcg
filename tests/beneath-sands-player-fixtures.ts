import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
import { BENEATH_SANDS_PLAYER as P } from "../src/game/beneath-sands-player-support";
export {
  drownedPlayerAlly as beneathSandsPlayerAlly,
  drownedPlayerHand as beneathSandsPlayerHand,
  drownedPlayerAttach as beneathSandsPlayerAttach,
} from "./drowned-player-fixtures";
export function beneathSandsPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  const groups = [
    [P.hirgon, "01001", "01004"],
    ["01006", "01007", "01012"],
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
      s.startingHeroes = s.heroes.map((u) => u.code);
    });
  return s;
}
