import definitions from "../data/blood-gondor-player-cards.json";
import type { Card } from "./types";
export const BLOOD_PLAYER_CARDS = definitions as Card[];
export const BLOOD_PLAYER_CODES = new Set(
  BLOOD_PLAYER_CARDS.map((c) => c.code),
);
