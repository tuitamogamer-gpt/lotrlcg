// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/black-gate-encounter-cards.json";
import quests from "../data/black-gate-quest-cards.json";
import recipes from "../data/black-gate-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { MORDOR_ORCS } from "./mordor-orcs-codes";
export type { BlackGateState } from "./black-gate-types";

export const BLACK_GATE_ENCOUNTERS = encounters as Card[];
export const BLACK_GATE_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const BLACK_GATE_RECIPES = recipes;
export const BLACK_GATE_SCENARIO = "the-black-gate-opens";
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
export const BG = {
  embassy: code("Embassy from The Dark Tower"),
  battle: code("The Battle of the Morannon"),
  gate: code("The Black Gate"),
  mouth: code("The Mouth of Sauron"),
  gwaihir: code("Gwaihir"),
  towers: code("Towers of the Teeth"),
  hills: code("Beleaguered Hills"),
  waste: code("Waste of Dagorlad"),
  slopes: code("Slopes of Cirith Gorgor"),
  moat: code("Reeking Moat"),
  wall: code("Wall of Morannon"),
  nazgul: code("Nazgûl of Mordor"),
  troll: code("Gorgoroth Hill-troll"),
  bowman: code("Easterling Bowman"),
  warrior: code("Warrior of Rhûn"),
  hawk: code("Hell-hawk"),
  hour: code("The Hour of Doom"),
  jaws: code("Jaws of Steel"),
  rage: code("Rage Filled Him"),
  onslaught: code("Onslaught of Mordor"),
  ...MORDOR_ORCS,
} as const;
export const BG_STAGES = [BG.embassy, BG.battle] as const;
/** 1B: the number of faceup player cards (and encounter cards) to pair. */
export const BG_EMBASSY_PAIRS = 4;
const quest = (c: string) => BLACK_GATE_QUESTS.find((q) => q.code === c);

export function blackGateStageInfo(s: GameState) {
  const q = s.blackGate;
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
export const blackGateUnits = (s: GameState): Unit[] => [
  ...(s.blackGate?.resolving ?? []),
  ...(s.blackGate?.embassy?.map((p) => p.unit) ?? []),
  ...(s.blackGate?.moat?.flatMap((m) => m.units) ?? []),
];
/** The Black Gate in the staging area. */
export const bgGate = (s: GameState) =>
  s.staging.find((u) => u.code === BG.gate);
/** The number of resources on The Black Gate: the players' result. */
export const bgScore = (s: GameState) => bgGate(s)?.resources ?? 0;
/** The scenario's public state, for the panel and the browser checks. */
export function blackGatePublicState(s: GameState) {
  const q = s.blackGate;
  if (!q) return undefined;
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  const allies = [
    ...(s.allies ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.allies ?? []) ?? []),
  ];
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    gate: bgScore(s),
    mouth: s.staging.some((u) => u.code === BG.mouth),
    gwaihir: q.setAside.includes(BG.gwaihir)
      ? ("set-aside" as const)
      : allies.some((u) => u.code === BG.gwaihir)
        ? ("ally" as const)
        : ("encounter" as const),
    moat: q.moat?.reduce((n, m) => n + m.units.length, 0) ?? 0,
    embassy: q.embassy?.length ?? 0,
    nazgul: [...s.staging, ...engaged].filter((u) => u.code === BG.nazgul)
      .length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
export function validateBlackGate(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.blackGate;
  if (q === undefined) return s.scenarioId !== BLACK_GATE_SCENARIO;
  return (
    !!q &&
    s.scenarioId === BLACK_GATE_SCENARIO &&
    (BG_STAGES as readonly string[]).includes(q.currentQuest) &&
    s.stage === (BG_STAGES as readonly string[]).indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.setAside) &&
    (q.embassy === undefined ||
      (Array.isArray(q.embassy) &&
        q.embassy.length <= BG_EMBASSY_PAIRS &&
        q.embassy.every(
          (p) =>
            !!p &&
            natural(p.owner) &&
            unit(p.unit) &&
            typeof p.encounter === "string",
        ))) &&
    (q.moat === undefined ||
      (Array.isArray(q.moat) &&
        q.moat.every(
          (m) =>
            !!m &&
            typeof m.location === "string" &&
            Array.isArray(m.units) &&
            m.units.every(unit),
        ))) &&
    (q.onslaught === undefined ||
      (!!q.onslaught &&
        natural(q.onslaught.round) &&
        typeof q.onslaught.phase === "string" &&
        codes(q.onslaught.ids))) &&
    (q.noReady === undefined ||
      (!!q.noReady && natural(q.noReady.round) && codes(q.noReady.ids))) &&
    (q.canceller === undefined || natural(q.canceller)) &&
    (q.rage === undefined ||
      (!!q.rage &&
        natural(q.rage.player) &&
        typeof q.rage.enemy === "string")) &&
    (q.failedRound === undefined || natural(q.failedRound)) &&
    (q.searched === undefined || codes(q.searched))
  );
}
