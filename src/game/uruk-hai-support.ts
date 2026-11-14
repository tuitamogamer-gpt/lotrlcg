// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/uruk-hai-encounter-cards.json";
import quests from "../data/uruk-hai-quest-cards.json";
import recipes from "../data/uruk-hai-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { UrukHaiState, UrukHaiCaptive } from "./uruk-hai-types";

export const URUK_HAI_ENCOUNTERS = encounters as Card[];
export const URUK_HAI_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const URUK_HAI_RECIPES = recipes;
export const URUK_HAI_SCENARIO = "the-uruk-hai";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const UH = {
  follow: code("Follow the Orcs"),
  rescue: code("Rescue the Captives"),
  isengard: code("To Isengard!"),
  ugluk: code("Uglúk"),
  grishnakh: code("Grishnákh"),
  uruks: code("Uglúk's Uruk-hai"),
  wold: code("The Wold"),
  eastemnet: code("Eastemnet"),
  plains: code("Plains of Rohan"),
  banks: code("Banks of Entwash"),
  rest: code("Rest by Night?"),
  weariness: code("Strange Weariness"),
  barrier: code("Unseen Barrier"),
  uruk: code("Isengard Uruk"),
  fighter: code("Uruk-hai Fighter"),
  fighting: code("Fighting Uruk-hai"),
  snaga: code("Snaga"),
  orders: code("Saruman's Orders"),
} as const;
/** Follow the Orcs: the pursuit value starts at 10. */
export const UH_START_PURSUIT = 10;
/** To Isengard!: at 30 or more at the end of the refresh phase, the players lose. */
export const UH_LOST_PURSUIT = 30;
/** Unseen Barrier: no more than 3 progress on the current quest this round. */
export const UH_BARRIER_LIMIT = 3;
const quest = (c: string) => URUK_HAI_QUESTS.find((q) => q.code === c);
const byCode = new Map(URUK_HAI_ENCOUNTERS.map((c) => [c.code, c]));
/** Printed Toughness X of an encounter enemy. */
export const uhToughness = (c: string) =>
  Number(/\bToughness (\d+)/.exec(byCode.get(c)?.text ?? "")?.[1] ?? 0);
/** Printed Archery X of an encounter card. */
export const uhArchery = (c: string) =>
  Number(/\bArchery (\d+)/.exec(byCode.get(c)?.text ?? "")?.[1] ?? 0);
export const isUrukHaiCode = (c: string) => {
  const printed = byCode.get(c);
  return (
    printed?.type_code === "enemy" &&
    (printed.traits ?? "")
      .split(".")
      .map((t) => t.trim())
      .includes("Uruk-hai")
  );
};

export function urukHaiStageInfo(s: GameState) {
  const q = s.urukHai;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    // X is the pursuit value.
    quest: front ? 0 : q.pursuit,
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const urukHaiUnits = (s: GameState): Unit[] => [
  ...(s.urukHai?.resolving ?? []),
  ...(s.urukHai?.captives.map((c) => c.unit) ?? []),
];
export function urukHaiPublicState(s: GameState) {
  const q = s.urukHai;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    pursuit: q.pursuit,
    captives: q.captives.map((c) => ({
      id: c.unit.id,
      code: c.unit.code,
      owner: c.owner,
      damage: c.unit.damage,
      ...(c.holder ? { holder: c.holder } : {}),
    })),
    barrier:
      q.barrier?.round === s.round
        ? { placed: q.barrier.placed, limit: UH_BARRIER_LIMIT }
        : null,
    fighting: q.fighting?.round === s.round ? [...q.fighting.players] : [],
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateUrukHai(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.urukHai;
  if (q === undefined) return s.scenarioId !== URUK_HAI_SCENARIO;
  const seats = s.table?.seats.length ?? 1;
  const ids = q?.captives?.map((c) => c?.unit?.id) ?? [];
  return (
    !!q &&
    s.scenarioId === URUK_HAI_SCENARIO &&
    [1, 2].includes(s.stage) &&
    [UH.follow, UH.rescue].includes(q.currentQuest as never) &&
    typeof q.advancing === "boolean" &&
    integer(q.pursuit) &&
    q.pursuit >= 0 &&
    Array.isArray(q.captives) &&
    q.captives.every(
      (c) =>
        !!c &&
        unit(c.unit) &&
        integer(c.owner) &&
        c.owner >= 0 &&
        c.owner < seats &&
        (c.holder === undefined || typeof c.holder === "string"),
    ) &&
    new Set(ids).size === ids.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.barrier === undefined ||
      (!!q.barrier &&
        integer(q.barrier.round) &&
        integer(q.barrier.placed) &&
        q.barrier.placed >= 0)) &&
    (q.fighting === undefined ||
      (!!q.fighting &&
        integer(q.fighting.round) &&
        Array.isArray(q.fighting.players) &&
        q.fighting.players.every((p) => integer(p) && p >= 0 && p < seats)))
  );
}
