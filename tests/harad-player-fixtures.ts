import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
import { HARAD_PLAYER as P } from "../src/game/harad-player-support";
import {
  drownedPlayerAlly,
  drownedPlayerHand,
  drownedPlayerAttach,
} from "./drowned-player-fixtures";

export function haradPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  const groups = [
    [P.gimli, P.legolas, "01012"],
    ["01001", "01002", "01003"],
    ["01007", "01008", "01009"],
    ["01006", "01010", "01011"],
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
export const haradPlayerAlly = drownedPlayerAlly;
export const haradPlayerHand = drownedPlayerHand;
export const haradPlayerAttach = drownedPlayerAttach;
