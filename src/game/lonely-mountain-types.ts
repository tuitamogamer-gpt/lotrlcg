import type { Unit } from "./types";
/** Why the first player is making a burgle attempt. */
export type BurgleReason = "stage" | "patch";
/** A burgle attempt waiting for the first player's decision. */
export interface LonelyMountainBurgle {
  reason: BurgleReason;
  /** The discarded encounter card whose burgle effect resolves. */
  code: string;
  /** The revealed card, still on top of the first player's deck. */
  revealed: string;
}
/** Physical and continuous state for The Lonely Mountain. */
export interface LonelyMountainState {
  /** The current quest: stage 1B, 2B, 3B or 4B. */
  currentQuest: string;
  advancing: boolean;
  /** The Erebor treasures stacked facedown under The Lonely Mountain, top first. */
  stack: string[];
  /** Smaug the Golden, Smaug the Magnificent and A Bare Patch while out of play. */
  setAside: Unit[];
  /** Encounter treacheries that are still resolving. */
  resolving: Unit[];
  /** Treasures successfully burgled from under The Lonely Mountain. */
  treasures: string[];
  /** The burgle attempt being resolved. */
  burgle: LonelyMountainBurgle | null;
  /** Weighed Down: the rounds in which exhausted characters get -1/-1/-1. */
  weighedDown: number[];
  /** Desolation of Smaug: treachery cards revealed this round. */
  treacheryRound: number;
  treacheryReveals: number;
  /** Known to an Ounce: +1 threat per discarded event until the end of the phase. */
  ounce: { round: number; phase: string; amount: number }[];
  /** Secret Entrance turned the players back: they cannot travel again this round. */
  noTravelRound: number | null;
  /** Secret Entrance: the card type named as the players travel there. */
  entranceNamed: string | null;
}
