import { make } from "../src/game/core";
import { forOwner } from "../src/game/table";
import { playerCards, SCRIPTED } from "../src/game/cards";
import { ASH_PLAYER as P } from "../src/game/ash-mountains-player";
import type { GameState } from "../src/game/types";
export {
  fixture,
  hand,
  ally,
  attach,
  ring,
} from "./shadow-east-player-fixtures";
export function council(s: GameState, p = 0) {
  forOwner(s, p, () => {
    const unit = make(s, P.council);
    unit.owner = p;
    (s.ashPlayers ??= { contracts: [] }).contracts.push({ player: p, unit });
  });
}
export const COUNCIL_DECK: Record<string, number> = Object.fromEntries(
  [
    ...new Map(
      playerCards
        .filter(
          (c) =>
            SCRIPTED.has(c.code) &&
            ["ally", "attachment", "event"].includes(c.type_code) &&
            c.deck_limit !== 0 &&
            !["21001"].includes(c.code),
        )
        .map((c) => [c.name, c.code]),
    ).values(),
  ]
    .slice(0, 50)
    .map((c) => [c, 1]),
);
COUNCIL_DECK[P.council] = 1;
