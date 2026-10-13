import { card, name } from "./cards";
import type { Action, Card, Effect, GameState, Unit } from "./types";
import { COBAS_PLAYER as P } from "./cobas-player-support";
import {
  canGainResources,
  characters,
  choose,
  draw,
  eligiblePayers,
  fx,
  get,
  globalUnits,
  log,
  pay,
  playCost,
  prepend,
  requireRule,
  skip,
} from "./core";
import { addVictoryCard, exhaustCharacter, takePlayerDiscard } from "./board";
import { isHero } from "./card-types";
import { isSacked } from "./carrock";
import { hasTrait } from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { playerCardImmune } from "./card-immunity";
import {
  dikeCannotLeaveDiscard,
  DIKE_DISCARD_REASON,
} from "./deadmens-discard";
import { choosePlayerResponse } from "./player-ability-triggers";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  activeSeat,
  allCharacters,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { discardTarget } from "./actions";

const ROUND = "round:cobas:";
const PAID = "phase:cobas:linhir-paid:";
const DISCOUNT = "phase:cobas:houses-discount:";
export const COBAS_JUSTICE_ELIMINATED = "game:cobas-justice-eliminated";
const markerLists = (s: GameState) =>
  new Set([s.used, ...(s.table?.seats.map((p) => p.used) ?? [])]);
const marked = (s: GameState, key: string) =>
  [...markerLists(s)].some((list) => list.includes(key));
const healers = (s: GameState) =>
  allCharacters(s).filter(
    (u) =>
      ownerOf(s, u) === activeSeat(s) &&
      hasTrait(u, "Healer") &&
      !u.exhausted &&
      !khazadCannotExhaust(u) &&
      !watcherWaterCannotExhaust(u) &&
      !playerCardImmune(u),
  );

/** The preview shows the least payable cost; final payment uses exactly the chosen Healers. */
export function cobasEconomyCostReduction(s: GameState, code: string) {
  if (code !== P.houses) return 0;
  const chosen = s.used.find((k) => k.startsWith(DISCOUNT));
  return chosen ? Number(chosen.slice(DISCOUNT.length)) : healers(s).length;
}
function withDiscount<T>(s: GameState, count: number, f: () => T): T {
  const previous = s.used.filter((k) => k.startsWith(DISCOUNT));
  s.used = s.used.filter((k) => !k.startsWith(DISCOUNT));
  s.used.push(DISCOUNT + count);
  try {
    return f();
  } finally {
    s.used = s.used.filter((k) => !k.startsWith(DISCOUNT));
    s.used.push(...previous);
  }
}
const titleKey = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function cobasEconomyPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code !== P.houses) return null;
  if (dikeCannotLeaveDiscard(s)) return [];
  const titles = new Set(
    globalUnits(s)
      .flatMap((u) => [
        card(u.code).name,
        ...u.attachments
          .filter((a) => !a.facedown && !a.namelessCard)
          .map((a) => card(a.code).name),
      ])
      .map(titleKey),
  );
  return livingSeats(s).flatMap((player) =>
    seatView(s, player).discard.flatMap((code, index) =>
      card(code).type_code === "hero" && !titles.has(titleKey(card(code).name))
        ? [
            {
              ...s.heroes[0],
              code,
              id: s.table ? `discard-${player}-${index}` : `discard-${index}`,
            } as Unit,
          ]
        : [],
    ),
  );
}
export function cobasEconomyPlayProblem(s: GameState, code: string) {
  if (code === P.houses) {
    if (s.phase !== "refresh")
      return "The Houses of Healing is a Refresh Action.";
    if (!cobasEconomyPlayTargets(s, code)!.length)
      return "Choose a hero in a living player's discard pile that can enter play.";
  }
  if (code === P.justice && s.phase !== "planning")
    return "Justice Shall Be Done is a Planning Action.";
  return null;
}
export function cobasEconomyCardPaid(
  s: GameState,
  u: Unit,
  payment: Record<string, number>,
  played: boolean,
  fromHand: boolean,
) {
  if (u.code !== P.linhir || !played || !fromHand) return;
  const positive = Object.entries(payment).filter(([, n]) => n > 0);
  const hero = positive.length === 1 ? get(s, positive[0][0]) : undefined;
  if (hero && isHero(hero)) s.used.push(PAID + u.id + ":" + hero.id);
}
export function cobasEconomyAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (u.code !== P.linhir) return;
  const prefix = PAID + u.id + ":";
  let hero: string | undefined;
  for (const list of markerLists(s)) {
    const marker = list.find((k) => k.startsWith(prefix));
    if (marker) hero = marker.slice(prefix.length);
    list.splice(0, list.length, ...list.filter((k) => !k.startsWith(prefix)));
  }
  if (played && fromHand && hero && !u.blanked && !isSacked(u))
    prepend(
      s,
      fx("cobasLinhirOffer", {
        source: u.id,
        target: hero,
        player: ownerOf(s, u),
      }),
    );
}
export function cobasEconomyNoQuestExhaust(s: GameState, u: Unit) {
  return marked(s, ROUND + "linhir:" + s.round + ":" + u.id);
}
export function cobasEconomyCharacterLeft(s: GameState, u: Unit) {
  for (const list of markerLists(s))
    list.splice(
      0,
      list.length,
      ...list.filter(
        (k) =>
          !(k.startsWith(ROUND + "linhir:") && k.endsWith(":" + u.id)) &&
          !k.startsWith(PAID + u.id + ":"),
      ),
    );
}

