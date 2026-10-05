// Printed definitions and pure area projection have no runtime-handler dependencies.
import encounters from "../data/foundations-stone-encounter-cards.json";
import quests from "../data/foundations-stone-quest-cards.json";
import recipes from "../data/foundations-stone-recipes.json";
import type { Card, GameState, Unit } from "./types";

export const FOUNDATIONS_STONE_ENCOUNTERS = encounters as Card[];
export const FOUNDATIONS_STONE_QUESTS = quests as Card[];
export const FOUNDATIONS_STONE = {
  walls: "octgn:51223bd0-ffd1-11df-a976-0801212c9029",
  edge: "octgn:51223bd0-ffd1-11df-a976-0801212c9031",
  washed: "octgn:51223bd0-ffd1-11df-a976-0801212c9034",
  lair: "octgn:51223bd0-ffd1-11df-a976-0801212c9002",
  rocks: "octgn:51223bd0-ffd1-11df-a976-0801212c9004",
  caves: "octgn:51223bd0-ffd1-11df-a976-0801212c9006",
  bank: "octgn:51223bd0-ffd1-11df-a976-0801212c9008",
  depths: "octgn:51223bd0-ffd1-11df-a976-0801212c9026",
  deep: "octgn:51223bd0-ffd1-11df-a976-0801212c9011",
  treasury: "octgn:51223bd0-ffd1-11df-a976-0801212c9012",
  axe: "octgn:51223bd0-ffd1-11df-a976-0801212c9013",
  helm: "octgn:51223bd0-ffd1-11df-a976-0801212c9014",
  elder: "octgn:51223bd0-ffd1-11df-a976-0801212c9015",
  lost: "octgn:51223bd0-ffd1-11df-a976-0801212c9022",
  mithril: "octgn:51223bd0-ffd1-11df-a976-0801212c9023",
  bats: "octgn:51223bd0-ffd1-11df-a976-0801212c9024",
  nameless: "octgn:51223bd0-ffd1-11df-a976-0801212c9025",
} as const;
export const FOUNDATIONS_STAGE_FOUR = [
  FOUNDATIONS_STONE.lair,
  FOUNDATIONS_STONE.rocks,
  FOUNDATIONS_STONE.caves,
  FOUNDATIONS_STONE.bank,
];

export interface FoundationsStoneArea {
  id: string;
  players: number[];
  questCode: string;
  progress: number;
  staging: Unit[];
  activeLocation: Unit | null;
  extraActiveLocations: Unit[];
  questDebuff: number;
  fog: number;
  threatModifier: number;
  completed?: boolean;
  mithrilUsedRound?: number;
  lastQuest?: GameState["lastQuest"];
}
export interface FoundationsStoneState {
  setAside: string[];
  removedEncounter: string[];
  areas: FoundationsStoneArea[];
  split: boolean;
  activeArea?: string;
  resolvedAreas: string[];
  travelPassedAreas: string[];
  lostHeroes: { id: string; code: string; player: number }[];
  /** All stage 4 assignments are decided before any of their revealed effects. */
  removedQuests: string[];
}
type FoundationsState = GameState & {
  foundationsStone?: FoundationsStoneState;
};
export const foundationsState = (s: GameState) =>
  (s as FoundationsState).foundationsStone;
export const isFoundationsStone = (s: GameState) =>
  (s.scenarioId as string) === "foundations-of-stone";
