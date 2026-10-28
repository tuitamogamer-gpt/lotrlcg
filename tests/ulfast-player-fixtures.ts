import { make } from "../src/game/core";
import { ULFAST_PLAYER as P } from "../src/game/ulfast-player-support";
import type { GameState } from "../src/game/types";
export { fixture, hand, attach, ring } from "./shadow-east-player-fixtures";
export function contract(s: GameState, player = 0, side: "A" | "B" = "A") {
  const u = make(s, P.hunters);
  u.owner = player;
  (s.ulfastPlayers ??= { contracts: [], attackBonuses: [] }).contracts.push({
    player,
    unit: u,
    side,
  });
  return u;
}
