import type { Unit } from "./types";
/** Physical and continuous state for Journey in the Dark. */
export interface JourneyDarkState {
  currentQuest: string;
  advancing: boolean;
  /** The Balrog, The Great Bridge and Chamber of Mazarbul, out of play. */
  setAside: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Drums in the Deep: resource tokens on stage 2B. */
  drums: number;
  /** 2B: the round whose quest phase began with no enemy in the staging area. */
  drumsReveal: number;
  /** The Bridge of Khazad-dûm: progress placed on stage 3B this round. */
  bridgeRound: number;
  bridgePlaced: number;
  /** The Great Bridge's response: The Balrog lost all keywords. */
  balrogUnbound: boolean;
}
