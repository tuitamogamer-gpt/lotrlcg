import encounters from "../data/mount-gram-encounter-cards.json";
import quests from "../data/mount-gram-quest-cards.json";
import recipes from "../data/mount-gram-recipes.json";
import { CHETWOOD } from "./chetwood-support";
import type { Card, GameState, Unit } from "./types";

export const GRAM_ENCOUNTERS = encounters as Card[];
export const GRAM_QUESTS = quests as Card[];
export const GRAM_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const GRAM = {
  unexpected: code("Unexpected Rescue"),
  dungeons: code("Gornákh's Dungeons"),
  flight: code("Flight from Mount Gram"),
  gate: code("Southern Gate"),
  jailor: code("Jailor Gornákh"),
  torturer: code("Cruel Torturer"),
  guard: code("Dungeon Guard"),
  tormentor: code("Goblin Tormentor"),
  cell: code("Prison Cell"),
  patrol: code("Patrol Room"),
  tunnels: code("Tunnels of Mount Gram"),
  alarm: code("Sound the Alarm!"),
  weary: code("Feeble and Weary"),
  captives: code("Captives of Gornákh"),
  interrogation: code("Interrogation"),
  executioners: code("Stop the Executioners!"),
  angmar: CHETWOOD.orc,
  marauder: CHETWOOD.marauder,
  captain: CHETWOOD.captain,
  ambush: CHETWOOD.ambush,
};

export interface GramArea {
  id: string;
  players: number[];
  quest: Unit;
  progress: number;
  staging: Unit[];
  activeLocation: Unit | null;
  extraActiveLocations: Unit[];
  questDebuff: number;
  fog: number;
  threatModifier: number;
  lastQuest?: GameState["lastQuest"];
}
export interface MountGramState {
  initialized: boolean;
  split: boolean;
  activeArea?: string;
  areas: GramArea[];
  capturedDecks: Record<string, Unit[]>;
  captured: Record<string, Unit[]>;
  setAside: Unit[];
  orcDeck: string[];
  removedQuests: Unit[];
  removedEncounter: string[];
  travelResolvedAreas: string[];
  resolvedAreas: string[];
  alarms: Record<string, { round: number; copies: number }>;
}
type GramState = GameState & { mountGram?: MountGramState };
export const gramState = (s: GameState) => (s as GramState).mountGram;
export const isMountGram = (s: GameState) =>
  (s.scenarioId as string) === "escape-from-mount-gram";
const activePlayer = (s: GameState) => s.table?.active ?? 0;
export const gramArea = (s: GameState, player = activePlayer(s)) =>
  gramState(s)?.areas.find((a) => a.players.includes(player));
export const gramAreaPlayers = (s: GameState, player = activePlayer(s)) =>
  gramState(s)?.split ? gramArea(s, player)?.players : undefined;
export const gramSameArea = (s: GameState, a: number, b: number) =>
  !gramAreaPlayers(s, a) || gramAreaPlayers(s, a)!.includes(b);
export function gramSyncArea(s: GameState) {
  const q = gramState(s);
  if (!q?.split) return;
  const a = q.areas.find((a) => a.id === q.activeArea);
  if (!a || !a.players.includes(activePlayer(s))) return;
  Object.assign(a, {
    staging: s.staging,
    activeLocation: s.activeLocation,
    extraActiveLocations: s.extraActiveLocations ?? [],
    progress: s.progress,
    questDebuff: s.questDebuff,
    fog: s.fog ?? 0,
    threatModifier: s.threatModifier,
    lastQuest: s.lastQuest,
  });
  a.quest.progress = s.progress;
}
export function gramAreaView(s: GameState, player: number) {
  const q = gramState(s),
    a = gramArea(s, player);
  if (!q?.split || !a) return {};
  return {
    staging: a.staging,
    activeLocation: a.activeLocation,
    extraActiveLocations: a.extraActiveLocations,
    progress: a.progress,
    questDebuff: a.questDebuff,
    fog: a.fog,
    threatModifier: a.threatModifier,
    lastQuest: a.lastQuest ?? null,
  };
}
export function gramSelectArea(s: GameState, player: number) {
  const q = gramState(s),
    a = gramArea(s, player);
  if (!q?.split || !a) return;
  q.activeArea = a.id;
  Object.assign(s, gramAreaView(s, player));
}
export function gramAllAreaUnits(s: GameState): Unit[] {
  const q = gramState(s);
  if (!q?.split)
    return [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ];
  return q.areas.flatMap((a) => {
    const projected =
      a.id === q.activeArea && a.players.includes(activePlayer(s));
    return [
      ...(projected ? s.staging : a.staging),
      ...((projected ? s.activeLocation : a.activeLocation)
        ? [projected ? s.activeLocation! : a.activeLocation!]
        : []),
      ...(projected ? (s.extraActiveLocations ?? []) : a.extraActiveLocations),
    ];
  });
}
export const gramQuestUnit = (s: GameState) =>
  isMountGram(s) && s.stage === 2 ? gramArea(s)?.quest : undefined;
export const gramCurrentQuest = (s: GameState) =>
  isMountGram(s)
    ? [GRAM.unexpected, GRAM.dungeons, GRAM.flight][s.stage - 1]
    : undefined;
