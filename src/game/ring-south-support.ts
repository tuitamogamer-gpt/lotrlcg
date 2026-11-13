// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/ring-south-encounter-cards.json";
import quests from "../data/ring-south-quest-cards.json";
import recipes from "../data/ring-south-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { RingSouthState } from "./ring-south-types";

export const RING_SOUTH_ENCOUNTERS = encounters as Card[];
export const RING_SOUTH_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const RING_SOUTH_RECIPES = recipes;
export const RING_SOUTH_SCENARIO = "the-ring-goes-south";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const RS = {
  council: code("The Council of Elrond"),
  walkers: code("The Nine Walkers"),
  hunt: code("The Hunt is Up!"),
  gates: code("The Gates of Moria"),
  watcher: code("Watcher in the Water"),
  chief: code("Great Warg Chief"),
  hound: code("Hound of Sauron"),
  howling: code("Howling Warg"),
  crebain: code("Crebain from Dunland"),
  pass: code("Redhorn Pass"),
  doors: code("Doors of Durin"),
  hill: code("Tree-crowned Hill"),
  hollin: code("Hills of Hollin"),
  foothills: code("Redhorn Foothills"),
  eregion: code("Eregion"),
  crows: code("Regiments of Crows"),
  snow: code("Snowdrifts"),
  cold: code("Bitter Cold"),
  storm: code("Storm of Howls"),
  lust: code("Lust for the Ring"),
} as const;
export const RS_SET_ASIDE: readonly string[] = [
  RS.lust,
  RS.pass,
  RS.doors,
  RS.watcher,
];
/** The Watcher frees the Ring-bearer after its 6th damage. */
export const RS_WATCHER_DAMAGE = 6;
/** Doors of Durin: 9 damage tokens lose the game. */
export const RS_DOORS_DAMAGE = 9;
const byCode = new Map(RING_SOUTH_ENCOUNTERS.map((c) => [c.code, c]));
export const isRsWarg = (c: string) =>
  byCode.get(c)?.type_code === "enemy" &&
  (byCode.get(c)?.traits ?? "").split(".").some((t) => t.trim() === "Warg");

export function ringSouthStageInfo(s: GameState) {
  const q = RING_SOUTH_QUESTS[s.stage - 1];
  if (!q || !s.ringSouth) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const ringSouthUnits = (s: GameState): Unit[] =>
  s.ringSouth
    ? [
        ...s.ringSouth.resolving,
        ...s.ringSouth.council.map((c) => c.unit),
        ...(s.ringSouth.underWatcher ? [s.ringSouth.underWatcher] : []),
      ]
    : [];
export function ringSouthPublicState(s: GameState) {
  const q = s.ringSouth;
  if (!q) return undefined;
  const doors = [
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...s.staging,
  ].find((u) => u.code === RS.doors);
  const watcher = s.staging.find((u) => u.code === RS.watcher);
  return {
    currentQuest: q.currentQuest,
    setAside: [...q.setAside],
    council: q.council.map((c) => ({ owner: c.owner, code: c.unit.code })),
    underWatcher: !!q.underWatcher,
    watcherDamage: watcher?.damage ?? 0,
    doorsDamage: doors?.damage ?? 0,
    lustZero: q.lustZero.filter((x) => x.round === s.round).length,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateRingSouth(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.ringSouth;
  if (q === undefined) return s.scenarioId !== RING_SOUTH_SCENARIO;
  return (
    !!q &&
    s.scenarioId === RING_SOUTH_SCENARIO &&
    [1, 2, 3, 4].includes(s.stage) &&
    q.currentQuest === RING_SOUTH_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => RS_SET_ASIDE.includes(c)) &&
    new Set(q.setAside).size === q.setAside.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.council) &&
    q.council.length <= 4 &&
    q.council.every(
      (c) => !!c && integer(c.owner) && c.owner >= 0 && unit(c.unit),
    ) &&
    (q.underWatcher === null || unit(q.underWatcher)) &&
    Array.isArray(q.lustZero) &&
    q.lustZero.every(
      (x) => !!x && typeof x.id === "string" && integer(x.round),
    ) &&
    Array.isArray(q.snow) &&
    q.snow.every(
      (x) =>
        !!x &&
        typeof x.id === "string" &&
        integer(x.round) &&
        integer(x.amount) &&
        x.amount >= 0,
    ) &&
    integer(q.engagedRound) &&
    Array.isArray(q.engagedIds) &&
    q.engagedIds.every((id) => typeof id === "string")
  );
}
