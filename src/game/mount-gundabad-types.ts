import type { GameState, Unit } from "./types";

/** The original quest's hidden decks retain their physical cards and identities. */
export interface MountGundabadState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  /** Stage 2A remains face up until the beginning of the quest phase. */
  questFront: boolean;
  questDeck: string[];
  completedQuests: string[];
  cavesDeck: Unit[];
  setAside: Unit[];
  resolving: Unit[];
  removed: Unit[];
  guardedPlayerCards: { guardId: string; player: number; card: Unit }[];
  reforged: boolean;
  damageRound: number;
  damageTaken: number;
  firstTreacheryRound: number;
  protectedTreachery?: string;
  phasePlays: { player: number; round: number; phase: string; count: number }[];
  noPlayerReady: { id: string; round: number }[];
  darkPlaces: { round: number; phase: GameState["phase"]; amount: number }[];
  usedResponses: string[];
}
