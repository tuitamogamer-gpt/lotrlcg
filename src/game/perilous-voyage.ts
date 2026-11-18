import type { Card, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canPay,
  choose,
  draw,
  eligiblePayers,
  fx,
  get,
  log,
  make,
  pay,
  playCost,
  prepend,
  putPlayerDeck,
  reorderPlayerDeck,
  requireRule,
  shuffle,
  takePlayerDeck,
} from "./core";
import { raiseThreat } from "./board";
import { activeSeat, forOwner, playerOrder, seatName } from "./table";
import { reduceThreat } from "./threat-reduction";
import { threatElimination } from "./tharbad-support";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  needsTarget,
  resolvePaidPlayerCard,
} from "./actions";
import { singlePoolCard } from "./expansion-passives";
import {
  PERILOUS_VOYAGE as PV,
  VOYAGE_MINIMUM_DECK,
  voyageAbilityProblem,
  voyageContract,
} from "./perilous-voyage-support";

type Contract = NonNullable<GameState["perilousVoyage"]>["contracts"][number];
const state = (s: GameState) => (s.perilousVoyage ??= { contracts: [] });
const who = (s: GameState, player: number) =>
  s.table ? seatName(s, player) : "You";
const their = (s: GameState) => (s.table ? "their" : "your");
const TITLE = "A Perilous Voyage";

/** The contract begins in play with each player whose deck holds it. */
export function perilousVoyageSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const count =
        s.deck.filter((c) => c === PV).length || s.customDeck?.[PV] || 0;
      if (!count) return;
      requireRule(count === 1, "Choose one A Perilous Voyage contract.");
      requireRule(
        s.deck.filter((c) => c !== PV).length >= VOYAGE_MINIMUM_DECK,
        `A Perilous Voyage: your minimum deck size is ${VOYAGE_MINIMUM_DECK} cards.`,
      );
      s.deck = s.deck.filter((c) => c !== PV);
      const unit = make(s, PV);
      unit.owner = player;
      state(s).contracts.push({ player, unit, side: "A" });
    });
}
export function voyagePlayerEliminated(s: GameState, player: number) {
  const q = s.perilousVoyage;
  if (!q) return;
  for (const c of q.contracts.filter((c) => c.player === player))
    forOwner(s, player, () => s.removed.push(c.unit.code));
  q.contracts = q.contracts.filter((c) => c.player !== player);
}
/** The contract readies with the player's other cards in the refresh phase. */
export function voyageRefresh(s: GameState) {
  for (const c of s.perilousVoyage?.contracts ?? []) c.unit.exhausted = false;
}

/**
 * Side A's Action: "Exhaust this card and raise your threat by 1 to look at the
 * top 2 cards of your deck, draw 1, and place the other on the bottom of your
 * deck."
 */
export function useVoyageAbility(s: GameState, u: Unit): boolean {
  if (u.code !== PV) return false;
  const c = s.perilousVoyage?.contracts.find((c) => c.unit.id === u.id);
  if (!c) return false;
  const problem = voyageAbilityProblem(s, u.id);
  requireRule(!problem, problem ?? "");
  c.unit.exhausted = true;
  raiseThreat(s, 1, "cost");
  log(
    s,
    `${TITLE}: ${who(s, c.player)} ${s.table ? "exhausts" : "exhaust"} the contract and ${s.table ? "raises" : "raise"} ${their(s)} threat by 1 to look at the top 2 cards of ${their(s)} deck.`,
  );
  prepend(s, fx("pvLook", { player: c.player, source: c.unit.id }));
  return true;
}

/**
 * Side A's Forced: "When you would be eliminated by reaching your threat
 * elimination level, flip this card over instead." It resolves before any
 * Response to the same elimination (Favor of the Valar).
 */
