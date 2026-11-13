import type { Unit } from "./types";
/** Physical and continuous state for The Old Forest. */
export interface OldForestState {
  currentQuest: string;
  advancing: boolean;
  /** Old Man Willow and Withywindle, out of play until stage 3A. */
  setAside: string[];
  /** The stage 2 cards waiting in the quest deck (every stage 2 but the current one). */
  stageTwo: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Ending and Failing: copies whose threat raise waits for the end of the phase. */
  endingFailing: number;
  /** Oppressive Forest: the round counted and the cards each player played in it. */
  playedRound: number;
  played: number[];
  /** Tom Bombadil: his end-of-round discard and shuffle are pending this round. */
  tom: boolean;
}
