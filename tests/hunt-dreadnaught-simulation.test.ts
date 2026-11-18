import test from "node:test";
import assert from "node:assert/strict";
import { runHdGame, type HdMode } from "./hunt-dreadnaught-simulation-driver";
import {
  hdArrival,
  hdFinal,
  hdHunt,
} from "./hunt-dreadnaught-simulation-policy";
import { hdSimulationObserver } from "./hunt-dreadnaught-simulation-invariants";
import { huntDreadnaughtPublicState } from "../src/game/hunt-dreadnaught-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.HD_SIMULATION_SEED ?? 2);
// CI runs each mode's complete games ("full") and late-game matrices
// ("late") as separate jobs; locally everything runs.
const part = process.env.HD_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);
const only = process.env.HD_SIMULATION_MODE ?? "all";
assert.ok(
  ["all", "standard", "hard", "easy"].includes(only),
  `unknown mode ${only}`,
);
const modes = (["standard", "hard", "easy"] as HdMode[]).filter(
  (mode) => only === "all" || only === mode,
);

/** What the games showed: the fleet, the Setup card, the stages and the Dreadnaught. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      { fleet: number; mode: string | null; corsairs: number } | undefined,
    maxStage: 0,
    dreadnaught: false,
    damaged: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = huntDreadnaughtPublicState(state);
    if (!q) return;
    // The fleet and the Setup card are settled before round 1 begins.
    if (state.round >= 1)
      seen.first ??= {
        fleet: q.ships.length,
        mode: q.mode,
        corsairs: q.corsairDeck + q.corsairDiscard.length,
      };
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    if (q.dreadnaught === "elite" || q.dreadnaught === "damaged")
      seen.dreadnaught = true;
    if (q.dreadnaught === "damaged") seen.damaged = true;
    // Only the Dreadnaught's destruction wins.
    if (state.status === "won") {
      assert.equal(q.stage, 2, "the players win at Destroy the Dreadnaught");
      assert.equal(q.dreadnaught, "gone");
    }
  };
  return { watch, seen };
}

// Each mode has four baseline games and three paced games, with three exact
// terminal-state comparisons.
for (const mode of part === "late" ? [] : modes)
  test(`The Hunt for the Dreadnaught ${mode}: bounded complete games and exact review parity`, (t) => {
    const counts = hdSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0;
    let immediate: ReturnType<typeof runHdGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = hdSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runHdGame(mode, players, seed, review, watch);
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += observer.counts()[key];
      assert.equal(
        result.saveChecks,
        result.steps,
        "every actual action has exact save restoration",
      );
      assert.deepEqual(
        seen.first,
        { fleet: players, mode, corsairs: 13 },
        "each player controls a ship; the Setup card is chosen; the Corsair deck holds the 13 Corsairs",
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
        `${mode}/${review}: exact final physical state, RNG, resources, damage and outcome match baseline`,
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
    assert.ok(observed.has("action:COMMIT"), "policy commits to the quest");
    assert.ok(
      [...observed].some((entry) =>
        entry.startsWith("choice:Prepare your fleet · Choose your ship"),
      ),
      "each player chooses a ship",
    );
    t.diagnostic(
      JSON.stringify({
        mode,
        seed,
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

// The late-game matrices start at the end of Searching the High Seas with
// all of its progress (hdArrival), at Destroy the Dreadnaught with the Elite
// Dreadnaught staged (hdHunt) and in the last fight against the Damaged
// Dreadnaught with 3 hit points left (hdFinal).
for (const [label, prepare, players] of [
  ["the arrival of the Dreadnaught", hdArrival, [1, 2]],
  ["the hunt at Destroy the Dreadnaught", hdHunt, [1, 2]],
  ["the last fight with the Damaged Dreadnaught", hdFinal, [1, 2]],
] as const)
  for (const mode of part === "full" ? [] : modes)
    test(`The Hunt for the Dreadnaught ${mode}: ${label} with exact review parity`, (t) => {
      const counts = hdSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        dreadnaught = false;
      let immediate: ReturnType<typeof runHdGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = hdSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runHdGame(mode, count, seed, review, watch, prepare);
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxRound = Math.max(maxRound, result.state.round);
        maxStage = Math.max(maxStage, seen.maxStage);
        dreadnaught ||= seen.dreadnaught;
        for (const entry of result.observed) observed.add(entry);
        return result;
      }
      for (const count of players) {
        const result = run(count);
        if (count === 2) immediate = result;
      }
      assert.ok(immediate);
      const reviews = ["hidden", "decisions"] as const;
      for (const review of reviews) {
        const result = run(2, review);
        const { flow, ...paced } = result.state;
        assert.deepEqual(
          paced,
          immediate.state,
          `${mode}/${review}: exact final state matches baseline`,
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
      if (prepare === hdArrival) {
        assert.equal(maxStage, 2, "Searching the High Seas is defeated");
        assert.ok(dreadnaught, "2A adds the Dreadnaught");
      }
      if (prepare === hdHunt) assert.ok(dreadnaught);
      if (prepare === hdFinal)
        assert.ok(outcomes.won > 0, "the last fight can be won");
      t.diagnostic(
        JSON.stringify({
          label,
          mode,
          seed,
          games,
          comparisons,
          actions,
          outcomes,
          maxRound,
          maxStage,
          ...counts,
        }),
      );
    });
