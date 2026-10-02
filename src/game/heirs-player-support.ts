import definitions from "../data/heirs-player-cards.json";
import type { Card } from "./types";
export const HEIRS_PLAYER_CARDS = definitions as Card[];
export const HEIRS_PLAYER_CODES = new Set(
  HEIRS_PLAYER_CARDS.map((c) => c.code),
);
