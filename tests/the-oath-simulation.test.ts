import test from "node:test";
import assert from "node:assert/strict";
import { runOathGame } from "./the-oath-simulation-driver";
import {
  OATH_SIM_SCENARIOS,
  oathForest,
  oathRearguard,
} from "./the-oath-simulation-policy";
import { oathSimulationObserver } from "./the-oath-simulation-invariants";
import { OATH, oathPublicState } from "../src/game/the-oath-support";
import type { GameState } from "../src/game/types";

const requestedScenario = process.env.OATH_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    OATH_SIM_SCENARIOS.some((id) => id === requestedScenario),
    "OATH_SIMULATION_SCENARIO must be the-oath-2018 or the-oath",
  );
const seed = Number(process.env.OATH_SIMULATION_SEED ?? 2);
const scenarios = OATH_SIM_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
);

/** What the games showed: stages, the Goblin Trail and Goblin Troop. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      { eaves: boolean; troop: string; stage: number } | undefined,
    maxStage: 0,
    trails: 0,
    troop: false,
    troopGone: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = oathPublicState(state);
    if (!q) return;
    seen.first ??= {
      eaves: state.staging.some((u) => u.code === OATH.eaves),
      troop: q.troop,
      stage: q.stage,
    };
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    seen.trails = Math.max(seen.trails, q.trails);
    if (q.troop === "play") seen.troop = true;
    if (seen.troop && q.troop === "gone") seen.troopGone = true;
    // Only 3B's defeat wins, and only once Goblin Troop has left play.
    if (state.status === "won") {
      assert.equal(q.stage, 3, "the players win by defeating The Rearguard");
      assert.equal(q.troop, "gone", "Goblin Troop is no longer in play");
      assert.ok(q.trails > 0, "a Goblin Trail is in the victory display");
    }
  };
  return { watch, seen };
}

// Each edition and difficulty has four baseline games and three paced games,
// with three exact terminal-state comparisons. CI partitions this same matrix
// by scenario.
for (const scenario of scenarios)
  for (const easy of [false, true])
    test(`The Oath ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = oathSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0;
      let immediate: ReturnType<typeof runOathGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = oathSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runOathGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(
          result.saveChecks,
          result.steps,
          "every actual action has exact save restoration",
        );
        assert.deepEqual(
          seen.first,
          { eaves: true, troop: "aside", stage: 1 },
          "1A adds The Eaves of Mirkwood to the staging area and sets Goblin Troop aside",
        );
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxStage = Math.max(maxStage, seen.maxStage);
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
          ...counts,
        }),
      );
    });

// The late-game matrices start at the end of After the Raid with its 9
// progress, so 2A's searches add a Forest location for each player
// (oathForest), and at the end of Mirkwood Forest with a Goblin Trail in the
// victory display and its 12 progress, so 3A adds Goblin Troop and a Goblin
// enemy for each other player (oathRearguard).
for (const [label, prepare, players] of [
  ["Mirkwood Forest's searches and the Goblin Trail", oathForest, [1, 2]],
  ["The Rearguard and Goblin Troop", oathRearguard, [1, 2, 3]],
] as const)
  for (const scenario of scenarios)
    for (const easy of [false, true])
      test(`The Oath ${scenario} ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
        const counts = oathSimulationObserver().counts();
        const outcomes = { won: 0, lost: 0 };
        const observed = new Set<string>();
        let games = 0,
          comparisons = 0,
          actions = 0,
          maxRound = 0,
          maxStage = 0,
          troop = 0,
          troopGone = 0;
        let immediate: ReturnType<typeof runOathGame> | undefined;
        function run(count: number, review?: "hidden" | "decisions") {
          const observer = oathSimulationObserver();
          const { watch, seen } = watcher(observer.observe);
          const result = runOathGame(
            scenario,
            easy,
            count,
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
          maxRound = Math.max(maxRound, result.state.round);
          maxStage = Math.max(maxStage, seen.maxStage);
          if (seen.troop) troop++;
          if (seen.troopGone) troopGone++;
          for (const entry of result.observed) observed.add(entry);
          if (prepare === oathRearguard) {
            assert.equal(seen.maxStage, 3, "2B is defeated at once");
            assert.ok(seen.troop, "3A adds Goblin Troop to the staging area");
          } else assert.ok(seen.maxStage >= 2, "1B is defeated at once");
          return result;
        }
        for (const count of players) {
          const result = run(count);
          if (count === 2) immediate = result;
        }
        assert.ok(immediate);
        const reviews =
          prepare === oathRearguard
            ? (["hidden", "decisions"] as const)
            : (["decisions"] as const);
        for (const review of reviews) {
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
        assert.equal(games, players.length + reviews.length);
        assert.equal(comparisons, reviews.length);
        assert.ok(counts.privacyComparisons > 0);
        assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
        assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
        const choices = [...observed];
        if (prepare === oathForest)
          assert.ok(
            choices.some((c) => /Add a Forest location/.test(c)),
            "2A: each player searches for a Forest location",
          );
        else
          assert.ok(
            choices.some((c) => /Add a Goblin enemy/.test(c)),
            "3A: each other player searches for a Goblin enemy",
          );
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
            troop,
            troopGone,
            ...counts,
          }),
        );
      });
