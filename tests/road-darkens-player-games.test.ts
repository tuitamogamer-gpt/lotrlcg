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
import {
  availableAbilities,
  gandalfDeckPlayReason,
  needsTarget,
} from "../src/game/actions";
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
import { ROAD_DARKENS_PLAYER as R } from "../src/game/road-darkens-player-cards";
import { SAGA_FRODO } from "../src/game/lotr-saga-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  spSimulationAction,
  spSimulationChoice,
} from "./shadow-past-simulation-policy";
import { spSimulationObserver } from "./shadow-past-simulation-invariants";

/**
 * Complete seeded games with a deck built around The Road Darkens player
 * cards. A greedy policy plays every new card, Gandalf's top card and every
 * new ability whenever it is legal and accepts every new response; each
 * action is followed by an exact save restoration and, in A Shadow of the
 * Past, the scenario's physical-card and privacy observers (the faceup top
 * card of Gandalf's deck stays in place when the concealed order is swapped).
 */
const GALADRIEL = "142003",
  ELROND = "142005";
const DECK: Record<string, number> = {
  [R.boromir]: 3,
  [R.bilbo]: 3,
  [R.flame]: 3,
  [R.staff]: 2,
  [R.pipe]: 3,
  [R.fellowship]: 3,
  [GALADRIEL]: 2,
  [ELROND]: 2,
  "141015": 3, // Hobbit Pipe
  "01043": 3, // Wandering Took
  "01016": 3, // Snowbourn Scout
  "01013": 3, // Guard of the Citadel
  "01029": 3, // Gondorian Spearman
  "01028": 3, // Veteran Axehand
  "01062": 3, // Gléowine
  "01061": 3, // Miner of the Iron Hills
  "01044": 3, // Lórien Guide
  "01057": 2, // Unexpected Courage
};
const SEATS = [
  { heroes: [R.gandalf, "01007", "01001"], deckId: "custom", cards: DECK },
  { heroes: ["01004", "01005", "01010"], deckId: "custom", cards: DECK },
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
function roadDarkensChoice(s: GameState): Option | undefined {
  const { title, options } = s.choice!;
  if (/^(Boromir|Bilbo Baggins|Galadriel|Elrond) ·/.test(title))
    return options.find((o) => o.id === "use") ?? options[0];
  if (/^(Gandalf's Staff|Wizard Pipe) ·/.test(title))
    return options.find((o) => o.id !== "skip");
  return undefined;
}

function greedy(s: GameState): Action | undefined {
  // Gandalf plays the faceup top card whenever he can.
  if (!gandalfDeckPlayReason(s)) {
    const top = { ...s.hand[0], id: "deck-play:", code: s.deck[0] };
    const targets = needsTarget(top) ? playTargets(s, top) : [];
    if (!needsTarget(top) || targets.length) {
      const target = targets.find((t) => t.code !== SAGA_FRODO) ?? targets[0];
      return { type: "PLAY_DECK", target: target?.id };
    }
  }
  for (const u of characters(s))
    for (const option of availableAbilities(s, u))
      if (
        !option.disabled &&
        option.id &&
        u.attachments.some(
          (a) =>
            a.id === option.id && [R.staff, R.pipe].includes(a.code as never),
        ) &&
        ["planning", "attack"].includes(s.phase)
      )
        return { type: "ABILITY", id: u.id, attachmentId: option.id };
  for (const u of s.hand) {
    const type = card(u.code).type_code;
    if (type === "event" && u.code !== R.flame) continue;
    if (u.code === R.flame && s.phase !== "attack") continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (["ally", "attachment"].includes(type) && s.phase !== "planning")
      continue;
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
        roadDarkensChoice(s) ??
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
          ? s.hand.find((u) => u.id === (action as { id: string }).id)!.code
          : action.type === "PLAY_DECK"
            ? `deck:${s.deck[0]}`
            : `ability:${
                characters(s)
                  .flatMap((u) => u.attachments)
                  .find(
                    (a) =>
                      a.id ===
                      (action as { attachmentId?: string }).attachmentId,
                  )!.code
              }`,
      );
    } else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      const ready = characters(s).find(
        (u) =>
          canCommit(s, u) &&
          !s.committedIds.includes(u.id) &&
          u.code !== R.boromir &&
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
      // Boromir defends first, to take damage and ready.
      const defender =
        defenders.find(
          (u) => u.code === R.boromir && stats(s, u).health - u.damage > 1,
        ) ??
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
    ["boromir", /^Boromir readies after taking damage/],
    ["bilbo", /^Bilbo Baggins (adds|finds)/],
    ["flame", /^Flame of Anor readies/],
    ["staff", /^Gandalf's Staff/],
    ["pipe", /^Wizard Pipe exchanges/],
    ["fellowship", /^Fellowship of the Ring is discarded/],
    ["gandalf", /^Gandalf plays .* from the top of the deck/],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

const ROAD_DARKENS_PLAYER_GAMES = [
  ["a-shadow-of-the-past", 1, 5],
  ["a-shadow-of-the-past", 2, 9],
  ["mirkwood", 1, 4],
  ["mirkwood", 2, 4],
] as const;

test("Seeded complete games with The Road Darkens player cards keep exact saves and the Saga's physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed] of ROAD_DARKENS_PLAYER_GAMES) {
    const r = play(scenarioId, players, seed);
    for (const k of r.used) used.add(k);
    results.push(
      `${scenarioId}/${players}/${seed}: ${r.s.status} after ${r.steps}`,
    );
  }
  const played = (code: string) => used.has(code) || used.has(`deck:${code}`);
  const missing = [
    ...[R.boromir, R.bilbo, R.flame, R.staff, R.pipe, R.fellowship].filter(
      (code) => !played(code),
    ),
    ...[
      `ability:${R.staff}`,
      `ability:${R.pipe}`,
      "log:boromir",
      "log:bilbo",
      "log:flame",
      "log:staff",
      "log:pipe",
      "log:fellowship",
      "log:gandalf",
    ].filter((key) => !used.has(key)),
  ];
  assert.deepEqual(
    missing,
    [],
    `${results.join("; ")} | used ${[...used].join(", ")}`,
  );
});
