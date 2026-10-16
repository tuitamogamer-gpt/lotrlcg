import encounters from "../data/black-serpent-encounter-cards.json";
import quests from "../data/black-serpent-quest-cards.json";
import recipes from "../data/black-serpent-recipes.json";
import shared from "../data/harad-encounter-cards.json";
import type { Attachment, Card, GameState, Unit } from "./types";
const remoteSeats = (s: GameState) =>
  (s.table?.seats ?? []).filter((_, i) => i !== s.table!.active);
const allHeroes = (s: GameState) => [
  ...s.heroes,
  ...remoteSeats(s).flatMap((p) => p.heroes),
];
const allCharacters = (s: GameState) => [
  ...s.heroes,
  ...s.allies,
  ...remoteSeats(s).flatMap((p) => [...p.heroes, ...p.allies]),
];
const allEngaged = (s: GameState) => [
  ...s.engaged,
  ...remoteSeats(s).flatMap((p) => p.engaged),
];
const allActiveLocations = (s: GameState) => [
  ...(s.activeLocation ? [s.activeLocation] : []),
  ...(s.extraActiveLocations ?? []),
];
const ownerOf = (s: GameState, u: Unit) =>
  s.table
    ? s.table.seats.findIndex((p, i) =>
        (i === s.table!.active
          ? [...s.heroes, ...s.allies, ...s.engaged]
          : [...p.heroes, ...p.allies, ...p.engaged]
        ).some((x) => x.id === u.id),
      )
    : 0;
export const BLACK_SERPENT_ENCOUNTERS = encounters as Card[];
export const BLACK_SERPENT_QUESTS = quests as Card[];
export const BLACK_SERPENT_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests, ...shared].find((c) => c.name === name)!.code;
export const BLACK_SERPENT = {
  fort: code("The Crossroads Fort"),
  campBattle: code("Battle in the Camp"),
  defeat: code("Defeat the Serpent"),
  banner: code("Banner of the Serpent"),
  garb: code("The Serpent's Garb"),
  summons: code("Summons from Mordor"),
  serpent: code("The Black Serpent"),
  guard: code("Serpent Guard"),
  redoubt: code("The Serpent's Redoubt"),
  tower: code("Roofless Tower"),
  bastion: code("Desert Bastion"),
  camp: code("Southron Camp"),
  courtyard: code("Broken Courtyard"),
  bold: code("Bold and Grim"),
  quarter: code("No Quarter"),
  chaos: code("Chaos in the Night"),
  escape: code("Don't Let Them Escape!"),
  champion: code("Southron Champion"),
  captain: code("Southron Captain"),
};
export const BLACK_SERPENT_MAIN_QUESTS = [
  BLACK_SERPENT.fort,
  BLACK_SERPENT.campBattle,
  BLACK_SERPENT.defeat,
];
export const BLACK_SERPENT_OBJECTIVES = [
  BLACK_SERPENT.banner,
  BLACK_SERPENT.garb,
  BLACK_SERPENT.summons,
];
export interface BlackSerpentState {
  initialized: boolean;
  advancing: boolean;
  currentQuest: string;
  questDeck: string[];
  completedQuests: string[];
  /** Actual unrevealed objective cards, never exposed through public state. */
  setAside: Unit[];
  champions: { questId: string; enemyId: string }[];
  shields: { id: string; round: number }[];
  shieldPlayers: { player: number; round: number }[];
  noProgressRound?: number;
  modifiers: {
    kind: "banner" | "garb";
    target: string;
    round: number;
    phase: GameState["phase"];
  }[];
  canceledEvents: string[];
}
export const blackSerpentState = (s: GameState) => s.blackSerpent;
export const blackSerpentHosts = (s: GameState) => [
  ...allCharacters(s),
  ...s.staging,
  ...allEngaged(s),
  ...allActiveLocations(s),
];
export const blackSerpentObjectives = (s: GameState) =>
  blackSerpentHosts(s).flatMap((host) =>
    host.attachments
      .filter((a) => BLACK_SERPENT_OBJECTIVES.includes(a.code))
      .map((a) => ({ host, attachment: a })),
  );
