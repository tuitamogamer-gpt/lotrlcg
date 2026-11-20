import type { GameState } from "./types";
import { DIRE_ELIMINATION, direQuest } from "./dire";

// Kept independent of the card registry: scenario definitions import this module
// before the runtime card collection is initialized.
const ONE_RING = "21001";
const SAURON_WORSHIP = "octgn:ae20c7c6-9950-4799-a88e-d0b394879af2";
const BARAD_DUR = "octgn:47ecf6a6-84e9-4aa7-ba23-9afe914027cd";

/**
 * Trouble in Tharbad's level for every player: the scenario's own steps of 10
 * less its Nightmare Deck's reductions (by 2 and 5).
 */
export const tharbadEliminationLevel = (s: GameState) =>
  Math.max(
    0,
    (s.tharbad?.elimination ?? 50) -
      (s.tharbad && s.nightmareMode ? (s.nightmare?.tharbadReduction ?? 0) : 0),
  );
export function threatElimination(
  s: GameState,
  player = s.table?.active ?? 0,
): number {
  const seat =
    !s.table || player === s.table.active ? s : s.table.seats[player];
  const ring = [...(seat?.heroes ?? []), ...(seat?.allies ?? [])].some((u) =>
    u.attachments.some((a) => a.code === ONE_RING && !a.facedown && !a.blanked),
  );
  const worship = s.dangerDorwinion
    ? s.staging
        .filter((u) => u.code === SAURON_WORSHIP && !u.blanked)
        .reduce((n, u) => n + u.damage, 0)
    : 0;
  const tower =
    s.templeDoom && s.staging.some((u) => u.code === BARAD_DUR && !u.blanked)
      ? 5
      : 0;
  return Math.max(
    0,
    (s.tharbad
      ? tharbadEliminationLevel(s)
      : direQuest(s)
        ? DIRE_ELIMINATION
        : 50) -
      (ring ? 5 : 0) -
      worship -
      tower,
  );
}
export const threatEliminationLevel = threatElimination;
