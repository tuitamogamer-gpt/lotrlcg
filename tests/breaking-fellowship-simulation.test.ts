import test from "node:test";
import assert from "node:assert/strict";
import { runBfGame } from "./breaking-fellowship-simulation-driver";
import {
  BF_SCENARIOS,
  bfStageTwo,
} from "./breaking-fellowship-simulation-policy";
import { bfSimulationObserver } from "./breaking-fellowship-simulation-invariants";

const requestedScenario = process.env.BF_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    BF_SCENARIOS.some((id) => id === requestedScenario),
    "BF_SIMULATION_SCENARIO must be Breaking of the Fellowship",
  );
const seed = Number(process.env.BF_SIMULATION_SEED ?? 2);

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of BF_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Breaking of the Fellowship ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = bfSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        maxStageReached = 0;
      let immediate: ReturnType<typeof runBfGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = bfSimulationObserver();
        const result = runBfGame(
          scenario,
          easy,
          players,
          seed,
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
        maxStageReached = Math.max(maxStageReached, result.state.stage);
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
      assert.ok(
        [...observed].some((c) => /^choice:Assign Archery damage/.test(c)),
        "the Uruk-hai archery of stage 1 is assigned",
      );
      t.diagnostic(
        JSON.stringify({
          scenario,
          easy,
          seed,
          baselineGames: 4,
          reviewGames: 3,
          games,
          comparisons,
          actions,
          outcomes,
          maxStage,
          maxRound,
          maxStageReached,
          ...counts,
        }),
      );
    });

// The late-game matrix starts at stage 2B (bfStageTwo), so every game
// separates the players into their own staging areas and stages.
for (const scenario of BF_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Breaking of the Fellowship ${scenario} ${easy ? "easy" : "normal"}: separate staging areas from stage 2B with exact review parity`, (t) => {
      const counts = bfSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        divided = 0;
      let immediate: ReturnType<typeof runBfGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = bfSimulationObserver();
        const result = runBfGame(
          scenario,
          easy,
          players,
          seed,
          review,
          observer.observe,
          bfStageTwo,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxStage = Math.max(maxStage, result.state.stage);
        maxRound = Math.max(maxRound, result.state.round);
        if (
          [...result.observed].some((c) =>
            /^choice:The Company Divided · Advance to a different stage 3A/.test(
              c,
            ),
          )
        )
          divided++;
        for (const entry of result.observed) observed.add(entry);
        return result;
      }
      for (const players of [2, 3, 4]) {
        const result = run(players);
        if (players === 2) immediate = result;
      }
      assert.ok(immediate);
      for (const review of ["hidden", "decisions"] as const) {
        const result = run(2, review);
        const { flow, ...paced } = result.state;
        assert.deepEqual(
          paced,
          immediate.state,
          `${scenario}/${easy}/${review}: exact final state matches baseline`,
        );
        assert.equal(flow!.mode, review);
        assert.equal(flow!.pending, null);
        comparisons++;
      }
      assert.equal(games, 5);
      assert.equal(comparisons, 2);
      assert.equal(divided, 5, "every game separates the players");
      assert.ok(counts.privacyComparisons > 0);
      assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
      assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
      assert.ok(
        [...observed].some((c) =>
          /^choice:The Company Divided · Move an encounter card/.test(c),
        ),
        "the stage 2 cards are shared out",
      );
      t.diagnostic(
        JSON.stringify({
          scenario,
          easy,
          seed,
          games,
          comparisons,
          actions,
          outcomes,
          maxStage,
          maxRound,
          divided,
          ...counts,
        }),
      );
    });
