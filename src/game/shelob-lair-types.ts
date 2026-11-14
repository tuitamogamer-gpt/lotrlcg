import type { Unit } from "./types";

export type ShelobLairState = {
  currentQuest: string;
  /** A stage is advancing: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** Cleft of Cirith Ungol, Shelob and The Great Spider encounter set, set aside out of play. */
  setAside: string[];
  /** The Spider's Pass: progress placed on the stage this round (at most 4). */
  passProgress?: { round: number; amount: number };
  /** The Spider's Pass: allies each player played or put into play this round. */
  allies?: { round: number; count: Record<string, number> };
  /** Rage and Hunger: Shelob gets +2 attack until the end of the phase, once per copy. */
  rage?: { round: number; phase: string; count?: number };
  /** Many Openings: each location in the staging area gets +1 threat this round, once per copy. */
  openings?: { round: number; count: number; ids?: string[] };
  /** Sméagol flips to Gollum once when the players quest unsuccessfully. */
  failedRound?: number;
};
