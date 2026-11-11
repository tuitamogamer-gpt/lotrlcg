import type { GameState, Unit } from "./types";

/** A staging area of Flies and Spiders while the first player is lost (stage 3). */
export interface FliesSpidersArea {
  id: string;
  players: number[];
  /** The stage card this area quests against. */
  questCode: string;
  progress: number;
  staging: Unit[];
  activeLocation: Unit | null;
  extraActiveLocations: Unit[];
  questDebuff: number;
  fog: number;
  threatModifier: number;
  lastQuest?: GameState["lastQuest"];
}

/** Physical and continuous state for Flies and Spiders. */
export interface FliesSpidersState {
  /** The main quest card: stage 1B, 3B or 4B (the original area's stage while split). */
  currentQuest: string;
  advancing: boolean;
  /** Encounter treacheries that are still resolving. */
  resolving: Unit[];
  /** The Spider's Glade waits out of play until stage 4A. */
  setAside: Unit[];
  /** Copies of Bilbo's Magic Ring not shuffled into a deck at setup. */
  rings: string[];
  /** The first player has a separate staging area at stage 3. */
  split: boolean;
  activeArea?: string;
  areas: FliesSpidersArea[];
  /** Stage 3 is complete; the first player joins stage 4 at the end of the quest phase. */
  stageThreeComplete: boolean;
  /** Areas that have resolved their quest this phase. */
  resolvedAreas: string[];
  /** Areas that have made their travel decision this phase. */
  travelPassedAreas: string[];
  /** Weighed Down: the rounds in which exhausted characters get -1/-1/-1. */
  weighedDown: number[];
  /** Setup (Ring copies, Spider's Glade and the first reveals) has run. */
  initialized: boolean;
  /** Treasures discovered by winning: Bilbo's Magic Ring. */
  treasures: string[];
}
