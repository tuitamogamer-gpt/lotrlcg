import test from "node:test";
import assert from "node:assert/strict";
import { card } from "../src/game/cards";
import {
  applyAction,
  canCommit,
  canPlay,
  canTravel,
  characters,
  createGame,
  enemyAttackPrevented,
  playTargets,
  restoreSave,
  stats,
} from "../src/game/engine";
import { availableAbilities, needsTarget } from "../src/game/actions";
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
import { TREASON_PLAYER as P } from "../src/game/treason-saruman-player-cards";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  riSimulationAction,
  riSimulationChoice,
} from "./road-isengard-simulation-policy";
import { riSimulationObserver } from "./road-isengard-simulation-invariants";
import {
  hdSimulationAction,
  hdSimulationChoice,
} from "./helms-deep-simulation-policy";
import { hdSimulationObserver } from "./helms-deep-simulation-invariants";

/**
 * Complete seeded games with a deck built around The Treason of Saruman
 * player cards. A greedy policy plays every new card and uses every new
 * ability whenever it is legal and accepts every new response; each action
 * is followed by an exact save restoration and, in The Road to Isengard, the
 * scenario's physical-card and privacy observers.
 */
const GIMLI = "143004",
  LEGOLAS = "143005",
  DRAUGHT = "143009",
  CORE_GANDALF = "01073";
const DECK: Record<string, number> = {
  [P.quickbeam]: 3,
  [P.hama]: 3,
  [P.arod]: 3,
  [P.herugrim]: 2,
  [P.entmoot]: 3,
  [P.helm]: 3,
  [P.hunters]: 3,
  [P.shadowfax]: 3,
  [GIMLI]: 2,
  [LEGOLAS]: 2,
  [DRAUGHT]: 3,
  [CORE_GANDALF]: 2,
  "01016": 3, // Snowbourn Scout
  "01062": 3, // Gléowine
  "01013": 3, // Guard of the Citadel
  "01029": 3, // Gondorian Spearman
  "01028": 3, // Veteran Axehand
  "01044": 3, // Lórien Guide
};
const SEATS = [
  // Two spirit heroes pay for Herugrim, Háma and Helm! Helm!.
  { heroes: [P.theoden, P.treebeard, "01007"], deckId: "custom", cards: DECK },
  // The Road Darkens Gandalf carries Shadowfax.
  { heroes: ["01004", "01005", "142002"], deckId: "custom", cards: DECK },
];
type Hooks = {
  choice: (s: GameState) => Option | undefined;
  action: (s: GameState) => Action | undefined;
  observer: () => { observe: (s: GameState) => void };
};
const HOOKS: Partial<Record<ScenarioId, Hooks>> = {
  mirkwood: {
    choice: () => undefined,
    action: () => undefined,
    observer: () => ({ observe: () => undefined }),
  },
  "helms-deep": {
    choice: hdSimulationChoice,
    // Aragorn keeps his resources for The Three Hunters.
    action: (s) => (s.phase === "staging" ? undefined : hdSimulationAction(s)),
    observer: hdSimulationObserver,
  },
  "the-road-to-isengard": {
    choice: riSimulationChoice,
    // Aragorn keeps his resources for The Three Hunters.
    action: (s) => (s.phase === "staging" ? undefined : riSimulationAction(s)),
    observer: riSimulationObserver,
  },
};

/** Responses and choices of the new cards that the policy always takes. */
function treasonChoice(s: GameState): Option | undefined {
  const { title, options } = s.choice!;
  if (/^(Quickbeam|Herugrim) ·/.test(title))
    return options.find((o) => o.id === "use") ?? options[0];
  if (/^Arod ·/.test(title)) return options.find((o) => o.id !== "skip");
  if (/^(Entmoot|Helm! Helm!|The Three Hunters) ·/.test(title))
    return options.find((o) => o.id !== "done") ?? options[0];
  return undefined;
}

