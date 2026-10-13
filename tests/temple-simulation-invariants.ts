import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import { templePublicState } from "../src/game/temple";
import {
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import {
  TEMPLE,
  TEMPLE_LOST_FACES,
  TEMPLE_RECIPES,
  templeMapUnits,
  templeState,
} from "../src/game/temple-support";
import type { GameState } from "../src/game/types";

/** restoreSave groups ordinary staging cards before map neighbours by map order. */
export function assertTempleSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  const expected = structuredClone(saved);
  const q = expected.temple;
  assert.ok(q);
  const order = new Map(q.map.map((cell, index) => [cell.id, index]));
  expected.staging = [
    ...expected.staging.filter((u) => !order.has(u.id)),
    ...expected.staging
      .filter((u) => order.has(u.id))
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!),
  ];
  assert.deepEqual(
    restored,
    expected,
    "Temple restoration preserves every serialized field after documented staging canonicalization",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "the canonical restored save remains valid");
  assert.deepEqual(
    again,
    restored,
    "restoring a canonical Temple save is idempotent",
  );
}

/** Validate physical conservation and public privacy at every restored decision. */
export function templeSimulationObserver() {
  let originalMap: unknown;
  let originalCodes: unknown;
  let observations = 0;
  let privacyComparisons = 0;
  const observe = (s: GameState) => {
    observations++;
    const q = templeState(s);
    assert.ok(q, "Temple always owns its serialized map state");
    const layout = [...q.map].sort(
      (a, b) => a.row * 5 + a.column - (b.row * 5 + b.column),
    );
    if (originalMap === undefined) {
      const recipe = TEMPLE_RECIPES.find(
        (r) => r.mode === (s.easyMode ? "easy" : "standard"),
      )!;
      const mainCount = recipe.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((n, c) => n + c.quantity, 0);
      assert.equal(
        mainCount,
        s.easyMode ? 25 : 32,
        "both modes retain all four printed Deeper into the Ruins copies",
      );
      assert.equal(
        s.encounterDeck.length,
        mainCount,
        "initial encounter deck matches the corrected original recipe",
      );
      assert.equal(
        q.setAside.length,
        4,
        "only the four playable setup cards have physical Units",
      );
      originalMap = structuredClone(layout);
      originalCodes = structuredClone(q.originalCodes);
    }
    assert.deepEqual(
      layout,
      originalMap,
      "all 15 physical map positions stay fixed",
    );
    assert.deepEqual(
      q.originalCodes,
      originalCodes,
      "physical hidden backs are never exchanged",
    );
    assert.equal(layout.length, 15);
    assert.equal(new Set(layout.map((c) => c.id)).size, 15);
    assert.deepEqual(
      layout.map((c) => [c.row, c.column]),
      Array.from({ length: 15 }, (_, i) => [Math.floor(i / 5), i % 5]),
    );
    const mapUnits = templeMapUnits(s);
    const ids = new Set(layout.map((c) => c.id));
    assert.equal(mapUnits.length, 15, "all physical map cards remain in play");
    assert.deepEqual(new Set(mapUnits.map((u) => u.id)), ids);
    assert.equal(
      new Set(mapUnits.map((u) => u.id)).size,
      15,
      "map zones never duplicate a physical card",
    );
    for (const code of TEMPLE_LOST_FACES)
      assert.equal(
        Object.values(q.originalCodes).filter((c) => c === code).length,
        2,
      );
    assert.equal(
      Object.values(q.originalCodes).filter((c) => c === TEMPLE.halls).length,
      2,
    );
    assert.equal(
      Object.values(q.originalCodes).filter((c) => c === TEMPLE.grotto).length,
      1,
    );
    if (q.initialized) {
      assert.ok(q.activeId);
      assert.equal(s.activeLocation?.id, q.activeId);
      assert.ok(ids.has(q.activeId));
      assert.equal(s.extraActiveLocations?.length ?? 0, 0);
    }
    const outside = [
      ...allCharacters(s),
      ...allEngaged(s),
      ...seatIndices(s).flatMap((p) => seatView(s, p).hand),
      ...q.setAside,
      ...q.victoryEnemies,
      ...q.removedUnits,
    ];
    assert.ok(
      outside.every((u) => !ids.has(u.id)),
      "map cards cannot become hands, characters, enemies, set-aside cards or victory cards",
    );
    const mapCodes = new Set([
      ...Object.values(q.originalCodes),
      TEMPLE.lost,
      TEMPLE.temple,
    ]);
    assert.ok(
      [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...(s.victoryCards ?? []),
        ...allEngaged(s).flatMap((u) => u.shadows),
      ].every((c) => !mapCodes.has(c)),
      "map locations never enter the encounter deck, discard, victory display or shadow slots",
    );
    const hidden = mapUnits.filter(
      (u) => u.code === TEMPLE.lost || u.code === TEMPLE.temple,
    );
    assert.deepEqual(
      new Set(Object.keys(q.hiddenBacks)),
      new Set(hidden.map((u) => u.id)),
    );
    for (const u of mapUnits) {
      const original = q.originalCodes[u.id];
      if (u.code === TEMPLE.lost || u.code === TEMPLE.temple)
        assert.equal(q.hiddenBacks[u.id], original);
      else {
        assert.equal(u.code, original);
        assert.equal(q.hiddenBacks[u.id], undefined);
        assert.equal(q.lookedBy[u.id], undefined);
      }
    }
    const before = JSON.stringify(s);
    for (const viewer of seatIndices(s)) {
      const projected = publicState(seatView(s, viewer));
      const mapProjection = templePublicState(seatView(s, viewer))!;
      assert.ok(
        Object.hasOwn(projected, "temple"),
        "public projection includes the map without exposing private storage",
      );
      assert.ok(!JSON.stringify(projected).includes('"originalCodes"'));
      assert.ok(!JSON.stringify(projected).includes('"hiddenBacks"'));
      assert.deepEqual(
        Reflect.get(projected, "temple"),
        mapProjection,
        "the complete public projection uses the same permitted map view",
      );
      for (const u of hidden) {
        const cell = mapProjection.cells.find((c) => c.id === u.id)!;
        assert.equal(
          cell.code,
          u.code,
          "a public Uncharted face retains its shared front identity",
        );
        if (q.lookedBy[u.id]?.includes(viewer))
          assert.equal(cell.looked?.code, q.hiddenBacks[u.id]);
        else
          assert.equal(
            cell.looked,
            undefined,
            "an unauthorized viewer never sees the hidden back",
          );
      }
      const unseen = hidden.filter(
        (u) => u.id !== q.activeId && !q.lookedBy[u.id]?.includes(viewer),
      );
      const first = unseen.find((u) =>
        unseen.some(
          (other) =>
            other.id !== u.id &&
            other.code === u.code &&
            q.hiddenBacks[other.id] !== q.hiddenBacks[u.id],
        ),
      );
      const second =
        first &&
        unseen.find(
          (u) =>
            u.id !== first.id &&
            u.code === first.code &&
            q.hiddenBacks[u.id] !== q.hiddenBacks[first.id],
        );
      if (first && second) {
        const alternate = structuredClone(s);
        const other = alternate.temple!;
        [other.hiddenBacks[first.id], other.hiddenBacks[second.id]] = [
          other.hiddenBacks[second.id],
          other.hiddenBacks[first.id],
        ];
        [other.originalCodes[first.id], other.originalCodes[second.id]] = [
          other.originalCodes[second.id],
          other.originalCodes[first.id],
        ];
        assert.deepEqual(
          publicState(seatView(alternate, viewer)),
          projected,
          `viewer ${viewer}: exchanging two unseen backs cannot change the public map, choices or reviews`,
        );
        privacyComparisons++;
      }
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "rendering public views never mutates the saved game",
    );
  };
  return {
    observe,
    counts: () => ({ observations, privacyComparisons }),
  };
}
