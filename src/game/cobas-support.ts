import encounters from "../data/cobas-encounter-cards.json";
import quests from "../data/cobas-quest-cards.json";
import recipes from "../data/cobas-recipes.json";
import type { Card, GameState, Unit } from "./types";
export const COBAS_ENCOUNTERS = encounters as Card[];
export const COBAS_QUESTS = quests as Card[];
export const COBAS_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const COBAS = {
  outmaneuver: code("Outmaneuver the Enemy"),
  battle: code("Battle in the Bay"),
  breakthrough: code("Break Through the Fleet!"),
  flagship: code("Raider Flagship"),
  skirmisher: code("Corsair Skirmisher"),
  siege: code("Siege Ship"),
  heavy: code("Heavy Cruiser"),
  coast: code("Coast of Anfalas"),
  belfalas: code("Belfalas Islet"),
  haven: code("Cobas Haven"),
  ramming: code("Ramming Speed!"),
  water: code("Taking on Water"),
  assault: code("The Raiders' Assault"),
  sea: code("Sea-ward Tower"),
  gull: code("Tower of the Gull"),
  beacon: code("The Beacon"),
  heron: code("Tower of the Heron"),
  warship: code("Dol Amroth Warship"),
  dream: code("Dream-chaser"),
  narelenya: code("Nárelenya"),
  dawn: code("Dawn Star"),
  silver: code("Silver Wing"),
  heading: code("Heading"),
  scout: code("Scouting Ship"),
  sailor: code("Southron Sailor"),
  pirate: code("Cunning Pirate"),
  marauder: code("Vicious Marauder"),
  captain: code("Umbar Captain"),
  raider: code("Umbar Raider"),
  infiltrator: code("Corsair Infiltrator"),
  leader: code("Raid Leader"),
};
export const COBAS_MAIN_QUESTS = [
  COBAS.outmaneuver,
  COBAS.battle,
  COBAS.breakthrough,
];
export const COBAS_SHIPS = [
  COBAS.dream,
  COBAS.narelenya,
  COBAS.dawn,
  COBAS.silver,
];
export const COBAS_OBJECTIVES = [
  COBAS.sea,
  COBAS.gull,
  COBAS.beacon,
  COBAS.heron,
];
export const COBAS_CORSAIRS = [
  COBAS.sailor,
  COBAS.pirate,
  COBAS.marauder,
  COBAS.captain,
  COBAS.raider,
  COBAS.infiltrator,
  COBAS.leader,
];
export interface CobasState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  setAside: Unit[];
  corsairDeck: string[];
  corsairDiscard: string[];
  /** Belfalas preserves the actual enemy and its old engagement while it is out of play. */
  belfalas: { locationId: string; enemy: Unit; player?: number }[];
  /** Destroyed Skirmishers remain physical cards during the optional capture response. */
  capturePending: Unit[];
  /** A revealed Guarded objective is not unguarded while its keyword is pending. */
  pendingGuarded: string[];
  rammingThreat: number;
  rammingPhase?: string;
}
/** Heavy Cruiser can guard two objectives; guarding retains the original physical link. */
export const cobasGuardIds = (u: Unit): string[] => [
  ...(u.guarding ? [u.guarding] : []),
  ...(u.cobasGuarding ?? []),
];
export const cobasGuardsObjective = (u: Unit, objectiveId: string) =>
  cobasGuardIds(u).includes(objectiveId);
