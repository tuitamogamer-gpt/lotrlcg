import definitions from "../data/rhosgobel-player-cards.json";
import type { Card } from "./types";

/** Exact printed identities; mechanics are implemented in rhosgobel-player-cards. */
export const RHOSGOBEL_PLAYER_CARDS = definitions as Card[];
export const RHOSGOBEL_PLAYER_CODES = new Set(
  RHOSGOBEL_PLAYER_CARDS.map((c) => c.code),
);
