import test from "node:test";
import assert from "node:assert/strict";
import { runBgGame } from "./black-gate-simulation-driver";
import { BG_SCENARIOS } from "./black-gate-simulation-policy";
import type { GameState } from "../src/game/types";
import { bgScore } from "../src/game/black-gate-support";
import { bgSimulationObserver } from "./black-gate-simulation-invariants";
import { playerOrder, seatView } from "../src/game/table";

const requestedScenario = process.env.BG_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    BG_SCENARIOS.some((id) => id === requestedScenario),
    "BG_SIMULATION_SCENARIO must be The Black Gate Opens",
  );
const seed = Number(process.env.BG_SIMULATION_SEED ?? 2);

/** What the games showed: the score, Dire's threat and the embassy. */
function watcher(observe: (state: GameState) => void) {
  const seen = { maxScore: 0, direThreat: 0, embassy: false, stage2: false };
  const watch = (state: GameState) => {
    observe(state);
    const q = state.blackGate;
    if (!q) return;
    seen.maxScore = Math.max(seen.maxScore, bgScore(state));
    if (q.embassy?.length) seen.embassy = true;
    if (state.stage === 2) seen.stage2 = true;
    // Dire: players above 50 threat stay in the game.
    if (state.status === "playing")
      for (const p of playerOrder(state))
        if (!state.table?.seats[p]?.eliminated)
          seen.direThreat = Math.max(
            seen.direThreat,
            seatView(state, p).threat,
          );
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. The players cannot win: every game ends
// with their defeat and their result, the resources on The Black Gate.
for (const scenario of BG_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Black Gate Opens ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = bgSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxScore = 0,
        direThreat = 0,
        embassies = 0;
      let immediate: ReturnType<typeof runBgGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = bgSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runBgGame(scenario, easy, players, seed, review, watch);
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(
          result.saveChecks,
          result.steps,
          "every actual action has exact save restoration",
        );
        assert.ok(
          seen.stage2,
          "the embassy leads to The Battle of the Morannon",
        );
        assert.match(
          result.state.reason,
          /The players held the Morannon for \d+ rounds?: \d+ resources? on The Black Gate\.$/,
        );
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason.replace(/ The players held.*$/, ""));
        maxRound = Math.max(maxRound, result.state.round);
        maxScore = Math.max(maxScore, seen.maxScore);
        direThreat = Math.max(direThreat, seen.direThreat);
        if (seen.embassy) embassies++;
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
      assert.equal(outcomes.won, 0, "The Battle of the Morannon cannot be won");
      assert.equal(embassies, 7, "every game resolves the embassy");
      assert.ok(maxScore >= 2, "The Black Gate gathers resources");
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
          maxRound,
          maxScore,
          direThreat,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
