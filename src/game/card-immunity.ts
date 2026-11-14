import { card } from "./cards";
import type { Unit } from "./types";
/** The printed text, without quoted text it grants under a condition. */
const ownText = (u: Unit) =>
  (card(u.code).text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/"[^"]*"|“[^”]*”/g, "");
/** Scenario-granted immunity survives blanking of the target's own text box. */
export const playerCardImmune = (u: Unit) =>
  !!u.immuneToPlayerEffects ||
  (u.code === "21072.B" && !u.blanked) ||
  (!u.blanked &&
    /immune to (?:non-\[fellowship\] )?(?:player )?card effects/i.test(
      ownText(u),
    ));
/** "Immune to non-[fellowship] player card effects": Fellowship cards still affect it. */
export const fellowshipCardsAffect = (u: Unit) =>
  !u.immuneToPlayerEffects &&
  !u.blanked &&
  /immune to non-\[fellowship\] player card effects/i.test(ownText(u));
