import encounters from "../data/temple-encounter-cards.json";
import quests from "../data/temple-quest-cards.json";
import recipes from "../data/temple-recipes.json";
import type { Card, GameState, Phase, Unit } from "./types";

/** Data-only exports deliberately avoid the cards/engine runtime graph. */
export const TEMPLE_PUBLIC_FACES = encounters.filter((c) =>
  ["temple-lost-island", "temple-uncharted-temple"].includes(c.code),
) as Card[];
export const TEMPLE_ENCOUNTERS = encounters.filter(
  (c) => !TEMPLE_PUBLIC_FACES.some((f) => f.code === c.code),
) as Card[];
export const TEMPLE_QUESTS = quests as Card[];
export const TEMPLE_RECIPES = recipes;
const code = (name: string) =>
  [...TEMPLE_ENCOUNTERS, ...TEMPLE_QUESTS].find(
    (c) => c.name === name && !c.code.endsWith(":B"),
  )!.code;
export const TEMPLE = {
  search: code("Searching the Island"),
  lost: "temple-lost-island",
  temple: "temple-uncharted-temple",
  grotto: code("The Grotto's Entrance"),
  halls: code("Temple Halls"),
  guardian: code("Temple Guardian"),
  key: code("Gate Key"),
  cliffs: code("Jagged Cliffs"),
  caverns: code("Winding Caverns"),
  jungle: code("Jungle Path"),
  flooded: code("Flooded Ruins"),
  graves: code("Drowned Graves"),
  cursed: code("Cursed Temple"),
  watcher: code("Island Watcher"),
  desecrator: code("Faithless Desecrator"),
  profane: code("Profane Dead"),
  deeper: code("Deeper into the Ruins"),
  rain: code("Furious Rainstorm"),
  supplies: code("Dwindling Supplies"),
  sunken: code("Sunken Ruins"),
  drowned: code("Drowned Dead"),
  cadaver: code("Soulless Cadaver"),
  throngs: code("Throngs of Unfaithful"),
  curse: code("Curse of the Downfallen"),
  wandering: code("Aimless Wandering"),
  sahir: code("Captain Sahír"),
  naasiyah: code("Na'asiyah"),
  sahirAlly: `${code("Captain Sahír")}:B`,
  naasiyahAlly: `${code("Na'asiyah")}:B`,
};
export const TEMPLE_LOST_FACES = [
  TEMPLE.cliffs,
  TEMPLE.caverns,
  TEMPLE.jungle,
  TEMPLE.flooded,
  TEMPLE.graves,
  TEMPLE.cursed,
];
export const TEMPLE_TEMPLE_FACES = [TEMPLE.grotto, TEMPLE.halls];
export interface TempleMapCell {
  /** Canonical cN physical ID, independent of either hidden face or position. */
  id: string;
  row: number;
  column: number;
}
export interface TempleState {
  initialized: boolean;
  /** Permanent positions; this metadata never duplicates a physical Unit. */
  map: TempleMapCell[];
  activeId: string | null;
  travelUsed: boolean;
  /** Map Units outside ordinary staging/active zones remain in play here. */
  outOfStaging: Unit[];
  setAside: Unit[];
  /** Retains the exact Guardian physical identity while in the victory display. */
  victoryEnemies: Unit[];
  /** Objective companions leave the game while retaining exact physical IDs. */
  removedUnits: Unit[];
  /** Private immutable printed-side identities used for conservation validation. */
  originalCodes: Record<string, string>;
  /** Present only while a public shared Uncharted face is showing. */
  hiddenBacks: Record<string, string>;
  lookedBy: Record<string, number[]>;
  /** Only the viewers who actually looked may inspect this private modal image. */
  privateLook: { locationId: string; player: number } | null;
  phaseThreat: number;
  phaseThreatPhase: Phase | null;
  sunkenBoosts: { locationId: string; value: number }[];
  sunkenPhase: Phase | null;
  bottomOnDestroy: string[];
  blankedDepartures: string[];
  combatBoosts: {
    characterId: string;
    enemyId: string;
    playerAttack: boolean;
    attack: number;
    defense: number;
  }[];
}
export const templeState = (s: GameState) => s.temple;
export const templeCell = (s: GameState, id: string) =>
  s.temple?.map.find((c) => c.id === id);
export const templeIsMapLocation = (s: GameState, u: Pick<Unit, "id">) =>
  !!templeCell(s, u.id);
export function templeMapUnits(s: GameState): Unit[] {
  const q = s.temple;
  if (!q) return [];
  const ids = new Set(q.map.map((c) => c.id));
  return [
    ...q.outOfStaging,
    ...s.staging.filter((u) => ids.has(u.id)),
    ...(s.activeLocation && ids.has(s.activeLocation.id)
      ? [s.activeLocation]
      : []),
  ];
}
export const templeMapUnit = (s: GameState, id: string) =>
  templeMapUnits(s).find((u) => u.id === id);
export const templeActiveLocation = (s: GameState) =>
  s.temple?.activeId ? templeMapUnit(s, s.temple.activeId) : undefined;
