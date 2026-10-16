import definitions from "../data/wilds-rhovanion-player-cards.json";
import type { Attachment, Card, GameState, Unit } from "./types";
import { card } from "./cards";
import { allCharacters, ownerOf, playerOrder, seatView } from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";

export const WILDS_PLAYER_CARDS = definitions as Card[];
export const WILDS_PLAYER_CODES = WILDS_PLAYER_CARDS.map((c) => c.code);
export const WILDS_PLAYER = {
  brand: "18001",
  bard: "18002",
  sentry: "18003",
  lookout: "18004",
  warrior: "18005",
  trader: "18006",
  hauberk: "18007",
  king: "18008",
  bow: "18009",
  map: "18010",
  necklace: "18011",
  traffic: "18012",
  arms: "18013",
  valour: "18014",
  barter: "18015",
} as const;
export const WILDS_KING = "phase:wilds-king:";
export const WILDS_BARTER = "phase:wilds-barter:";
export const WILDS_VALOUR = "attack:wilds-valour:";
export const wildsPlayerAttachment = (a: Attachment) =>
  !a.facedown &&
  !a.namelessCard &&
  card(a.code).sphere_code !== "encounter" &&
  card(a.code).type_code === "attachment";
const equipped = (u: Unit, trait: string) =>
  u.attachments.some((a) => attachmentHasTrait(a, trait));
const values = (s: GameState, prefix: string) =>
  s.used
    .filter((k) => k.startsWith(prefix))
    .reduce((n, k) => n + (Number(k.slice(prefix.length)) || 0), 0);
export function wildsPlayerStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0, health: 0 };
  if (playerCardImmune(u)) return result;
  if (hasTrait(u, "Dale") && u.attachments.some(wildsPlayerAttachment))
    result.will += allCharacters(s).filter(
      (h) =>
        h.code === WILDS_PLAYER.brand &&
        !h.blanked &&
        ownerOf(s, h) === ownerOf(s, u),
    ).length;
  if (!u.blanked) {
    if (u.code === WILDS_PLAYER.lookout && equipped(u, "Item")) result.will++;
    if (u.code === WILDS_PLAYER.sentry && equipped(u, "Armor"))
      result.defense++;
    if (u.code === WILDS_PLAYER.warrior && equipped(u, "Weapon"))
      result.attack++;
  }
  result.will +=
    2 *
    u.attachments.filter(
      (a) => a.code === WILDS_PLAYER.necklace && !a.blanked && !a.facedown,
    ).length;
  const boosts = playerOrder(s).reduce(
    (n, p) =>
      n +
      seatView(s, p).used.filter((k) => k.startsWith(WILDS_VALOUR + u.id + ":"))
        .length,
    0,
  );
  result.attack += 3 * boosts;
  result.defense += 3 * boosts;
  return result;
}
export function wildsPlayerQuestExhausts(_s: GameState, u: Unit) {
  return !(
    u.code === WILDS_PLAYER.lookout &&
    !u.blanked &&
    equipped(u, "Item")
  );
}
export function wildsPlayerKeyword(u: Unit, keyword: string) {
  return (
    !u.blanked &&
    ((keyword.toLowerCase() === "sentinel" &&
      u.code === WILDS_PLAYER.sentry &&
      equipped(u, "Armor")) ||
      (keyword.toLowerCase() === "ranged" &&
        u.code === WILDS_PLAYER.warrior &&
        equipped(u, "Weapon")))
  );
}
export function wildsPlayerCostReduction(s: GameState, c: Card, target?: Unit) {
  let discount = 0;
  const traits = (c.traits ?? "").split(".").map((v) => v.trim());
  if (c.type_code === "attachment") {
    discount += values(s, WILDS_BARTER);
    if (
      target &&
      !target.blanked &&
      ((target.code === WILDS_PLAYER.sentry && traits.includes("Armor")) ||
        (target.code === WILDS_PLAYER.warrior && traits.includes("Weapon")))
    )
      discount++;
  }
  if (c.type_code === "ally" && traits.includes("Dale"))
    discount += values(s, WILDS_KING);
  return discount;
}
export function wildsPlayerNoResourceMatch(s: GameState, c: Card) {
  return (
    c.type_code === "ally" &&
    (c.traits ?? "").split(".").some((t) => t.trim() === "Dale") &&
    s.used.some((k) => k.startsWith(WILDS_KING))
  );
}
export function wildsPlayerPayer(h: Unit, c: Card) {
  return (
    h.code === WILDS_PLAYER.bard &&
    !h.blanked &&
    c.type_code === "attachment" &&
    (c.traits ?? "").split(".").some((t) => t.trim() === "Item") &&
    ["leadership", "spirit", "lore", "tactics", "neutral"].includes(
      c.sphere_code,
    )
  );
}
export function wildsPlayerResourceBonus(u: Unit) {
  return u.attachments.filter(
    (a) => a.code === WILDS_PLAYER.necklace && !a.blanked && !a.facedown,
  ).length;
}
