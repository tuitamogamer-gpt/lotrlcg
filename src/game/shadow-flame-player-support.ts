import definitions from "../data/shadow-flame-player-cards.json";
import type { Card } from "./types";
export const SHADOW_FLAME_PLAYER_CARDS = definitions as Card[];
export const SHADOW_FLAME_PLAYER_CODES = new Set(
  SHADOW_FLAME_PLAYER_CARDS.map((c) => c.code),
);
