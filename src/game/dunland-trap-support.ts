import encounters from "../data/dunland-trap-encounter-cards.json";
import quests from "../data/dunland-trap-quest-cards.json";
import recipes from "../data/dunland-trap-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const DUNLAND_TRAP_ENCOUNTERS = encounters as Card[];
export const DUNLAND_TRAP_QUESTS = quests as Card[];
export const DUNLAND_TRAP_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find(
    (c) => c.name.normalize("NFC") === name.normalize("NFC"),
  )!.code;
export const DUNLAND_TRAP = {
  roadQuest: code("The Road to Tharbad"),
  trap: code("A Well Laid Trap"),
  noWay: code("No Way Out"),
  stalker: code("Boar Clan Stalker"),
  warrior: code("Boar Clan Warrior"),
  foothills: code("Hithaeglir Foothills"),
  hills: code("Hills of Dunland"),
  plains: code("Plains of Enedwaith"),
  stream: code("Hithaeglir Stream"),
  frenzied: code("Frenzied Attack"),
  ambush: code("Dunlending Ambush"),
  turch: code("Chief Turch"),
  ravine: code("Munuv Dûv Ravine"),
  road: code("Old South Road"),
};
export interface DunlandTrapState {
  initialized: boolean;
  time: number;
  setAside: Unit[];
  stageThreeReady?: boolean;
  lastStand?: boolean;
  frenziedDiscarded?: number;
}
export const dunlandTimeLimit = (s: GameState) =>
  s.stage === 1 ? 2 : s.stage === 2 ? 0 : 5 * (s.table?.seats.length ?? 1);
export function validateDunlandTrapState(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.dunlandTrap;
  if (q === undefined) return s.scenarioId !== "the-dunland-trap";
  if (
    s.scenarioId !== "the-dunland-trap" ||
    !q ||
    typeof q.initialized !== "boolean" ||
    !Number.isSafeInteger(q.time) ||
    q.time < 0 ||
    q.time > dunlandTimeLimit(s) ||
    (!q.initialized && (s.stage !== 1 || q.time !== 0)) ||
    !Array.isArray(q.setAside) ||
    q.setAside.some(
      (u) =>
        !validUnit(u) ||
        (u.owner !== undefined && u.owner >= (s.table?.seats.length ?? 1)) ||
        u.attachments.some(
          (a) =>
            a.owner !== undefined && a.owner >= (s.table?.seats.length ?? 1),
        ) ||
        ![DUNLAND_TRAP.turch, DUNLAND_TRAP.ravine, DUNLAND_TRAP.road].includes(
          u.code,
        ),
    ) ||
    [q.stageThreeReady, q.lastStand].some(
      (v) => v !== undefined && typeof v !== "boolean",
    ) ||
    (q.frenziedDiscarded !== undefined &&
      (!Number.isSafeInteger(q.frenziedDiscarded) || q.frenziedDiscarded < 0))
  )
    return false;
  const ids = q.setAside.flatMap((u) => [
    u.id,
    ...u.attachments.map((a) => a.id),
  ]);
  const publicUnits = [
    ...s.heroes,
    ...s.allies,
    ...s.hand,
    ...s.engaged,
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...(s.table?.seats.flatMap((p) => [
      ...p.heroes,
      ...p.allies,
      ...p.hand,
      ...p.engaged,
    ]) ?? []),
  ];
  const publicIds = new Set(
    publicUnits.flatMap((u) => [u.id, ...u.attachments.map((a) => a.id)]),
  );
  return (
    new Set(ids).size === ids.length &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    ids.every((id) => !publicIds.has(id))
  );
}
