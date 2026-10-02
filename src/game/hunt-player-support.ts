import definitions from "../data/hunt-player-cards.json";
import type { Card } from "./types";

/** Explicit reviewed scripts, independent of the reference catalog and registry. */
export const HUNT_PLAYER_CARDS = definitions as Card[];
export const HUNT_PLAYER_CODES = new Set(HUNT_PLAYER_CARDS.map((c) => c.code));