interface HousePlay {
  origin: "hand" | "discard";
  id?: string;
  index?: number;
  target: string;
  payment?: Record<string, number>;
  bottom?: boolean;
}
function housePhysical(s: GameState, play: HousePlay) {
  return play.origin === "hand"
    ? s.hand.find((u) => u.id === play.id && u.code === P.houses)
    : s.discard[play.index ?? -1] === P.houses
      ? ({ ...s.heroes[0], code: P.houses, owner: activeSeat(s) } as Unit)
      : undefined;
}
function houseDefinition(s: GameState, play: HousePlay): Card {
  const physical = housePhysical(s, play);
  return {
    ...card(P.houses),
    playOrigin: play.origin,
    playOwner: physical?.owner ?? activeSeat(s),
  };
}
function housePayment(s: GameState, play: HousePlay, ids: string[]) {
  return withDiscount(s, ids.length, () => {
    const definition = houseDefinition(s, play),
      payers = eligiblePayers(s, definition),
      cost = playCost(s, definition);
    if (!payers.length || payers.reduce((n, u) => n + u.resources, 0) < cost)
      return null;
    const selected = play.payment;
    if (
      selected &&
      Object.values(selected).every((n) => Number.isInteger(n) && n >= 0) &&
      Object.values(selected).reduce((a, b) => a + b, 0) === cost &&
      Object.entries(selected).every(([id, n]) =>
        payers.some((u) => u.id === id && u.resources >= n),
      )
    )
      return selected;
    // If the optional discount changed the UI's preview, make the actual payment explicit.
    const payment: Record<string, number> = {};
    let left = cost;
    for (const u of [...payers].sort((a, b) => b.resources - a.resources)) {
      const n = Math.min(left, u.resources);
      if (n) payment[u.id] = n;
      left -= n;
    }
    return payment;
  });
}
function houseAllocations(s: GameState, play: HousePlay, ids: string[]) {
  return withDiscount(s, ids.length, () => {
    const definition = houseDefinition(s, play),
      payers = eligiblePayers(s, definition),
      cost = playCost(s, definition);
    const result: Record<string, number>[] = [];
    const allocate = (
      index: number,
      left: number,
      payment: Record<string, number>,
    ) => {
      if (index === payers.length) {
        if (left === 0) result.push(payment);
        return;
      }
      const payer = payers[index];
      for (let amount = 0; amount <= Math.min(left, payer.resources); amount++)
        allocate(index + 1, left - amount, {
          ...payment,
          ...(amount ? { [payer.id]: amount } : {}),
        });
    };
    if (payers.length) allocate(0, cost, {});
    return result;
  });
}
function houseChoose(s: GameState, e: Effect) {
  const play = JSON.parse(e.text!) as HousePlay,
    ids = e.ids ?? [];
  requireRule(
    housePhysical(s, play) &&
      cobasEconomyPlayTargets(s, P.houses)!.some((u) => u.id === play.target),
    "The physical event and discarded hero must remain available.",
  );
  const payment = housePayment(s, play, ids);
  const cost = withDiscount(s, ids.length, () =>
    playCost(s, houseDefinition(s, play)),
  );
  choose(
    s,
    "The Houses of Healing · Choose Healers to exhaust",
    [
      ...healers(s)
        .filter((u) => !ids.includes(u.id))
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)} · reduce cost by 1`,
          effects: [{ ...e, kind: "cobasHousesSelect", target: u.id }],
        })),
      ...(payment
        ? [
            {
              id: "pay",
              code: P.houses,
              label: `Pay ${cost} resources${
                Object.entries(payment).length
                  ? " · " +
                    Object.entries(payment)
                      .map(([id, n]) => `${name(get(s, id)!)} ${n}`)
                      .join(", ")
                  : ""
              }; exhaust ${ids.length} Healer${ids.length === 1 ? "" : "s"}`,
              effects: [
                {
                  ...e,
                  kind: "cobasHousesPay",
                  text: JSON.stringify({ ...play, payment }),
                },
              ],
            },
          ]
        : []),
      ...(payment && houseAllocations(s, play, ids).length > 1
        ? [
            {
              id: "payment",
              label: "Choose which hero resource pools pay the cost",
              effects: [{ ...e, kind: "cobasHousesPayment" }],
            },
          ]
        : []),
      {
        id: "skip",
        label: "Cancel this play without paying costs",
        effects: [],
      },
    ],
    "Healers are exhausted only when you confirm the complete cost. A Healer belonging to another player cannot pay this cost.",
  );
}
export function cobasEconomyPrepareHandPlay(
  s: GameState,
  u: Unit,
  action: Extract<Action, { type: "PLAY" }>,
) {
  if (u.code !== P.houses || !healers(s).length) return false;
  requireRule(!!action.target, "Choose a discarded hero.");
  houseChoose(
    s,
    fx("cobasHousesChoose", {
      source: u.id,
      player: activeSeat(s),
      ids: [],
      text: JSON.stringify({
        origin: "hand",
        id: u.id,
        target: action.target,
        payment: action.payment,
      } satisfies HousePlay),
    }),
  );
  return true;
}
export function cobasEconomyPrepareDiscardPlay(
  s: GameState,
  index: number,
  options: {
    target?: string;
    payment?: Record<string, number>;
    bottom?: boolean;
  },
) {
  if (s.discard[index] !== P.houses || !healers(s).length) return false;
  requireRule(!!options.target, "Choose a discarded hero.");
  houseChoose(
    s,
    fx("cobasHousesChoose", {
      player: activeSeat(s),
      ids: [],
      text: JSON.stringify({
        origin: "discard",
        index,
        target: options.target,
        payment: options.payment,
        bottom: options.bottom,
      } satisfies HousePlay),
    }),
  );
  return true;
}
/** Moving this exact resolving event is a cost, before Counter-spell or other cancellation. */
export function cobasEconomyEventCost(s: GameState, u: Unit) {
  if (u.code !== P.justice) return;
  const pending = s.resolvingEvents?.find((event) => event.unit.id === u.id);
  requireRule(
    pending,
    "Justice Shall Be Done must pay its own physical event as the cost.",
  );
  addVictoryCard(s, u.code);
  pending.destination = "spent";
}
export function cobasEconomyEvent(s: GameState, code: string, target?: string) {
  if (code === P.houses) {
    requireRule(!dikeCannotLeaveDiscard(s), DIKE_DISCARD_REASON);
    if (!cobasEconomyPlayTargets(s, code)!.some((u) => u.id === target))
      return true;
    const t = discardTarget(s, target!);
    forOwner(s, t.player, () => {
      const hero = takePlayerDiscard(s, t.index);
      hero.damage = 1;
      s.heroes.push(hero);
      s.fallenThreat = Math.max(
        0,
        s.fallenThreat - (card(hero.code).threat ?? 0),
      );
      log(
        s,
        `${card(hero.code).name} returns under ${seatName(s, t.player)}'s control with 1 damage.`,
        "good",
      );
    });
    return true;
  }
  if (code === P.justice) {
    s.used.push(ROUND + "justice");
    draw(s, 3);
    for (const h of characters(s).filter(isHero))
      if (canGainResources(s, h)) {
        h.resources += 3;
        gondorResourcesGained(s, h, 3, true);
      }
    return true;
  }
  return false;
}
export function cobasEconomyRoundEnd(s: GameState): Effect[] {
  return playerOrder(s).flatMap((player) =>
    seatView(s, player).used.includes(ROUND + "justice")
      ? [fx("cobasJusticeEliminate", { player })]
      : [],
  );
}
export function handleCobasEconomyEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "cobasLinhirOffer": {
      const ally = get(s, e.source),
        hero = get(s, e.target);
      if (ally?.code !== P.linhir || ally.blanked || isSacked(ally))
        return true;
      choosePlayerResponse(
        s,
        ally.id,
        P.linhir,
        "Linhir Sea-captain · Quest without exhausting",
        [
          {
            id: "use",
            code: P.linhir,
            label: `${hero ? name(hero) + " and " : ""}Linhir Sea-captain do${hero ? "" : "es"} not exhaust to quest this round`,
            effects: [{ ...e, kind: "cobasLinhirResolve" }],
          },
          skip,
        ],
      );
      return true;
    }
    case "cobasLinhirResolve": {
      const ally = get(s, e.source),
        hero = get(s, e.target);
      if (!ally || ally.blanked) return true;
      s.used.push(ROUND + "linhir:" + s.round + ":" + ally.id);
      if (hero && allCharacters(s).some((u) => u.id === hero.id))
        s.used.push(ROUND + "linhir:" + s.round + ":" + hero.id);
      return true;
    }
    case "cobasHousesChoose":
      houseChoose(s, e);
      return true;
    case "cobasHousesPayment": {
      const play = JSON.parse(e.text!) as HousePlay,
        ids = e.ids ?? [];
      const payments = houseAllocations(s, play, ids);
      choose(s, "The Houses of Healing · Choose resource pools", [
        ...payments.map((payment, index) => ({
          id: `pay-${index}`,
          label:
            Object.entries(payment)
              .map(([id, amount]) => `${name(get(s, id)!)}: ${amount}`)
              .join("; ") || "Pay 0 resources",
          effects: [
            {
              ...e,
              kind: "cobasHousesPay",
              text: JSON.stringify({ ...play, payment }),
            },
          ],
        })),
        {
          id: "back",
          label: "Back to Healer selection",
          effects: [{ ...e, kind: "cobasHousesChoose" }],
        },
      ]);
      return true;
    }
    case "cobasHousesSelect": {
      const ids = e.ids ?? [];
      requireRule(
        healers(s).some((u) => u.id === e.target) && !ids.includes(e.target!),
        "Choose an unselected ready Healer you control.",
      );
      houseChoose(s, { ...e, ids: [...ids, e.target!], target: undefined });
      return true;
    }
    case "cobasHousesPay": {
      const play = JSON.parse(e.text!) as HousePlay,
        ids = e.ids ?? [];
      requireRule(
        new Set(ids).size === ids.length &&
          ids.every((id) => healers(s).some((u) => u.id === id)),
        "Every chosen Healer must still be ready and controlled by you.",
      );
      requireRule(
        housePhysical(s, play) &&
          cobasEconomyPlayTargets(s, P.houses)!.some(
            (u) => u.id === play.target,
          ),
        "The event and its target must remain available.",
      );
      const definition = houseDefinition(s, play);
      const continuation = s.queue;
      s.queue = [];
      withDiscount(s, ids.length, () => pay(s, definition, play.payment));
      for (const id of ids)
        requireRule(
          exhaustCharacter(s, get(s, id)!),
          "Exhaust each chosen Healer to pay the event's cost.",
        );
      const physical =
        play.origin === "hand"
          ? s.hand.find((u) => u.id === play.id)!
          : takePlayerDiscard(s, play.index!);
      if (play.origin === "hand")
        s.hand = s.hand.filter((u) => u.id !== physical.id);
      let target = play.target;
      if (play.origin === "discard") {
        const t = discardTarget(s, target);
        if (t.player === activeSeat(s) && t.index > play.index!)
          target = s.table
            ? `discard-${t.player}-${t.index - 1}`
            : `discard-${t.index - 1}`;
      }
      // All costs are now paid. Their mandatory effects and optional responses
      // finish before this reserved physical event enters its resolution area.
      (s.pendingPlayerPlays ??= []).push({
        unit: physical,
        player: activeSeat(s),
        target,
        effectiveCost: Number(card(P.houses).cost),
        played: true,
        fromHand: play.origin === "hand",
        bottom: !!play.bottom,
        amount: 0,
      });
      s.queue.push(
        fx("paidPlayerCardEntry", {
          target: physical.id,
          player: activeSeat(s),
        }),
        ...continuation,
      );
      return true;
    }
    case "cobasJusticeEliminate":
      if (!s.used.includes(COBAS_JUSTICE_ELIMINATED))
        s.used.push(COBAS_JUSTICE_ELIMINATED);
      log(
        s,
        `${seatName(s, activeSeat(s))} is eliminated by Justice Shall Be Done.`,
        "danger",
      );
      return true;
    default:
      return false;
  }
}
