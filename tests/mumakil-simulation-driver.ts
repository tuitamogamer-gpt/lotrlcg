import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { STARTERS, card } from "../src/game/cards";
import {
  applyAction,
  canCommit,
  canPlay,
  canTravel,
  characters,
  createGame,
  enemyAttackPrevented,
  restoreSave,
  stats,
} from "../src/game/engine";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import type { Action, GameState, ReviewMode } from "../src/game/types";
import {
  mumakilSimulationAction,
  mumakilSimulationChoice,
} from "./mumakil-simulation-policy";
import type { MumakilScenario } from "./mumakil-simulation-policy";
import { assertMumakilSaveRestoration } from "./mumakil-simulation-invariants";

export function runMumakilGame(
  scenarioId: MumakilScenario,
  easy: boolean,
  players: number,
  seed: number,
  reviewMode?: ReviewMode,
  observe?: (state: GameState) => void,
) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    seats: STARTERS.slice(0, players).map((p) => ({
      heroes: p.heroes,
      deckId: p.id,
    })),
    scenarioId,
    easy,
    guided: reviewMode !== undefined,
    reviewMode,
  });
  let steps = 0;
  const observed = new Set<string>();
  observe?.(s);
  while ((s.status === "playing" || s.flow?.pending) && steps++ < 4000) {
    if (
      process.env.LOTR_MUMAKIL_TRACE === "steps" ||
      (process.env.LOTR_MUMAKIL_TRACE === "1" && steps % 100 === 0)
    )
      console.error(
        `${scenarioId}/${easy ? "easy" : "normal"}/${players}/${seed}/${reviewMode ?? "immediate"}: step ${steps}, round ${s.round}, ${s.phase}, choice ${s.choice?.title ?? "none"}`,
      );
    let action: Action;
    if (s.flow?.pending)
      action = { type: "CONTINUE", stepId: s.flow.pending.id };
    else if (s.choice) {
      observed.add(`choice:${s.choice.title}`);
      const selected =
        mumakilSimulationChoice(s) ??
        s.choice.options.find((o) => o.id === "skip") ??
        s.choice.options.find((o) => o.id === "resolve") ??
        s.choice.options[0];
      assert.ok(
        selected,
        `${scenarioId}: a pending choice needs a legal option`,
      );
      action = { type: "CHOOSE", id: selected.id };
    } else if (mumakilSimulationAction(s)) action = mumakilSimulationAction(s)!;
    else if (s.phase === "setup") action = { type: "KEEP" };
    else if (s.phase === "planning") {
      const ally = s.hand.find(
        (u) => !canPlay(s, u) && card(u.code).type_code === "ally",
      );
      action = ally ? { type: "PLAY", id: ally.id } : { type: "NEXT" };
    } else if (s.phase === "quest") {
      const ready = characters(s).find(
        (u) => canCommit(s, u) && !s.committedIds.includes(u.id),
      );
      action = ready
        ? { type: "TOGGLE_QUEST", id: ready.id }
        : { type: "COMMIT" };
    } else if (s.phase === "travel") {
      const location = s.staging
        .filter((u) => !canTravel(s, u))
        .sort(
          (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
        )[0];
      action =
        (!s.activeLocation ||
          (s.scenarioId === "the-thing-in-the-depths" && s.stage === 3)) &&
        location
          ? { type: "TRAVEL", id: location.id }
          : { type: "NEXT" };
    } else if (s.phase === "defense") {
      const enemy = engagedEnemies(s).find(
        (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
      );
      assert.ok(
        enemy,
        `${scenarioId}: defense phase needs a legal pending attack`,
      );
      const defender = defendersFor(s, enemy).sort(
        (a, b) => stats(s, b).defense - stats(s, a).defense,
      )[0];
      action = {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    } else if (s.phase === "attack") {
      const enemy = engagedEnemies(s).find(
        (e) =>
          !e.attackedBy?.includes(activeSeat(s)) &&
          attackersFor(s, e).some((u) => ownerOf(s, u) === activeSeat(s)),
      );
      action = enemy
        ? {
            type: "ATTACK",
            enemyId: enemy.id,
            attackerIds: attackersFor(s, enemy).map((u) => u.id),
          }
        : { type: "END_ATTACKS" };
    } else action = { type: "NEXT" };
    observed.add(`action:${action.type}`);
    if (process.env.LOTR_MUMAKIL_TRACE === "steps") {
      mkdirSync("output/mumakil-traces", { recursive: true });
      writeFileSync(
        `output/mumakil-traces/${scenarioId}-${easy ? "easy" : "normal"}-${players}-${seed}-${reviewMode ?? "immediate"}.json`,
        JSON.stringify({ step: steps, state: s, action }, null, 2),
      );
    }
    try {
      const next = applyAction(s, action);
      const savedState = JSON.parse(JSON.stringify(next));
      const restored = restoreSave(savedState);
      assert.ok(restored, `invalid save after ${action.type}`);
      if (observe) {
        assertMumakilSaveRestoration(savedState, restored);
      }
      s = restored;
      observe?.(s);
      assert.ok(allCharacters(s).every((u) => u.damage < stats(s, u).health));
      assert.equal(
        new Set(allCharacters(s).map((u) => u.id)).size,
        allCharacters(s).length,
      );
    } catch (error) {
      const directory = "output/mumakil-simulation";
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        `${directory}/${scenarioId}-${easy ? "easy" : "normal"}-${players}-${seed}-${reviewMode ?? "immediate"}.json`,
        JSON.stringify({ step: steps, state: s, action }, null, 2),
      );
      throw new Error(
        `${scenarioId}/${easy ? "easy" : "normal"}/${players}/${seed}/${reviewMode ?? "immediate"}: step ${steps}, round ${s.round}, phase ${s.phase}, action ${JSON.stringify(action)}: ${error}`,
        { cause: error },
      );
    }
  }
  assert.notEqual(
    s.status,
    "playing",
    `${scenarioId}/${easy}/${players}/${seed}: stalled at ${s.phase} after ${steps} steps`,
  );
  assert.equal(s.flow?.pending ?? null, null);
  return { state: s, steps, observed };
}
