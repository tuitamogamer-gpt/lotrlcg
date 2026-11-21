import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { revealed } from "../src/game/board";
import { flush } from "../src/game/effects";
import { characters, stats } from "../src/game/core";
import {
  applyAction,
  canCommit,
  canTravel,
  createGame,
  enemyAttackPrevented,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { attackersFor, defendersFor } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import type { Action, GameState, ScenarioId, Unit } from "../src/game/types";

export const d = STARTERS[0];
export const reload = (s: GameState) =>
  restoreSave(JSON.parse(JSON.stringify(s)))!;
export const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
export const valid = (s: GameState) =>
  validateSave(JSON.parse(JSON.stringify(s)));
/** A quiet board in the given phase (no pending choice or effects). */
export function calm(s: GameState, phase: GameState["phase"] = "planning") {
  Object.assign(s, { phase, choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
/** Through the setup's choices, mulligans and pending steps. */
export function opening(s: GameState) {
  for (let i = 0; i < 120; i++) {
    if (s.choice) s = choose(s, s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.phase === "setup") s = applyAction(reload(s), { type: "KEEP" });
    else break;
  }
  return s;
}
/** A Nightmare mode game of a supported scenario. */
export const nightmareGame = (scenarioId: ScenarioId, seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, { scenarioId, nightmare: true });
/** A two-player Nightmare mode game. */
export function nightmareForTwo(scenarioId: ScenarioId, seed = 5) {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  return createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId,
    nightmare: true,
    seats,
  });
}
/** An encounter card revealed from the encounter deck (choices answered by `pick`). */
export function reveal(
  s: GameState,
  code: string,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  revealed(s, code);
  flush(s);
  for (let i = 0; i < 40 && s.choice; i++)
    s = choose(s, pick(s) ?? s.choice!.options[0].id);
  return s;
}
/** An attack against `defender` (undefended without one), with a shadow card's effect resolved. */
export function shadow(
  s: GameState,
  enemy: Unit,
  code: string,
  defender?: Unit,
  attackPlayer = 0,
) {
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender?.id,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer,
  } as never;
  enemy.shadows = [code];
  enemy.revealedShadowCount = 1;
  return batch4Scenario(s).shadow!(s, code);
}
/** Answer the current choice in place (a combat fixture is not a saved game). */
export function pick(s: GameState, id: string) {
  const o = s.choice!.options.find((x) => x.id === id)!;
  s.choice = null;
  s.queue.unshift(...o.effects);
  flush(s);
  return s;
}
export const damageOf = (s: GameState) =>
  [...s.heroes, ...s.allies].reduce((n, u) => n + u.damage, 0);

/**
 * A seeded game played to its end by a plain policy (the first option of
 * each choice), each action applied to a restored save that must validate.
 */
export function autoplay(s: GameState, steps = 1500) {
  for (let i = 0; i < steps && s.status === "playing"; i++) {
    let action: Action;
    if (s.flow?.pending)
      action = { type: "CONTINUE", stepId: s.flow.pending.id };
    else if (s.choice) action = { type: "CHOOSE", id: s.choice.options[0].id };
    // The Dead Marshes' escape tests resolve through their own action.
    else if (s.escapeTest) action = { type: "RESOLVE_ESCAPE" };
    // The Black Riders' Hide tests resolve after their action window.
    else if (s.hideTest?.phase === "actions") action = { type: "RESOLVE_HIDE" };
    // The Grey Havens' Sailing tests resolve after their action window.
    else if (s.sailing?.test?.phase === "actions")
      action = { type: "RESOLVE_SAILING" };
    else if (s.phase === "setup") action = { type: "KEEP" };
    else if (s.phase === "quest") {
      const ready = characters(s)
        .filter((u) => canCommit(s, u))
        .sort((a, b) => stats(s, b).will - stats(s, a).will);
      const keep = engagedEnemies(s).length ? 1 : 0;
      const want = ready
        .slice(0, Math.max(ready.length ? 1 : 0, ready.length - keep))
        .map((u) => u.id);
      const missing = want.find((id) => !s.committedIds.includes(id));
      action = missing
        ? { type: "TOGGLE_QUEST", id: missing }
        : { type: "COMMIT" };
    } else if (s.phase === "travel") {
      const loc = s.staging
        .filter((u) => !canTravel(s, u))
        .sort(
          (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
        )[0];
      action =
        !s.activeLocation && loc
          ? { type: "TRAVEL", id: loc.id }
          : { type: "NEXT" };
    } else if (s.phase === "defense") {
      const e = engagedEnemies(s).find(
        (x) => normalAttackPending(s, x) && !enemyAttackPrevented(s, x),
      );
      if (!e) action = { type: "NEXT" };
      else {
        const ready = defendersFor(s, e).sort(
          (a, b) => stats(s, b).defense - stats(s, a).defense,
        );
        action = {
          type: "DEFEND",
          enemyId: e.id,
          defenderId: ready[0]?.id ?? null,
        };
      }
    } else if (s.phase === "attack") {
      const enemy = engagedEnemies(s)
        .filter((e) => !e.attacked && attackersFor(s, e).length)
        .sort(
          (a, b) =>
            stats(s, a).health - a.damage - (stats(s, b).health - b.damage),
        )[0];
      const ready = enemy ? attackersFor(s, enemy) : [];
      action =
        ready.length && enemy
          ? {
              type: "ATTACK",
              enemyId: enemy.id,
              attackerIds: ready.map((u) => u.id),
            }
          : { type: "END_ATTACKS" };
    } else action = { type: "NEXT" };
    try {
      s = applyAction(reload(s), action);
    } catch (error) {
      // A rule that requires every ready character to quest (The Hills of
      // Emyn Muil's Rauros Falls): commit them all.
      if (action.type !== "COMMIT") throw error;
      const rest = characters(s).filter(
        (u) => canCommit(s, u) && !s.committedIds.includes(u.id),
      );
      if (!rest.length) throw error;
      s = applyAction(reload(s), { type: "TOGGLE_QUEST", id: rest[0].id });
    }
    assert.ok(valid(s), `a valid save after ${action.type} (${s.phase})`);
  }
  return s;
}
