import definitions from "../data/foundations-player-cards.json";
import type { Card } from "./types";
export const FOUNDATIONS_PLAYER_CARDS = definitions as Card[];
export const FOUNDATIONS_PLAYER_CODES = new Set(
  FOUNDATIONS_PLAYER_CARDS.map((c) => c.code),
);
