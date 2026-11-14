import type { Unit } from "./types";

export type RoadIsengardState = {
  currentQuest: string;
  advancing: boolean;
  /** Gates of Isengard, Orthanc, Saruman and Saruman's Staff, until stages 2A and 3A. */
  setAside: string[];
  /** Treacheries being resolved. */
  resolving: Unit[];
  /** Rouse the Ents: the resource tokens on stage 1B. */
  rouse: number;
  /** Breaking Isengard: the damage tokens on stage 2B. */
  breaking: number;
  /** Wizardry effects of shadow cards dealt to Saruman or Wolf of Isengard, resolved as the attack begins. */
  wizardry?: { enemy: string; code: string }[];
  /** Saruman's Staff: the players who drew cards, waiting for Saruman's attack. */
  staffPending?: number[];
  /** Saruman's Staff: the next attack Saruman makes is dealt 2 shadow cards. */
  staff?: boolean;
  /** Progress placed on the current quest this phase. */
  phaseProgress?: { round: number; phase: string; amount: number };
  /** Orthanc was explored: progress on the quest is canceled for the rest of this phase. */
  orthanc?: { round: number; phase: string };
  /** Isengard Orc's shadow: enemies with +2 defense until the end of the round. */
  orcDefense?: { round: number; ids: string[] };
  /** Poisoned Vapour: characters treated as blank until the end of the combat phase. */
  vapour?: { round: number; ids: string[] };
  /** Gríma is being shuffled back into the encounter deck. */
  grima?: string;
  /** Orthanc: the top cards of the encounter deck the first player is looking at. */
  looking?: string[];
};
