import { consideredEngaged } from "./considered-engagement";
import { amonPlayerCanAttackEnemy } from "./amon-din-player-cards";
import { druadanPlayerPhaseStarted } from "./druadan-player-cards";
import { longDarkCanAttack } from "./long-dark";
import { canFight } from "./core";
import { redhornCanDefend } from "./redhorn-gate";
import { rohanStagingAttack } from "./rohan-player-cards";
import { khazadCanAttack, khazadCanRangedAttack, KHAZAD } from "./khazad-dum";
import type { Attachment, Effect, GameState, PlayerSeat, Unit } from "./types";
import { card } from "./cards";
import { effectiveKeyword } from "./expansion-passives";
import { rhosgobelCanFight } from "./rhosgobel";
import { foundationsCanFight } from "./foundations-stone";
import { heirsCanDefend } from "./heirs-numenor";
import {
  foundationsAreaPlayers,
  foundationsAreaView,
  foundationsSyncArea,
  foundationsSelectArea,
} from "./foundations-stone-support";

// The top-level player fields are the active seat's projection. This keeps
// existing single-player saves and card scripts compatible with the shared table.
export const PLAYER_FIELDS = [
  "deckId",
  "customDeck",
  "startingHeroes",
  "startingThreat",
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
    // Optional fields stay absent rather than undefined so saves round-trip exactly.
    ...PLAYER_FIELDS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]),
    ["eliminated", s.table?.seats[activeSeat(s)]?.eliminated ?? false],
  ]) as PlayerSeat;
}
export function syncSeat(s: GameState) {
  foundationsSyncArea(s);
  if (s.table) Object.assign(s.table.seats[s.table.active], snapshotSeat(s));
}
export function selectSeat(s: GameState, i: number) {
  if (!s.table || i === s.table.active) return;
  syncSeat(s);
  s.table.active = i;
  foundationsSelectArea(s, i);
  for (const key of PLAYER_FIELDS) {
    if (s.table.seats[i][key] === undefined) delete s[key];
    else Object.assign(s, { [key]: s.table.seats[i][key] });
  }
}
export function seatView(s: GameState, i: number): GameState {
  if (!s.table || i === s.table.active) return s;
  foundationsSyncArea(s);
  const view = {
    ...s,
    ...s.table.seats[i],
    ...foundationsAreaView(s, i),
    table: { ...s.table, active: i },
  };
  if (s.table.seats[i].customDeck === undefined) delete view.customDeck;
  return view;
}
export const seatIndices = (s: GameState) =>
  s.table ? s.table.seats.map((_, i) => i) : [0];
export const globalLivingSeats = (s: GameState) =>
  seatIndices(s).filter((i) => !s.table?.seats[i].eliminated);
export const livingSeats = (s: GameState) => {
  const area = foundationsAreaPlayers(s);
  return globalLivingSeats(s).filter((i) => !area || area.includes(i));
};
export function globalPlayerOrder(s: GameState) {
  const first = s.table?.first ?? 0,
    count = s.table?.seats.length ?? 1;
  return Array.from({ length: count }, (_, i) => (i + first) % count).filter(
    (i) => globalLivingSeats(s).includes(i),
  );
}
export const playerOrder = (s: GameState) => {
  const area = foundationsAreaPlayers(s);
  return globalPlayerOrder(s).filter((i) => !area || area.includes(i));
};
export const firstPlayer = (s: GameState) =>
  playerOrder(s)[0] ?? s.table?.first ?? 0;
function restoreSeat(s: GameState, previous: number) {
  const fallback = s.table?.turn ?? previous;
  const player =
    s.status === "playing" && s.table?.seats[previous].eliminated
      ? !s.table.seats[fallback].eliminated
        ? fallback
        : (globalPlayerOrder(s)[0] ?? previous)
      : previous;
  selectSeat(s, player);
}
export function eachSeat(
  s: GameState,
  run: (seat: number) => void,
  includeEliminated = false,
) {
  const previous = activeSeat(s);
  const area = foundationsAreaPlayers(s);
  const players = includeEliminated
    ? seatIndices(s).filter((i) => !area || area.includes(i))
    : playerOrder(s);
  for (const i of players) {
    selectSeat(s, i);
    run(i);
    syncSeat(s);
  }
  restoreSeat(s, previous);
}
export function globalEachSeat(
  s: GameState,
  run: (seat: number) => void,
  includeEliminated = false,
) {
  const previous = activeSeat(s);
  for (const i of includeEliminated ? seatIndices(s) : globalPlayerOrder(s)) {
    selectSeat(s, i);
    run(i);
    syncSeat(s);
  }
  restoreSeat(s, previous);
}
/** Once per distinct staging area, in global first-player order. */
export function eachArea(s: GameState, run: () => void) {
  const previous = activeSeat(s);
  const visited = new Set<number>();
  for (const i of globalPlayerOrder(s)) {
    if (visited.has(i)) continue;
    selectSeat(s, i);
    for (const player of playerOrder(s)) visited.add(player);
    run();
    syncSeat(s);
  }
  restoreSeat(s, previous);
}
export const globalCharacters = (s: GameState) =>
  seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return [...p.heroes, ...p.allies];
  });
