// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/caves-nibin-dum-encounter-cards.json";
import quests from "../data/caves-nibin-dum-quest-cards.json";
import recipes from "../data/caves-nibin-dum-recipes.json";
import { OATH_ENCOUNTERS } from "./the-oath-support";
import type { Card, GameState, Unit } from "./types";
export type { CavesState } from "./caves-nibin-dum-types";

/** The Caves set (and The Dark of Mirkwood's Crumbling Stairs); the Goblins set is The Oath's. */
export const CAVES_ENCOUNTERS = encounters as Card[];
export const CAVES_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const CAVES_RECIPES = recipes;
/** The Dark of Mirkwood's version (2022) and the Starter's (2018). */
export const CAVES_SCENARIO = "the-caves-of-nibin-dum";
export const CAVES_2018_SCENARIO = "the-caves-of-nibin-dum-2018";
export const isCavesScenario = (id: string) =>
  id === CAVES_SCENARIO || id === CAVES_2018_SCENARIO;
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
export const CAVES = {
  dark: code("The Dark of Nibin-Dûm"),
  surprise: code("Surprise Attack"),
  chasm: code("The Chasm"),
  oathkeepers: code("Oathkeepers"),
  chieftain: code("Goblin Chieftain"),
  pillar: code("Cracked Pillar"),
  torch: code("Cave Torch"),
  troll: code("Great Cave-troll"),
  warg: code("Cavern Warg"),
  tunnels: code("Goblin Tunnels"),
  passage: code("Lightless Passage"),
  branching: code("Branching Paths"),
  mine: code("Collapsed Mine"),
  dungeon: code("Goblin Dungeon"),
  ruin: code("Crumbling Ruin"),
  lost: code("Lost in the Dark"),
  eyes: code("Watchful Eyes"),
  stairs: code("Crumbling Stairs"),
} as const;
export const CAVES_STAGES = [
  CAVES.dark,
  CAVES.surprise,
  CAVES.chasm,
  CAVES.oathkeepers,
] as const;
/** The treacheries of the Caves set the scenario resolves itself. */
export const CAVES_TREACHERIES: readonly string[] = [
  CAVES.ruin,
  CAVES.lost,
  CAVES.eyes,
];
const all = new Map(
  [...CAVES_ENCOUNTERS, ...OATH_ENCOUNTERS].map((c) => [c.code, c]),
);
const traitsOf = (c: string) =>
  (all.get(c)?.traits ?? "").split(".").map((t) => t.trim());
export const cavesHasTrait = (u: Unit | string, trait: string) =>
  traitsOf(typeof u === "string" ? u : u.code).includes(trait);
export const isCavesEnemy = (c: string) => all.get(c)?.type_code === "enemy";
export const isCavesLocation = (c: string) =>
  all.get(c)?.type_code === "location";
export const isGoblinCode = (c: string) =>
  isCavesEnemy(c) && cavesHasTrait(c, "Goblin");
export const isDarkLocation = (c: string) =>
  isCavesLocation(c) && cavesHasTrait(c, "Dark");

type Recipe = (typeof recipes)[number];
/**
 * The recipe in play: The Dark of Mirkwood's standard or easy recipe, or the
 * Starter's single recipe. The Starter printed the same gold easy-mode icons,
 * so its easy mode removes the cards The Dark of Mirkwood's easy recipe drops.
 */
export function cavesRecipe(scenarioId: string, easy: boolean) {
  const byId = (id: string) => recipes.find((r) => r.id === id)! as Recipe;
  if (scenarioId === CAVES_2018_SCENARIO) {
    const lce = byId("Q00.02A");
    if (!easy) return lce;
    const easyRecipe = byId("E00.02B");
    const keep = new Map(
      easyRecipe.cards.map((c) => [`${c.section}:${c.code}`, c.quantity]),
    );
    return {
      ...lce,
      id: "Q00.02A-easy",
      mode: "easy",
      cards: lce.cards.filter((c) => keep.has(`${c.section}:${c.code}`)),
    } as Recipe;
  }
  return byId(easy ? "E00.02B" : "Q00.02B");
}

