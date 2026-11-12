import type { Unit } from "./types";
/** Physical and continuous state for Flight to the Ford. */
export interface FlightFordState {
  currentQuest: string;
  advancing: boolean;
  /** The Ring-bearer's life: the players lose when it reaches zero. */
  life: number;
  /** Ford of Bruinen and The Witch-king, set aside out of play until 2B. */
  setAside: string[];
  /** The burden deck, top card first. */
  burdens: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Additional encounter cards to reveal during this quest phase. */
  extraReveals: number;
  /** The Nine are Abroad: characters whose text boxes are blank this round. */
  blank: { round: number; ids: string[] } | null;
  /** Pain Assailed Him: the round in which the Ring-bearer's stats are 0. */
  painRound: number | null;
}
