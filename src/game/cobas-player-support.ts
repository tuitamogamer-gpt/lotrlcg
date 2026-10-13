import definitions from "../data/cobas-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { ownerOf, seatView } from "./table";

export const COBAS_PLAYER_CARDS = definitions as Card[];
export const COBAS_PLAYER_CODES = COBAS_PLAYER_CARDS.map((c) => c.code);
export const COBAS_PLAYER = {
  naasiyah: "12109",
  rune: "12110",
  terrible: "12111",
  veteran: "12112",
  guard: "12113",
  knife: "12114",
  linhir: "12115",
  windfola: "12116",
  ioreth: "12117",
  houses: "12118",
  justice: "12119",
} as const;

/** Printed statistics follow the current controller's discard pile. */
export function cobasPlayerStats(s: GameState, u: Unit) {
  const veteran =
    u.code === COBAS_PLAYER.veteran && !u.blanked
      ? seatView(s, ownerOf(s, u)).discard.filter((c) => c === u.code).length
      : 0;
  return {
    attack: veteran,
    defense: veteran,
    health:
      2 *
      u.attachments.filter((a) => a.code === COBAS_PLAYER.guard && !a.blanked)
        .length,
    will: u.attachments.filter(
      (a) => a.code === COBAS_PLAYER.windfola && !a.blanked,
    ).length,
  };
}
