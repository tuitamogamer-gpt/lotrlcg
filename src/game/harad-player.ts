import type {
  Action,
  Attachment,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  choose,
  draw,
  eligiblePayers,
  fx,
  get,
  log,
  pay,
  playCost,
  prepend,
  requireRule,
  shuffle,
  takePlayerDeck,
} from "./core";
import { damage, discardPlayerDeck } from "./board";
import {
  allCharacters,
  activeSeat,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isHero } from "./card-types";
import { playerCardImmune } from "./card-immunity";
import { allQuestUnits } from "./quest-state";
import { fateCannotSearch } from "./fate-numenor";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  choosePlayerResponse,
  afterPlayerAbility,
} from "./player-ability-triggers";
import {
  HARAD_PLAYER as P,
  HARAD_GUARD_COST,
  haradSideQuestCount,
} from "./harad-player-support";

const friendshipCondition = (s: GameState) => {
  const own = allCharacters(s).filter(
    (u) => ownerOf(s, u) === activeSeat(s) && card(u.code).is_unique,
  );
  return own.some(
    (a) =>
      hasTrait(a, "Silvan") &&
      own.some((b) => b.id !== a.id && hasTrait(b, "Dwarf")),
  );
};
const resourceHeroes = (s: GameState) =>
  s.heroes.filter(
    (h) => isHero(h) && !playerCardImmune(h) && canGainResources(s, h),
  );
export function haradPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.friendship) return resourceHeroes(s);
  if (code === P.dour) return s.engaged.filter((u) => !playerCardImmune(u));
  if (code === P.road)
    return allQuestUnits(s).filter((u) => !playerCardImmune(u));
  return undefined;
}
export function haradPlayerPlayProblem(s: GameState, u: Unit) {
  if (
    u.code === P.friendship &&
    (!friendshipCondition(s) || !resourceHeroes(s).length)
  )
    return "Unlikely Friendship needs a unique Silvan character and another unique Dwarf character you control, and your hero who can gain a resource.";
  if (u.code === P.wellWarned)
    return "Well Warned responds automatically after a player engages an enemy.";
  if (
    u.code === P.dour &&
    (!haradSideQuestCount(s) || !haradPlayerPlayTargets(s, u.code)!.length)
  )
    return "Dour Handed needs a side quest in the victory display and an enemy engaged with you that can be affected.";
  return null;
}
export function haradPlayerEvent(s: GameState, code: string, target?: string) {
  if (code === P.friendship) {
    const h = resourceHeroes(s).find((u) => u.id === target);
    if (h) {
      // Both instructions resolve in printed order. Drawing may create its own responses.
      const tail = s.queue;
      s.queue = [];
      draw(s, 1);
      s.queue.push(
        fx("haradPlayerFriendshipResource", { target: h.id }),
        ...tail,
      );
    }
    return true;
  }
  if (code === P.dour) {
    const enemy = s.engaged.find(
      (u) => u.id === target && !playerCardImmune(u),
    );
    if (enemy) damage(s, enemy.id, haradSideQuestCount(s));
    return true;
  }
  return false;
}

