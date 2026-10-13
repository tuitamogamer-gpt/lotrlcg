import test from "node:test";
import assert from "node:assert/strict";
import { runGreyHavensGame } from "./grey-havens-simulation-driver";
import { cobasSimulationObserver } from "./cobas-simulation-invariants";

const requestedPlayers = process.env.COBAS_SIMULATION_PLAYERS;
if (requestedPlayers !== undefined)
  assert.match(
    requestedPlayers,
    /^[1-4](,[1-4])*$/,
    "COBAS_SIMULATION_PLAYERS must be a comma-separated list of 1–4",
  );
const playerCounts = requestedPlayers
  ? requestedPlayers.split(",").map(Number)
  : [1, 2, 3, 4];
assert.equal(
  new Set(playerCounts).size,
  playerCounts.length,
  "COBAS_SIMULATION_PLAYERS must not repeat a player count",
);
const scope = requestedPlayers
  ? `player-count subset [${playerCounts.join(",")}]`
  : "1–4 player games";

for (const easy of [false, true])
  test(`A Storm on Cobas Haven ${easy ? "easy" : "normal"}: every review mode preserves complete ${scope} with restoration after every action`, (t) => {
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0;
    let comparisons = 0;
    let restoredDecisions = 0;
    let privacyComparisons = 0;
    for (const players of playerCounts) {
      const baseline = cobasSimulationObserver();
      const immediate = runGreyHavensGame(
        "a-storm-on-cobas-haven",
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
        const observer = cobasSimulationObserver();
        const result = runGreyHavensGame(
          "a-storm-on-cobas-haven",
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
          `${players} players / ${review}: physical fleets, guards, resources, RNG and result match the immediate game`,
        );
        assert.equal(flow!.mode, review);
        assert.equal(flow!.pending, null);
        comparisons++;
      }
    }
    assert.equal(games, playerCounts.length * 4);
    assert.equal(comparisons, playerCounts.length * 3);
    assert.ok(
      privacyComparisons > 0,
      "private Corsair and encounter deck order remains concealed",
    );
    assert.ok(
      observed.has("action:RESOLVE_SAILING"),
      "complete games exercise actual Sailing tests",
    );
    assert.ok(
      observed.has("action:DEFEND"),
      "complete games include real enemy attacks",
    );
    t.diagnostic(
      JSON.stringify({
        seed: 11,
        playerCounts,
        subset: requestedPlayers !== undefined,
        games,
        comparisons,
        outcomes,
        decisions: observed.size,
        restoredDecisions,
        privacyComparisons,
      }),
    );
  });
