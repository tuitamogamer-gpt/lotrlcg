import definitions from "../data/collector-player-cards.json";
import type { Card } from "./types";

export const COLLECTOR_PLAYER_CARDS = definitions as Card[];
export const COLLECTOR_PLAYER_CODES = new Set(
  COLLECTOR_PLAYER_CARDS.map((c) => c.code),
);
