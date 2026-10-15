import definitions from "../data/harad-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { card } from "./cards";

export const HARAD_PLAYER_CARDS = definitions as Card[];
export const HARAD_PLAYER_CODES = HARAD_PLAYER_CARDS.map((c) => c.code);
export const HARAD_PLAYER = {
  gimli: "16001",
  legolas: "16002",
  archer: "16003",
  guard: "16004",
  bounder: "16005",
  dunadan: "16006",
  friendship: "16007",
  wellWarned: "16008",
  dour: "16009",
  shield: "16010",
  knife: "16011",
  road: "16012",
  storm: "16013",
} as const;
export const HARAD_GUARD_COST = "phase:harad:guard-cost:";
export const HARAD_ALLY_PLAYED = "round:harad:ally-played";

/** Both encounter and player side quests count; ordinary quest stages do not. */
export const haradSideQuestCount = (s: GameState) =>
  (s.victoryCards ?? []).filter((code) =>
    ["player-side-quest", "encounter-side-quest"].includes(
      card(code).type_code,
    ),
  ).length;

export const haradPlayerNoExhaustDefense = (s: GameState, u: Unit) =>
  u.code === HARAD_PLAYER.dunadan && !u.blanked && haradSideQuestCount(s) > 0;

/** The exemption removes resource matching, never the resource cost or spending restrictions. */
export const haradStormNoResourceMatch = (s: GameState, c: Card) =>
  c.type_code === "ally" &&
  (s.victoryCards ?? []).includes(HARAD_PLAYER.storm) &&
  !s.used.includes(HARAD_ALLY_PLAYED);

/** An earlier ally play still counts if The Storm Comes is defeated later in that round. */
export function haradPlayerCardPlayed(s: GameState, c: Card) {
  if (c.type_code === "ally" && !s.used.includes(HARAD_ALLY_PLAYED))
    s.used.push(HARAD_ALLY_PLAYED);
}

/** The planning preview offers the optional discount; a confirmed allocation overrides it. */
export function haradPlayerCostReduction(s: GameState, c: Card) {
  if (
    c.code !== HARAD_PLAYER.guard ||
    c.playOrigin === "deck" ||
    c.playOrigin === "discard"
  )
    return 0;
  const marker = s.used.find((key) => key.startsWith(HARAD_GUARD_COST));
  return marker
    ? Number(marker.slice(HARAD_GUARD_COST.length))
    : s.deck.length >= 2 && s.hand.some((u) => u.code === c.code)
      ? 2
      : 0;
}
