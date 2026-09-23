import type { Effect, GameState, PlayerSeat, Unit } from "./types";
import { card } from "./cards";

// The top-level player fields are the active seat's projection. This keeps
// existing single-player saves and card scripts compatible with the shared table.
export const PLAYER_FIELDS = [
  "deckId",
  "startingHeroes",
  "threat",
  "heroes",
  "allies",
  "hand",
  "deck",
  "discard",
  "removed",
  "engaged",
  "fallenThreat",
  "committedIds",
  "faramir",
  "eowynUsed",
  "mulled",
  "optionalEngagement",
  "shackles",
  "peek",
  "used",
  "standTogether",
] as const;
export const activeSeat = (s: GameState) => s.table?.active ?? 0;
export function snapshotSeat(s: GameState): PlayerSeat {
  return Object.fromEntries([
    ...PLAYER_FIELDS.map((k) => [k, s[k]]),
    ["eliminated", s.table?.seats[activeSeat(s)]?.eliminated ?? false],
  ]) as PlayerSeat;
}
export function syncSeat(s: GameState) {
  if (s.table) Object.assign(s.table.seats[s.table.active], snapshotSeat(s));
}
export function selectSeat(s: GameState, i: number) {
  if (!s.table || i === s.table.active) return;
  syncSeat(s);
  s.table.active = i;
  for (const key of PLAYER_FIELDS)
    Object.assign(s, { [key]: s.table.seats[i][key] });
}
export function seatView(s: GameState, i: number): GameState {
  return !s.table || i === s.table.active
    ? s
    : { ...s, ...s.table.seats[i], table: { ...s.table, active: i } };
}
export const seatIndices = (s: GameState) =>
  s.table ? s.table.seats.map((_, i) => i) : [0];
export const livingSeats = (s: GameState) =>
  seatIndices(s).filter((i) => !s.table?.seats[i].eliminated);
export function playerOrder(s: GameState) {
  const first = s.table?.first ?? 0,
    count = s.table?.seats.length ?? 1;
  return Array.from({ length: count }, (_, i) => (i + first) % count).filter(
    (i) => livingSeats(s).includes(i),
  );
}
export function eachSeat(
  s: GameState,
  run: (seat: number) => void,
  includeEliminated = false,
) {
  const previous = activeSeat(s);
  for (const i of includeEliminated ? seatIndices(s) : playerOrder(s)) {
    selectSeat(s, i);
    run(i);
    syncSeat(s);
  }
  selectSeat(s, previous);
}
export const allCharacters = (s: GameState) =>
  seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return [...p.heroes, ...p.allies];
  });
export const allHeroes = (s: GameState) =>
  allCharacters(s).filter((u) => card(u.code).type_code === "hero");
export const allEngaged = (s: GameState) =>
  seatIndices(s).flatMap((i) => seatView(s, i).engaged);
export function ownerOf(s: GameState, u: Unit) {
  return s.table
    ? (seatIndices(s).find((i) => {
        const p = seatView(s, i);
        return [...p.heroes, ...p.allies, ...p.hand, ...p.engaged].some(
          (x) => x.id === u.id,
        );
      }) ??
        u.owner ??
        activeSeat(s))
    : 0;
}
export function forOwner(s: GameState, owner: number, run: () => void) {
  const previous = activeSeat(s);
  selectSeat(s, owner);
  run();
  syncSeat(s);
  selectSeat(s, previous);
}
export const scopedEffect = (s: GameState, e: Effect): Effect =>
  s.table && e.player === undefined ? { ...e, player: s.table.active } : e;
export function startPhase(s: GameState, phase: GameState["phase"]) {
  s.phase = phase;
  if (s.table) {
    s.table.passed = [];
    s.table.turn = playerOrder(s)[0] ?? 0;
    selectSeat(s, s.table.turn);
  }
}
export function passSeat(s: GameState) {
  if (!s.table) return true;
  if (!s.table.passed.includes(s.table.active))
    s.table.passed.push(s.table.active);
  const next = playerOrder(s).find((i) => !s.table!.passed.includes(i));
  if (next === undefined) return true;
  s.table.turn = next;
  selectSeat(s, next);
  return false;
}
export const seatName = (s: GameState, i: number) =>
  seatView(s, i)
    .startingHeroes.map((c) => card(c).name)
    .join(" & ");
export const hasKeyword = (u: Unit, keyword: string) =>
  (card(u.code).text ?? "").includes(keyword);
export const defendersFor = (s: GameState) =>
  allCharacters(s).filter(
    (u) =>
      !u.exhausted &&
      (ownerOf(s, u) === activeSeat(s) || hasKeyword(u, "Sentinel")) &&
      !u.attachments.some((a) => a.code === "01108"),
  );
export const attackersFor = (s: GameState, enemy: Unit) =>
  allCharacters(s).filter(
    (u) =>
      !u.exhausted &&
      !u.attachments.some((a) => a.code === "01108") &&
      (s.staging.some((e) => e.id === enemy.id)
        ? ownerOf(s, u) === activeSeat(s) && u.code === "01009"
        : (ownerOf(s, enemy) === activeSeat(s) &&
            ownerOf(s, u) === activeSeat(s)) ||
          hasKeyword(u, "Ranged")),
  );
