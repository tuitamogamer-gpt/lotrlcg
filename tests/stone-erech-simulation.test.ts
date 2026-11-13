import test from "node:test";
import assert from "node:assert/strict";
import { runSeGame } from "./stone-erech-simulation-driver";
import { SE_SCENARIOS } from "./stone-erech-simulation-policy";
import { seSimulationObserver } from "./stone-erech-simulation-invariants";
import { SE } from "../src/game/stone-erech-support";

const requestedScenario = process.env.SE_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    SE_SCENARIOS.some((id) => id === requestedScenario),
    "SE_SIMULATION_SCENARIO must be The Stone of Erech",
  );
const seed = Number(process.env.SE_SIMULATION_SEED ?? 2);

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of SE_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Stone of Erech ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = seSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        dusk = 0;
      let immediate: ReturnType<typeof runSeGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = seSimulationObserver();
        const result = runSeGame(
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
        if ((result.state.victoryCards ?? []).includes(SE.eventide)) dusk++;
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
        choices.some((c) => /^choice:Tarlang's Neck/.test(c)),
        "Tarlang's Neck's Forced effect is resolved at the beginning of the encounter phase",
      );
      assert.ok(
        choices.some((c) => /^choice:Search for an Undead enemy/.test(c)),
        "Midnight Throng's searches are resolved",
      );
      // The starter decks lose every game on stage 1; the night still falls,
      // and the focused and browser suites cover the later stages.
      assert.ok(dusk > 0, "Eventide gives way to Dusk in a seeded game");
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
          dusk,
          ...counts,
        }),
      );
    });
