import type { GameState, Unit } from "./types";
import { card } from "./cards";
import { log, make, spendResources } from "./core";
import { depositInFlightEncounterCards } from "./board";
import {
  firstPlayer,
  forOwner,
  globalCharacters,
  globalPlayerOrder,
  ownerOf,
} from "./table";
import { HOBBIT_BILBO, isHobbitScenarioId } from "./hobbit-codes";
export * from "./hobbit-codes";

/**
 * The Hobbit saga rules shared by its scenarios: the Baggins-sphere Bilbo
 * Baggins is controlled by the first player in addition to that player's
 * heroes, follows the first player token with his resources and attachments,
 * and the players lose the game if he leaves play.
 */
export const hobbitSaga = (s: GameState) => isHobbitScenarioId(s.scenarioId);
export const bagginsBilbo = (s: GameState): Unit | undefined =>
  globalCharacters(s).find((u) => u.code === HOBBIT_BILBO);
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
    const bilbo = make(s, HOBBIT_BILBO);
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
