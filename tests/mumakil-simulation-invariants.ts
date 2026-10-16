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
  MUMAKIL,
  MUMAKIL_MAIN_QUESTS,
  MUMAKIL_RECIPES,
} from "../src/game/mumakil-support";
import { MORDOR } from "../src/game/long-arm-mordor-support";
import type { Effect, GameState } from "../src/game/types";

export function assertMumakilSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Mûmakil restoration preserves physical captures, objectives, round markers and pending decisions",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "a restored Mûmakil save remains valid");
  assert.deepEqual(again, restored, "Mûmakil restoration is idempotent");
}

/** Only active continuations own cards. Cancellation alternatives and review
 * history refer to that same physical copy and must not create duplicates. */
export function mumakilPendingPhysicalCards(effects: Effect[]): string[] {
  return effects.flatMap((e) => {
    if (["resolveReveal", "placeEncounter"].includes(e.kind) && e.code)
      return [e.code];
    const own = e.flag
      ? []
      : e.kind === "mordorOvergrown"
        ? [MORDOR.overgrown]
        : e.kind === "mumakilFever"
          ? [MUMAKIL.fever]
          : [];
    return [
      ...own,
      ...mumakilPendingPhysicalCards(e.effects ?? []),
      ...mumakilPendingPhysicalCards(e.costEffects ?? []),
    ];
  });
}

export function mumakilPhysicalCards(s: GameState) {
  const q = s.mumakil!;
  const units = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...q.setAside,
  ];
  const attachments = units.flatMap((u) => u.attachments);
  assert.equal(
    new Set([...units, ...attachments].map((u) => u.id)).size,
    units.length + attachments.length,
    "each Mûmakil physical unit and attachment occupies exactly one zone",
  );
  const choiceEffects =
    s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [];
  const codes = [
    ...units.map((u) => u.code),
    ...attachments.map((a) => a.code),
    ...units.flatMap((u) => u.shadows),
    ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
      (c) => c?.immediatePreviousShadows ?? [],
    ),
    ...mumakilPendingPhysicalCards(s.queue),
    ...mumakilPendingPhysicalCards(choiceEffects),
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...(s.victoryCards ?? []),
    ...(s.removedEncounter ?? []),
    ...seatIndices(s).flatMap((p) => {
      const v = seatView(s, p);
      return [...v.discard, ...v.removed];
    }),
  ];
  if (
    s.choice?.options.some((o) =>
      o.effects.some((e) => e.kind === "mordorOvergrownAttach" && !e.flag),
    )
  )
    codes.push(MORDOR.overgrown);
  if (
    s.choice?.options.some((o) =>
      o.effects.some((e) => e.kind === "mumakilFeverAttach" && !e.flag),
    )
  )
    codes.push(MUMAKIL.fever);
  return { codes, units, attachments };
}

export function mumakilSimulationObserver() {
  const counts = {
    observations: 0,
    privacyComparisons: 0,
    capturedObservations: 0,
    attachmentObservations: 0,
    advancedObservations: 0,
  };
  const signatures = new Map<number, string>();
  const observe = (s: GameState) => {
    assert.equal(s.scenarioId, "the-mumakil");
    const q = s.mumakil;
    assert.ok(q, "Mûmakil always owns serialized scenario state");
    counts.observations++;
    assert.deepEqual(
      [...q.completedQuests, q.currentQuest, ...q.questDeck],
      MUMAKIL_MAIN_QUESTS,
      "Mûmakil printed quests retain physical order",
    );
    assert.equal(q.currentQuest, MUMAKIL_MAIN_QUESTS[s.stage - 1]);
    const recipe = MUMAKIL_RECIPES.find(
      (r) => r.mode === (s.easyMode ? "easy" : "standard"),
    )!;
    const original = recipe.cards
      .filter((c) => c.section !== "sharedQuestDeck")
      .flatMap((c) => Array<string>(c.quantity).fill(c.code))
      .sort();
    const { codes, units, attachments } = mumakilPhysicalCards(s),
      encounterCodes = new Set(original);
    assert.deepEqual(
      codes.filter((code) => encounterCodes.has(code)).sort(),
      original,
      "Mûmakil conserves every original encounter card, including shared Jungle Forest, captures, pending reveals and physical attachments",
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
      "Mûmakil conserves all original player heroes through destruction and elimination",
    );
    for (const u of units)
      assert.ok(Number.isInteger(u.resources) && u.resources >= 0);
    if ((s.victoryCards ?? []).some((code) => code === MUMAKIL.wild))
      counts.capturedObservations++;
    if (attachments.some((a) => encounterCodes.has(a.code)))
      counts.attachmentObservations++;
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
    swapDifferent(alternate.mumakil!.questDeck, (x) => x);
    swapDifferent(alternate.mumakil!.setAside, (x) => x.code);
    if (changed) {
      assert.deepEqual(
        publicState(seatView(alternate, viewer)),
        projected,
        `viewer ${viewer}: concealed encounter, quest and random Capture objective order is private`,
      );
      counts.privacyComparisons++;
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering leaves the Mûmakil adventure unchanged",
    );
  };
  return { observe, counts: () => ({ ...counts }) };
}