export const cobasState = (s: GameState) => s.cobas;
export const cobasCurrentQuest = (s: GameState) => s.cobas?.currentQuest;
export const cobasShipCount = (s: GameState) => {
  const remote = (s.table?.seats ?? []).filter((_, i) => i !== s.table!.active);
  return [
    ...s.staging,
    ...s.engaged,
    ...remote.flatMap((p) => p.engaged),
  ].filter(
    (u) =>
      !u.cobasShipObjective &&
      COBAS_ENCOUNTERS.some(
        (c) => c.code === u.code && c.type_code === "ship-enemy",
      ),
  ).length;
};
export function cobasStageInfo(s: GameState) {
  const c = COBAS_QUESTS.find((c) => c.code === cobasCurrentQuest(s));
  return c
    ? {
        name: c.back_name ?? c.name,
        cardCode: c.code,
        quest:
          (c.back_quest ?? 0) +
          (c.code === COBAS.breakthrough ? 5 * cobasShipCount(s) : 0),
        story: c.back_text ?? "",
        questImage: c.back_imagesrc ?? c.imagesrc,
      }
    : undefined;
}
export function validateCobas(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.cobas;
  if (q === undefined) return s.scenarioId !== "a-storm-on-cobas-haven";
  if (
    !q ||
    s.scenarioId !== "a-storm-on-cobas-haven" ||
    !Array.isArray(q.questDeck) ||
    !Array.isArray(q.completedQuests) ||
    !Array.isArray(q.setAside) ||
    !Array.isArray(q.corsairDeck) ||
    !Array.isArray(q.corsairDiscard) ||
    !Array.isArray(q.belfalas) ||
    !Array.isArray(q.capturePending) ||
    !Array.isArray(q.pendingGuarded)
  )
    return false;
  const quests = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const remote = (s.table?.seats ?? []).filter((_, i) => i !== s.table!.active);
  const active = [
    ...s.staging,
    ...s.engaged,
    ...s.heroes,
    ...s.allies,
    ...remote.flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged]),
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ];
  const physical = [
    ...active,
    ...q.setAside,
    ...q.capturePending,
    ...q.belfalas.map((x) => x.enemy),
  ];
  const objectives = active.filter((u) => COBAS_OBJECTIVES.includes(u.code));
  const allied = [...s.allies, ...remote.flatMap((p) => p.allies)];
  const guardIds = active.flatMap(cobasGuardIds);
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 3 &&
    q.currentQuest === COBAS_MAIN_QUESTS[s.stage - 1] &&
    quests.length === 3 &&
    quests.every((c, i) => c === COBAS_MAIN_QUESTS[i]) &&
    q.setAside.every(
      (u) => validUnit(u) && [...COBAS_SHIPS, COBAS.warship].includes(u.code),
    ) &&
    q.corsairDeck.every((c) => COBAS_CORSAIRS.includes(c)) &&
    q.corsairDiscard.every((c) => COBAS_CORSAIRS.includes(c)) &&
    new Set(q.pendingGuarded).size === q.pendingGuarded.length &&
    q.pendingGuarded.every((id) => objectives.some((o) => o.id === id)) &&
    q.capturePending.every(
      (u) =>
        validUnit(u) && u.code === COBAS.skirmisher && !u.cobasShipObjective,
    ) &&
    q.belfalas.every(
      (x) =>
        x &&
        typeof x.locationId === "string" &&
        validUnit(x.enemy) &&
        COBAS_ENCOUNTERS.some(
          (c) => c.code === x.enemy.code && c.type_code === "ship-enemy",
        ) &&
        !cobasGuardIds(x.enemy).length &&
        (x.player === undefined ||
          (Number.isInteger(x.player) &&
            x.player >= 0 &&
            x.player < (s.table?.seats.length ?? 1))),
    ) &&
    new Set(q.belfalas.map((x) => x.locationId)).size === q.belfalas.length &&
    new Set(physical.map((u) => u.id)).size === physical.length &&
    new Set(guardIds).size === guardIds.length &&
    guardIds.every((id) => objectives.some((o) => o.id === id)) &&
    physical.every(
      (u) =>
        u.cobasGuarding === undefined ||
        (u.code === COBAS.heavy &&
          Array.isArray(u.cobasGuarding) &&
          u.cobasGuarding.length > 0 &&
          !!u.guarding &&
          u.cobasGuarding.every(
            (id) => typeof id === "string" && id !== u.guarding,
          ) &&
          new Set(u.cobasGuarding).size === u.cobasGuarding.length &&
          active.some((a) => a.id === u.id)),
    ) &&
    physical.every(
      (u) => !u.cobasShipObjective || allied.some((a) => a.id === u.id),
    ) &&
    q.belfalas.every(
      (x) =>
        !x.enemy.cobasShipObjective &&
        [
          ...(s.activeLocation ? [s.activeLocation] : []),
          ...(s.extraActiveLocations ?? []),
        ].some((l) => l.id === x.locationId && l.code === COBAS.belfalas),
    ) &&
    Number.isInteger(q.rammingThreat) &&
    q.rammingThreat >= 0 &&
    (q.rammingPhase === undefined
      ? q.rammingThreat === 0
      : typeof q.rammingPhase === "string" &&
        /^\d+:(setup|resource|planning|quest|travel|encounter|combat|refresh)$/.test(
          q.rammingPhase,
        ))
  );
}
