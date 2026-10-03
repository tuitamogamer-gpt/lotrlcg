import definitions from "../data/morgul-player-cards.json";
import type { Card } from "./types";

export const MORGUL_PLAYER_CARDS = definitions as Card[];
export const MORGUL_PLAYER_CODES = new Set(
  MORGUL_PLAYER_CARDS.map((c) => c.code),
);