const activePlayer = (s: GameState) => s.table?.active ?? 0;
export function foundationsArea(s: GameState, player = activePlayer(s)) {
  return foundationsState(s)?.areas.find((a) => a.players.includes(player));
}
export function foundationsAreaPlayers(
  s: GameState,
  player = activePlayer(s),
): number[] | undefined {
  const d = foundationsState(s);
  return d?.split ? foundationsArea(s, player)?.players : undefined;
}
export function foundationsSameArea(s: GameState, a: number, b: number) {
  const players = foundationsAreaPlayers(s, a);
  return !players || players.includes(b);
}
/** Called before changing the active player; every mutable zone replacement is retained. */
export function foundationsSyncArea(s: GameState) {
  const d = foundationsState(s);
  if (!d?.split) return;
  const area = d.areas.find((a) => a.id === d.activeArea);
  if (!area || !area.players.includes(activePlayer(s))) return;
  Object.assign(area, {
    staging: s.staging,
    activeLocation: s.activeLocation,
    extraActiveLocations: s.extraActiveLocations ?? [],
    progress: s.progress,
    questDebuff: s.questDebuff,
    fog: s.fog ?? 0,
    threatModifier: s.threatModifier,
    lastQuest: s.lastQuest,
  });
}
export function foundationsAreaView(s: GameState, player: number) {
  const d = foundationsState(s),
    area = foundationsArea(s, player);
  if (!d?.split || !area) return {};
  return {
    staging: area.staging,
    activeLocation: area.activeLocation,
    extraActiveLocations: area.extraActiveLocations,
    progress: area.progress,
    questDebuff: area.questDebuff,
    fog: area.fog,
    threatModifier: area.threatModifier,
    lastQuest: area.lastQuest ?? null,
  };
}
/** Called after saving the old area and before loading player-specific fields. */
export function foundationsSelectArea(s: GameState, player: number) {
  const d = foundationsState(s),
    area = foundationsArea(s, player);
  if (!d?.split || !area) return;
  d.activeArea = area.id;
  Object.assign(s, foundationsAreaView(s, player));
}
export function foundationsAllAreaUnits(s: GameState): Unit[] {
  const d = foundationsState(s);
  return d?.split
    ? d.areas.flatMap((a) => {
        const projected =
          a.id === d.activeArea && a.players.includes(activePlayer(s));
        const staging = projected ? s.staging : a.staging;
        const location = projected ? s.activeLocation : a.activeLocation;
        const extras = projected
          ? (s.extraActiveLocations ?? [])
          : a.extraActiveLocations;
        return [...staging, ...(location ? [location] : []), ...extras];
      })
    : [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
        ...(s.extraActiveLocations ?? []),
      ];
}
export function foundationsCurrentQuest(s: GameState) {
  if (!isFoundationsStone(s)) return undefined;
  if (s.stage === 4) return foundationsArea(s)?.questCode;
  return [
    FOUNDATIONS_STONE.walls,
    FOUNDATIONS_STONE.edge,
    FOUNDATIONS_STONE.washed,
    "",
    FOUNDATIONS_STONE.depths,
  ][s.stage - 1];
}
export function foundationsStageInfo(s: GameState) {
  const code = foundationsCurrentQuest(s);
  const c = FOUNDATIONS_STONE_QUESTS.find((c) => c.code === code);
  return c
    ? {
        name: c.back_name ?? c.name,
        quest: c.quest ?? 0,
        cardCode: c.code,
        questImage: c.back_imagesrc ?? c.imagesrc,
        story: c.back_text ?? c.text ?? "",
      }
    : undefined;
}
export function foundationsRecipe(easy = false) {
  const r = easy ? recipes.easy : recipes.standard;
  const copies = (section: Record<string, number>) =>
    Object.entries(section).flatMap(([code, count]) =>
      Array<string>(count).fill(code),
    );
  return {
    initial: copies(r.sharedEncounterDeck),
    setAside: copies(r.sharedEncounterDeck2),
  };
}

