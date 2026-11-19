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
/** Cunning Informant (Peril in Pelargir's Nightmare Deck) and Alcaron's Scroll. */
const CUNNING_INFORMANT = "octgn:298c3181-5f6f-487c-adbd-741bb202b8e0",
  ALCARONS_SCROLL = "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9001";
/**
 * Cunning Informant: "During the encounter phase, if Alcaron's Scroll is
 * attached to a hero, that hero's controller is considered to have +10 threat
 * for the purpose of engagement checks." (each copy in play)
 */
function informantThreat(s: GameState, player: number) {
  if (s.phase !== "encounter") return 0;
  const seats = s.table
    ? s.table.seats.map((seat, i) => (i === s.table!.active ? s : seat))
    : [s];
  const own = seats[player];
  if (
    !own?.heroes.some((h) =>
      h.attachments.some((a) => a.code === ALCARONS_SCROLL),
    )
  )
    return 0;
  return (
    10 *
    [...s.staging, ...seats.flatMap((seat) => seat.engaged)].filter(
      (u) => u.code === CUNNING_INFORMANT && !u.blanked,
    ).length
  );
}
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
        .length +
    informantThreat(s, player)
  );
}
