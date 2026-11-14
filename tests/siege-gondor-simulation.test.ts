import test from "node:test";
import assert from "node:assert/strict";
import { runSgGame } from "./siege-gondor-simulation-driver";
import { SG_SCENARIOS, sgShips } from "./siege-gondor-simulation-policy";
import type { GameState } from "../src/game/types";
import {
  SG,
  sgFleetResources,
  sgShipsInVictory,
} from "../src/game/siege-gondor-support";
import { sgSimulationObserver } from "./siege-gondor-simulation-invariants";
import { globalEngaged } from "../src/game/table";

const requestedScenario = process.env.SG_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    SG_SCENARIOS.some((id) => id === requestedScenario),
    "SG_SIMULATION_SCENARIO must be The Siege of Gondor",
  );
const seed = Number(process.env.SG_SIMULATION_SEED ?? 2);

/** What the games showed: The Corsair Fleet, the Ships and Great Corsair Ship. */
function watcher(observe: (state: GameState) => void) {
  const seen = {
    maxFleet: 0,
    maxShips: 0,
    shipActive: false,
    greatShipActive: false,
    captain: false,
  };
  let priorFleet = 0;
  const watch = (state: GameState) => {
    observe(state);
    const q = state.siegeGondor;
    if (!q) return;
    const fleet = sgFleetResources(state);
    // The Corsair Fleet only ever gains resources, 1 at a time.
    assert.ok(fleet >= priorFleet && fleet <= priorFleet + 1);
    priorFleet = fleet;
    seen.maxFleet = Math.max(seen.maxFleet, fleet);
    seen.maxShips = Math.max(seen.maxShips, sgShipsInVictory(state));
    const active = state.activeLocation?.code;
    if (active === SG.galley || active === SG.dromon) seen.shipActive = true;
    if (active === SG.greatShip) seen.greatShipActive = true;
    if (
      [...state.staging, ...globalEngaged(state)].some(
        (u) => u.code === SG.captain,
      )
    )
      seen.captain = true;
    // The Corsair Fleet never leaves the staging area.
    assert.ok(state.staging.some((u) => u.code === SG.fleet));
  };
  return { watch, seen };
}

// Each difficulty has four baseline games and three paced games, with three
// exact terminal-state comparisons. CI partitions this same matrix by scenario.
for (const scenario of SG_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Siege of Gondor ${scenario} ${easy ? "easy" : "normal"}: bounded complete games and exact review parity`, (t) => {
      const counts = sgSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const observed = new Set<string>();
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        maxFleet = 0,
        maxShips = 0,
        shipActive = 0;
      let immediate: ReturnType<typeof runSgGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = sgSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runSgGame(scenario, easy, players, seed, review, watch);
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
        maxFleet = Math.max(maxFleet, seen.maxFleet);
        maxShips = Math.max(maxShips, seen.maxShips);
        if (seen.shipActive) shipActive++;
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
        observed.has("action:COMMIT"),
        "policy performs actual quest commitments",
      );
      assert.ok(
        [...observed].some((o) => o.startsWith("choice:The Corsair Fleet")),
        "The Corsair Fleet strikes each player at the beginning of the staging step",
      );
      assert.ok(maxFleet >= 2, "The Corsair Fleet gathers resources");
      assert.ok(shipActive > 0, "the players travel to Ship locations");
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
          maxFleet,
          maxShips,
          shipActive,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });

// The late-game matrix starts with three Ship locations in the victory
// display, The Corsair Fleet at 2 resources and 15 progress on Attack on
// Pelargir (sgShips): the players take Great Corsair Ship to win.
for (const scenario of SG_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true])
    test(`The Siege of Gondor ${scenario} ${easy ? "easy" : "normal"}: Great Corsair Ship with exact review parity`, (t) => {
      const counts = sgSimulationObserver().counts();
      const outcomes = { won: 0, lost: 0 };
      const reasons = new Set<string>();
      let games = 0,
        comparisons = 0,
        actions = 0,
        maxRound = 0,
        greatShip = 0,
        captain = 0;
      let immediate: ReturnType<typeof runSgGame> | undefined;
      function run(players: number, review?: "all" | "hidden" | "decisions") {
        const observer = sgSimulationObserver();
        const { watch, seen } = watcher(observer.observe);
        const result = runSgGame(
          scenario,
          easy,
          players,
          seed,
          review,
          watch,
          sgShips,
        );
        for (const key of Object.keys(counts) as (keyof typeof counts)[])
          counts[key] += observer.counts()[key];
        assert.equal(result.saveChecks, result.steps);
        actions += result.steps;
        games++;
        outcomes[result.state.status as "won" | "lost"]++;
        reasons.add(result.state.reason);
        maxRound = Math.max(maxRound, result.state.round);
        if (seen.greatShipActive) greatShip++;
        if (seen.captain) captain++;
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
      assert.ok(greatShip > 0, "the players travel to Great Corsair Ship");
      assert.ok(captain > 0, "Great Corsair Ship brings Corsair Captain");
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
          greatShip,
          captain,
          reasons: [...reasons],
          ...counts,
        }),
      );
    });
