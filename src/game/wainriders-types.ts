import type { Unit } from "./types";
export interface WainridersState {
  initialized: boolean;
  currentQuest: string;
  challengerSteps: number;
  wainriderSteps: number;
  damage: number;
  progress: number[];
  defeated: number[];
  completedRound: number;
  completed: number;
  setupChosen: string[];
  resolving: Unit[];
  enteredEnemies: string[];
  phaseEffects: {
    round: number;
    phase: string;
    plains: number;
    weary: number;
  }[];
  test?: {
    stage: number;
    stat: "will" | "attack" | "defense";
    result: "straight" | "turn";
    required: number;
    excess: number;
    travel: boolean;
  };
  lastTest?: {
    cards: string[];
    matches: number;
    required: number;
    passed: boolean;
  };
  cunning?: number;
}
