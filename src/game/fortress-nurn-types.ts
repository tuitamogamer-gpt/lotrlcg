import type { Unit } from "./types";
/** Physical scenario zones for The Fortress of Nurn. */
export interface FortressNurnState {
  initialized: boolean;
  currentQuest: string;
  advancing: boolean;
  /** Unrevealed Power of Mordor cards. Public views expose only the count. */
  powerDeck: string[];
  /** Each Storm the Castle keeps one faceup Power card under it, not in play. */
  powered: { questId: string; code: string }[];
  /** Facedown player cards under the quest deck ("quest-deck") or under a side quest. */
  under: { questId: string; player: number; cards: Unit[] }[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Determined Defense threat that lasts until the end of its phase. */
  phaseThreat: { round: number; phase: string; value: number }[];
  /** Easterling Mercenary: no progress on the current quest this phase. */
  noProgress: { round: number; phase: string }[];
  /** Progress already placed on the current quest this round, for The Dungeons of Dol Rhugar. */
  dungeons: { round: number; placed: number };
  /** The Armies of Mordor: engaged non-unique enemies that cannot take damage this round. */
  protected: { id: string; round: number }[];
  /** Covered in Darkness: threat already reduced by player card effects this round. */
  reduced: { round: number; counts: Record<string, number> };
}
export interface FortressNurnPlayersState {
  /** Bond of Friendship contracts, kept in play beside their owners. */
  contracts: { player: number; unit: Unit }[];
}
