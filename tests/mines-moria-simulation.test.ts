import test from "node:test";
import assert from "node:assert/strict";
import { runMmGame } from "./mines-moria-simulation-driver";
import { mmDrums, mmFinal, mmPresence } from "./mines-moria-simulation-policy";
import { mmSimulationObserver } from "./mines-moria-simulation-invariants";
import { MM, minesMoriaPublicState } from "../src/game/mines-moria-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.MM_SIMULATION_SEED ?? 2);
// CI runs each difficulty's complete games ("full") and late-game matrices
// ("late") as separate jobs; locally everything runs.
const part = process.env.MM_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);
const difficulty = process.env.MM_SIMULATION_DIFFICULTY ?? "all";
assert.ok(
  ["all", "normal", "easy"].includes(difficulty),
  `unknown difficulty ${difficulty}`,
);
const difficulties = [false, true].filter(
  (easy) => difficulty === "all" || (difficulty === "easy") === easy,
);

/** What the games showed: the quick build, the stages, The Watcher and Chamber of Mazarbul. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      | {
          building: boolean;
          stage2: boolean;
          stage3: boolean;
          sets: number;
          watcher: string;
          staged: number;
        }
      | undefined,
    maxStage: 0,
    chamber: false,
    guarded: 0,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = minesMoriaPublicState(state);
    if (!q) return;
    // The quick build and 1A's setup end before round 1 begins.
    if (state.round >= 1)
      seen.first ??= {
        building: q.building,
        stage2: !!q.stage2,
        stage3: !!q.stage3,
        sets: q.sets.length,
        watcher: q.watcher,
        staged: state.staging.length,
      };
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    if (q.chamber !== "out") seen.chamber = true;
    seen.guarded = Math.max(seen.guarded, q.guarded);
    // Only a stage 3 card's defeat wins; The Fate of Balin and Continuing
    // Eastward need Chamber of Mazarbul out of play.
    if (state.status === "won") {
      assert.equal(q.stage, 3, "the players win by defeating the stage 3 card");
      if (q.currentQuest === MM.balin || q.currentQuest === MM.eastward)
        assert.ok(["out", "victory"].includes(q.chamber));
      assert.equal(q.watcher, "out");
    }
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : difficulties)
  test(`The Mines of Moria ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = mmSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0;
    let immediate: ReturnType<typeof runMmGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = mmSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runMmGame(easy, players, seed, review, watch);
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
          building: false,
          stage2: true,
          stage3: true,
          sets: 7,
          watcher: "staging",
          staged: 1,
        },
        "the quick build chooses both quest cards and 7 sets; 1A stages The Watcher",
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
    assert.ok(
      [...observed].some((entry) =>
        entry.startsWith(
          "choice:The Mines of Moria · Choose encounter set 1 of 7",
        ),
      ),
      "the quick build is offered to the first player",
    );
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

// The late-game matrices start at A Presence in the Dark with Chamber of
// Mazarbul in the staging area (mmPresence), at the end of The Long Dark of
// Moria with Drums in the Deep next (mmDrums) and in the last push at The
// Fate of Balin, with 20 progress on the stage and Chamber of Mazarbul the
// active location with 4 of its 5 quest points explored (mmFinal).
for (const [label, prepare, players] of [
  ["A Presence in the Dark with Chamber of Mazarbul", mmPresence, [1, 2, 3]],
  ["The Long Dark of Moria into Drums in the Deep", mmDrums, [1, 2, 3]],
  [
    "the last push into Chamber of Mazarbul at The Fate of Balin",
    mmFinal,
    [1, 2, 3],
  ],
] as const)
  for (const easy of part === "full" ? [] : difficulties)
    test(`The Mines of Moria ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = mmSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        chamber = false;
      let immediate: ReturnType<typeof runMmGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = mmSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runMmGame(easy, count, seed, review, watch, prepare);
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxRound = Math.max(maxRound, result.state.round);
        maxStage = Math.max(maxStage, seen.maxStage);
        chamber ||= seen.chamber;
        for (const entry of result.observed) observed.add(entry);
        assert.ok(seen.maxStage >= 2, "the game reaches stage 2");
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
      assert.ok(chamber, "Chamber of Mazarbul is in play");
      if (prepare === mmPresence)
        assert.ok(
          [...observed].some((entry) =>
            entry.startsWith("choice:A Presence in the Dark · "),
          ),
          "the opposing team orders the top of the encounter deck",
        );
      if (prepare === mmDrums)
        assert.equal(maxStage, 3, "The Long Dark of Moria is defeated");
      if (prepare === mmFinal)
        assert.ok(outcomes.won > 0, "the last push can be won");
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
          maxStage,
          ...counts,
        }),
      );
    });
