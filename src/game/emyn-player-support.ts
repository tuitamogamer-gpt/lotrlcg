import definitions from "../data/emyn-player-cards.json";
import type { Card } from "./types";

/** All ten exact player designs from The Hills of Emyn Muil. */
export const EMYN_PLAYER_CARDS = definitions as Card[];
export const EMYN_PLAYER_CODES = new Set(EMYN_PLAYER_CARDS.map((c) => c.code));
