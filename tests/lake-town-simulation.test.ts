import test from "node:test";
import assert from "node:assert/strict";
import { runLakeGame } from "./lake-town-simulation-driver";
import { LAKE_SCENARIOS } from "./lake-town-simulation-policy";
import { lakeSimulationObserver } from "./lake-town-simulation-invariants";

const requestedScenario = process.env.LAKE_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    LAKE_SCENARIOS.some((id) => id === requestedScenario),
    "LAKE_SIMULATION_SCENARIO must be The Battle of Lake-town",
  );

// Each adventure has eight baseline games and six paced games, with six
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of LAKE_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Battle of Lake-town ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = lakeSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0;
      let immediate: ReturnType<typeof runLakeGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = lakeSimulationObserver();
        const result = runLakeGame(
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
        maxStage = Math.max(maxStage, result.state.stage);
        maxRound = Math.max(maxRound, result.state.round);
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
      const choices = [...observed];
      assert.ok(
        choices.includes("choice:Smaug · Where does the dragon strike?"),
        "the first player chooses where each Smaug goes",
      );
      assert.ok(
        choices.some((c) => /^choice:Burn · \d+ damage to assign/.test(c)),
        "burn damage is assigned through the players' choices",
      );
      assert.ok(
        maxStage >= 2,
        "a seeded game reaches stage 2B, Fire and Water",
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
          maxStage,
          maxRound,
          ...counts,
        }),
      );
    });
