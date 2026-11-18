import test from "node:test";
import assert from "node:assert/strict";
import { runWqGame } from "./wizards-quest-simulation-driver";
import {
  wqDungeons,
  wqFinal,
  wqTerror,
} from "./wizards-quest-simulation-policy";
import { wqSimulationObserver } from "./wizards-quest-simulation-invariants";
import { WQ, wizardsQuestPublicState } from "../src/game/wizards-quest-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.WQ_SIMULATION_SEED ?? 2);
// CI runs each difficulty's complete games ("full") and late-game matrices
// ("late") as separate jobs; locally everything runs.
const part = process.env.WQ_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);
const difficulty = process.env.WQ_SIMULATION_DIFFICULTY ?? "all";
assert.ok(
  ["all", "normal", "easy"].includes(difficulty),
  `unknown difficulty ${difficulty}`,
);
const difficulties = [false, true].filter(
  (easy) => difficulty === "all" || (difficulty === "easy") === easy,
);

/** What the games showed: the quick build, the stages, Rider of Mirkwood and the guarded heroes. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      | {
          building: boolean;
          stage2: boolean;
          stage3: boolean;
          sets: number;
          rhosgobel: string;
          staged: number;
        }
      | undefined,
    maxStage: 0,
    rider: false,
    guarded: 0,
  };
  const watch = (state: GameState) => {
    observe(state);
    const q = wizardsQuestPublicState(state);
    if (!q) return;
    // The quick build and 1A's setup end before round 1 begins.
    if (state.round >= 1)
      seen.first ??= {
        building: q.building,
        stage2: !!q.stage2,
        stage3: !!q.stage3,
        sets: q.sets.length,
        rhosgobel: q.rhosgobel,
        staged: state.staging.length,
      };
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    if (q.rider !== "out") seen.rider = true;
    seen.guarded = Math.max(seen.guarded, q.guardedHeroes);
    // Only a stage 3 card's defeat wins; Return to Rhosgobel needs Rider of
    // Mirkwood out of play.
    if (state.status === "won") {
      assert.equal(q.stage, 3, "the players win by defeating the stage 3 card");
      if (q.currentQuest === WQ.return)
        assert.ok(["out", "victory"].includes(q.rider));
      assert.equal(q.guardedHeroes, 0);
    }
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : difficulties)
  test(`The Wizard's Quest ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = wqSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0;
    let immediate: ReturnType<typeof runWqGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = wqSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runWqGame(easy, players, seed, review, watch);
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
          rhosgobel: "staging",
          staged: players + 1,
        },
        "the quick build chooses both quest cards and 7 sets; 1A stages Rhosgobel and a 0 cost card per player",
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
          "choice:The Wizard's Quest · Choose encounter set 1 of 7",
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

// The late-game matrices start at A New Terror Abroad with Rider of Mirkwood
// in the staging area (wqTerror), at the end of Carried Away with Dungeons of
// the Necromancer next (wqDungeons) and in the last fight at Return to
// Rhosgobel, with 10 progress on the stage and Rider of Mirkwood engaged at 3
// hit points (wqFinal).
for (const [label, prepare, players] of [
  ["A New Terror Abroad with Rider of Mirkwood", wqTerror, [1, 2, 3]],
  ["Carried Away into Dungeons of the Necromancer", wqDungeons, [1, 2, 3]],
  ["the last fight against Rider of Mirkwood", wqFinal, [1, 2, 3]],
] as const)
  for (const easy of part === "full" ? [] : difficulties)
    test(`The Wizard's Quest ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = wqSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        guarded = 0;
      let immediate: ReturnType<typeof runWqGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = wqSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runWqGame(easy, count, seed, review, watch, prepare);
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        maxRound = Math.max(maxRound, result.state.round);
        maxStage = Math.max(maxStage, seen.maxStage);
        guarded = Math.max(guarded, seen.guarded);
        for (const entry of result.observed) observed.add(entry);
        assert.ok(seen.maxStage >= 2, "the game reaches stage 2");
        assert.ok(seen.rider, "Rider of Mirkwood is in play");
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
      if (prepare === wqTerror)
        assert.ok(
          observed.has("choice:Rider of Mirkwood · Immediate attack"),
          "Rider of Mirkwood attacks at the beginning of the quest phase",
        );
      if (prepare === wqDungeons) {
        assert.equal(maxStage, 3, "Carried Away is defeated");
        assert.ok(guarded > 0, "heroes are guarded in the dungeons");
      }
      if (prepare === wqFinal)
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
          maxStage,
          guarded,
          ...counts,
        }),
      );
    });
