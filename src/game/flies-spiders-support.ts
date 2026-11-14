// Printed definitions and pure area projection have no runtime-handler dependencies.
import encounters from "../data/flies-spiders-encounter-cards.json";
import quests from "../data/flies-spiders-quest-cards.json";
import recipes from "../data/flies-spiders-recipes.json";
import type { Card, GameState, Unit } from "./types";
import type { FliesSpidersArea } from "./flies-spiders-types";
export type {
  FliesSpidersArea,
  FliesSpidersState,
} from "./flies-spiders-types";

export const FAS_ENCOUNTERS = encounters as Card[];
export const FAS_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const FAS_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FAS = {
  mirkwood: code("Into Mirkwood"),
  lost: code("Lost in the Dark"),
  captured: code("Captured by Spiders"),
  battle: code("Battle with the Spiders"),
  webs: code("Caught in Webs"),
  cob: code("Crazy Cob"),
  fat: code("Fat Spider"),
  stream: code("Forest Stream"),
  web: code("Giant Web"),
  lob: code("Lazy Lob"),
  tomnoddy: code("Old Tomnoddy"),
  poisoned: code("Poisoned by Spiders"),
  wicked: code("Wicked Spider"),
  bats: code("Dark Bats"),
  friends: code("Fighting Among Friends"),
  path: code("Hidden Path"),
  weighed: code("Weighed Down"),
  glade: code("The Spider's Glade"),
} as const;
export const FAS_SCENARIO = "flies-and-spiders";
export const isFliesSpiders = (s: GameState) =>
  (s.scenarioId as string) === FAS_SCENARIO;
export const fasState = (s: GameState) => s.fliesSpiders;
const activePlayer = (s: GameState) => s.table?.active ?? 0;
/** Separate staging areas: Flies and Spiders', Breaking of the Fellowship's or Fog on the Barrow-downs'. */
export interface SplitAreaState {
  split: boolean;
  activeArea?: string;
  areas: FliesSpidersArea[];
}
export const splitAreaState = (s: GameState): SplitAreaState | undefined =>
  s.fliesSpiders ?? s.breakingFellowship ?? s.fogBarrow;

