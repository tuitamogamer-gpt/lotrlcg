import type { Unit } from "./types";
/** A per-round mark on a unit (Ramming Ship, Wicked Cove's shadow). */
export interface HuntDreadnaughtMark {
  id: string;
  round: number;
}
/**
 * Physical and continuous state for The Hunt for the Dreadnaught (one group;
 * the global values count the players of this group).
 */
export interface HuntDreadnaughtState {
  /** The chosen Setup card (the engine's easy mode takes Easy Mode). */
  mode: "easy" | "standard" | "hard" | null;
  /** The current quest card: Searching the High Seas, then Destroy the Dreadnaught. */
  currentQuest: string;
  /** The fleet: each player's chosen unique ship-objective (Basic side). */
  fleet: { player: number; code: string }[];
  /** True once every player has chosen a ship (before the starting hands). */
  fleetReady: boolean;
  /** The Corsair deck (top first) and its own discard pile. */
  corsairDeck: string[];
  corsairDiscard: string[];
  /**
   * Out of play: the 7 unique enemies until they enter play, the unused
   * ship-objectives, the Gondorian Warships and the cards Easy Mode sets aside.
   */
  setAside: string[];
  /** Removed from the game: the two Setup cards not chosen. */
  removed: string[];
  /** Progress placed on the current quest this round (5 per player). */
  questProgress: { round: number; amount: number } | null;
  /** Damage the Dreadnaught took this round (5 per player). */
  dreadDamage: { round: number; amount: number } | null;
  /** The Setup card's Quest Action (group limit once per game). */
  questActionUsed: boolean;
  /** Corsair Skiff and War Galley: Boarding gained when they engaged. */
  boarding: { id: string; value: number }[];
  /** Ballista Barrage: copies revealed this round (each Ship enemy gains Archery 2 per copy). */
  ballista: { round: number; count: number } | null;
  /** Overworked: the round in which each non-Ship ally's text box is blank. */
  overworked: number | null;
  /** Ramming Ship: +4 attack until the end of the round. */
  ramming: HuntDreadnaughtMark[];
  /** Wicked Cove's shadow: immune to player card effects and +2 defense this round. */
  cove: HuntDreadnaughtMark[];
  /** Hydraken's additional attack: the round it was made (limit once per round). */
  hydraken: number | null;
  /** Ophidian: the round a character attacked it (no more than 1 each round). */
  ophidian: { id: string; round: number }[];
  /** Hard Mode: threat each player reduced this round. */
  threatReduced: { player: number; round: number; amount: number }[];
  /** Destroy the Dreadnaught (2B): players who canceled its attack this round. */
  cancelled: { player: number; round: number }[];
  /** Hydraken's additional attack: shadow cards dealt to it as it begins. */
  extraShadows: { id: string; count: number }[];
  /** Golden Wing's Setup: heroes that gain ranged until the end of the game. */
  ranged: string[];
  /** Eithiliant's Setup: a hero that gains another hero's printed Traits. */
  traits: { id: string; traits: string[] }[];
  /** Captain of the Haven eliminates these players. */
  eliminated: number[];
  /** Encounter treacheries that left the deck and are still resolving. */
  resolving: Unit[];
  /** Corsair Skirmishers destroyed as enemies, waiting for the capture response. */
  capture: Unit[];
}
