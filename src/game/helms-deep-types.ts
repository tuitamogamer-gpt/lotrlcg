import type { Unit } from "./types";

export type HelmsDeepState = {
  /** The current quest card. */
  currentQuest: string;
  /** A stage defeat is being resolved. */
  advancing: boolean;
  /** Cards set aside, out of play: The Defense of Helm's Deep, a Deeping Wall and a Soldier of Isengard for each player. */
  setAside: string[];
  /** Treachery cards while their When Revealed effects resolve. */
  resolving: Unit[];
  /** 1A: the players shuffled Poisoned Counsels into their decks (null until chosen). */
  counsels: boolean | null;
  /** Fighting Uruk-hai: players whose engaged enemies add their threat this round. */
  fighting?: { round: number; players: number[] };
  /** Devilry of Saruman: the round in which each character's text box is blank. */
  devilry?: number;
  /** Devilry of Saruman's shadow: enemies with +2 attack and Toughness 2 this round. */
  devilryShadow?: { round: number; ids: string[] };
  /** Postern Door explored: the round in which players cannot declare attacks. */
  postern?: number;
  /** Helm's Gate explored: the round of -20 engagement cost and +2 attack. */
  gate?: number;
  /** Helm's Gate: the round whose staging step already revealed its card. */
  gateStaging?: number;
  /** 3B: the round in which the encounter deck placed progress on the stage by questing. */
  questProgress?: number;
};