export function templeAdjacent(s: GameState, id: string): Unit[] {
  const cell = templeCell(s, id);
  if (!cell) return [];
  return templeMapUnits(s).filter((u) => {
    const other = templeCell(s, u.id)!;
    return (
      Math.abs(cell.row - other.row) + Math.abs(cell.column - other.column) ===
      1
    );
  });
}
export const templeIsStaged = (s: GameState, u: Pick<Unit, "id">) =>
  s.staging.some((x) => x.id === u.id);
export function templeLocationsLeft(s: GameState): Unit[] {
  const active = templeActiveLocation(s);
  const cell = active && templeCell(s, active.id);
  return cell
    ? templeMapUnits(s).filter((u) => {
        const other = templeCell(s, u.id)!;
        return other.row === cell.row && other.column < cell.column;
      })
    : [];
}

/** Map metadata and private faces must account for all 15 physical cards once. */
export function validateTemple(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.temple;
  if (q === undefined) return s.scenarioId !== "temple-of-the-deceived";
  if (
    !q ||
    s.scenarioId !== "temple-of-the-deceived" ||
    s.stage !== 1 ||
    typeof q.initialized !== "boolean"
  )
    return false;
  const record = (v: unknown) =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (typeof q.travelUsed !== "boolean") return false;
  const natural = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  const phase = (v: unknown) =>
    v === null ||
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
    ].includes(String(v));
  if (
    !Array.isArray(q.map) ||
    q.map.length !== 15 ||
    !Array.isArray(q.outOfStaging) ||
    !Array.isArray(q.setAside) ||
    !Array.isArray(q.victoryEnemies) ||
    !Array.isArray(q.removedUnits)
  )
    return false;
  if (
    q.outOfStaging.length > 15 ||
    q.setAside.length > 4 ||
    q.victoryEnemies.length > 1 ||
    q.removedUnits.length > 2 ||
    ![
      ...q.outOfStaging,
      ...q.setAside,
      ...q.victoryEnemies,
      ...q.removedUnits,
    ].every(validUnit)
  )
    return false;
  if (
    q.map.some(
      (c) =>
        !c ||
        typeof c.id !== "string" ||
        !/^c\d+$/.test(c.id) ||
        !Number.isInteger(c.row) ||
        c.row < 0 ||
        c.row > 2 ||
        !Number.isInteger(c.column) ||
        c.column < 0 ||
        c.column > 4,
    )
  )
    return false;
  if (
    new Set(q.map.map((c) => c.id)).size !== 15 ||
    new Set(q.map.map((c) => `${c.row}:${c.column}`)).size !== 15
  )
    return false;
  if (q.map.some((c, i) => c.row !== Math.floor(i / 5) || c.column !== i % 5))
    return false;
  if (!record(q.originalCodes) || !record(q.hiddenBacks) || !record(q.lookedBy))
    return false;
  const units = templeMapUnits(s);
  if (
    units.length !== 15 ||
    new Set(units.map((u) => u.id)).size !== 15 ||
    q.map.some((c) => !units.some((u) => u.id === c.id))
  )
    return false;
  if (
    Object.keys(q.originalCodes).length !== 15 ||
    Object.keys(q.originalCodes).some((id) => !q.map.some((c) => c.id === id))
  )
    return false;
  const count = (code: string) =>
    Object.values(q.originalCodes).filter((c) => c === code).length;
  if (
    TEMPLE_LOST_FACES.some((c) => count(c) !== 2) ||
    count(TEMPLE.grotto) !== 1 ||
    count(TEMPLE.halls) !== 2
  )
    return false;
  for (const cell of q.map) {
    const u = units.find((u) => u.id === cell.id)!;
    const original = q.originalCodes[cell.id];
    const group = cell.column === 4 ? TEMPLE_TEMPLE_FACES : TEMPLE_LOST_FACES;
    const front = cell.column === 4 ? TEMPLE.temple : TEMPLE.lost;
    if (!group.includes(original) || (u.code !== original && u.code !== front))
      return false;
    if ((u.code === front) !== (q.hiddenBacks[u.id] === original)) return false;
  }
  const hidden = units.filter((u) =>
    [TEMPLE.lost, TEMPLE.temple].includes(u.code),
  );
  if (
    Object.keys(q.hiddenBacks).length !== hidden.length ||
    Object.entries(q.lookedBy).some(
      ([id, viewers]) =>
        !q.hiddenBacks[id] ||
        !Array.isArray(viewers) ||
        new Set(viewers).size !== viewers.length ||
        viewers.some(
          (p) =>
            !Number.isInteger(p) || p < 0 || p >= (s.table?.seats.length ?? 1),
        ),
    )
  )
    return false;
  if (
    q.privateLook !== null &&
    (!q.privateLook ||
      !q.hiddenBacks[q.privateLook.locationId] ||
      !Number.isInteger(q.privateLook.player) ||
      q.privateLook.player < 0 ||
      q.privateLook.player >= (s.table?.seats.length ?? 1) ||
      !q.lookedBy[q.privateLook.locationId]?.includes(q.privateLook.player))
  )
    return false;
  if (
    q.activeId !== null &&
    (typeof q.activeId !== "string" || !q.map.some((c) => c.id === q.activeId))
  )
    return false;
  if (
    q.initialized
      ? !s.activeLocation ||
        s.activeLocation.id !== q.activeId ||
        !!s.extraActiveLocations?.length
      : q.activeId !== null || !!s.activeLocation
  )
    return false;
  const active = units.find((u) => u.id === q.activeId);
  const activeCell = active && q.map.find((c) => c.id === active.id);
  const expectedStaging = new Set(
    units
      .filter((u) => {
        if (!active || !activeCell) return false;
        const cell = q.map.find((c) => c.id === u.id)!;
        if (
          Math.abs(cell.row - activeCell.row) +
            Math.abs(cell.column - activeCell.column) !==
          1
        )
          return false;
        if (
          !active.blanked &&
          active.code === TEMPLE.cliffs &&
          cell.column > activeCell.column
        )
          return false;
        if (
          !active.blanked &&
          active.code === TEMPLE.jungle &&
          cell.row !== activeCell.row
        )
          return false;
        return true;
      })
      .map((u) => u.id),
  );
  if (
    s.staging
      .filter((u) => q.map.some((c) => c.id === u.id))
      .some((u) => !expectedStaging.has(u.id)) ||
    [...expectedStaging].some((id) => !s.staging.some((u) => u.id === id))
  )
    return false;
  if (
    q.outOfStaging.some((u) => u.id === q.activeId || expectedStaging.has(u.id))
  )
    return false;
  if (
    q.victoryEnemies.some((u) => u.code !== TEMPLE.guardian) ||
    q.removedUnits.some(
      (u) => ![TEMPLE.sahirAlly, TEMPLE.naasiyahAlly].includes(u.code),
    ) ||
    new Set(q.removedUnits.map((u) => u.code)).size !== q.removedUnits.length ||
    q.setAside.some(
      (u) =>
        ![
          TEMPLE.guardian,
          TEMPLE.key,
          TEMPLE.sahirAlly,
          TEMPLE.naasiyahAlly,
        ].includes(u.code),
    )
  )
    return false;
  const players = s.table
    ? s.table.seats.map((p, i) => (i === s.table!.active ? s : p))
    : [s];
  const otherUnits = [
    ...s.staging.filter((u) => !q.map.some((c) => c.id === u.id)),
    ...players.flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged]),
    ...q.setAside,
    ...q.victoryEnemies,
    ...q.removedUnits,
  ];
  const mapCodes = new Set([
    TEMPLE.lost,
    TEMPLE.temple,
    ...Object.values(q.originalCodes),
  ]);
  if (
    [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...(s.victoryCards ?? []),
      ...otherUnits.flatMap((u) => u.shadows),
    ].some((code) => mapCodes.has(code))
  )
    return false;
  if (
    otherUnits.some((u) => mapCodes.has(u.code)) ||
    players.some(
      (p) =>
        p.hand.some((u) => mapCodes.has(u.code)) ||
        [...p.deck, ...p.discard, ...p.removed].some((code) =>
          mapCodes.has(code),
        ),
    )
  )
    return false;
  const physicalCards = [
    ...otherUnits,
    ...otherUnits.flatMap((u) => u.attachments),
  ];
  if (
    physicalCards.filter((u) => u.code === TEMPLE.guardian).length !== 1 ||
    physicalCards.filter((u) => u.code === TEMPLE.key).length !== 1
  )
    return false;
  if (
    (s.victoryCards ?? []).filter((code) => code === TEMPLE.guardian).length !==
    q.victoryEnemies.length
  )
    return false;
  if (
    !natural(q.phaseThreat) ||
    !phase(q.phaseThreatPhase) ||
    !phase(q.sunkenPhase) ||
    !Array.isArray(q.sunkenBoosts) ||
    q.sunkenBoosts.some(
      (b) =>
        !b || !q.map.some((c) => c.id === b.locationId) || !natural(b.value),
    )
  )
    return false;
  if (
    !Array.isArray(q.bottomOnDestroy) ||
    q.bottomOnDestroy.some(
      (id) => typeof id !== "string" || !/^c\d+$/.test(id),
    ) ||
    new Set(q.bottomOnDestroy).size !== q.bottomOnDestroy.length
  )
    return false;
  if (
    !Array.isArray(q.blankedDepartures) ||
    q.blankedDepartures.some(
      (code) => ![TEMPLE.sahirAlly, TEMPLE.naasiyahAlly].includes(code),
    ) ||
    new Set(q.blankedDepartures).size !== q.blankedDepartures.length
  )
    return false;
  return (
    Array.isArray(q.combatBoosts) &&
    q.combatBoosts.every(
      (b) =>
        b &&
        typeof b.characterId === "string" &&
        typeof b.enemyId === "string" &&
        typeof b.playerAttack === "boolean" &&
        natural(b.attack) &&
        natural(b.defense),
    )
  );
}
