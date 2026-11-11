import type { Unit } from "./types";
/** Physical and continuous state for We Must Away, Ere Break of Day. */
export interface WeMustAwayState {
  currentQuest: string;
  advancing: boolean;
  /** The face-down sack deck; index 0 is its top card. */
  sackDeck: string[];
  /** Sack cards drawn by a Sack X effect and not yet resolved, in draw order. */
  drawn: string[];
  /** The three Trolls and Troll Cave wait here, out of play, until stage 2A. */
  setAside: Unit[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Stage 3B: the treasures discovered because Troll Cave was explored. */
  treasures: string[];
}
