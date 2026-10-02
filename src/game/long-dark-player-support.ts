import definitions from "../data/long-dark-player-cards.json";
import type { Card } from "./types";
export const LONG_DARK_PLAYER_CARDS = definitions as Card[];
export const LONG_DARK_PLAYER_CODES = new Set(
  LONG_DARK_PLAYER_CARDS.map((c) => c.code),
);
