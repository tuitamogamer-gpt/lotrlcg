import definitions from "../data/road-player-cards.json";
import type { Card } from "./types";
export const ROAD_PLAYER_CARDS = definitions as Card[];
export const ROAD_PLAYER_CODES = new Set(ROAD_PLAYER_CARDS.map((c) => c.code));
