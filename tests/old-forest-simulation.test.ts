import test from "node:test";
import assert from "node:assert/strict";
import { runOfGame } from "./old-forest-simulation-driver";
import { OF_SCENARIOS } from "./old-forest-simulation-policy";
import { ofSimulationObserver } from "./old-forest-simulation-invariants";
import { OF_STAGE_TWO } from "../src/game/old-forest-support";
import type { GameState } from "../src/game/types";

const requestedScenario = process.env.OF_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    OF_SCENARIOS.some((id) => id === requestedScenario),
    "OF_SIMULATION_SCENARIO must be The Old Forest",
  );
const seed = Number(process.env.OF_SIMULATION_SEED ?? 2);

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of OF_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Old Forest ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = ofSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const stageTwo = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0,
        rerolls = 0;
      let immediate: ReturnType<typeof runOfGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = ofSimulationObserver();
        const seen: string[] = [];
        const observe = (s: GameState) => {
          const quest = s.oldForest?.currentQuest;
          if (quest && OF_STAGE_TWO.includes(quest) && seen.at(-1) !== quest)
            seen.push(quest);
          observer.observe(s);
        };
        const result = runOfGame(
          scenario,
          easy,
          players,
          seed,
          review,
          observe,
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
        rerolls += Math.max(0, seen.length - 1);
        for (const quest of seen) stageTwo.add(quest);
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
        [...observed].some((c) =>
          /^choice:Farewell to the Shire · Add/.test(c),
        ),
        "each player searches for a setup location",
      );
      assert.ok(
        rerolls > 0,
        "successful questing moves to a different random stage 2",
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
          rerolls,
          stageTwo: stageTwo.size,
          ...counts,
        }),
      );
    });
