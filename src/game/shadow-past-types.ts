import type { Unit } from "./types";
/** Physical and continuous state for A Shadow of the Past. */
export interface ShadowPastState {
  currentQuest: string;
  advancing: boolean;
  /** Bucklebury Ferry, set aside out of play until stage 3A. */
  setAside: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** A Black Rider revealed by stage 2B or 3B cannot be canceled. */
  noCancel: boolean;
}
