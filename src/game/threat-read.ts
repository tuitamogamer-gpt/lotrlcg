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

/** Vicious Trackers (Road to Rivendell's Nightmare Deck). */
const VICIOUS_TRACKERS = "octgn:8af079b1-fe2f-407e-a66c-0c9421ffe5d6";
/**
 * The threat a player's engagement checks compare with an engagement cost:
 * Vicious Trackers, "While Vicious Trackers is engaged with a player, that
 * player is considered to have +20 threat for the purposes of engagement
 * checks only." (each copy).
 */
export function engagementCheckThreat(
  s: GameState,
  player = s.table?.active ?? 0,
) {
  const seat = s.table && player !== s.table.active ? s.table.seats[player] : s;
  return (
    stormcallerEffectiveThreat(s, player) +
    20 *
      seat.engaged.filter((u) => u.code === VICIOUS_TRACKERS && !u.blanked)
        .length
  );
}
