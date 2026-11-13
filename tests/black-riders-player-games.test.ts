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
import { get } from "../src/game/core";
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
import { BLACK_RIDERS_PLAYER as B } from "../src/game/black-riders-player-cards";
import { SAGA_FRODO } from "../src/game/lotr-saga-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  spSimulationAction,
  spSimulationChoice,
} from "./shadow-past-simulation-policy";
import { spSimulationObserver } from "./shadow-past-simulation-invariants";

/**
 * Complete seeded games with a Hobbit deck built around The Black Riders
 * player cards. A greedy policy plays every new card and ability whenever it
 * is legal and accepts every new response; each action is followed by an
 * exact save restoration and, in A Shadow of the Past, the scenario's
 * physical-card and privacy observers.
 */
const DECK: Record<string, number> = {
  [B.bill]: 3,
  [B.barliman]: 3,
  [B.maggot]: 3,
  [B.determination]: 3,
  [B.smoke]: 3,
  [B.notice]: 3,
  [B.intuition]: 3,
  [B.cloak]: 3,
  [B.dagger]: 3,
  [B.pipe]: 3,
  "01043": 3, // Wandering Took (Hobbit)
  "01016": 3, // Snowbourn Scout
  "01013": 3, // Guard of the Citadel
  "01029": 3, // Gondorian Spearman
  "01028": 3, // Veteran Axehand
  "01059": 3, // Erebor Hammersmith
  "01062": 2, // Gléowine
};
const NEW_EVENTS: string[] = [B.determination, B.smoke, B.notice, B.intuition];
const SEATS = [
  { heroes: [B.sam, B.merry, B.fatty], deckId: "custom", cards: DECK },
  { heroes: [B.pippin, "01005", "01004"], deckId: "custom", cards: DECK },
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
  "a-shadow-of-the-past": {
    choice: spSimulationChoice,
    action: spSimulationAction,
    observer: spSimulationObserver,
  },
};

/** Responses and choices of the new cards that the policy always takes. */
function blackRidersChoice(
  s: GameState,
  used: Set<string>,
): Option | undefined {
  const { title, options } = s.choice!;
  if (/^(Sam Gamgee|Pippin|Hobbit Pipe) ·/.test(title))
    return options.find((o) => o.id === "use");
  if (/^(Merry|Farmer Maggot|Fatty Bolger) ·/.test(title))
    return options.find((o) => o.id !== "skip");
  // Barliman takes undefended damage whenever he is offered and can survive.
  if (/^Assign \d+ damage/.test(title)) {
    const barliman = options.find((o) => get(s, o.id)?.code === B.barliman);
    const amount = Number(/Assign (\d+)/.exec(title)![1]);
    const u = barliman && get(s, barliman.id);
    if (u && stats(s, u).health - u.damage > amount) {
      used.add("barliman");
      return barliman;
    }
  }
  return undefined;
}

function greedy(s: GameState): Action | undefined {
  // Fatty Bolger, after the staging step, when the quest is in danger.
  if (s.phase === "staging")
    for (const u of characters(s))
      for (const option of availableAbilities(s, u))
        if (!option.disabled && u.code === B.fatty && !option.id)
          return { type: "ABILITY", id: u.id };
  for (const u of s.hand) {
    const type = card(u.code).type_code;
    if (type === "event" && !NEW_EVENTS.includes(u.code)) continue;
    if (u.code === B.notice && s.phase !== "staging") continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (type === "ally" && s.phase !== "planning") continue;
    if (type === "attachment" && s.phase !== "planning") continue;
    // Frodo stays out of the Hobbit Cloak and Pipe targets' way.
    const target = targets.find((t) => t.code !== SAGA_FRODO) ?? targets[0];
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
        blackRidersChoice(s, used) ??
        hooks.choice(s) ??
        options.find((o) => o.id === "skip") ??
        options.find((o) => o.id === "resolve") ??
        options[0];
      action = { type: "CHOOSE", id: selected!.id };
    } else if (hooks.action(s)) action = hooks.action(s)!;
    else if (s.phase === "setup") action = { type: "KEEP" };
    else if (greedy(s)) {
      action = greedy(s)!;
      used.add(
        action.type === "PLAY"
          ? s.hand.find((u) => u.id === action.id)!.code
          : "ability:fatty",
      );
    } else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      const ready = characters(s).find(
        (u) =>
          canCommit(s, u) &&
          !s.committedIds.includes(u.id) &&
          // Fatty stays ready for his action and Merry for the attacks.
          u.code !== B.fatty &&
          u.code !== B.merry &&
          stats(s, u).will > 0,
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
        (u) => u.code !== SAGA_FRODO,
      );
      const defender = defenders.sort(
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
            attackerIds: attackersFor(s, enemy)
              .filter((u) => u.code !== SAGA_FRODO)
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
    } catch (error) {
      throw new Error(
        `${scenarioId}/${players}/${seed}: step ${steps}, round ${s.round}, ${s.phase}, ${JSON.stringify(action)}: ${error}`,
        { cause: error },
      );
    }
  }
  assert.notEqual(s.status, "playing", `${scenarioId}: stalled at ${s.phase}`);
  for (const [key, pattern] of [
    ["sam", /^Sam Gamgee readies/],
    ["pippin", /^Pippin: his controller draws/],
    ["merry", /^Merry readies/],
    ["maggot", /^Farmer Maggot deals/],
    ["fatty", /^Fatty Bolger: threat/],
    ["pipe", /^Hobbit Pipe exhausts/],
    ["smoke", /^Smoke Rings: /],
    ["notice", /^Take No Notice:/],
    ["intuition", /^Frodo's Intuition:/],
    ["determination", /^Halfling Determination:/],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

const BLACK_RIDERS_PLAYER_GAMES = [
  ["a-shadow-of-the-past", 1, 7],
  ["a-shadow-of-the-past", 2, 9],
  ["mirkwood", 1, 9],
  ["mirkwood", 2, 1],
] as const;

test("Seeded complete games with The Black Riders player cards keep exact saves and the Saga's physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed] of BLACK_RIDERS_PLAYER_GAMES) {
    const r = play(scenarioId, players, seed);
    for (const k of r.used) used.add(k);
    results.push(
      `${scenarioId}/${players}/${seed}: ${r.s.status} after ${r.steps}`,
    );
  }
  const missing = [
    B.bill,
    B.barliman,
    B.maggot,
    B.determination,
    B.smoke,
    B.notice,
    B.intuition,
    B.cloak,
    B.dagger,
    B.pipe,
    "ability:fatty",
    "barliman",
    "log:sam",
    "log:pippin",
    "log:merry",
    "log:maggot",
    "log:fatty",
    "log:pipe",
    "log:smoke",
    "log:notice",
    "log:intuition",
    "log:determination",
  ].filter((code) => !used.has(code));
  assert.deepEqual(
    missing,
    [],
    `${results.join("; ")} | used ${[...used].join(", ")}`,
  );
});
