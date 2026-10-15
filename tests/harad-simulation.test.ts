import test from "node:test";
import assert from "node:assert/strict";
import { runHaradGame } from "./harad-simulation-driver";
import { HARAD_SCENARIOS } from "./harad-simulation-policy";
import { haradSimulationObserver } from "./harad-simulation-invariants";

const requestedPlayers = process.env.HARAD_SIMULATION_PLAYERS;
if (requestedPlayers !== undefined)
  assert.match(
    requestedPlayers,
    /^[1-4](,[1-4])*$/,
    "HARAD_SIMULATION_PLAYERS must list player counts 1–4",
  );
const playerCounts = requestedPlayers
  ? requestedPlayers.split(",").map(Number)
  : [1, 2, 3, 4];
assert.equal(
  new Set(playerCounts).size,
  playerCounts.length,
  "player counts cannot repeat",
);
const requestedScenario = process.env.HARAD_SIMULATION_SCENARIO;
if (requestedScenario !== undefined)
  assert.ok(
    HARAD_SCENARIOS.some((id) => id === requestedScenario),
    "HARAD_SIMULATION_SCENARIO must be an original Harad quest",
  );
const requestedMode = process.env.HARAD_SIMULATION_MODE;
if (requestedMode !== undefined)
  assert.ok(
    ["normal", "easy"].includes(requestedMode),
    "HARAD_SIMULATION_MODE must be normal or easy",
  );

for (const scenario of HARAD_SCENARIOS.filter(
  (id) => !requestedScenario || id === requestedScenario,
))
  for (const easy of [false, true].filter(
    (e) => !requestedMode || requestedMode === (e ? "easy" : "normal"),
  ))
    test(`Harad ${scenario} ${easy ? "easy" : "normal"}: every review mode preserves complete ${requestedPlayers ? `player-count subset [${playerCounts}]` : "1–4 player games"} with restoration after every action`, (t) => {
      const outcomes = { won: 0, lost: 0 },
        observed = new Set<string>();
      const counts = {
        observations: 0,
        privacyComparisons: 0,
        capturedObservations: 0,
        alleyObservations: 0,
        mirageObservations: 0,
        advancedObservations: 0,
      };
      let games = 0,
        comparisons = 0,
        actions = 0;
      for (const players of playerCounts) {
        let immediate: ReturnType<typeof runHaradGame> | undefined;
        for (const review of [
          undefined,
          "all",
          "hidden",
          "decisions",
        ] as const) {
          const observer = haradSimulationObserver();
          const result = runHaradGame(
            scenario,
            easy,
            players,
            11,
            review,
            observer.observe,
          );
          for (const key of Object.keys(counts) as (keyof typeof counts)[])
            counts[key] += observer.counts()[key];
          games++;
          actions += result.steps;
          for (const entry of result.observed) observed.add(entry);
          if (review === undefined) {
            immediate = result;
            outcomes[result.state.status as "won" | "lost"]++;
          } else {
            const { flow, ...paced } = result.state;
            assert.deepEqual(
              paced,
              immediate!.state,
              `${scenario}/${players}/${review}: physical cards, damage, resources, RNG and result match immediate play`,
            );
            assert.equal(flow!.mode, review);
            assert.equal(flow!.pending, null);
            comparisons++;
          }
        }
      }
      assert.equal(games, playerCounts.length * 4);
      assert.equal(comparisons, playerCounts.length * 3);
      assert.ok(
        counts.privacyComparisons > 0,
        "complete games conceal unrevealed encounter order",
      );
      assert.ok(
        observed.has("action:COMMIT"),
        "complete games use actual quest commitments",
      );
      t.diagnostic(
        JSON.stringify({
          scenario,
          easy,
          seed: 11,
          playerCounts,
          subset: requestedPlayers !== undefined,
          games,
          comparisons,
          outcomes,
          actions,
          decisions: observed.size,
          ...counts,
        }),
      );
    });
