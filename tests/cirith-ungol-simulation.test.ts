import test from "node:test";
import assert from "node:assert/strict";
import { runCuGame } from "./cirith-ungol-simulation-driver";
import {
  CU_SCENARIOS,
  cuEscape,
  cuTower,
} from "./cirith-ungol-simulation-policy";
import type { GameState } from "../src/game/types";
import { CU } from "../src/game/cirith-ungol-support";
import { cuSimulationObserver } from "./cirith-ungol-simulation-invariants";
import { globalEngaged } from "../src/game/table";

const requestedScenario = process.env.CU_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    CU_SCENARIOS.some((id) => id === requestedScenario),
    "CU_SIMULATION_SCENARIO must be The Tower of Cirith Ungol",
  );
const seed = Number(process.env.CU_SIMULATION_SEED ?? 2);

/** What the games showed: the stages, The Two Watchers, Shagrat and the Ring-bearer. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    maxStage: 0,
    watchersFlipped: false,
    watchersDefeated: false,
    shagrat: false,
    freed: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = state.cirithUngol;
    if (!q) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    if (state.staging.some((u) => u.code === CU.watchersEnemy))
      seen.watchersFlipped = true;
    if ((state.victoryCards ?? []).includes(CU.watchersEnemy))
      seen.watchersDefeated = true;
    if (
      [...state.staging, ...globalEngaged(state)].some(
        (u) => u.code === CU.shagrat,
      )
    )
      seen.shagrat = true;
    if (q.ringPlaced && !q.captive) seen.freed = true;
    // The Ring-bearer stays captive until Topmost Chamber leaves play.
    if (q.captive) assert.ok(!(state.victoryCards ?? []).includes(CU.chamber));
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of CU_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Tower of Cirith Ungol ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = cuSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        flipped = 0,
        defeated = 0;
      let immediate: ReturnType<typeof runCuGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = cuSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runCuGame(scenario, easy, players, seed, review, watch);
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
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        maxStage = Math.max(maxStage, seen.maxStage);
        if (seen.watchersFlipped) flipped++;
        if (seen.watchersDefeated) defeated++;
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
      assert.ok(flipped > 0, "the players travel to The Two Watchers");
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
          maxRound,
          maxStage,
          flipped,
          defeated,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrices start at Fighting in the Tower with 18 progress
// (cuTower: Topmost Chamber, Shagrat and the Ring-bearer) and at Escape from
// Cirith Ungol with 12 progress and The Two Watchers flipped (cuEscape).
for (const [label, prepare] of [
  ["Topmost Chamber and Shagrat", cuTower],
  ["the escape past The Two Watchers", cuEscape],
] as const)
  for (const scenario of CU_SCENARIOS.filter(
    (id) => !requestedScenario || id === requestedScenario,
  ))
    for (const easy of [false, true])
      test(`The Tower of Cirith Ungol ${scenario} ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
        const counts = cuSimulationObserver().counts();
        const outcomes = { won: 0, lost: 0 };
        const reasons = new Set<string>();
        let games = 0,
          comparisons = 0,
          actions = 0,
          maxRound = 0,
          maxStage = 0,
          shagrat = 0,
          freed = 0;
        let immediate: ReturnType<typeof runCuGame> | undefined;
        function run(players: number, review?: "all" | "hidden" | "decisions") {
          const observer = cuSimulationObserver();
          const { watch, seen } = watcher(observer.observe);
          const result = runCuGame(
            scenario,
            easy,
            players,
            seed,
            review,
            watch,
            prepare,
          );
          for (const key of Object.keys(counts) as (keyof typeof counts)[])
            counts[key] += observer.counts()[key];
          assert.equal(result.saveChecks, result.steps);
          actions += result.steps;
          games++;
          outcomes[result.state.status as "won" | "lost"]++;
          reasons.add(result.state.reason);
          maxRound = Math.max(maxRound, result.state.round);
          maxStage = Math.max(maxStage, seen.maxStage);
          if (seen.shagrat) shagrat++;
          if (seen.freed) freed++;
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
        assert.ok(counts.privacyComparisons > 0);
        assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
        assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
        if (prepare === cuTower) {
          assert.ok(
            shagrat > 0,
            "Topmost Chamber's Travel cost brings Shagrat",
          );
          assert.ok(freed > 0, "the players free the Ring-bearer");
        } else assert.ok(outcomes.won > 0, "the players win some of the games");
        t.diagnostic(
          JSON.stringify({
            scenario,
            label,
            easy,
            seed,
            games,
            comparisons,
            actions,
            outcomes,
            maxRound,
            maxStage,
            shagrat,
            freed,
            reasons: [...reasons],
            ...counts,
          }),
        );
      });
