import definitions from "../data/marsh-player-cards.json";
import type { Card } from "./types";

/** All ten exact player identities from The Dead Marshes. */
export const MARSH_PLAYER_CARDS = definitions as Card[];
export const MARSH_PLAYER_CODES = new Set(
  MARSH_PLAYER_CARDS.map((c) => c.code),
);
