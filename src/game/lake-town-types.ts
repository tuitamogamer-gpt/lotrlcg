import type { Unit } from "./types";
/** Physical and continuous state for The Battle of Lake-town. */
export interface LakeTownState {
  currentQuest: string;
  advancing: boolean;
  /** The separate, facedown Smaug deck (top first) and its discard pile. */
  smaugDeck: string[];
  smaugDiscard: string[];
  /** The round whose quest phase revealed the Smaug in play. */
  smaugRound: number;
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Reckless in His Rage copies resolved on Smaug this round. */
  reckless: { round: number; count: number };
  /** The Old Thrush: Smaug's defense reduction for the current attack. */
  thrush: { enemyId: string; value: number } | null;
}
