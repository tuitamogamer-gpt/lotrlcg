import definitions from "../data/drowned-player-cards.json";
import type { Card, GameState, Unit } from "./types";

export const DROWNED_PLAYER_CARDS = definitions as Card[];
export const DROWNED_PLAYER_CODES = DROWNED_PLAYER_CARDS.map((c) => c.code);
export const DROWNED_PLAYER = {
  argalad: "12082",
  sellsword: "12083",
  remedy: "12084",
  marksman: "12085",
  fury: "12086",
  courier: "12087",
  hithlain: "12088",
  robin: "12089",
  interrogation: "12090",
  strider: "12091",
} as const;

/** Round-lasting reductions belong to the targeted enemy, independent of the ally. */
export function drownedPlayerDefense(s: GameState, u: Unit) {
  const marker = `round:drowned:marksman:${u.id}`;
  return (
    -2 *
    [
      s.used,
      ...(s.table?.seats
        .filter((_, i) => i !== s.table!.active)
        .map((p) => p.used) ?? []),
    ]
      .flat()
      .filter((key) => key === marker).length
  );
}
