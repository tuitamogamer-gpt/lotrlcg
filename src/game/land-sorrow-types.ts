import type { Unit } from "./types";
/** Physical scenario zones for The Land of Sorrow. */
export interface LandSorrowState {
  initialized: boolean;
  currentQuest: string;
  advancing: boolean;
  /** Camps, Captives and Wardens wait here until the quest's setup places them. */
  setAside: Unit[];
  /** Each Camp's faceup Warden remains under it, not in play, until the Camp becomes active. */
  camps: { location: string; code: string; warden?: Unit }[];
  /** Physical Captive objective-allies that the players have gained control of. */
  freed: { id: string; code: string }[];
  /** Encounter cards that left the deck and are still resolving. */
  resolving: Unit[];
  /** Easterling enemies that already triggered Warriors of the East. */
  enteredEnemies: string[];
  /** Rolling Plains and Weary Lands bonuses expire with the phase. */
  phaseEffects: {
    round: number;
    phase: string;
    plains: number;
    weary: number;
  }[];
  /** Easterling Guard shadows: the defender cannot ready this round. */
  noReady: { id: string; round: number }[];
  /** The Storehouse Warden gets -30 engagement cost until the end of the round. */
  storehouse: { id: string; round: number }[];
}
export interface LandSorrowPlayersState {
  /** Messenger of the King contracts. Side A keeps its physical card here;
   * side B is the physical attachment on the chosen ally. */
  contracts: {
    player: number;
    id: string;
    side: "A" | "B";
    unit?: Unit;
    ally?: string;
  }[];
  /** Smoke and Think cost reductions waiting for each player's next played card. */
  smoke: { player: number; amount: number }[];
  /** Messenger of the King's per-phase ready limit. */
  readied: { id: string; key: string }[];
}