/** Scenario-only shape validation; the shared save validator owns global ID deduplication. */
export function validateFoundationsState(
  s: GameState,
  validUnit: (value: unknown) => boolean,
): boolean {
  const d = foundationsState(s);
  if (!d) return !isFoundationsStone(s);
  if (
    !isFoundationsStone(s) ||
    !Number.isInteger(s.stage) ||
    s.stage < 1 ||
    s.stage > 5
  )
    return false;
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const tokens = (v: unknown) => Number.isInteger(v) && Number(v) >= 0;
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((c) => typeof c === "string");
  const r = foundationsRecipe(!!s.easyMode);
  const encounterCodes = new Set([...r.initial, ...r.setAside]);
  if (
    !object(d) ||
    typeof d.split !== "boolean" ||
    !Array.isArray(d.areas) ||
    !strings(d.setAside) ||
    !strings(d.removedEncounter) ||
    !strings(d.removedQuests) ||
    !strings(d.resolvedAreas) ||
    !strings(d.travelPassedAreas) ||
    !Array.isArray(d.lostHeroes) ||
    !d.removedEncounter.every((code) => encounterCodes.has(code)) ||
    !d.removedQuests.every((code) =>
      FOUNDATIONS_STONE_QUESTS.some((c) => c.code === code),
    ) ||
    new Set(d.removedQuests).size !== d.removedQuests.length
  )
    return false;
  if (s.stage <= 3) {
    if (
      JSON.stringify([...d.setAside].sort()) !==
      JSON.stringify([...r.setAside].sort())
    )
      return false;
  } else if (d.setAside.length) return false;
  const seats = s.table ? s.table.seats.map((_, p) => p) : [0];
  const alive = seats.filter((p) => !s.table?.seats[p].eliminated);
  const lostIds = new Set<string>();
  for (const h of d.lostHeroes) {
    if (
      !object(h) ||
      typeof h.id !== "string" ||
      !h.id ||
      typeof h.code !== "string" ||
      !Number.isInteger(h.player) ||
      !seats.includes(h.player) ||
      lostIds.has(h.id)
    )
      return false;
    const starting = s.table
      ? s.table.seats[h.player].startingHeroes
      : s.startingHeroes;
    if (!starting.includes(h.code)) return false;
    lostIds.add(h.id);
  }
  if (!d.split)
    return (
      s.stage !== 4 &&
      !d.areas.length &&
      d.activeArea === undefined &&
      !d.resolvedAreas.length &&
      !d.travelPassedAreas.length
    );
  if (
    s.stage !== 4 ||
    !d.areas.length ||
    d.areas.length > 4 ||
    typeof d.activeArea !== "string"
  )
    return false;
  const areaIds = new Set<string>(),
    players: number[] = [],
    questCodes = new Set<string>(),
    unitIds = new Set<string>();
  for (const a of d.areas) {
    if (
      !object(a) ||
      typeof a.id !== "string" ||
      !a.id ||
      areaIds.has(a.id) ||
      !Array.isArray(a.players) ||
      !a.players.length ||
      !a.players.every(
        (p) =>
          Number.isInteger(p) &&
          (s.status === "lost" ? seats : alive).includes(p),
      ) ||
      !FOUNDATIONS_STAGE_FOUR.includes(
        a.questCode as typeof FOUNDATIONS_STONE.lair,
      ) ||
      questCodes.has(a.questCode) ||
      !tokens(a.progress) ||
      !Array.isArray(a.staging) ||
      !a.staging.every(validUnit) ||
      !(a.activeLocation === null || validUnit(a.activeLocation)) ||
      !Array.isArray(a.extraActiveLocations) ||
      !a.extraActiveLocations.every(validUnit) ||
      !tokens(a.questDebuff) ||
      !tokens(a.fog) ||
      !Number.isInteger(a.threatModifier) ||
      (a.completed !== undefined && typeof a.completed !== "boolean") ||
      (a.mithrilUsedRound !== undefined &&
        (!tokens(a.mithrilUsedRound) || a.mithrilUsedRound > s.round))
    )
      return false;
    if (
      a.completed &&
      a.progress <
        (FOUNDATIONS_STONE_QUESTS.find((c) => c.code === a.questCode)?.quest ??
          Infinity)
    )
      return false;
    if (
      a.lastQuest !== undefined &&
      a.lastQuest !== null &&
      (!object(a.lastQuest) ||
        ![a.lastQuest.will, a.lastQuest.threat, a.lastQuest.net].every((n) =>
          Number.isFinite(n),
        ))
    )
      return false;
    areaIds.add(a.id);
    questCodes.add(a.questCode);
    players.push(...a.players);
    for (const u of [
      ...a.staging,
      ...(a.activeLocation ? [a.activeLocation] : []),
      ...a.extraActiveLocations,
    ]) {
      if (unitIds.has(u.id)) return false;
      unitIds.add(u.id);
    }
  }
  if (
    new Set(players).size !== players.length ||
    (s.status !== "lost" &&
      JSON.stringify([...players].sort()) !==
        JSON.stringify([...alive].sort())) ||
    !alive.every((p) => players.includes(p)) ||
    !d.resolvedAreas.every((id) => areaIds.has(id)) ||
    new Set(d.resolvedAreas).size !== d.resolvedAreas.length ||
    !d.travelPassedAreas.every((id) => areaIds.has(id)) ||
    new Set(d.travelPassedAreas).size !== d.travelPassedAreas.length
  )
    return false;
  const active = d.areas.find((a) => a.id === d.activeArea);
  if (!active || !active.players.includes(activePlayer(s))) return false;
  return (
    JSON.stringify(active.staging) === JSON.stringify(s.staging) &&
    JSON.stringify(active.activeLocation) ===
      JSON.stringify(s.activeLocation) &&
    JSON.stringify(active.extraActiveLocations) ===
      JSON.stringify(s.extraActiveLocations ?? []) &&
    active.progress === s.progress &&
    active.questDebuff === s.questDebuff &&
    active.fog === (s.fog ?? 0) &&
    active.threatModifier === s.threatModifier
  );
}
