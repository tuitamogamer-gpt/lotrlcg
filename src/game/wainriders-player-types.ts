import type { Unit } from "./types";
export interface WainridersPlayersState {
  contracts: {
    player: number;
    unit: Unit;
    hero: string;
    heroCode: string;
    side: "A" | "B";
  }[];
  horns: string[];
  scout: { player: number; enemy: string; round: number }[];
}
