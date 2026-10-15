import { card, playerCards } from "./cards";
import { playerCardImmune } from "./card-immunity";
import { hasTrait } from "./expansion-passives";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { isEnemy } from "./ships";
import { allActiveLocations } from "./table";
import type { GameState, Unit } from "./types";

const MONUMENT = "octgn:f811f153-81f4-4688-8b4d-400215e6748a";
let playerCodes: Set<string> | undefined;
export function isPlayerCardSource(code: string): boolean {
  playerCodes ??= new Set(playerCards.map((c) => c.code));
  return playerCodes.has(card(code).code);
}

/**
 * Source-specific immunity is checked at target selection and resolution.
 * A nested ally/hero ability has its own source even while its parent event
 * remains in resolution. Normal attack damage is a framework effect and its
 * caller must bypass this check (FAQ 1.9, section 1.47).
 */
export function playerEffectImmune(
  s: GameState,
  u: Unit,
  sourceCode = activePlayerAbilityCode(s),
): boolean {
  // Control does not turn an encounter objective into a player card. Its
  // printed action can affect enemies immune only to player card effects.
  if (sourceCode) {
    if (!isPlayerCardSource(sourceCode)) return false;
  }
  if (playerCardImmune(u)) return true;
  if (
    !sourceCode ||
    card(sourceCode).type_code !== "event" ||
    !isEnemy(u) ||
    !hasTrait(u, "Raider") ||
    u.resources <= 0
  )
    return false;
  return [...s.staging, ...allActiveLocations(s)].some(
    (location) => location.code === MONUMENT && !location.blanked,
  );
}
