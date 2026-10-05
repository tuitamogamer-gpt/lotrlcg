import definitions from "../data/osgiliath-player-cards.json";
import type { Card } from "./types";
export const OSGILIATH_PLAYER_CARDS = definitions as Card[];
export const OSGILIATH_PLAYER_CODES = new Set(
  OSGILIATH_PLAYER_CARDS.map((c) => c.code),
);
