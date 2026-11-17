import type { Unit } from "./types";
/** Physical and continuous state for The Siege of Annúminas (standard game mode). */
export interface AnnuminasState {
  /** The current quest card (stages 1, 2 and 3 of the 1A–3A quest deck). */
  currentQuest: string;
  advancing: boolean;
  /**
   * Out of play: the rules cards and the Standard Game Mode setup card, and
   * until the quest brings them in, Lieutenant of Angmar, Battering Ram,
   * Enemy Camp, Siege Tunnel, each Host of Angmar and each Dúnedain of
   * Annúminas.
   */
  setAside: string[];
  /** The city strength of Annúminas: at 0 the players lose. */
  cityStrength: number;
  /** Resources on Rebuild the Defenses (1B): at 4 the players advance. */
  questResources: number;
  /** Vanguard of Carn Dûm: progress placed on the main quest this round. */
  questProgress: { round: number; amount: number } | null;
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Orc of Angmar's shadow: defenders with -2 defense until the end of the round. */
  weakened: { id: string; round: number }[];
  /** Orc of Angmar: +2 defense until the end of the phase. */
  braced: { id: string; round: number; phase: string }[];
  /** Caught in the Press: questing characters with -1 willpower for the phase. */
  pressed: { id: string; round: number; phase: string }[];
  /** Weary Warriors: damaged characters whose text boxes are blank this round. */
  weary: { ids: string[]; round: number } | null;
  /** Vanguard of Carn Dûm's shadow: defenders that cannot ready this round. */
  unready: { id: string; round: number }[];
}
