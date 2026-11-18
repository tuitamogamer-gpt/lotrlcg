import type { GameState, Unit } from "./types";
import { card, name } from "./cards";
import { log, make } from "./core";
import { enemyAddedToStaging } from "./board";
import { globalEngaged, playerOrder, seatName, seatView } from "./table";
/** Shared helpers of the 2018 Fellowship event scenarios' stage and card modules. */
export const live = (u: Unit, code: string) => u.code === code && !u.blanked;
export const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
export const who = (s: GameState, p: number) =>
  s.table ? seatName(s, p) : "you";
export const his = (s: GameState) => (s.table ? "his" : "your");
export const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
/** A round and phase, for effects that last until the end of the phase. */
export const phaseKey = (s: GameState) =>
  `${s.round}:${
    s.phase === "defense" || s.phase === "attack"
      ? "combat"
      : s.phase === "staging"
        ? "quest"
        : s.phase
  }`;
export const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
export const players = (s: GameState) => playerOrder(s).length;
/** The stage number of the main quest, kept with its quest card. */
export const stageNumber = (s: GameState) => s.stage;
export const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
export const isLocation = (u: Unit) => card(u.code).type_code === "location";
export const traitsOf = (c: string) =>
  (card(c).traits ?? "").split(".").map((t) => t.trim());
/** The player an enemy is engaged with, if any. */
export function engagedWith(s: GameState, u: Unit) {
  for (const p of playerOrder(s))
    if (seatView(s, p).engaged.some((x) => x.id === u.id)) return p;
  return undefined;
}
export const enemiesInPlay = (s: GameState) => [
  ...s.staging.filter(isEnemy),
  ...globalEngaged(s),
];
export const inPlay = (s: GameState, id: string) =>
  [
    ...s.staging,
    ...globalEngaged(s),
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].some((u) => u.id === id);
/** Take an enemy out of the engaged area or the staging area (its shadows are discarded). */
export function liftEnemy(s: GameState, u: Unit) {
  const owner = engagedWith(s, u);
  if (owner !== undefined) {
    const seat = s.table?.seats[owner];
    if (seat) seat.engaged = seat.engaged.filter((x) => x.id !== u.id);
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  }
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  return owner;
}
/** Return an engaged enemy to the staging area. */
export function returnToStaging(s: GameState, u: Unit) {
  if (engagedWith(s, u) === undefined) return false;
  liftEnemy(s, u);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  s.queue = s.queue.filter(
    (e) => !(e.kind === "immediateAttack" && e.target === u.id),
  );
  return true;
}
export function toStaging(s: GameState, c: string) {
  const u = make(s, c);
  s.staging.push(u);
  if (isEnemy(u)) enemyAddedToStaging(s, u);
  return u;
}
/** Remove progress from the main quest; true if any was removed. */
export function removeProgress(s: GameState, n: number, source: string) {
  const removed = Math.min(s.progress, n);
  if (removed <= 0) return false;
  s.progress -= removed;
  log(
    s,
    `${source}: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the quest.`,
    "danger",
  );
  return true;
}
export function takeFrom(list: string[], c: string) {
  const i = list.indexOf(c);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
/** The distinct cards in the encounter deck and discard pile passing a test. */
export const searchable = (
  s: GameState,
  test: (c: string) => boolean,
  discard = true,
) =>
  [
    ...new Set(
      [...s.encounterDeck, ...(discard ? s.encounterDiscard : [])].filter(test),
    ),
  ].sort((a, b) => card(a).name.localeCompare(card(b).name));
/** Take a searched copy: from the encounter deck if one is there, else the discard pile. */
export function takeSearched(s: GameState, c: string) {
  return takeFrom(s.encounterDeck, c) || takeFrom(s.encounterDiscard, c);
}
export const label = (u: Unit) => name(u);
