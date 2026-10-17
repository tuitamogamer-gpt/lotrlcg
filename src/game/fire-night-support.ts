import encounters from "../data/fire-night-encounter-cards.json";
import quests from "../data/fire-night-quest-cards.json";
import recipes from "../data/fire-night-recipes.json";
import playerCards from "../data/official-player-cards.json";
import type { Card, GameState } from "./types";
export type { FireNightState } from "./fire-night-types";
export const FIRE_NIGHT_ENCOUNTERS = encounters as Card[];
export const FIRE_NIGHT_QUESTS = quests as Card[];
export const FIRE_NIGHT_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FIRE_NIGHT = {
  hill: code("Hrogar's Hill"),
  dagnir: code("Dagnir"),
  face: code("Face the Dragon"),
  douse: code("Douse the Flames"),
  rally: code("Rally the Woodmen"),
  fortify: code("Fortify the Defense"),
  hold: code("Hold the Door"),
  defend: code("Defend the Town"),
  drawFire: code("Draw Her Fire"),
  rout: code("Rout the Goblins"),
  palisade: code("Wooden Palisade"),
  tower: code("Burning Watchtower"),
  gate: code("Town Gate"),
  orc: code("Orc of the Flame"),
  thrall: code("The Dragon's Thrall"),
  flames: code("Bright Flames"),
  wrath: code("Powerful in Wrath"),
  fury: code("The Dragon's Fury"),
  darkWoods: code("Dark Black Woods"),
  accursed: code("Accursed Forest"),
  troop: code("Goblin Troop"),
  stray: code("Stray Goblin"),
  gloom: code("Gathering Gloom"),
  bats: code("Swarm of Bats"),
};
export const FIRE_NIGHT_SIDE_QUESTS = encounters
  .filter((c) => c.type_code === "encounter-side-quest")
  .map((c) => c.code);
const sideCodes = new Set([
  ...FIRE_NIGHT_SIDE_QUESTS,
  ...playerCards
    .filter((c) => c.type_code === "player-side-quest")
    .map((c) => c.code),
]);
export const fireNightSideCount = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => sideCodes.has(c)).length;
export function fireNightStageInfo(s: GameState) {
  if (!s.fireNight) return undefined;
  const q = FIRE_NIGHT_QUESTS[0];
  return {
    name: q.back_name ?? q.name,
    cardCode: q.code,
    quest: q.back_quest ?? 50,
    story: q.back_text ?? "",
    questImage: q.back_imagesrc ?? q.imagesrc,
  };
}
export function validateFireNight(
  s: GameState,
  validUnit: (u: unknown) => boolean,
): boolean {
  const q = s.fireNight;
  if (q === undefined) return s.scenarioId !== "fire-in-the-night";
  if (
    !q ||
    s.scenarioId !== "fire-in-the-night" ||
    s.stage !== 1 ||
    q.currentQuest !== FIRE_NIGHT.hill ||
    typeof q.initialized !== "boolean" ||
    !Number.isInteger(q.hillDamage) ||
    q.hillDamage < 0 ||
    !Array.isArray(q.sideDeck) ||
    !Array.isArray(q.resolving) ||
    !Array.isArray(q.locationProgress)
  )
    return false;
  const damage = q.nonQuestDamage;
  if (
    !damage ||
    !Number.isInteger(damage.round) ||
    damage.round < 0 ||
    damage.round > s.round ||
    !Number.isInteger(damage.amount) ||
    damage.amount < 0
  )
    return false;
  const live = [
    ...s.staging,
    ...s.engaged,
    ...s.heroes,
    ...s.allies,
    ...s.hand,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...(s.table?.seats ?? [])
      .filter((_, i) => i !== s.table!.active)
      .flatMap((p) => [...p.heroes, ...p.allies, ...p.hand, ...p.engaged]),
  ];
  const physical = [...live, ...q.sideDeck];
  return (
    q.sideDeck.every(
      (u) => validUnit(u) && FIRE_NIGHT_SIDE_QUESTS.includes(u.code),
    ) &&
    new Set(physical.map((u) => u.id)).size === physical.length &&
    new Set(q.sideDeck.map((u) => u.code)).size === q.sideDeck.length &&
    q.resolving.every((c) =>
      FIRE_NIGHT_ENCOUNTERS.some(
        (d) => d.code === c && d.type_code === "treachery",
      ),
    ) &&
    q.locationProgress.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        Number.isInteger(m.amount) &&
        m.amount >= 0 &&
        m.amount <= 1,
    )
  );
}