const NEW_ABILITIES = [P.treebeard, P.hama, P.shadowfax];
function greedy(s: GameState): Action | undefined {
  for (const u of characters(s))
    for (const option of availableAbilities(s, u)) {
      if (option.disabled) continue;
      const code = option.id
        ? u.attachments.find((a) => a.id === option.id)?.code
        : u.code;
      if (!code || !NEW_ABILITIES.includes(code as never)) continue;
      // Treebeard grows before the quest resolves while he can bear it.
      if (
        code === P.treebeard &&
        (s.phase !== "staging" ||
          !u.committed ||
          stats(s, u).health - u.damage <= 2)
      )
        continue;
      // Háma defends; Shadowfax readies an exhausted Gandalf.
      if (code === P.hama && (s.phase !== "defense" || !u.exhausted)) continue;
      return option.id
        ? { type: "ABILITY", id: u.id, attachmentId: option.id }
        : { type: "ABILITY", id: u.id };
    }
  // The new cards come first.
  const order = [P.helm, P.hunters, P.herugrim, P.shadowfax, P.arod, P.entmoot];
  const hand = [...s.hand].sort(
    (a, b) =>
      (order.includes(b.code as never) ? 1 : 0) -
        (order.includes(a.code as never) ? 1 : 0) ||
      order.indexOf(a.code as never) - order.indexOf(b.code as never),
  );
  // The spirit resources wait for Helm! Helm! while a ready Rohan ally can pay.
  const saveSpirit =
    s.phase === "planning" &&
    s.hand.some((u) => u.code === P.helm) &&
    s.allies.some(
      (u) => !u.exhausted && (card(u.code).traits ?? "").includes("Rohan"),
    );
  for (const u of hand) {
    const c = card(u.code);
    const type = c.type_code;
    if (saveSpirit && c.sphere_code === "spirit" && u.code !== P.helm) continue;
    if (
      type === "event" &&
      ![P.entmoot, P.helm, P.hunters].includes(u.code as never)
    )
      continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (["ally", "attachment"].includes(type) && s.phase !== "planning")
      continue;
    // Arod and Herugrim go to the player's own strongest attacker.
    const own = targets
      .filter((t) => characters(s).some((x) => x.id === t.id))
      .sort((a, b) => stats(s, b).attack - stats(s, a).attack);
    const target = [P.arod, P.herugrim].includes(u.code as never)
      ? (own[0] ?? targets[0])
      : (targets.find((t) => t.code !== TOS_ARAGORN) ?? targets[0]);
    return { type: "PLAY", id: u.id, target: target?.id };
  }
  return undefined;
}

