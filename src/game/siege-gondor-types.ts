import type { Unit } from "./types";

export type SiegeGondorState = {
  currentQuest: string;
  /** The stage is being defeated: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** The rules card, set aside out of play. */
  setAside: string[];
  /** Raiding the Coasts: added to the total threat in the staging area until the end of the phase. */
  raiding?: { round: number; phase: string; amount: number };
  /** Black Sails: these Ship locations get +1 threat in the staging area until the end of the phase, once per copy. */
  sails?: { round: number; phase: string; ids: string[] };
  /** Port of Pelargir: the damage healed from each character this round. */
  healed?: { round: number; amounts: Record<string, number> };
  /** Port of Pelargir's shadow: these characters cannot ready until the end of the round. */
  moored?: { round: number; ids: string[] };
  /** Great Corsair Ship's travel: a Corsair Captain has been added to the staging area. */
  captainFound?: boolean;
};
