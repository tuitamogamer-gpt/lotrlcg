import type { GameState, Unit } from "./types";

/** Physical off-board cards and lasting effects of the original Heath scenario. */
export interface WitheredHeathState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  cavesDeck: Unit[];
  resolving: Unit[];
  removed: Unit[];
  guards: { sign: Unit; guardId: string }[];
  peeked: string[];
  noReady: { id: string; round: number }[];
  noDamage: { id: string; round: number; phase: GameState["phase"] }[];
  damageRound: number;
  damageTaken: number;
  usedResponses: string[];
  playerReadyBlockedRound?: number;
}
