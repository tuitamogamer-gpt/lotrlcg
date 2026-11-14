import test from "node:test";
import assert from "node:assert/strict";
import { runPomGame } from "./passage-marshes-simulation-driver";
import {
  POM_SCENARIOS,
  pomLights,
} from "./passage-marshes-simulation-policy";
import type { GameState } from "../src/game/types";
import { POM } from "../src/game/passage-marshes-support";
import { pomSimulationObserver } from "./passage-marshes-simulation-invariants";
import { globalCharacters } from "../src/game/table";

const requestedScenario = process.env.POM_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    POM_SCENARIOS.some((id) => id === requestedScenario),
    "POM_SIMULATION_SCENARIO must be The Passage of the Marshes",
  );
const seed = Number(process.env.POM_SIMULATION_SEED ?? 2);

/** What the games showed: the stages reached, Sméagol and the Mire keyword. */
function watcher(observe: (state: GameState) => void) {
  const seen = { maxStage: 0, smeagol: false, mire: 0, lights: false };
  let mireLog = 0;
  const watch = (state: GameState) => {
    observe(state);
    if (!state.passageMarshes) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    if (globalCharacters(state).some((u) => u.code === POM.smeagol))
      seen.smeagol = true;
    if (state.stage === 3) seen.lights = true;
    const discards = state.log.filter((l) =>
      /is discarded by the Mire keyword/.test(l.text),
    ).length;
    // The log keeps its latest entries: count only growth.
    if (discards > mireLog) seen.mire += discards - mireLog;
    mireLog = discards;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of POM_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Passage of the Marshes ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = pomSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        smeagol = 0,
        mire = 0;
      let immediate: ReturnType<typeof runPomGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = pomSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runPomGame(scenario, easy, players, seed, review, watch);
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
        if (seen.smeagol) smeagol++;
        mire += seen.mire;
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
          o.startsWith("choice:The Taming of Sméagol · Reveal a location"),
        ),
        "each player searches for a setup location",
      );
      assert.ok(mire > 0, "the Mire keyword discards locations");
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
          smeagol,
          mire,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts at "Don't Look at the Lights!" with 18 of 24
// progress and Sméagol tamed (pomLights): the players must keep Sméagol and
// clear the Undead enemies to finish the stage.
for (const scenario of POM_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Passage of the Marshes ${scenario} ${easy ? "easy" : "normal"}: "Don't Look at the Lights!" from 18 progress with exact review parity`, (t) => {
      const counts = pomSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        lights = 0;
      let immediate: ReturnType<typeof runPomGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = pomSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runPomGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          pomLights,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.lights) lights++;
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
      assert.equal(
        lights,
        games,
        "every game plays \"Don't Look at the Lights!\"",
      );
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
          lights,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
