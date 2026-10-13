import { DECKS_KEY } from "../game/decks";
import { restoreSave } from "../game/save";
import type { GameState, PlayMode } from "../game/types";

export const ADVENTURE_SAVE_KEY = "there-and-back-again.save.v1";
export const CAMPAIGN_SAVE_KEY = "there-and-back-again.campaign.v1";
const SAVE_KEYS = [ADVENTURE_SAVE_KEY, CAMPAIGN_SAVE_KEY] as const;
const RECOVERY_KEYS = [...SAVE_KEYS, DECKS_KEY];
type SaveKey = (typeof SAVE_KEYS)[number];

/** Raw strings retain damaged JSON and fields a newer app may understand. */
export interface RecoveryBundle {
  format: "there-and-back-again-recovery";
  version: 1;
  exportedAt: number;
  entries: Record<string, string>;
  unreadableKeys: string[];
}

export interface RecoveryCandidate {
  key: SaveKey;
  mode: PlayMode;
  game: GameState;
}

export interface RecoveryIssue {
  key: string;
  message: string;
}

export interface RecoveryImport {
  kind: "adventure" | "recovery";
  candidates: RecoveryCandidate[];
  issues: RecoveryIssue[];
  rawEntries: Record<string, string>;
}

export function collectRecoveryBundle(
  read: (key: string) => string | null = (key) => localStorage.getItem(key),
  now = Date.now(),
): RecoveryBundle {
  const entries: Record<string, string> = {};
  const unreadableKeys: string[] = [];
  for (const key of RECOVERY_KEYS) {
    try {
      const raw = read(key);
      if (raw !== null) entries[key] = raw;
    } catch {
      unreadableKeys.push(key);
    }
  }
  return {
    format: "there-and-back-again-recovery",
    version: 1,
    exportedAt: now,
    entries,
    unreadableKeys,
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** This validates every candidate before the caller chooses or writes a save. */
export function parseRecoveryImport(value: unknown): RecoveryImport {
  const single = restoreSave(value);
  if (single) {
    const key =
      single.playMode === "campaign" ? CAMPAIGN_SAVE_KEY : ADVENTURE_SAVE_KEY;
    return {
      kind: "adventure",
      candidates: [{ key, mode: single.playMode, game: single }],
      issues: [],
      rawEntries: { [key]: JSON.stringify(value) },
    };
  }
  if (!object(value)) throw new Error("This is not a valid adventure save.");
  const rawEntries: Record<string, string> = {};
  const issues: RecoveryIssue[] = [];
  if (value.format === "there-and-back-again-recovery") {
    if (
      value.version !== 1 ||
      !object(value.entries) ||
      !Object.values(value.entries).every((raw) => typeof raw === "string") ||
      !Array.isArray(value.unreadableKeys) ||
      !value.unreadableKeys.every((key) => typeof key === "string")
    )
      throw new Error("This recovery backup has an unsupported format.");
    for (const key of RECOVERY_KEYS) {
      if (typeof value.entries[key] === "string")
        rawEntries[key] = value.entries[key];
    }
    for (const key of value.unreadableKeys) {
      issues.push({
        key,
        message: "The original browser could not read this storage entry.",
      });
    }
  } else if (SAVE_KEYS.some((key) => Object.hasOwn(value, key))) {
    // Older error-boundary downloads contain parsed saves keyed by storage name.
    for (const key of SAVE_KEYS) {
      if (Object.hasOwn(value, key))
        rawEntries[key] = JSON.stringify(value[key]);
    }
  } else {
    throw new Error("This is not a valid adventure save.");
  }
  const candidates: RecoveryCandidate[] = [];
  for (const key of SAVE_KEYS) {
    if (!Object.hasOwn(rawEntries, key)) continue;
    let game: GameState | null = null;
    try {
      game = restoreSave(JSON.parse(rawEntries[key]));
    } catch {
      // The original bytes stay in rawEntries and in the downloaded backup.
    }
    const mode = key === CAMPAIGN_SAVE_KEY ? "campaign" : "normal";
    if (!game || game.playMode !== mode) {
      issues.push({
        key,
        message:
          "This entry is not a valid save for its game mode. Its original data remains in the backup.",
      });
      continue;
    }
    candidates.push({ key, mode, game });
  }
  return { kind: "recovery", candidates, issues, rawEntries };
}
