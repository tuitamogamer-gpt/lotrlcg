// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/siege-gondor-encounter-cards.json";
import quests from "../data/siege-gondor-quest-cards.json";
import recipes from "../data/siege-gondor-recipes.json";
import type { Card, GameState, Unit } from "./types";
export type { SiegeGondorState } from "./siege-gondor-types";

export const SIEGE_GONDOR_ENCOUNTERS = encounters as Card[];
export const SIEGE_GONDOR_QUESTS = [...quests].sort(
  (a, b) => Number(a.cost) - Number(b.cost),
) as Card[];
export const SIEGE_GONDOR_RECIPES = recipes;
export const SIEGE_GONDOR_SCENARIO = "the-siege-of-gondor";
const printed = [...encounters, ...quests] as Card[];
const code = (name: string) => printed.find((c) => c.name === name)!.code;
export const SG = {
  pelargir: code("Attack on Pelargir"),
  fleet: code("The Corsair Fleet"),
  greatShip: code("Great Corsair Ship"),
  rules: printed.find(
    (c) => c.name === "The Siege of Gondor" && c.type_code === "rules",
  )!.code,
  galley: code("Umbar War Galley"),
  dromon: code("Corsair Dromon"),
  port: code("Port of Pelargir"),
  quays: code("Pelargir Quays"),
  captain: code("Corsair Captain"),
  corsair: code("Corsair of Umbar"),
  crew: code("Umbar Pirate Crew"),
  pirate: code("Haradrim Pirate"),
  fellFolk: code("Fell Folk of Umbar"),
  sails: code("Black Sails"),
  raiding: code("Raiding the Coasts"),
  brink: code("Driven to the Brink"),
} as const;
/** Great Corsair Ship: at least 3 Ship locations in the victory display to travel there. */
export const SG_SHIPS_TO_TRAVEL = 3;
/** Pelargir Quays: discarded at 4 damage tokens, assigning 4 damage among characters in play. */
export const SG_QUAYS = 4;
/** Raiding the Coasts: added to the total threat in the staging area. */
export const SG_RAIDING = 3;
/** Umbar War Galley: Corsair enemies get -10 engagement cost. */
export const SG_GALLEY_ENGAGEMENT = 10;
/** Corsair Captain: -30 engagement cost while the active location is a Ship. */
export const SG_CAPTAIN_ENGAGEMENT = 30;
const quest = (c: string) => SIEGE_GONDOR_QUESTS.find((q) => q.code === c);
const traitsOf = (c: string) =>
  (printed.find((x) => x.code === c)?.traits ?? "")
    .split(".")
    .map((t) => t.trim());
/** A printed Ship location of the scenario. */
export const isSgShipCode = (c: string) =>
  traitsOf(c).includes("Ship") &&
  printed.find((x) => x.code === c)?.type_code === "location";
/** A printed Corsair enemy of the scenario. */
export const isSgCorsairCode = (c: string) =>
  traitsOf(c).includes("Corsair") &&
  printed.find((x) => x.code === c)?.type_code === "enemy";
/** The Ship locations in the victory display. */
export const sgShipsInVictory = (s: GameState) =>
  (s.victoryCards ?? []).filter(isSgShipCode).length;
/** The Corsair Fleet in the staging area. */
export const sgFleet = (s: GameState) =>
  s.staging.find((u) => u.code === SG.fleet);
/** X: the number of resources on The Corsair Fleet. */
export const sgFleetResources = (s: GameState) => sgFleet(s)?.resources ?? 0;

export function siegeGondorStageInfo(s: GameState) {
  const q = s.siegeGondor;
  const c = quest(q?.currentQuest ?? "");
  if (!c || !q) return undefined;
  const front = s.stageRevealing;
  return {
    name: front ? c.name : (c.back_name ?? c.name),
    cardCode: c.code,
    quest: front ? 0 : (c.back_quest ?? 0),
    story: (front ? c.text : c.back_text) || (c.back_text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? ("A" as const) : ("B" as const),
    questNumber: Number(c.cost),
  };
}
/** Units the scenario holds outside the ordinary zones. */
export const siegeGondorUnits = (s: GameState): Unit[] =>
  s.siegeGondor?.resolving ?? [];
/** The scenario's public state, for the panel and the browser checks. */
export function siegeGondorPublicState(s: GameState) {
  const q = s.siegeGondor;
  if (!q) return undefined;
  const active = s.activeLocation;
  const quays = [...s.staging, ...(active ? [active] : [])].find(
    (u) => u.code === SG.quays,
  );
  return {
    currentQuest: q.currentQuest,
    stage: s.stage,
    fleet: sgFleetResources(s),
    ships: sgShipsInVictory(s),
    greatShipInStaging: s.staging.some((u) => u.code === SG.greatShip),
    greatShipActive: !!active && active.code === SG.greatShip,
    shipActive: !!active && isSgShipCode(active.code),
    port: s.staging.some((u) => u.code === SG.port),
    quays: quays?.damage ?? 0,
    raiding: q.raiding?.round === s.round ? q.raiding.amount : 0,
    setAside: q.setAside.length,
    resolving: q.resolving.length,
  };
}
const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);
const natural = (n: unknown) => integer(n) && n >= 0;
const codes = (v: unknown) =>
  Array.isArray(v) && v.every((c) => typeof c === "string");
const phaseKey = (v: unknown) =>
  !!v &&
  typeof v === "object" &&
  natural((v as { round?: unknown }).round) &&
  typeof (v as { phase?: unknown }).phase === "string";
export function validateSiegeGondor(
  s: GameState,
  unit: (u: unknown) => boolean,
) {
  const q = s.siegeGondor;
  if (q === undefined) return s.scenarioId !== SIEGE_GONDOR_SCENARIO;
  return (
    !!q &&
    s.scenarioId === SIEGE_GONDOR_SCENARIO &&
    q.currentQuest === SG.pelargir &&
    s.stage === 1 &&
    typeof q.advancing === "boolean" &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    codes(q.setAside) &&
    (q.raiding === undefined ||
      (phaseKey(q.raiding) &&
        integer(q.raiding.amount) &&
        q.raiding.amount > 0)) &&
    (q.sails === undefined || (phaseKey(q.sails) && codes(q.sails.ids))) &&
    (q.healed === undefined ||
      (!!q.healed &&
        natural(q.healed.round) &&
        !!q.healed.amounts &&
        typeof q.healed.amounts === "object" &&
        Object.values(q.healed.amounts).every((n) => integer(n) && n > 0))) &&
    (q.moored === undefined ||
      (!!q.moored && natural(q.moored.round) && codes(q.moored.ids))) &&
    (q.captainFound === undefined || typeof q.captainFound === "boolean")
  );
}
