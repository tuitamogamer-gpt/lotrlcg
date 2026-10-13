import { card, name } from "./cards";
import { destroy } from "./board";
import { log } from "./core";
import { globalCharacters } from "./table";
import type { GameState, Unit } from "./types";

/** RR p19: a unique encounter character takes precedence over a player copy.
 * This is an entry/face-change rule, not a restriction on the player's deck.
 * Invoked when an encounter card enters or becomes an objective character.
 */
export function encounterCharacterEntered(s: GameState, entering: Unit) {
  const encounter = card(entering.code);
  if (
    !encounter.is_unique ||
    encounter.sphere_code !== "encounter" ||
    !["hero", "ally", "objective-ally"].includes(encounter.type_code)
  )
    return;
  const conflicts = globalCharacters(s).filter((u) => {
    const player = card(u.code);
    return (
      u.id !== entering.id &&
      player.sphere_code !== "encounter" &&
      ["hero", "ally"].includes(player.type_code) &&
      player.name === encounter.name
    );
  });
  for (const conflicting of conflicts) {
    log(
      s,
      `${name(entering)} enters as a unique encounter character. Discard the player version from play.`,
      "danger",
    );
    // A uniqueness discard is neither destruction nor a player card effect.
    destroy(s, conflicting, false, "discard", false);
  }
}
