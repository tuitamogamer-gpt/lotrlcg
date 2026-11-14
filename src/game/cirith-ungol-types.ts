import type { Attachment, Unit } from "./types";

export type CirithUngolState = {
  currentQuest: string;
  /** The stage is being defeated: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** Set aside, out of play: Shagrat. */
  setAside: string[];
  /**
   * The Ring-bearer, placed faceup under Topmost Chamber as a guarded
   * objective until the Chamber leaves play.
   */
  captive?: Unit;
  /** The One Ring and Last of the Company before the first player attaches them. */
  ring?: Attachment;
  company?: Attachment;
  /** The One Ring has been attached: the Saga's loss check applies. */
  ringPlaced: boolean;
  /** Orcish Howls: each enemy gets +1 threat for each damage on it until the end of the phase. */
  howls?: { round: number; phase: string };
  /** Shagrat: -X engagement cost until the end of the round. */
  shagrat?: { round: number; amount: number };
  /** Wounded Uruk: +2 attack until the end of the round. */
  wounded?: { round: number; ids: string[] };
  /** Last of the Company: -X threat until the end of the phase. */
  lessened?: { round: number; phase: string; values: Record<string, number> };
};
