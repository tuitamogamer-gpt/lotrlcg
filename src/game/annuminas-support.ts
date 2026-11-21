// Printed definitions and pure projections have no runtime-handler dependencies.
import encounters from "../data/annuminas-encounter-cards.json";
import quests from "../data/annuminas-quest-cards.json";
import recipes from "../data/annuminas-recipes.json";
import epicCards from "../data/annuminas-epic-cards.json";
import type { Card, GameState, Unit } from "./types";
export type { AnnuminasState } from "./annuminas-types";

/** Epic multiplayer mode's setup card and its 1C–3C and 1E–3E quest cards. */
const EPIC = epicCards as (Card & { position?: number })[];
export const SA_EPIC_QUESTS: Card[] = EPIC.filter(
  (c) => c.type_code === "quest",
).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const SA_ENCOUNTERS = [
  ...(encounters as Card[]),
  ...EPIC.filter((c) => c.type_code !== "quest"),
] as Card[];
/** The quest cards in stage order (1A–3A). */
export const SA_QUESTS: Card[] = [
  ...(quests as (Card & { position?: number })[]),
].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
export const SA_RECIPES = recipes;
export const SA_SCENARIO = "the-siege-of-annuminas";
const printed = [...encounters, ...quests, ...EPIC] as Card[];
const code = (title: string) => printed.find((c) => c.name === title)!.code;
const rules = printed.filter((c) => c.type_code === "rules").map((c) => c.code);
export const SA = {
  rebuild: code("Rebuild the Defenses"),
  defend: code("Defend the City"),
  sortie: code("Lead the Sortie"),
  mode: code("Standard Game Mode"),
  epicMode: code("Epic Multiplayer Mode"),
  levee: code("Raise the Levee"),
  guard: code("Guard the Gate"),
  captives: code("Rescue the Captives"),
  delay: code("Delay the Enemy"),
  manWalls: code("Man the Walls"),
  stopAttack: code("Stop the Attack"),
  rules1: rules[0],
  rules2: rules[1],
  rules3: rules[2],
  city: code("Annúminas"),
  lieutenant: code("Lieutenant of Angmar"),
  ram: code("Battering Ram"),
  camp: code("Enemy Camp"),
  tunnel: code("Siege Tunnel"),
  host: code("Host of Angmar"),
  dunedain: code("Dúnedain of Annúminas"),
  gate: code("Gate of Annúminas"),
  wall: code("City Wall"),
  battlefield: code("Arnor Battlefield"),
  evendim: code("Hills of Evendim"),
  nenuial: code("Shores of Lake Nenuial"),
  warg: code("Warg of Carn Dûm"),
  orc: code("Orc of Angmar"),
  rider: code("Angmar Warg-rider"),
  werewolf: code("Savage Werewolf"),
  vanguard: code("Vanguard of Carn Dûm"),
  hordes: code("The Hordes of Angmar"),
  sorcery: code("Sorcery of Carn Dûm"),
  press: code("Caught in the Press"),
  weary: code("Weary Warriors"),
} as const;
export const SA_STAGE: Record<string, number> = {
  [SA.rebuild]: 1,
  [SA.defend]: 2,
  [SA.sortie]: 3,
  [SA.levee]: 1,
  [SA.guard]: 2,
  [SA.captives]: 3,
  [SA.delay]: 1,
  [SA.manWalls]: 2,
  [SA.stopAttack]: 3,
};
/** Each team's quest deck in epic multiplayer mode (1A–3A, 1C–3C, 1E–3E). */
export const SA_TEAM_QUESTS: string[][] = [
  [SA.rebuild, SA.defend, SA.sortie],
  [SA.levee, SA.guard, SA.captives],
  [SA.delay, SA.manWalls, SA.stopAttack],
];
/** The quest deck of a game: its team's in epic multiplayer mode. */
export const saQuestDeck = (s: GameState) => SA_TEAM_QUESTS[s.epicTeam ?? 0];
/** Each team's game in epic multiplayer mode, the active team's being the state itself. */
export const saTeams = (s: GameState): GameState[] =>
  s.epic ? s.epic.teams.map((t, i) => (i === s.epic!.active ? s : t!)) : [s];
/** Victory displays: in epic multiplayer mode, a card is in a victory display if it is in any team's. */
export const saVictory = (s: GameState) =>
  saTeams(s).flatMap((t) => t.victoryCards ?? []);
/** The city strength of Annúminas (epic multiplayer mode keeps one for every team). */
export const saCityStrength = (s: GameState) =>
  s.epic ? s.epic.cityStrength : (s.annuminas?.cityStrength ?? 0);
export const SA_QUEST_CODES = Object.keys(SA_STAGE);
/** Printed Archery X of this encounter deck. */
export const SA_ARCHERY: Record<string, number> = {
  [SA.host]: 2,
  [SA.orc]: 1,
  [SA.rider]: 1,
};
const byCode = new Map(printed.map((c) => [c.code, c]));
type Recipe = (typeof recipes)[number];
export const saRecipe = () => recipes[0] as Recipe;
const quest = (c: string) =>
  [...SA_QUESTS, ...SA_EPIC_QUESTS].find((q) => q.code === c)!;
