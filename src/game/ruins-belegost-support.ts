// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/ruins-belegost-encounter-cards.json";
import quests from "../data/ruins-belegost-quest-cards.json";
import recipes from "../data/ruins-belegost-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { RuinsBelegostState } from "./ruins-belegost-types";

export const RB_ENCOUNTERS = encounters as Card[];
export const RB_QUESTS = quests as Card[];
export const RB_RECIPES = recipes;
export const RB_SCENARIO = "the-ruins-of-belegost";
const printed = [...encounters, ...quests] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
export const RB = {
  first: code("Ruins of the First Age"),
  evils: code("Ancient Evils Disturbed"),
  deeper: code("Deeper into the Past"),
  servants: code("The Servants of Morgoth"),
  roots: code("The Roots of Ered Luin"),
  mines: code("The Mines of Belegost"),
  beast: code("The Beast of Belegost"),
  rules1: code("Scenario Rules 1"),
  rules2: code("Scenario Rules 2"),
  stalking: code("Stalking the Ruins"),
  naurlhug: code("Naurlhûg"),
  lair: code("Naurlhûg's Lair"),
  lurker: code("Lurker of the Depths"),
  sword: code("Sword of Belegost"),
  book: code("Book of Aulë's Children"),
  gem: code("Blue Mountain Gem"),
  torch: code("Dwarven Torch"),
  keys: code("Keys of Belegost"),
  map: code("Map of Ered Luin"),
  spikes: code("Concealed Spikes"),
  tunnel: code("Darkened Tunnel"),
  orc: code("Orc of Ered Luin"),
  treasury: code("Sunken Treasury"),
  mine: code("Abandoned Mine"),
  chamber: code("Secret Chamber"),
  hall: code("Flooded Hall"),
  troll: code("Old Stone Troll"),
  goblin: code("Blue Mountain Goblin"),
  spawn: code("Spawn of Thangorodrim"),
  echoes: code("Echoes in the Dark"),
  dweller: code("Nameless Cave Dweller"),
  pit: code("Covered Pit"),
} as const;
/** The stage number of each quest card: stages 2 and 3 have alternative cards. */
export const RB_STAGE: Record<string, number> = {
  [RB.first]: 1,
  [RB.evils]: 2,
  [RB.deeper]: 2,
  [RB.servants]: 3,
  [RB.roots]: 3,
  [RB.mines]: 3,
  [RB.beast]: 4,
};
/** The printed sides of each quest card. */
export const RB_SIDES: Record<string, readonly [string, string]> = {
  [RB.first]: ["1A", "1B"],
  [RB.evils]: ["2A", "2B"],
  [RB.deeper]: ["2C", "2D"],
  [RB.servants]: ["3A", "3B"],
  [RB.roots]: ["3C", "3D"],
  [RB.mines]: ["3E", "3F"],
  [RB.beast]: ["4A", "4B"],
};
export const RB_QUEST_CODES = Object.keys(RB_STAGE);
/** The five Loot objectives one of which lies under Stalking the Ruins. */
export const RB_LOOT_POOL: readonly string[] = [
  RB.book,
  RB.gem,
  RB.torch,
  RB.keys,
  RB.map,
];
export const RB_LOOT: readonly string[] = [...RB_LOOT_POOL, RB.sword];
export const isLoot = (c: string) => RB_LOOT.includes(c);
const byCode = new Map(printed.map((c) => [c.code, c]));
export const rbTraits = (c: string) =>
  (byCode.get(c)?.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
export const isHazard = (c: string) => rbTraits(c).includes("Hazard");
/** The printed Discover value of a location, if any. */
export function printedDiscover(c: string) {
  const m = /^Discover (\d+)\./m.exec(byCode.get(c)?.text ?? "");
  return m ? Number(m[1]) : 0;
}
type Recipe = (typeof recipes)[number];
/** The recipe in play: Q99.06, or E99.06 in easy mode. */
export const rbRecipe = (easy: boolean) =>
  recipes.find((r) => r.mode === (easy ? "easy" : "standard"))! as Recipe;

const quest = (c: string) => RB_QUESTS.find((q) => q.code === c)!;
export function rbStageInfo(s: GameState) {
  const q = s.ruinsBelegost;
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
export const rbUnits = (s: GameState): Unit[] => [
  ...(s.ruinsBelegost?.resolving ?? []),
];
/** Loot objectives attached to heroes. */
export function claimedLootCodes(s: GameState) {
  const heroes = [
    ...s.heroes,
    ...(s.table?.seats.flatMap((seat) => seat.heroes ?? []) ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of heroes) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    for (const a of h.attachments) if (isLoot(a.code)) out.push(a.code);
  }
  return out;
}
/** The scenario's public state, for the panel and the browser checks. */
export function ruinsBelegostPublicState(s: GameState) {
  const q = s.ruinsBelegost;
  if (!q) return undefined;
  const stalking = s.staging.find((u) => u.code === RB.stalking);
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  return {
    currentQuest: q.currentQuest,
    side: RB_SIDES[q.currentQuest][s.stageRevealing ? 0 : 1],
    stage: RB_STAGE[q.currentQuest],
    loot: [...new Set(claimedLootCodes(s))],
    stalking: stalking?.resources ?? 0,
    naurlhug: q.setAside.includes(RB.naurlhug)
      ? ("aside" as const)
      : [...s.staging, ...engaged].some((u) => u.code === RB.naurlhug)
        ? ("play" as const)
        : ("gone" as const),
    hidden: q.under !== null,
    questResources: q.questResources,
  };
}
export function validateRuinsBelegost(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.ruinsBelegost;
  if (q === undefined) return s.scenarioId !== RB_SCENARIO;
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && byCode.has(c));
  return (
    !!q &&
    s.scenarioId === RB_SCENARIO &&
    RB_QUEST_CODES.includes(q.currentQuest) &&
    s.stage === RB_STAGE[q.currentQuest] &&
    typeof q.advancing === "boolean" &&
    codes(q.setAside) &&
    (q.under === null || RB_LOOT_POOL.includes(q.under)) &&
    Number.isInteger(q.questResources) &&
    q.questResources >= 0 &&
    (q.hazardSurgeRound === null || Number.isInteger(q.hazardSurgeRound)) &&
    (q.lurkerDamage === null ||
      (Number.isInteger(q.lurkerDamage.round) &&
        Number.isInteger(q.lurkerDamage.damage))) &&
    (q.echoes === null ||
      (typeof q.echoes.phase === "string" &&
        Number.isInteger(q.echoes.round) &&
        Number.isInteger(q.echoes.value))) &&
    Array.isArray(q.weakened) &&
    q.weakened.every(
      (w) =>
        typeof w.id === "string" &&
        typeof w.phase === "string" &&
        Number.isInteger(w.round) &&
        (w.kind === "torch" || w.kind === "map"),
    ) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.looking) &&
    (q.discovering === null || typeof q.discovering === "string") &&
    Number.isInteger(q.discoveredHazards)
  );
}
