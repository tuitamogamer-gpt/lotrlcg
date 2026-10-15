import encounters from "../data/city-encounter-cards.json";
import quests from "../data/city-quest-cards.json";
import recipes from "../data/city-recipes.json";
import type { Card, GameState, Unit } from "./types";

export const CITY_ENCOUNTERS = encounters as Card[];
export const CITY_QUESTS = quests as Card[];
export const CITY_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const CITY = {
  coast: code("The Coast of Umbar"),
  fate: code("Fate of The Dream-chaser"),
  haven: code("The Haven of Umbar"),
  final: code("Final Confrontation"),
  stormcaller: code("Stormcaller"),
  sahir: code("Captain Sahír"),
  monument: code("The Shattered Monument"),
  slave: code("Slave Ship"),
  slaver: code("Umbar Slaver"),
  belfalas: code("Southern Belfalas"),
  waters: code("Corsair Waters"),
  watch: code("Watch Tower"),
  serpent: code("Serpent's Tail"),
  fury: code("Fury and Malice"),
  city: code("City of Corsairs"),
  streets: code("Streets of Umbar"),
  harbor: code("Umbar Harbor"),
  foes: code("Foes of Ecthelion"),
  patrol: code("Umbar Patrol"),
  battle: code("Battle-Hardened"),
  dream: code("Dream-chaser"),
  narelenya: code("Nárelenya"),
  dawn: code("Dawn Star"),
  silver: code("Silver Wing"),
  heading: code("Heading"),
  raider: code("Umbar Raider"),
  infiltrator: code("Corsair Infiltrator"),
  leader: code("Raid Leader"),
};
export const CITY_MAIN_QUESTS = [CITY.coast, CITY.fate, CITY.haven, CITY.final];
export const CITY_SHIPS = [CITY.dream, CITY.narelenya, CITY.dawn, CITY.silver];
export const CITY_CORSAIRS = [
  CITY.slaver,
  CITY.raider,
  CITY.infiltrator,
  CITY.leader,
];
export interface CityState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** Fleet cards and the two land-stage cards awaiting their printed entry. */
  setAside: Unit[];
  corsairDeck: string[];
  corsairDiscard: string[];
  /** The original inactive second encounter deck becomes the active land deck. */
  secondDeck: string[];
  /** Original sea encounter deck and discard retained, inactive, after stage 2B. */
  inactiveDeck: string[];
  inactiveDiscard: string[];
  stormcallerDestroyed: boolean;
  /** Only ordinary enemy-attack opportunities consume this phase's entitlement. */
  sahirAttacks?: { id: string; round: number; count: number };
  patrolRound?: number;
  allyEntries: { round: number; count: number };
  foes: { id: string; phase: string }[];
}
export const cityCurrentQuest = (s: GameState) => s.city?.currentQuest;
export function cityStageInfo(s: GameState) {
  const q = CITY_QUESTS.find((q) => q.code === cityCurrentQuest(s));
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export function validateCity(s: GameState, validUnit: (u: unknown) => boolean) {
  const q = s.city;
  if (q === undefined) return s.scenarioId !== "the-city-of-corsairs";
  if (
    !q ||
    s.scenarioId !== "the-city-of-corsairs" ||
    !Array.isArray(q.questDeck) ||
    !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.setAside) ||
    !Array.isArray(q.corsairDeck) ||
    !Array.isArray(q.corsairDiscard) ||
    !Array.isArray(q.secondDeck) ||
    !Array.isArray(q.inactiveDeck) ||
    !Array.isArray(q.inactiveDiscard) ||
    !Array.isArray(q.foes) ||
    !q.allyEntries
  )
    return false;
  const definitions = new Set(CITY_ENCOUNTERS.map((c) => c.code));
  const quests = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const remote = (s.table?.seats ?? []).filter((_, i) => i !== s.table!.active);
  const active = [
    ...s.staging,
    ...s.engaged,
    ...s.heroes,
    ...s.allies,
    ...remote.flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged]),
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  const all = [...active, ...q.setAside];
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    typeof q.stormcallerDestroyed === "boolean" &&
    (q.sahirAttacks === undefined ||
      (q.sahirAttacks &&
        typeof q.sahirAttacks.id === "string" &&
        Number.isInteger(q.sahirAttacks.round) &&
        q.sahirAttacks.round >= 0 &&
        q.sahirAttacks.round <= s.round &&
        Number.isInteger(q.sahirAttacks.count) &&
        q.sahirAttacks.count >= 0)) &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 4 &&
    q.currentQuest === CITY_MAIN_QUESTS[s.stage - 1] &&
    quests.length === 4 &&
    quests.every((c, i) => c === CITY_MAIN_QUESTS[i]) &&
    q.setAside.every(
      (u) =>
        validUnit(u) &&
        [...CITY_SHIPS, CITY.sahir, CITY.monument].includes(u.code),
    ) &&
    new Set(all.map((u) => u.id)).size === all.length &&
    [q.secondDeck, q.inactiveDeck, q.inactiveDiscard].every((p) =>
      p.every((c) => definitions.has(c)),
    ) &&
    q.corsairDeck.every((c) => CITY_CORSAIRS.includes(c)) &&
    q.corsairDiscard.every((c) => CITY_CORSAIRS.includes(c)) &&
    (s.stage < 3 ||
      (q.secondDeck.length === 0 &&
        q.corsairDeck.length === 0 &&
        q.corsairDiscard.length === 0)) &&
    (q.patrolRound === undefined ||
      (Number.isInteger(q.patrolRound) &&
        q.patrolRound >= 0 &&
        q.patrolRound <= s.round)) &&
    Number.isInteger(q.allyEntries.round) &&
    q.allyEntries.round >= 0 &&
    q.allyEntries.round <= s.round &&
    Number.isInteger(q.allyEntries.count) &&
    q.allyEntries.count >= 0 &&
    q.foes.every(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.phase === "string" &&
        /^\d+:(setup|resource|planning|quest|travel|encounter|combat|refresh)$/.test(
          x.phase,
        ),
    )
  );
}
