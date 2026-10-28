import type { Unit } from "./types";

export interface UlfastState {
  initialized: boolean;
  currentQuest: string;
  resources: number;
  setupChosen: string[];
  resolving: Unit[];
  servantAttacks: Record<string, { round: number; phase: string }>;
  overwhelmed: { player: number; round: number }[];
  prevented: { id: string; round: number }[];
  blockedProgress?: { round: number; phase: string };
}
