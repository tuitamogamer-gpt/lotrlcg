import test from "node:test";
import assert from "node:assert/strict";
import { runEredGame } from "./ered-simulation-driver";
import { ERED_SCENARIOS } from "./ered-simulation-policy";
import { eredSimulationObserver } from "./ered-simulation-invariants";

const requestedScenario = process.env.ERED_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    ERED_SCENARIOS.some((id) => id === requestedScenario),
    "ERED_SIMULATION_SCENARIO must be one of the six original Ered Mithrin quests",
  );

// Each adventure has eight baseline games and six paced games, with six
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of ERED_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Ered ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = eredSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0;
      let immediate: ReturnType<typeof runEredGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = eredSimulationObserver();
        const result = runEredGame(
          scenario,
          easy,
          players,
          11,
          review,
          observer.observe,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(
          result.saveChecks,
          result.steps,
          "every actual action has exact save restoration",
        );
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        for (const entry of result.observed) observed.add(entry);
        return result;
      }
      for (const players of [1, 2, 3, 4]) {
        const result = run(players);
        if (players === 2) immediate = result;
      }
      assert.ok(immediate);
      for (const review of ["all", "hidden", "decisions"] as const) {
        const result = run(2, review);
        const { flow, ...paced } = result.state;
        assert.deepEqual(
          paced,
          immediate.state,
          `${scenario}/${easy}/${review}: exact final physical state, RNG, resources, damage and outcome match baseline`,
        );
        assert.equal(flow!.mode, review);
        assert.equal(flow!.pending, null);
        comparisons++;
      }
      assert.equal(games, 7);
      assert.equal(comparisons, 3);
      assert.ok(counts.privacyComparisons > 0);
      assert.ok(counts.playerViews >= counts.boundaryObservations);
      assert.ok(counts.physicalChecks > 0);
      assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
      assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
      assert.ok(
        observed.has("action:COMMIT"),
        "policy performs actual quest commitments",
      );
      t.diagnostic(
        JSON.stringify({
          scenario,
          easy,
          seed: 11,
          baselineGames: 4,
          reviewGames: 3,
          games,
          comparisons,
          actions,
          outcomes,
          ...counts,
        }),
      );
    });
