import encounters from "../data/roam-rhovanion-encounter-cards.json";
import quests from "../data/roam-rhovanion-quest-cards.json";
import recipes from "../data/roam-rhovanion-recipes.json";
import type { Card, GameState } from "./types";
export const ROAM_RHOVANION_ENCOUNTERS = encounters as Card[];
export const ROAM_RHOVANION_QUESTS = quests as Card[];
export const ROAM_RHOVANION_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const ROAM_RHOVANION = {
  task: code("The Goblin's Task"),
  rescue: code("Rescue Tiny"),
  hornQuest: code("Retrieve Urdug's Horn"),
  keyQuest: code("Find Durin's Key"),
  gambit: code("Urdug's Gambit"),
  urdug: code("Urdug"),
  tiny: code("Tiny"),
  key: code("Durin's Key"),
  horn: code("Urdug's Horn"),
  urdugEnemy: "roam-urdug-enemy",
  tinyEnemy: "roam-tiny-enemy",
  giant: code("Grey Mountain Giant"),
  eagle: code("Hunting Eagle"),
  bear: code("Wilderland Bear"),
  moor: code("Grey Moorland"),
  ravine: code("Deep Ravine"),
  slopes: code("Slopes of Ered Mithrin"),
  sneaking: code("Sneaking Off"),
  weather: code("Harsh Weather"),
  creatures: code("Wild Creatures"),
  wargs: code("Pack of Wargs"),
  hills: code("Hills of Wilderland"),
  lonely: code("Lonely Lands"),
  supplies: code("Ruined Supplies"),
  lost: code("Lost in the Wild"),
  weighed: code("Weighed Down"),
  troll: code("Stone-troll"),
  hobgoblin: code("Hobgoblin"),
};
export const ROAM_RHOVANION_QUEST_CODES = quests.map((c) => c.code);
export function roamRhovanionStageInfo(s: GameState) {
  const q = ROAM_RHOVANION_QUESTS.find(
    (c) => c.code === s.roamRhovanion?.currentQuest,
  );
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export function roamRhovanionPublicState(s: GameState) {
  const q = s.roamRhovanion;
  return q
    ? {
        currentQuest: q.currentQuest,
        completedQuests: [...q.completedQuests],
        questDeck: q.questDeck.length,
        setAside: q.setAside.map((u) => ({ id: u.id, code: u.code })),
        guarded: q.guarded.map((g) => ({
          id: g.card.id,
          code: g.card.code,
          guardId: g.guardId,
        })),
        guardedPlayerCards: q.guardedPlayerCards.map((g) => ({
          id: g.card.id,
          code: g.card.code,
          player: g.player,
          guardId: g.guardId,
        })),
        storedCards: q.storedCards.map((g) => ({
          locationId: g.locationId,
          count: g.cards.length,
        })),
        removed: q.removed.map((u) => ({ id: u.id, code: u.code })),
        keyPeekCount: q.keyPeek.length,
      }
    : undefined;
}
export function validateRoamRhovanion(
  s: GameState,
  validUnit: (u: unknown) => boolean,
  cardKind?: (code: string) => string,
) {
  const q = s.roamRhovanion;
  if (q === undefined) return s.scenarioId !== "roam-across-rhovanion";
  if (
    !q ||
    s.scenarioId !== "roam-across-rhovanion" ||
    typeof q.initialized !== "boolean" ||
    typeof q.advancing !== "boolean" ||
    ![
      q.questDeck,
      q.completedQuests,
      q.setAside,
      q.guarded,
      q.removed,
      q.storedCards,
      q.guardedPlayerCards,
      q.resolving,
      q.locationProgress,
      q.threatModifiers,
      q.attackModifiers,
      q.keyPeek,
      q.wildEngaged,
    ].every(Array.isArray)
  )
    return false;
  const R = ROAM_RHOVANION,
    chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  if (
    chain.length !== 5 ||
    new Set(chain).size !== 5 ||
    chain.some((c) => !ROAM_RHOVANION_QUEST_CODES.includes(c)) ||
    chain[0] !== R.task ||
    chain[4] !== R.gambit ||
    ![1, 2, 3].includes(s.stage) ||
    (s.stage === 1
      ? q.currentQuest !== R.task
      : s.stage === 3
        ? q.currentQuest !== R.gambit
        : ![R.rescue, R.hornQuest, R.keyQuest].includes(q.currentQuest))
  )
    return false;
  const remote = s.table?.seats.filter((_, i) => i !== s.table!.active) ?? [],
    own = (p: number) =>
      Number.isInteger(p) && p >= 0 && p < (s.table?.seats.length ?? 1);
  if (
    !q.guarded.every((g) => g && typeof g === "object" && validUnit(g.card)) ||
    !q.guardedPlayerCards.every(
      (g) => g && typeof g === "object" && validUnit(g.card),
    ) ||
    !q.storedCards.every(
      (g) => g && typeof g === "object" && Array.isArray(g.cards),
    ) ||
    ![...q.locationProgress, ...q.threatModifiers, ...q.attackModifiers].every(
      (m) => m && typeof m === "object",
    )
  )
    return false;
  const physical = [
    ...s.heroes,
    ...s.allies,
    ...s.engaged,
    ...s.hand,
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...remote.flatMap((p) => [
      ...p.heroes,
      ...p.allies,
      ...p.engaged,
      ...p.hand,
    ]),
    ...q.setAside,
    ...q.guarded.map((g) => g.card),
    ...q.removed,
    ...q.guardedPlayerCards.map((g) => g.card),
    ...q.storedCards.flatMap((g) => g.cards),
  ];
  if (!physical.every(validUnit)) return false;
  const ids = physical.flatMap((u) => [
    u.id,
    ...u.attachments.map((a) => a.id),
  ]);
  if (new Set(ids).size !== ids.length) return false;
  const liveIds = new Set(physical.map((u) => u.id)),
    known = new Set(encounters.map((c) => c.code));
  const kind = (code: string) =>
    cardKind?.(code) ??
    encounters.find((c) => c.code === code)?.type_code ??
    "";
  const guards = new Set(
    physical
      .filter((u) => ["enemy", "location"].includes(kind(u.code)))
      .map((u) => u.id),
  );
  const normalized = (c: string) =>
    c === R.urdugEnemy ? R.urdug : c === R.tinyEnemy ? R.tiny : c;
  const objectiveCodes = physical
    .flatMap((u) => [u.code, ...u.attachments.map((a) => a.code)])
    .map(normalized)
    .filter((c) => [R.urdug, R.tiny, R.key, R.horn].includes(c));
  if (new Set(objectiveCodes).size !== objectiveCodes.length) return false;
  return (
    q.setAside.every((u) =>
      [R.urdug, R.tiny, R.key, R.horn].includes(u.code),
    ) &&
    q.guarded.every(
      (g) =>
        [R.urdug, R.tiny, R.key, R.horn].includes(g.card.code) &&
        guards.has(g.guardId),
    ) &&
    q.guardedPlayerCards.every(
      (g) =>
        own(g.player) &&
        guards.has(g.guardId) &&
        physical.some((u) => u.id === g.guardId && u.code === R.hobgoblin),
    ) &&
    q.storedCards.every(
      (g) =>
        own(g.player) &&
        liveIds.has(g.locationId) &&
        physical.some((u) => u.id === g.locationId && u.code === R.lonely) &&
        g.cards.every((u) => !cardKind || kind(u.code) === "event"),
    ) &&
    q.removed.every((u) => u.code === R.sneaking) &&
    q.resolving.every((c) => known.has(c)) &&
    q.keyPeek.length <= 3 &&
    q.keyPeek.every(
      (c) => typeof c === "string" && (known.has(c) || !!cardKind?.(c)),
    ) &&
    (q.keyPlayer === undefined || own(q.keyPlayer)) &&
    (q.keyPeek.length === 0 || q.keyPlayer !== undefined) &&
    q.wildEngaged.every(own) &&
    new Set(q.wildEngaged).size === q.wildEngaged.length &&
    (q.urdugQuestAttack === undefined ||
      physical.some(
        (u) => u.id === q.urdugQuestAttack && u.code === R.urdugEnemy,
      )) &&
    q.locationProgress.every(
      (m) =>
        typeof m.id === "string" &&
        (m.id === undefined || typeof m.id === "string") &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        Number.isInteger(m.amount) &&
        m.amount >= 0 &&
        m.amount <= 1,
    ) &&
    [...q.threatModifiers, ...q.attackModifiers].every(
      (m) =>
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round &&
        typeof m.phase === "string" &&
        Number.isFinite(m.amount),
    )
  );
}
