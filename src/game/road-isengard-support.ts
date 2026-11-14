// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/road-isengard-encounter-cards.json";
import quests from "../data/road-isengard-quest-cards.json";
import recipes from "../data/road-isengard-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { RoadIsengardState } from "./road-isengard-types";

export const ROAD_ISENGARD_ENCOUNTERS = encounters as Card[];
export const ROAD_ISENGARD_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const ROAD_ISENGARD_RECIPES = recipes;
export const ROAD_ISENGARD_SCENARIO = "the-road-to-isengard";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string) => printed.find((c) => c.name === name)!.code;
export const RI = {
  rouse: code("Rouse the Ents"),
  breaking: code("Breaking Isengard"),
  voice: code("The Voice of Saruman"),
  ent: code("Ent of Fangorn"),
  saruman: code("Saruman"),
  staff: code("Saruman's Staff"),
  grima: code("Gríma"),
  gates: code("Gates of Isengard"),
  orthanc: code("Orthanc"),
  lieutenant: code("Lieutenant of Orthanc"),
  orc: code("Isengard Orc"),
  wolf: code("Wolf of Isengard"),
  vent: code("Steaming Vent"),
  pit: code("Open Pit"),
  plain: code("Plain of Isengard"),
  armoury: code("Underground Armoury"),
  ringWall: code("Ring-wall of Isengard"),
  blast: code("Blast of Sorcery"),
  machines: code("Machines of Isengard"),
  vapour: code("Poisoned Vapour"),
} as const;
/** Ent of Fangorn: at 3 resources, the triggering player takes control of it. */
export const RI_ENT_RESOURCES = 3;
/** Breaking Isengard: at 5 damage tokens, the players advance to stage 3A. */
export const RI_BREAKING_DAMAGE = 5;
/** The Voice of Saruman: each player draws 6 cards and keeps no more than 6. */
export const RI_VOICE_HAND = 6;
/** Orthanc: the first player looks at the top 3 cards of the encounter deck. */
export const RI_ORTHANC_LOOK = 3;
/** The locations with a Wizardry effect. */
export const RI_WIZARDRY: readonly string[] = printed
  .filter((c) => /(^|\n)Wizardry:/.test(c.text ?? ""))
  .map((c) => c.code);
export const hasWizardry = (c: string) => RI_WIZARDRY.includes(c);
const quest = (c: string) => ROAD_ISENGARD_QUESTS.find((q) => q.code === c);

export function roadIsengardStageInfo(s: GameState) {
  const q = s.roadIsengard;
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
/** Saruman, once he is in the staging area. */
export const roadIsengardSaruman = (s: GameState) =>
  s.roadIsengard ? s.staging.find((u) => u.code === RI.saruman) : undefined;
/** Saruman's Staff, once it is attached to Saruman. */
export const roadIsengardStaff = (s: GameState) =>
  roadIsengardSaruman(s)?.attachments.find((a) => a.code === RI.staff);
/** Units the scenario holds outside the ordinary zones. */
export const roadIsengardUnits = (s: GameState): Unit[] =>
  s.roadIsengard?.resolving ?? [];
export function roadIsengardPublicState(s: GameState) {
  const q = s.roadIsengard;
  if (!q) return undefined;
  const saruman = roadIsengardSaruman(s);
  const health = printed.find((c) => c.code === RI.saruman)?.health ?? 0;
  return {
    currentQuest: q.currentQuest,
    rouse: q.rouse,
    breaking: q.breaking,
    setAside: [...q.setAside],
    ents: s.staging.filter((u) => u.code === RI.ent).length,
    saruman: saruman
      ? {
          damage: saruman.damage,
          hitPoints: Math.max(0, health - saruman.damage),
          staff: !!roadIsengardStaff(s),
        }
      : null,
    looking: q.looking?.length ?? 0,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const ids = (v: unknown) =>
  Array.isArray(v) && v.every((id) => typeof id === "string");
const marker = (v: unknown) => {
  const m = v as { round?: unknown; phase?: unknown } | undefined;
  return !!m && natural(m.round) && typeof m.phase === "string";
};
export function validateRoadIsengard(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.roadIsengard;
  if (q === undefined) return s.scenarioId !== ROAD_ISENGARD_SCENARIO;
  const codes = ROAD_ISENGARD_QUESTS.map((c) => c.code);
  return (
    !!q &&
    s.scenarioId === ROAD_ISENGARD_SCENARIO &&
    [1, 2, 3].includes(s.stage) &&
    codes.includes(q.currentQuest) &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) =>
      [RI.gates, RI.orthanc, RI.saruman, RI.staff].includes(c as never),
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    natural(q.rouse) &&
    natural(q.breaking) &&
    (q.wizardry === undefined ||
      (Array.isArray(q.wizardry) &&
        q.wizardry.every(
          (w) =>
            !!w &&
            typeof w.enemy === "string" &&
            typeof w.code === "string" &&
            hasWizardry(w.code),
        ))) &&
    (q.staffPending === undefined ||
      (Array.isArray(q.staffPending) && q.staffPending.every(natural))) &&
    (q.staff === undefined || typeof q.staff === "boolean") &&
    (q.phaseProgress === undefined ||
      (marker(q.phaseProgress) && natural(q.phaseProgress.amount))) &&
    (q.orthanc === undefined || marker(q.orthanc)) &&
    (q.looking === undefined ||
      (Array.isArray(q.looking) &&
        q.looking.length <= RI_ORTHANC_LOOK &&
        q.looking.every((c) => typeof c === "string"))) &&
    [q.orcDefense, q.vapour].every(
      (m) => m === undefined || (!!m && natural(m.round) && ids(m.ids)),
    ) &&
    (q.grima === undefined || typeof q.grima === "string")
  );
}
