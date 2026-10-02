import definitions from "../data/redhorn-player-cards.json";
import type { Card } from "./types";
export const REDHORN_PLAYER_CARDS = definitions as Card[];
export const REDHORN_PLAYER_CODES = new Set(
  REDHORN_PLAYER_CARDS.map((c) => c.code),
);
