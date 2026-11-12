import test from "node:test";
import assert from "node:assert/strict";
import { runFfGame } from "./flight-ford-simulation-driver";
import { FF_SCENARIOS } from "./flight-ford-simulation-policy";
import { ffSimulationObserver } from "./flight-ford-simulation-invariants";
import { FF } from "../src/game/flight-ford-support";

const requestedScenario = process.env.FF_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    FF_SCENARIOS.some((id) => id === requestedScenario),
    "FF_SIMULATION_SCENARIO must be Flight to the Ford",
  );
const seed = Number(process.env.FF_SIMULATION_SEED ?? 2);

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of FF_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Flight to the Ford ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = ffSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        bridges = 0;
      let immediate: ReturnType<typeof runFfGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = ffSimulationObserver();
        const result = runFfGame(
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
        if (
          result.state.stage > 1 ||
          (result.state.victoryCards ?? []).includes(FF.bridge)
        )
          bridges++;
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
        choices.some((c) => /^choice:Fell Rider/.test(c)),
        "Fell Riders' Forced effect is resolved at the beginning of the encounter phase",
      );
      assert.ok(
        bridges > 0,
        "a seeded game explores The Last Bridge after paying its burden",
      );
      // The starter decks rarely survive stage 1; the normal matrix reaches
      // 2B, and the focused and browser suites cover the victory.
      if (!easy)
        assert.ok(
          maxStage >= 2,
          "a seeded normal game reaches stage 2B, Race to Rivendell",
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
          bridges,
          ...counts,
        }),
      );
    });
