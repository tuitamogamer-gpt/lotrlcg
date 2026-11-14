import type { GameState } from "./types";

/**
 * Dire (The Mountain of Fire): while the main quest has the dire keyword,
 * each player's threat elimination level is 99, his threat cannot be reduced
 * by more than 1 each round by non-boon player card effects, and Valour
 * effects trigger at 80 threat instead of 40. Kept free of runtime
 * dependencies, like the elimination level it changes.
 */
export const direQuest = (s: GameState) => !!s.blackGate;
export const DIRE_ELIMINATION = 99;
/** The threat at which Valour effects trigger. */
export const valourThreat = (s: GameState) => (direQuest(s) ? 80 : 40);
/** The used key counting a player's Dire threat reduction this round. */
export const DIRE_REDUCED = "round:dire-threat-reduced";