function guardDiscount<T>(s: GameState, amount: number, resolve: () => T): T {
  const previous = s.used.filter((key) => key.startsWith(HARAD_GUARD_COST));
  s.used = s.used.filter((key) => !key.startsWith(HARAD_GUARD_COST));
  s.used.push(HARAD_GUARD_COST + amount);
  try {
    return resolve();
  } finally {
    s.used = s.used.filter((key) => !key.startsWith(HARAD_GUARD_COST));
    s.used.push(...previous);
  }
}
function guardAllocations(s: GameState, discount: number) {
  return guardDiscount(s, discount, () => {
    const definition = { ...card(P.guard), playOrigin: "hand" as const },
      payers = eligiblePayers(s, definition),
      cost = playCost(s, definition),
      allocations: Record<string, number>[] = [];
    function allocate(
      index: number,
      left: number,
      payment: Record<string, number>,
    ) {
      if (index === payers.length) {
        if (left === 0) allocations.push(payment);
        return;
      }
      const h = payers[index];
      for (let n = 0; n <= Math.min(left, h.resources); n++)
        allocate(index + 1, left - n, {
          ...payment,
          ...(n ? { [h.id]: n } : {}),
        });
    }
    if (payers.length) allocate(0, cost, {});
    return allocations;
  });
}
export function haradPlayerPrepareHandPlay(
  s: GameState,
  u: Unit,
  action: Extract<Action, { type: "PLAY" }>,
) {
  if (u.code !== P.guard) return false;
  const options: Option[] = [];
  if (s.deck.length >= 2 && guardAllocations(s, 2).length)
    options.push({
      id: "discount",
      code: u.code,
      label: "Discard the top 2 cards of your deck · Reduce cost by 2",
      effects: [
        fx("haradPlayerGuardDiscard", {
          source: u.id,
          player: activeSeat(s),
          text: JSON.stringify(action),
        }),
      ],
    });
  if (guardAllocations(s, 0).length)
    options.push({
      id: "skip",
      label: "Play at full cost without discarding",
      effects: [
        fx("haradPlayerGuardPayment", {
          source: u.id,
          value: 0,
          player: activeSeat(s),
        }),
      ],
    });
  options.push({
    id: "cancel",
    label: "Cancel this play without paying costs",
    effects: [],
  });
  choose(
    s,
    "Erebor Guard · Optional cost reduction",
    options.map((option) =>
      option.id === "discount"
        ? {
            ...option,
            ability: {
              player: activeSeat(s),
              source: u.id,
              code: u.code,
              type: "response" as const,
            },
          }
        : option,
    ),
  );
  return true;
}
export function haradPlayerQuestDefeated(
  s: GameState,
  _code: string,
  attachments: Attachment[],
) {
  prepend(
    s,
    ...attachments
      .filter((a) => a.code === P.road && !a.blanked && !a.facedown)
      .map((a) =>
        fx("haradPlayerRoadOffer", {
          source: a.id,
          owner: a.owner ?? 0,
          player: a.controller ?? a.owner ?? 0,
        }),
      ),
  );
}
/** MEC55 p.2: an additional defeated copy goes to its physical owner's discard. */
export function haradPlayerSideQuestToDiscard(s: GameState, quest: Unit) {
  if (quest.code !== P.storm || !(s.victoryCards ?? []).includes(P.storm))
    return false;
  forOwner(s, quest.owner ?? quest.controller ?? firstPlayer(s), () =>
    s.discard.push(quest.code),
  );
  log(
    s,
    `${name(quest)} defeated · Its owner discards this additional copy because one is already in the victory display.`,
    "good",
  );
  return true;
}
function roadSearch(s: GameState) {
  if (fateCannotSearch(s)) {
    log(s, "The Road Goes Ever On cannot search this player's deck.");
    return;
  }
  choose(s, "The Road Goes Ever On · Choose a side quest", [
    ...s.deck.flatMap((code, index) =>
      card(code).type_code === "player-side-quest"
        ? [
            {
              id: `deck-${index}`,
              code,
              label: card(code).name,
              effects: [fx("haradPlayerRoadTake", { code, value: index })],
            },
          ]
        : [],
    ),
    {
      id: "none",
      label: "Find no side quest and shuffle",
      effects: [fx("haradPlayerRoadShuffle")],
    },
  ]);
}
export function handleHaradPlayerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("haradPlayer")) return false;
  switch (e.kind) {
    case "haradPlayerFriendshipResource": {
      const h = resourceHeroes(s).find((u) => u.id === e.target);
      if (h) {
        h.resources++;
        gondorResourcesGained(s, h, 1, true);
      }
      break;
    }
    case "haradPlayerGuardDiscard": {
      requireRule(
        s.hand.some((u) => u.id === e.source && u.code === P.guard) &&
          s.deck.length >= 2,
        "Erebor Guard needs exactly two top deck cards to pay this Response.",
      );
      const tail = s.queue;
      s.queue = [];
      const discarded = discardPlayerDeck(s, 2);
      requireRule(
        discarded.length === 2,
        "Discard exactly two top deck cards.",
      );
      s.queue.push(...tail);
      afterPlayerAbility(
        s,
        fx("haradPlayerGuardPayment", {
          source: e.source,
          value: 2,
          player: e.player,
        }),
      );
      break;
    }
    case "haradPlayerGuardPayment": {
      const physical = s.hand.find(
        (u) => u.id === e.source && u.code === P.guard,
      );
      if (!physical) break;
      const allocations = guardAllocations(s, e.value ?? 0);
      if (!allocations.length) {
        log(
          s,
          "Erebor Guard cannot be paid after its discard cost; it remains in hand.",
        );
        break;
      }
      choose(
        s,
        "Erebor Guard · Choose the resource payment",
        allocations.map((payment, index) => ({
          id: `pay-${index}`,
          code: P.guard,
          label: Object.entries(payment).length
            ? Object.entries(payment)
                .map(([id, n]) => `${name(get(s, id)!)}: ${n}`)
                .join(" · ")
            : "Pay 0 resources",
          effects: [
            {
              ...e,
              kind: "haradPlayerGuardPay",
              text: JSON.stringify(payment),
            },
          ],
        })),
      );
      break;
    }
    case "haradPlayerGuardPay": {
      const physical = s.hand.find(
        (u) => u.id === e.source && u.code === P.guard,
      );
      requireRule(
        physical,
        "The physical Erebor Guard must remain in your hand.",
      );
      const continuation = s.queue;
      s.queue = [];
      guardDiscount(s, e.value ?? 0, () =>
        pay(s, { ...card(P.guard), playOrigin: "hand" }, JSON.parse(e.text!)),
      );
      s.hand = s.hand.filter((u) => u.id !== physical.id);
      (s.pendingPlayerPlays ??= []).push({
        unit: physical,
        player: activeSeat(s),
        effectiveCost: Number(card(P.guard).cost),
        played: true,
        fromHand: true,
        bottom: false,
        amount: 0,
      });
      s.queue.push(
        fx("paidPlayerCardEntry", {
          target: physical.id,
          player: activeSeat(s),
        }),
        ...continuation,
      );
      break;
    }
    case "haradPlayerRoadOffer":
      choosePlayerResponse(
        s,
        e.source!,
        P.road,
        "The Road Goes Ever On · Search for a side quest?",
        [
          {
            id: "search",
            label: "The first player chooses a player to search",
            effects: [
              { ...e, kind: "haradPlayerRoadChoose", player: firstPlayer(s) },
            ],
          },
          { id: "skip", label: "Skip the response", effects: [] },
        ],
      );
      break;
    case "haradPlayerRoadChoose":
      choose(
        s,
        "The Road Goes Ever On · First player chooses a player",
        playerOrder(s).map((player) => ({
          id: `player-${player}`,
          label: seatName(s, player),
          effects: [fx("haradPlayerRoadSearch", { player })],
        })),
      );
      break;
    case "haradPlayerRoadSearch":
      roadSearch(s);
      break;
    case "haradPlayerRoadTake": {
      if (
        s.deck[e.value!] === e.code &&
        card(e.code!).type_code === "player-side-quest"
      )
        s.hand.push(takePlayerDeck(s, e.value!));
      shuffle(s, s.deck);
      break;
    }
    case "haradPlayerRoadShuffle":
      shuffle(s, s.deck);
      break;
    default:
      return false;
  }
  return true;
}
