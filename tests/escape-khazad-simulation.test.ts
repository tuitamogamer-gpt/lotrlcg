import test from "node:test";
import assert from "node:assert/strict";
import { runEkGame } from "./escape-khazad-simulation-driver";
import { ekBridge, ekFinal, ekLair } from "./escape-khazad-simulation-policy";
import { ekSimulationObserver } from "./escape-khazad-simulation-invariants";
import { EK, escapeKhazadPublicState } from "../src/game/escape-khazad-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.EK_SIMULATION_SEED ?? 2);
// CI runs each difficulty's complete games ("full") and late-game matrices
// ("late") as separate jobs; locally everything runs.
const part = process.env.EK_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);
const difficulty = process.env.EK_SIMULATION_DIFFICULTY ?? "all";
assert.ok(
  ["all", "normal", "easy"].includes(difficulty),
  `unknown difficulty ${difficulty}`,
);
const difficulties = [false, true].filter(
  (easy) => difficulty === "all" || (difficulty === "easy") === easy,
);

/** What the games showed: the quick build, the stages, Dark Pit and Durin's Bane. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      | {
          building: boolean;
          stage2: boolean;
          stage3: boolean;
          sets: number;
          pit: string;
          staged: boolean;
        }
      | undefined,
    maxStage: 0,
    bane: false,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = escapeKhazadPublicState(state);
    if (!q) return;
    // The quick build and 1A's setup end before round 1 begins.
    if (state.round >= 1)
      seen.first ??= {
        building: q.building,
        stage2: !!q.stage2,
        stage3: !!q.stage3,
        sets: q.sets.length,
        pit: q.pit,
        staged: state.staging.length >= 2,
      };
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    if (["staging", "engaged", "victory"].includes(q.bane)) seen.bane = true;
    // Only a stage 3 card's defeat wins; Last Lord of Moria needs Durin's
    // Bane out of play.
    if (state.status === "won") {
      assert.equal(q.stage, 3, "the players win by defeating the stage 3 card");
      if (q.currentQuest === EK.lastLord)
        assert.ok(["victory", "out"].includes(q.bane));
      assert.equal(q.pit, "out");
    }
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : difficulties)
  test(`Escape from Khazad-dûm ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = ekSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0;
    let immediate: ReturnType<typeof runEkGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = ekSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runEkGame(easy, players, seed, review, watch);
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
          pit: "staging",
          staged: true,
        },
        "the quick build chooses both quest cards and 7 sets; 1A stages Dark Pit and the opposing team's cards",
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
          "choice:Escape from Khazad-dûm · Choose encounter set 1 of 7",
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

// The late-game matrices start at the end of Out of the Depths with Dark Pit
// explored and Old One Lair next (ekLair), at the end of A Way Up with The
// Bridge of Khazad-dûm next (ekBridge) and in the last fight at Last Lord of
// Moria, with 15 progress on the stage and Durin's Bane engaged with the
// first player with 2 hit points left (ekFinal).
for (const [label, prepare, players] of [
  ["Out of the Depths into Old One Lair", ekLair, [1, 2, 3]],
  ["A Way Up into The Bridge of Khazad-dûm", ekBridge, [1, 2, 3]],
  [
    "the last fight with Durin's Bane at Last Lord of Moria",
    ekFinal,
    [1, 2, 3],
  ],
] as const)
  for (const easy of part === "full" ? [] : difficulties)
    test(`Escape from Khazad-dûm ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = ekSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        bane = false;
      let immediate: ReturnType<typeof runEkGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = ekSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runEkGame(easy, count, seed, review, watch, prepare);
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxRound = Math.max(maxRound, result.state.round);
        maxStage = Math.max(maxStage, seen.maxStage);
        bane ||= seen.bane;
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
      if (prepare === ekLair)
        assert.ok(
          [...observed].some((entry) =>
            entry.startsWith("choice:Old One Lair · "),
          ),
          "Old One Lair adds an enemy with a resource",
        );
      if (prepare === ekBridge) {
        assert.equal(maxStage, 3, "A Way Up is defeated");
        assert.ok(bane, "Durin's Bane is in play");
      }
      if (prepare === ekFinal) {
        assert.ok(bane, "Durin's Bane is in play");
        assert.ok(outcomes.won > 0, "the last fight can be won");
      }
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