export const allCharacters = (s: GameState) => {
  const area = foundationsAreaPlayers(s);
  return globalCharacters(s).filter(
    (u) => !area || area.includes(ownerOf(s, u)),
  );
};
export const globalHeroes = (s: GameState) =>
  globalCharacters(s).filter((u) => card(u.code).type_code === "hero");
export const allHeroes = (s: GameState) =>
  allCharacters(s).filter((u) => card(u.code).type_code === "hero");
export const globalEngaged = (s: GameState) =>
  seatIndices(s).flatMap((i) => seatView(s, i).engaged);
export const allEngaged = (s: GameState) => {
  const area = foundationsAreaPlayers(s);
  return globalEngaged(s).filter((u) => !area || area.includes(ownerOf(s, u)));
};
export const allActiveLocations = (s: GameState) => [
  ...(s.activeLocation ? [s.activeLocation] : []),
  ...(s.extraActiveLocations ?? []),
];
export function removeActiveLocation(s: GameState, id: string) {
  const remaining = allActiveLocations(s).filter((u) => u.id !== id);
  s.activeLocation = remaining.shift() ?? null;
  s.extraActiveLocations = remaining;
}
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
/** Player attachments follow their host's controller; ownership never changes. */
export function attachmentController(s: GameState, host: Unit, a: Attachment) {
  if (a.code === KHAZAD.fear) return ownerOf(s, host);
  return card(a.code).sphere_code === "encounter" &&
    card(a.code).type_code !== "objective"
    ? null
    : ["hero", "ally", "objective-ally"].includes(card(host.code).type_code)
      ? ownerOf(s, host)
      : (a.owner ?? activeSeat(s));
}
export function forOwner(s: GameState, owner: number, run: () => void) {
  const previous = activeSeat(s);
  selectSeat(s, owner);
  run();
  syncSeat(s);
  restoreSeat(s, previous);
}
export const scopedEffect = (s: GameState, e: Effect): Effect =>
  s.table && e.player === undefined ? { ...e, player: s.table.active } : e;
export function startPhase(s: GameState, phase: GameState["phase"]) {
  const previous = s.phase;
  s.phase = phase;
  eachArea(s, () => druadanPlayerPhaseStarted(s, previous, phase));
  if (s.table) {
    s.table.passed = [];
    s.table.turn = globalPlayerOrder(s)[0] ?? 0;
    selectSeat(s, s.table.turn);
  }
}
export function passSeat(s: GameState) {
  if (!s.table) return true;
  if (!s.table.passed.includes(s.table.active))
    s.table.passed.push(s.table.active);
  const next = globalPlayerOrder(s).find((i) => !s.table!.passed.includes(i));
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
  effectiveKeyword(u, keyword);
export const defendersFor = (s: GameState, enemy?: Unit) =>
  allCharacters(s).filter(
    (u) =>
      !u.exhausted &&
      canFight(u) &&
      (!enemy ||
        (rhosgobelCanFight(enemy, u) &&
          redhornCanDefend(enemy, u) &&
          foundationsCanFight(enemy, u) &&
          heirsCanDefend(s, enemy, u))) &&
      (ownerOf(s, u) === activeSeat(s) || hasKeyword(u, "Sentinel")) &&
      !u.attachments.some((a) => !a.blanked && a.code === "01108"),
  );
export const attackersFor = (s: GameState, enemy: Unit) =>
  allCharacters(s).filter(
    (u) =>
      !u.exhausted &&
      longDarkCanAttack(s, enemy) &&
      canFight(u) &&
      khazadCanAttack(u) &&
      khazadCanRangedAttack(s, enemy, u, ownerOf(s, enemy) !== ownerOf(s, u)) &&
      rhosgobelCanFight(enemy, u) &&
      foundationsCanFight(enemy, u) &&
      !u.attachments.some((a) => !a.blanked && a.code === "01108") &&
      (amonPlayerCanAttackEnemy(s, enemy, u) ||
        (ownerOf(s, u) === activeSeat(s) &&
          (consideredEngaged(s, enemy) ||
            (s.staging.some((e) => e.id === enemy.id)
              ? u.code === "01009" ||
                rohanStagingAttack(s, u) ||
                (enemy.code === KHAZAD.archer && hasKeyword(u, "Ranged"))
              : ownerOf(s, enemy) === activeSeat(s)))) ||
        ((!s.staging.some((e) => e.id === enemy.id) ||
          playerOrder(s).some((p) => consideredEngaged(s, enemy, p))) &&
          hasKeyword(u, "Ranged"))),
  );