export function saStageInfo(s: GameState) {
  const q = s.annuminas;
  if (!q) return undefined;
  const c = quest(q.currentQuest);
  const front = s.stageRevealing;
  const hosts = saVictory(s).filter((x) => x === SA.host).length;
  const goal = c.back_quest
    ? Math.max(
        0,
        c.back_quest - (SA_STAGE[q.currentQuest] === 2 ? 10 * hosts : 0),
      )
    : 0;
  // Each team's stage letters: A/B, C/D or E/F.
  const frontLetter = "ACE"[s.epicTeam ?? 0];
  const backLetter = "BDF"[s.epicTeam ?? 0];
  return {
    name: c.name,
    cardCode: c.code,
    quest: front ? 0 : goal,
    story: (front ? c.text : c.back_text) || (c.back_text ?? c.text ?? ""),
    questImage: front ? c.imagesrc : c.back_imagesrc,
    side: front ? frontLetter : backLetter,
  };
}
export const saUnits = (s: GameState): Unit[] => [
  ...(s.annuminas?.resolving ?? []),
];
/** Epic multiplayer mode: the stage (back side) where Lieutenant of Angmar is in play. */
function lieutenantStage(s: GameState) {
  const team = saTeams(s).find((t) =>
    [
      ...t.staging,
      ...(t.engaged ?? []),
      ...(t.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
    ].some((u) => u.code === SA.lieutenant),
  );
  return team ? `${team.stage}${"BDF"[team.epicTeam ?? 0]}` : undefined;
}
/** The scenario's public state, for the panel and the browser checks. */
export function annuminasPublicState(s: GameState) {
  const q = s.annuminas;
  if (!q) return undefined;
  const stage = SA_STAGE[q.currentQuest];
  const engaged = [
    ...(s.engaged ?? []),
    ...(s.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
  ];
  return {
    currentQuest: q.currentQuest,
    side: `${stage}${(s.stageRevealing ? "ACE" : "BDF")[s.epicTeam ?? 0]}`,
    stage,
    cityStrength: saCityStrength(s),
    questResources: q.questResources,
    lieutenant: s.epic
      ? saVictory(s).includes(SA.lieutenant)
        ? ("victory" as const)
        : lieutenantStage(s)
          ? ("play" as const)
          : ("aside" as const)
      : q.setAside.includes(SA.lieutenant)
        ? ("aside" as const)
        : [...s.staging, ...engaged].some((u) => u.code === SA.lieutenant)
          ? ("play" as const)
          : (s.victoryCards ?? []).includes(SA.lieutenant)
            ? ("victory" as const)
            : ("gone" as const),
    // Epic multiplayer mode: the stage where Lieutenant of Angmar is.
    lieutenantStage: s.epic ? lieutenantStage(s) : undefined,
    hosts: saVictory(s).filter((c) => c === SA.host).length,
    captives: (q.captives ?? []).length,
    // Epic multiplayer mode: the other teams at their stages.
    teams: s.epic
      ? saTeams(s).map((t, i) => ({
          team: i,
          active: i === s.epic!.active,
          side: `${t.stage}${"BDF"[i]}`,
          name: t.annuminas ? quest(t.annuminas.currentQuest).name : "",
          players: t.table?.seats.length ?? 1,
          progress: t.progress,
          enemies: [
            ...t.staging,
            ...(t.engaged ?? []),
            ...(t.table?.seats.flatMap((seat) => seat.engaged ?? []) ?? []),
          ].filter((u) => byCode.get(u.code)?.type_code === "enemy").length,
          status: t.status,
        }))
      : undefined,
  };
}
export function validateAnnuminas(s: GameState, unit: (u: unknown) => boolean) {
  const q = s.annuminas;
  if (q === undefined) return s.scenarioId !== SA_SCENARIO;
  const codes = (v: unknown) =>
    Array.isArray(v) && v.every((c) => typeof c === "string" && byCode.has(c));
  const marks = (v: unknown, phase = false) =>
    Array.isArray(v) &&
    v.every(
      (m) =>
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        (!phase || typeof m.phase === "string"),
    );
  return (
    !!q &&
    s.scenarioId === SA_SCENARIO &&
    saQuestDeck(s).includes(q.currentQuest) &&
    (q.captives === undefined ||
      (s.epicTeam !== undefined &&
        Array.isArray(q.captives) &&
        q.captives.every(
          (h) =>
            typeof h.code === "string" &&
            Number.isInteger(h.owner) &&
            h.owner >= 0 &&
            h.owner < (s.table?.seats.length ?? 1),
        ))) &&
    (q.fewerReveals === undefined ||
      (s.epicTeam !== undefined &&
        Number.isInteger(q.fewerReveals.round) &&
        Number.isInteger(q.fewerReveals.value) &&
        q.fewerReveals.value >= 0)) &&
    s.stage === SA_STAGE[q.currentQuest] &&
    typeof q.advancing === "boolean" &&
    codes(q.setAside) &&
    Number.isInteger(q.cityStrength) &&
    Number.isInteger(q.questResources) &&
    q.questResources >= 0 &&
    (q.questProgress === null ||
      (Number.isInteger(q.questProgress.round) &&
        Number.isInteger(q.questProgress.amount))) &&
    Array.isArray(q.resolving) &&
    q.resolving.every(unit) &&
    marks(q.weakened) &&
    marks(q.braced, true) &&
    marks(q.pressed, true) &&
    (q.weary === null ||
      (Array.isArray(q.weary.ids) &&
        q.weary.ids.every((id) => typeof id === "string") &&
        Number.isInteger(q.weary.round))) &&
    marks(q.unready)
  );
}
