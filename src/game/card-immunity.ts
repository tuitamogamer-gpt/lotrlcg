import { card } from "./cards";
import type { Unit } from "./types";
/** Scenario-granted immunity survives blanking of the target's own text box. */
export const playerCardImmune = (u: Unit) =>
  !!u.immuneToPlayerEffects ||
  (!u.blanked &&
    /immune to (?:player )?card effects/i.test(
      (card(u.code).text ?? "").replace(/<[^>]*>/g, ""),
    ));
