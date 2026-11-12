import type { Unit } from "./types";
/** Physical and continuous state for A Knife in the Dark. */
export interface KnifeDarkState {
  currentQuest: string;
  advancing: boolean;
  /** Ringwraiths, The Witch-king, Midgewater and Weathertop, set aside out of play. */
  setAside: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Enemies placed facedown under a Weather Hills: out of play until it leaves play. */
  hills: { location: string; codes: string[] }[];
  /** Stage 3A has resolved: the players win once no Nazgûl enemy is in play. */
  finale: boolean;
}
