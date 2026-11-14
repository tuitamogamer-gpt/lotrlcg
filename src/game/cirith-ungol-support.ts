// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/cirith-ungol-encounter-cards.json";
import quests from "../data/cirith-ungol-quest-cards.json";
import recipes from "../data/cirith-ungol-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { CirithUngolState } from "./cirith-ungol-types";

export const CIRITH_UNGOL_ENCOUNTERS = encounters as Card[];
export const CIRITH_UNGOL_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const CIRITH_UNGOL_RECIPES = recipes;
export const CIRITH_UNGOL_SCENARIO = "the-tower-of-cirith-ungol";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string, type?: string) =>
  printed.find((c) => c.name === name && (!type || c.type_code === type))!.code;
export const CU = {
  watchers: code("Pass the Two Watchers"),
  tower: code("Fighting in the Tower"),
  escape: code("Escape from Cirith Ungol"),
  /** The Two Watchers, location side; the enemy side is a separate face. */
  twoWatchers: code("The Two Watchers", "location"),
  watchersEnemy: code("The Two Watchers", "enemy"),
  chamber: code("Topmost Chamber"),
  company: code("Last of the Company"),
  shagrat: code("Shagrat"),
  passage: code("Echoing Passage"),
  courtyard: code("Bloodied Courtyard"),
  stairs: code("Winding Stairs"),
  hall: code("Torch-lit Hall"),
  gorbag: code("Gorbag"),
  wounded: code("Wounded Uruk"),
  howls: code("Orcish Howls"),
  orc: code("Orc of Mordor"),
  archer: code("Snaga Archer"),
  soldier: code("Uruk Soldier"),
  drawn: code("Drawn to the Ring"),
  deep: code("Deep Shadows"),
  vigilance: code("Evil Vigilance"),
} as const;
export const CU_STAGES = [CU.watchers, CU.tower, CU.escape] as const;
/** Topmost Chamber: no travel unless there is at least 18 progress on stage 2B. */
export const CU_CHAMBER_PROGRESS = 18;
/** 3B: no travel to The Two Watchers unless there is at least 12 progress. */
export const CU_ESCAPE_PROGRESS = 12;
/** 3B: The Two Watchers' enemy side gets +3 threat and +3 defense. */
export const CU_ESCAPE_BONUS = 3;
const quest = (c: string) => CIRITH_UNGOL_QUESTS.find((q) => q.code === c);
/** The Two Watchers' faces: the physical card is the same. */
export const isWatchers = (c: string) =>
  c === CU.twoWatchers || c === CU.watchersEnemy;

export function cirithUngolStageInfo(s: GameState) {
  const q = s.cirithUngol;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const cirithUngolUnits = (s: GameState): Unit[] => [
  ...(s.cirithUngol?.resolving ?? []),
  ...(s.cirithUngol?.captive ? [s.cirithUngol.captive] : []),
];
/** The Two Watchers in play, either side. */
export function cuWatchers(s: GameState) {
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  return [
    ...s.staging,
    ...engaged,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].find((u) => isWatchers(u.code));
}
/** The scenario's public state, for the panel and the browser checks. */
export function cirithUngolPublicState(s: GameState) {
  const q = s.cirithUngol;
  if (!q) return undefined;
  const watchers = cuWatchers(s);
  const victory = s.victoryCards ?? [];
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    watchers: watchers
      ? watchers.code === CU.watchersEnemy
        ? ("enemy" as const)
        : ("location" as const)
      : victory.some(isWatchers)
        ? ("victory" as const)
        : null,
    captive: !!q.captive,
    chamber: victory.includes(CU.chamber)
      ? ("victory" as const)
      : s.staging.some((u) => u.code === CU.chamber) ||
          s.activeLocation?.code === CU.chamber
        ? ("play" as const)
        : null,
    shagrat: q.setAside.includes(CU.shagrat) ? "set-aside" : "out",
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
const attachment = (a: unknown) =>
  !!a &&
  typeof a === "object" &&
  typeof (a as { id?: unknown }).id === "string" &&
  typeof (a as { code?: unknown }).code === "string";
const record = (v: unknown) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.values(v as Record<string, unknown>).every(integer);
export function validateCirithUngol(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.cirithUngol;
  if (q === undefined) return s.scenarioId !== CIRITH_UNGOL_SCENARIO;
  return (
    !!q &&
    s.scenarioId === CIRITH_UNGOL_SCENARIO &&
    (CU_STAGES as readonly string[]).includes(q.currentQuest) &&
    s.stage === (CU_STAGES as readonly string[]).indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    typeof q.ringPlaced === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.setAside) &&
    (q.captive === undefined || unit(q.captive)) &&
    (q.ring === undefined || attachment(q.ring)) &&
    (q.company === undefined || attachment(q.company)) &&
    (q.howls === undefined ||
      (!!q.howls &&
        natural(q.howls.round) &&
        typeof q.howls.phase === "string")) &&
    (q.shagrat === undefined ||
      (!!q.shagrat && natural(q.shagrat.round) && natural(q.shagrat.amount))) &&
    (q.wounded === undefined ||
      (!!q.wounded && natural(q.wounded.round) && codes(q.wounded.ids))) &&
    (q.lessened === undefined ||
      (!!q.lessened &&
        natural(q.lessened.round) &&
        typeof q.lessened.phase === "string" &&
        record(q.lessened.values)))
  );
}
