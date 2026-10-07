import encounters from "../data/blood-gondor-encounter-cards.json";
import quests from "../data/blood-gondor-quest-cards.json";
import recipes from "../data/blood-gondor-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { card } from "./cards";
export const BLOOD_GONDOR_ENCOUNTERS = encounters as Card[];
export const BLOOD_GONDOR_QUESTS = quests as Card[];
export const BLOOD_GONDOR_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const BLOOD_GONDOR = {
  ambush: code("The Ambush"),
  captured: code("Captured!"),
  faramir: code("Faramir"),
  alcaron: code("Lord Alcaron"),
  crossroads: code("The Cross-roads"),
  numenorean: code("Black Númenorean"),
  southern: code("Southern Road"),
  northern: code("Northern Road"),
  western: code("Western Road"),
  eastern: code("Eastern Road"),
  woods: code("The Dark Woods"),
  crow: code("Evil Crow"),
  ambusher: code("Orc Ambusher"),
  uruk: code("Brutal Uruk"),
  lying: code("Lying in Wait"),
  conflict: code("Conflict at the Crossroads"),
  looms: code("Mordor Looms"),
};
export interface BloodGondorState {
  hidden: Record<number, Unit[]>;
  /** Snapshot of cards already scheduled to turn, excluding later draws (FAQ 1.9). */
  turning: string[];
  captured: Unit[];
  conflict: boolean;
}
export function validateBloodGondorState(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.bloodGondor;
  if (!q) return s.scenarioId !== "the-blood-of-gondor";
  if (
    s.scenarioId !== "the-blood-of-gondor" ||
    typeof q.hidden !== "object" ||
    !q.hidden ||
    Array.isArray(q.hidden) ||
    !Array.isArray(q.turning) ||
    !q.turning.every((id) => typeof id === "string") ||
    !Array.isArray(q.captured) ||
    typeof q.conflict !== "boolean"
  )
    return false;
  const count = s.table?.seats.length ?? 1;
  if (
    Object.entries(q.hidden).some(
      ([p, cards]) =>
        !/^\d+$/.test(p) ||
        +p >= count ||
        !Array.isArray(cards) ||
        (s.table?.seats[+p]?.eliminated && cards.length > 0) ||
        cards.some(
          (u) =>
            !validUnit(u) ||
            !["enemy", "location", "treachery"].includes(
              card(u.code).type_code,
            ),
        ),
    )
  )
    return false;
  if (
    q.captured.some(
      (u) =>
        !validUnit(u) ||
        ![BLOOD_GONDOR.faramir, BLOOD_GONDOR.alcaron].includes(u.code),
    )
  )
    return false;
  const hidden = Object.values(q.hidden).flat();
  const saved = [...hidden, ...q.captured];
  if (
    new Set(saved.map((u) => u.id)).size !== saved.length ||
    new Set(q.turning).size !== q.turning.length ||
    q.turning.some((id) => !hidden.some((u) => u.id === id))
  )
    return false;
  const other = [
    ...s.staging,
    ...s.heroes,
    ...s.allies,
    ...s.hand,
    ...s.engaged,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...(s.table?.seats.flatMap((p) => [
      ...p.heroes,
      ...p.allies,
      ...p.hand,
      ...p.engaged,
    ]) ?? []),
  ];
  return !saved.some((u) => other.some((o) => o.id === u.id));
}
