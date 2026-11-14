import type { GameState } from "./types";
import { card, cards } from "./cards";
import { get, log } from "./core";
import { activeSeat, seatName } from "./table";
import { DIRE_REDUCED, direQuest } from "./dire";

/** A source of threat reduction that is a boon card. */
function boonSource(
  s: GameState,
  source?: { id?: string; code?: string } | string,
) {
  const code =
    typeof source === "string"
      ? cards[source]
        ? source
        : get(s, source)?.code
      : (source?.code ?? get(s, source?.id)?.code);
  return !!code && card(code).sphere_code === "boon";
}
/**
 * Dire: each player's threat cannot be reduced by more than 1 each round by
 * non-boon player card effects. Encounter and quest card effects, and boon
 * cards, reduce it in full.
 */
export function direThreatReduction(
  s: GameState,
  amount: number,
  reason: string | undefined,
  source?: { id?: string; code?: string } | string,
) {
  if (!direQuest(s) || reason !== "player-card" || amount <= 0) return amount;
  if (boonSource(s, source)) return amount;
  const done = s.used.filter((k) => k === DIRE_REDUCED).length;
  const actual = Math.min(amount, Math.max(0, 1 - done));
  for (let i = 0; i < actual; i++) s.used.push(DIRE_REDUCED);
  if (actual < amount)
    log(
      s,
      `Dire: ${s.table ? seatName(s, activeSeat(s)) : "you"} cannot reduce ${s.table ? "his" : "your"} threat by more than 1 this round.`,
    );
  return actual;
}
