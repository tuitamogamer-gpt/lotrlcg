// Original printings used in the exact official Elves of Lórien starting list.
import definitions from "../data/elf-player-cards.json";
import type { Card } from "./types";
export const ELF_PLAYER_CARDS = definitions as Card[];
export const ELF_PLAYER_CODES = ELF_PLAYER_CARDS.map((c) => c.code);
