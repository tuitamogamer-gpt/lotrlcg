import type { Unit } from "./types";
/** Physical and continuous state for The Caves of Nibin-Dûm. */
export interface CavesState {
  /** The current quest card (stages 1-4 of the 1A-4A quest deck). */
  currentQuest: string;
  advancing: boolean;
  /** The Two-Player Limited Edition Starter's 2018 recipe or The Dark of Mirkwood's. */
  edition: "2018" | "2022";
  /** Out of play: Goblin Chieftain and Cracked Pillar until the quest brings them in. */
  setAside: string[];
  /** Collapsed Mine: progress placed on the quest this round. */
  questProgress: { round: number; amount: number } | null;
  /** Lost in the Dark: no progress on the quest until the end of this phase. */
  dark: { round: number; phase: string } | null;
  /** Cracked Pillar: the round in which the first player attacked it. */
  pillarAttacked: number | null;
  /** Lightless Passage's shadow: enemies that take no combat damage this phase. */
  noDamage: { id: string; round: number; phase: string }[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
}
