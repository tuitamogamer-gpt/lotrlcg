import type { Unit } from "./types";

/** Original Fire in the Night. The side deck contains physical, facedown cards. */
export interface FireNightState {
  initialized: boolean;
  currentQuest: string;
  hillDamage: number;
  sideDeck: Unit[];
  resolving: string[];
  nonQuestDamage: { round: number; amount: number };
  locationProgress: { id: string; round: number; amount: number }[];
}
