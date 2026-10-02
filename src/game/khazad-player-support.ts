import definitions from "../data/khazad-player-cards.json";
import type { Card } from "./types";
/** Khazad-dûm's full thirteen designs; reviewed Dwarf rules and Boots are reused. */
export const KHAZAD_PLAYER_CARDS = definitions as Card[];
export const KHAZAD_PLAYER_CODES = new Set(
  KHAZAD_PLAYER_CARDS.map((c) => c.code),
);
