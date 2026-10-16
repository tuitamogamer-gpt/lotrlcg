import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
export {
  drownedPlayerAlly as batch4PlayerAlly,
  drownedPlayerHand as batch4PlayerHand,
  drownedPlayerAttach as batch4PlayerAttach,
} from "./drowned-player-fixtures";
export function batch4PlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  const groups = [
    ["17081", "17109", "17135"],
    ["01001", "01002", "01004"],
    ["01006", "01007", "01012"],
    ["01003", "01005", "01009"],
  ];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes = groups[p].map((code) => ({
        ...make(s, code),
        resources: 10,
        phaseResourceIcons: ["leadership", "spirit", "tactics", "lore"],
      }));
      s.startingHeroes = s.heroes.map((u) => u.code);
    });
  // These player-card scenes select three Winds in their separate Encounter reserve.
  s.batch4WindReserves = Object.fromEntries(playerOrder(s).map((p) => [p, 3]));
  s.rangerReserves = Object.fromEntries(playerOrder(s).map((p) => [p, 0]));
  return s;
}
