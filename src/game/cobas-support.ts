import encounters from "../data/cobas-encounter-cards.json";
import quests from "../data/cobas-quest-cards.json";
import recipes from "../data/cobas-recipes.json";
import type { Card, GameState, Unit } from "./types";
import { DC, dcBase, isFleetShip } from "./dreamchaser-campaign-support";
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
/**
 * A Storm on Cobas Haven's Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * and its encounter cards, Aearlang and Docks of Dol Amroth among the Dol
 * Amroth objectives.
 */
export const COBAS_NIGHTMARE = {
  card: "octgn:b029e7a4-d2a1-4cc8-ba60-6a6244e8a48f",
  aearlang: "octgn:43c0ac02-4d9b-416e-978c-b00897654220",
  docks: "octgn:877f5f1e-133b-4d23-883d-9938cd07ba3b",
  ramming: "octgn:53cbbb3d-ec71-49f2-b9e1-07eb1cd87a7b",
  fang: "octgn:049298a9-9232-43f3-8c63-2b5598143812",
  city: "octgn:c5c142e5-ab8a-416c-a82d-fd7e1d12df1b",
  seaWall: "octgn:f7d92d48-16a4-4460-a0d7-d1cf2737d10a",
  warTorn: "octgn:1cd6ee90-545a-4e41-b1bc-24b2b6b1d512",
  rudder: "octgn:7fa155cf-ba79-40de-b0eb-a80cefa2b48b",
  grappled: "octgn:44668bf1-b1cb-4d39-8ed9-71a5cb9c3a9c",
} as const;
/** Every Dol Amroth objective: the scenario's four and the Nightmare Deck's two. */
export const COBAS_DOL_AMROTH: string[] = [
  ...COBAS_OBJECTIVES,
  COBAS_NIGHTMARE.aearlang,
  COBAS_NIGHTMARE.docks,
];
/**
 * Encounter cards that count as Condition attachments on a Ship objective
 * with "Action: Exhaust 3 characters you control to discard" (Taking on Water
 * and the Nightmare Deck's Broken Rudder and Grappled!).
 */
export const COBAS_CONDITIONS: string[] = [
  COBAS.water,
  COBAS_NIGHTMARE.rudder,
  COBAS_NIGHTMARE.grappled,
];
export const cobasNightmare = (s: GameState) =>
  !!s.nightmareMode && s.scenarioId === "a-storm-on-cobas-haven";
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
  const objectives = active.filter((u) => COBAS_DOL_AMROTH.includes(u.code));
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
      (u) =>
        validUnit(u) &&
        ([...COBAS_SHIPS, COBAS.warship].includes(u.code) ||
          isFleetShip(u.code) ||
          dcBase(u.code) === COBAS.warship),
    ) &&
    // The Dream-chaser campaign shuffles Crowley into the Corsair deck.
    q.corsairDeck.every((c) => [...COBAS_CORSAIRS, DC.crowley].includes(c)) &&
    q.corsairDiscard.every((c) =>
      [...COBAS_CORSAIRS, DC.crowley].includes(c),
    ) &&
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
