import definitions from "../data/druadan-player-cards.json";
import type { Card } from "./types";
export const DRUADAN_PLAYER_CARDS = definitions as Card[];
export const DRUADAN_PLAYER_CODES = new Set(
  DRUADAN_PLAYER_CARDS.map((c) => c.code),
);
