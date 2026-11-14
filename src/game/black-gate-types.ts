import type { Unit } from "./types";

export type BlackGateState = {
  currentQuest: string;
  /** The stage is being defeated: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** Set aside, out of play: Gwaihir. */
  setAside: string[];
  /**
   * 1B: each faceup player card with its owner, paired with the faceup
   * encounter card the first player decides on.
   */
  embassy?: { owner: number; unit: Unit; encounter: string }[];
  /** Enemies facedown under Reeking Moat, by the Moat's id. */
  moat?: { location: string; units: Unit[] }[];
  /** Onslaught of Mordor: -1 willpower and no healing until the end of the phase. */
  onslaught?: { round: number; phase: string; ids: string[] };
  /** Warrior of Rhûn's shadow: no readying until the end of the round. */
  noReady?: { round: number; ids: string[] };
  /** The player who canceled a 'when revealed' effect, for The Mouth of Sauron. */
  canceller?: number;
  /** Rage Filled Him: a character destroyed by this attack raises threat by 4. */
  rage?: { player: number; enemy: string };
  /** 2B's Forced effect discards the active location once per failed quest. */
  failedRound?: number;
  /** 2A: the titles of the enemies the players already searched for. */
  searched?: string[];
};
