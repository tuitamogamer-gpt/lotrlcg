import type { Unit } from "./types";

export interface DangerDorwinionState {
  initialized: boolean;
  currentQuest: string;
  resources: number;
  cultistDefeated: boolean;
  /** The five unchosen Plot/Cultist cards remain physical, hidden cards. */
  setAside: Unit[];
  /** Cards looked at for Seedy Tavern, outside the shuffled encounter deck. */
  looked: Unit[];
  storedCards: { locationId: string; cards: Unit[] }[];
  /** Physical cards waiting for a reveal after their host is explored. */
  resolving: Unit[];
  /** Treacheries held by a saved choice rather than discarded prematurely. */
  resolvingTreacheries: string[];
  cultistDamage: { round: number; amount: number };
  threatRaised: Record<string, number>;
  servantAttacks: Record<string, { round: number; phase: string }>;
  prevented: { id: string; round: number }[];
  overwhelmed: { player: number; round: number }[];
  manorReduction: { round: number; players: Record<string, number> };
  /** Transformation preserves the ally's physical owner when control changes. */
  secretCultists: { id: string; owner: number }[];
}
