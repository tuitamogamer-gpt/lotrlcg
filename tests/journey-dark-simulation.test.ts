import test from "node:test";
import assert from "node:assert/strict";
import { JD } from "../src/game/journey-dark-support";
import { runJdGame } from "./journey-dark-simulation-driver";
import { JD_SCENARIOS } from "./journey-dark-simulation-policy";
import { jdSimulationObserver } from "./journey-dark-simulation-invariants";

const requestedScenario = process.env.JD_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    JD_SCENARIOS.some((id) => id === requestedScenario),
    "JD_SIMULATION_SCENARIO must be Journey in the Dark",
  );
const seed = Number(process.env.JD_SIMULATION_SEED ?? 2);

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of JD_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Journey in the Dark ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = jdSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        searches = 0,
        balrogs = 0;
      let immediate: ReturnType<typeof runJdGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = jdSimulationObserver();
        const result = runJdGame(
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
        if (
          [...result.observed].some((c) =>
            /^choice:The Long Dark of Moria · Add a different location/.test(c),
          )
        )
          searches++;
        if (result.state.journeyDark!.setAside.every((c) => c !== JD.balrog))
          balrogs++;
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
      assert.equal(
        searches,
        7,
        "every game searches the encounter deck for its setup locations",
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
          searches,
          balrogs,
          ...counts,
        }),
      );
    });
