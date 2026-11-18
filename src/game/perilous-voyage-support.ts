import type { GameState, Unit } from "./types";
import { card } from "./cards";
import { isHero } from "./card-types";
import { activeSeat, ownerOf, seatIndices } from "./table";

/** A Perilous Voyage, the contract of The Hunt for the Dreadnaught. */
export const PERILOUS_VOYAGE = "40047";
/** The contract's printed minimum deck size. */
export const VOYAGE_MINIMUM_DECK = 100;
type Source = { id?: string; code?: string } | string | undefined;

export const voyageContract = (s: GameState, player = activeSeat(s)) =>
  s.perilousVoyage?.contracts.find((c) => c.player === player);
export const voyageUnit = (s: GameState, id?: string) =>
  s.perilousVoyage?.contracts.find((c) => c.unit.id === id)?.unit;
const voyageSource = (source: Source, unit: Unit) =>
  typeof source === "string"
    ? source === PERILOUS_VOYAGE || source === unit.id
    : source?.code === PERILOUS_VOYAGE || source?.id === unit.id;
/**
 * Side A: "Your threat cannot be reduced by player card effects." Side B: "Your
 * threat cannot be reduced by non-contract player card effects." The threat
 * belongs to the active player.
 */
export function voyageThreatReduction(
  s: GameState,
  amount: number,
  reason: string,
  source: Source,
) {
  const c = voyageContract(s);
  if (!c || amount <= 0 || reason !== "player-card") return amount;
  return c.side === "B" && voyageSource(source, c.unit) ? amount : 0;
}
/** Side B: "Heroes you control do not exhaust to quest." */
export const voyageNoQuestExhaust = (s: GameState, u: Unit) =>
  isHero(u) && voyageContract(s, ownerOf(s, u))?.side === "B";
/** "Your minimum deck size is 100 cards." */
export function voyageDeckProblems(cards: Record<string, number>) {
  if (!cards[PERILOUS_VOYAGE]) return [];
  const size = Object.entries(cards)
    .filter(([code]) => card(code).type_code !== "contract")
    .reduce((n, [, count]) => n + count, 0);
  return size < VOYAGE_MINIMUM_DECK
    ? [
        `A Perilous Voyage: your minimum deck size is ${VOYAGE_MINIMUM_DECK} cards (${size} now).`,
      ]
    : [];
}
export function validatePerilousVoyage(
  s: GameState,
  validUnit: (v: unknown) => boolean,
) {
  const q = s.perilousVoyage;
  if (q === undefined) return true;
  return (
    !!q &&
    Array.isArray(q.contracts) &&
    q.contracts.every(
      (c) =>
        !!c &&
        seatIndices(s).includes(c.player) &&
        validUnit(c.unit) &&
        c.unit.code === PERILOUS_VOYAGE &&
        (c.unit.owner ?? c.player) === c.player &&
        ["A", "B"].includes(c.side),
    ) &&
    new Set(q.contracts.map((c) => c.player)).size === q.contracts.length
  );
}
export const perilousVoyagePublic = (s: GameState) =>
  s.perilousVoyage?.contracts.map((c) => ({
    player: c.player,
    id: c.unit.id,
    code: c.unit.code,
    side: c.side,
    exhausted: c.unit.exhausted,
  }));
/** Why the Side A Action cannot be used now. */
export function voyageAbilityProblem(s: GameState, id: string): string | null {
  const c = s.perilousVoyage?.contracts.find((c) => c.unit.id === id);
  if (!c) return "No contract ability.";
  if (c.player !== activeSeat(s))
    return "This contract belongs to another player.";
  if (c.side !== "A") return "Side B has no Action.";
  if (c.unit.exhausted) return "Exhaust A Perilous Voyage to use its Action.";
  if (!s.deck.length) return "Your deck is empty.";
  return null;
}
