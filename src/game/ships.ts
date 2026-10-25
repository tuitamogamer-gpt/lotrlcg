import { card } from "./cards";
import type { Attachment, GameState, Unit } from "./types";
import { allCharacters, allHeroes, ownerOf, activeSeat } from "./table";

/** The original Grey Havens insert treats these printed kinds as allies/enemies. */
export const isShipObjective = (u: {
  code: string;
  cobasShipObjective?: boolean;
}) => !!u.cobasShipObjective || card(u.code).type_code === "ship-objective";
export const isShipEnemy = (u: {
  code: string;
  cobasShipObjective?: boolean;
}) => !u.cobasShipObjective && card(u.code).type_code === "ship-enemy";
export const isEnemy = (u: {
  code: string;
  cobasShipObjective?: boolean;
  attachments?: Attachment[];
}) =>
  !u.cobasShipObjective &&
  (["enemy", "ship-enemy"].includes(card(u.code).type_code) ||
    !!u.attachments?.some(
      (a) =>
        a.code === "octgn:617bc2e6-05a9-4c99-b3ff-8304ecb6ef32" && !a.blanked,
    ));

/** Ordinary characters may attack ships; ships may only attack other ships. */
export const shipCanAttack = (enemy: Unit, attacker: Unit) =>
  !isShipObjective(attacker) || isShipEnemy(enemy);

/** Neither half of the fleet may defend against the other printed enemy kind. */
export const shipCanDefend = (enemy: Unit, defender: Unit) =>
  isShipEnemy(enemy) === isShipObjective(defender);

/** Undefended ship damage is assigned to one ship of the attacked player. */
export function shipUndefendedTargets(
  s: GameState,
  enemy: Unit,
  player = activeSeat(s),
) {
  return (
    isShipEnemy(enemy) ? allCharacters(s).filter(isShipObjective) : allHeroes(s)
  ).filter((u) => ownerOf(s, u) === player);
}
