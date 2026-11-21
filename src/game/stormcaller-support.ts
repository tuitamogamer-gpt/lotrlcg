import encounters from "../data/stormcaller-encounter-cards.json";
import quests from "../data/stormcaller-quest-cards.json";
import recipes from "../data/stormcaller-recipes.json";
import nightmareCards from "../data/nightmare-encounter-cards.json";
import type { Card, GameState, Unit } from "./types";
import { DC, dcBase, isFleetShip } from "./dreamchaser-campaign-support";
export const STORMCALLER_ENCOUNTERS = encounters as Card[];
export const STORMCALLER_QUESTS = quests as Card[];
export const STORMCALLER_RECIPES = recipes;
/** The Nightmare Deck's encounter cards (docs/NIGHTMARE.md). */
export const STORMCALLER_NIGHTMARE_ENCOUNTERS = (
  nightmareCards as Card[]
).filter((c) => c.encounter_set === "Flight of the Stormcaller - Nightmare");
/** The Nightmare Deck's Corsair: Raider of the Storm joins the Corsair deck. */
export const STORMCALLER_NIGHTMARE_CORSAIRS = [
  "octgn:a3ac80dc-be8b-4d45-a9c4-f611183eb4be",
];
/** A Ship enemy or location of the scenario, or of its Nightmare Deck, that the Stormcaller's area can hold. */
const areaCard = (code: string) =>
  ["ship-enemy", "location"].includes(
    [...STORMCALLER_ENCOUNTERS, ...STORMCALLER_NIGHTMARE_ENCOUNTERS].find(
      (c) => c.code === code,
    )?.type_code ?? "",
  );
const code = (name: string, side?: string) =>
  [...encounters, ...quests].find(
    (c) => c.name === name && (!side || ("side" in c && c.side === side)),
  )!.code;
export const STORMCALLER = {
  departure: code("Swift Departure"),
  full: code("Full Sail Ahead!", "A"),
  foul: code("The Weather Turns Foul", "A"),
  cape: code("The Cape of Andrast", "A"),
  fullEnemy: code("Full Sail Ahead!", "C"),
  foulEnemy: code("The Weather Turns Foul", "C"),
  capeEnemy: code("The Cape of Andrast", "C"),
  stormcaller: code("Stormcaller"),
  escort: code("Sahír's Escort"),
  swift: code("Swift Raider"),
  skiff: code("Corsair Skiff"),
  seafarer: code("Corsair Seafarer"),
  blade: code("Serpent's Blade"),
  reef: code("Jagged Reef"),
  cove: code("Hidden Cove"),
  coast: code("Vast Coastland"),
  overboard: code("Man Overboard!"),
  squall: code("Raging Squall"),
  dream: code("Dream-chaser"),
  narelenya: code("Nárelenya"),
  dawn: code("Dawn Star"),
  silver: code("Silver Wing"),
  heading: code("Heading"),
  sailor: code("Southron Sailor"),
  pirate: code("Cunning Pirate"),
  marauder: code("Vicious Marauder"),
  captain: code("Umbar Captain"),
  calm: code("Calm Waters"),
  rough: code("Rough Waters"),
  waterspout: code("Waterspout"),
  rolling: code("Rolling Seas"),
  thrown: code("Thrown Off Course"),
  winds: code("Winds of Wrath"),
  sudden: code("Sudden Storms"),
};
export const STORMCALLER_MAIN_QUESTS = [
  STORMCALLER.departure,
  STORMCALLER.full,
  STORMCALLER.foul,
  STORMCALLER.cape,
];
export const STORMCALLER_ENEMY_QUESTS = [
  STORMCALLER.fullEnemy,
  STORMCALLER.foulEnemy,
  STORMCALLER.capeEnemy,
];
export const STORMCALLER_PLAYER_QUESTS = STORMCALLER_MAIN_QUESTS.map((code) =>
  STORMCALLER_QUESTS.find((c) => c.code === code)!,
);
export const STORMCALLER_PURSUER_QUESTS = STORMCALLER_ENEMY_QUESTS.map((code) =>
  STORMCALLER_QUESTS.find((c) => c.code === code)!,
);
export const STORMCALLER_SHIPS = [
  STORMCALLER.dream,
  STORMCALLER.narelenya,
  STORMCALLER.dawn,
  STORMCALLER.silver,
];
export const STORMCALLER_CORSAIRS = [
  STORMCALLER.sailor,
  STORMCALLER.pirate,
  STORMCALLER.marauder,
  STORMCALLER.captain,
  STORMCALLER.seafarer,
  STORMCALLER.blade,
];
export interface StormcallerState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  corsairDeck: string[];
  corsairDiscard: string[];
  /** The second encounter area has public physical units but never contributes to the players' staging threat. */
  area: Unit[];
  enemyQuest: string;
  enemyQuestDeck: string[];
  enemyCompletedQuests: string[];
  enemyStage: number;
  enemyProgress: number;
  stormcallerId: string;
  progressThisRound: number;
  damageThisRound: number;
  counterRound: number;
}
type State = GameState & { stormcaller?: StormcallerState };
export const stormcallerState = (s: GameState) => (s as State).stormcaller;
export const stormcallerCurrentQuest = (s: GameState) =>
  stormcallerState(s)?.currentQuest;
