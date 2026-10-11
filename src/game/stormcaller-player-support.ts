import definitions from "../data/stormcaller-player-cards.json";
import type { Card } from "./types";

export const STORMCALLER_PLAYER_CARDS = definitions as Card[];
export const STORMCALLER_PLAYER_CODES = STORMCALLER_PLAYER_CARDS.map(
  (c) => c.code,
);
export const STORMCALLER_PLAYER = {
  denethor: "12001",
  rod: "12002",
  service: "12003",
  azain: "12004",
  lastStand: "12005",
  glorfindel: "12006",
  tides: "12007",
  caregiver: "12008",
  heed: "12009",
  guardian: "12010",
  vanish: "12011",
} as const;
