import type { Unit } from "./types";
/** Physical and continuous state for The Massing at Osgiliath. */
export interface MassingState {
  currentQuest: string;
  advancing: boolean;
  /** Stage 4B: the players have crossed the Anduin. */
  crossed: boolean;
  /** The Witch-king waits here, out of play, until stage 4B. */
  setAside: Unit[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Dark Pursuit raises the staging area's threat until the end of the phase. */
  phaseThreat: { round: number; phase: string; value: number }[];
  /** Massing at Osgiliath: each revealed card gains doomed until the end of the phase. */
  doomed: { round: number; phase: string; value: number }[];
  /** The round in which the first Scout enemy was revealed. */
  scoutRound: number;
  /** Emyn Arnen Overlook's pending surge and doomed 2 for that first Scout. */
  overlook: string | null;
  /** Stage 2B: cards played or put into play from each player's hand this round. */
  handCards: { round: number; counts: Record<string, number> };
}
