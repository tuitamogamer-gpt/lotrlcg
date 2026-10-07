import encounters from "../data/catch-orc-encounter-cards.json";
import quests from "../data/catch-orc-quest-cards.json";
import recipes from "../data/catch-orc-recipes.json";
import type { Card, GameState, Unit } from "./types";

export const CATCH_ORC_ENCOUNTERS = encounters as Card[];
export const CATCH_ORC_QUESTS = quests as Card[];
export const CATCH_ORC_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const CATCH_ORC = {
  orders: code("Orders from Orthanc"),
  search: code("Searching for Mugash"),
  prize: code("The Wizard's Prize"),
  mugash: code("Mugash"),
  guard: code("Mugash's Guard"),
  methedrasOrc: code("Methedras Orc"),
  methedras: code("Methedras"),
  cave: code("Orc Cave"),
  lair: code("Mugash's Lair"),
  territory: code("Orc Territory"),
  skirmisher: code("Orc Skirmisher"),
  hunter: code("Orc Hunter"),
  hound: code("Orc Hound"),
  party: code("Orc Hunting Party"),
  wolf: code("Prowling Wolf"),
  lands: code("Broken Lands"),
  cover: code("Take Cover!"),
};
export interface CatchOrcState {
  initialized: boolean;
  time: number;
  decks: Record<number, Unit[]>;
  /** Revealed Search cards stay physical while the player chooses one. */
  searched: Unit[];
  setAside: Unit[];
  capturing?: Unit;
  cancelQuestProgress?: boolean;
}
export function validateCatchOrcState(
  s: GameState,
  validUnit: (u: unknown) => boolean,
  isPlayerCard: (code: string) => boolean,
) {
  const q = s.catchOrc;
  if (q === undefined) return s.scenarioId !== "to-catch-an-orc";
  if (
    !q ||
    s.scenarioId !== "to-catch-an-orc" ||
    typeof q.initialized !== "boolean" ||
    !Number.isSafeInteger(q.time) ||
    q.time < 0 ||
    (!q.initialized && (s.stage !== 1 || q.time !== 0)) ||
    !q.decks ||
    typeof q.decks !== "object" ||
    Array.isArray(q.decks) ||
    !Array.isArray(q.searched) ||
    !Array.isArray(q.setAside) ||
    (q.cancelQuestProgress !== undefined &&
      typeof q.cancelQuestProgress !== "boolean")
  )
    return false;
  const count = s.table?.seats.length ?? 1;
  const playerCard = (u: Unit) => validUnit(u) && isPlayerCard(u.code);
  if (
    Object.entries(q.decks).some(
      ([p, cards]) =>
        !/^\d+$/.test(p) ||
        +p >= count ||
        !Array.isArray(cards) ||
        (s.table?.seats[+p]?.eliminated && cards.length > 0) ||
        cards.some(
          (u) =>
            !validUnit(u) ||
            (!playerCard(u) &&
              ![CATCH_ORC.mugash, CATCH_ORC.guard].includes(u.code)),
        ),
    )
  )
    return false;
  if (
    q.searched.some((u) => !playerCard(u)) ||
    q.setAside.some(
      (u) =>
        !validUnit(u) || ![CATCH_ORC.mugash, CATCH_ORC.guard].includes(u.code),
    ) ||
    (q.capturing &&
      (!validUnit(q.capturing) || q.capturing.code !== CATCH_ORC.mugash))
  )
    return false;
  const saved = [
    ...Object.values(q.decks).flat(),
    ...q.searched,
    ...q.setAside,
    ...(q.capturing ? [q.capturing] : []),
  ];
  if (saved.some((u) => u.owner !== undefined && u.owner >= count))
    return false;
  const ids = saved.flatMap((u) => [u.id, ...u.attachments.map((a) => a.id)]);
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
  const publicIds = new Set(
    other.flatMap((u) => [u.id, ...u.attachments.map((a) => a.id)]),
  );
  return (
    new Set(ids).size === ids.length && ids.every((id) => !publicIds.has(id))
  );
}
