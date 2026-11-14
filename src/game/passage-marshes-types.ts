import type { Unit } from "./types";

export type PassageMarshesState = {
  currentQuest: string;
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** 1B: Gollum's defense bonus for the attack being made against him. */
  gollumDefense?: { id: string; value: number };
  /** The round whose unsuccessful quest has already flipped Sméagol to Gollum. */
  failedRound?: number;
};