/** Progress on Dungeons is limited by the prisoners that remain, rather than printed quest points. */
export const gramQuestCapacity = (s: GameState) => {
  const quest = gramQuestUnit(s);
  return quest ? (gramState(s)?.captured[quest.id]?.length ?? 0) : undefined;
};
export function gramStageInfo(s: GameState) {
  const c = GRAM_QUESTS.find((c) => c.code === gramCurrentQuest(s));
  return c
    ? {
        name: c.back_name ?? c.name,
        quest: c.back_quest ?? c.quest ?? 0,
        cardCode: c.code,
        questImage: c.back_imagesrc ?? c.imagesrc,
        story: c.back_text ?? c.text ?? "",
      }
    : undefined;
}
export function gramRecipe(easy = false) {
  const r = recipes.find((r) => r.mode === (easy ? "easy" : "standard"))!;
  const copies = (section: string) =>
    r.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // The catalog puts the setup-search Prison Cells in a staging section. Printed
  // 2A searches the encounter deck, so these four physical copies start there.
  return {
    initial: [...copies("sharedEncounterDeck"), ...copies("sharedStagingArea")],
    orcs: copies("sharedEncounterDeck2"),
    setAside: copies("sharedSetAside"),
  };
}
export const gramCaptureCount = (code: string) =>
  code === GRAM.dungeons
    ? 7
    : code === GRAM.executioners
      ? 5
      : code === GRAM.patrol
        ? 2
        : [
              GRAM.torturer,
              GRAM.guard,
              GRAM.tormentor,
              GRAM.cell,
              GRAM.tunnels,
            ].includes(code)
          ? 1
          : 0;
export const gramSideTime = (code: string) =>
  code === GRAM.executioners ? 4 : 0;

/** Hidden prisoners and area quests are physical cards, validated separately from visible zones. */
export function validateMountGram(
  s: GameState,
  validUnit: (value: unknown) => boolean,
  validPlayerCard: (unit: Unit) => boolean,
) {
  const q = gramState(s);
  if (!q) return !isMountGram(s);
  const count = s.table?.seats.length ?? 1;
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
  const units = (v: unknown): v is Unit[] =>
    Array.isArray(v) && v.every(validUnit);
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !isMountGram(s) ||
    ![1, 2, 3].includes(s.stage) ||
    typeof q.initialized !== "boolean" ||
    typeof q.split !== "boolean" ||
    !Array.isArray(q.areas) ||
    !object(q.capturedDecks) ||
    !object(q.captured) ||
    !units(q.setAside) ||
    !units(q.removedQuests) ||
    !Array.isArray(q.removedEncounter) ||
    !q.removedEncounter.every((c) => c === GRAM.executioners) ||
    !object(q.alarms) ||
    !Object.values(q.alarms).every(
      (a) =>
        object(a) &&
        integer(a.round) &&
        Number(a.round) <= s.round &&
        integer(a.copies),
    ) ||
    !Array.isArray(q.orcDeck) ||
    !q.orcDeck.every((c) => gramRecipe(!!s.easyMode).orcs.includes(c)) ||
    !Array.isArray(q.travelResolvedAreas) ||
    !q.travelResolvedAreas.every((id) => typeof id === "string") ||
    new Set(q.travelResolvedAreas).size !== q.travelResolvedAreas.length ||
    !Array.isArray(q.resolvedAreas) ||
    !q.resolvedAreas.every((id) => typeof id === "string") ||
    new Set(q.resolvedAreas).size !== q.resolvedAreas.length
  )
    return false;
  const playerUnits = (list: Unit[]) =>
    list.every(
      (u) =>
        integer(u.owner) &&
        u.owner! < count &&
        validPlayerCard(u) &&
        !u.attachments.length &&
        !u.shadows.length &&
        !u.committed &&
        !u.exhausted &&
        u.damage === 0 &&
        u.progress === 0 &&
        u.resources === 0,
    );
  for (const [p, list] of Object.entries(q.capturedDecks))
    if (
      !/^\d+$/.test(p) ||
      +p >= count ||
      !units(list) ||
      !playerUnits(list) ||
      list.some((u) => u.owner !== +p)
    )
      return false;
  const hostIds = new Set(
    [
      ...gramAllAreaUnits(s),
      ...q.areas.map((a) => a.quest),
      ...s.engaged,
      ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
    ].map((u) => u.id),
  );
  for (const [host, list] of Object.entries(q.captured))
    if (!hostIds.has(host) || !units(list) || !playerUnits(list)) return false;
  const players: number[] = [];
  for (const a of q.areas) {
    if (
      !a ||
      typeof a.id !== "string" ||
      !a.id ||
      !Array.isArray(a.players) ||
      !a.players.length ||
      !a.players.every((p) => integer(p) && p < count) ||
      new Set(a.players).size !== a.players.length ||
      !validUnit(a.quest) ||
      a.quest.code !== GRAM.dungeons ||
      !units(a.staging) ||
      !(a.activeLocation === null || validUnit(a.activeLocation)) ||
      !units(a.extraActiveLocations) ||
      ![a.progress, a.questDebuff, a.fog].every(integer) ||
      !Number.isSafeInteger(a.threatModifier)
    )
      return false;
    players.push(...a.players);
  }
  return (
    new Set(q.areas.map((a) => a.id)).size === q.areas.length &&
    new Set(players).size === players.length &&
    (!q.split ||
      (s.stage === 2 &&
        (q.areas.some(
          (a) => a.id === q.activeArea && a.players.includes(activePlayer(s)),
        ) ||
          (s.status === "lost" && !q.areas.length)))) &&
    q.setAside.length <= 2 &&
    new Set(q.setAside.map((u) => u.code)).size === q.setAside.length &&
    q.setAside.every((u) => [GRAM.gate, GRAM.jailor].includes(u.code)) &&
    q.removedQuests.every((u) => u.code === GRAM.dungeons) &&
    q.removedQuests.length + q.areas.length <= count &&
    (!q.initialized || (s.stage === 2 ? q.split : s.stage === 3 && !q.split)) &&
    (s.stage !== 3 ||
      (!q.setAside.length && !q.orcDeck.length && !q.areas.length))
  );
}
