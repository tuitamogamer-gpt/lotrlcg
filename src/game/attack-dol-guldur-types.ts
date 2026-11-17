import type { Unit } from "./types";
/** Physical and continuous state for Attack on Dol Guldur (standard game mode). */
export interface AttackDolGuldurState {
  /** The current quest card: 1A, 2A or one of the four stage 3 cards. */
  currentQuest: string;
  advancing: boolean;
  /**
   * Out of play: both setup cards, Host of Lórien until 2A brings it in, and
   * each Lieutenant enemy that is not in play or in the victory display.
   */
  setAside: string[];
  /** Encounter cards removed from the game (Host of Lórien once it leaves play). */
  removed: string[];
  /** The city strength of Dol Guldur (the siege tracker). */
  cityStrength: number;
  /** Resources on Assault on the Golden Wood (1B): at 3 the players advance. */
  questResources: number;
  /** The player who controls Power of Lórien in his play area (after 2A). */
  lorien: { player: number } | null;
  /** The siege value of the locations explored and enemies destroyed this round. */
  siege: { round: number; value: number };
  /** Fastness of Mirkwood: the round with at most 5 progress on the current quest. */
  fastness: number | null;
  /** Progress placed on the current quest this round (for Fastness of Mirkwood). */
  questProgress: { round: number; amount: number } | null;
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Gate of Dol Guldur: threat each player reduced by player card effects this round. */
  threatReduced: { player: number; round: number; amount: number }[];
  /** Dungeon Door: damage healed from each character this round. */
  healed: { id: string; round: number; amount: number }[];
  /** Fear and Despair: the round in which player card effects cannot ready characters. */
  despair: number | null;
  /** Fear and Despair's shadow: defenders that cannot ready this round. */
  unready: { id: string; round: number }[];
  /** The Necromancer's Rage: damaged characters get -1 willpower this phase. */
  rage: { round: number; phase: string } | null;
  /** The Necromancer's Rage's shadow: -1 defense per damage on the defender this phase. */
  rageShadow: { id: string; round: number; phase: string }[];
  /** Fastness of Mirkwood's shadow: the attacking enemy's defense bonus this phase. */
  fastnessShadow: { id: string; round: number; phase: string; value: number }[];
  /** Events played during the quest phase that The Shadow Road takes when they finish. */
  shadowRoad: string[];
}
