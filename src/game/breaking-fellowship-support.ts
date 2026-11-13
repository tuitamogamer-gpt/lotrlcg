// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/breaking-fellowship-encounter-cards.json";
import quests from "../data/breaking-fellowship-quest-cards.json";
import recipes from "../data/breaking-fellowship-recipes.json";
import type { Card, GameState, Unit } from "./types";
import type { FliesSpidersArea } from "./flies-spiders-types";
export type { BreakingFellowshipState } from "./breaking-fellowship-types";

export const BREAKING_FELLOWSHIP_ENCOUNTERS = encounters as Card[];
export const BREAKING_FELLOWSHIP_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const BREAKING_FELLOWSHIP_RECIPES = recipes;
export const BREAKING_FELLOWSHIP_SCENARIO = "breaking-of-the-fellowship";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const BF = {
  river: code("The Great River"),
  divided: code("The Company Divided"),
  woods: code("Searching the Woods"),
  hobbits: code("Guard the Hobbits"),
  seat: code("The Seat of Amon Hen"),
  hunting: code("Orc Hunting"),
  setsOut: code("The Ring-bearer Sets Out"),
  choice: code("Frodo's Choice"),
  captain: code("Uruk-hai Captain"),
  archer: code("Uruk-hai Archer"),
  tracker: code("Uruk-hai Tracker"),
  hunter: code("Uruk-hai Hunter"),
  parth: code("Parth Galen"),
  seeing: code("Seat of Seeing"),
  argonath: code("The Argonath"),
  sarn: code("Sarn Gebir"),
  anduin: code("River Anduin"),
  shoreline: code("Wooded Shoreline"),
  slopes: code("Slopes of Amon Hen"),
  growing: code("Growing Threat"),
  whiteHand: code("Orcs of the White Hand"),
  arrows: code("Black Feathered Arrows"),
  fallen: code("Fallen into Evil"),
} as const;
/** The four stage 3 cards; each player advances to a different one. */
export const BF_STAGE_THREE: readonly string[] = [
  BF.woods,
  BF.hobbits,
  BF.seat,
  BF.hunting,
];
export const BF_SET_ASIDE: readonly string[] = [BF.choice, BF.seeing, BF.parth];
/** 3A: reveal 1 card when the staging area holds less than 4 threat. */
export const BF_STAGE_THREE_THREAT = 4;
/** The stage 2 staging area while its cards are shared out. */
export const BF_POOL = "bof-stage-two";
const activePlayer = (s: GameState) => s.table?.active ?? 0;
const quest = (c: string) =>
  BREAKING_FELLOWSHIP_QUESTS.find((q) => q.code === c);

/** The area of a player while the players are separated. */
export function bfArea(
  s: GameState,
  player = activePlayer(s),
): FliesSpidersArea | undefined {
  const q = s.breakingFellowship;
  return q?.split ? q.areas.find((a) => a.players.includes(player)) : undefined;
}
/** The stage card a player quests against. */
export function bfCurrentQuest(s: GameState, player = activePlayer(s)) {
  const q = s.breakingFellowship;
  if (!q) return undefined;
  return bfArea(s, player)?.questCode ?? q.currentQuest;
}
export const bfStageNumber = (s: GameState, player = activePlayer(s)) =>
  Number(quest(bfCurrentQuest(s, player) ?? "")?.cost ?? s.stage);
