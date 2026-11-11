import type { Unit } from "./types";
/** Physical and continuous state for Dungeons Deep and Caverns Dim. */
export interface DungeonsDeepState {
  /** The main quest: stage 1B, then stage 3B. */
  currentQuest: string;
  advancing: boolean;
  /** Stage 2B in the riddle area; only riddles add or remove its progress. */
  riddleProgress: number;
  /** Gollum (and only Gollum) waits in the riddle area until stage 3B. */
  riddleArea: Unit[];
  /** Bilbo Baggins is in the riddle area until stage 3B. */
  bilboInRiddleArea: boolean;
  /** Encounter treacheries and answered riddle cards that are still resolving. */
  resolving: Unit[];
  /** Hiding in the Trees: the rounds whose characters get -1 willpower and cannot attack. */
  hiding: number[];
  /** Great Gray Wolf was dealt a riddle shadow: Creatures return at the end of combat. */
  wolfReturn: boolean;
  /** The origin of the card currently being revealed. */
  lastRevealOrigin: string | null;
}
