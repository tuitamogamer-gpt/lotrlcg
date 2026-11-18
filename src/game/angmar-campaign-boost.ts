// The Angmar Awakened campaign's temporary stat boosts, kept apart from the
// campaign module so that the core stats need no campaign imports.
import type { GameState, Unit } from "./types";

/** The game phase a step belongs to (the quest and combat phases have two steps here). */
export const angmarPhase = (phase: string) =>
  phase === "staging"
    ? "quest"
    : phase === "defense" || phase === "attack"
      ? "combat"
      : phase;
/**
 * Boosts until the end of the phase: Cunning's +2 [willpower], +2 [attack]
 * and +2 [defense] (no stat named), and Losing Time's shadow, +3 [attack] or
 * +3 [defense] for the attacking enemy.
 */
export const angmarCampaignBoost = (
  s: GameState,
  u: Unit,
  stat: "will" | "attack" | "defense",
) =>
  (s.angmarCards?.boosts ?? [])
    .filter(
      (b) =>
        b.target === u.id &&
        b.phase === angmarPhase(s.phase) &&
        b.round === s.round &&
        (!b.stat || b.stat === stat),
    )
    .reduce((n, b) => n + (b.value ?? 2), 0);
