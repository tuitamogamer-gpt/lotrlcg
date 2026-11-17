import test from "node:test";
import assert from "node:assert/strict";
import { runPpGame } from "./prancing-pony-simulation-driver";
import {
  PP_SIM_SCENARIOS,
  ppAccuse,
  ppFinal,
  ppKiller,
} from "./prancing-pony-simulation-policy";
import { ppSimulationObserver } from "./prancing-pony-simulation-invariants";
import {
  PP,
  isSuspect,
  prancingPonyPublicState,
} from "../src/game/prancing-pony-support";
import type { GameState } from "../src/game/types";

const seed = Number(process.env.PP_SIMULATION_SEED ?? 2);
const scenario = PP_SIM_SCENARIOS[0];
// CI runs the complete games ("full") and the late-game matrices ("late") as
// separate jobs; locally both run.
const part = process.env.PP_SIMULATION_PART ?? "all";
assert.ok(["all", "full", "late"].includes(part), `unknown part ${part}`);

/** What the games showed: the stages, the Investigation List and the accusation. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    first: undefined as
      { pony: boolean; manor: boolean; hidden: boolean } | undefined,
    quests: new Set<string>(),
    maxStage: 0,
    investigated: 0,
    accused: false,
  };
  let logged = 0;
  const watch = (state: GameState) => {
    observe(state);
    const q = prancingPonyPublicState(state);
    if (!q) return;
    seen.first ??= {
      pony: state.activeLocation?.code === PP.pony,
      manor: state.staging.some((u) => u.code === PP.manor),
      hidden: q.hidden,
    };
    seen.quests.add(q.currentQuest);
    seen.maxStage = Math.max(seen.maxStage, q.stage);
    if (q.accusation) seen.accused = true;
    for (const l of state.log.slice(logged))
      if (/^Investigate \d+ \(/.test(l.text)) seen.investigated++;
    logged = state.log.length;
    // Only the last Suspect's defeat at 3B wins.
    if (state.status === "won") {
      assert.equal(q.currentQuest, PP.killer);
      assert.ok(
        ![
          ...state.staging,
          ...(state.table?.seats.flatMap((x) => x.engaged ?? []) ??
            state.engaged),
        ].some((u) => isSuspect(u.code)),
      );
    }
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons.
for (const easy of part === "late" ? [] : [false, true])
  test(`Murder at the Prancing Pony ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
    const counts = ppSimulationObserver().counts();
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    let games = 0,
      comparisons = 0,
      actions = 0,
      maxStage = 0,
      maxRound = 0,
      investigated = 0;
    let immediate: ReturnType<typeof runPpGame> | undefined;
    function run(players: number, review?: "all" | "hidden" | "decisions") {
      const observer = ppSimulationObserver();
      const { watch, seen } = watcher(observer.observe);
      const result = runPpGame(scenario, easy, players, seed, review, watch);
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key] += observer.counts()[key];
      assert.equal(
        result.saveChecks,
        result.steps,
        "every actual action has exact save restoration",
      );
      assert.deepEqual(
        seen.first,
        { pony: true, manor: true, hidden: true },
        "1A makes The Prancing Pony active, stages Ramshackle Manor and sets a Suspect and a Hideout aside",
      );
      actions += result.steps;
      games++;
      outcomes[result.state.status as "won" | "lost"]++;
      maxStage = Math.max(maxStage, seen.maxStage);
      maxRound = Math.max(maxRound, result.state.round);
      investigated += seen.investigated;
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
    assert.ok(investigated > 0, "explored locations resolve Investigate");
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
        investigated,
        ...counts,
      }),
    );
  });

// The late-game matrices start at 2B with every Investigation card but the
// facedown pair already seen, so the first player can accuse with certainty
// (ppAccuse), and at 3B after a correct accusation, with the guilty Suspect
// engaged with the first player and its Hideout in the staging area
// (ppKiller); and in the last fight, with the Hideout explored and the
// Suspect at 3 hit points (ppFinal).
for (const [label, prepare, players] of [
  ["the accusation", ppAccuse, [1, 2]],
  ["Apprehending the Killer", ppKiller, [1, 2, 3]],
  ["the last fight against the killer", ppFinal, [1, 2, 3]],
] as const)
  for (const easy of part === "full" ? [] : [false, true])
    test(`Murder at the Prancing Pony ${easy ? "easy" : "normal"}: ${label} with exact review parity`, (t) => {
      const counts = ppSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const quests = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        accused = 0;
      let immediate: ReturnType<typeof runPpGame> | undefined;
      function run(count: number, review?: "hidden" | "decisions") {
        const observer = ppSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runPpGame(
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
        if (seen.accused) accused++;
        for (const c of seen.quests) quests.add(c);
        for (const entry of result.observed) observed.add(entry);
        if (prepare === ppAccuse)
          assert.ok(seen.quests.has(PP.time), "the game resumes at 2B");
        else assert.ok(seen.quests.has(PP.killer), "the game resumes at 3B");
        return result;
      }
      for (const count of players) {
        const result = run(count);
        if (count === 2) immediate = result;
      }
      assert.ok(immediate);
      const reviews =
        prepare === ppAccuse
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
      if (prepare === ppFinal)
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
          accused,
          quests: [...quests].length,
          ...counts,
        }),
      );
    });