export function stormcallerStageInfo(s: GameState) {
  const c = STORMCALLER_QUESTS.find(
    (c) => c.code === stormcallerCurrentQuest(s),
  );
  return c
    ? {
        name: c.back_name ?? c.name,
        cardCode: c.code,
        quest: c.back_quest ?? 0,
        story: c.back_text ?? "",
        questImage: c.back_imagesrc ?? c.imagesrc,
      }
    : undefined;
}
export function validateStormcaller(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = stormcallerState(s);
  if (q === undefined) return s.scenarioId !== "flight-of-the-stormcaller";
  if (!q || s.scenarioId !== "flight-of-the-stormcaller") return false;
  if (
    !Array.isArray(q.questDeck) ||
    !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.enemyQuestDeck) ||
    !Array.isArray(q.enemyCompletedQuests)
  )
    return false;
  if (
    !Array.isArray(q.area) ||
    !Array.isArray(q.setAside) ||
    !q.area.every(validUnit) ||
    !q.setAside.every(validUnit)
  )
    return false;
  const tagged = s.staging.filter((u) => u.stormcallerArea);
  const remote = (s.table?.seats ?? []).filter(
    (_, index) => index !== s.table!.active,
  );
  const external = [
    ...s.heroes,
    ...s.allies,
    ...s.engaged,
    ...s.hand,
    ...remote.flatMap((seat) => [
      ...seat.heroes,
      ...seat.allies,
      ...seat.engaged,
      ...seat.hand,
    ]),
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  if (external.some((u) => u.stormcallerArea)) return false;
  const same =
    s.stage === q.enemyStage &&
    q.currentQuest === STORMCALLER_MAIN_QUESTS[q.enemyStage - 1];
  if (same ? q.area.length > 0 : tagged.length > 0) return false;
  if (tagged.some((u) => !areaCard(dcBase(u.code)))) return false;
  const physical = [...q.area, ...s.staging, ...external, ...q.setAside];
  if (new Set(physical.map((u) => u.id)).size !== physical.length) return false;
  const target = physical.find((u) => u.id === q.stormcallerId),
    bosses = physical.filter((u) => dcBase(u.code) === STORMCALLER.stormcaller);
  if (target && dcBase(target.code) !== STORMCALLER.stormcaller) return false;
  if (s.status === "playing" && (!target || bosses.length !== 1)) return false;
  if (q.counterRound > s.round) return false;
  const main = [...q.completedQuests, q.currentQuest, ...q.questDeck],
    enemy = [...q.enemyCompletedQuests, q.enemyQuest, ...q.enemyQuestDeck];
  // Nightmare mode: Raider of the Storm is in the Corsair deck.
  const corsair = (c: string) =>
    STORMCALLER_CORSAIRS.includes(c) ||
    c === DC.crowley ||
    (!!s.nightmareMode && STORMCALLER_NIGHTMARE_CORSAIRS.includes(c));
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    s.stage >= 1 &&
    s.stage <= 4 &&
    Number.isInteger(s.stage) &&
    q.currentQuest === STORMCALLER_MAIN_QUESTS[s.stage - 1] &&
    main.length === 4 &&
    main.every((c, i) => c === STORMCALLER_MAIN_QUESTS[i]) &&
    enemy.length === 3 &&
    enemy.every((c, i) => c === STORMCALLER_ENEMY_QUESTS[i]) &&
    q.enemyStage >= 2 &&
    q.enemyStage <= 4 &&
    Number.isInteger(q.enemyStage) &&
    q.enemyQuest === STORMCALLER_ENEMY_QUESTS[q.enemyStage - 2] &&
    [
      q.enemyProgress,
      q.progressThisRound,
      q.damageThisRound,
      q.counterRound,
    ].every((n) => Number.isInteger(n) && n >= 0) &&
    typeof q.stormcallerId === "string" &&
    Array.isArray(q.setAside) &&
    q.setAside.every(
      (u) =>
        validUnit(u) &&
        (STORMCALLER_SHIPS.includes(u.code) || isFleetShip(u.code)),
    ) &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    Array.isArray(q.area) &&
    q.area.every((u) => validUnit(u) && areaCard(dcBase(u.code))) &&
    new Set(q.area.map((u) => u.id)).size === q.area.length &&
    Array.isArray(q.corsairDeck) &&
    q.corsairDeck.every(corsair) &&
    Array.isArray(q.corsairDiscard) &&
    q.corsairDiscard.every(corsair)
  );
}
