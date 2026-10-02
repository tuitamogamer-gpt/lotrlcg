import definitions from "../data/rohan-player-cards.json";
import type { Card } from "./types";
export const ROHAN_PLAYER_CARDS = definitions as Card[];
export const ROHAN_PLAYER_CODES = new Set(
  ROHAN_PLAYER_CARDS.map((c) => c.code),
);
