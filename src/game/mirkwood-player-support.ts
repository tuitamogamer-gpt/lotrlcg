import definitions from "../data/mirkwood-player-cards.json";
import type { Card } from "./types";

/** Return to Mirkwood's ten identities; Dáin reuses the verified Dwarf passive. */
export const MIRKWOOD_PLAYER_CARDS = definitions as Card[];
export const MIRKWOOD_PLAYER_CODES = new Set(
  MIRKWOOD_PLAYER_CARDS.map((c) => c.code),
);
