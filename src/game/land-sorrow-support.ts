import encounters from "../data/land-sorrow-encounter-cards.json";
import quests from "../data/land-sorrow-quest-cards.json";
import recipes from "../data/land-sorrow-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { RIVER_RUNNING as R } from "./river-running-support";
export const LAND_SORROW_ENCOUNTERS = encounters as Card[];
export const LAND_SORROW_QUESTS = [...quests].sort(
  (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
) as Card[];
export const LAND_SORROW_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const SORROW = {
  first: code("Slaves of the Dark Lord"),
  last: code("Lead the Revolt"),
  guard: code("Easterling Guard"),
  slaver: code("Nurn Slaver"),
  fields: code("Working Fields"),
  tower: code("Watch Tower"),
  whip: code("Overseer's Whip"),
  cruelty: code("Cruelty of Mordor"),
  broken: code("Broken Captives"),
  edrahil: code("Edrahil"),
  arador: code("Arador"),
  farin: code("Farin"),
  ulwarth: code("Ulwarth"),
  lorgan: code("Lorgan"),
  borlach: code("Borlach"),
  barracks: code("The Barracks"),
  quarters: code("Slave Quarters"),
  storehouse: code("The Storehouse"),
  raider: R.raider,
  warrior: R.warrior,
  sword: R.sword,
  bow: R.bow,
  warriors: R.warriors,
  plains: R.plains,
  outcrop: R.outcrop,
  weary: R.weary,
  fatigue: R.fatigue,
  arduous: R.arduous,
};
export const SORROW_CAMPS = [
  SORROW.barracks,
  SORROW.quarters,
  SORROW.storehouse,
];
export const SORROW_CAPTIVES = [SORROW.edrahil, SORROW.arador, SORROW.farin];
export const SORROW_WARDENS = [SORROW.ulwarth, SORROW.lorgan, SORROW.borlach];
export const sorrowPhase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["attack", "defense"].includes(s.phase)
      ? "combat"
      : s.phase;
export const sorrowPlayers = (s: GameState) =>
  s.table ? s.table.seats.filter((p) => !p.eliminated).length : 1;
/** Stage 1B has 15 quest points; stage 2B has 10 plus 10 per player. */
export const sorrowQuestPoints = (s: GameState) =>
  s.stage === 2 ? 10 + 10 * sorrowPlayers(s) : 15;
export function sorrowStageInfo(s: GameState) {
  const c = LAND_SORROW_QUESTS[s.stage - 1];
  if (!c || !s.landSorrow) return undefined;
  const front = s.stageRevealing;
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : sorrowQuestPoints(s),
    story: front ? c.text! : c.back_text!,
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
  };
}
export const sorrowExtraUnits = (s: GameState): Unit[] => [
  ...(s.landSorrow?.setAside ?? []),
  ...(s.landSorrow?.resolving ?? []),
  ...(s.landSorrow?.camps.flatMap((c) => (c.warden ? [c.warden] : [])) ?? []),
];
export function sorrowPublicState(s: GameState) {
  const q = s.landSorrow;
  if (!q) return undefined;
  return {
    currentQuest: q.currentQuest,
    camps: q.camps.map((c) => ({
      location: c.location,
      code: c.code,
      warden: c.warden?.code ?? null,
    })),
    freed: q.freed.map((f) => f.code),
    questPoints: sorrowQuestPoints(s),
  };
}
export function validateLandSorrow(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.landSorrow;
  if (q === undefined) return s.scenarioId !== "the-land-of-sorrow";
  const n = (x: unknown) => Number.isSafeInteger(x) && Number(x) >= 0;
  const id = (x: unknown) => typeof x === "string" && x.length > 0;
  return (
    !!q &&
    s.scenarioId === "the-land-of-sorrow" &&
    [1, 2].includes(s.stage) &&
    q.currentQuest === LAND_SORROW_QUESTS[s.stage - 1].code &&
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.setAside) &&
    q.setAside.every(
      (u) =>
        unit(u) &&
        [...SORROW_CAMPS, ...SORROW_CAPTIVES, ...SORROW_WARDENS].includes(
          u.code,
        ),
    ) &&
    (q.initialized || q.setAside.length === 9) &&
    Array.isArray(q.camps) &&
    q.camps.length <= 3 &&
    q.camps.every(
      (c) =>
        !!c &&
        id(c.location) &&
        SORROW_CAMPS.includes(c.code) &&
        (c.warden === undefined ||
          (unit(c.warden) && SORROW_WARDENS.includes(c.warden.code))),
    ) &&
    new Set(q.camps.map((c) => c.code)).size === q.camps.length &&
    Array.isArray(q.freed) &&
    q.freed.length <= 3 &&
    q.freed.every((f) => !!f && id(f.id) && SORROW_CAPTIVES.includes(f.code)) &&
    new Set(q.freed.map((f) => f.code)).size === q.freed.length &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    Array.isArray(q.enteredEnemies) &&
    q.enteredEnemies.every(id) &&
    Array.isArray(q.phaseEffects) &&
    q.phaseEffects.every(
      (m) =>
        !!m &&
        n(m.round) &&
        m.round <= s.round &&
        typeof m.phase === "string" &&
        n(m.plains) &&
        n(m.weary),
    ) &&
    Array.isArray(q.noReady) &&
    q.noReady.every(
      (x) => !!x && id(x.id) && n(x.round) && x.round <= s.round,
    ) &&
    Array.isArray(q.storehouse) &&
    q.storehouse.every(
      (x) => !!x && id(x.id) && n(x.round) && x.round <= s.round,
    )
  );
}
