import test from "node:test";
import assert from "node:assert/strict";
import { runPfGame } from "./pelennor-fields-simulation-driver";
import { PF_SCENARIOS, pfFields } from "./pelennor-fields-simulation-policy";
import type { GameState } from "../src/game/types";
import {
  PF,
  pfMinasTirith,
  pfMinasTirithHealth,
} from "../src/game/pelennor-fields-support";
import { pfSimulationObserver } from "./pelennor-fields-simulation-invariants";
import { globalEngaged } from "../src/game/table";

const requestedScenario = process.env.PF_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    PF_SCENARIOS.some((id) => id === requestedScenario),
    "PF_SIMULATION_SCENARIO must be The Battle of the Pelennor Fields",
  );
const seed = Number(process.env.PF_SIMULATION_SEED ?? 2);

/** What the games showed: the stages, Minas Tirith and The Witch-king. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    maxStage: 0,
    maxCityDamage: 0,
    witchKing: false,
    witchKingDefeated: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = state.pelennorFields;
    if (!q) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    const mt = pfMinasTirith(state);
    if (mt) {
      seen.maxCityDamage = Math.max(seen.maxCityDamage, mt.damage);
      // Minas Tirith falls only at the end of a round.
      if (state.status === "playing")
        assert.ok(
          mt.damage <
            pfMinasTirithHealth(
              state.table
                ? state.table.seats.filter((seat) => !seat.eliminated).length
                : 1,
            ) || state.phase !== "resource",
        );
    }
    if (
      [...state.staging, ...globalEngaged(state)].some(
        (u) => u.code === PF.witchKing,
      )
    )
      seen.witchKing = true;
    if ((state.victoryCards ?? []).includes(PF.witchKing))
      seen.witchKingDefeated = true;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of PF_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Battle of the Pelennor Fields ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = pfSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        maxCityDamage = 0,
        witchKing = 0;
      let immediate: ReturnType<typeof runPfGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = pfSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runPfGame(scenario, easy, players, seed, review, watch);
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
        maxCityDamage = Math.max(maxCityDamage, seen.maxCityDamage);
        if (seen.witchKing) witchKing++;
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
        maxStage >= 3,
        "the players fall back from Osgiliath to the besieged White City",
      );
      assert.ok(maxCityDamage > 0, "Minas Tirith takes damage");
      assert.ok(witchKing > 0, "The Witch-king comes to the Pelennor");
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
          maxCityDamage,
          witchKing,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts at Fighting in the Fields with 16 progress,
// Minas Tirith in play and The Witch-king (Sorcerer side) with 12 damage
// (pfFields): the players must defeat him with Aragorn in play to win.
for (const scenario of PF_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Battle of the Pelennor Fields ${scenario} ${easy ? "easy" : "normal"}: The Witch-king on the fields with exact review parity`, (t) => {
      const counts = pfSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        defeated = 0;
      let immediate: ReturnType<typeof runPfGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = pfSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runPfGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          pfFields,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.witchKingDefeated) defeated++;
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
      assert.ok(defeated > 0, "the players defeat The Witch-king");
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
          defeated,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