export const blackSerpentControlledObjectives = (
  s: GameState,
  player?: number,
) =>
  blackSerpentObjectives(s).filter(({ host }) => {
    const hero = allHeroes(s).some((h) => h.id === host.id);
    return hero && (player === undefined || ownerOf(s, host) === player);
  });
export const blackSerpentIsObjective = (a: Pick<Attachment, "code">) =>
  BLACK_SERPENT_OBJECTIVES.includes(a.code);
export function blackSerpentStageInfo(s: GameState) {
  const q = BLACK_SERPENT_QUESTS.find(
    (q) => q.code === s.blackSerpent?.currentQuest,
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
export function validateBlackSerpent(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.blackSerpent;
  if (q === undefined) return s.scenarioId !== "the-black-serpent";
  if (
    !q ||
    s.scenarioId !== "the-black-serpent" ||
    ![
      q.questDeck,
      q.completedQuests,
      q.setAside,
      q.champions,
      q.shields,
      q.shieldPlayers,
      q.modifiers,
      q.canceledEvents,
    ].every(Array.isArray)
  )
    return false;
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const hosts = blackSerpentHosts(s),
    units = [...hosts, ...q.setAside];
  const hands = [...s.hand, ...remoteSeats(s).flatMap((p) => p.hand)];
  const physicalIds = [
    ...units.map((u) => u.id),
    ...hands.map((u) => u.id),
    ...hosts.flatMap((u) => u.attachments.map((a) => a.id)),
  ];
  const objectives = [
    ...q.setAside,
    ...s.staging.filter(blackSerpentIsObjective),
    ...blackSerpentObjectives(s).map((o) => o.attachment),
  ];
  const validRound = (n: number) =>
    Number.isInteger(n) && n >= 0 && n <= s.round;
  const phase = (p: string) =>
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "staging",
      "travel",
      "encounter",
      "defense",
      "attack",
      "refresh",
    ].includes(p);
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 3 &&
    q.currentQuest === BLACK_SERPENT_MAIN_QUESTS[s.stage - 1] &&
    chain.length === 3 &&
    chain.every((c, i) => c === BLACK_SERPENT_MAIN_QUESTS[i]) &&
    q.setAside.every(validUnit) &&
    q.setAside.every(blackSerpentIsObjective) &&
    q.setAside.length <= 3 &&
    new Set(physicalIds).size === physicalIds.length &&
    ![
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...(s.victoryCards ?? []),
      ...units.flatMap((u) => u.shadows),
    ].some((code) => BLACK_SERPENT_OBJECTIVES.includes(code)) &&
    objectives.length === 3 &&
    new Set(objectives.map((o) => o.code)).size === 3 &&
    q.champions.every(
      (c) =>
        c && typeof c.questId === "string" && typeof c.enemyId === "string",
    ) &&
    new Set(q.champions.map((c) => c.questId)).size === q.champions.length &&
    q.shields.every(
      (e) => e && typeof e.id === "string" && validRound(e.round),
    ) &&
    new Set(q.shields.map((e) => e.id)).size === q.shields.length &&
    q.shieldPlayers.every(
      (e) =>
        e &&
        Number.isInteger(e.player) &&
        e.player >= 0 &&
        e.player < (s.table?.seats.length ?? 1) &&
        validRound(e.round),
    ) &&
    (q.noProgressRound === undefined || validRound(q.noProgressRound)) &&
    q.modifiers.every(
      (e) =>
        e &&
        ["banner", "garb"].includes(e.kind) &&
        typeof e.target === "string" &&
        validRound(e.round) &&
        phase(e.phase),
    ) &&
    q.canceledEvents.every((id) => typeof id === "string") &&
    new Set(q.canceledEvents).size === q.canceledEvents.length
  );
}
