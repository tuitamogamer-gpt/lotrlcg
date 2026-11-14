import test from "node:test";
import assert from "node:assert/strict";
import { runGcGame } from "./grey-company-simulation-driver";
import { GC_SCENARIOS, gcStone } from "./grey-company-simulation-policy";
import type { GameState } from "../src/game/types";
import { GC } from "../src/game/grey-company-support";
import { gcSimulationObserver } from "./grey-company-simulation-invariants";
import { playerOrder, seatView } from "../src/game/table";

const requestedScenario = process.env.GC_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    GC_SCENARIOS.some((id) => id === requestedScenario),
    "GC_SIMULATION_SCENARIO must be The Passing of the Grey Company",
  );
const seed = Number(process.env.GC_SIMULATION_SEED ?? 2);

/** What the games showed: the stages reached, Overcome by Fear and the Stone. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    maxStage: 0,
    maxFearAside: 0,
    fearReturned: false,
    stoneActive: false,
    army: false,
  };
  let priorAside = 0;
  const watch = (state: GameState) => {
    observe(state);
    const q = state.greyCompany;
    if (!q) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    seen.maxFearAside = Math.max(seen.maxFearAside, q.fearAside);
    if (q.fearAside < priorAside) seen.fearReturned = true;
    priorAside = q.fearAside;
    if (state.activeLocation?.code === GC.stone) seen.stoneActive = true;
    if ((state.victoryCards ?? []).includes(GC.army)) seen.army = true;
    // Overcome by Fear: never more than one copy on a threat dial.
    for (const p of playerOrder(state))
      assert.ok(
        (seatView(state, p).threatAttachments ?? []).filter(
          (a) => a.code === GC.fear,
        ).length <= 1,
      );
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of GC_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Passing of the Grey Company ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = gcSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        maxFearAside = 0,
        fearReturned = 0;
      let immediate: ReturnType<typeof runGcGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = gcSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runGcGame(scenario, easy, players, seed, review, watch);
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
        maxFearAside = Math.max(maxFearAside, seen.maxFearAside);
        if (seen.fearReturned) fearReturned++;
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
        maxStage >= 2,
        "The Forbidden Door takes the players into the Paths of the Dead",
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
          maxRound,
          maxStage,
          maxFearAside,
          fearReturned,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts at The Dead are Following with its 5 progress,
// The Stone of Erech in the staging area and Overcome by Fear set aside
// (gcStone): the players win by exploring the Stone.
for (const scenario of GC_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Passing of the Grey Company ${scenario} ${easy ? "easy" : "normal"}: The Stone of Erech with exact review parity`, (t) => {
      const counts = gcSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        stone = 0;
      let immediate: ReturnType<typeof runGcGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = gcSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runGcGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          gcStone,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.stoneActive) stone++;
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
      assert.ok(stone > 0, "the players travel to The Stone of Erech");
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
          stone,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
