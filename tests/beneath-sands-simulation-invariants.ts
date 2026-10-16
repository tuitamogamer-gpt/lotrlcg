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
  BENEATH_SANDS,
  BENEATH_SANDS_MAIN_QUESTS,
  BENEATH_SANDS_RECIPES,
} from "../src/game/beneath-sands-support";
import type { Effect, GameState } from "../src/game/types";

export function assertBeneathSandsSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Beneath the Sands restoration preserves the physical quest chain, Search state, held search cards, boss and pending decisions",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "a restored Beneath the Sands save remains valid");
  assert.deepEqual(
    again,
    restored,
    "Beneath the Sands restoration is idempotent",
  );
}

/** Only active continuations own physical cards. Review references and alternate
 * cancellation branches describe the same card; search options reference resolving. */
export function beneathSandsPendingPhysicalCards(effects: Effect[]): string[] {
  return effects.flatMap((effect) => [
    ...(["resolveReveal", "placeEncounter"].includes(effect.kind) && effect.code
      ? [effect.code]
      : []),
    ...beneathSandsPendingPhysicalCards(effect.effects ?? []),
    ...beneathSandsPendingPhysicalCards(effect.costEffects ?? []),
  ]);
}

export function beneathSandsPhysicalCards(s: GameState) {
  const q = s.beneathSands!;
  const units = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...q.setAside,
  ];
  const attachments = [
    ...units.flatMap((u) => u.attachments),
    ...Object.values(s.questAttachments ?? {}).flat(),
  ];
  assert.equal(
    new Set([...units, ...attachments].map((u) => u.id)).size,
    units.length + attachments.length,
    "each Beneath the Sands physical unit and attachment occupies exactly one zone",
  );
  // A revealed treachery's resolve branch is the canonical physical continuation.
  const choiceEffects =
    s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [];
  return {
    units,
    attachments,
    codes: [
      ...q.completedQuests,
      q.currentQuest,
      ...q.questDeck,
      ...units.map((u) => u.code),
      ...attachments.map((u) => u.code),
      ...units.flatMap((u) => u.shadows),
      ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
        (c) => c?.immediatePreviousShadows ?? [],
      ),
      ...q.resolving,
      ...beneathSandsPendingPhysicalCards(s.queue),
      ...beneathSandsPendingPhysicalCards(choiceEffects),
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...(s.victoryCards ?? []),
      ...(s.removedEncounter ?? []),
      ...seatIndices(s).flatMap((player) => {
        const view = seatView(s, player);
        return [...view.discard, ...view.removed];
      }),
    ],
  };
}

export function beneathSandsSimulationObserver() {
  const counts = {
    observations: 0,
    privacyComparisons: 0,
    trackingObservations: 0,
    offTrackObservations: 0,
    resolvingObservations: 0,
    setAsideObservations: 0,
    attachmentObservations: 0,
    shadowObservations: 0,
    advancedObservations: 0,
  };
  const signatures = new Map<number, string>();
  const observe = (s: GameState) => {
    assert.equal(s.scenarioId, "beneath-the-sands");
    const q = s.beneathSands;
    assert.ok(q, "Beneath the Sands always owns serialized scenario state");
    counts.observations++;
    assert.deepEqual(
      [...q.completedQuests, q.currentQuest, ...q.questDeck],
      BENEATH_SANDS_MAIN_QUESTS,
      "Beneath the Sands printed quests retain physical order",
    );
    assert.equal(q.currentQuest, BENEATH_SANDS_MAIN_QUESTS[s.stage - 1]);
    const recipe = BENEATH_SANDS_RECIPES.find(
      (r) => r.mode === (s.easyMode ? "easy" : "standard"),
    )!;
    assert.ok(recipe, "the game uses an original difficulty recipe");
    const original = recipe.cards
      .flatMap((c) => Array<string>(c.quantity).fill(c.code))
      .sort();
    const { codes, units, attachments } = beneathSandsPhysicalCards(s),
      encounterCodes = new Set(original);
    assert.deepEqual(
      codes.filter((code) => encounterCodes.has(code)).sort(),
      original,
      "Beneath the Sands conserves every original encounter and quest card across tracking, held searches, set-aside, removed, shadows and pending reveals",
    );
    const search = s.staging.filter((u) => u.id === q.searchId);
    assert.equal(
      search.length,
      1,
      "the physical Search objective stays in staging",
    );
    assert.equal(search[0].code, BENEATH_SANDS.search);
    assert.equal(typeof q.onTrack, "boolean");
    assert.equal(
      search[0].flipped,
      !q.onTrack,
      "the physical Search face agrees with its serialized tracking state",
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
      "Beneath the Sands conserves original player heroes through destruction and elimination",
    );
    for (const unit of units)
      assert.ok(Number.isInteger(unit.resources) && unit.resources >= 0);
    if (q.onTrack) counts.trackingObservations++;
    else counts.offTrackObservations++;
    if (q.resolving.length) counts.resolvingObservations++;
    if (q.setAside.length) counts.setAsideObservations++;
    if (attachments.some((u) => encounterCodes.has(u.code)))
      counts.attachmentObservations++;
    if (
      units.some((u) => u.shadows.length) ||
      s.combat?.immediatePreviousShadows?.length ||
      s.suspendedCombats?.some((c) => c.immediatePreviousShadows?.length)
    )
      counts.shadowObservations++;
    if (s.stage > 1) counts.advancedObservations++;
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
    swapDifferent(alternate.beneathSands!.questDeck, (x) => x);
    swapDifferent(alternate.beneathSands!.setAside, (x) => x.code);
    if (changed) {
      assert.deepEqual(
        publicState(seatView(alternate, viewer)),
        projected,
        `viewer ${viewer}: concealed encounter, quest and set-aside order is private`,
      );
      counts.privacyComparisons++;
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering leaves Beneath the Sands unchanged",
    );
  };
  return { observe, counts: () => ({ ...counts }) };
}
