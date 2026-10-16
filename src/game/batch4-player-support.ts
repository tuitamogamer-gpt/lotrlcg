import blackSerpent from "../data/black-serpent-player-cards.json";
import cirithGurat from "../data/cirith-gurat-player-cards.json";
import crossingsPoros from "../data/crossings-poros-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { card } from "./cards";
import {
  allCharacters,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
export const BATCH4_PLAYER_CARDS = [
  ...blackSerpent,
  ...cirithGurat,
  ...crossingsPoros,
] as Card[];
export const BATCH4_PLAYER_CODES = BATCH4_PLAYER_CARDS.map((c) => c.code);
export const BATCH4_PLAYER = {
  fastred: "17081",
  hope: "17082",
  burst: "17083",
  defender: "17084",
  oath: "17085",
  scout: "17086",
  rally: "17087",
  pipe: "17088",
  toby: "17089",
  refugee: "17090",
  folco: "17109",
  daleKnight: "17110",
  noble: "17111",
  riddermark: "17112",
  fierce: "17113",
  survivor: "17114",
  heirs: "17115",
  leaflock: "17116",
  blade: "17117",
  armory: "17118",
  quickbeam: "17135",
  halfast: "17136",
  bulwark: "17137",
  beorning: "17138",
  followed: "17139",
  flight: "17140",
  ranger: "17141",
  dam: "17142",
  ring: "17143",
  wind: "17144",
} as const;
export const BATCH4_REFUGEE_COST = "phase:batch4-refugee:";
export const batch4SideQuests = (s: GameState) =>
  (s.victoryCards ?? []).filter((code) =>
    ["player-side-quest", "encounter-side-quest"].includes(
      card(code).type_code,
    ),
  ).length;
export function batch4PlayerStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0 };
  if (playerCardImmune(u)) return result;
  if (
    (s.victoryCards ?? []).includes(BATCH4_PLAYER.rally) &&
    card(u.code).type_code === "hero"
  )
    result.will++;
  for (const a of u.attachments.filter((a) => !a.blanked && !a.facedown))
    if (a.code === BATCH4_PLAYER.blade)
      result.attack += Math.min(3, batch4SideQuests(s));
  if (u.blanked) return result;
  const p = seatView(s, ownerOf(s, u));
  if (u.code === BATCH4_PLAYER.defender)
    result.defense += Math.min(4, Math.floor(p.threat / 10));
  if (u.code === BATCH4_PLAYER.survivor && !p.hand.length) {
    result.will++;
    result.attack++;
    result.defense++;
  }
  if (u.code === BATCH4_PLAYER.leaflock)
    result.will += Math.min(
      4,
      allCharacters(s).filter(
        (x) =>
          ownerOf(s, x) === ownerOf(s, u) && x.damage > 0 && hasTrait(x, "Ent"),
      ).length,
    );
  return result;
}
export function batch4PlayerCostReduction(s: GameState, c: Card) {
  let n = c.code === BATCH4_PLAYER.halfast ? batch4SideQuests(s) : 0;
  if (
    c.type_code === "ally" &&
    (c.traits ?? "").split(".").some((t) => t.trim() === "Harad")
  )
    n += s.used.filter((k) => k.startsWith(BATCH4_REFUGEE_COST)).length;
  return n;
}
export function batch4PlayerStartingThreat(s: GameState, u: Unit) {
  return u.code === BATCH4_PLAYER.folco
    ? s.heroes.filter((h) => hasTrait(h, "Hobbit")).length
    : 0;
}
export function batch4PlayerStagingReduction(s: GameState) {
  return allEngaged(s).reduce(
    (n, u) =>
      n +
      u.attachments
        .filter(
          (a) =>
            a.code === BATCH4_PLAYER.followed &&
            !a.blanked &&
            !a.facedown &&
            attachmentController(s, u, a) === ownerOf(s, u),
        )
        .reduce((total) => total + (card(u.code).threat ?? 0), 0),
    0,
  );
}
export function batch4PlayerSideQuestToDiscard(s: GameState, u: Unit) {
  if (
    u.code !== BATCH4_PLAYER.rally ||
    !(s.victoryCards ?? []).includes(u.code)
  )
    return false;
  forOwner(s, u.owner ?? u.controller ?? firstPlayer(s), () =>
    s.discard.push(u.code),
  );
  return true;
}
