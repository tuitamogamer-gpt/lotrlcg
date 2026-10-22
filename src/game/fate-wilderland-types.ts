import type { Unit } from "./types";

export interface FateWilderlandState {
  initialized: boolean;
  urdugDestroyed: boolean;
  currentQuest: string;
  /** Printed no-effect shadows dealt to Pack of Wargs, consumed by its next attack. */
  blankShadows: Record<string, number>;
  modifiers: {
    id: string;
    round: number;
    /** Absent for round-long modifiers; normalized quest/combat otherwise. */
    phase?: string;
    attack: number;
    defense: number;
  }[];
  preventDamage: { id: string; round: number; phase: string }[];
  urdugAttack?: { round: number; phase: string };
  darkClouds: { round: number; phase: string; count: number }[];
  /** The original physical event remains facedown under its particular location. */
  storedCards: { locationId: string; player: number; cards: Unit[] }[];
  resolving: string[];
}