export function breakingFellowshipStageInfo(s: GameState) {
  const c = quest(bfCurrentQuest(s) ?? "");
  if (!c || !s.breakingFellowship) return undefined;
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const breakingFellowshipUnits = (s: GameState): Unit[] => {
  const q = s.breakingFellowship;
  if (!q) return [];
  return [...q.resolving, ...(q.ringBearerOut ? [q.ringBearerOut] : [])];
};
/** Every area's staging area and active location, the active one projected. */
export function bfAreaUnits(s: GameState): Unit[] {
  const q = s.breakingFellowship;
  if (!q?.split)
    return [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ];
  return q.areas.flatMap((a) => {
    const projected =
      a.id === q.activeArea && a.players.includes(activePlayer(s));
    return [
      ...(projected ? s.staging : a.staging),
      ...((projected ? s.activeLocation : a.activeLocation)
        ? [(projected ? s.activeLocation : a.activeLocation)!]
        : []),
      ...(projected ? (s.extraActiveLocations ?? []) : a.extraActiveLocations),
    ];
  });
}
const questName = (c: string) => quest(c)?.name ?? c;
export function breakingFellowshipPublicState(s: GameState) {
  const q = s.breakingFellowship;
  if (!q) return undefined;
  return {
    currentQuest: bfCurrentQuest(s),
    split: q.split,
    areas: q.areas.map((a) => {
      const projected =
        a.id === q.activeArea && a.players.includes(activePlayer(s));
      return {
        id: a.id,
        players: [...a.players],
        quest: questName(a.questCode),
        progress: projected ? s.progress : a.progress,
        cards: (projected ? s.staging : a.staging).length,
      };
    }),
    ringBearerOut: !!q.ringBearerOut,
    frodoPlayer: q.frodoPlayer,
    setAside: [...q.setAside],
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateBreakingFellowship(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.breakingFellowship;
  if (q === undefined) return s.scenarioId !== BREAKING_FELLOWSHIP_SCENARIO;
  const seats = s.table?.seats.length ?? 1;
  const questCodes = BREAKING_FELLOWSHIP_QUESTS.map((c) => c.code);
  const validArea = (a: FliesSpidersArea) =>
    !!a &&
    typeof a.id === "string" &&
    Array.isArray(a.players) &&
    a.players.every((p) => integer(p) && p >= 0 && p < seats) &&
    new Set(a.players).size === a.players.length &&
    (a.players.length > 0 || a.id === BF_POOL) &&
    questCodes.includes(a.questCode) &&
    integer(a.progress) &&
    a.progress >= 0 &&
    Array.isArray(a.staging) &&
    a.staging.every(unit) &&
    (a.activeLocation === null || unit(a.activeLocation)) &&
    Array.isArray(a.extraActiveLocations) &&
    a.extraActiveLocations.every(unit) &&
    [a.questDebuff, a.fog, a.threatModifier].every((v) =>
      Number.isSafeInteger(v),
    );
  return (
    !!q &&
    s.scenarioId === BREAKING_FELLOWSHIP_SCENARIO &&
    [1, 2, 3, 4].includes(s.stage) &&
    questCodes.includes(q.currentQuest) &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => BF_SET_ASIDE.includes(c)) &&
    new Set(q.setAside).size === q.setAside.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    (q.ringBearerOut === null || unit(q.ringBearerOut)) &&
    integer(q.zeroEngagementRound) &&
    integer(q.skipTravelRound) &&
    typeof q.split === "boolean" &&
    Array.isArray(q.areas) &&
    q.areas.every(validArea) &&
    (q.split || q.areas.length === 0) &&
    (q.activeArea === undefined ||
      q.areas.some((a) => a.id === q.activeArea)) &&
    [q.resolvedAreas, q.travelPassedAreas].every(
      (ids) =>
        Array.isArray(ids) &&
        ids.every((id) => q.areas.some((a) => a.id === id)),
    ) &&
    (q.frodoPlayer === null ||
      (integer(q.frodoPlayer) &&
        q.frodoPlayer >= 0 &&
        q.frodoPlayer < seats)) &&
    integer(q.engagedRound) &&
    Array.isArray(q.engagedPlayers) &&
    q.engagedPlayers.every((p) => integer(p) && p >= 0 && p < seats) &&
    Array.isArray(q.arrows) &&
    q.arrows.every(
      (x) =>
        !!x &&
        typeof x.area === "string" &&
        integer(x.round) &&
        integer(x.value) &&
        x.value >= 0,
    ) &&
    Array.isArray(q.whiteHand) &&
    q.whiteHand.every(
      (x) => !!x && typeof x.id === "string" && integer(x.round),
    ) &&
    Array.isArray(q.ended) &&
    q.ended.every((id) => typeof id === "string") &&
    Array.isArray(q.fallen) &&
    q.fallen.every(
      (x) =>
        !!x &&
        typeof x.id === "string" &&
        integer(x.owner) &&
        x.owner >= 0 &&
        x.owner < seats,
    )
  );
}
