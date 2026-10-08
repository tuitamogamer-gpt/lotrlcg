import type { Effect, GameState, Option } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, requireRule, shuffle } from "./core";
import { enterAlly } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  playerOrder,
  seatName,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { removePlayedEvent } from "./event-resolution";
import { hasEncounterKeyword } from "./encounter-keyword";

export const RANGER_NORTH = "09015";
export const RANGER_SUMMONS = "09007";
export const rangerReserve = (s: GameState, p = activeSeat(s)) =>
  s.rangerReserves?.[p] ?? 3;
export function rangerPlayProblem(s: GameState, code: string) {
  if (hasEncounterKeyword(card(code)))
    return "Encounter allies start set aside and cannot be played from a player’s hand.";
  if (code !== RANGER_SUMMONS) return null;
  if (!s.heroes.some((h) => hasTrait(h, "Dúnedain")))
    return "Ranger Summons requires a Dúnedain hero you control.";
  if (!rangerReserve(s))
    return "There are no Rangers left in your set-aside reserve.";
  return null;
}
export function rangerEvent(s: GameState, code: string) {
  if (code !== RANGER_SUMMONS) return false;
  requireRule(!rangerPlayProblem(s, code), rangerPlayProblem(s, code) ?? "");
  const player = activeSeat(s);
  (s.rangerReserves ??= {})[player] = rangerReserve(s, player) - 1;
  s.encounterDeck.push(RANGER_NORTH);
  shuffle(s, s.encounterDeck);
  removePlayedEvent(s, RANGER_SUMMONS);
  log(
    s,
    `A Ranger of the North joins the encounter deck · ${rangerReserve(s)} remain set aside.`,
    "good",
  );
  return true;
}
export function rangerRevealed(s: GameState, id: string) {
  prepend(s, fx("northChoosePlayer", { target: id, player: firstPlayer(s) }));
}
export function rangerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("north")) return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "northChoosePlayer":
      if (u)
        choose(
          s,
          "Ranger of the North · Choose a fellowship",
          playerOrder(s).map((player) => ({
            id: `player-${player}`,
            label: seatName(s, player),
            effects: [
              fx("northTakeControl", {
                target: u.id,
                value: player,
                player: firstPlayer(s),
              }),
            ],
          })),
        );
      break;
    case "northTakeControl":
      if (u && e.value !== undefined && playerOrder(s).includes(e.value)) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        u.owner = e.value;
        // Finish the printed When Revealed before resolving its Surge continuation.
        prepend(s, fx("northAid", { player: firstPlayer(s) }));
        forOwner(s, e.value, () => enterAlly(s, u, false));
      }
      break;
    case "northAid": {
      const options: Option[] = [
        ...[...s.staging, ...allEngaged(s)]
          .filter(
            (x) => card(x.code).type_code === "enemy" && !playerCardImmune(x),
          )
          .map((x) => ({
            id: `damage-${x.id}`,
            code: x.code,
            label: `Deal 2 damage to ${name(x)}`,
            effects: [fx("damage", { target: x.id, value: 2 })],
          })),
        ...[...s.staging, ...allActiveLocations(s)]
          .filter(
            (x) =>
              card(x.code).type_code === "location" && !playerCardImmune(x),
          )
          .map((x) => ({
            id: `progress-${x.id}`,
            code: x.code,
            label: `Place 2 progress on ${name(x)}`,
            effects: [fx("locationProgress", { target: x.id, value: 2 })],
          })),
      ];
      if (options.length)
        choose(s, "Ranger of the North · Aid the quest", options);
      break;
    }
    default:
      return false;
  }
  return true;
}
