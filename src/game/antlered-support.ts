import encounters from "../data/antlered-encounter-cards.json";
import quests from "../data/antlered-quest-cards.json";
import recipes from "../data/antlered-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const ANTLERED_ENCOUNTERS = encounters as Card[],
  ANTLERED_QUESTS = quests as Card[],
  ANTLERED_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const ANTLERED = {
  battle: code("Battle for Dunland"),
  clan: code("The Raven Clan"),
  last: code("The Last Stage"),
  turch: code("Chief Turch"),
  chief: code("Raven Chief"),
  camp: code("Raven Chief's Camp"),
  battlefield: code("Dunland Battlefield"),
  village: code("Raven Village"),
  warcamp: code("Raven War-camp"),
  country: code("Raven Country"),
  warrior: code("Raven Warrior"),
  skirmisher: code("Raven Skirmisher"),
  folk: code("Fierce Folk"),
  cry: code("Raising the Cry"),
  back: code("Driven Back"),
};
export const RAVEN_CODES = [
  ...new Set(
    recipes.flatMap((r) =>
      r.cards
        .filter((c) => c.section === "sharedEncounterDeck2")
        .map((c) => c.code),
    ),
  ),
];
export const printedLocationTime = (code: string) =>
  Number(
    /\bTime (\d+)/.exec(
      encounters.find((c) => c.code === code)?.text ?? "",
    )?.[1] ?? 0,
  );
export interface AntleredState {
  initialized: boolean;
  time: number;
  ravenDeck: string[];
  ravenDiscard: string[];
  setAside: Unit[];
  setupEnemies: string[];
  advancing?: boolean;
  eventsBlockedRound?: number;
}
export function validateAntlered(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.antlered;
  if (q === undefined) return s.scenarioId !== "the-antlered-crown";
  return (
    !!q &&
    s.scenarioId === "the-antlered-crown" &&
    typeof q.initialized === "boolean" &&
    Number.isInteger(q.time) &&
    q.time >= 0 &&
    [q.ravenDeck, q.ravenDiscard, q.setupEnemies].every(
      (a) => Array.isArray(a) && a.every((c) => RAVEN_CODES.includes(c)),
    ) &&
    new Set(q.setupEnemies).size === q.setupEnemies.length &&
    Array.isArray(q.setAside) &&
    q.setAside.every(
      (u) => validUnit(u) && [ANTLERED.chief, ANTLERED.camp].includes(u.code),
    ) &&
    (q.advancing === undefined || typeof q.advancing === "boolean") &&
    (q.eventsBlockedRound === undefined ||
      (Number.isInteger(q.eventsBlockedRound) && q.eventsBlockedRound >= 0))
  );
}
