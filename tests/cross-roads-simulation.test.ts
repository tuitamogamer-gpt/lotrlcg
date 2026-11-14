import test from "node:test";
import assert from "node:assert/strict";
import { runJtcGame } from "./cross-roads-simulation-driver";
import {
  JTC_SCENARIOS,
  jtcCrossroadsReady,
} from "./cross-roads-simulation-policy";
import type { GameState } from "../src/game/types";
import { JTC } from "../src/game/cross-roads-support";
import { jtcSimulationObserver } from "./cross-roads-simulation-invariants";

const requestedScenario = process.env.JTC_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    JTC_SCENARIOS.some((id) => id === requestedScenario),
    "JTC_SIMULATION_SCENARIO must be Journey to the Cross-roads",
  );
const seed = Number(process.env.JTC_SIMULATION_SEED ?? 2);

/** What the games showed: the Men of Harad revealed, The Black Gate and The Cross-roads. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    revealed: 0,
    maxGate: 0,
    crossroads: false,
    refuge: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = state.crossRoads;
    if (!q) return;
    seen.revealed = Math.max(seen.revealed, 9 - q.underCrossroads.length);
    seen.maxGate = Math.max(seen.maxGate, q.underBlackGate.length);
    if (state.activeLocation?.code === JTC.crossroads) seen.crossroads = true;
    if (state.activeLocation?.code === JTC.henneth) seen.refuge = true;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of JTC_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Journey to the Cross-roads ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = jtcSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        revealed = 0,
        maxGate = 0,
        refuge = 0;
      let immediate: ReturnType<typeof runJtcGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = jtcSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runJtcGame(scenario, easy, players, seed, review, watch);
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
        revealed = Math.max(revealed, seen.revealed);
        maxGate = Math.max(maxGate, seen.maxGate);
        if (seen.refuge) refuge++;
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
        [...observed].some((o) =>
          o.startsWith(
            "choice:Ambush the Men of Harad · Add a location to the staging area",
          ),
        ),
        "each player but the first searches for a setup location",
      );
      assert.ok(
        observed.has("action:ENGAGE"),
        "the players engage Harad enemies before The Black Gate takes them",
      );
      assert.ok(revealed >= 2, "stage 1B reveals the Men of Harad");
      assert.ok(maxGate > 0, "Harad enemies go under The Black Gate");
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
          revealed,
          maxGate,
          refuge,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts with the Men of Harad defeated and 20 progress
// on stage 1B (jtcCrossroadsReady): the players travel to The Cross-roads and
// must explore it before The Black Gate fills or their heroes fall.
for (const scenario of JTC_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Journey to the Cross-roads ${scenario} ${easy ? "easy" : "normal"}: The Cross-roads from 20 progress with exact review parity`, (t) => {
      const counts = jtcSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        crossroads = 0;
      let immediate: ReturnType<typeof runJtcGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = jtcSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runJtcGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          jtcCrossroadsReady,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.crossroads) crossroads++;
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
      assert.equal(crossroads, games, "every game travels to The Cross-roads");
      assert.ok(outcomes.won > 0, "the players win some of the games");
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
          maxRound,
          crossroads,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
