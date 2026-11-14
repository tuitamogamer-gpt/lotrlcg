import type { Unit } from "./types";

export type MountDoomState = {
  currentQuest: string;
  /** The stage is being defeated: its text is not in effect. */
  advancing: boolean;
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** 1A's setup is complete: the locations were searched for. */
  ready: boolean;
  /** 1A: the titles of the locations the players already searched for. */
  searched?: string[];
  /** 1B and 3B: the round whose quest phase revealed its first treachery. */
  firstTreachery?: number;
  /** The first treachery of this quest phase, immune and with surge, until it resolves. */
  immuneReveal?: string;
  /** The players who failed a Fortitude test this round. */
  failed?: { round: number; players: number[] };
  /** 2B: the resources on the quest card. */
  resources?: number;
  /** 3B: the first player failed this round's test: no more than 5 progress here. */
  capped?: { round: number; placed: number };
  /** Foul Fumes: printed text boxes treated as blank until the end of the round. */
  fumes?: { round: number; ids: string[] };
};
