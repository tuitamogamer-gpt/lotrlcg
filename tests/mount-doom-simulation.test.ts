import test from "node:test";
import assert from "node:assert/strict";
import { runMdGame } from "./mount-doom-simulation-driver";
import {
  MD_SCENARIOS,
  mdCrack,
  mdGasp,
  mdRoad,
} from "./mount-doom-simulation-policy";
import type { GameState } from "../src/game/types";
import { MD } from "../src/game/mount-doom-support";
import { mdSimulationObserver } from "./mount-doom-simulation-invariants";

const requestedScenario = process.env.MD_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    MD_SCENARIOS.some((id) => id === requestedScenario),
    "MD_SIMULATION_SCENARIO must be Mount Doom",
  );
const seed = Number(process.env.MD_SIMULATION_SEED ?? 2);

/** What the games showed: stages, Fortitude tests, Gollum and the last test. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    maxStage: 0,
    tests: 0,
    failures: 0,
    gollum: false,
    tower: false,
    searched: 0,
    lastTest: false,
  };
  let testing = false;
  const watch = (state: GameState) => {
    observe(state);
    const q = state.mountDoom;
    if (!q) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    const test = state.hideTest;
    if (test?.kind === "fortitude" && !testing) {
      seen.tests++;
      if (test.source === MD.crack) seen.lastTest = true;
    }
    testing = test?.kind === "fortitude";
    seen.failures = Math.max(
      seen.failures,
      q.failed?.round === state.round ? q.failed.players.length : 0,
    );
    if (
      [
        ...state.staging,
        ...(state.engaged ?? []),
        ...(state.table?.seats.flatMap((x) => x.engaged ?? []) ?? []),
      ].some((u) => u.code === MD.gollum)
    )
      seen.gollum = true;
    if (state.staging.some((u) => u.code === MD.tower)) seen.tower = true;
    if (q.ready)
      seen.searched = Math.max(
        seen.searched,
        state.staging.filter((u) => u.code !== MD.doom && u.code !== MD.tower)
          .length,
      );
    // Dire: the elimination level is 99.
    assert.ok(state.status !== "playing" || state.threat < 99);
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of MD_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Mount Doom ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = mdSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        tests = 0,
        gollum = 0;
      let immediate: ReturnType<typeof runMdGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = mdSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runMdGame(scenario, easy, players, seed, review, watch);
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(
          result.saveChecks,
          result.steps,
          "every actual action has exact save restoration",
        );
        assert.ok(
          seen.tower,
          "The Tower of Barad-dûr starts in the staging area",
        );
        assert.ok(
          seen.searched >= Math.min(players, 1),
          "each player searches for a different location at setup",
        );
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        tests += seen.tests;
        if (seen.gollum) gollum++;
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
      assert.ok(tests > 0, "the games make Fortitude tests");
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
          seed,
          games,
          comparisons,
          actions,
          outcomes,
          maxRound,
          tests,
          gollum,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrices start at The Road to Isenmouthe with a resource
// for each player but one (mdRoad), at The Last Gasp with 20 progress, ready
// to travel to Mount Doom (mdGasp), and at The Crack of Doom with Mount Doom
// active and 8 of its 9 progress (mdCrack).
for (const [label, prepare] of [
  ["the Fortitude tests of The Road to Isenmouthe", mdRoad],
  ["the travel to Mount Doom", mdGasp],
  ["the last Fortitude test at the Crack of Doom", mdCrack],
] as const)
  for (const scenario of MD_SCENARIOS.filter(
    (id) => !requestedScenario || id === requestedScenario,
  ))
    for (const easy of [false, true])
      test(`Mount Doom ${scenario} ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
        const counts = mdSimulationObserver().counts();
        const outcomes = { won: 0, lost: 0 };
        const reasons = new Set<string>();
        let games = 0,
          comparisons = 0,
          actions = 0,
          maxRound = 0,
          maxStage = 0,
          tests = 0,
          lastTests = 0;
        let immediate: ReturnType<typeof runMdGame> | undefined;
        function run(players: number, review?: "hidden" | "decisions") {
          const observer = mdSimulationObserver();
          const { watch, seen } = watcher(observer.observe);
          const result = runMdGame(
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
          tests += seen.tests;
          if (seen.lastTest) lastTests++;
          return result;
        }
        for (const players of [1, 2, 3]) {
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
        assert.ok(counts.privacyComparisons > 0);
        assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
        assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
        assert.ok(tests > 0, "the games make Fortitude tests");
        if (prepare === mdGasp)
          assert.equal(maxStage, 4, "the travel to Mount Doom defeats 3B");
        if (prepare === mdCrack)
          assert.ok(lastTests > 0, "Mount Doom is explored and tested");
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
            tests,
            lastTests,
            reasons: [...reasons],
            ...counts,
          }),
        );
      });
