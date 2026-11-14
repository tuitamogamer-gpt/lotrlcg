// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/shelob-lair-encounter-cards.json";
import quests from "../data/shelob-lair-quest-cards.json";
import recipes from "../data/shelob-lair-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { POM } from "./passage-marshes-support";
export type { ShelobLairState } from "./shelob-lair-types";

export const SHELOB_LAIR_ENCOUNTERS = encounters as Card[];
export const SHELOB_LAIR_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const SHELOB_LAIR_RECIPES = recipes;
export const SHELOB_LAIR_SCENARIO = "shelobs-lair";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string) => printed.find((c) => c.name === name)!.code;
export const SL = {
  stairs: code("The Stairs of Cirith Ungol"),
  pass: code("The Spider's Pass"),
  betrayal: code("Gollum's Betrayal"),
  shelob: code("Shelob"),
  cleft: code("Cleft of Cirith Ungol"),
  secretWay: code("Sméagol's Secret Way"),
  vale: code("Morgul Vale"),
  morgulOrc: code("Morgul Orc"),
  cirithOrc: code("Orc of Cirith Ungol"),
  spidersLair: code("The Spider's Lair"),
  underWay: code("The Under-way"),
  passage: code("Deep Dark Passage"),
  den: code("Den of Night"),
  tunnel: code("Blocked Tunnel"),
  exhalation: code("Exhalation of Decay"),
  openings: code("Many Openings"),
  poison: code("Shelob's Poison"),
  malice: code("Lurking Malice"),
  rage: code("Rage and Hunger"),
  // Shared with The Passage of the Marshes.
  gollum: POM.gollum,
  smeagol: POM.smeagol,
  wraith: POM.wraith,
  hates: POM.hates,
  call: POM.call,
} as const;
/** The Spider's Pass: no more than 4 progress on the stage each round. */
export const SL_PASS_PROGRESS = 4;
const quest = (c: string) => SHELOB_LAIR_QUESTS.find((q) => q.code === c);

export function shelobLairStageInfo(s: GameState) {
  const q = s.shelobLair;
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
export const shelobLairUnits = (s: GameState): Unit[] =>
  s.shelobLair?.resolving ?? [];
export function shelobLairPublicState(s: GameState) {
  const q = s.shelobLair;
  if (!q) return undefined;
  const shelob = [
    ...s.staging,
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ].find((u) => u.code === SL.shelob);
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    setAside: q.setAside.length,
    shelobInPlay: !!shelob,
    shelobResources: shelob?.resources ?? 0,
    shelobVictory: (s.victoryCards ?? []).includes(SL.shelob),
    gollumVictory: (s.victoryCards ?? []).includes(SL.gollum),
    cleftVictory: (s.victoryCards ?? []).includes(SL.cleft),
    secretWayVictory: (s.victoryCards ?? []).includes(SL.secretWay),
    passProgress: q.passProgress?.round === s.round ? q.passProgress.amount : 0,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
export function validateShelobLair(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.shelobLair;
  if (q === undefined) return s.scenarioId !== SHELOB_LAIR_SCENARIO;
  return (
    !!q &&
    s.scenarioId === SHELOB_LAIR_SCENARIO &&
    [SL.stairs, SL.pass, SL.betrayal].includes(q.currentQuest as never) &&
    s.stage ===
      [SL.stairs, SL.pass, SL.betrayal].indexOf(q.currentQuest as never) + 1 &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.setAside) &&
    (q.passProgress === undefined ||
      (!!q.passProgress &&
        natural(q.passProgress.round) &&
        natural(q.passProgress.amount))) &&
    (q.allies === undefined ||
      (!!q.allies &&
        natural(q.allies.round) &&
        typeof q.allies.count === "object" &&
        Object.values(q.allies.count).every(natural))) &&
    (q.rage === undefined ||
      (!!q.rage &&
        natural(q.rage.round) &&
        typeof q.rage.phase === "string")) &&
    (q.openings === undefined ||
      (!!q.openings &&
        natural(q.openings.round) &&
        natural(q.openings.count))) &&
    (q.failedRound === undefined || natural(q.failedRound))
  );
}
