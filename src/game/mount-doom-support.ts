// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/mount-doom-encounter-cards.json";
import quests from "../data/mount-doom-quest-cards.json";
import recipes from "../data/mount-doom-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { DEEP_SHADOWS } from "./deep-shadows-codes";
export type { MountDoomState } from "./mount-doom-types";

export const MOUNT_DOOM_ENCOUNTERS = encounters as Card[];
export const MOUNT_DOOM_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const MOUNT_DOOM_RECIPES = recipes;
export const MOUNT_DOOM_SCENARIO = "mount-doom";
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
export const MD = {
  land: code("The Land of Mordor"),
  road: code("The Road to Isenmouthe"),
  gasp: code("The Last Gasp"),
  crack: code("The Crack of Doom"),
  tower: code("The Tower of Barad-dûr"),
  doom: code("Mount Doom"),
  hold: code("Orc-hold"),
  mordorRoad: code("Mordor Road"),
  plain: code("Plain of Gorgoroth"),
  brake: code("Brake of Thorns"),
  water: code("Old Water-course"),
  gollum: code("Gollum"),
  wraith: code("Ringwraith of Sauron"),
  captain: code("Orc Captain"),
  uruk: code("Big Uruk"),
  snuffler: code("Little Snuffler"),
  master: code("“Wicked Master!”"),
  eye: code("The Lidless Eye"),
  fumes: code("Foul Fumes"),
  heavy: code("Heavy and Tired"),
  ...DEEP_SHADOWS,
} as const;
export const MD_STAGES = [MD.land, MD.road, MD.gasp, MD.crack] as const;
/** 1B: +4 quest points for each player. */
export const MD_LAND_PER_PLAYER = 4;
/** 3B: no travel to Mount Doom unless there is at least 20 progress here. */
export const MD_GASP_PROGRESS = 20;
/** 3B: no more than 5 progress after the first player fails its test. */
export const MD_GASP_CAP = 5;
const quest = (c: string) => MOUNT_DOOM_QUESTS.find((q) => q.code === c);
const living = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;

export function mountDoomStageInfo(s: GameState) {
  const q = s.mountDoom;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  const points =
    c.code === MD.land
      ? (c.back_quest ?? 0) + MD_LAND_PER_PLAYER * living(s)
      : (c.back_quest ?? 0);
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : points,
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const mountDoomUnits = (s: GameState): Unit[] => [
  ...(s.mountDoom?.resolving ?? []),
];
/** The players who failed a Fortitude test this round. */
export const fortitudeFailures = (s: GameState) =>
  s.mountDoom?.failed?.round === s.round ? s.mountDoom.failed.players : [];
/** The scenario's public state, for the panel and the browser checks. */
export function mountDoomPublicState(s: GameState) {
  const q = s.mountDoom;
  if (!q) return undefined;
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  const doom = [s.activeLocation, ...s.staging].find(
    (u) => u?.code === MD.doom,
  );
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    resources: q.resources ?? 0,
    failed: [...fortitudeFailures(s)],
    capped: q.capped?.round === s.round,
    tower: s.staging.some((u) => u.code === MD.tower),
    doom: doom
      ? s.activeLocation?.code === MD.doom
        ? ("active" as const)
        : ("staging" as const)
      : (s.victoryCards ?? []).includes(MD.doom)
        ? ("explored" as const)
        : ("gone" as const),
    doomProgress: doom?.progress ?? 0,
    gollum: engaged.some((u) => u.code === MD.gollum)
      ? ("engaged" as const)
      : s.staging.some((u) => u.code === MD.gollum)
        ? ("staging" as const)
        : ("encounter" as const),
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
export function validateMountDoom(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.mountDoom;
  if (q === undefined) return s.scenarioId !== MOUNT_DOOM_SCENARIO;
  const seats = s.table?.seats.length ?? 1;
  return (
    !!q &&
    s.scenarioId === MOUNT_DOOM_SCENARIO &&
    (MD_STAGES as readonly string[]).includes(q.currentQuest) &&
    s.stage === (MD_STAGES as readonly string[]).indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    typeof q.ready === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.searched === undefined || codes(q.searched)) &&
    (q.firstTreachery === undefined || natural(q.firstTreachery)) &&
    (q.immuneReveal === undefined || typeof q.immuneReveal === "string") &&
    (q.failed === undefined ||
      (!!q.failed &&
        natural(q.failed.round) &&
        Array.isArray(q.failed.players) &&
        q.failed.players.every((p) => natural(p) && p < seats))) &&
    (q.resources === undefined || natural(q.resources)) &&
    (q.capped === undefined ||
      (!!q.capped && natural(q.capped.round) && natural(q.capped.placed))) &&
    (q.fumes === undefined ||
      (!!q.fumes && natural(q.fumes.round) && codes(q.fumes.ids)))
  );
}
