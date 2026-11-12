import type { Unit } from "./types";
/** Physical and continuous state for The Battle of Five Armies. */
export interface BattleFiveArmiesState {
  /**
   * The current quest: stage 1B, one of stages 2B, 3B and 4B (in play at the
   * same time), or stage 5B.
   */
  currentQuest: string;
  /** Progress on stages 2B, 3B and 4B other than the current quest. */
  stageProgress: Record<string, number>;
  /** The round whose current quest the first player has chosen. */
  chosenRound: number;
  advancing: boolean;
  /** Encounter treacheries that are still resolving. */
  resolving: Unit[];
  /** Weighed Down: the rounds in which exhausted characters get -1/-1/-1. */
  weighedDown: number[];
  /** Bolg: Goblins revealed this round (the first gains surge). */
  goblinRound: number;
  goblinReveals: number;
  /** Bolg has been destroyed. */
  bolgDestroyed: boolean;
}
