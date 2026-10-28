import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { card } from "../src/game/cards";

import { shadowEastPlayerUnits } from "../src/game/shadow-east-player-support";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import {
  WAINRIDERS_RECIPES,
  WAINRIDERS_QUESTS,
} from "../src/game/wainriders-support";
import { isWainridersScenario } from "./wainriders-simulation-policy";
import type { Effect, GameState } from "../src/game/types";

export function assertWainridersSaveRestoration(
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
export function wainridersRecipe(s: GameState) {
  return WAINRIDERS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
}
export function wainridersPhysicalCards(s: GameState) {
  const units = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...seatIndices(s).flatMap((p) => seatView(s, p).hand),
    ...(s.wainriders?.resolving ?? []),
    ...(s.wainridersPlayers?.contracts.map((c) => c.unit) ?? []),
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
  const questCodes = WAINRIDERS_QUESTS.map((c) => c.code).filter(
    (c) => !s.victoryCards?.includes(c),
  );
  const codes = [
    ...questCodes,
    ...units.map((u) => u.code),
    ...attachments.map((a) => a.code),
    ...units.flatMap((u) => u.shadows),
    ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
      (c) => c?.immediatePreviousShadows ?? [],
    ),
    ...pendingPhysicalCards(s.queue),
    ...pendingPhysicalCards(
      s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [],
    ),
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...(s.victoryCards ?? []),
    ...(s.removedEncounter ?? []),
    ...seatIndices(s).flatMap((p) => {
      const v = seatView(s, p);
      return [...v.discard, ...v.removed];
    }),
  ].map((code) => (code === "21072.B" ? "21072" : code));
  return { units, attachments, codes };
}

/** Observe actual phase/seat/stage boundaries without choosing actions or altering game state. */
export function wainridersSimulationObserver() {
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
    assert.ok(isWainridersScenario(s.scenarioId));
    const boundary = `${s.round}/${s.phase}/${s.table?.active ?? 0}/${s.stage}/${s.wainriders?.currentQuest ?? ""}/${s.status}`;
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
    const recipe = wainridersRecipe(s);
    assert.ok(recipe, "original scenario recipe exists");
    const original = recipe.cards
      .flatMap((r) => Array<string>(r.quantity).fill(r.code))
      .sort();
    const sourceCodes = new Set(original);
    const { units, codes } = wainridersPhysicalCards(s);
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
    const swap = <T>(pile: T[], key: (value: T) => string) => {
      const index = pile.findIndex((x) => key(x) !== key(pile[0]));
      if (index > 0) {
        [pile[0], pile[index]] = [pile[index], pile[0]];
        changed = true;
      }
    };
    swap(alternate.encounterDeck, (x) => x);
    for (const p of seatIndices(alternate))
      swap(seatView(alternate, p).deck, (x) => x);
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
