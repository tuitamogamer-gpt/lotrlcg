import type { Unit } from "./types";

export type PelennorFieldsState = {
  currentQuest: string;
  /** The stage is being defeated: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** Set aside, out of play: Minas Tirith, Grond, The Witch-king, the Wraiths on Wings, the boons and the rules card. */
  setAside: string[];
  /** Dread and Despair: added to the total threat in the staging area until the end of the phase. */
  despair?: { round: number; phase: string; amount: number };
  /** Shadow of Mordor: these characters' printed text boxes are blank until the end of the round. */
  shadowed?: { round: number; ids: string[] };
  /** War Mûmak: the damage each copy has taken this round. */
  mumak?: { round: number; damage: Record<string, number> };
  /** Searches for different enemies: the titles chosen so far. */
  searched?: string[];
};
