import test from "node:test";
import assert from "node:assert/strict";
import { runGreyHavensGame } from "./grey-havens-simulation-driver";
import { templeSimulationObserver } from "./temple-simulation-invariants";

const scenario = "temple-of-the-deceived";
const seed = 11;

for (const easy of [false, true])
  test(`Temple of the Deceived ${easy ? "easy" : "normal"}: every review mode preserves complete 1–4 player games with restoration after every action`, (t) => {
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0;
    let comparisons = 0;
    let restoredDecisions = 0;
    let privacyComparisons = 0;
    for (const players of [1, 2, 3, 4]) {
      const baselineObserver = templeSimulationObserver();
      const immediate = runGreyHavensGame(
        scenario,
        easy,
        players,
        seed,
        undefined,
        baselineObserver.observe,
      );
      restoredDecisions += baselineObserver.counts().observations;
      privacyComparisons += baselineObserver.counts().privacyComparisons;
      games++;
      outcomes[immediate.state.status as "won" | "lost"]++;
      for (const entry of immediate.observed) observed.add(entry);
      for (const review of ["all", "hidden", "decisions"] as const) {
        const pacedObserver = templeSimulationObserver();
        const result = runGreyHavensGame(
          scenario,
          easy,
          players,
          seed,
          review,
          pacedObserver.observe,
        );
        restoredDecisions += pacedObserver.counts().observations;
        privacyComparisons += pacedObserver.counts().privacyComparisons;
        games++;
        for (const entry of result.observed) observed.add(entry);
        const { flow, ...paced } = result.state;
        assert.deepEqual(
          paced,
          immediate.state,
          `${players} players / ${review}: paced map, physical cards, resources, RNG and result match the immediate game`,
        );
        assert.equal(flow!.mode, review);
        assert.equal(flow!.pending, null);
        comparisons++;
      }
    }
    assert.equal(games, 16, "four players × four review modes complete");
    assert.equal(comparisons, 12, "all three paced modes match each baseline");
    assert.ok(
      privacyComparisons > 0,
      "unseen hidden backs never change public projections",
    );
    assert.ok(
      observed.has("action:DEFEND"),
      "complete games include real enemy attacks",
    );
    t.diagnostic(
      JSON.stringify({
        seed,
        games,
        comparisons,
        outcomes,
        decisions: observed.size,
        restoredDecisions,
        privacyComparisons,
      }),
    );
  });
