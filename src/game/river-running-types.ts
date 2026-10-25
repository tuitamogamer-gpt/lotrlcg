import type { Unit } from "./types";
export interface RiverRunningState {
  initialized: boolean;
  currentQuest: string;
  setAside: Unit[];
  resolving: Unit[];
  setupChosen: string[];
  enteredEnemies: string[];
  progressRound: number;
  progressPlaced: number;
  phaseEffects: {
    round: number;
    phase: string;
    plains: number;
    weary: number;
  }[];
}
