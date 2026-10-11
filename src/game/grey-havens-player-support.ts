import definitions from "../data/grey-havens-player-cards.json";
import type { Card } from "./types";

export const GREY_HAVENS_PLAYER_CARDS = definitions as Card[];
export const GREY_HAVENS_PLAYER_CODES = GREY_HAVENS_PLAYER_CARDS.map(
  (c) => c.code,
);
export const GREY_HAVENS = {
  cirdan: "11001",
  galdor: "11002",
  seaWatcher: "11003",
  volley: "11004",
  hook: "11005",
  warden: "11006",
  anchor: "11007",
  compass: "11008",
  navigator: "11009",
  star: "11010",
  almanac: "11011",
  sailor: "11012",
  flight: "11013",
  sea: "11014",
  narya: "11015",
} as const;
