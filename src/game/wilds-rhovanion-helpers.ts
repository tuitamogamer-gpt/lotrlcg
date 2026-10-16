import type { GameState, Unit } from "./types";
import { card } from "./cards";
import { fx, make, prepend, shuffle } from "./core";
import { enemyAddedToStaging, engage } from "./board";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import {
  WILDS_EVIL_CREATURES,
  WILDS_OBJECTIVE_LOCATIONS,
} from "./wilds-rhovanion-support";
export const wildsLive = (s: GameState) => !!s.wildsRhovanion;
export const wildsAnduin = (s: GameState) =>
  !!s.wildsRhovanion && s.scenarioId === "journey-up-the-anduin";
export const wildsMirkwood = (s: GameState) =>
  !!s.wildsRhovanion && s.scenarioId === "lost-in-mirkwood";
export const wildsKings = (s: GameState) =>
  !!s.wildsRhovanion && s.scenarioId === "the-kings-quest";
export const wildsEnemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
export const wildsLocations = (s: GameState) =>
  [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].filter((u) => card(u.code).type_code === "location");
export const wildsOwn = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
export const wildsTrait = (u: Unit | string, t: string) =>
  (card(typeof u === "string" ? u : u.code).traits ?? "")
    .split(".")
    .some((v) => v.trim() === t);
export const wildsObjective = (u: Unit) =>
  WILDS_OBJECTIVE_LOCATIONS.includes(u.code);
export const wildsDark = (s: GameState) =>
  !!s.activeLocation && wildsTrait(s.activeLocation, "Dark");
export const wildsQuestLive = (s: GameState, code: string) =>
  !!s.wildsRhovanion && s.wildsRhovanion.currentQuest === code;
export function wildsAdd(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") {
    enemyAddedToStaging(s, u);
    if (player !== undefined) forOwner(s, player, () => engage(s, u));
  }
  return u;
}
export function wildsShuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
/** Discard, rather than reveal: keywords and When Revealed effects never fire. */
export function wildsDiscardUntil(
  s: GameState,
  accepts: (code: string) => boolean,
  reshuffle = false,
) {
  const seen = new Set<string>();
  let remaining = s.encounterDeck.length + s.encounterDiscard.length;
  while (remaining-- > 0) {
    if (!s.encounterDeck.length) {
      if (!reshuffle || !s.encounterDiscard.length) break;
      wildsShuffleDiscard(s);
    }
    const code = s.encounterDeck.shift();
    if (!code) break;
    if (accepts(code)) return code;
    s.encounterDiscard.push(code);
    seen.add(code);
  }
  return undefined;
}
export function wildsTakeAside(s: GameState, code: string) {
  const q = s.wildsRhovanion!;
  const i = q.setAside.findIndex((u) => u.code === code);
  return i < 0 ? undefined : q.setAside.splice(i, 1)[0];
}
export function wildsEvil(s: GameState, player?: number) {
  const q = s.wildsRhovanion!;
  if (!q.evilDeck.length && q.evilDiscard.length)
    q.evilDeck = shuffle(s, q.evilDiscard.splice(0));
  const code = q.evilDeck.shift();
  if (!code) return;
  const u = wildsAdd(s, code, player);
  if (!q.evilDeck.length && q.evilDiscard.length)
    q.evilDeck = shuffle(s, q.evilDiscard.splice(0));
  return u;
}
export function wildsGuard(
  s: GameState,
  objective: Unit,
  type: "enemy" | "location",
) {
  const q = s.wildsRhovanion!;
  if (!q.pendingGuarded.includes(objective.id))
    q.pendingGuarded.push(objective.id);
  prepend(
    s,
    fx("wildsRhovanionGuard", {
      target: objective.id,
      text: type,
      player: firstPlayer(s),
    }),
  );
}
export function wildsGuarded(s: GameState, u: Unit) {
  return (
    !!s.wildsRhovanion?.pendingGuarded.includes(u.id) ||
    [...wildsEnemies(s), ...wildsLocations(s)].some(
      (g) => g.guarding === u.id || g.cobasGuarding?.includes(u.id),
    )
  );
}
export function wildsNoReady(s: GameState, id: string) {
  const q = s.wildsRhovanion!;
  q.noReady = q.noReady.filter((m) => m.id !== id);
  q.noReady.push({ id, round: s.round });
}
export const wildsPlayerEffects = (
  s: GameState,
  kind: string,
  value?: number,
) =>
  playerOrder(s).map((player) =>
    fx(kind, { player, ...(value === undefined ? {} : { value }) }),
  );
export function wildsDetachUnit(s: GameState, u: Unit) {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  s.extraActiveLocations = s.extraActiveLocations?.filter((x) => x.id !== u.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
      s.allies = s.allies.filter((x) => x.id !== u.id);
      s.heroes = s.heroes.filter((x) => x.id !== u.id);
    });
}
export const wildsEvilCode = (s: GameState, code: string) =>
  wildsAnduin(s) && WILDS_EVIL_CREATURES.includes(code);
