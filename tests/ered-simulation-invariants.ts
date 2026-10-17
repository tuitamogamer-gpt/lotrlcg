import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { eredScenarioUnits } from "../src/game/ered-scenario-state";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import { WITHERED_HEATH_RECIPES } from "../src/game/withered-heath-support";
import {
  ROAM_RHOVANION as R,
  ROAM_RHOVANION_RECIPES,
} from "../src/game/roam-rhovanion-support";
import { FIRE_NIGHT_RECIPES } from "../src/game/fire-night-support";
import { GHOST_FRAMSBURG_RECIPES } from "../src/game/ghost-framsburg-support";
import { isEredScenario } from "./ered-simulation-policy";
import type { Effect, GameState } from "../src/game/types";

export function assertEredSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Ered save restoration preserves exact rules and presentation state",
  );
}
export function assertEredPublicRenderPure(s: GameState) {
  const before = JSON.stringify(s);
  publicState(s);
  assert.equal(
    JSON.stringify(s),
    before,
    "public rendering does not mutate live Ered state",
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
export function eredRecipe(s: GameState) {
  const recipes = s.witheredHeath
    ? WITHERED_HEATH_RECIPES
    : s.roamRhovanion
      ? ROAM_RHOVANION_RECIPES
      : s.fireNight
        ? FIRE_NIGHT_RECIPES
        : GHOST_FRAMSBURG_RECIPES;
  return recipes.find((r) => r.mode === (s.easyMode ? "easy" : "standard"))!;
}
const physicalCode = (code: string) =>
  code === R.urdugEnemy ? R.urdug : code === R.tinyEnemy ? R.tiny : code;
export function eredPhysicalCards(s: GameState) {
  const units = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...seatIndices(s).flatMap((p) => seatView(s, p).hand),
    ...eredScenarioUnits(s),
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
    "every physical Ered unit and attachment occupies one zone",
  );
  const q = s.witheredHeath ?? s.roamRhovanion ?? s.ghostFramsburg;
  const questCodes = q
    ? [...q.completedQuests, q.currentQuest, ...q.questDeck]
    : [s.fireNight!.currentQuest];
  const codes = [
    ...questCodes,
    ...units.map((u) => u.code),
    ...attachments.map((a) => a.code),
    ...units.flatMap((u) => u.shadows),
    ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
      (c) => c?.immediatePreviousShadows ?? [],
    ),
    ...(s.witheredHeath?.peeked ?? []),
    ...(s.roamRhovanion?.keyPeek ?? []),
    ...(s.roamRhovanion?.resolving ?? []),
    ...(s.fireNight?.resolving ?? []),
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
  ].map(physicalCode);
  return { units, attachments, codes };
}

/** Expensive conservation/privacy checks run once at each phase, seat, stage or terminal boundary. */
export function eredSimulationObserver() {
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
    assert.ok(isEredScenario(s.scenarioId));
    const boundary = `${s.round}/${s.phase}/${s.table?.active ?? 0}/${s.stage}/${s.status}`;
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
    assertEredPublicRenderPure(s);
    counts.renderPurityChecks++;
    const recipe = eredRecipe(s);
    assert.ok(recipe, "original Ered recipe exists");
    const original = recipe.cards
      .flatMap((r) => Array<string>(r.quantity).fill(r.code))
      .map(physicalCode)
      .sort();
    const sourceCodes = new Set(original);
    const { units, codes } = eredPhysicalCards(s);
    assert.deepEqual(
      codes.filter((c) => sourceCodes.has(c)).sort(),
      original,
      `${s.scenarioId}: exact original encounter and quest quantities across physical zones`,
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
      "original physical heroes survive play, destruction and elimination in exactly one zone",
    );
    assert.ok(
      units.every((u) => Number.isInteger(u.resources) && u.resources >= 0),
    );
    counts.physicalChecks++;

    const before = JSON.stringify(s);
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
    if (alternate.witheredHeath) {
      swap(alternate.witheredHeath.questDeck, (x) => x);
      swap(alternate.witheredHeath.cavesDeck, (x) => x.code);
    }
    if (alternate.roamRhovanion) {
      swap(alternate.roamRhovanion.questDeck, (x) => x);
      for (const held of alternate.roamRhovanion.storedCards)
        swap(held.cards, (x) => x.code);
    }
    if (alternate.fireNight) swap(alternate.fireNight.sideDeck, (x) => x.code);
    if (alternate.ghostFramsburg)
      swap(alternate.ghostFramsburg.questDeck, (x) => x);
    for (const viewer of seatIndices(s)) {
      const projected = publicState(seatView(s, viewer));
      counts.playerViews++;
      if (changed) {
        assert.deepEqual(
          publicState(seatView(alternate, viewer)),
          projected,
          `player ${viewer}: concealed encounter, player, quest, side and Caves deck orders stay private`,
        );
        counts.privacyComparisons++;
      }
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public projection of every player leaves state unchanged",
    );
  };
  return { observe, counts: () => ({ ...counts }) };
}
