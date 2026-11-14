// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/grey-company-encounter-cards.json";
import quests from "../data/grey-company-quest-cards.json";
import recipes from "../data/grey-company-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { GreyCompanyState } from "./grey-company-types";

export const GREY_COMPANY_ENCOUNTERS = encounters as Card[];
export const GREY_COMPANY_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const GREY_COMPANY_RECIPES = recipes;
export const GREY_COMPANY_SCENARIO = "the-passing-of-the-grey-company";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string) => printed.find((c) => c.name === name)!.code;
export const GC = {
  door: code("The Forbidden Door"),
  paths: code("The Paths of the Dead"),
  following: code("The Dead are Following"),
  fear: code("Overcome by Fear"),
  rules: printed.find(
    (c) =>
      c.name === "The Passing of the Grey Company" && c.type_code === "rules",
  )!.code,
  stone: code("The Stone of Erech"),
  army: code("Army of the Dead"),
  ghosts: code("Ghosts of Men"),
  deadMan: code("Dead Man of Dunharrow"),
  host: code("Shadow Host"),
  faithless: code("Faithless Dead"),
  haunted: code("Haunted Path"),
  deadly: code("Deadly Road"),
  trysting: code("Trysting Place"),
  darkDoor: code("Dark Door"),
  noTurning: code("No Turning Back"),
  whispers: code("Whispers in the Dark"),
  chill: code("Blood Runs Chill"),
  shut: code("The Way is Shut"),
} as const;
/** Haunted Path and Blood Runs Chill: a threat of 35 or higher. */
export const GC_HIGH_THREAT = 35;
/** The Stone of Erech: 5 progress removed from stage 3B to travel there. */
export const GC_STONE_PROGRESS = 5;
/** 3B: Oathbreaker enemies get -20 engagement cost while The Stone of Erech is active. */
export const GC_STONE_ENGAGEMENT = 20;
const quest = (c: string) => GREY_COMPANY_QUESTS.find((q) => q.code === c);
const isOathbreakerCode = (c: string) =>
  (printed.find((x) => x.code === c)?.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .includes("Oathbreaker");
export const isGcOathbreaker = isOathbreakerCode;

/** Every player's threat, for 2B's X and the cards counting threats of 35 or higher. */
export const gcThreats = (s: GameState) =>
  s.table
    ? s.table.seats
        .map((seat, i) =>
          seat.eliminated
            ? undefined
            : i === s.table!.active
              ? s.threat
              : seat.threat,
        )
        .filter((t): t is number => t !== undefined)
    : [s.threat];

export function greyCompanyStageInfo(s: GameState) {
  const q = s.greyCompany;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  // 2B: X is the threat of the player with the highest threat.
  const points =
    c.code === GC.paths ? Math.max(0, ...gcThreats(s)) : (c.back_quest ?? 0);
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
export const greyCompanyUnits = (s: GameState): Unit[] =>
  s.greyCompany?.resolving ?? [];
export function greyCompanyPublicState(s: GameState) {
  const q = s.greyCompany;
  if (!q) return undefined;
  const seats = s.table
    ? s.table.seats.map((seat, i) =>
        i === s.table!.active
          ? {
              threat: s.threat,
              fear: !!s.threatAttachments?.some((a) => a.code === GC.fear),
            }
          : {
              threat: seat.threat,
              fear: !!seat.threatAttachments?.some((a) => a.code === GC.fear),
            },
      )
    : [
        {
          threat: s.threat,
          fear: !!s.threatAttachments?.some((a) => a.code === GC.fear),
        },
      ];
  const army = [
    ...s.staging,
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ].find((u) => u.code === GC.army);
  const active = s.activeLocation;
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    fear: seats.map((seat) => seat.fear),
    fearAside: q.fearAside,
    fearRemoved: q.fearRemoved,
    setAside: q.setAside.length,
    stoneActive: !!active && active.code === GC.stone,
    stoneInStaging: s.staging.some((u) => u.code === GC.stone),
    armyInPlay: !!army,
    armyVictory: (s.victoryCards ?? []).includes(GC.army),
    noPlay: q.noPlay?.round === s.round ? q.noPlay.players : [],
    shut: q.shutRound === s.round,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
export function validateGreyCompany(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.greyCompany;
  if (q === undefined) return s.scenarioId !== GREY_COMPANY_SCENARIO;
  const stages = [GC.door, GC.paths, GC.following] as string[];
  return (
    !!q &&
    s.scenarioId === GREY_COMPANY_SCENARIO &&
    stages.includes(q.currentQuest) &&
    s.stage === stages.indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.setAside) &&
    natural(q.fearAside) &&
    natural(q.fearRemoved) &&
    q.fearAside + q.fearRemoved <= 4 &&
    (q.noPlay === undefined ||
      (!!q.noPlay &&
        natural(q.noPlay.round) &&
        Array.isArray(q.noPlay.players) &&
        q.noPlay.players.every(natural))) &&
    (q.shutRound === undefined || natural(q.shutRound)) &&
    (q.searched === undefined || codes(q.searched)) &&
    (q.whispered === undefined ||
      (!!q.whispered &&
        natural(q.whispered.round) &&
        codes(q.whispered.ids))) &&
    (q.chilled === undefined ||
      (!!q.chilled && natural(q.chilled.round) && codes(q.chilled.ids)))
  );
}
