import {
  drownedPlayerFixture,
  drownedPlayerAlly,
  drownedPlayerHand,
  drownedPlayerAttach,
} from "./drowned-player-fixtures";
import { make } from "../src/game/core";
import { COBAS_PLAYER as P } from "../src/game/cobas-player-support";

export function cobasPlayerFixture(players = 1) {
  const s = drownedPlayerFixture(players);
  const original = s.heroes[0];
  s.heroes[0] = {
    ...make(s, P.naasiyah),
    resources: original.resources,
    phaseResourceIcons: original.phaseResourceIcons,
  };
  s.startingHeroes = s.heroes.map((u) => u.code);
  return s;
}
export const cobasPlayerAlly = drownedPlayerAlly;
export const cobasPlayerHand = drownedPlayerHand;
export const cobasPlayerAttach = drownedPlayerAttach;
