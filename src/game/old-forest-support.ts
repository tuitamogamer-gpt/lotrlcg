// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/old-forest-encounter-cards.json";
import quests from "../data/old-forest-quest-cards.json";
import recipes from "../data/old-forest-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { OldForestState } from "./old-forest-types";

export const OLD_FOREST_ENCOUNTERS = encounters as Card[];
export const OLD_FOREST_QUESTS = [...quests].sort(
  (a, b) => a.position - b.position,
) as Card[];
export const OLD_FOREST_RECIPES = recipes;
export const OLD_FOREST_SCENARIO = "the-old-forest";
const code = (name: string, back?: string) =>
  [...encounters, ...quests].find(
    (c) =>
      c.name === name && (!back || ("back_name" in c && c.back_name === back)),
  )!.code;
export const OF = {
  farewell: code("Farewell to the Shire"),
  dark: code("The Living Forest", "Dark Bad Place"),
  brambles: code("The Living Forest", "Choked with Brambles"),
  shifting: code("The Living Forest", "Shifting Trees"),
  closing: code("The Living Forest", "Closing in Around Them"),
  wicked: code("The Wicked Willow"),
  willow: code("Old Man Willow"),
  trailer: code("Long Trailer"),
  root: code("Grasping Root"),
  flies: code("Army of Flies"),
  withywindle: code("Withywindle"),
  misleading: code("Misleading Path"),
  gulley: code("Deep Gulley"),
  strange: code("Strange Woods"),
  wall: code("Wall of Trees"),
  oppressive: code("Oppressive Forest"),
  swaying: code("Swaying Without Wind"),
  branches: code("Falling Branches"),
  song: code("Song of Sleep"),
  lost: code("Lost and Witless"),
  ending: code("Ending and Failing"),
  tom: code("Tom Bombadil"),
} as const;
/** The four stage 2 cards, of which one is the current stage at a time. */
export const OF_STAGE_TWO: readonly string[] = [
  OF.dark,
  OF.brambles,
  OF.shifting,
  OF.closing,
];
export const OF_SET_ASIDE: readonly string[] = [OF.willow, OF.withywindle];
/** 2B: victory points needed per player to advance to stage 3A. */
export const OF_VICTORY_PER_PLAYER = 5;

const byCode = new Map(OLD_FOREST_ENCOUNTERS.map((c) => [c.code, c]));
/** The number of players in the game (eliminated players are out of it). */
export const ofPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((seat) => !seat.eliminated).length : 1;
/** Players in turn order from the first player, without eliminated players. */
const ofOrder = (s: GameState) => {
  const first = s.table?.first ?? 0,
    count = s.table?.seats.length ?? 1;
  return Array.from({ length: count }, (_, i) => (i + first) % count).filter(
    (i) => !s.table?.seats[i].eliminated,
  );
};
export const isOfLocation = (c: string) =>
  byCode.get(c)?.type_code === "location";
/** Printed victory points; Wall of Trees has Victory X (the number of players). */
export const ofVictory = (s: GameState, c: string) =>
  c === OF.wall ? ofPlayers(s) : (byCode.get(c)?.victory ?? 0);
export const ofVictoryLocations = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => isOfLocation(c));
export const ofVictoryTotal = (s: GameState) =>
  ofVictoryLocations(s).reduce((n, c) => n + ofVictory(s, c), 0);
export const ofVictoryGoal = (s: GameState) =>
  OF_VICTORY_PER_PLAYER * ofPlayers(s);
export const isOfStageTwo = (c: string) => OF_STAGE_TWO.includes(c);

export function oldForestStageInfo(s: GameState) {
  const q = s.oldForest;
  if (!q) return undefined;
  const card = OLD_FOREST_QUESTS.find((c) => c.code === q.currentQuest);
  if (!card) return undefined;
  const front = s.stageRevealing;
  return {
    name: front ? card.name : (card.back_name ?? card.name),
    cardCode: card.code,
    quest: front ? 0 : (card.back_quest ?? 0),
    story: (front ? card.text : card.back_text) || (card.back_text ?? ""),
    questImage: front ? card.imagesrc : card.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const oldForestUnits = (s: GameState): Unit[] =>
  s.oldForest ? [...s.oldForest.resolving] : [];
export function oldForestPublicState(s: GameState) {
  const q = s.oldForest;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    stageTwo: [...q.stageTwo],
    setAside: [...q.setAside],
    victory: ofVictoryTotal(s),
    victoryGoal: ofVictoryGoal(s),
    endingFailing: q.endingFailing,
    tom: q.tom,
    played:
      q.playedRound === s.round
        ? ofOrder(s).map((p) => q.played[p] ?? 0)
        : ofOrder(s).map(() => 0),
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateOldForest(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.oldForest;
  if (q === undefined) return s.scenarioId !== OLD_FOREST_SCENARIO;
  if (!q || s.scenarioId !== OLD_FOREST_SCENARIO) return false;
  const expected =
    s.stage === 1
      ? q.currentQuest === OF.farewell
      : s.stage === 2
        ? isOfStageTwo(q.currentQuest)
        : s.stage === 3 && q.currentQuest === OF.wicked;
  return (
    expected &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => OF_SET_ASIDE.includes(c)) &&
    new Set(q.setAside).size === q.setAside.length &&
    Array.isArray(q.stageTwo) &&
    q.stageTwo.every((c) => isOfStageTwo(c)) &&
    new Set(q.stageTwo).size === q.stageTwo.length &&
    !q.stageTwo.includes(q.currentQuest) &&
    // Every stage 2 is in the quest deck except the current one.
    q.stageTwo.length === (s.stage === 2 ? 3 : 4) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    integer(q.endingFailing) &&
    q.endingFailing >= 0 &&
    integer(q.playedRound) &&
    Array.isArray(q.played) &&
    q.played.length === 4 &&
    q.played.every((n) => integer(n) && n >= 0) &&
    typeof q.tom === "boolean"
  );
}