export function cavesStageInfo(s: GameState) {
  const q = s.caves;
  if (!q) return undefined;
  const c = CAVES_QUESTS.find((x) => x.code === q.currentQuest);
  if (!c) return undefined;
  const front = s.stageRevealing;
  // 2B: 0 quest points, +4 for each enemy in play.
  const goal =
    q.currentQuest === CAVES.surprise
      ? 4 * enemiesInPlay(s).length
      : (c.back_quest ?? 0);
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : goal,
    story: (front ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
const engagedUnits = (s: GameState) => [
  ...(s.engaged ?? []),
  ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
];
/** The enemies in play: in the staging area or engaged with a player. */
export const enemiesInPlay = (s: GameState) => [
  ...s.staging.filter((u) => isCavesEnemy(u.code)),
  ...engagedUnits(s),
];
export const cavesUnits = (s: GameState): Unit[] => [
  ...(s.caves?.resolving ?? []),
];
const characterUnits = (s: GameState) => [
  ...(s.heroes ?? []),
  ...(s.allies ?? []),
  ...(s.table?.seats.flatMap((seat) => [
    ...(seat.heroes ?? []),
    ...(seat.allies ?? []),
  ]) ?? []),
];
/** The scenario's public state, for the panel and the browser checks. */
export function cavesPublicState(s: GameState) {
  const q = s.caves;
  if (!q) return undefined;
  const stage = (CAVES_STAGES as readonly string[]).indexOf(q.currentQuest) + 1;
  const pillar = s.staging.find((u) => u.code === CAVES.pillar);
  const chieftainInPlay = [...s.staging, ...engagedUnits(s)].some(
    (u) => u.code === CAVES.chieftain,
  );
  const torchHolder = characterUnits(s).find((u) =>
    u.attachments.some((a) => a.code === CAVES.torch),
  );
  const torch = torchHolder?.attachments.find((a) => a.code === CAVES.torch);
  return {
    currentQuest: q.currentQuest,
    stage,
    side: `${stage}${s.stageRevealing ? "A" : "B"}`,
    edition: q.edition,
    chieftain: q.setAside.includes(CAVES.chieftain)
      ? ("aside" as const)
      : chieftainInPlay
        ? ("play" as const)
        : ("gone" as const),
    pillar: q.setAside.includes(CAVES.pillar)
      ? ("aside" as const)
      : pillar
        ? ("staging" as const)
        : s.activeLocation?.code === CAVES.pillar
          ? ("active" as const)
          : ("explored" as const),
    pillarDamage: pillar?.damage ?? 0,
    torch: torch
      ? torch.exhausted
        ? ("exhausted" as const)
        : ("ready" as const)
      : ("gone" as const),
    torchHero: torchHolder?.code ?? null,
  };
}
export function validateCaves(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.caves;
  if (q === undefined) return !isCavesScenario(s.scenarioId);
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && all.has(c));
  return (
    !!q &&
    isCavesScenario(s.scenarioId) &&
    (CAVES_STAGES as readonly string[]).includes(q.currentQuest) &&
    s.stage ===
      (CAVES_STAGES as readonly string[]).indexOf(q.currentQuest) + 1 &&
    typeof q.advancing === "boolean" &&
    (q.edition === "2018" || q.edition === "2022") &&
    (q.edition === "2018") === (s.scenarioId === CAVES_2018_SCENARIO) &&
    codes(q.setAside) &&
    (q.questProgress === null ||
      (Number.isInteger(q.questProgress.round) &&
        Number.isInteger(q.questProgress.amount))) &&
    (q.dark === null ||
      (Number.isInteger(q.dark.round) && typeof q.dark.phase === "string")) &&
    (q.pillarAttacked === null || Number.isInteger(q.pillarAttacked)) &&
    Array.isArray(q.noDamage) &&
    q.noDamage.every(
      (m) =>
        typeof m?.id === "string" &&
        Number.isInteger(m.round) &&
        typeof m.phase === "string",
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit)
  );
}
