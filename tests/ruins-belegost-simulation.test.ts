import test from "node:test";
import assert from "node:assert/strict";
import { runRbGame } from "./ruins-belegost-simulation-driver";
import {
  RB_SIM_SCENARIOS,
  rbBeast,
  rbFinal,
  rbMines,
} from "./ruins-belegost-simulation-policy";
import { rbSimulationObserver } from "./ruins-belegost-simulation-invariants";
import {
  RB,
  ruinsBelegostPublicState,
} from "../src/game/ruins-belegost-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.RB_SIMULATION_SEED ?? 2);
const scenario = RB_SIM_SCENARIOS[0];
// CI runs the complete games ("full") and the late-game matrices ("late") as
// separate jobs; locally both run.
const part = process.env.RB_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);

/** What the games showed: quest cards, Discover, Loot and Naurlhûg. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      { stalking: boolean; mines: number; hidden: boolean } | undefined,
    quests: new Set<string>(),
    maxStage: 0,
    discovers: 0,
    loot: 0,
    naurlhug: false,
  };
  let logged = 0;
  const watch = (state: GameState) => {
    observe(state);
    const q = ruinsBelegostPublicState(state);
    if (!q) return;
    seen.first ??= {
      stalking: state.staging.some((u) => u.code === RB.stalking),
      mines: state.staging.filter((u) => u.code === RB.mine).length,
      hidden: q.hidden,
    };
    seen.quests.add(q.currentQuest);
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    seen.loot = Math.max(seen.loot, q.loot.length);
    if (q.naurlhug === "play") seen.naurlhug = true;
    for (const l of state.log.slice(logged))
      if (/^Discover \d+ \(/.test(l.text)) seen.discovers++;
    logged = state.log.length;
    // Only Naurlhûg's defeat at 4B wins.
    if (state.status === "won") {
      assert.equal(q.currentQuest, RB.beast);
      assert.equal(q.naurlhug, "gone");
    }
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : [false, true])
  test(`The Ruins of Belegost ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = rbSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0,
      discovers = 0,
      naurlhug = 0;
    let immediate: ReturnType<typeof runRbGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = rbSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runRbGame(scenario, easy, players, seed, review, watch);
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += observer.counts()[key];
      assert.equal(
        result.saveChecks,
        result.steps,
        "every actual action has exact save restoration",
      );
      assert.deepEqual(
        seen.first,
        { stalking: true, mines: players, hidden: true },
        "1A stages Stalking the Ruins and an Abandoned Mine per player, with a Loot underneath",
      );
      actions += result.steps;
      games++;
      outcomes[result.state.status as "won" | "lost"]++;
      maxStage = Math.max(maxStage, seen.maxStage);
      maxRound = Math.max(maxRound, result.state.round);
      discovers += seen.discovers;
      if (seen.naurlhug) naurlhug++;
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
    assert.ok(discovers > 0, "locations resolve the Discover keyword");
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
        discovers,
        naurlhug,
        ...counts,
      }),
    );
  });

// The late-game matrices start at the end of Deeper into the Past with Keys
// of Belegost and Book of Aulë's Children claimed, so the quest goes on at The
// Mines of Belegost (rbMines); at the end of The Servants of Morgoth with
// Dwarven Torch claimed, Naurlhûg's Lair explored and Sword of Belegost on a
// hero, so The Beast of Belegost begins at once (rbBeast); and in the last
// fight at 4B, with Naurlhûg engaged and 6 hit points left (rbFinal).
for (const [label, prepare, players] of [
  ["The Mines of Belegost and the stage 3 loop", rbMines, [1, 2]],
  ["The Beast of Belegost and Naurlhûg", rbBeast, [1, 2, 3]],
  ["the last fight against Naurlhûg", rbFinal, [1, 2, 3]],
] as const)
  for (const easy of part === "full" ? [] : [false, true])
    test(`The Ruins of Belegost ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = rbSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const quests = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        discovers = 0,
        naurlhug = 0;
      let immediate: ReturnType<typeof runRbGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = rbSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runRbGame(
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
        discovers += seen.discovers;
        if (seen.naurlhug) naurlhug++;
        for (const c of seen.quests) quests.add(c);
        for (const entry of result.observed) observed.add(entry);
        if (prepare === rbMines)
          assert.ok(seen.quests.has(RB.mines), "2D leads to 3E with the Book");
        else if (prepare === rbBeast) {
          assert.ok(seen.quests.has(RB.beast), "3B leads to 4A with the Torch");
          assert.ok(seen.naurlhug, "4A adds Naurlhûg to the staging area");
        } else assert.ok(seen.naurlhug, "Naurlhûg fights at 4B");
        return result;
      }
      for (const count of players) {
        const result = run(count);
        if (count === 2) immediate = result;
      }
      assert.ok(immediate);
      const reviews =
        prepare === rbMines
          ? (["decisions"] as const)
          : (["hidden", "decisions"] as const);
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
      if (prepare === rbFinal)
        assert.ok(outcomes.won > 0, "the last fight can be won");
      assert.ok(counts.privacyComparisons > 0);
      assert.equal(counts.idempotenceChecks, counts.boundaryObservations);
      assert.equal(counts.renderPurityChecks, counts.boundaryObservations);
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
          discovers,
          naurlhug,
          quests: [...quests].length,
          ...counts,
        }),
      );
    });
