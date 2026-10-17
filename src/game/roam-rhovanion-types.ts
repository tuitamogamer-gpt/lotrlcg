import type { Unit } from "./types";

/** Additional physical zones and printed phase modifiers for Roam Across Rhovanion. */
export interface RoamRhovanionState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  guarded: { card: Unit; guardId: string }[];
  removed: Unit[];
  storedCards: { locationId: string; player: number; cards: Unit[] }[];
  guardedPlayerCards: { guardId: string; player: number; card: Unit }[];
  resolving: string[];
  locationProgress: { id: string; round: number; amount: number }[];
  threatModifiers: {
    id?: string;
    round: number;
    phase: string;
    amount: number;
  }[];
  attackModifiers: {
    id: string;
    round: number;
    phase: string;
    amount: number;
  }[];
  keyPeek: string[];
  keyPlayer?: number;
  wildEngaged: number[];
  urdugQuestAttack?: string;
}
