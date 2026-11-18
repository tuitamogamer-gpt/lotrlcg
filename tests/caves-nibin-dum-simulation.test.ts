import test from "node:test";
import assert from "node:assert/strict";
import { runCavesGame } from "./caves-nibin-dum-simulation-driver";
import {
  CAVES_SIM_SCENARIOS,
  cavesChasm,
  cavesFinal,
} from "./caves-nibin-dum-simulation-policy";
import { cavesSimulationObserver } from "./caves-nibin-dum-simulation-invariants";
import { cavesPublicState } from "../src/game/caves-nibin-dum-support";
import type { GameState } from "../src/game/types";

const requestedScenario = process.env.CAVES_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    CAVES_SIM_SCENARIOS.some((id) => id === requestedScenario),
    "CAVES_SIMULATION_SCENARIO must be the-caves-of-nibin-dum-2018 or the-caves-of-nibin-dum",
  );
const seed = Number(process.env.CAVES_SIMULATION_SEED ?? 2);
const scenarios = CAVES_SIM_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
);
// CI runs the complete games ("full") and the late-game matrices ("late") as
// separate jobs for each edition; locally everything runs.
const part = process.env.CAVES_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);

/** What the games showed: the stages, Cave Torch, the Chieftain and the Pillar. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      | { torch: string; chieftain: string; pillar: string; staged: number }
      | undefined,
    maxStage: 0,
    chieftain: false,
    pillarDamage: 0,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = cavesPublicState(state);
    if (!q) return;
    // The setup ends when round 1 begins: Cave Torch is attached and each
    // player has added a location.
    if (state.round >= 1)
      seen.first ??= {
        torch: q.torch,
        chieftain: q.chieftain,
        pillar: q.pillar,
        staged: state.staging.length,
      };
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    if (q.chieftain === "play") seen.chieftain = true;
    seen.pillarDamage = Math.max(seen.pillarDamage, q.pillarDamage);
    // Only 4B's defeat wins, with Goblin Chieftain out of play.
    if (state.status === "won") {
      assert.equal(q.stage, 4, "the players win by defeating Oathkeepers");
      assert.notEqual(q.chieftain, "play", "Goblin Chieftain is not in play");
    }
  };
  return { watch, seen };
}

// Each edition and difficulty has four baseline games and three paced games,
// with three exact terminal-state comparisons.
for (const scenario of part === "late" ? [] : scenarios)
  for (const easy of [false, true])
    test(`The Caves of Nibin-Dûm ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = cavesSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxStage = 0,
        maxRound = 0;
      let immediate: ReturnType<typeof runCavesGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = cavesSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runCavesGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(
          result.saveChecks,
          result.steps,
          "every actual action has exact save restoration",
        );
        assert.deepEqual(
          seen.first,
          {
            torch: "ready",
            chieftain: "aside",
            pillar: "aside",
            staged: players,
          },
          "setup attaches Cave Torch, sets the Chieftain and the Pillar aside and stages a location per player",
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
          `${easy}/${review}: exact final physical state, RNG, resources, damage and outcome match baseline`,
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
      t.diagnostic(
        JSON.stringify({
          scenario,
          easy,
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

// The late-game matrices start at The Chasm with Cracked Pillar in the
// staging area (cavesChasm) and in the last fight at 4B, with 16 progress on
// the stage and Goblin Chieftain engaged at 3 hit points (cavesFinal).
for (const scenario of part === "full" ? [] : scenarios)
  for (const [label, prepare, players] of [
    ["The Chasm and Cracked Pillar", cavesChasm, [1, 2, 3]],
    ["the last fight against Goblin Chieftain", cavesFinal, [1, 2, 3]],
  ] as const)
    for (const easy of [false, true])
      test(`The Caves of Nibin-Dûm ${scenario} ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
        const counts = cavesSimulationObserver().counts();
        const outcomes = { won: 0, lost: 0 };
        const observed = new Set<string>();
        let games = 0,
          comparisons = 0,
          actions = 0,
          maxRound = 0,
          maxStage = 0,
          pillarDamage = 0;
        let immediate: ReturnType<typeof runCavesGame> | undefined;
        function run(count: number, review?: "hidden" | "decisions") {
          const observer = cavesSimulationObserver();
          const { watch, seen } = watcher(observer.observe);
          const result = runCavesGame(
            scenario,
            easy,
            count,
            seed,
            review,
            watch,
            prepare,
          );
          for (const key of Object.keys(counts) as (keyof typeof counts)[])
            counts[key] += observer.counts()[key];
          assert.equal(result.saveChecks, result.steps);
          actions += result.steps;
          games++;
          outcomes[result.state.status as "won" | "lost"]++;
          maxRound = Math.max(maxRound, result.state.round);
          maxStage = Math.max(maxStage, seen.maxStage);
          pillarDamage = Math.max(pillarDamage, seen.pillarDamage);
          for (const entry of result.observed) observed.add(entry);
          assert.ok(seen.maxStage >= 3, "the game reaches 3B");
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
            `${easy}/${review}: exact final state matches baseline`,
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
        if (prepare === cavesFinal)
          assert.ok(outcomes.won > 0, "the last fight can be won");
        t.diagnostic(
          JSON.stringify({
            scenario,
            label,
            easy,
            seed,
            games,
            comparisons,
            actions,
            outcomes,
            maxRound,
            maxStage,
            pillarDamage,
            ...counts,
          }),
        );
      });
