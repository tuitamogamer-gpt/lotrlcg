import test from "node:test";
import assert from "node:assert/strict";
import { runHdGame } from "./helms-deep-simulation-driver";
import { HD_SCENARIOS, hdDawn } from "./helms-deep-simulation-policy";
import type { GameState } from "../src/game/types";
import { HD } from "../src/game/helms-deep-support";
import { hdSimulationObserver } from "./helms-deep-simulation-invariants";

const requestedScenario = process.env.HD_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    HD_SCENARIOS.some((id) => id === requestedScenario),
    "HD_SIMULATION_SCENARIO must be Helm's Deep",
  );
const seed = Number(process.env.HD_SIMULATION_SEED ?? 2);

/** What the games showed: the stages reached and The Defense of Helm's Deep. */
function watcher(observe: (state: GameState) => void) {
  const seen = { maxStage: 0, maxTokens: 0, counsels: false, dawn: false };
  const watch = (state: GameState) => {
    observe(state);
    const q = state.helmsDeep;
    if (!q) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    const defense = state.staging.find((u) => u.code === HD.defense);
    seen.maxTokens = Math.max(seen.maxTokens, defense?.resources ?? 0);
    if (q.counsels) seen.counsels = true;
    if (state.stage === 5) seen.dawn = true;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of HD_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Helm's Deep ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = hdSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        maxTokens = 0,
        counsels = 0;
      let immediate: ReturnType<typeof runHdGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = hdSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runHdGame(scenario, easy, players, seed, review, watch);
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
        maxTokens = Math.max(maxTokens, seen.maxTokens);
        if (seen.counsels) counsels++;
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
            "choice:The King of the Golden Hall · The players must choose",
          ),
        ),
        "the players choose Poisoned Counsels or stage 2A",
      );
      assert.ok(counsels > 0, "some games take Poisoned Counsels and stage 1B");
      assert.ok(
        maxStage >= 3,
        "the encounter deck pushes the players through the stages",
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
          maxTokens,
          counsels,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts with The Defense of Helm's Deep at 7 resource
// tokens (hdDawn): the next quest phase sends the players to The King Rides
// Out, which is won once no enemy is in play.
for (const scenario of HD_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`Helm's Deep ${scenario} ${easy ? "easy" : "normal"}: the dawn from 7 Defense tokens with exact review parity`, (t) => {
      const counts = hdSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        dawn = 0;
      let immediate: ReturnType<typeof runHdGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = hdSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runHdGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          hdDawn,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.dawn) dawn++;
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
      assert.ok(dawn >= 2, `The King Rides Out is reached (${dawn})`);
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
          dawn,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
