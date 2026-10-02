import definitions from "../data/steward-player-cards.json";
import type { Card } from "./types";
export const STEWARD_PLAYER_CARDS = definitions as Card[];
export const STEWARD_PLAYER_CODES = new Set(
  STEWARD_PLAYER_CARDS.map((c) => c.code),
);
