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
/** Cunning: "+2 [willpower], +2 [attack], and +2 [defense] until the end of the phase." */
export const angmarCampaignBoost = (s: GameState, u: Unit) =>
  s.angmarCards?.boosts?.some(
    (b) =>
      b.target === u.id &&
      b.phase === angmarPhase(s.phase) &&
      b.round === s.round,
  )
    ? 2
    : 0;
