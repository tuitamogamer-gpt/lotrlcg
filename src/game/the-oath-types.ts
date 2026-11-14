import type { Unit } from "./types";
/** Physical and continuous state for The Oath. */
export interface OathState {
  currentQuest: string;
  advancing: boolean;
  /** The Two-Player Limited Edition Starter's 2018 recipe or The Dark of Mirkwood's. */
  edition: "2018" | "2022";
  /** Goblin Troop, set aside by 1A until 3A. */
  troopAside: boolean;
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
}
