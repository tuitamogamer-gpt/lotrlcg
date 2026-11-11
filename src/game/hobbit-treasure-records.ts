import type { GameState } from "./types";
import { HOBBIT_TREASURES } from "./hobbit-codes";

/**
 * Discovered Hobbit treasures, remembered locally per group of heroes: a
 * treasure joins a later Hobbit deck only when the same heroes discovered it.
 */
export const TREASURE_RECORDS_KEY = "there-and-back-again.hobbit-treasures.v1";
export type TreasureRecord = { heroes: string[]; treasures: string[] };
export const heroGroup = (heroes: readonly string[]) =>
  [...new Set(heroes)].sort();
const sameGroup = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify(heroGroup(a)) === JSON.stringify(heroGroup(b));
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
export function readTreasureRecords(): TreasureRecord[] {
  try {
    const raw = JSON.parse(storage()?.getItem(TREASURE_RECORDS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw
          .filter(
            (r) =>
              r &&
              Array.isArray(r.heroes) &&
              r.heroes.every((h: unknown) => typeof h === "string") &&
              Array.isArray(r.treasures),
          )
          .map((r) => ({
            heroes: heroGroup(r.heroes),
            treasures: r.treasures.filter((t: unknown) =>
              HOBBIT_TREASURES.includes(t as string),
            ),
          }))
      : [];
  } catch {
    return [];
  }
}
/** Remember treasures discovered by this group of heroes; returns success. */
export function recordTreasures(heroes: string[], treasures: string[]) {
  const found = treasures.filter((t) => HOBBIT_TREASURES.includes(t));
  if (!heroes.length || !found.length) return false;
  const records = readTreasureRecords();
  const existing = records.find((r) => sameGroup(r.heroes, heroes));
  if (existing)
    existing.treasures = [...new Set([...existing.treasures, ...found])];
  else records.push({ heroes: heroGroup(heroes), treasures: found });
  try {
    storage()?.setItem(TREASURE_RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
export const discoveredTreasures = (heroes: string[]) =>
  readTreasureRecords().find((r) => sameGroup(r.heroes, heroes))?.treasures ??
  [];
/** Every starting hero at the table (Bilbo is never a chosen hero). */
export const tableHeroes = (s: GameState) =>
  s.table
    ? s.table.seats.flatMap((p) => p.startingHeroes ?? [])
    : (s.startingHeroes ?? []);
