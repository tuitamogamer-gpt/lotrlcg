import definitions from "../data/gondor-player-cards.json";
import type { Card } from "./types";

/** The sixteen remaining identities needed by the printed Defenders of Gondor deck. */
export const GONDOR_PLAYER_CARDS = definitions as Card[];
export const GONDOR_PLAYER_CODES = new Set(
  GONDOR_PLAYER_CARDS.map((c) => c.code),
);
