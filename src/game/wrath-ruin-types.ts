import type { Unit } from "./types";

export interface WrathRuinState {
  initialized: boolean;
  currentQuest: string;
  controlled: Unit[];
  /** Explored locations retained while simultaneous When effects resolve. */
  pendingExplored: Unit[];
  resolving: Unit[];
  looked: Unit[];
  storedCards: { locationId: string; cards: Unit[] }[];
  setupChosen: string[];
  enteredEnemies: string[];
  threatRaised: Record<string, number>;
  phaseThreat: { round: number; phase: string; value: number }[];
}
