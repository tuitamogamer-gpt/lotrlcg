import definitions from "../data/carrock-player-cards.json";
import type { Card } from "./types";

/** All ten printed player rules from Conflict at the Carrock, explicitly reviewed. */
export const CARROCK_PLAYER_CARDS = definitions as Card[];
export const CARROCK_PLAYER_CODES = new Set(
  CARROCK_PLAYER_CARDS.map((c) => c.code),
);
