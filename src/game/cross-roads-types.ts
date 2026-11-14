import type { Unit } from "./types";

export type CrossRoadsState = {
  currentQuest: string;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** The Men of Harad encounter set, facedown under The Cross-roads (top first). */
  underCrossroads: string[];
  /** Harad enemies placed facedown under The Black Gate. */
  underBlackGate: string[];
  /** Arrows Thick in the Air: each Harad enemy gains Archery 2 until the end of the round, once per copy. */
  arrows?: { round: number; count: number };
  /** Captain of Harad: each Harad enemy gets +1 attack and -10 engagement cost until the end of the round, once per engagement. */
  captain?: { round: number; count: number };
  /** Oliphaunt: the damage each Oliphaunt has taken this round (at most 3). */
  oliphaunt?: { round: number; damage: Record<string, number> };
};
