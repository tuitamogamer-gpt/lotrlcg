import { card } from "./cards";
import type { Unit } from "./types";

/** Printed definitions stay immutable when Sword-thain changes a card in play. */
export function unitType(u: Unit): string {
  const printed = card(u.code).type_code;
  if (
    u.attachments.some(
      (a) =>
        a.code === "octgn:617bc2e6-05a9-4c99-b3ff-8304ecb6ef32" && !a.blanked,
    )
  )
    return "enemy";
  if (printed === "objective-hero") return "hero";
  if (u.code === "19065" && u.eredThalionHero) return "hero";
  if (u.cobasShipObjective) return "ship-objective";
  return printed === "ally" &&
    u.attachments.some((a) => a.code === "10149" && !a.blanked && !a.facedown)
    ? "hero"
    : printed;
}

export const isHero = (u: Unit) => unitType(u) === "hero";
export const isAlly = (u: Unit) =>
  ["ally", "objective-ally", "ship-objective"].includes(unitType(u));
