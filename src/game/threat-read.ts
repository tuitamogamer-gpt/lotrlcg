import type { GameState } from "./types";

export const STORMCALLER_VANISH = "phase:stormcaller:vanish";

/**
 * Read threat for card effects and engagement without changing the dial.
 * Threat elimination uses the actual dial instead (official FAQ 1.57).
 */
export function stormcallerEffectiveThreat(
  s: GameState,
  player = s.table?.active ?? 0,
) {
  const seat = s.table && player !== s.table.active ? s.table.seats[player] : s;
  return seat.used.includes(STORMCALLER_VANISH)
    ? Math.min(seat.threat, 20)
    : seat.threat;
}
