import definitions from "../data/dwarf-player-cards.json";
import type { Card } from "./types";

/** The official Dwarves of Durin starting list's active and triggered identities. */
export const DWARF_PLAYER_CARDS = definitions as Card[];
export const DWARF_PLAYER_CODES = new Set(
  DWARF_PLAYER_CARDS.map((c) => c.code),
);
