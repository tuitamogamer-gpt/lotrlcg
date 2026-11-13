import type { Unit } from "./types";
import type { FliesSpidersArea } from "./flies-spiders-types";
/** Physical and continuous state for Breaking of the Fellowship. */
export interface BreakingFellowshipState {
  /** The stage card before the players separate (stage 1 or 2), or alone. */
  currentQuest: string;
  advancing: boolean;
  /** Frodo's Choice, Seat of Seeing and Parth Galen, out of play. */
  setAside: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** 2A: the Ring-bearer and the cards attached to it, removed from the game. */
  ringBearerOut: Unit | null;
  /** 2A: each enemy's engagement cost is 0 until the end of this round's encounter phase. */
  zeroEngagementRound: number;
  /** 2A: the travel phase of this round is skipped. */
  skipTravelRound: number;
  /** Each player has his own staging area and stage (stages 3 and 4). */
  split: boolean;
  activeArea?: string;
  areas: FliesSpidersArea[];
  /** Areas that have resolved their quest this phase. */
  resolvedAreas: string[];
  /** Areas that have made their travel decision this phase. */
  travelPassedAreas: string[];
  /** The player who revealed Frodo's Choice keeps the first player token. */
  frodoPlayer: number | null;
  /** 4B: players who engaged an enemy revealed at stage 4 this round. */
  engagedRound: number;
  engagedPlayers: number[];
  /** Black Feathered Arrows: archery added to an area until the end of the round. */
  arrows: { area: string; round: number; value: number }[];
  /** Orcs of the White Hand: enemies with +1 threat, attack and defense this round. */
  whiteHand: { id: string; round: number }[];
  /** Fallen into Evil: heroes that are enemies, with their owners. */
  fallen: { id: string; owner: number }[];
  /** 4A: areas whose quest phase ended this round without resolving the quest. */
  ended: string[];
}
