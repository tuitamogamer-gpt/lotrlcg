import type { Unit } from "./types";

/** The Wizard's Quest (2018 Fellowship event), played cooperatively. */
export interface WizardsQuestState {
  /** The main quest card (1, then the chosen stage 2 and stage 3). */
  currentQuest: string;
  /** The chosen quest cards still to come, in order. */
  questDeck: string[];
  /** The quest cards the players have defeated, in order. */
  defeated: string[];
  /** Out of the game: the quest cards and encounter sets not chosen. */
  box: string[];
  /** The encounter sets in the encounter deck (their numbers, 15 to 28). */
  sets: number[];
  /** The quick build in progress before the first round. */
  building: { stage2: string | null; stage3: string | null } | null;
  advancing: boolean;
  /** A Fork in the Road: the location with a resource on it. */
  forkId: string | null;
  /** Carried Away: the allies guarded by the stage. */
  carried: { player: number; ally: Unit }[];
  /** Necromancer's Pass: the card each Pass guards, faceup under it. */
  passGuards: { locationId: string; card: Unit; player: number }[];
  /** Dungeons of the Necromancer: the heroes guarded by enemies. */
  guardedHeroes: { hero: Unit; player: number; guardId: string }[];
  /** The card whose 'when revealed' effects cannot be canceled (the A sides' searches). */
  noCancel: string | null;
  /** Hunting Warg's immediate attack after it engages. */
  huntingAttack: string | null;
  /** Nightfall, attached to a player's threat dial. */
  nightfall: { player: number; code: string }[];
  /** Under the Shadow: the cards each player played this phase. */
  plays: { player: number; key: string; count: number }[];
  /** Lasting effects until the end of a phase or round. */
  storm: { key: string } | null;
  fog: { key: string } | null;
  pine: { key: string; count: number } | null;
  fogShadow: { player: number; key: string }[];
  noReady: { id: string; round: number }[];
  noDamage: { id: string; round: number }[];
  /** Enemies that engaged a player this round (Pitch-dark Thicket's shadow). */
  engagedRound: { id: string; round: number }[];
  /** Attack boosts until the end of a phase (Hunting Warg). */
  boosts: { id: string; key: string; attack: number }[];
  /** The Wargs' Glade: the round its surge was used. */
  gladeRound: number | null;
  resolving: Unit[];
}
