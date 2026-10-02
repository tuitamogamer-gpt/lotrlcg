import definitions from "../data/watcher-player-cards.json";
import type { Card } from "./types";
export const WATCHER_PLAYER_CARDS = definitions as Card[];
export const WATCHER_PLAYER_CODES = new Set(
  WATCHER_PLAYER_CARDS.map((c) => c.code),
);
