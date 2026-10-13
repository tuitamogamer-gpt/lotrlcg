import assert from "node:assert/strict";
import { publicState, restoreSave } from "../src/game/engine";
import {
  DROWNED,
  DROWNED_GROTTO_CODES,
  drownedFront,
} from "../src/game/drowned-support";
import {
  allCharacters,
  allEngaged,
  seatIndices,
  seatView,
} from "../src/game/table";
import type { GameState } from "../src/game/types";

export function assertDrownedSaveRestoration(
  saved: GameState,
  restored: GameState,
) {
  assert.deepEqual(
    restored,
    saved,
    "Drowned restoration preserves every serialized field",
  );
  const again = restoreSave(JSON.parse(JSON.stringify(restored)));
  assert.ok(again, "the restored Drowned save remains valid");
  assert.deepEqual(again, restored, "Drowned restoration is idempotent");
}

/** Track physical cards and prove that opaque Grotto fronts conceal their backs. */
export function drownedSimulationObserver() {
  let previous:
    | { originalCodes: Record<string, string>; recyclable: Set<string> }
    | undefined;
  let observations = 0;
  let privacyComparisons = 0;
  let reseals = 0;
  const observe = (s: GameState) => {
    observations++;
    const q = s.drowned;
    assert.ok(q, "Drowned always owns its serialized scenario state");
    assert.deepEqual(
      Object.values(q.originalCodes).sort(),
      [...DROWNED_GROTTO_CODES, DROWNED.shrine].sort(),
    );
    const physical = [
      ...q.grottoDeck,
      ...q.setAside,
      ...q.victoryLocations,
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
      ...(s.extraActiveLocations ?? []),
    ].filter((u) => q.originalCodes[u.id]);
    const ids = new Set(Object.keys(q.originalCodes));
    if (previous) {
      const removed = Object.keys(previous.originalCodes).filter(
        (id) => !ids.has(id),
      );
      const added = [...ids].filter((id) => !previous!.originalCodes[id]);
      for (const id of ids)
        if (previous.originalCodes[id])
          assert.equal(
            q.originalCodes[id],
            previous.originalCodes[id],
            "an in-play physical handle never changes its paired printed back",
          );
      if (removed.length || added.length) {
        assert.equal(
          removed.length,
          added.length,
          "resealing a shuffled Grotto pile cannot create or destroy physical cards",
        );
        assert.ok(
          removed.every((id) => previous!.recyclable.has(id)),
          "only the Grotto pile and explored generic Grotto fronts may lose their old handles",
        );
        const destinations = new Set(
          [...q.grottoDeck, ...s.staging].map((u) => u.id),
        );
        assert.ok(
          added.every((id) => destinations.has(id)),
          "new opaque handles belong only to the shuffled pile or replenished staging locations",
        );
        assert.deepEqual(
          removed.map((id) => previous!.originalCodes[id]).sort(),
          added.map((id) => q.originalCodes[id]).sort(),
          "resealing preserves every printed front/back pair and quantity",
        );
        reseals++;
      }
    }
    assert.equal(
      physical.length,
      9,
      "all eight Grotto cards and Shrine survive in exactly one physical zone",
    );
    assert.deepEqual(new Set(physical.map((u) => u.id)), ids);
    for (const u of physical) {
      const original = q.originalCodes[u.id];
      assert.ok(
        u.code === drownedFront(original) || u.code === `${original}:B`,
        "a physical location only shows its own paired face",
      );
    }
    assert.ok(
      q.grottoDeck.every((u) => u.code === drownedFront(q.originalCodes[u.id])),
    );
    assert.ok(
      q.victoryLocations.every(
        (u) =>
          (u.code.endsWith(":B") || u.code === DROWNED.shrine) &&
          s.victoryCards?.includes(u.code),
      ),
    );
    assert.equal(
      new Set(q.victoryLocations.map((u) => u.id)).size,
      q.victoryLocations.length,
    );
    const outside = [
      ...allCharacters(s),
      ...allEngaged(s),
      ...seatIndices(s).flatMap((p) => seatView(s, p).hand),
      ...q.removedUnits,
    ];
    assert.ok(
      outside.every((u) => !ids.has(u.id)),
      "Grotto locations cannot become characters, enemies, hands or removed companions",
    );
    const protectedCodes = new Set([
      ...Object.values(q.originalCodes),
      ...Object.values(q.originalCodes).map((c) => `${c}:B`),
      ...Object.values(q.originalCodes).map(drownedFront),
    ]);
    assert.ok(
      [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...allEngaged(s).flatMap((u) => u.shadows),
      ].every((c) => !protectedCodes.has(c)),
      "Grotto locations never enter encounter deck, discard or shadow slots",
    );
    const before = JSON.stringify(s);
    for (const viewer of seatIndices(s)) {
      const projected = publicState(seatView(s, viewer));
      const serialized = JSON.stringify(projected);
      assert.ok(
        Object.hasOwn(projected, "drowned"),
        "public state includes the Grotto pile and progress",
      );
      assert.ok(
        !serialized.includes('"originalCodes"'),
        "private reverse identities are absent from public state",
      );
      const hidden = physical.filter((u) => u.code.startsWith("drowned-"));
      const first = hidden.find((u) =>
        hidden.some(
          (v) =>
            v.id !== u.id &&
            v.code === u.code &&
            q.originalCodes[v.id] !== q.originalCodes[u.id],
        ),
      );
      const second =
        first &&
        hidden.find(
          (u) =>
            u.id !== first.id &&
            u.code === first.code &&
            q.originalCodes[u.id] !== q.originalCodes[first.id],
        );
      if (first && second) {
        const alternate = structuredClone(s);
        const original = alternate.drowned!.originalCodes;
        [original[first.id], original[second.id]] = [
          original[second.id],
          original[first.id],
        ];
        assert.deepEqual(
          publicState(seatView(alternate, viewer)),
          projected,
          `viewer ${viewer}: exchanging unseen paired backs cannot change public cards, choices or reviews`,
        );
        privacyComparisons++;
      }
    }
    assert.equal(
      JSON.stringify(s),
      before,
      "public rendering never mutates the adventure",
    );
    previous = {
      originalCodes: { ...q.originalCodes },
      recyclable: new Set([
        ...q.grottoDeck.map((u) => u.id),
        ...physical
          .filter((u) => u.code.startsWith("drowned-"))
          .map((u) => u.id),
      ]),
    };
  };
  return {
    observe,
    counts: () => ({ observations, privacyComparisons, reseals }),
  };
}