export function fasArea(
  s: GameState,
  player = activePlayer(s),
): FliesSpidersArea | undefined {
  return splitAreaState(s)?.areas.find((a) => a.players.includes(player));
}
export function fasAreaPlayers(
  s: GameState,
  player = activePlayer(s),
): number[] | undefined {
  return splitAreaState(s)?.split ? fasArea(s, player)?.players : undefined;
}
/** Called before changing the active player; every mutable zone replacement is retained. */
export function fasSyncArea(s: GameState) {
  const q = splitAreaState(s);
  if (!q?.split) return;
  const area = q.areas.find((a) => a.id === q.activeArea);
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
export function fasAreaView(s: GameState, player: number) {
  const q = splitAreaState(s),
    area = fasArea(s, player);
  if (!q?.split || !area) return {};
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
export function fasSelectArea(s: GameState, player: number) {
  const q = splitAreaState(s),
    area = fasArea(s, player);
  if (!q?.split || !area) return;
  q.activeArea = area.id;
  Object.assign(s, fasAreaView(s, player));
}
export function fasAllAreaUnits(s: GameState): Unit[] {
  const q = splitAreaState(s);
  if (!q?.split)
    return [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ];
  return q.areas.flatMap((a) => {
    const projected =
      a.id === q.activeArea && a.players.includes(activePlayer(s));
    const staging = projected ? s.staging : a.staging;
    const location = projected ? s.activeLocation : a.activeLocation;
    const extras = projected
      ? (s.extraActiveLocations ?? [])
      : a.extraActiveLocations;
    return [...staging, ...(location ? [location] : []), ...extras];
  });
}
/** The stage card the active player quests against. */
export function fasCurrentQuest(s: GameState) {
  const q = fasState(s);
  if (!q) return undefined;
  return q.split ? (fasArea(s)?.questCode ?? q.currentQuest) : q.currentQuest;
}
export const fasStageNumber = (s: GameState) => {
  const code = fasCurrentQuest(s);
  return Number(FAS_QUESTS.find((c) => c.code === code)?.cost ?? s.stage);
};
export function fasStageInfo(s: GameState) {
  const code = fasCurrentQuest(s);
  const q = FAS_QUESTS.find((c) => c.code === code);
  if (!q) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? q.quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const fasUnits = (s: GameState): Unit[] => [
  ...(s.fliesSpiders?.resolving ?? []),
  ...(s.fliesSpiders?.setAside ?? []),
];
const questName = (code: string) =>
  FAS_QUESTS.find((c) => c.code === code)?.name ?? code;
export function fasPublicState(s: GameState) {
  const q = s.fliesSpiders;
  if (!q) return undefined;
  return {
    currentQuest: fasCurrentQuest(s),
    split: q.split,
    areas: q.areas.map((a) => ({
      id: a.id,
      players: a.players,
      quest: questName(a.questCode),
      progress: a.id === q.activeArea ? s.progress : a.progress,
      cards: (a.id === q.activeArea ? s.staging : a.staging).length,
    })),
    stageThreeComplete: q.stageThreeComplete,
    gladeSetAside: q.setAside.some((u) => u.code === FAS.glade),
    weighedDown: q.weighedDown.includes(s.round),
  };
}
export function validateFliesSpiders(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.fliesSpiders;
  if (q === undefined) return s.scenarioId !== FAS_SCENARIO;
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const questCodes = FAS_QUESTS.map((c) => c.code);
  const seats = s.table?.seats.length ?? 1;
  const validArea = (a: FliesSpidersArea) =>
    typeof a.id === "string" &&
    Array.isArray(a.players) &&
    a.players.length > 0 &&
    a.players.every((p) => Number.isSafeInteger(p) && p >= 0 && p < seats) &&
    new Set(a.players).size === a.players.length &&
    [FAS.captured, FAS.battle].includes(a.questCode as typeof FAS.battle) &&
    n(a.progress) &&
    Array.isArray(a.staging) &&
    a.staging.every(unit) &&
    (a.activeLocation === null || unit(a.activeLocation)) &&
    Array.isArray(a.extraActiveLocations) &&
    a.extraActiveLocations.every(unit) &&
    [a.questDebuff, a.fog, a.threatModifier].every((v) =>
      Number.isSafeInteger(v),
    );
  return (
    !!q &&
    s.scenarioId === FAS_SCENARIO &&
    questCodes.includes(q.currentQuest) &&
    [1, 2, 3, 4].includes(s.stage) &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.setAside) &&
    q.setAside.every((u) => unit(u) && u.code === FAS.glade) &&
    q.setAside.length <= 1 &&
    Array.isArray(q.rings) &&
    q.rings.every((c) => c === "132019") &&
    typeof q.split === "boolean" &&
    Array.isArray(q.areas) &&
    q.areas.every(validArea) &&
    (q.split
      ? q.areas.length === 2 &&
        q.areas.some((a) => a.questCode === FAS.captured)
      : q.areas.length === 0) &&
    (q.activeArea === undefined ||
      q.areas.some((a) => a.id === q.activeArea)) &&
    typeof q.stageThreeComplete === "boolean" &&
    [q.resolvedAreas, q.travelPassedAreas].every(
      (ids) =>
        Array.isArray(ids) &&
        ids.every((id) => q.areas.some((a) => a.id === id)),
    ) &&
    Array.isArray(q.weighedDown) &&
    q.weighedDown.every((r) => n(r) && r <= s.round) &&
    typeof q.initialized === "boolean" &&
    Array.isArray(q.treasures) &&
    q.treasures.every((c) => c === "132019")
  );
}
