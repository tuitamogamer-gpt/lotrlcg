import test from "node:test";
import assert from "node:assert/strict";
import { runUhGame } from "./uruk-hai-simulation-driver";
import { UH_SCENARIOS, uhStageTwo } from "./uruk-hai-simulation-policy";
import type { GameState } from "../src/game/types";
import { uhSimulationObserver } from "./uruk-hai-simulation-invariants";

const requestedScenario = process.env.UH_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    UH_SCENARIOS.some((id) => id === requestedScenario),
    "UH_SIMULATION_SCENARIO must be The Uruk-hai",
  );
const seed = Number(process.env.UH_SIMULATION_SEED ?? 2);

/** What the games showed: the pursuit value, the Captives and the Uruk-hai. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    maxPursuit: 0,
    pursuitReduced: false,
    grishnakh: false,
    captiveLost: false,
    stageTwo: false,
  };
  let pursuit: number | undefined, captives: number | undefined;
  const watch = (state: GameState) => {
    observe(state);
    const q = state.urukHai;
    if (!q) return;
    seen.maxPursuit = Math.max(seen.maxPursuit, q.pursuit);
    if (pursuit !== undefined && q.pursuit < pursuit)
      seen.pursuitReduced = true;
    if (q.captives.some((c) => c.holder)) seen.grishnakh = true;
    if (captives !== undefined && q.captives.length < captives)
      seen.captiveLost = true;
    if (q.currentQuest === q.currentQuest && state.stage === 2)
      seen.stageTwo = true;
    pursuit = q.pursuit;
    captives = q.captives.length || captives;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of UH_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Uruk-hai ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = uhSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxPursuit = 0,
        stageTwo = 0;
      let immediate: ReturnType<typeof runUhGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = uhSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runUhGame(scenario, easy, players, seed, review, watch);
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
        maxPursuit = Math.max(maxPursuit, seen.maxPursuit);
        if (seen.stageTwo) stageTwo++;
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
            "choice:Follow the Orcs · Choose a hero to be a Captive",
          ),
        ),
        "each player chooses a Captive",
      );
      assert.ok(maxPursuit > 10, "the pursuit value rises");
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
          maxPursuit,
          stageTwo,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts at stage 2 (uhStageTwo), with an Uruk-hai
// enemy for each player in the staging area: Uglúk can be engaged and
// defeated, and each defeated enemy reduces the pursuit value.
for (const scenario of UH_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Uruk-hai ${scenario} ${easy ? "easy" : "normal"}: Rescue the Captives from stage 2 with exact review parity`, (t) => {
      const counts = uhSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        reduced = 0;
      let immediate: ReturnType<typeof runUhGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = uhSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runUhGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          uhStageTwo,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.pursuitReduced) reduced++;
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
          reduced,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
