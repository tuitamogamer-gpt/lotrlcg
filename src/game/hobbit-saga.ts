import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  choose,
  draw,
  fx,
  get,
  log,
  make,
  prepend,
  requireRule,
  spendResources,
} from "./core";
import { depositInFlightEncounterCards } from "./board";
import { ereborKillResponses } from "./erebor-treasures";
import {
  firstPlayer,
  forOwner,
  globalCharacters,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatIndices,
} from "./table";
import {
  hobbitBilboCode,
  scenarioTreasures,
  isBagginsBilbo,
  HOBBIT_TREASURE_SCENARIOS,
  HOBBIT_X_THREAT,
  isHobbitScenarioId,
} from "./hobbit-codes";
export * from "./hobbit-codes";

/**
 * The Hobbit saga rules shared by its scenarios: the Baggins-sphere Bilbo
 * Baggins is controlled by the first player in addition to that player's
 * heroes, follows the first player token with his resources and attachments,
 * and the players lose the game if he leaves play.
 */
export const hobbitSaga = (s: GameState) => isHobbitScenarioId(s.scenarioId);
export const bagginsBilbo = (s: GameState): Unit | undefined =>
  globalCharacters(s).find((u) => isBagginsBilbo(u.code));
/** Only Bilbo's resource pool holds Baggins resources. */
export const bagginsResources = (s: GameState) =>
  bagginsBilbo(s)?.resources ?? 0;
export function spendBaggins(s: GameState, amount: number) {
  const bilbo = bagginsBilbo(s);
  if (!bilbo || bilbo.resources < amount) return false;
  spendResources(s, bilbo, amount);
  return true;
}
/** Setup: the first player gains control of Bilbo (threat cost 0). */
export function placeBagginsBilbo(s: GameState) {
  if (!hobbitSaga(s) || bagginsBilbo(s)) return;
  const first = s.table?.first ?? 0;
  forOwner(s, first, () => {
    const bilbo = make(s, hobbitBilboCode(s.scenarioId));
    bilbo.owner = first;
    bilbo.controller = first;
    s.heroes.push(bilbo);
  });
  log(
    s,
    `${s.table ? `Player ${first + 1}` : "The first player"} gains control of Bilbo Baggins.`,
    "good",
  );
}
/** Control of Bilbo passes with the first player token. */
export function bagginsBilboFollowsFirstPlayer(s: GameState) {
  const bilbo = bagginsBilbo(s);
  if (!bilbo || !s.table || !hobbitSaga(s)) return;
  const from = ownerOf(s, bilbo),
    to = firstPlayer(s);
  if (from === to || !globalPlayerOrder(s).includes(to)) return;
  forOwner(s, from, () => {
    s.heroes = s.heroes.filter((u) => u.id !== bilbo.id);
    s.committedIds = s.committedIds.filter((id) => id !== bilbo.id);
  });
  bilbo.owner = to;
  bilbo.controller = to;
  forOwner(s, to, () => s.heroes.push(bilbo));
  log(
    s,
    `Player ${to + 1} gains control of Bilbo Baggins, his resources and attachments.`,
  );
}
export function loseBilbo(s: GameState) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = "Bilbo Baggins has left play. The players lose the game.";
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, s.reason, "danger");
}
/** A Baggins card or a neutral card may be paid with Bilbo's resources. */
export const bagginsCanPay = (code: string) =>
  ["baggins", "neutral"].includes(card(code).sphere_code ?? "");

/** Setup: each player adds the treasures they discovered to their deck. */
export function addHobbitTreasures(
  s: GameState,
  treasures: Record<number, string[]> | undefined,
) {
  const entries = Object.entries(treasures ?? {}).filter(
    ([, codes]) => codes.length,
  );
  if (!entries.length) return;
  requireRule(
    HOBBIT_TREASURE_SCENARIOS.includes(s.scenarioId),
    "Treasures join decks only in Hobbit scenarios whose setup lists their treasure set.",
  );
  const all = entries.flatMap(([, codes]) => codes);
  const allowed = scenarioTreasures(s.scenarioId);
  requireRule(
    all.every((c) => allowed.includes(c)),
    "Only treasures from a set this scenario's setup lists may join decks.",
  );
  requireRule(
    new Set(all).size === all.length,
    "Each discovered treasure joins one deck, at most once.",
  );
  for (const [seat, codes] of entries) {
    const player = Number(seat);
    requireRule(
      seatIndices(s).includes(player),
      "A treasure must join a player's deck.",
    );
    forOwner(s, player, () => s.deck.push(...codes));
  }
  log(
    s,
    `Discovered treasures join the decks: ${all.map((c) => card(c).name).join(", ")}.`,
    "good",
  );
}
const STING = "131020",
  ORCRIST = "131021",
  GLAMDRING = "131022";
