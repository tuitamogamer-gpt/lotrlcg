import type { Unit } from "./types";

export type GreyCompanyState = {
  currentQuest: string;
  /** A stage is advancing: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** The Stone of Erech, Army of the Dead and the rules card, set aside out of play. */
  setAside: string[];
  /** Copies of Overcome by Fear set aside, out of play (an encounter effect may attach them). */
  fearAside: number;
  /** Copies of Overcome by Fear removed from the game at setup. */
  fearRemoved: number;
  /** The Paths of the Dead: the players who chose not to raise their threat cannot play cards this phase. */
  noPlay?: { round: number; players: number[] };
  /** The Way is Shut: progress cannot be placed on the current quest this round. */
  shutRound?: number;
  /** The Paths of the Dead: the locations chosen so far by the players' searches. */
  searched?: string[];
  /** Whispers in the Dark: these characters get -1 willpower, attack and defense this round, once per copy. */
  whispered?: { round: number; ids: string[] };
  /** Blood Runs Chill: these defending characters cannot ready until the end of the round. */
  chilled?: { round: number; ids: string[] };
};
