import test from "node:test";
import assert from "node:assert/strict";
import { runGreyHavensGame } from "./grey-havens-simulation-driver";
import { drownedSimulationObserver } from "./drowned-simulation-invariants";

for (const easy of [false, true])
  test(`The Drowned Ruins ${easy ? "easy" : "normal"}: every review mode preserves complete 1–4 player games with restoration after every action`, (t) => {
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0;
    let comparisons = 0;
    let restoredDecisions = 0;
    let privacyComparisons = 0;
    for (const players of [1, 2, 3, 4]) {
      const baseline = drownedSimulationObserver();
      const immediate = runGreyHavensGame(
        "the-drowned-ruins",
        easy,
        players,
        11,
        undefined,
        baseline.observe,
      );
      restoredDecisions += baseline.counts().observations;
      privacyComparisons += baseline.counts().privacyComparisons;
      games++;
      outcomes[immediate.state.status as "won" | "lost"]++;
      for (const entry of immediate.observed) observed.add(entry);
      for (const review of ["all", "hidden", "decisions"] as const) {
        const observer = drownedSimulationObserver();
        const result = runGreyHavensGame(
          "the-drowned-ruins",
          easy,
          players,
          11,
          review,
          observer.observe,
        );
        restoredDecisions += observer.counts().observations;
        privacyComparisons += observer.counts().privacyComparisons;
        games++;
        for (const entry of result.observed) observed.add(entry);
        const { flow, ...paced } = result.state;
        assert.deepEqual(
          paced,
          immediate.state,
          `${players} players / ${review}: physical locations, resources, RNG and result match the immediate game`,
        );
        assert.equal(flow!.mode, review);
        assert.equal(flow!.pending, null);
        comparisons++;
      }
    }
    assert.equal(games, 16);
    assert.equal(comparisons, 12);
    assert.ok(
      privacyComparisons > 0,
      "opaque Grotto fronts conceal their physical reverse pairings",
    );
    assert.ok(
      observed.has("action:TRAVEL"),
      "complete games exercise actual travel",
    );
    assert.ok(
      observed.has("action:DEFEND"),
      "complete games include real enemy attacks",
    );
    t.diagnostic(
      JSON.stringify({
        seed: 11,
        games,
        comparisons,
        outcomes,
        decisions: observed.size,
        restoredDecisions,
        privacyComparisons,
      }),
    );
  });
