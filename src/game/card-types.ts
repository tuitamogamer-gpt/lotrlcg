import { card } from "./cards";
import type { Unit } from "./types";

/** Printed definitions stay immutable when Sword-thain changes a card in play. */
export function unitType(u: Unit): string {
  const printed = card(u.code).type_code;
  return printed === "ally" &&
    u.attachments.some((a) => a.code === "10149" && !a.blanked && !a.facedown)
    ? "hero"
    : printed;
}

export const isHero = (u: Unit) => unitType(u) === "hero";
export const isAlly = (u: Unit) =>
  ["ally", "objective-ally"].includes(unitType(u));
