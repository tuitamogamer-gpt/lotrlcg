import type { GameState } from "./types";

export const STORMCALLER_VANISH = "phase:stormcaller:vanish";

/** Read threat for rules without changing the physical counter or its saved value. */
export function stormcallerEffectiveThreat(
  s: GameState,
  player = s.table?.active ?? 0,
) {
  const seat = s.table && player !== s.table.active ? s.table.seats[player] : s;
  return seat.used.includes(STORMCALLER_VANISH)
    ? Math.min(seat.threat, 20)
    : seat.threat;
}
