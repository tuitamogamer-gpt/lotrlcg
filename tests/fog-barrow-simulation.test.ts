import test from "node:test";
import assert from "node:assert/strict";
import { runFbGame } from "./fog-barrow-simulation-driver";
import { FB_SCENARIOS, fbStageThree } from "./fog-barrow-simulation-policy";
import type { GameState } from "../src/game/types";
import { fbSimulationObserver } from "./fog-barrow-simulation-invariants";

const requestedScenario = process.env.FB_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    FB_SCENARIOS.some((id) => id === requestedScenario),
    "FB_SIMULATION_SCENARIO must be Fog on the Barrow-downs",
  );
const seed = Number(process.env.FB_SIMULATION_SEED ?? 2);

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of FB_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Fog on the Barrow-downs ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = fbSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        maxStageReached = 0;
      let immediate: ReturnType<typeof runFbGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = fbSimulationObserver();
        const result = runFbGame(
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
        maxStageReached >= 2,
        "The House of Tom Bombadil is defeated at the end of the first round",
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

// The late-game matrix starts at stage 3B (fbStageThree), with the Great
// Barrows shuffled into the encounter deck, so the players are trapped
// inside the barrows and separated into their own staging areas.
for (const scenario of FB_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Fog on the Barrow-downs ${scenario} ${easy ? "easy" : "normal"}: the barrows from stage 3B with exact review parity`, (t) => {
      const counts = fbSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        trapped = 0,
        escaped = 0;
      let immediate: ReturnType<typeof runFbGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = fbSimulationObserver();
        let split = false,
          returned = false;
        const watch = (state: GameState) => {
          observer.observe(state);
          if (state.fogBarrow?.split) split = true;
          if (state.fogBarrow?.escaped.length) returned = true;
        };
        const result = runFbGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          fbStageThree,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxStage = Math.max(maxStage, result.state.stage);
        maxRound = Math.max(maxRound, result.state.round);
        if (split) trapped++;
        if (returned) escaped++;
        for (const entry of result.observed) observed.add(entry);
        return result;
      }
      for (const players of [1, 2, 3, 4]) {
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
      assert.equal(games, 6);
      assert.equal(comparisons, 2);
      assert.ok(
        trapped >= 4,
        `players are trapped inside a barrow (${trapped})`,
      );
      assert.ok(counts.privacyComparisons > 0);
      assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
      assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
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
          trapped,
          escaped,
          ...counts,
        }),
      );
    });
