import encounters from "../data/morgul-vale-encounter-cards.json";
import quests from "../data/morgul-vale-quest-cards.json";
import recipes from "../data/morgul-vale-recipes.json";
import type { Card, GameState } from "./types";
export const MORGUL_VALE_ENCOUNTERS = encounters as Card[];
export const MORGUL_VALE_QUESTS = quests as Card[];
export const MORGUL_VALE_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const MORGUL_VALE = {
  rearguard: code("The Rearguard"),
  betrayal: code("The Betrayal"),
  rider: code("The Morgul Rider"),
  tower: code("To the Tower"),
  murzag: code("Murzag"),
  alcaron: code("Lord Alcaron"),
  nazgul: code("Nazgûl of Minas Morgul"),
  bridge: code("The White Bridge"),
  vale: code("Morgul Vale"),
  road: code("Morgul Road"),
  bodyguard: code("Morgul Bodyguard"),
  sorcerer: code("Morgul Sorcerer"),
  tracker: code("Morgul Tracker"),
  terror: code("Terror Drives Them"),
  malice: code("Sleepless Malice"),
  fog: code("Impenetrable Fog"),
  city: code("The Dead City Looms"),
};
export interface MorgulValeState {
  defeated: string[];
  setAside: string[];
}
export function validateMorgulValeState(s: GameState) {
  const q = s.morgulVale;
  if (!q) return s.scenarioId !== "the-morgul-vale";
  return (
    s.scenarioId === "the-morgul-vale" &&
    Array.isArray(q.defeated) &&
    Array.isArray(q.setAside) &&
    new Set(q.defeated).size === q.defeated.length &&
    new Set(q.setAside).size === q.setAside.length &&
    q.defeated.every((c) =>
      [MORGUL_VALE.murzag, MORGUL_VALE.alcaron, MORGUL_VALE.nazgul].includes(c),
    ) &&
    q.setAside.every((c) =>
      [MORGUL_VALE.alcaron, MORGUL_VALE.nazgul, MORGUL_VALE.bridge].includes(c),
    ) &&
    !q.setAside.some((c) => q.defeated.includes(c))
  );
}
