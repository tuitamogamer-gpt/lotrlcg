import type { Unit } from "./types";
export interface AshMountainsState {
  initialized: boolean;
  currentQuest: string;
  advancing: boolean;
  setupChosen: string[];
  resolving: Unit[];
  custody: {
    host: string;
    player: number;
    kind: "deeps" | "dial";
    cards: Unit[];
  }[];
  starved: number[];
  writhing: Record<string, string[]>;
  blankRound: number;
  noReady: { id: string; round: number }[];
  played: { round: number; counts: Record<string, number> };
  progressLimit: { round: number; placed: number };
  damage: { round: number; counts: Record<string, number> };
  supplies: { round: number; phase: string; amount: number }[];
}
export interface AshPlayersState {
  returnedHeroes?: Unit[];
  contracts: { player: number; unit: Unit }[];
}
