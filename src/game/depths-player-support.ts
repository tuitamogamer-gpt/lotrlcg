import definitions from "../data/depths-player-cards.json";
import type { Card, GameState, Unit } from "./types";

export const DEPTHS_PLAYER_CARDS = definitions as Card[];
export const DEPTHS_PLAYER_CODES = DEPTHS_PLAYER_CARDS.map((c) => c.code);
export const DEPTHS_PLAYER = {
  lanwyn: "12030",
  eldahir: "12031",
  wisdom: "12032",
  ironsmith: "12033",
  raiment: "12034",
  sam: "12035",
  elevenses: "12036",
  explorer: "12037",
  guarded: "12038",
} as const;

/** Lasting round effects remain after source text is blanked or control changes. */
export function depthsPlayerStats(s: GameState, u: Unit) {
  const key = `round:depths:sam-bonus:${u.id}`;
  const active = s.table?.active ?? 0;
  const bonus =
    u.code === DEPTHS_PLAYER.sam &&
    (s.used.includes(key) ||
      !!s.table?.seats.some((p, i) => i !== active && p.used.includes(key)));
  return { will: bonus ? 1 : 0, attack: bonus ? 1 : 0, defense: bonus ? 1 : 0 };
}
