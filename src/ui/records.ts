import type { GameState } from "../game/types";
import { STARTERS } from "../game/cards";
import { score } from "../game/engine";

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
export function readRecords(): GameRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? "[]");
    return Array.isArray(list)
      ? list.filter(
          (r) =>
            r &&
            typeof r.key === "string" &&
            ["won", "lost"].includes(r.result) &&
            Number.isInteger(r.at),
        )
      : [];
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
  const key = `${s.originalSeed}:${s.scenarioId}:${s.playMode}:${s.round}`;
  const records = readRecords();
  if (records.some((r) => r.key === key)) return null;
  const heroes = s.table
    ? s.table.seats.flatMap((p) => p.startingHeroes)
    : s.startingHeroes;
  const record: GameRecord = {
    key,
    at: Date.now(),
    scenarioId: s.scenarioId,
    playMode: s.playMode,
    deck: STARTERS.find((d) => d.id === s.deckId)?.subtitle ?? "Custom",
    heroes,
    players: s.table?.seats.length ?? 1,
    result: s.status,
    rounds: s.round,
    threat: s.threat,
    score: s.status === "won" ? score(s) : 0,
    easy: !!s.easyMode,
  };
  writeRecords([...records, record]);
  return record;
}
export function summarize(records: GameRecord[]) {
  const by = <K extends string>(pick: (r: GameRecord) => K) => {
    const groups: Record<string, { played: number; won: number }> = {};
    for (const r of records) {
      const k = pick(r);
      groups[k] ??= { played: 0, won: 0 };
      groups[k].played++;
      if (r.result === "won") groups[k].won++;
    }
    return groups;
  };
  return {
    played: records.length,
    won: records.filter((r) => r.result === "won").length,
    byScenario: by((r) => r.scenarioId),
    byDeck: by((r) => r.deck),
    bestScore: Math.max(0, ...records.map((r) => r.score)),
  };
}
