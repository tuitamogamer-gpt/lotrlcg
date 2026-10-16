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
  RACE_HARAD_MAIN_QUESTS,
  RACE_HARAD_ENEMY_QUESTS,
  RACE_HARAD_RECIPES,
} from "../src/game/race-harad-support";
import type { Effect, GameState } from "../src/game/types";

export function assertRaceHaradSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Race Across Harad restoration preserves both quest chains, the Orc staging area, physical objectives and pending decisions",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "a restored Race Across Harad save remains valid");
  assert.deepEqual(
    again,
    restored,
    "Race Across Harad restoration is idempotent",
  );
}

/** Review history and cancellation alternatives only reference a physical card.
 * Active continuations hold the card until its actual placement or discard. */
export function raceHaradPendingPhysicalCards(effects: Effect[]): string[] {
  return effects.flatMap((e) => [
    ...(["resolveReveal", "placeEncounter"].includes(e.kind) && e.code
      ? [e.code]
      : []),
    ...raceHaradPendingPhysicalCards(e.effects ?? []),
    ...raceHaradPendingPhysicalCards(e.costEffects ?? []),
  ]);
}

export function raceHaradPhysicalCards(s: GameState) {
  const q = s.raceHarad!;
  const units = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...q.setAside,
    ...q.removed,
    ...q.area,
  ];
  const attachments = units.flatMap((u) => u.attachments);
  assert.equal(
    new Set([...units, ...attachments].map((u) => u.id)).size,
    units.length + attachments.length,
    "each Race Across Harad physical unit and attachment occupies exactly one zone",
  );
  const choiceEffects =
    s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [];
  return {
    units,
    attachments,
    codes: [
      ...q.completedQuests,
      q.currentQuest,
      ...q.questDeck,
      ...q.enemyCompletedQuests,
      q.enemyQuest,
      ...q.enemyQuestDeck,
      ...units.map((u) => u.code),
      ...attachments.map((a) => a.code),
      ...units.flatMap((u) => u.shadows),
      ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
        (c) => c?.immediatePreviousShadows ?? [],
      ),
      ...raceHaradPendingPhysicalCards(s.queue),
      ...raceHaradPendingPhysicalCards(choiceEffects),
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...(s.victoryCards ?? []),
      ...(s.removedEncounter ?? []),
      ...seatIndices(s).flatMap((p) => {
        const v = seatView(s, p);
        return [...v.discard, ...v.removed];
      }),
    ],
  };
}

export function raceHaradSimulationObserver() {
  const counts = {
    observations: 0,
    privacyComparisons: 0,
    remoteAreaObservations: 0,
    attachmentObservations: 0,
    advancedObservations: 0,
    enemyAdvancedObservations: 0,
  };
  const signatures = new Map<number, string>();
  const observe = (s: GameState) => {
    assert.equal(s.scenarioId, "race-across-harad");
    const q = s.raceHarad;
    assert.ok(q, "Race Across Harad always owns serialized scenario state");
    counts.observations++;
    assert.deepEqual(
      [...q.completedQuests, q.currentQuest, ...q.questDeck],
      RACE_HARAD_MAIN_QUESTS,
      "the players' printed quests retain physical order",
    );
    assert.deepEqual(
      [...q.enemyCompletedQuests, q.enemyQuest, ...q.enemyQuestDeck],
      RACE_HARAD_ENEMY_QUESTS,
      "the Orcs' printed quests retain physical order, including set-aside stage 1C",
    );
    assert.equal(q.currentQuest, RACE_HARAD_MAIN_QUESTS[s.stage - 1]);
    assert.equal(q.enemyQuest, RACE_HARAD_ENEMY_QUESTS[q.enemyStage - 1]);
    const recipe = RACE_HARAD_RECIPES.find(
      (r) => r.mode === (s.easyMode ? "easy" : "standard"),
    )!;
    const original = recipe.cards
      .flatMap((c) => Array<string>(c.quantity).fill(c.code))
      .sort();
    const { codes, units, attachments } = raceHaradPhysicalCards(s),
      encounterCodes = new Set(original);
    assert.deepEqual(
      codes.filter((code) => encounterCodes.has(code)).sort(),
      original,
      "Race Across Harad conserves every original encounter and quest card across both staging areas, reveals, shadows, objectives and removed cards",
    );
    const originalHeroes = seatIndices(s)
        .flatMap((p) => seatView(s, p).startingHeroes)
        .sort(),
      heroCodes = new Set(originalHeroes);
    assert.deepEqual(
      codes
        .filter(
          (code) => heroCodes.has(code) && card(code).type_code === "hero",
        )
        .sort(),
      originalHeroes,
      "Race Across Harad conserves all original player heroes through destruction and elimination",
    );
    for (const u of units)
      assert.ok(Number.isInteger(u.resources) && u.resources >= 0);
    if (q.area.length) counts.remoteAreaObservations++;
    if (attachments.some((a) => encounterCodes.has(a.code)))
      counts.attachmentObservations++;
    if (s.stage > 1) counts.advancedObservations++;
    if (q.enemyStage > 1) counts.enemyAdvancedObservations++;
    const viewer =
      seatIndices(s)[(counts.observations - 1) % seatIndices(s).length];
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
    const before = JSON.stringify(s),
      projected = publicState(seatView(s, viewer)),
      alternate = structuredClone(s);
    let changed = false;
    const swapDifferent = <T>(pile: T[], key: (x: T) => string) => {
      const other = pile.findIndex((x) => key(x) !== key(pile[0]));
      if (other > 0) {
        [pile[0], pile[other]] = [pile[other], pile[0]];
        changed = true;
      }
    };
    swapDifferent(alternate.encounterDeck, (x) => x);
    swapDifferent(alternate.raceHarad!.questDeck, (x) => x);
    swapDifferent(alternate.raceHarad!.enemyQuestDeck, (x) => x);
    swapDifferent(alternate.raceHarad!.setAside, (x) => x.code);
    if (changed) {
      assert.deepEqual(
        publicState(seatView(alternate, viewer)),
        projected,
        `viewer ${viewer}: concealed encounter, main quest, enemy quest and set-aside order is private`,
      );
      counts.privacyComparisons++;
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering leaves the Harad race unchanged",
    );
  };
  return { observe, counts: () => ({ ...counts }) };
}
