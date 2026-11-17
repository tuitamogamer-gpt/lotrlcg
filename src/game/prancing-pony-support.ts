// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/prancing-pony-encounter-cards.json";
import quests from "../data/prancing-pony-quest-cards.json";
import recipes from "../data/prancing-pony-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { PrancingPonyState } from "./prancing-pony-types";

export const PP_ENCOUNTERS = encounters as Card[];
/** The quest cards in stage order. */
export const PP_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const PP_RECIPES = recipes;
export const PP_SCENARIO = "murder-at-the-prancing-pony";
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
const rules = printed.filter((c) => c.type_code === "rules").map((c) => c.code);
export const PP = {
  crime: code("Investigating the Crime"),
  time: code("Running out of Time"),
  killer: code("Apprehending the Killer"),
  rules1: rules[0],
  rules2: rules[1],
  ferneyHouse: code("Bill Ferny's House"),
  staddle: code("Staddle Hiding Hole"),
  combe: code("Combe Storehouse"),
  archet: code("Archet Trading Post"),
  campsite: code("Chetwood Campsite"),
  todd: code("Todd the Troll"),
  susie: code("Susie the Spider"),
  jake: code("Wolf-pelt Jake"),
  johnny: code("Johnny Goblin-fingers"),
  orcEyes: code("Old Orc-eyes"),
  surprise: code("Taken by Surprise"),
  pony: code("The Prancing Pony"),
  manor: code("Ramshackle Manor"),
  alley: code("Dark Alley"),
  market: code("Market Square"),
  warehouse: code("Old Warehouse"),
  stable: code("Village Stable"),
  ferny: code("Bill Ferny"),
  informant: code("Bree-land Informant"),
  ruffian: code("Lawless Ruffian"),
  footpad: code("Greenway Footpad"),
  outlaw: code("Chetwood Outlaw"),
  muscle: code("Hired Muscle"),
  smoke: code("Smoke and Mirrors"),
  body: code("Rising Body Count"),
  accusations: code("Deadly Accusations"),
} as const;
export const PP_SUSPECTS: readonly string[] = [
  PP.todd,
  PP.susie,
  PP.jake,
  PP.johnny,
  PP.orcEyes,
];
export const PP_HIDEOUTS: readonly string[] = [
  PP.ferneyHouse,
  PP.staddle,
  PP.combe,
  PP.archet,
  PP.campsite,
];
export const PP_STAGE: Record<string, number> = {
  [PP.crime]: 1,
  [PP.time]: 2,
  [PP.killer]: 3,
};
export const PP_QUEST_CODES = Object.keys(PP_STAGE);
const byCode = new Map(printed.map((c) => [c.code, c]));
export const ppTraits = (c: string) =>
  (byCode.get(c)?.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
export const isSuspect = (c: string) => PP_SUSPECTS.includes(c);
export const isHideout = (c: string) => PP_HIDEOUTS.includes(c);
export const isBrigand = (c: string) => ppTraits(c).includes("Brigand");
/** The printed Investigate value of a location (0 without the keyword). */
export function printedInvestigate(c: string) {
  const m = /^Investigate (\d+)\./m.exec(byCode.get(c)?.text ?? "");
  return m ? Number(m[1]) : 0;
}
type Recipe = (typeof recipes)[number];
export const ppRecipe = (easy: boolean) =>
  recipes.find((r) => r.mode === (easy ? "easy" : "standard"))! as Recipe;
const quest = (c: string) => PP_QUESTS.find((q) => q.code === c)!;
export function ppStageInfo(s: GameState) {
  const q = s.prancingPony;
  if (!q) return undefined;
  const c = quest(q.currentQuest);
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const ppUnits = (s: GameState): Unit[] => [
  ...(s.prancingPony?.resolving ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function prancingPonyPublicState(s: GameState) {
  const q = s.prancingPony;
  if (!q) return undefined;
  const stage = PP_STAGE[q.currentQuest];
  return {
    currentQuest: q.currentQuest,
    side: `${stage}${s.stageRevealing ? "A" : "B"}`,
    stage,
    investigation: q.investigation.length,
    removed: q.removed.length,
    checked: [...q.checked],
    hidden: q.guilty !== null,
    accusation: q.accusation ? { ...q.accusation } : null,
    stageProgress:
      q.stageProgress?.round === s.round ? q.stageProgress.amount : 0,
  };
}
export function validatePrancingPony(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.prancingPony;
  if (q === undefined) return s.scenarioId !== PP_SCENARIO;
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && byCode.has(c));
  return (
    !!q &&
    s.scenarioId === PP_SCENARIO &&
    PP_QUEST_CODES.includes(q.currentQuest) &&
    s.stage === PP_STAGE[q.currentQuest] &&
    typeof q.advancing === "boolean" &&
    codes(q.setAside) &&
    (q.guilty === null ||
      (isSuspect(q.guilty.suspect) && isHideout(q.guilty.hideout))) &&
    codes(q.investigation) &&
    codes(q.removed) &&
    codes(q.checked) &&
    q.checked.every((c) => isSuspect(c) || isHideout(c)) &&
    (q.accusation === null ||
      (isSuspect(q.accusation.suspect) &&
        isHideout(q.accusation.hideout) &&
        typeof q.accusation.correct === "boolean")) &&
    (q.naming === null || isSuspect(q.naming)) &&
    (q.stageProgress === null ||
      (Number.isInteger(q.stageProgress.round) &&
        Number.isInteger(q.stageProgress.amount))) &&
    Number.isInteger(q.extraReveals) &&
    codes(q.looking) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.smoke === null ||
      (typeof q.smoke.phase === "string" &&
        Number.isInteger(q.smoke.round) &&
        Number.isInteger(q.smoke.value))) &&
    (q.billing === null ||
      (Number.isInteger(q.billing.round) && byCode.has(q.billing.code))) &&
    Array.isArray(q.suspectDamage) &&
    q.suspectDamage.every(
      (d) =>
        typeof d.id === "string" &&
        Number.isInteger(d.round) &&
        Number.isInteger(d.damage),
    )
  );
}
