import { card, playerCards, SCRIPTED } from "./cards";
import type { Attachment, GameState, Unit } from "./types";
import { allActiveLocations, playerOrder, seatIndices } from "./table";
import { globalUnits } from "./core";
import { hasEncounterKeyword } from "./encounter-keyword";
import { playerCardImmune } from "./card-immunity";

export const BURGLAR_CONTRACT = "22024";
export function burglarLootEligible(code: string): boolean {
  if (!SCRIPTED.has(code)) return false;
  const c = card(code);
  return (
    c.type_code === "attachment" &&
    c.sphere_code !== "encounter" &&
    !hasEncounterKeyword(c) &&
    !code.startsWith("rc") &&
    /(?:^|\.)\s*(?:Item|Artifact)\s*\./.test(c.traits ?? "")
  );
}
export const burglarLootCards = () =>
  playerCards.filter((c) => burglarLootEligible(c.code));
/** An unfinished loot list is valid storage, but is not yet legal setup. */
export function burglarLootListValid(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 14 &&
    value.every(
      (code) => typeof code === "string" && burglarLootEligible(code),
    ) &&
    new Set(value.map((code) => card(code).name)).size === value.length
  );
}
export function burglarDeckProblems(deck: {
  cards: Record<string, number>;
  loot?: string[];
}): string[] {
  if (!deck.cards[BURGLAR_CONTRACT]) return [];
  const problems: string[] = [];
  if (
    Object.entries(deck.cards).some(
      ([code, count]) =>
        count > 0 &&
        SCRIPTED.has(code) &&
        card(code).type_code === "attachment",
    )
  )
    problems.push(
      "The Burglar’s Turn cannot include attachments in its player deck.",
    );
  if (!burglarLootListValid(deck.loot) || deck.loot!.length !== 14)
    problems.push(
      "The Burglar’s Turn needs 14 different Item or Artifact attachments in its separate loot deck.",
    );
  return problems;
}
export const burglarGuardedObjective = (
  s: GameState,
  attachment: Pick<Attachment, "id">,
) => !!s.burglarContract?.guarded.some((g) => g.attachmentId === attachment.id);
export const burglarContractLocationQuestBonus = (s: GameState, u: Unit) =>
  !playerCardImmune(u) &&
  allActiveLocations(s).some((location) => location.id === u.id)
    ? (s.burglarContract?.contracts.filter((c) =>
        playerOrder(s).includes(c.player),
      ).length ?? 0) * u.attachments.length
    : 0;
export const burglarContractUnits = (s: GameState): Unit[] => [
  ...(s.burglarContract?.contracts.flatMap((c) => [c.unit, ...c.loot]) ?? []),
  ...(s.burglarContract?.claims.map((c) => c.unit) ?? []),
];
export function burglarContractPublicState(s: GameState) {
  const q = s.burglarContract;
  if (!q) return undefined;
  const units = [...globalUnits(s), ...(s.wrathRuin?.pendingExplored ?? [])];
  return {
    contracts: q.contracts.map((c) => ({
      player: c.player,
      id: c.unit.id,
      code: c.unit.code,
      side: c.side,
      loot: c.loot.length,
    })),
    guarded: q.guarded.flatMap((g) => {
      const location = units.find((u) => u.id === g.locationId);
      const a = location?.attachments.find((a) => a.id === g.attachmentId);
      return a
        ? [
            {
              player: g.player,
              locationId: g.locationId,
              id: a.id,
              code: a.code,
            },
          ]
        : [];
    }),
    claims: q.claims.map((c) => ({
      id: c.unit.id,
      code: c.unit.code,
      locationId: c.locationId,
      remainingPlayers: [...c.remainingPlayers],
    })),
  };
}
export function validateBurglarContract(
  s: GameState,
  validUnit: (value: unknown) => boolean,
): boolean {
  const q = s.burglarContract;
  if (q === undefined) return true;
  if (
    !q ||
    typeof q !== "object" ||
    !Array.isArray(q.contracts) ||
    !Array.isArray(q.guarded) ||
    !Array.isArray(q.claims)
  )
    return false;
  const seats = seatIndices(s),
    player = (n: unknown) => Number.isInteger(n) && seats.includes(n as number);
  const id = (n: unknown) => typeof n === "string" && n.length > 0;
  if (
    q.contracts.length > seats.length ||
    new Set(q.contracts.map((c) => c.player)).size !== q.contracts.length
  )
    return false;
  if (
    !q.contracts.every(
      (c) =>
        c &&
        player(c.player) &&
        c.side === "B" &&
        validUnit(c.unit) &&
        c.unit.code === BURGLAR_CONTRACT &&
        Array.isArray(c.loot) &&
        c.loot.length <= 14 &&
        c.loot.every(
          (u) =>
            validUnit(u) && burglarLootEligible(u.code) && u.owner === c.player,
        ) &&
        new Set(c.loot.map((u) => card(u.code).name)).size === c.loot.length,
    )
  )
    return false;
  if (
    !q.guarded.every(
      (g) => g && player(g.player) && id(g.locationId) && id(g.attachmentId),
    )
  )
    return false;
  if (new Set(q.guarded.map((g) => g.attachmentId)).size !== q.guarded.length)
    return false;
  if (
    !q.claims.every(
      (c) =>
        c &&
        id(c.locationId) &&
        validUnit(c.unit) &&
        card(c.unit.code).type_code === "attachment" &&
        Array.isArray(c.remainingPlayers) &&
        c.remainingPlayers.length > 0 &&
        c.remainingPlayers.every(player) &&
        new Set(c.remainingPlayers).size === c.remainingPlayers.length &&
        (c.regularGuarded === undefined || c.regularGuarded === true) &&
        (c.regularPlayer === undefined ||
          (c.regularGuarded === true && player(c.regularPlayer))) &&
        (c.fallback === undefined ||
          (c.fallback === true && c.regularGuarded === true)),
    )
  )
    return false;
  const units = burglarContractUnits(s),
    ids = units.map((u) => u.id);
  if (
    new Set(ids).size !== ids.length ||
    q.guarded.some((g) => ids.includes(g.attachmentId))
  )
    return false;
  const hosts = [...globalUnits(s), ...(s.wrathRuin?.pendingExplored ?? [])];
  return q.guarded.every((g) =>
    hosts.some(
      (u) =>
        u.id === g.locationId &&
        card(u.code).type_code === "location" &&
        u.attachments.some(
          (a) =>
            a.id === g.attachmentId &&
            a.owner === g.player &&
            burglarLootEligible(a.code),
        ),
    ),
  );
}
