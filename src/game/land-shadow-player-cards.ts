import type { GameState, Unit } from "./types";
import { card } from "./cards";
import { log, requireRule, spendResources } from "./core";
import { activeSeat, ownerOf } from "./table";
import { LAND_SHADOW_FRODO, isOneRing } from "./lotr-saga-codes";
import { batch4Scenario } from "./batch4-scenarios";

/**
 * The Lord of the Rings: The Land of Shadow player cards. The Saga places the
 * Fellowship-sphere Frodo Baggins with The One Ring; his Action spends 1
 * Fellowship resource and exhausts The One Ring for +2 willpower and +2
 * attack until the end of the round.
 */
export const LAND_SHADOW_PLAYER = { frodo: LAND_SHADOW_FRODO } as const;
const P = LAND_SHADOW_PLAYER;

const ring = (u: Unit) => u.attachments.find((a) => isOneRing(a.code));

export const landShadowPlayerAbilityLabel = (code: string) =>
  code === P.frodo
    ? "Frodo Baggins · Spend 1 resource and exhaust The One Ring: +2 willpower and +2 attack until the end of the round"
    : undefined;
export function landShadowPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId || u.code !== P.frodo) return undefined;
  const title = card(u.code).name;
  if (u.blanked) return `${title}'s printed text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s)) return `You do not control ${title}.`;
  // Frodo is the Fellowship hero: his own pool holds the Fellowship resource.
  if (u.resources < 1) return "Frodo Baggins needs 1 Fellowship resource.";
  const r = ring(u);
  if (!r || r.blanked) return "The One Ring is not attached to Frodo Baggins.";
  if (r.exhausted) return "The One Ring is exhausted.";
  return undefined;
}
export function useLandShadowPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId || u.code !== P.frodo) return false;
  const problem = landShadowPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  spendResources(s, u, 1);
  ring(u)!.exhausted = true;
  u.roundWill = (u.roundWill ?? 0) + 2;
  u.roundAttack = (u.roundAttack ?? 0) + 2;
  log(
    s,
    "Frodo Baggins spends 1 resource and exhausts The One Ring: he gets +2 willpower and +2 attack until the end of the round.",
    "good",
  );
  batch4Scenario(s).oneRingExhausted?.(s);
  return true;
}
