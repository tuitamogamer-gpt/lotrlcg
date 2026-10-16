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
import { BLACK_SERPENT_RECIPES } from "../src/game/black-serpent-support";
import { CIRITH_GURAT_RECIPES } from "../src/game/cirith-gurat-support";
import { CROSSINGS_POROS_RECIPES } from "../src/game/crossings-poros-support";
import {
  WILDS_RHOVANION as W,
  WILDS_RHOVANION_RECIPES,
} from "../src/game/wilds-rhovanion-support";
import { isBatch4Scenario } from "./batch4-simulation-policy";
import type { Effect, GameState } from "../src/game/types";
export function assertBatch4SaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Batch 4 restoration preserves all physical cards, resources, quest branches, pending choices and combat continuations",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again);
  assert.deepEqual(again, restored, "Batch 4 restoration is idempotent");
}
export function batch4PendingPhysicalCards(effects: Effect[]): string[] {
  return effects.flatMap((e) => [
    ...(["resolveReveal", "placeEncounter"].includes(e.kind) && e.code
      ? [e.code]
      : []),
    ...batch4PendingPhysicalCards(e.effects ?? []),
    ...batch4PendingPhysicalCards(e.costEffects ?? []),
  ]);
}
export const batch4State = (s: GameState) =>
  s.blackSerpent ?? s.cirithGurat ?? s.crossingsPoros ?? s.wildsRhovanion;
