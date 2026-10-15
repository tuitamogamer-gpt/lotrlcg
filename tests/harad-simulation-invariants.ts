import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import {
  UMBAR_MAIN_QUESTS,
  UMBAR_RECIPES,
} from "../src/game/escape-umbar-support";
import {
  DESERT_CROSSING_MAIN_QUESTS,
  DESERT_CROSSING_RECIPES,
} from "../src/game/desert-crossing-support";
import {
  MORDOR,
  MORDOR_MAIN_QUESTS,
  MORDOR_RECIPES,
} from "../src/game/long-arm-mordor-support";
import type { Effect, GameState } from "../src/game/types";
import { isHaradScenario } from "./harad-simulation-policy";

export function assertHaradSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Harad saves preserve physical encounter zones, captured heroes and pending decisions",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "a restored Harad save remains valid");
  assert.deepEqual(again, restored, "Harad restoration is idempotent");
}

/** Cards in effect continuations are physical; review/history references are not. */
export function haradPhysicalCards(s: GameState) {
  const pendingReveals = (effects: Effect[]): string[] =>
    effects.flatMap((e) =>
      ["resolveReveal", "placeEncounter"].includes(e.kind) && e.code
        ? [e.code]
        : pendingReveals(e.effects ?? []),
    );
  const units = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...(s.mordor?.captured ?? []),
    ...(s.mordor?.setAside ?? []),
    ...(s.umbar?.underAlley.flatMap((a) => a.enemies) ?? []),
  ];
  assert.equal(
    new Set(units.map((u) => u.id)).size,
    units.length,
    "each Harad physical unit occupies one active, captured, set-aside or Alleyway zone",
  );
  const attachments = units.flatMap((u) => u.attachments);
  assert.equal(
    new Set([...units, ...attachments].map((u) => u.id)).size,
    units.length + attachments.length,
    "attached physical cards have unique identities",
  );
  const codes = [
    ...units.map((u) => u.code),
    ...attachments.map((a) => a.code),
    ...units.flatMap((u) => u.shadows),
    ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
      (c) => c?.immediatePreviousShadows ?? [],
    ),
    ...pendingReveals(s.queue),
    // Cancellation choices hold one revealed physical card. Other options
    // describe alternative outcomes for that same card, so use only resolve.
    ...pendingReveals(
      s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [],
    ),
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...(s.victoryCards ?? []),
    ...(s.removedEncounter ?? []),
    ...(s.desertCrossing?.resolving ?? []),
    ...(s.mordor?.removed ?? []),
    ...seatIndices(s).flatMap((p) => {
      const view = seatView(s, p);
      return [...view.discard, ...view.removed];
    }),
  ];
  // Overgrown is held between revelation and attachment, including its choice.
  codes.push(
    ...s.queue
      .filter((e) => e.kind === "mordorOvergrown" && !e.flag)
      .map(() => MORDOR.overgrown),
  );
  if (
    s.choice?.options.some((o) =>
      o.effects.some((e) => e.kind === "mordorOvergrownAttach" && !e.flag),
    )
  )
    codes.push(MORDOR.overgrown);
  return { units, codes };
}

export function haradSimulationObserver() {
  let observations = 0,
    privacyComparisons = 0,
    capturedObservations = 0,
    alleyObservations = 0,
    mirageObservations = 0,
    advancedObservations = 0;
  const signatures = new Map<number, string>();
  const observe = (s: GameState) => {
    assert.ok(isHaradScenario(s.scenarioId));
    observations++;
    const q = s.umbar ?? s.desertCrossing ?? s.mordor;
    assert.ok(q, "Harad always owns serialized scenario state");
    const quests = s.umbar
      ? UMBAR_MAIN_QUESTS
      : s.desertCrossing
        ? DESERT_CROSSING_MAIN_QUESTS
        : MORDOR_MAIN_QUESTS;
    assert.deepEqual(
      [...q.completedQuests, q.currentQuest, ...q.questDeck],
      quests,
      "Harad printed quests retain physical order",
    );
    assert.equal(q.currentQuest, quests[s.stage - 1]);
    const recipes = s.umbar
      ? UMBAR_RECIPES
      : s.desertCrossing
        ? DESERT_CROSSING_RECIPES
        : MORDOR_RECIPES;
    const recipe = recipes.find(
      (r) => r.mode === (s.easyMode ? "easy" : "standard"),
    )!;
    const original = recipe.cards
      .filter((c) => c.section !== "sharedQuestDeck")
      .flatMap((c) => Array<string>(c.quantity).fill(c.code))
      .sort();
    const { codes, units } = haradPhysicalCards(s);
    const encounterCodes = new Set(original);
    assert.deepEqual(
      codes.filter((code) => encounterCodes.has(code)).sort(),
      original,
      "Harad conserves every original encounter card, including transient reveals and attachments",
    );
    const originalHeroes = seatIndices(s)
      .flatMap((p) => seatView(s, p).startingHeroes)
      .sort();
    const originalHeroCodes = new Set(originalHeroes);
    assert.deepEqual(
      codes
        .filter(
          (code) =>
            originalHeroCodes.has(code) && card(code).type_code === "hero",
        )
        .sort(),
      originalHeroes,
      "Harad conserves all original player heroes through capture, rescue, destruction and elimination",
    );
    for (const u of units)
      assert.ok(Number.isInteger(u.resources) && u.resources >= 0);
    if (s.mordor?.captured.length) capturedObservations++;
    if (s.umbar?.underAlley.some((a) => a.enemies.length)) alleyObservations++;
    if (s.desertCrossing?.resolving.length) mirageObservations++;
    if (s.stage > 1) advancedObservations++;
    const viewer = seatIndices(s)[(observations - 1) % seatIndices(s).length];
    const signature = JSON.stringify({
      encounter: s.encounterDeck,
      q,
      phase: s.phase,
      round: s.round,
      status: s.status,
      choice: s.choice,
      pending: s.flow?.pending?.id,
    });
    if (signatures.get(viewer) === signature) return;
    signatures.set(viewer, signature);
    const before = JSON.stringify(s);
    const projected = publicState(seatView(s, viewer));
    const alternate = structuredClone(s);
    let changed = false;
    const swapDifferent = <T>(pile: T[], key: (x: T) => string) => {
      const other = pile.findIndex((x) => key(x) !== key(pile[0]));
      if (other > 0) {
        [pile[0], pile[other]] = [pile[other], pile[0]];
        changed = true;
      }
    };
    swapDifferent(alternate.encounterDeck, (x) => x);
    const aq = alternate.umbar ?? alternate.desertCrossing ?? alternate.mordor;
    swapDifferent(aq!.questDeck, (x) => x);
    if (alternate.mordor)
      swapDifferent(alternate.mordor.setAside, (x) => x.code);
    for (const pile of alternate.umbar?.underAlley ?? [])
      swapDifferent(pile.enemies, (x) => x.code);
    if (changed) {
      assert.deepEqual(
        publicState(seatView(alternate, viewer)),
        projected,
        `viewer ${viewer}: concealed encounter, quest, set-aside and Alleyway order is private`,
      );
      privacyComparisons++;
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering leaves the Harad adventure unchanged",
    );
  };
  return {
    observe,
    counts: () => ({
      observations,
      privacyComparisons,
      capturedObservations,
      alleyObservations,
      mirageObservations,
      advancedObservations,
    }),
  };
}
