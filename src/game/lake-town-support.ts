// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/lake-town-encounter-cards.json";
import quests from "../data/lake-town-quest-cards.json";
import recipes from "../data/lake-town-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { LakeTownState } from "./lake-town-types";

export const LAKE_ENCOUNTERS = encounters as Card[];
export const LAKE_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const LAKE_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const LAKE = {
  terror: code("Terror from the Mountain"),
  fireWater: code("Fire and Water"),
  wrath: code("The Dragon's Wrath"),
  catching: code("Catching Fire"),
  close: code("Close to the Flame"),
  dire: code("Dire Magnificence"),
  east: code("East Pier"),
  wharf: code("Esgaroth Wharf"),
  dock: code("Fisherman's Dock"),
  bridge: code("Great Bridge"),
  house: code("Great House"),
  town: code("Lake-town"),
  merchant: code("Merchant's District"),
  north: code("North Pier"),
  reckless: code("Reckless in His Rage"),
  blast: code("Scorching Blast"),
  magnificent: code("Smaug the Magnificent"),
  mighty: code("Smaug the Mighty"),
  terrible: code("Smaug the Terrible"),
  south: code("South Pier"),
  manor: code("The Master's Manor"),
  thrush: code("The Old Thrush"),
  baiting: code("Town-Baiting"),
  west: code("West Pier"),
};
/** The three versions of Smaug in the separate Smaug deck. */
export const LAKE_SMAUGS: string[] = [
  LAKE.magnificent,
  LAKE.mighty,
  LAKE.terrible,
];
/** The pseudo-target of Town-Baiting's attack against Lake-town. */
export const LAKE_TOWN_TARGET = "lake-town:town";
/** Lake-town has completely burned at 50 damage. */
export const LAKE_TOWN_LIMIT = 50;

const byCode = new Map(LAKE_ENCOUNTERS.map((c) => [c.code, c]));
const traitsOf = (code: string) =>
  (byCode.get(code)?.traits ?? "").split(".").map((t) => t.trim());
export const lakeTrait = (u: Unit | string, trait: string) =>
  traitsOf(typeof u === "string" ? u : u.code).includes(trait);
export const isSmaug = (u: Unit | string) =>
  LAKE_SMAUGS.includes(typeof u === "string" ? u : u.code);
const isLocation = (u: Unit) => byCode.get(u.code)?.type_code === "location";
const activeLocations = (s: GameState) => [
  ...(s.activeLocation ? [s.activeLocation] : []),
  ...(s.extraActiveLocations ?? []),
];
/** Every engaged enemy; the active seat's area is the live one. */
const engagedEnemies = (s: GameState) =>
  s.table
    ? s.table.seats.flatMap((seat, i) =>
        i === s.table!.active ? s.engaged : seat.engaged,
      )
    : s.engaged;
/** The printed Burn X keyword of a Lake-town location. */
export function printedBurn(code: string) {
  const m = /(?:^|\n)Burn (\d+)\./.exec(byCode.get(code)?.text ?? "");
  return m ? Number(m[1]) : 0;
}
export const lakeLocations = (s: GameState) =>
  [...s.staging, ...activeLocations(s)].filter(isLocation);
/** Burn X of a location in play; West Pier grants each location Burn 1. */
export function lakeBurnOf(s: GameState, u: Unit) {
  const wests = lakeLocations(s).filter(
    (l) => l.code === LAKE.west && !l.blanked,
  ).length;
  return (u.blanked ? 0 : printedBurn(u.code)) + wests;
}
/** The total burn of the locations in play, without a card being revealed. */
export function lakeBurnTotal(s: GameState, exclude?: string) {
  const locations = lakeLocations(s).filter((l) => l.code !== exclude);
  const wests = locations.filter(
    (l) => l.code === LAKE.west && !l.blanked,
  ).length;
  return locations.reduce(
    (n, l) => n + (l.blanked ? 0 : printedBurn(l.code)) + wests,
    0,
  );
}
export const lakeTownUnit = (s: GameState) =>
  s.staging.find((u) => u.code === LAKE.town);
export const lakeTownDamage = (s: GameState) => lakeTownUnit(s)?.damage ?? 0;
/** The one version of Smaug in play, in the staging area or engaged. */
export const lakeSmaug = (s: GameState) =>
  [...s.staging, ...engagedEnemies(s)].find((u) => isSmaug(u));
export const lakePlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
/** Stage 1B and 2B limit the damage Smaug can have. */
export const lakeSmaugCap = (s: GameState) =>
  !s.lakeTown || s.stageRevealing
    ? Infinity
    : s.stage === 1
      ? 6
      : s.stage === 2
        ? 12
        : Infinity;
export function lakeStageInfo(s: GameState) {
  const q = LAKE_QUESTS[s.stage - 1];
  if (!q || !s.lakeTown) return undefined;
  const front = s.stageRevealing;
  return {
    name: q.name,
    cardCode: q.code,
    quest: front ? 0 : (q.back_quest ?? 0),
    story: (front ? q.text : q.back_text) || (q.back_text ?? ""),
    questImage: front ? q.imagesrc : q.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const lakeTownUnits = (s: GameState): Unit[] => [
  ...(s.lakeTown?.resolving ?? []),
];
export function lakeTownPublicState(s: GameState) {
  const q = s.lakeTown;
  if (!q) return undefined;
  const smaug = lakeSmaug(s);
  const cap = lakeSmaugCap(s);
  return {
    currentQuest: q.currentQuest,
    townDamage: lakeTownDamage(s),
    townLimit: LAKE_TOWN_LIMIT,
    victory: s.victory,
    burn: lakeBurnTotal(s),
    smaug: smaug
      ? { id: smaug.id, code: smaug.code, damage: smaug.damage }
      : null,
    smaugCap: Number.isFinite(cap) ? cap : null,
    smaugDeck: q.smaugDeck.length,
    smaugDiscard: [...q.smaugDiscard],
    reckless: q.reckless.round === s.round ? q.reckless.count : 0,
    resolving: q.resolving.length,
  };
}
export function validateLakeTown(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.lakeTown;
  if (q === undefined) return s.scenarioId !== "the-battle-of-lake-town";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const round = (x: unknown) => n(x) && Number(x) <= s.round;
  const smaugs = (v: unknown) =>
    Array.isArray(v) && v.every((c) => LAKE_SMAUGS.includes(c as string));
  return (
    !!q &&
    s.scenarioId === "the-battle-of-lake-town" &&
    [1, 2, 3].includes(s.stage) &&
    q.currentQuest === LAKE_QUESTS[s.stage - 1].code &&
    typeof q.advancing === "boolean" &&
    smaugs(q.smaugDeck) &&
    smaugs(q.smaugDiscard) &&
    q.smaugDeck.length + q.smaugDiscard.length <= 9 &&
    round(q.smaugRound) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    !!q.reckless &&
    round(q.reckless.round) &&
    n(q.reckless.count) &&
    (q.thrush === null ||
      (!!q.thrush && typeof q.thrush.enemyId === "string" && n(q.thrush.value)))
  );
}
