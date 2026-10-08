import type { Card } from "./types";

/** A rules-defined enemy, not an extra physical encounter card. Its player face stays hidden. */
export const DREAD_REANIMATED_CARD: Card = {
  code: "dread:reanimated-dead",
  name: "Reanimated Dead",
  type_code: "enemy",
  sphere_code: "encounter",
  traits: "Undead.",
  engagement: 0,
  threat: 2,
  attack: 2,
  defense: 2,
  health: 2,
  text: "A reanimated player card is facedown. If it leaves play for any reason, place it in its owner's discard pile.",
  pack_code: "TDR",
  pack_name: "The Dread Realm",
  quantity: 0,
  source: "ffg",
  official: true,
  imagesrc: "/art/premium/fellowship-back.webp",
};
