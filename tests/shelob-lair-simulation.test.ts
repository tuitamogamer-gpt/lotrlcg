import test from "node:test";
import assert from "node:assert/strict";
import { runSlGame } from "./shelob-lair-simulation-driver";
import { SL_SCENARIOS, slBetrayal } from "./shelob-lair-simulation-policy";
import type { GameState } from "../src/game/types";
import { SL } from "../src/game/shelob-lair-support";
import { slSimulationObserver } from "./shelob-lair-simulation-invariants";
import { globalEngaged } from "../src/game/table";

const requestedScenario = process.env.SL_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    SL_SCENARIOS.some((id) => id === requestedScenario),
    "SL_SIMULATION_SCENARIO must be Shelob's Lair",
  );
const seed = Number(process.env.SL_SIMULATION_SEED ?? 2);

/** What the games showed: the stages reached, Shelob's resources and the victory display. */
function watcher(observe: (state: GameState) => void) {
  const seen = { maxStage: 0, maxResources: 0, gollum: false, shelob: false };
  const watch = (state: GameState) => {
    observe(state);
    if (!state.shelobLair) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    const shelob = [...state.staging, ...globalEngaged(state)].find(
      (u) => u.code === SL.shelob,
    );
    seen.maxResources = Math.max(seen.maxResources, shelob?.resources ?? 0);
    if ((state.victoryCards ?? []).includes(SL.gollum)) seen.gollum = true;
    if ((state.victoryCards ?? []).includes(SL.shelob)) seen.shelob = true;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of SL_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Shelob's Lair ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = slSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        maxResources = 0;
      let immediate: ReturnType<typeof runSlGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = slSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runSlGame(scenario, easy, players, seed, review, watch);
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
        maxResources = Math.max(maxResources, seen.maxResources);
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
        "Sméagol's Secret Way takes the players to The Spider's Pass",
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
          maxResources,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts at Gollum's Betrayal with its 8 progress, Gollum
// and Cleft of Cirith Ungol in the victory display and a wounded Shelob
// (slBetrayal): the players win when they destroy her.
for (const scenario of SL_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Shelob's Lair ${scenario} ${easy ? "easy" : "normal"}: Gollum's Betrayal against a wounded Shelob with exact review parity`, (t) => {
      const counts = slSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        gollum = 0,
        shelob = 0;
      let immediate: ReturnType<typeof runSlGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = slSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runSlGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          slBetrayal,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.gollum) gollum++;
        if (seen.shelob) shelob++;
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
      assert.ok(shelob > 0, "Shelob is destroyed into the victory display");
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
          gollum,
          shelob,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
