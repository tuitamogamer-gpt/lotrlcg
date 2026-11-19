import { card } from "./cards";
import type { Unit } from "./types";
import { DC, dcIs } from "./dreamchaser-campaign-support";
/** The printed text, without quoted text it grants under a condition. */
const ownText = (u: Unit) =>
  (card(u.code).text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/"[^"]*"|“[^”]*”/g, "");
/** Scenario-granted immunity survives blanking of the target's own text box. */
export const playerCardImmune = (u: Unit) =>
  !!u.immuneToPlayerEffects ||
  (u.code === "21072.B" && !u.blanked) ||
  // Black Key (burden): "Attached enemy … gains immune to player card effects."
  u.attachments.some((a) => !a.blanked && dcIs(a.code, DC.keyBurden)) ||
  (!u.blanked &&
    /immune to (?:non-\[fellowship\] )?(?:player )?card effects/i.test(
      ownText(u),
    ));
/** "Immune to non-[fellowship] player card effects": Fellowship cards still affect it. */
export const fellowshipCardsAffect = (u: Unit) =>
  !u.immuneToPlayerEffects &&
  !u.blanked &&
  /immune to non-\[fellowship\] player card effects/i.test(ownText(u));
