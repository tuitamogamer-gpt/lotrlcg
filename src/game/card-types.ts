import { card } from "./cards";
import { hasEnemyCondition } from "./enemy-conditions";
import type { Unit } from "./types";

/** Printed definitions stay immutable when Sword-thain changes a card in play. */
export function unitType(u: Unit): string {
  const printed = card(u.code).type_code;
  if (hasEnemyCondition(u)) return "enemy";
  if (printed === "objective-hero") return "hero";
  if (u.code === "19065" && u.eredThalionHero) return "hero";
  if (u.cobasShipObjective) return "ship-objective";
  // Messenger of the King: the attached ally loses the ally type and gains the hero type.
  if (printed === "ally" && u.attachments.some((a) => a.code === "22134"))
    return "hero";
  return printed === "ally" &&
    u.attachments.some((a) => a.code === "10149" && !a.blanked && !a.facedown)
    ? "hero"
    : printed;
}

export const isHero = (u: Unit) => unitType(u) === "hero";
export const isAlly = (u: Unit) =>
  ["ally", "objective-ally", "ship-objective"].includes(unitType(u));
