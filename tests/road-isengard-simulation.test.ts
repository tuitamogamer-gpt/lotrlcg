import test from "node:test";
import assert from "node:assert/strict";
import { runRiGame } from "./road-isengard-simulation-driver";
import { RI_SCENARIOS, riVoice } from "./road-isengard-simulation-policy";
import type { GameState } from "../src/game/types";
import { RI } from "../src/game/road-isengard-support";
import { riSimulationObserver } from "./road-isengard-simulation-invariants";
import { globalCharacters } from "../src/game/table";

const requestedScenario = process.env.RI_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    RI_SCENARIOS.some((id) => id === requestedScenario),
    "RI_SIMULATION_SCENARIO must be The Road to Isengard",
  );
const seed = Number(process.env.RI_SIMULATION_SEED ?? 2);

/** What the games showed: the stages reached, the Ents and Saruman. */
function watcher(observe: (state: GameState) => void) {
  const seen = { maxStage: 0, maxBreaking: 0, ents: 0, voice: false };
  const watch = (state: GameState) => {
    observe(state);
    const q = state.roadIsengard;
    if (!q) return;
    seen.maxStage = Math.max(seen.maxStage, state.stage);
    seen.maxBreaking = Math.max(seen.maxBreaking, q.breaking);
    seen.ents = Math.max(
      seen.ents,
      globalCharacters(state).filter((u) => u.code === RI.ent).length,
    );
    if (state.stage === 3) seen.voice = true;
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of RI_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Road to Isengard ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = riSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxStage = 0,
        maxBreaking = 0,
        ents = 0;
      let immediate: ReturnType<typeof runRiGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = riSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runRiGame(scenario, easy, players, seed, review, watch);
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
        maxBreaking = Math.max(maxBreaking, seen.maxBreaking);
        ents = Math.max(ents, seen.ents);
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
        observed.has("action:ABILITY"),
        "the players rouse the Ents with their Quest Action",
      );
      assert.ok(
        observed.has("action:COMMIT"),
        "policy performs actual quest commitments",
      );
      assert.ok(
        [...observed].some((o) =>
          o.startsWith("choice:Rouse the Ents · The players may advance"),
        ),
        "the players decide when to advance from stage 1",
      );
      assert.ok(ents > 0, "some player takes control of an Ent of Fangorn");
      assert.ok(
        maxStage >= 2 && maxBreaking >= 2,
        "the players break Isengard's non-unique locations",
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
          maxBreaking,
          ents,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts at The Voice of Saruman with 12 of 15 progress,
// Saruman beyond his hit points and the four Ents roused (riVoice): the
// players must finish the stage before the Staff wears Saruman's damage down.
for (const scenario of RI_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Road to Isengard ${scenario} ${easy ? "easy" : "normal"}: The Voice of Saruman from 12 progress with exact review parity`, (t) => {
      const counts = riSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        voice = 0;
      let immediate: ReturnType<typeof runRiGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = riSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runRiGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          riVoice,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.voice) voice++;
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
      assert.equal(voice, games, "every game plays The Voice of Saruman");
      assert.ok(outcomes.won > 0, "the players win some of the games");
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
          voice,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
