import test from "node:test";
import assert from "node:assert/strict";
import { runSaGame } from "./annuminas-simulation-driver";
import {
  SA_SIM_SCENARIOS,
  saFinal,
  saSortie,
} from "./annuminas-simulation-policy";
import { saSimulationObserver } from "./annuminas-simulation-invariants";
import { SA, annuminasPublicState } from "../src/game/annuminas-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.SA_SIMULATION_SEED ?? 2);
const scenario = SA_SIM_SCENARIOS[0];
// CI runs the complete games ("full") and the late-game matrices ("late") as
// separate jobs; locally both run.
const part = process.env.SA_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);

/** What the games showed: the stages, the city strength and the Lieutenant. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as { city: number; gate: boolean } | undefined,
    quests: new Set<string>(),
    maxStage: 0,
    minCity: 20,
    lieutenant: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = annuminasPublicState(state);
    if (!q) return;
    seen.first ??= {
      city: q.cityStrength,
      gate: state.staging.some((u) => u.code === SA.gate),
    };
    seen.quests.add(q.currentQuest);
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    seen.minCity = Math.min(seen.minCity, q.cityStrength);
    if (q.lieutenant === "play") seen.lieutenant = true;
    // Only the Lieutenant in the victory display at 3B wins.
    if (state.status === "won") {
      assert.equal(q.currentQuest, SA.sortie);
      assert.equal(q.lieutenant, "victory");
    }
    if (q.cityStrength <= 0) assert.equal(state.status, "lost");
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : [false, true])
  test(`The Siege of Annúminas ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = saSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0,
      minCity = 20;
    let immediate: ReturnType<typeof runSaGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = saSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runSaGame(scenario, easy, players, seed, review, watch);
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += observer.counts()[key];
      assert.equal(
        result.saveChecks,
        result.steps,
        "every actual action has exact save restoration",
      );
      assert.deepEqual(
        seen.first,
        { city: 20, gate: true },
        "setup stages Annúminas at city strength 20 and Gate of Annúminas",
      );
      actions += result.steps;
      games++;
      outcomes[result.state.status as "won" | "lost"]++;
      maxStage = Math.max(maxStage, seen.maxStage);
      maxRound = Math.max(maxRound, result.state.round);
      minCity = Math.min(minCity, seen.minCity);
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
    assert.ok(minCity < 20, "the enemy damages Annúminas");
    t.diagnostic(
      JSON.stringify({
        easy,
        seed,
        games,
        comparisons,
        actions,
        outcomes,
        maxStage,
        maxRound,
        minCity,
        ...counts,
      }),
    );
  });

// The late-game matrices start at the end of Defend the City with two Hosts
// of Angmar in the victory display, so Lead the Sortie begins at once
// (saSortie), and in the last fight at 3B, with Battering Ram explored, 10
// progress on the stage and Lieutenant of Angmar engaged at 3 hit points
// (saFinal).
for (const [label, prepare, players] of [
  ["Lead the Sortie", saSortie, [1, 2, 3]],
  ["the last fight against the Lieutenant", saFinal, [1, 2, 3]],
] as const)
  for (const easy of part === "full" ? [] : [false, true])
    test(`The Siege of Annúminas ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = saSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const quests = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        lieutenant = 0;
      let immediate: ReturnType<typeof runSaGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = saSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runSaGame(
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
        if (seen.lieutenant) lieutenant++;
        for (const c of seen.quests) quests.add(c);
        for (const entry of result.observed) observed.add(entry);
        assert.ok(seen.quests.has(SA.sortie), "the game reaches 3B");
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
      if (prepare === saFinal)
        assert.ok(outcomes.won > 0, "the last fight can be won");
      t.diagnostic(
        JSON.stringify({
          label,
          easy,
          seed,
          games,
          comparisons,
          actions,
          outcomes,
          maxRound,
          lieutenant,
          quests: [...quests].length,
          ...counts,
        }),
      );
    });