const live = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code && !a.blanked);
/** Sting: after Bilbo exhausts to defend. */
export function hobbitTreasureDefense(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  const bilbo = defenders.find(
    (d) => isBagginsBilbo(d.code) && d.exhausted && live(d, STING),
  );
  return bilbo
    ? [fx("hobbitSting", { target: enemy.id, player: ownerOf(s, bilbo) })]
    : [];
}
/** Orcrist and Glamdring: after the attached character destroys an Orc enemy. */
export function hobbitTreasureKill(
  s: GameState,
  enemy: Unit,
  ids: string[],
  amount: number,
  remainingHealth: number,
): Effect[] {
  if (amount < remainingHealth || get(s, enemy.id)) return [];
  const axe = ereborKillResponses(s, ids);
  if (!/\bOrc\b/.test(card(enemy.code).traits ?? "")) return axe;
  return [
    ...axe,
    ...ids.flatMap((id) => {
      const u = get(s, id);
      if (!u) return [];
      return [
        ...(live(u, ORCRIST) && card(u.code).type_code === "hero"
          ? [fx("hobbitOrcrist", { target: u.id, player: ownerOf(s, u) })]
          : []),
        ...(live(u, GLAMDRING)
          ? [fx("hobbitGlamdring", { target: u.id, player: ownerOf(s, u) })]
          : []),
      ];
    }),
  ];
}
const printedThreat = (s: GameState, code: string) =>
  card(code).threat ?? (HOBBIT_X_THREAT[code] ?? 0) * playerOrder(s).length;
export function hobbitTreasureEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "hobbitSting":
      if (!u || !s.encounterDeck.length) break;
      choose(
        s,
        "Sting · Discard the top encounter card to damage the attacker?",
        [
          {
            id: "sting",
            label: "Discard the top card and deal damage equal to its threat",
            effects: [
              fx("hobbitStingResolve", { target: u.id, player: e.player }),
            ],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
      );
      break;
    case "hobbitStingResolve": {
      const code = s.encounterDeck.shift();
      if (!code) break;
      s.encounterDiscard.push(code);
      const amount = printedThreat(s, code);
      log(s, `Sting discards ${card(code).name} (${amount} threat).`, "good");
      if (u && amount > 0)
        prepend(
          s,
          fx("damage", { target: u.id, value: amount, player: e.player }),
        );
      break;
    }
    case "hobbitOrcrist":
      if (!u || !canGainResources(s, u)) break;
      choose(s, `Orcrist · Add 1 resource to ${name(u)}?`, [
        {
          id: "orcrist",
          label: `Add 1 resource to ${name(u)}`,
          effects: [
            fx("hobbitOrcristGain", { target: u.id, player: e.player }),
          ],
        },
        { id: "skip", label: "Decline", effects: [] },
      ]);
      break;
    case "hobbitOrcristGain":
      if (u && canGainResources(s, u)) {
        u.resources++;
        log(s, `Orcrist adds 1 resource to ${name(u)}.`, "good");
      }
      break;
    case "hobbitGlamdring":
      if (!u) break;
      choose(s, "Glamdring · Draw 1 card?", [
        {
          id: "glamdring",
          label: "Draw 1 card",
          effects: [fx("hobbitGlamdringDraw", { player: e.player })],
        },
        { id: "skip", label: "Decline", effects: [] },
      ]);
      break;
    case "hobbitGlamdringDraw":
      forOwner(s, e.player ?? firstPlayer(s), () => draw(s, 1));
      break;
    default:
      return false;
  }
  return true;
}