export function voyageEliminationCheck(s: GameState) {
  const c = voyageContract(s);
  if (!c || c.side !== "A" || s.threat < threatElimination(s)) return;
  if (s.table?.seats[activeSeat(s)].eliminated) return;
  log(
    s,
    `${TITLE}: ${who(s, c.player)} would be eliminated at ${s.threat} threat; the contract flips over instead.`,
    "good",
  );
  flipVoyage(s, c);
}
/**
 * Side B's Forced: "When this card is flipped to this side, reduce your threat
 * by 10. Search your deck for a card and either add it to your hand or play
 * it, reducing its cost by 3. Shuffle your deck."
 */
function flipVoyage(s: GameState, c: Contract) {
  c.side = "B";
  c.unit.exhausted = false;
  reduceThreat(
    s,
    10,
    { id: c.unit.id, code: PV, owner: c.player },
    "player-card",
  );
  prepend(s, fx("pvSearch", { player: c.player, source: c.unit.id }));
}

/** The searched card, as it would be played from the deck. */
const preview = (c: Contract, code: string): Unit => ({
  ...c.unit,
  code,
  attachments: [],
  exhausted: false,
});
/** Its cost reduced by 3, paid as a card played from the deck. */
const reduced = (code: string, player: number): Card => ({
  ...card(code),
  cost: Math.max(0, Number(card(code).cost) - 3),
  playOwner: player,
  playOrigin: "deck",
});
const fixedCost = (code: string) =>
  /^\d+$/.test(String(card(code).cost ?? "")) &&
  card(code).printed_stats?.cost !== "X";
/** Why the searched card cannot be played this way. */
export function voyagePlayProblem(
  s: GameState,
  c: Contract,
  code: string,
): string | null {
  if (!fixedCost(code)) return "Only a card with a printed cost can be played.";
  const problem = effectCardPlayProblem(s, preview(c, code), {
    putIntoPlay: false,
  });
  if (problem) return problem;
  if (!canPay(s, reduced(code, c.player)))
    return "The reduced cost cannot be paid.";
  return null;
}
const sum = (payment: Record<string, number>) =>
  Object.values(payment).reduce((n, v) => n + v, 0);

