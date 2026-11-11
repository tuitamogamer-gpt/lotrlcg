import encounters from "../data/we-must-away-encounter-cards.json";
import quests from "../data/we-must-away-quest-cards.json";
import recipes from "../data/we-must-away-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { WeMustAwayState } from "./we-must-away-types";

export const WMA_ENCOUNTERS = encounters as Card[];
export const WMA_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const WMA_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const WMA = {
  party: code("An Unexpected Party"),
  mutton: code("Roast Mutton"),
  dawn: code("Dawn Take You All"),
  bert: code("Bert"),
  tom: code("Tom"),
  william: code("William"),
  crow: code("A Suspicious Crow"),
  camp: code("Troll Camp"),
  cave: code("Troll Cave"),
  hobbitLands: code("Hobbit-lands"),
  drearyHills: code("Dreary Hills"),
  loneLands: code("Lone-Lands"),
  caveEntrance: code("Cave Entrance"),
  purse: code("Troll Purse"),
  key: code("Troll Key"),
  smelly: code("A Smelly Sack"),
  strong: code("A Strong Sack"),
  tough: code("A Tough Sack"),
  large: code("A Large Sack"),
  deep: code("A Deep Sack"),
  foul: code("A Foul Sack"),
  worn: code("A Worn Sack"),
  lots: code("Lots or None at All"),
  pickle: code("A Nice Pickle"),
  roast: code("Roast 'Em or Boil 'Em?"),
  hungry: code("Hungry Troll"),
  campfire: code("No Campfire"),
  rain: code("Wind-whipped Rain"),
  grocer: code("More Like a Grocer"),
};
export const WMA_TROLLS = [WMA.bert, WMA.tom, WMA.william];
export const WMA_SACKS = [
  WMA.deep,
  WMA.foul,
  WMA.large,
  WMA.smelly,
  WMA.strong,
  WMA.tough,
  WMA.worn,
];
/** Sting, Glamdring and Orcrist, discovered when Troll Cave was explored. */
export const WMA_TREASURES = ["131020", "131022", "131021"];
const traitsOf = new Map(
  encounters.map((c) => [
    c.code,
    (c.traits ?? "").split(".").map((t) => t.trim()),
  ]),
);
export const wmaTrait = (u: Unit | string, trait: string) =>
  !!traitsOf.get(typeof u === "string" ? u : u.code)?.includes(trait);
export function wmaStageInfo(s: GameState) {
  const q = WMA_QUESTS[s.stage - 1];
  if (!q || !s.weMustAway) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? q.quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? q.text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const wmaUnits = (s: GameState): Unit[] => [
  ...(s.weMustAway?.setAside ?? []),
  ...(s.weMustAway?.resolving ?? []),
];
export function wmaPublicState(s: GameState) {
  const q = s.weMustAway;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    sackDeck: q.sackDeck.length,
    drawn: [...q.drawn],
    setAside: q.setAside.map((u) => u.code),
    resolving: q.resolving.length,
    treasures: [...q.treasures],
  };
}
export function validateWeMustAway(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.weMustAway;
  if (q === undefined) return s.scenarioId !== "we-must-away-ere-break-of-day";
  const aside = [...WMA_TROLLS, WMA.cave];
  return (
    !!q &&
    s.scenarioId === "we-must-away-ere-break-of-day" &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === WMA_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.sackDeck) &&
    Array.isArray(q.drawn) &&
    [...q.sackDeck, ...q.drawn].every((c) => WMA_SACKS.includes(c)) &&
    new Set([...q.sackDeck, ...q.drawn]).size ===
      q.sackDeck.length + q.drawn.length &&
    Array.isArray(q.setAside) &&
    q.setAside.every((u) => unit(u) && aside.includes(u.code)) &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    // Stage 2A's When Revealed moves them into play after the stage begins.
    (s.stage === 1 ||
      (s.stage === 2 && s.stageRevealing) ||
      !q.setAside.length) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.treasures) &&
    (q.treasures.length === 0 ||
      JSON.stringify(q.treasures) === JSON.stringify(WMA_TREASURES))
  );
}
