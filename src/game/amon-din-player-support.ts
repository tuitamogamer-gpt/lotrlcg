import definitions from "../data/amon-din-player-cards.json";
import type { Card } from "./types";
export const AMON_PLAYER_CARDS = definitions as Card[];
export const AMON_PLAYER_CODES = new Set(AMON_PLAYER_CARDS.map((c) => c.code));
