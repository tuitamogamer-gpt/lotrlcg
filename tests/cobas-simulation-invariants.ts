import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  COBAS,
  COBAS_CORSAIRS,
  COBAS_MAIN_QUESTS,
  COBAS_OBJECTIVES,
  COBAS_RECIPES,
  cobasGuardIds,
} from "../src/game/cobas-support";
import {
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import type { GameState } from "../src/game/types";

export function assertCobasSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Cobas restoration preserves every serialized physical card, guard, fleet and pending choice",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "the restored Cobas save remains valid");
  assert.deepEqual(again, restored, "Cobas restoration is idempotent");
}

/** Independent physical-zone and hidden-information assertions, on every action. */
export function cobasSimulationObserver() {
  let initialCorsairs: string[] | undefined;
  let observations = 0;
  let privacyComparisons = 0;
  let guardObservations = 0;
  let conversions = 0;
  const privacySignatures = new Map<number, string>();
  const observe = (s: GameState) => {
    observations++;
    const q = s.cobas;
    assert.ok(q, "Cobas always owns serialized scenario state");
    assert.deepEqual(
      [...q.completedQuests, q.currentQuest, ...q.questDeck],
      COBAS_MAIN_QUESTS,
    );
    assert.equal(q.currentQuest, COBAS_MAIN_QUESTS[s.stage - 1]);
    const active = [
      ...allCharacters(s),
      ...allEngaged(s),
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ];
    const physical = [
      ...active,
      ...q.setAside,
      ...q.capturePending,
      ...q.belfalas.map((x) => x.enemy),
    ];
    assert.equal(
      new Set(physical.map((u) => u.id)).size,
      physical.length,
      "each physical card occupies exactly one zone",
    );
    const corsairs = [
      ...q.corsairDeck,
      ...q.corsairDiscard,
      ...physical.map((u) => u.code),
    ]
      .filter((code) => COBAS_CORSAIRS.includes(code))
      .sort();
    initialCorsairs ??= COBAS_RECIPES.find(
      (r) => r.mode === (s.easyMode ? "easy" : "standard"),
    )!
      .cards.filter((c) => c.section === "sharedEncounterDeck2")
      .flatMap((c) => Array<string>(c.quantity).fill(c.code))
      .sort();
    assert.deepEqual(
      corsairs,
      initialCorsairs,
      "Boarding, destruction, reshuffling and elimination preserve every Corsair",
    );
    assert.ok(
      [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...physical.flatMap((u) => u.shadows),
      ].every((code) => !COBAS_CORSAIRS.includes(code)),
      "Corsairs never leak into encounter deck, discard or shadows",
    );
    const warships = [
      ...physical.map((u) => u.code),
      ...physical.flatMap((u) => u.shadows),
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...(s.sailing?.test?.looked ?? []),
      ...(s.victoryCards ?? []),
      ...seatIndices(s).flatMap((player) => {
        const seat = seatView(s, player);
        return [
          ...seat.deck,
          ...seat.discard,
          ...seat.removed,
          ...seat.hand.map((u) => u.code),
        ];
      }),
    ].filter((code) => code === COBAS.warship);
    assert.equal(
      warships.length,
      2,
      "both printed Warships are conserved across fleet, set aside, deck, discard and removed zones",
    );
    const guards = active.flatMap((u) =>
      cobasGuardIds(u).map((objectiveId) => ({ unit: u, objectiveId })),
    );
    assert.equal(
      new Set(guards.map((g) => g.objectiveId)).size,
      guards.length,
      "each objective has at most one guarding encounter",
    );
    for (const guard of guards) {
      assert.ok(
        active.some(
          (u) =>
            u.id === guard.objectiveId && COBAS_OBJECTIVES.includes(u.code),
        ),
        "a guard points at a real Dol Amroth objective",
      );
      assert.ok(
        ["ship-enemy", "location", "enemy"].includes(
          card(guard.unit.code).type_code,
        ),
      );
      guardObservations++;
    }
    assert.equal(new Set(q.pendingGuarded).size, q.pendingGuarded.length);
    for (const id of q.pendingGuarded)
      assert.ok(
        active.some((u) => u.id === id && COBAS_OBJECTIVES.includes(u.code)),
        "pending Guarded resolution retains its physical objective",
      );
    for (const held of q.belfalas) {
      assert.equal(card(held.enemy.code).type_code, "ship-enemy");
      assert.ok(
        cobasGuardIds(held.enemy).length === 0,
        "Belfalas cannot remove a guarding enemy",
      );
    }
    for (const converted of physical.filter((u) => u.cobasShipObjective)) {
      assert.equal(
        converted.code,
        COBAS.skirmisher,
        "conversion keeps the original physical Skirmisher artwork/code",
      );
      assert.ok(allCharacters(s).some((u) => u.id === converted.id));
      conversions++;
    }
    // Rotate viewers, and recheck each viewer whenever deck order or a public
    // decision/zone transition changes. Repeated quest toggles with identical
    // privacy inputs retain the physical/save checks without recomputing an
    // identical projection of hundreds of legal card actions.
    const viewers = seatIndices(s);
    const viewer = viewers[(observations - 1) % viewers.length];
    const privacySignature = JSON.stringify({
      corsairs: q.corsairDeck,
      encounter: s.encounterDeck,
      quests: q.questDeck,
      pendingGuarded: q.pendingGuarded,
      phase: s.phase,
      round: s.round,
      status: s.status,
      peek: s.peek,
      sailing: s.sailing,
      pending: s.flow?.pending?.id,
      choice: s.choice && {
        title: s.choice.title,
        options: s.choice.options.map((o) => [o.id, o.code]),
      },
      characters: allCharacters(s).map((u) => [
        u.id,
        u.code,
        u.cobasShipObjective,
      ]),
      engaged: allEngaged(s).map((u) => [u.id, u.code, cobasGuardIds(u)]),
      staging: s.staging.map((u) => [u.id, u.code, cobasGuardIds(u)]),
      active: [s.activeLocation, ...(s.extraActiveLocations ?? [])]
        .filter(Boolean)
        .map((u) => [u!.id, u!.code, cobasGuardIds(u!)]),
      belfalas: q.belfalas.map((x) => [x.locationId, x.enemy.id]),
    });
    if (privacySignatures.get(viewer) === privacySignature) return;
    privacySignatures.set(viewer, privacySignature);
    const before = JSON.stringify(s);
    const projected = publicState(seatView(s, viewer));
    assert.ok(Object.hasOwn(projected, "cobas"));
    const alternate = structuredClone(s);
    let changed = false;
    for (const pile of [
      alternate.cobas!.corsairDeck,
      alternate.encounterDeck,
      alternate.cobas!.questDeck,
    ]) {
      const other = pile.findIndex((code) => code !== pile[0]);
      if (other > 0) {
        [pile[0], pile[other]] = [pile[other], pile[0]];
        changed = true;
      }
    }
    if (changed) {
      assert.deepEqual(
        publicState(seatView(alternate, viewer)),
        projected,
        `viewer ${viewer}: changing unrevealed encounter, Corsair or future quest order cannot change public state`,
      );
      privacyComparisons++;
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering never mutates the adventure",
    );
  };
  return {
    observe,
    counts: () => ({
      observations,
      privacyComparisons,
      guardObservations,
      conversions,
    }),
  };
}
