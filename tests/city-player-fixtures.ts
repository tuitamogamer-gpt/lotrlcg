import {
  drownedPlayerFixture,
  drownedPlayerAlly,
  drownedPlayerHand,
  drownedPlayerAttach,
} from "./drowned-player-fixtures";
import { forOwner } from "../src/game/table";
import { make } from "../src/game/core";
import { CITY_PLAYER as P } from "../src/game/city-player-support";
export function cityPlayerFixture(players = 1) {
  const s = drownedPlayerFixture(players),
    original = s.heroes[0];
  s.heroes[0] = {
    ...make(s, P.imrahil),
    resources: original.resources,
    phaseResourceIcons: original.phaseResourceIcons,
  };
  s.startingHeroes = s.heroes.map((h) => h.code);
  for (const [player, codes] of [
    [2, ["01008", "01009", "01010"]],
    [3, ["01002", "01003", "01011"]],
  ] as const)
    if (player < players)
      forOwner(s, player, () => {
        s.heroes = codes.map((code) => ({
          ...make(s, code),
          resources: 10,
          phaseResourceIcons: ["leadership", "tactics", "spirit", "lore"],
        }));
        s.startingHeroes = s.heroes.map((h) => h.code);
      });
  return s;
}
export const cityPlayerAlly = drownedPlayerAlly;
export const cityPlayerHand = drownedPlayerHand;
export const cityPlayerAttach = drownedPlayerAttach;
