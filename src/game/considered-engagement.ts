// Virtual engagement never duplicates or moves the physical staging-area enemy.
import type { GameState, Unit } from "./types";
import { SHADOW_FLAME } from "./shadow-flame-support";
import { activeSeat, playerOrder, seatView } from "./table";
import { encounterDraw } from "./core";
import { heirsShadowDealt } from "./heirs-numenor";
type ConsideredEnemy = Unit & { consideredEnemyAttackedBy?: number[] };
export function consideredEngaged(
  s: GameState,
  u: Unit,
  player = activeSeat(s),
): boolean {
  return (
    u.code === SHADOW_FLAME.bane &&
    !u.blanked &&
    s.staging.some((c) => c.id === u.id) &&
    playerOrder(s).includes(player) &&
    seatView(s, player).threat >= 1
  );
}
export function engagedEnemies(s: GameState, player = activeSeat(s)): Unit[] {
  return [
    ...seatView(s, player).engaged,
    ...s.staging.filter((u) => consideredEngaged(s, u, player)),
  ];
}
/** A prohibition may prevent the pending attack; callers apply their normal legality filters. */
export function normalAttackPending(
  s: GameState,
  u: Unit,
  player = activeSeat(s),
): boolean {
  return consideredEngaged(s, u, player)
    ? !(u as ConsideredEnemy).consideredEnemyAttackedBy?.includes(player)
    : seatView(s, player).engaged.some((e) => e.id === u.id) && !u.attacked;
}
export function markEnemyAttack(s: GameState, u: Unit, player = activeSeat(s)) {
  if (u.code === SHADOW_FLAME.bane && s.staging.some((c) => c.id === u.id)) {
    const ledger = ((u as ConsideredEnemy).consideredEnemyAttackedBy ??= []);
    if (!ledger.includes(player)) ledger.push(player);
  } else u.attacked = true;
}
export function resetEnemyAttacks(u: Unit) {
  u.attacked = false;
  u.attackedBy = [];
  delete (u as ConsideredEnemy).consideredEnemyAttackedBy;
}
/** Bane's printed fresh-shadow instruction replaces the ordinary framework deal. */
export function prepareEnemyShadows(s: GameState, u: Unit) {
  resetEnemyAttacks(u);
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  if (u.code === SHADOW_FLAME.bane && !u.blanked) {
    u.shadows = [];
    return;
  }
  const code = encounterDraw(s, true);
  if (code) u.shadows.push(code);
  if (code) heirsShadowDealt(s, u);
}
/** Call when this considered-engaged enemy actually initiates any attack. */
export function beginConsideredEnemyShadows(s: GameState, u: Unit): boolean {
  if (u.code !== SHADOW_FLAME.bane || u.blanked) return false;
  // Immediate attacks suspend their original shadows separately before this call.
  // A normal attack must never lose a physical card left by an earlier attack.
  s.encounterDiscard.push(...u.shadows);
  const code = encounterDraw(s, true);
  u.shadows = code ? [code] : [];
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  return true;
}
/** Each Bane attack discards its own shadows before the next player attacks. */
export function finishEnemyShadows(
  s: GameState,
  u: Unit,
  startedWithFreshShadow = false,
): boolean {
  if (u.code !== SHADOW_FLAME.bane || (u.blanked && !startedWithFreshShadow))
    return false;
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  return true;
}