export function batch4Recipe(s: GameState) {
  const recipes = s.blackSerpent
    ? BLACK_SERPENT_RECIPES
    : s.cirithGurat
      ? CIRITH_GURAT_RECIPES
      : s.crossingsPoros
        ? CROSSINGS_POROS_RECIPES
        : WILDS_RHOVANION_RECIPES;
  const wilds =
    s.scenarioId === "journey-up-the-anduin"
      ? "08.1"
      : s.scenarioId === "lost-in-mirkwood"
        ? "08.2"
        : "08.3";
  return recipes.find(
    (r) =>
      r.mode === (s.easyMode ? "easy" : "standard") &&
      (!s.wildsRhovanion || r.id === (s.easyMode ? "E" : "Q") + wilds),
  )!;
}
export function batch4PhysicalCards(s: GameState) {
  const q = batch4State(s)!;
  const wild = s.wildsRhovanion;
  const held = [
    ...q.setAside,
    ...(s.resolvingEvents
      ?.filter((e) => e.destination !== "spent")
      .map((e) => e.unit) ?? []),
    ...(s.pendingPlayerPlays?.map((e) => e.unit) ?? []),
    ...(s.crossingsPoros?.removed ?? []),
    ...(s.cirithGurat?.captives ?? []),
    ...(wild?.cavesDeck ?? []),
    ...(wild?.removed ?? []),
    ...(wild?.storedCards.flatMap((e) => e.cards) ?? []),
    ...(wild?.guardedHeroes.map((e) => e.hero) ?? []),
    ...(wild?.guardedPlayerCards.map((e) => e.card) ?? []),
  ];
  const units = [
    ...allCharacters(s),
    ...seatIndices(s).flatMap((p) => seatView(s, p).hand),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...held,
  ];
  const attachments = [
    ...units.flatMap((u) => u.attachments),
    ...Object.values(s.questAttachments ?? {}).flat(),
  ];
  assert.equal(
    new Set([...units, ...attachments].map((u) => u.id)).size,
    units.length + attachments.length,
    "each Batch 4 physical unit and attachment occupies exactly one zone",
  );
  for (const e of s.resolvingEvents ?? []) {
    if (e.destination !== "spent") continue;
    assert.ok(
      units.filter((u) => u.id === e.unit.id).length === 1 ||
        (e.unit.code === "12119" && s.victoryCards?.includes("12119")),
      "spent event metadata retains exactly one physical destination",
    );
  }
  const choice =
    s.choice?.options.find((o) => o.id === "resolve")?.effects ?? [];
  const codes = [
    ...q.completedQuests,
    q.currentQuest,
    ...q.questDeck,
    ...(s.crossingsPoros?.setAsideQuests ?? []),
    ...(s.crossingsPoros?.removedQuests ?? []),
    ...units.map((u) => u.code),
    ...attachments.map((a) => a.code),
    ...units.flatMap((u) => u.shadows),
    ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
      (c) => c?.immediatePreviousShadows ?? [],
    ),
    ...(wild?.resolving ?? []),
    ...(wild?.evilDeck ?? []),
    ...(wild?.evilDiscard ?? []),
    ...batch4PendingPhysicalCards(s.queue),
    ...batch4PendingPhysicalCards(choice),
    ...s.encounterDeck,
    ...s.encounterDiscard,
    ...(s.victoryCards ?? []),
    ...(s.removedEncounter ?? []),
    ...seatIndices(s).flatMap((p) => {
      const v = seatView(s, p);
      return [...v.discard, ...v.removed];
    }),
  ];
  return {
    units,
    attachments,
    codes: codes.map((c) => (c === W.haldan ? W.village : c)),
  };
}
export function batch4SimulationObserver() {
  const counts = {
    observations: 0,
    privacyComparisons: 0,
    resolvingObservations: 0,
    setAsideObservations: 0,
    attachmentObservations: 0,
    shadowObservations: 0,
    advancedObservations: 0,
    guardedObservations: 0,
    secondaryDeckObservations: 0,
  };
  const signatures = new Map<number, string>();
  const observe = (s: GameState) => {
    assert.ok(isBatch4Scenario(s.scenarioId));
    const q = batch4State(s);
    assert.ok(q, "Batch 4 always owns serialized scenario state");
    counts.observations++;
    if (s.round > 0)
      assert.ok(q.initialized, "scenario setup finishes before normal phases");
    const recipe = batch4Recipe(s);
    assert.ok(recipe, "original standard or easy recipe exists");
    const original = recipe.cards
      .flatMap((r) => Array<string>(r.quantity).fill(r.code))
      .sort();
    const { units, attachments, codes } = batch4PhysicalCards(s),
      encounterCodes = new Set(original);
    assert.deepEqual(
      codes.filter((c) => encounterCodes.has(c)).sort(),
      original,
      `${s.scenarioId}: conserves every original encounter and quest card across all physical zones and pending reveals`,
    );
    const originalHeroes = seatIndices(s)
        .flatMap((p) => seatView(s, p).startingHeroes)
        .sort(),
      heroCodes = new Set(originalHeroes);
    assert.deepEqual(
      codes
        .filter((c) => heroCodes.has(c) && card(c).type_code === "hero")
        .sort(),
      originalHeroes,
      "Batch 4 conserves original heroes through capture, guarded objectives, destruction and elimination",
    );
    for (const u of units)
      assert.ok(Number.isInteger(u.resources) && u.resources >= 0);
    if (q.setAside.length) counts.setAsideObservations++;
    if (attachments.some((a) => encounterCodes.has(a.code)))
      counts.attachmentObservations++;
    if (s.wildsRhovanion?.resolving.length) counts.resolvingObservations++;
    if (
      units.some((u) => u.shadows.length) ||
      s.combat?.immediatePreviousShadows?.length ||
      s.suspendedCombats?.some((c) => c.immediatePreviousShadows?.length)
    )
      counts.shadowObservations++;
    if (s.stage > 1) counts.advancedObservations++;
    if (
      s.cirithGurat?.captives.length ||
      s.wildsRhovanion?.guardedHeroes.length ||
      s.wildsRhovanion?.guardedPlayerCards.length
    )
      counts.guardedObservations++;
    if (s.wildsRhovanion?.evilDeck.length || s.wildsRhovanion?.cavesDeck.length)
      counts.secondaryDeckObservations++;
    const viewer =
        seatIndices(s)[(counts.observations - 1) % seatIndices(s).length],
      signature = JSON.stringify({
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
    const swap = <T>(pile: T[], key: (x: T) => string) => {
      const i = pile.findIndex((x) => key(x) !== key(pile[0]));
      if (i > 0) {
        [pile[0], pile[i]] = [pile[i], pile[0]];
        changed = true;
      }
    };
    swap(alternate.encounterDeck, (x) => x);
    const alt = batch4State(alternate)!;
    swap(alt.questDeck, (x) => x);
    swap(alt.setAside, (x) => x.code);
    if (alternate.wildsRhovanion) {
      swap(alternate.wildsRhovanion.evilDeck, (x) => x);
      swap(alternate.wildsRhovanion.cavesDeck, (x) => x.code);
      for (const held of alternate.wildsRhovanion.storedCards)
        swap(held.cards, (x) => x.code);
    }
    if (changed) {
      assert.deepEqual(
        publicState(seatView(alternate, viewer)),
        projected,
        `viewer ${viewer}: concealed encounter, quest, set aside, Evil Creatures, Caves and stored card orders are private`,
      );
      counts.privacyComparisons++;
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering leaves Batch 4 state unchanged",
    );
  };
  return { observe, counts: () => ({ ...counts }) };
}
