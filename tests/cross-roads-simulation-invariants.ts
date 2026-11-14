import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { gandalfFaceupCard } from "../src/game/road-darkens-player-cards";
import { card } from "../src/game/cards";

import { shadowEastPlayerUnits } from "../src/game/shadow-east-player-support";
import { globalCharacters, seatIndices, seatView } from "../src/game/table";
import {
  CROSS_ROADS_RECIPES,
  CROSS_ROADS_QUESTS,
  crossRoadsUnits,
} from "../src/game/cross-roads-support";
import { isJtcScenario } from "./cross-roads-simulation-policy";
import type { Effect, GameState } from "../src/game/types";

export function assertJtcSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "save restoration preserves exact rules, ownership, RNG and presentation state",
  );
}
function pendingPhysicalCards(effects: Effect[]): string[] {
  return effects.flatMap((e) => [
    ...(["revealCard", "resolveReveal", "placeEncounter"].includes(e.kind) &&
    e.code
      ? [e.code]
      : []),
    ...pendingPhysicalCards(e.effects ?? []),
    ...pendingPhysicalCards(e.costEffects ?? []),
  ]);
}
export function jtcRecipe(s: GameState) {
  return CROSS_ROADS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
}
/** Double-sided player cards count as one physical card. */
const physical = (code: string) => (code === "21072.B" ? "21072" : code);
export function jtcPhysicalCards(s: GameState) {
  const units = [
    ...globalCharacters(s),
    ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
    ...seatIndices(s).flatMap((p) => seatView(s, p).hand),
    ...crossRoadsUnits(s),
    ...(s.fortressNurnPlayers?.contracts.map((c) => c.unit) ?? []),
    ...shadowEastPlayerUnits(s),
    ...(s.resolvingEvents
      ?.filter((e) => e.destination !== "spent")
      .map((e) => e.unit) ?? []),
    ...(s.pendingPlayerPlays?.map((e) => e.unit) ?? []),
  ];
  const attachments = [
    ...units.flatMap((u) => u.attachments),
    ...Object.values(s.questAttachments ?? {}).flat(),
  ];
  assert.equal(
    new Set([...units, ...attachments].map((u) => u.id)).size,
    units.length + attachments.length,
    "every physical unit and attachment occupies one zone",
  );
  // Quest cards never leave the game.
  const questCodes = CROSS_ROADS_QUESTS.map((c) => c.code);
  const codes = [
    ...questCodes,
    ...units.map((u) => u.code),
    ...attachments.map((a) => a.code),
    ...units.flatMap((u) => u.shadows),
    ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
      (c) => c?.immediatePreviousShadows ?? [],
    ),
    ...pendingPhysicalCards(s.queue),
    ...pendingPhysicalCards(s.hideTest?.continuation ?? []),
    ...pendingPhysicalCards(
      s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [],
    ),
    ...s.encounterDeck,
    ...s.encounterDiscard,
    // Facedown under The Cross-roads and under The Black Gate.
    ...(s.crossRoads?.underCrossroads ?? []),
    ...(s.crossRoads?.underBlackGate ?? []),
    ...seatIndices(s).flatMap((p) => seatView(s, p).deck),

    ...(s.victoryCards ?? []),
    ...(s.removedEncounter ?? []),
    ...seatIndices(s).flatMap((p) => {
      const v = seatView(s, p);
      return [...v.discard, ...v.removed];
    }),
  ].map(physical);
  return { units, attachments, codes };
}

/** Observe actual phase/seat/stage boundaries without choosing actions or altering game state. */
export function jtcSimulationObserver() {
  const counts = {
    boundaryObservations: 0,
    privacyComparisons: 0,
    playerViews: 0,
    physicalChecks: 0,
    idempotenceChecks: 0,
    renderPurityChecks: 0,
  };
  let priorBoundary: string | undefined;
  const observe = (s: GameState) => {
    assert.ok(isJtcScenario(s.scenarioId));
    const boundary = `${s.round}/${s.phase}/${s.table?.active ?? 0}/${s.stage}/${s.crossRoads?.underCrossroads.length ?? ""}/${s.crossRoads?.underBlackGate.length ?? ""}/${s.status}`;
    if (boundary === priorBoundary) return;
    priorBoundary = boundary;
    counts.boundaryObservations++;
    const saved = JSON.parse(JSON.stringify(s));
    const restored = restoreSave(saved);
    assert.ok(restored, "boundary save restores successfully");
    assert.deepEqual(
      restored,
      saved,
      "boundary save restoration is idempotent",
    );
    counts.idempotenceChecks++;
    const before = JSON.stringify(s);
    publicState(s);
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering leaves live state unchanged",
    );
    counts.renderPurityChecks++;
    const recipe = jtcRecipe(s);
    assert.ok(recipe, "original scenario recipe exists");
    const original = recipe.cards
      .filter((r) => r.section !== "sharedSetAside")
      .flatMap((r) => Array<string>(r.quantity).fill(r.code))
      .sort();
    const sourceCodes = new Set(original);
    const { units, codes } = jtcPhysicalCards(s);
    assert.deepEqual(
      codes.filter((c) => sourceCodes.has(c)).sort(),
      original,
      `${s.scenarioId}: exact original encounter and quest quantities across all physical zones`,
    );
    const heroes = seatIndices(s)
      .flatMap((p) => seatView(s, p).startingHeroes)
      .sort();
    const heroCodes = new Set(heroes);
    assert.deepEqual(
      codes
        .filter((c) => heroCodes.has(c) && card(c).type_code === "hero")
        .sort(),
      heroes,
      "original physical heroes occupy one zone after play, destruction and elimination",
    );
    assert.ok(
      units.every((u) => Number.isInteger(u.resources) && u.resources >= 0),
    );
    counts.physicalChecks++;

    const alternate = structuredClone(s);
    let changed = false;
    // Only concealed cards are swapped: Gandalf (The Road Darkens) keeps the
    // top card of his controller's deck faceup.
    const swap = <T>(pile: T[], key: (value: T) => string, from = 0) => {
      const index = pile.findIndex(
        (x, i) => i > from && key(x) !== key(pile[from]),
      );
      if (index > from) {
        [pile[from], pile[index]] = [pile[index], pile[from]];
        changed = true;
      }
    };
    swap(alternate.encounterDeck, (x) => x);
    // The Men of Harad lie facedown under The Cross-roads.
    if (alternate.crossRoads)
      swap(alternate.crossRoads.underCrossroads, (x) => x);
    for (const p of seatIndices(alternate))
      swap(
        seatView(alternate, p).deck,
        (x) => x,
        gandalfFaceupCard(alternate, p) ? 1 : 0,
      );
    for (const contract of alternate.burglarContract?.contracts ?? [])
      swap(contract.loot, (x) => x.code);
    for (const viewer of seatIndices(s)) {
      const projected = publicState(seatView(s, viewer));
      counts.playerViews++;
      if (changed) {
        assert.deepEqual(
          publicState(seatView(alternate, viewer)),
          projected,
          `player ${viewer}: concealed encounter, player, stored-card and loot deck orders stay private`,
        );
        counts.privacyComparisons++;
      }
    }
    assert.equal(JSON.stringify(s), before, "every player projection is pure");
  };
  return { observe, counts: () => ({ ...counts }) };
}
