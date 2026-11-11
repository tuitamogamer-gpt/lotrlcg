import type { Unit } from "./types";
/** Physical and continuous state for Over the Misty Mountains Grim. */
export interface MistyMountainsState {
  currentQuest: string;
  advancing: boolean;
  /** Setup and stage 1B ran after the opening hands were kept. */
  initialized: boolean;
  /** Stage 3A made the second (Goblin) encounter deck active. */
  goblinTown: boolean;
  /** The inactive encounter deck, top first: the Goblin deck, then the first deck. */
  inactiveDeck: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Guffawing of Giants: Stone-giants that engage at the end of the quest phase. */
  guffawing: string[];
  /** Chaos in the Cavern: Goblin enemies get +1 threat until the end of the phase. */
  chaos: { round: number; phase: string }[];
  /** Front Porch copies whose printed text box is blank until the end of the round. */
  porchBlank: { id: string; round: number }[];
}
