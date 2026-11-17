import type { Unit } from "./types";
/** Physical and continuous state for The Ruins of Belegost. */
export interface RuinsBelegostState {
  /** The current quest card: the quest deck branches at stages 2 and 3. */
  currentQuest: string;
  advancing: boolean;
  /**
   * Out of play: the two rules cards and, until the quest brings them in,
   * Lurker of the Depths, Naurlhûg, Naurlhûg's Lair and Sword of Belegost.
   */
  setAside: string[];
  /** The Loot objective facedown under Stalking the Ruins, until it is found. */
  under: string | null;
  /** Resources on the current quest card (Deeper into the Past needs 3). */
  questResources: number;
  /** The Servants of Morgoth: the round in which a Hazard card gained surge. */
  hazardSurgeRound: number | null;
  /** Lurker of the Depths: the damage it has taken this round (at most 4). */
  lurkerDamage: { round: number; damage: number } | null;
  /** Echoes in the Dark: threat added to the staging area for the phase. */
  echoes: { phase: string; round: number; value: number } | null;
  /** Dwarven Torch and Map of Ered Luin: their targets until the end of the phase. */
  weakened: {
    id: string;
    phase: string;
    round: number;
    kind: "torch" | "map";
  }[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** The cards a Discover keyword is looking at, until they are resolved. */
  looking: string[];
  /** The location whose Discover keyword is resolving. */
  discovering: string | null;
  /** Hazard cards the current Discover keyword revealed. */
  discoveredHazards: number;
}
