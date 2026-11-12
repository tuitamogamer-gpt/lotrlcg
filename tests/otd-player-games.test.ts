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
  hasKeyword,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { OTD_PLAYER as P } from "../src/game/otd-player-cards";
import { OTD_DWARF as D } from "../src/game/dwarf-player-cards";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  wmaSimulationAction,
  wmaSimulationChoice,
} from "./we-must-away-simulation-policy";
import { wmaSimulationObserver } from "./we-must-away-simulation-invariants";

/**
 * Complete seeded games with decks built around the On the Doorstep player
 * cards. A greedy policy plays every new card and ability whenever it is
 * legal and accepts every new response; each action is followed by an exact
 * save restoration and the scenario's physical-card and privacy observers.
 */
const DECK: Record<string, number> = {
  [D.bifur]: 3,
  [D.dwalin]: 3,
  [P.shot]: 3,
  [P.alliance]: 3,
  [P.ravens]: 3,
  [P.kinsfolk]: 3,
  [P.lucky]: 3,
  [P.bow]: 3,
  [P.arrow]: 1,
  [P.key]: 3,
  [P.hunter]: 3,
  "01039": 3, // Blade of Gondolin (Weapon)
  "01041": 3, // Dwarven Axe (Weapon)
  "01028": 3, // Veteran Axehand (Dwarf)
  "01059": 3, // Erebor Hammersmith (Dwarf)
  "01061": 3, // Miner of the Iron Hills (Dwarf)
  "01018": 3, // Longbeard Orc Slayer (Dwarf)
  "01062": 1, // Gléowine
};
const NEW_EVENTS: string[] = [
  P.shot,
  P.alliance,
  P.ravens,
  P.kinsfolk,
  P.lucky,
];
const SEATS = [
  {
    heroes: [P.balin, P.bard, D.bombur],
    deckId: "custom",
    cards: DECK,
  },
  { heroes: [D.oin, "01005", "01004"], deckId: "custom", cards: DECK },
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
  "we-must-away-ere-break-of-day": {
    choice: wmaSimulationChoice,
    action: wmaSimulationAction,
    observer: wmaSimulationObserver,
  },
};

/** Responses and choices of the new cards that the policy always takes. */
function otdChoice(s: GameState): Option | undefined {
  const { title, options } = s.choice!;
  const balin = options.find((o) => o.id.startsWith("otd-balin-"));
  if (balin) return balin;
  if (/^(Black Arrow|Thrór's Key)/.test(title))
    return options.find((o) => o.id === "use");
  if (/^Bifur/.test(title)) return options.find((o) => o.id === "draw");
  if (/^Expert Treasure-hunter/.test(title))
    return options.find((o) => o.id === "ally");
  if (
    /^(Straight Shot|Desperate Alliance|Ravens of the Mountain|To me! O my kinsfolk!|Great Yew Bow)/.test(
      title,
    )
  )
    return options[0];
  return undefined;
}

function greedy(s: GameState): Action | undefined {
  if (["defense", "attack"].includes(s.phase) && !s.combat)
    for (const u of characters(s))
      for (const option of availableAbilities(s, u))
        if (
          !option.disabled &&
          option.id &&
          u.attachments.some((a) => a.id === option.id && a.code === P.bow)
        )
          return { type: "ABILITY", id: u.id, attachmentId: option.id };
  for (const u of s.hand) {
    const type = card(u.code).type_code;
    if (type === "event" && !NEW_EVENTS.includes(u.code)) continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (type === "ally" && s.phase !== "planning") continue;
    if (type === "attachment" && s.phase !== "planning") continue;
    return { type: "PLAY", id: u.id, target: targets[0]?.id };
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
        otdChoice(s) ??
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
          : "ability:bow",
      );
    } else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      // The Ranged heroes stay home for Great Yew Bow and Black Arrow, and
      // characters without willpower (Bombur) stay home to defend.
      const ready = characters(s).find(
        (u) =>
          canCommit(s, u) &&
          !s.committedIds.includes(u.id) &&
          !hasKeyword(u, "Ranged") &&
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
      // A hero holding Black Arrow is kept ready for its attack.
      const arrow = (u: { attachments: { code: string }[] }) =>
        u.attachments.some((a) => a.code === P.arrow) ? 1 : 0;
      const defenders = defendersFor(s, enemy);
      const defender = defenders.sort(
        (a, b) =>
          arrow(a) - arrow(b) || stats(s, b).defense - stats(s, a).defense,
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
    ["balin", /^Balin pays 1 resource/],
    ["bard", /^Bard the Bowman makes a ranged attack/],
    ["arrow", /^Black Arrow goes to the victory display/],
    ["key", /^Thrór's Key is attached/],
    ["hunter", /^Expert Treasure-hunter names/],
    ["alliance", /^Desperate Alliance ends/],
    ["kinsfolk", /goes to the bottom of .* deck/],
    ["bifur", /^Bifur: his controller draws/],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

test("Seeded complete games with the On the Doorstep player cards keep exact saves and the Hobbit physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed] of [
    ["mirkwood", 1, 4],
    ["mirkwood", 2, 6],
    ["mirkwood", 2, 8],
    ["we-must-away-ere-break-of-day", 2, 2],
  ] as const) {
    const r = play(scenarioId, players, seed);
    for (const k of r.used) used.add(k);
    results.push(`${scenarioId}/${players}: ${r.s.status} after ${r.steps}`);
  }
  for (const code of [
    D.bifur,
    D.dwalin,
    P.shot,
    P.alliance,
    P.ravens,
    P.kinsfolk,
    P.lucky,
    P.bow,
    P.arrow,
    P.key,
    P.hunter,
    "ability:bow",
    "log:balin",
    "log:bard",
    "log:arrow",
    "log:key",
    "log:hunter",
    "log:alliance",
    "log:kinsfolk",
    "log:bifur",
  ])
    assert.ok(used.has(code), `${code} was exercised: ${[...used].join(", ")}`);
  assert.equal(results.length, 4);
});
