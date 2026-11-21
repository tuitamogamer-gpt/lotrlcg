import encounters from "../data/temple-encounter-cards.json";
import quests from "../data/temple-quest-cards.json";
import recipes from "../data/temple-recipes.json";
import type { Card, GameState, Phase, Unit } from "./types";
import { DC, backFace, dcBase } from "./dreamchaser-campaign-support";

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
/**
 * The Temple Guardian and the Gate Key, on either face: in the Dream-chaser
 * campaign they are the campaign expansion's reprints (the Guardian on its
 * "Campaign Mode only" side, the Key on its Upgraded side once its
 * checkboxes are marked).
 */
export const isTempleGuardian = (u: { code: string } | string) =>
  dcBase(typeof u === "string" ? u : u.code) === TEMPLE.guardian;
export const isGateKey = (u: { code: string } | string) =>
  dcBase(typeof u === "string" ? u : u.code) === TEMPLE.key;
/** The Gate Key's codes: the original card and the campaign expansion's Upgraded side. */
export const GATE_KEY_FACES = [TEMPLE.key, backFace(DC.gateKey)];
export const TEMPLE_LOST_FACES = [
  TEMPLE.cliffs,
  TEMPLE.caverns,
  TEMPLE.jungle,
  TEMPLE.flooded,
  TEMPLE.graves,
  TEMPLE.cursed,
];
export const TEMPLE_TEMPLE_FACES = [TEMPLE.grotto, TEMPLE.halls];
/**
 * Temple of the Deceived's Nightmare Deck (src/game/nightmare-temple.ts): its
 * setup card, the six Edge of the Temple cards (their revealed sides are the
 * runtime faces, behind the shared public Edge of the Temple side) and its
 * encounter cards.
 */
export const TEMPLE_NIGHTMARE = {
  card: "octgn:9e9e209e-9629-449e-9cc4-d345f68892b8",
  /** The shared public side of the six Edge of the Temple cards. */
  edge: "temple-edge-of-the-temple",
  desecrated: "octgn:717d63f2-2674-4f20-af8f-2251bc4617f0",
  foothills: "octgn:8a6687f9-25d5-47c2-8ceb-0fd9a37bd308",
  cursed: "octgn:6a071291-7135-4137-b57a-20c97d242444",
  knight: "octgn:56eebf01-713c-470e-beb1-cc141b8be928",
  soldier: "octgn:bc3a69cf-4bf8-4473-aeb1-afeb233815d9",
  deceitful: "octgn:3579da3e-dd28-41a3-b21b-e6dc49e417d7",
  call: "octgn:b3e97670-b41b-45a7-9c47-7fb885fc1f04",
  precipice: "octgn:724f33d4-1305-4ea1-a6ee-d4e6c8de01b3",
};
export const TEMPLE_EDGE_FACES = [
  TEMPLE_NIGHTMARE.desecrated,
  TEMPLE_NIGHTMARE.foothills,
  TEMPLE_NIGHTMARE.cursed,
];
/** The shared public Uncharted sides of the map cards. */
export const TEMPLE_UNCHARTED_FACES = [
  TEMPLE.lost,
  TEMPLE.temple,
  TEMPLE_NIGHTMARE.edge,
];
/** A Nightmare mode game (its setup card's Island Map). */
export const templeNightmare = (s: GameState) =>
  !!s.nightmareMode && s.scenarioId === "temple-of-the-deceived";
/** The Island Map's columns: in Nightmare mode, two Edge of the Temple columns precede the Temple column. */
export const templeColumns = (s: GameState) => (templeNightmare(s) ? 6 : 5);
/** The public Uncharted side of a map card, from its printed identity. */
export const templeFrontOf = (original: string) =>
  TEMPLE_TEMPLE_FACES.includes(original)
    ? TEMPLE.temple
    : TEMPLE_EDGE_FACES.includes(original)
      ? TEMPLE_NIGHTMARE.edge
      : TEMPLE.lost;
