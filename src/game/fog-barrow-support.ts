// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/fog-barrow-encounter-cards.json";
import quests from "../data/fog-barrow-quest-cards.json";
import recipes from "../data/fog-barrow-recipes.json";
import type { Card, GameState, Unit } from "./types";
import type { FliesSpidersArea } from "./flies-spiders-types";
export type { FogBarrowState, FogBarrowBuried } from "./fog-barrow-types";

export const FOG_BARROW_ENCOUNTERS = encounters as Card[];
export const FOG_BARROW_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const FOG_BARROW_RECIPES = recipes;
export const FOG_BARROW_SCENARIO = "fog-on-the-barrow-downs";
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const FB = {
  house: code("The House of Tom Bombadil"),
  across: code("Across the Downs"),
  lost: code("Lost in the Fog"),
  trapped: code("Trapped Inside a Barrow"),
  barrowWight: code("Barrow-wight"),
  darkWight: code("Dark-wight"),
  coldWight: code("Cold-wight"),
  tom: code("Tom Bombadil"),
  ancient: code("Ancient Barrow"),
  stoneRing: code("Stone Ring"),
  northDowns: code("North Downs"),
  hollow: code("Hollow Circle"),
  standing: code("Standing Stones"),
  great: code("Great Barrow"),
  song: code("Dreadful Song"),
  arm: code("Long Groping Arm"),
  chill: code("Chill Fog"),
  waiting: code("I'm Waiting for You!"),
  frozen: code("Frozen by Fear"),
} as const;
export const FB_WIGHTS: readonly string[] = [
  FB.barrowWight,
  FB.darkWight,
  FB.coldWight,
];
export const FB_SET_ASIDE: readonly string[] = [
  FB.great,
  FB.standing,
  FB.hollow,
];
/** The id of stage 3B's staging area while the players are separated. */
export const FB_STAGE_THREE = "fb-lost";
export const fbBarrowArea = (player: number) => `fb-barrow-${player}`;
/** Long Groping Arm: the phase flag of the player it was revealed by. */
export const FB_ARM = "phase:fb-arm";
const activePlayer = (s: GameState) => s.table?.active ?? 0;
const quest = (c: string) => FOG_BARROW_QUESTS.find((q) => q.code === c);
export const isWightCode = (c: string) => FB_WIGHTS.includes(c);

/** The area of a player while the players are separated. */
export function fbArea(
  s: GameState,
  player = activePlayer(s),
): FliesSpidersArea | undefined {
  const q = s.fogBarrow;
  return q?.split ? q.areas.find((a) => a.players.includes(player)) : undefined;
}
/** The stage card a player quests against. */
export function fbCurrentQuest(s: GameState, player = activePlayer(s)) {
  const q = s.fogBarrow;
  if (!q) return undefined;
  return fbArea(s, player)?.questCode ?? q.currentQuest;
}
/** Is a player trapped inside a barrow (stage 4)? */
export const fbTrapped = (s: GameState, player = activePlayer(s)) =>
  fbCurrentQuest(s, player) === FB.trapped;
export function fogBarrowStageInfo(s: GameState) {
  const c = quest(fbCurrentQuest(s) ?? "");
  if (!c || !s.fogBarrow) return undefined;
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    // A player at a separate stage sees that stage's own number.
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const fogBarrowUnits = (s: GameState): Unit[] =>
  s.fogBarrow?.resolving ?? [];
/** Every area's staging area and active location, the active one projected. */
export function fbAreaUnits(s: GameState): Unit[] {
  const q = s.fogBarrow;
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
export function fogBarrowPublicState(s: GameState) {
  const q = s.fogBarrow;
  if (!q) return undefined;
  return {
    currentQuest: fbCurrentQuest(s),
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
    setAside: [...q.setAside],
    buried: q.buried.map((b) => ({ location: b.location, owner: b.owner })),
    escaped: [...q.escaped],
    frozen: q.frozen.round === s.round ? [...q.frozen.players] : [],
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
export function validateFogBarrow(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.fogBarrow;
  if (q === undefined) return s.scenarioId !== FOG_BARROW_SCENARIO;
  const seats = s.table?.seats.length ?? 1;
  const questCodes = FOG_BARROW_QUESTS.map((c) => c.code);
  const validArea = (a: FliesSpidersArea) =>
    !!a &&
    typeof a.id === "string" &&
    Array.isArray(a.players) &&
    a.players.every((p) => integer(p) && p >= 0 && p < seats) &&
    new Set(a.players).size === a.players.length &&
    (a.id === FB_STAGE_THREE
      ? a.questCode === FB.lost
      : a.players.length === 1 &&
        a.id === fbBarrowArea(a.players[0]) &&
        a.questCode === FB.trapped) &&
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
  const areaIds = q.areas.map((a) => a.id);
  return (
    !!q &&
    s.scenarioId === FOG_BARROW_SCENARIO &&
    [1, 2, 3].includes(s.stage) &&
    questCodes.includes(q.currentQuest) &&
    q.currentQuest !== FB.trapped &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every((c) => FB_SET_ASIDE.includes(c)) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    typeof q.split === "boolean" &&
    Array.isArray(q.areas) &&
    q.areas.every(validArea) &&
    new Set(areaIds).size === areaIds.length &&
    (q.split
      ? q.areas.filter((a) => a.id === FB_STAGE_THREE).length === 1 &&
        q.areas.length >= 2
      : q.areas.length === 0) &&
    (q.activeArea === undefined || areaIds.includes(q.activeArea)) &&
    [q.resolvedAreas, q.travelPassedAreas, q.ended, q.escaped].every(
      (ids) =>
        Array.isArray(ids) &&
        ids.every((id) => typeof id === "string" && id.length > 0),
    ) &&
    q.escaped.every((id) => areaIds.includes(id)) &&
    Array.isArray(q.buried) &&
    q.buried.every(
      (b) =>
        !!b &&
        typeof b.location === "string" &&
        typeof b.id === "string" &&
        typeof b.code === "string" &&
        integer(b.owner) &&
        b.owner >= 0 &&
        b.owner < seats,
    ) &&
    typeof q.tom === "boolean" &&
    !!q.frozen &&
    integer(q.frozen.round) &&
    q.frozen.round >= 0 &&
    Array.isArray(q.frozen.players) &&
    q.frozen.players.every((p) => integer(p) && p >= 0 && p < seats)
  );
}
