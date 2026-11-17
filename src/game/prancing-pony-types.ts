import type { Unit } from "./types";
/** Physical and continuous state for Murder at the Prancing Pony. */
export interface PrancingPonyState {
  /** The current quest card (stages 1, 2 and 3). */
  currentQuest: string;
  advancing: boolean;
  /** Out of play: the two rules cards. */
  setAside: string[];
  /** The Suspect and Hideout set aside facedown at setup, until the accusation. */
  guilty: { suspect: string; hideout: string } | null;
  /** The Investigation deck, top first; its order is hidden. */
  investigation: string[];
  /** Cards removed from the game: 2B's random cards and Taken by Surprise. */
  removed: string[];
  /** The Suspects and Hideouts the players have seen: the Investigation List. */
  checked: string[];
  /** The accusation, once the first player has made it. */
  accusation: { suspect: string; hideout: string; correct: boolean } | null;
  /** The Suspect named while the first player names a Hideout. */
  naming: string | null;
  /** 1B: progress placed on the stage this round (no more than 4). */
  stageProgress: { round: number; amount: number } | null;
  /** 1B: additional encounter cards the players chose to reveal this phase. */
  extraReveals: number;
  /** Investigation cards being looked at, until they go back. */
  looking: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Smoke and Mirrors: threat added to the staging area for the phase. */
  smoke: { phase: string; round: number; value: number } | null;
  /** Bill Ferny: the first treachery revealed this round (doomed 1, cannot be canceled). */
  billing: { round: number; code: string } | null;
  /** Archet Trading Post: damage each Suspect has taken this round. */
  suspectDamage: { id: string; round: number; damage: number }[];
}
