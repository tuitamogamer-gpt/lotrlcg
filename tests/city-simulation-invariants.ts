import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  CITY_CORSAIRS,
  CITY_MAIN_QUESTS,
  CITY_RECIPES,
} from "../src/game/city-support";
import {
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import type { GameState } from "../src/game/types";

export function assertCitySaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "City restoration preserves physical ships, both encounter decks, Raider resources and pending decisions",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "a restored City save remains valid");
  assert.deepEqual(again, restored, "City restoration is idempotent");
}

/** Every action is checked independently of the scenario's rule handlers. */
export function citySimulationObserver() {
  let observations = 0;
  let privacyComparisons = 0;
  let landObservations = 0;
  let resourceObservations = 0;
  const privacySignatures = new Map<number, string>();
  const observe = (s: GameState) => {
    observations++;
    const q = s.city;
    assert.ok(q, "City always owns serialized scenario state");
    assert.deepEqual(
      [...q.completedQuests, q.currentQuest, ...q.questDeck],
      CITY_MAIN_QUESTS,
      "the four printed quests keep their physical order through the sea-to-land transition",
    );
    assert.equal(q.currentQuest, CITY_MAIN_QUESTS[s.stage - 1]);
    const active = [
      ...allCharacters(s),
      ...allEngaged(s),
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ];
    const physical = [...active, ...q.setAside];
    assert.equal(
      new Set(physical.map((u) => u.id)).size,
      physical.length,
      "each physical unit occupies exactly one active or set-aside zone",
    );
    const codes = [
      ...physical.map((u) => u.code),
      ...physical.flatMap((u) => u.shadows),
      ...[s.combat, ...(s.suspendedCombats ?? [])].flatMap(
        (combat) => combat?.immediatePreviousShadows ?? [],
      ),
      // A reviewed reveal has left the encounter deck but has not entered
      // play. These effects own that card; review/history references do not.
      ...s.queue.flatMap((effect) =>
        ["resolveReveal", "placeEncounter"].includes(effect.kind) && effect.code
          ? [effect.code]
          : [],
      ),
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...q.corsairDeck,
      ...q.corsairDiscard,
      ...q.secondDeck,
      ...q.inactiveDeck,
      ...q.inactiveDiscard,
      ...(s.sailing?.test?.looked ?? []),
      ...(s.victoryCards ?? []),
    ];
    const originalCorsairs = CITY_RECIPES.find(
      (r) => r.mode === (s.easyMode ? "easy" : "standard"),
    )!
      .cards.filter((c) => CITY_CORSAIRS.includes(c.code))
      .flatMap((c) => Array<string>(c.quantity).fill(c.code))
      .sort();
    assert.deepEqual(
      codes.filter((code) => CITY_CORSAIRS.includes(code)).sort(),
      originalCorsairs,
      "Boarding, destruction and the encounter-deck transition conserve every original Corsair",
    );
    for (const u of active) {
      assert.ok(Number.isInteger(u.resources) && u.resources >= 0);
      if (/(^|\W)Raider\./.test(card(u.code).traits ?? ""))
        resourceObservations++;
    }
    if (s.stage >= 3) {
      assert.equal(q.secondDeck.length, 0, "the land deck has become active");
      assert.equal(
        q.corsairDeck.length,
        0,
        "Corsairs join the land encounter deck",
      );
      assert.equal(q.corsairDiscard.length, 0);
      assert.ok(
        !active.some((u) =>
          ["ship-enemy", "ship-objective"].includes(card(u.code).type_code),
        ),
        "land stages retain no active Ship enemies or objectives",
      );
      assert.ok(!s.sailing, "Sailing ends with the sea stages");
      landObservations++;
    }
    const viewers = seatIndices(s);
    const viewer = viewers[(observations - 1) % viewers.length];
    const signature = JSON.stringify({
      city: q,
      encounter: s.encounterDeck,
      phase: s.phase,
      stage: s.stage,
      round: s.round,
      status: s.status,
      peek: s.peek,
      sailing: s.sailing,
      pending: s.flow?.pending?.id,
      choice: s.choice && { title: s.choice.title, options: s.choice.options },
      active: active.map((u) => [u.id, u.code, u.resources]),
    });
    if (privacySignatures.get(viewer) === signature) return;
    privacySignatures.set(viewer, signature);
    const before = JSON.stringify(s);
    const projected = publicState(seatView(s, viewer));
    assert.ok(Object.hasOwn(projected, "city"));
    const alternate = structuredClone(s);
    let changed = false;
    for (const pile of [
      alternate.city!.corsairDeck,
      alternate.city!.secondDeck,
      alternate.city!.inactiveDeck,
      alternate.city!.inactiveDiscard,
      alternate.city!.questDeck,
      alternate.encounterDeck,
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
        `viewer ${viewer}: unrevealed sea, land, Corsair and quest order cannot change public state`,
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
      landObservations,
      resourceObservations,
    }),
  };
}