export function perilousVoyageEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("pv")) return false;
  const c = voyageContract(s, e.player ?? activeSeat(s));
  switch (e.kind) {
    case "pvLook": {
      if (!c || !s.deck.length) {
        log(s, `${TITLE}: the deck is empty.`);
        return true;
      }
      const top = s.deck.slice(0, 2);
      if (top.length === 1) {
        draw(s, 1);
        return true;
      }
      choose(
        s,
        `${TITLE} · Draw 1 of the top 2 cards`,
        top.map((code, i) => ({
          id: `top-${i}`,
          code,
          label: `Draw ${card(code).name}; ${card(top[1 - i]).name} goes to the bottom of your deck`,
          effects: [{ ...e, kind: "pvDraw", value: i }],
        })),
      );
      return true;
    }
    case "pvDraw": {
      if (s.deck.length < 2) {
        draw(s, 1);
        return true;
      }
      // The chosen card is drawn and the other is placed on the bottom.
      if (e.value === 1) reorderPlayerDeck(s, 0, [1, 0]);
      const before = s.deck.length;
      draw(s, 1);
      const other = s.deck.length < before ? 0 : 1;
      putPlayerDeck(s, takePlayerDeck(s, other));
      log(s, `${TITLE}: the other card is placed on the bottom of the deck.`);
      return true;
    }
    case "pvSearch": {
      if (!c) return true;
      if (!s.deck.length) {
        log(s, `${TITLE}: the deck is empty; nothing is found.`);
        return true;
      }
      const codes = [...new Set(s.deck)].sort((a, b) =>
        card(a).name.localeCompare(card(b).name),
      );
      choose(
        s,
        `${TITLE} · Search your deck for a card`,
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [{ ...e, kind: "pvFound", code }],
        })),
      );
      return true;
    }
    case "pvFound": {
      if (!c || !e.code || !s.deck.includes(e.code)) return true;
      const options: Option[] = [
        {
          id: "hand",
          code: e.code,
          label: `Add ${card(e.code).name} to your hand`,
          effects: [{ ...e, kind: "pvTake" }],
        },
      ];
      if (!voyagePlayProblem(s, c, e.code)) {
        const cost = playCost(s, reduced(e.code, c.player));
        options.push({
          id: "play",
          code: e.code,
          label: `Play ${card(e.code).name}, reducing its cost by 3 (pay ${cost})`,
          effects: [{ ...e, kind: "pvPlay" }],
        });
      }
      choose(s, `${TITLE} · Add it to your hand or play it`, options);
      return true;
    }
    case "pvTake": {
      const index = s.deck.indexOf(e.code ?? "");
      if (index < 0) return true;
      s.hand.push(takePlayerDeck(s, index));
      shuffle(s, s.deck);
      log(
        s,
        `${TITLE}: ${who(s, e.player ?? activeSeat(s))} ${s.table ? "adds" : "add"} ${card(e.code!).name} to ${their(s)} hand and ${s.table ? "shuffles" : "shuffle"} ${their(s)} deck.`,
      );
      return true;
    }
    case "pvPlay": {
      if (!c || !e.code || !s.deck.includes(e.code)) return true;
      const u = preview(c, e.code);
      if (needsTarget(u)) {
        choose(
          s,
          `${TITLE} · Choose a target for ${card(e.code).name}`,
          effectCardPlayTargets(s, u).map((t) => ({
            id: t.id,
            code: t.code,
            label: name(t),
            effects: [{ ...e, kind: "pvPay", target: t.id, text: "{}" }],
          })),
        );
        return true;
      }
      prepend(s, { ...e, kind: "pvPay", text: "{}" });
      return true;
    }
    case "pvPay": {
      if (!c || !e.code || !s.deck.includes(e.code)) return true;
      const payment = JSON.parse(e.text ?? "{}") as Record<string, number>;
      const rc = reduced(e.code, c.player);
      const target = get(s, e.target);
      const cost = playCost(s, rc, target);
      if (sum(payment) >= cost) {
        playFound(s, c, e.code, e.target, payment);
        return true;
      }
      const chosen = Object.keys(payment);
      const payers = eligiblePayers(s, rc, target).filter(
        (h) =>
          h.resources - (payment[h.id] ?? 0) > 0 &&
          (!singlePoolCard(rc) || !chosen.length || chosen.includes(h.id)),
      );
      const step = (h: Unit) => ({
        ...e,
        text: JSON.stringify({ ...payment, [h.id]: (payment[h.id] ?? 0) + 1 }),
      });
      if (!payers.length) {
        log(
          s,
          `${TITLE}: ${card(e.code).name} cannot be paid for; it is added to the hand instead.`,
        );
        prepend(s, { ...e, kind: "pvTake" });
        return true;
      }
      // With one possible payer there is nothing to decide.
      if (payers.length === 1) {
        prepend(s, step(payers[0]));
        return true;
      }
      choose(
        s,
        `${TITLE} · Pay for ${card(e.code).name} (${cost - sum(payment)} left)`,
        payers.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} pays 1 resource (${h.resources - (payment[h.id] ?? 0)} available)`,
          effects: [step(h)],
        })),
      );
      return true;
    }
  }
  return false;
}
/** Pay the reduced cost and play the physical card from the deck. */
function playFound(
  s: GameState,
  c: Contract,
  code: string,
  target: string | undefined,
  payment: Record<string, number>,
) {
  const index = s.deck.indexOf(code);
  if (index < 0) return;
  const rc = reduced(code, c.player);
  pay(s, rc, payment, get(s, target));
  const physical = takePlayerDeck(s, index);
  shuffle(s, s.deck);
  log(
    s,
    `${TITLE}: ${who(s, c.player)} ${s.table ? "plays" : "play"} ${card(code).name} from ${their(s)} deck, reducing its cost by 3, and ${s.table ? "shuffles" : "shuffle"} the deck.`,
  );
  resolvePaidPlayerCard(
    s,
    physical,
    target,
    Number(rc.cost),
    true,
    false,
    false,
    Number(rc.cost),
  );
}
