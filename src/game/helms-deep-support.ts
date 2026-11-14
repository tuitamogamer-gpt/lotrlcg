// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/helms-deep-encounter-cards.json";
import quests from "../data/helms-deep-quest-cards.json";
import recipes from "../data/helms-deep-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { HelmsDeepState } from "./helms-deep-types";

export const HELMS_DEEP_ENCOUNTERS = encounters as Card[];
export const HELMS_DEEP_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const HELMS_DEEP_RECIPES = recipes;
export const HELMS_DEEP_SCENARIO = "helms-deep";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const HD = {
  king: code("The King of the Golden Hall"),
  assault: code("Assault on Helm's Deep"),
  hosts: code("The Hosts of Isengard"),
  breached: code("The Wall is Breached!"),
  rides: code("The King Rides Out"),
  counsels: code("Poisoned Counsels"),
  defense: code("The Defense of Helm's Deep"),
  hillman: code("Wild Hillman"),
  warrior: code("Warrior of Dunland"),
  soldier: code("Soldier of Isengard"),
  hornburg: code("The Hornburg"),
  wall: code("Deeping Wall"),
  culvert: code("Deeping Culvert"),
  postern: code("Postern Door"),
  gate: code("Helm's Gate"),
  ladders: code("Scaling Ladders"),
  devilry: code("Devilry of Saruman"),
  hate: code("Reckless Hate"),
  night: code("Night Without End"),
} as const;
/** The quest stages with the Defense keyword. */
export const HD_DEFENSE: readonly string[] = [
  HD.assault,
  HD.hosts,
  HD.breached,
];
/** The Defense of Helm's Deep: at 8 resource tokens the players advance to stage 5A. */
export const HD_DEFENSE_TOKENS = 8;
const quest = (c: string) => HELMS_DEEP_QUESTS.find((q) => q.code === c);
const isDefenseUnit = (u: Unit) => u.code === HD.defense;

export function helmsDeepStageInfo(s: GameState) {
  const q = s.helmsDeep;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** The Defense of Helm's Deep, while it is in the staging area. */
export const helmsDeepDefense = (s: GameState) =>
  s.helmsDeep ? s.staging.find(isDefenseUnit) : undefined;
/** Units the scenario holds outside the ordinary zones. */
export const helmsDeepUnits = (s: GameState): Unit[] =>
  s.helmsDeep?.resolving ?? [];
export function helmsDeepPublicState(s: GameState) {
  const q = s.helmsDeep;
  if (!q) return undefined;
  const defense = helmsDeepDefense(s);
  return {
    currentQuest: q.currentQuest,
    defense: !!quest(q.currentQuest) && HD_DEFENSE.includes(q.currentQuest),
    tokens: defense?.resources ?? null,
    counsels: q.counsels,
    setAside: [...q.setAside],
    devilry: q.devilry === s.round,
    postern: q.postern === s.round,
    gate: q.gate === s.round,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const round = (n: unknown) => n === undefined || (integer(n) && n >= 0);
export function validateHelmsDeep(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.helmsDeep;
  if (q === undefined) return s.scenarioId !== HELMS_DEEP_SCENARIO;
  const codes = HELMS_DEEP_QUESTS.map((c) => c.code);
  return (
    !!q &&
    s.scenarioId === HELMS_DEEP_SCENARIO &&
    [1, 2, 3, 4, 5].includes(s.stage) &&
    codes.includes(q.currentQuest) &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) =>
      [HD.defense, HD.wall, HD.soldier].includes(c as never),
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.counsels === null || typeof q.counsels === "boolean") &&
    (q.fighting === undefined ||
      (!!q.fighting &&
        integer(q.fighting.round) &&
        Array.isArray(q.fighting.players) &&
        q.fighting.players.every((p) => integer(p) && p >= 0))) &&
    (q.devilryShadow === undefined ||
      (!!q.devilryShadow &&
        integer(q.devilryShadow.round) &&
        Array.isArray(q.devilryShadow.ids) &&
        q.devilryShadow.ids.every((id) => typeof id === "string"))) &&
    [q.devilry, q.postern, q.gate, q.gateStaging, q.questProgress].every(round)
  );
}