export interface TempleMapCell {
  /** Canonical cN physical ID, independent of either hidden face or position. */
  id: string;
  row: number;
  column: number;
}
export interface TempleState {
  initialized: boolean;
  /**
   * Positions (permanent, except for the Nightmare Deck's Deceitful Island);
   * this metadata never duplicates a physical Unit.
   */
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

/** Map metadata and private faces must account for all 15 (18 in Nightmare mode) physical cards once. */
export function validateTemple(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.temple;
  const nightmare = templeNightmare(s);
  const columns = templeColumns(s);
  const size = 3 * columns;
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
    q.map.length !== size ||
    !Array.isArray(q.outOfStaging) ||
    !Array.isArray(q.setAside) ||
    !Array.isArray(q.victoryEnemies) ||
    !Array.isArray(q.removedUnits)
  )
    return false;
  if (
    q.outOfStaging.length > size ||
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
        c.column >= columns,
    )
  )
    return false;
  if (
    new Set(q.map.map((c) => c.id)).size !== size ||
    new Set(q.map.map((c) => `${c.row}:${c.column}`)).size !== size
  )
    return false;
  if (
    q.map.some(
      (c, i) => c.row !== Math.floor(i / columns) || c.column !== i % columns,
    )
  )
    return false;
  if (!record(q.originalCodes) || !record(q.hiddenBacks) || !record(q.lookedBy))
    return false;
  const units = templeMapUnits(s);
  if (
    units.length !== size ||
    new Set(units.map((u) => u.id)).size !== size ||
    q.map.some((c) => !units.some((u) => u.id === c.id))
  )
    return false;
  if (
    Object.keys(q.originalCodes).length !== size ||
    Object.keys(q.originalCodes).some((id) => !q.map.some((c) => c.id === id))
  )
    return false;
  const count = (code: string) =>
    Object.values(q.originalCodes).filter((c) => c === code).length;
  // The Nightmare setup card removes 1 Jungle Path and both Cursed Temples
  // and adds the six Edge of the Temple cards.
  const copies = (c: string) =>
    !nightmare ? 2 : c === TEMPLE.jungle ? 1 : c === TEMPLE.cursed ? 0 : 2;
  if (
    TEMPLE_LOST_FACES.some((c) => count(c) !== copies(c)) ||
    count(TEMPLE.grotto) !== 1 ||
    count(TEMPLE.halls) !== 2 ||
    TEMPLE_EDGE_FACES.some((c) => count(c) !== (nightmare ? 2 : 0))
  )
    return false;
  for (const cell of q.map) {
    const u = units.find((u) => u.id === cell.id)!;
    const original = q.originalCodes[cell.id];
    // Without Deceitful Island, the columns keep their printed groups.
    const group = nightmare
      ? [...TEMPLE_LOST_FACES, ...TEMPLE_EDGE_FACES, ...TEMPLE_TEMPLE_FACES]
      : cell.column === 4
        ? TEMPLE_TEMPLE_FACES
        : TEMPLE_LOST_FACES;
    const front = templeFrontOf(original);
    if (!group.includes(original) || (u.code !== original && u.code !== front))
      return false;
    if ((u.code === front) !== (q.hiddenBacks[u.id] === original)) return false;
  }
  const hidden = units.filter((u) => TEMPLE_UNCHARTED_FACES.includes(u.code));
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
    q.victoryEnemies.some((u) => !isTempleGuardian(u)) ||
    q.removedUnits.some(
      (u) => ![TEMPLE.sahirAlly, TEMPLE.naasiyahAlly].includes(u.code),
    ) ||
    new Set(q.removedUnits.map((u) => u.code)).size !== q.removedUnits.length ||
    q.setAside.some(
      (u) =>
        !isTempleGuardian(u) &&
        !isGateKey(u) &&
        ![TEMPLE.sahirAlly, TEMPLE.naasiyahAlly].includes(u.code),
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
    ...TEMPLE_UNCHARTED_FACES,
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
    physicalCards.filter(isTempleGuardian).length !== 1 ||
    physicalCards.filter(isGateKey).length !== 1
  )
    return false;
  if (
    (s.victoryCards ?? []).filter(isTempleGuardian).length !==
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
