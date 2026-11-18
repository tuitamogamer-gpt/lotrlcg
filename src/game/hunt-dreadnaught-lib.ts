import type { GameState, Unit } from "./types";
import { card } from "./cards";
import { log, make, shuffle } from "./core";
import { enterEnemyEngaged, raiseThreat } from "./board";
import { forOwner, globalEngaged, playerOrder, seatName } from "./table";
import { dealEnemyShadows } from "./considered-engagement";
import { isEnemy, isShipObjective } from "./ships";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { isPlayerCardSource } from "./player-effect-immunity";
import { HD, hdPhysical, hdPlayers } from "./hunt-dreadnaught-support";

/** Shared helpers of The Hunt for the Dreadnaught's stage and card modules. */
type Zones = Pick<
  GameState,
  "heroes" | "allies" | "engaged" | "hand" | "deck" | "discard" | "threat"
>;
/**
 * A player's own zones, read without building a full seat view (the active
 * seat's live zones are on the state; the others are on their seat).
 */
export const zones = (s: GameState, p: number): Zones =>
  !s.table || p === s.table.active ? s : (s.table.seats[p] as Zones);
export const live = (u: Unit, code: string) => u.code === code && !u.blanked;
export const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
export const who = (s: GameState, p: number) =>
  s.table ? seatName(s, p) : "you";
export const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
export const their = (s: GameState) => (s.table ? "their" : "your");
export const charactersOf = (s: GameState, p: number) => [
  ...zones(s, p).heroes,
  ...zones(s, p).allies,
];
/** The ship-objectives a player controls (the six ships, Gondorian Warships, a captured Skirmisher). */
export const shipsOf = (s: GameState, p: number) =>
  zones(s, p).allies.filter((u) => isShipObjective(u));
/** A unique ship a player controls (either side), unless blanked. */
export const shipOf = (s: GameState, p: number, code: string) =>
  shipsOf(s, p).find((u) => hdPhysical(u.code) === code && !u.blanked);
export const upgraded = (u: Unit) => u.code.endsWith(":B");
export const isDread = (u: Unit) => hdPhysical(u.code) === HD.dreadnaught;
export const enemiesInPlay = (s: GameState) => [
  ...s.staging.filter((u) => isEnemy(u)),
  ...globalEngaged(s),
];
export const dreadnaughtOf = (s: GameState) =>
  enemiesInPlay(s).find((u) => isDread(u));
/** The player an enemy is engaged with, if any. */
export function engagedWith(s: GameState, u: Unit) {
  for (const p of playerOrder(s))
    if (zones(s, p).engaged.some((x) => x.id === u.id)) return p;
  return undefined;
}
/** The player who controls a character in play. */
export const controllerOf = (s: GameState, u: Unit) =>
  playerOrder(s).find((p) => charactersOf(s, p).some((x) => x.id === u.id));
/** A player card effect is resolving (a played event or a player card's ability). */
export function byPlayerCard(s: GameState) {
  const ability = activePlayerAbilityCode(s);
  if (ability) return isPlayerCardSource(ability);
  const event = s.resolvingEvents?.at(-1)?.unit.code;
  return !!event && isPlayerCardSource(event);
}
export const roundMarked = (
  list: { id: string; round: number }[],
  s: GameState,
  id: string,
) => list.some((m) => m.id === id && m.round === s.round);
export function takeFrom(list: string[], c: string) {
  const i = list.indexOf(c);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
/** Raise a player's threat (an encounter effect). */
export function raiseFor(s: GameState, p: number, value: number) {
  forOwner(s, p, () => raiseThreat(s, value, "encounter"));
}
/** Isle of Fortune enters play with 1 resource per player on it. */
export function locationEntered(s: GameState, u: Unit) {
  if (u.code === HD.isle) u.resources = hdPlayers(s);
}
/** Add a set-aside or deck location to the staging area (setup). */
export function stageLocation(s: GameState, c: string) {
  const u = make(s, c);
  s.staging.push(u);
  locationEntered(s, u);
  return u;
}
/**
 * The top card of the Corsair deck. When the Corsair deck runs out of cards,
 * its discard pile is shuffled back at once.
 */
export function corsairTop(s: GameState) {
  const q = s.huntDreadnaught!;
  const refill = () => {
    if (q.corsairDeck.length || !q.corsairDiscard.length) return;
    q.corsairDeck = shuffle(s, q.corsairDiscard.splice(0));
    log(s, "The Corsair discard pile is shuffled back into the Corsair deck.");
  };
  refill();
  const c = q.corsairDeck.shift();
  refill();
  return c;
}
/** Put the top card of the Corsair deck into play engaged with a player. */
export function corsairIntoPlay(
  s: GameState,
  p: number,
  shadows: number,
  source: string,
) {
  const c = corsairTop(s);
  if (!c) {
    log(s, `${source}: the Corsair deck is empty.`);
    return undefined;
  }
  const u = make(s, c);
  enterEnemyEngaged(s, u, p);
  log(
    s,
    `${source}: ${card(c).name} is put into play engaged with ${who(s, p)}.`,
    "danger",
  );
  if (shadows > 0 && globalEngaged(s).some((x) => x.id === u.id))
    dealEnemyShadows(s, u, shadows);
  return u;
}
