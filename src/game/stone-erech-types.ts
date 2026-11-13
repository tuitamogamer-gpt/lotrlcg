import type { Unit } from "./types";
/** Physical and continuous state for The Stone of Erech. */
export interface StoneErechState {
  currentQuest: string;
  advancing: boolean;
  /** Derufin, The Lord of the Dead, The Stone of Erech, Dusk and Midnight, out of play. */
  setAside: string[];
  /** The current Night objective (Eventide, then Dusk, then Midnight) and its progress. */
  night: Unit;
  /**
   * Derufin: set aside, attached to The Stone of Erech, controlled by a player,
   * or gone from play while his text box was blank (no loss, but no progress on 3B).
   */
  derufin: "aside" | "attached" | "controlled" | "lost";
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Shadow-man: the round in which the players cannot play events. */
  noEventsRound: number | null;
  /** Groping Horror: the next travel phase is skipped. */
  skipTravel: boolean;
  /** Terror of the Dead: each player skips the next planning phase. */
  skipPlanning: boolean;
  /** Terror of the Dead: heroes do not collect resources this round. */
  noResourcesRound: number | null;
  /** Relic from the Dark Years: enemies without Spectral until the end of the phase. */
  unspectral: string[];
}
