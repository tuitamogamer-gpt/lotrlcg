import type { Unit } from "./types";
/** Physical and continuous state for The Ring Goes South. */
export interface RingSouthState {
  currentQuest: string;
  advancing: boolean;
  /** Lust for the Ring, Redhorn Pass, Doors of Durin and Watcher in the Water, out of play. */
  setAside: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** The Council of Elrond: the faceup cards and their owners. */
  council: { owner: number; unit: Unit }[];
  /** Stage 4: the Ring-bearer and its attachments, facedown under Watcher in the Water. */
  underWatcher: Unit | null;
  /** Lust for the Ring: heroes whose willpower is 0 until the end of the round. */
  lustZero: { id: string; round: number }[];
  /** Snowdrifts: progress placed this round on a location. */
  snow: { id: string; round: number; amount: number }[];
  /** Enemies that engaged a player this round (Hound of Sauron's shadow). */
  engagedRound: number;
  engagedIds: string[];
}
