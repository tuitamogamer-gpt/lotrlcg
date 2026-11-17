import test from "node:test";
import assert from "node:assert/strict";
import { runAdgGame } from "./attack-dol-guldur-simulation-driver";
import {
  ADG_SIM_SCENARIOS,
  adgFinal,
  adgSiege,
} from "./attack-dol-guldur-simulation-policy";
import { adgSimulationObserver } from "./attack-dol-guldur-simulation-invariants";
import {
  ADG,
  ADG_LIEUTENANTS,
  attackDolGuldurPublicState,
} from "../src/game/attack-dol-guldur-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.ADG_SIMULATION_SEED ?? 2);
const scenario = ADG_SIM_SCENARIOS[0];
// CI runs the complete games ("full") and the late-game matrices ("late") as
// separate jobs; locally both run.
const part = process.env.ADG_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);

/** What the games showed: the stages, the city strength and the Lieutenants. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as { city: number; players: number } | undefined,
    quests: new Set<string>(),
    maxStage: 0,
    minCity: 99,
    lieutenants: new Set<string>(),
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = attackDolGuldurPublicState(state);
    if (!q) return;
    seen.first ??= {
      city: q.cityStrength,
      players: state.table?.seats.length ?? 1,
    };
    seen.quests.add(q.currentQuest);
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    seen.minCity = Math.min(seen.minCity, q.cityStrength);
    for (const c of ADG_LIEUTENANTS)
      if (q.lieutenants[c] === "play") seen.lieutenants.add(c);
    // Only a captured Dol Guldur wins: city strength 0, no Lieutenant in play.
    if (state.status === "won") {
      assert.equal(q.cityStrength, 0);
      assert.ok(ADG_LIEUTENANTS.every((c) => q.lieutenants[c] !== "play"));
    }
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : [false, true])
  test(`Attack on Dol Guldur ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = adgSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0;
    let immediate: ReturnType<typeof runAdgGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = adgSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runAdgGame(scenario, easy, players, seed, review, watch);
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += observer.counts()[key];
      assert.equal(
        result.saveChecks,
        result.steps,
        "every actual action has exact save restoration",
      );
      assert.deepEqual(
        seen.first,
        { city: 5 + 5 * players, players },
        "setup sets Dol Guldur's city strength to 5 + 5 per player",
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

// The late-game matrices start at The Siege of Dol Guldur after the
// crossing, with Host of Lórien and Power of Lórien in play and the city
// strength at 4 (adgSiege), and in the last fight at 3B, with the city
// strength at 0 and Bane of Amon Lanc engaged at 3 hit points (adgFinal).
for (const [label, prepare, players] of [
  ["the siege at stage 3", adgSiege, [1, 2, 3]],
  ["the last fight against Bane of Amon Lanc", adgFinal, [1, 2, 3]],
] as const)
  for (const easy of part === "full" ? [] : [false, true])
    test(`Attack on Dol Guldur ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = adgSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const quests = new Set<string>();
      const lieutenants = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        minCity = 99;
      let immediate: ReturnType<typeof runAdgGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = adgSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runAdgGame(
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
        minCity = Math.min(minCity, seen.minCity);
        for (const c of seen.quests) quests.add(c);
        for (const c of seen.lieutenants) lieutenants.add(c);
        for (const entry of result.observed) observed.add(entry);
        assert.ok(seen.quests.has(ADG.siege), "the game reaches 3B");
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
      if (prepare === adgFinal)
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
          minCity,
          quests: [...quests].length,
          lieutenants: [...lieutenants].length,
          ...counts,
        }),
      );
    });
