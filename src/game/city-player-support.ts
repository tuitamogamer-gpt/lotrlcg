import definitions from "../data/city-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { card } from "./cards";
import { isAlly, isHero } from "./card-types";
import { hasTrait } from "./expansion-passives";
import { attachmentController, ownerOf, seatView } from "./table";

export const CITY_PLAYER_CARDS = definitions as Card[];
export const CITY_PLAYER_CODES = CITY_PLAYER_CARDS.map((c) => c.code);
export const CITY_PLAYER = {
  imrahil: "12138",
  knight: "12139",
  line: "12140",
  soldier: "12141",
  sulien: "12142",
  presence: "12143",
  guardian: "12144",
  spear: "12145",
  prince: "12146",
} as const;
export const CITY_SOLDIER_DISCOUNT = "phase:city:soldier-discount";
/** Ranger Spear's ordinary +1 is registered with its attachment rule. */
export function cityPlayerAttackBonus(_s: GameState, u: Unit, enemy: Unit) {
  return enemy.attachments.length
    ? u.attachments.filter(
        (a) => a.code === CITY_PLAYER.spear && !a.blanked && !a.facedown,
      ).length
    : 0;
}
export function cityPlayerResourceBonus(s: GameState, u: Unit) {
  if (!isHero(u)) return 0;
  return u.attachments
    .filter((a) => a.code === CITY_PLAYER.prince && !a.blanked && !a.facedown)
    .filter((a) => {
      // Player attachments follow the bearer's controller; their physical owner may differ.
      const seat = seatView(s, attachmentController(s, u, a) ?? ownerOf(s, u));
      const spheres = new Set(
        seat.allies
          .filter((ally) => isAlly(ally) && hasTrait(ally, "Outlands"))
          .map((ally) => card(ally.code).sphere_code)
          .filter((sphere) =>
            ["leadership", "tactics", "spirit", "lore"].includes(sphere),
          ),
      );
      return spheres.size === 4;
    }).length;
}
export function cityPlayerCostReduction(s: GameState, c: Card) {
  return c.sphere_code === "tactics"
    ? s.used.filter((key) => key === CITY_SOLDIER_DISCOUNT).length
    : 0;
}
/** Each registered response applies to the very next Tactics play, even a zero-cost one. */
export function cityPlayerCardPlayed(s: GameState, c: Card) {
  if (c.sphere_code === "tactics")
    s.used.splice(
      0,
      s.used.length,
      ...s.used.filter((key) => key !== CITY_SOLDIER_DISCOUNT),
    );
}
export const cityPlayerCardPaid = cityPlayerCardPlayed;
