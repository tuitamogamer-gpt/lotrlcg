import type { Unit } from "./types";
import type { FellowshipEventState } from "./fellowship-event-support";

/**
 * Escape from Khazad-dûm (2019 Fellowship event), played cooperatively; the
 * quick build, the quest deck and the box are the Fellowship event state (its
 * sets are numbered 15 to 28).
 */
export interface EscapeKhazadState extends FellowshipEventState {
  /** Dark Pit was explored: Durin's Bane, its other side, is set aside, out of play. */
  baneAside: boolean;
  /** Nearing the Gate: the round in which Durin's Bane cannot take damage. */
  baneSafe: number | null;
  /** Last Lord of Moria: the damage Durin's Bane has taken this round. */
  baneDamage: { round: number; amount: number } | null;
  /** The Bridge of Khazad-dûm: the damage on the stage. */
  bridgeDamage: number;
  /** The Bridge of Khazad-dûm: the progress placed on the stage this round. */
  bridgePlaced: { round: number; placed: number } | null;
  /** Old One Lair: the enemy with a resource on it. */
  lair: string | null;
  /**
   * Lasting effects until the end of the round (key `round:N`) or of the
   * phase (the phase key): blank text boxes (New Devilry), stat penalties of
   * characters (Swarm of Bats), enemy bonuses (Bottomless Chasm) and enemies
   * that cannot take damage (Hobgoblin).
   */
  blank: { id: string; key: string }[];
  penalties: {
    id: string;
    key: string;
    will: number;
    attack: number;
    defense: number;
  }[];
  enemyDefense: { id: string; key: string; value: number }[];
  noDamage: { id: string; key: string }[];
  /** Fatigue: the round in which characters cannot be readied by player card effects. */
  fatigue: number | null;
  /** Lost and Alone's shadow: the defending character cannot ready this round. */
  noReady: { id: string; round: number }[];
  /** Silent Caverns: the threat each player has reduced this round. */
  reduced: { player: number; round: number; amount: number }[];
  /** Goblin Dungeon: the ally guarded under each copy, with its owner. */
  dungeon: { locationId: string; player: number; ally: Unit }[];
  /** Nameless Thing: the player card attached to each copy, with its owner. */
  nameless: { enemyId: string; player: number; code: string }[];
  /** Old Stone-troll: the excess damage of an attack, until the character is destroyed. */
  excess: { id: string; amount: number } | null;
  /** The treacheries being resolved. */
  resolving: Unit[];
}
