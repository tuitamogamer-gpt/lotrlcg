import type { GameState } from "../game/types";
import { card, SCRIPTED, STARTERS } from "../game/cards";
import { score } from "../game/engine";
import { SCENARIOS } from "../game/scenarios";

/** One finished adventure, kept on this device for the player's record. */
export interface GameRecord {
  key: string;
  at: number;
  scenarioId: GameState["scenarioId"];
  playMode: GameState["playMode"];
  deck: string;
  heroes: string[];
  players: number;
  result: "won" | "lost";
  rounds: number;
  threat: number;
  score: number;
  easy: boolean;
}
export const RECORDS_KEY = "there-and-back-again.records.v1";
const integer = (n: unknown) =>
  typeof n === "number" && Number.isSafeInteger(n);
const validRecord = (value: unknown): value is GameRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as GameRecord;
  return (
    typeof r.key === "string" &&
    r.key.length > 0 &&
    r.key.length <= 4096 &&
    integer(r.at) &&
    r.at >= 0 &&
    SCENARIOS.some((q) => q.id === r.scenarioId) &&
    ["normal", "campaign"].includes(r.playMode) &&
    typeof r.deck === "string" &&
    r.deck.length > 0 &&
    r.deck.length <= 255 &&
    Array.isArray(r.heroes) &&
    r.heroes.length >= 1 &&
    r.heroes.length <= 12 &&
    new Set(r.heroes).size === r.heroes.length &&
    r.heroes.every(
      (h) =>
        typeof h === "string" &&
        SCRIPTED.has(h) &&
        card(h).type_code === "hero",
    ) &&
    integer(r.players) &&
    r.players >= 1 &&
    r.players <= 4 &&
    ["won", "lost"].includes(r.result) &&
    integer(r.rounds) &&
    r.rounds >= 0 &&
    integer(r.threat) &&
    r.threat >= 0 &&
    integer(r.score) &&
    typeof r.easy === "boolean"
  );
};
export function readRecords(): GameRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? "[]");
    if (!Array.isArray(list)) return [];
    const keys = new Set<string>();
    return list
      .filter((r) => {
        if (!validRecord(r) || keys.has(r.key)) return false;
        keys.add(r.key);
        return true;
      })
      .slice(-200);
  } catch {
    return [];
  }
}
export function writeRecords(records: GameRecord[]) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records.slice(-200)));
  } catch {
    /* The record is a convenience; play continues without it. */
  }
}
/** Records a finished game once; the key ties it to the exact game instance. */
export function recordGame(s: GameState): GameRecord | null {
  if (s.status === "playing") return null;
  const oldKey = `${s.originalSeed}:${s.scenarioId}:${s.playMode}:${s.round}`;
  // The same seed can be used with several decks, difficulties or player tables.
  const setup = (s.table?.seats ?? [s]).map((p) => ({
    heroes: p.startingHeroes,
    deck: p.customDeck
      ? Object.entries(p.customDeck).sort(([a], [b]) => a.localeCompare(b))
      : p.deckId,
  }));
  const key = `${oldKey}:${JSON.stringify([!!s.easyMode, setup])}`;
  const records = readRecords();
  if (records.some((r) => r.key === key || r.key === oldKey)) return null;
  const heroes = s.table
    ? s.table.seats.flatMap((p) => p.startingHeroes)
    : s.startingHeroes;
  const record: GameRecord = {
    key,
    at: Date.now(),
    scenarioId: s.scenarioId,
    playMode: s.playMode,
    deck: (s.table?.seats ?? [s])
      .map((p) => STARTERS.find((d) => d.id === p.deckId)?.subtitle ?? "Custom")
      .join(" + "),
    heroes: [...heroes],
    players: s.table?.seats.length ?? 1,
    result: s.status,
    rounds: s.round,
    threat: s.table
      ? s.table.seats.reduce((n, p) => n + p.threat, 0)
      : s.threat,
    score: s.status === "won" ? score(s) : 0,
    easy: !!s.easyMode,
  };
  writeRecords([...records, record]);
  return record;
}
export function summarize(records: GameRecord[]) {
  const by = <K extends string>(pick: (r: GameRecord) => K) => {
    const groups: Record<string, { played: number; won: number }> =
      Object.create(null);
    for (const r of records) {
      const k = pick(r);
      groups[k] ??= { played: 0, won: 0 };
      groups[k].played++;
      if (r.result === "won") groups[k].won++;
    }
    return groups;
  };
  const wins = records.filter((r) => r.result === "won");
  return {
    played: records.length,
    won: wins.length,
    byScenario: by((r) => r.scenarioId),
    byDeck: by((r) => r.deck),
    bestScore: wins.length ? Math.min(...wins.map((r) => r.score)) : null,
  };
}
