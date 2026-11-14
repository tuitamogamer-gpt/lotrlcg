import type { Unit } from "./types";
import type { FliesSpidersArea } from "./flies-spiders-types";

/** An ally placed facedown under an Ancient Barrow. */
export interface FogBarrowBuried {
  /** The Ancient Barrow it is under. */
  location: string;
  id: string;
  code: string;
  owner: number;
}

/** Physical and continuous state for Fog on the Barrow-downs. */
export interface FogBarrowState {
  /** The shared stage: The House of Tom Bombadil, Across the Downs or Lost in the Fog. */
  currentQuest: string;
  advancing: boolean;
  /** Great Barrow, Standing Stones and Hollow Circle, out of play until their stage. */
  setAside: string[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Stage 3B and the players trapped inside a barrow have their own staging areas. */
  split: boolean;
  activeArea?: string;
  /** Stage 3B's area (which stays in play without players) and each barrow. */
  areas: FliesSpidersArea[];
  /** Areas that have resolved their quest this phase. */
  resolvedAreas: string[];
  /** Areas that have made their travel decision this phase. */
  travelPassedAreas: string[];
  /** 4A: areas whose quest phase ended this round without resolving the quest. */
  ended: string[];
  /** 4B defeated: these barrows return to stage 3B at the beginning of the travel phase. */
  escaped: string[];
  /** Allies facedown under an Ancient Barrow. */
  buried: FogBarrowBuried[];
  /** Tom Bombadil: his end-of-round discard and shuffle are pending this round. */
  tom: boolean;
  /** Frozen by Fear: until the end of this round, these players cannot trigger Actions or Responses. */
  frozen: { round: number; players: number[] };
}
