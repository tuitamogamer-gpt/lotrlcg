import definitions from "../data/temple-player-cards.json";
import type { Card } from "./types";

export const TEMPLE_PLAYER_CARDS = definitions as Card[];
export const TEMPLE_PLAYER_CODES = TEMPLE_PLAYER_CARDS.map((c) => c.code);
export const TEMPLE_PLAYER = {
  elfhelm: "12057",
  ceorl: "12058",
  destrier: "12059",
  deorwine: "12060",
  wrath: "12061",
  outrider: "12062",
  party: "12063",
  nets: "12064",
  arrows: "12065",
  miner: "12066",
} as const;