function play(scenarioId: ScenarioId, players: number, seed: number) {
  const hooks = HOOKS[scenarioId]!;
  const observer = hooks.observer();
  const used = new Set<string>();
  let s = createGame(seed, DECK, SEATS[0].heroes, "custom", {
    seats: SEATS.slice(0, players),
    scenarioId,
  });
  observer.observe(s);
  let steps = 0;
  while (s.status === "playing" && steps++ < 4000) {
    let action: Action;
    if (s.choice) {
      const { options } = s.choice;
      const selected =
        treasonChoice(s) ??
        hooks.choice(s) ??
        options.find((o) => o.id === "skip") ??
        options.find((o) => o.id === "resolve") ??
        options[0];
      action = { type: "CHOOSE", id: selected!.id };
    } else if (s.phase === "setup") action = { type: "KEEP" };
    else if (greedy(s)) {
      action = greedy(s)!;
      if (action.type === "PLAY") {
        const id = action.id;
        used.add(s.hand.find((u) => u.id === id)!.code);
      } else if (action.type === "ABILITY") {
        const { id, attachmentId } = action;
        const u = characters(s).find((x) => x.id === id)!;
        used.add(
          `ability:${attachmentId ? u.attachments.find((a) => a.id === attachmentId)!.code : u.code}`,
        );
      }
    } else if (hooks.action(s)) action = hooks.action(s)!;
    else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      // Rohan allies stay ready to pay for Helm! Helm!.
      const helm = s.hand.some((u) => u.code === P.helm);
      const ready = characters(s).find(
        (u) =>
          canCommit(s, u) &&
          !s.committedIds.includes(u.id) &&
          stats(s, u).will > 0 &&
          !(
            helm &&
            card(u.code).type_code === "ally" &&
            (card(u.code).traits ?? "").includes("Rohan")
          ) &&
          // Arod's and Herugrim's characters stay ready to attack.
          !u.attachments.some((a) =>
            [P.arod, P.herugrim].includes(a.code as never),
          ),
      );
      action = ready
        ? { type: "TOGGLE_QUEST", id: ready.id }
        : { type: "COMMIT" };
    } else if (s.phase === "travel") {
      const location = s.staging.find((u) => !canTravel(s, u));
      action =
        !s.activeLocation && location
          ? { type: "TRAVEL", id: location.id }
          : { type: "NEXT" };
    } else if (s.phase === "defense") {
      const enemy = engagedEnemies(s).find(
        (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
      );
      assert.ok(enemy, "defense phase needs a legal pending attack");
      const defenders = defendersFor(s, enemy).filter(
        (u) => u.code !== TOS_ARAGORN,
      );
      const defender =
        defenders.find((u) => u.code === P.hama) ??
        defenders.sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
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
            attackerIds: attackersFor(s, enemy)
              .filter((u) => u.code !== TOS_ARAGORN)
              .map((u) => u.id),
          }
        : { type: "END_ATTACKS" };
      if (action.type === "ATTACK" && !action.attackerIds.length)
        action = { type: "END_ATTACKS" };
    } else action = { type: "NEXT" };
    try {
      const next = applyAction(s, action);
      const saved = JSON.parse(JSON.stringify(next));
      const restored = restoreSave(saved);
      assert.ok(restored, `invalid save after ${action.type}`);
      assert.deepEqual(restored, saved);
      s = restored;
      observer.observe(s);
      assert.ok(allCharacters(s).every((u) => u.damage < stats(s, u).health));
      if (s.used.includes("tsp:theoden-rohan-ally")) used.add("theoden");
    } catch (error) {
      throw new Error(
        `${scenarioId}/${players}/${seed}: step ${steps}, round ${s.round}, ${s.phase}, ${JSON.stringify(action)}: ${error}`,
        { cause: error },
      );
    }
  }
  assert.notEqual(s.status, "playing", `${scenarioId}: stalled at ${s.phase}`);
  for (const [key, pattern] of [
    ["quickbeam", /^Quickbeam takes 1 damage and readies/],
    ["hama", /^Háma readies/],
    ["arod", /^Arod is exhausted/],
    ["herugrim", /^Herugrim: /],
    ["helm", /^Helm! Helm!: .* is discarded\.$/],
    ["hunters", /^The Three Hunters: /],
    ["shadowfax", /^Shadowfax is exhausted/],
    ["treebeard", /^Treebeard takes 1 damage/],
    ["entmoot", /^Entmoot: /],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

const TREASON_PLAYER_GAMES = [
  ["helms-deep", 1, 3],
  ["helms-deep", 1, 8],
  ["the-road-to-isengard", 2, 7],
  ["mirkwood", 1, 9],
  ["mirkwood", 2, 6],
  ["mirkwood", 2, 12],
] as const;

test("Seeded complete games with The Treason of Saruman player cards keep exact saves and the scenario's physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed] of TREASON_PLAYER_GAMES) {
    const r = play(scenarioId, players, seed);
    for (const k of r.used) used.add(k);
    results.push(
      `${scenarioId}/${players}/${seed}: ${r.s.status} after ${r.steps}`,
    );
  }
  const missing = [
    ...[
      P.quickbeam,
      P.hama,
      P.arod,
      P.herugrim,
      P.entmoot,
      P.helm,
      P.hunters,
      P.shadowfax,
    ].filter((code) => !used.has(code)),
    ...[
      `ability:${P.treebeard}`,
      `ability:${P.hama}`,
      `ability:${P.shadowfax}`,
      "theoden",
      "log:quickbeam",
      "log:hama",
      "log:arod",
      "log:herugrim",
      "log:helm",
      "log:hunters",
      "log:shadowfax",
      "log:treebeard",
      "log:entmoot",
    ].filter((key) => !used.has(key)),
  ];
  assert.deepEqual(
    missing,
    [],
    `${results.join("; ")} | used ${[...used].join(", ")}`,
  );
});
