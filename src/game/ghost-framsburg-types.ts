import type { Unit } from "./types";
export interface GhostFramsburgState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  /** Looked-at cards remain physically outside the encounter deck until Discover ends. */
  discoverCards: Unit[];
  loot: { unit: Unit; guardId: string }[];
  removed: Unit[];
  setupLocations: string[];
  claiming?: string;
  revealing?: string;
  discoverModifiers: { id: string; amount: number }[];
  noReady: { id: string; round: number }[];
  noDamage: { id: string; round: number; phase: string }[];
  shadows: { id: string; round: number; amount: number }[];
  threatReduced: { player: number; round: number; amount: number }[];
  slammedRound?: number;
  destroyedEnemies: string[];
}
