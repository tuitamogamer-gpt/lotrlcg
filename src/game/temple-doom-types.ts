import type { Unit } from "./types";

export interface TempleDoomState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  /** Unrevealed stage 2 order. Public views expose only its length. */
  questDeck: string[];
  /** Separate unrevealed Power cards; their reveal has its own deck origin. */
  powerDeck: string[];
  questResources: number;
  enteredEnemies: string[];
  resolving: Unit[];
  underDial: { questId: string; player: number; cards: Unit[] }[];
  memoryThreat: { round: number; value: number };
  lordLimit: { round: number; value: number; placed: number };
  restrictions: { id: string; round: number; until: "refresh" | "round" }[];
  blankRound: number;
  played: { round: number; counts: Record<string, number> };
  protected: { id: string; round: number }[];
  reduced: { round: number; counts: Record<string, number> };
}
