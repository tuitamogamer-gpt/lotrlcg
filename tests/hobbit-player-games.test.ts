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
import { HOBBIT_PLAYER as P } from "../src/game/hobbit-player-cards";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  wmaSimulationAction,
  wmaSimulationChoice,
} from "./we-must-away-simulation-policy";
import { wmaSimulationObserver } from "./we-must-away-simulation-invariants";
import {
  ddcdSimulationAction,
  ddcdSimulationChoice,
} from "./dungeons-deep-simulation-policy";
import { ddcdSimulationObserver } from "./dungeons-deep-simulation-invariants";

/**
 * Complete seeded games with decks built around the box's player cards. A
 * greedy policy plays every new card and ability whenever it is legal, and
 * each action is followed by an exact save restoration and the scenario's
 * physical-card and privacy observers.
 */
const DECK: Record<string, number> = {
  [P.bofur]: 3,
  [P.gandalf]: 3,
  [P.hood]: 3,
  [P.cleaver]: 3,
  [P.late]: 3,
  [P.mischief]: 3,
  [P.burglar]: 3,
  "01039": 3, // Blade of Gondolin (Weapon)
  "01041": 3, // Dwarven Axe (Weapon)
  "01028": 3, // Veteran Axehand (Dwarf)
  "01059": 3, // Erebor Hammersmith (Dwarf)
  "01061": 3, // Miner of the Iron Hills (Dwarf)
  "01018": 3, // Longbeard Orc Slayer (Dwarf)
  "01020": 3, // Ever Vigilant
  "01025": 3, // Gondorian Spearman
  "01036": 3, // Common Cause
  "01062": 2, // Gléowine
};
const NEW_EVENTS: string[] = [P.cleaver, P.late, P.mischief, P.burglar];
const SEATS = [
  { heroes: [P.thorin, P.beorn, "01007"], deckId: "custom", cards: DECK },
  { heroes: ["01010", "01011", "01006"], deckId: "custom", cards: DECK },
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
  "dungeons-deep-and-caverns-dim": {
    choice: ddcdSimulationChoice,
    action: ddcdSimulationAction,
    observer: ddcdSimulationObserver,
  },
};

const PRIORITY: string[] = [P.gandalf, P.bofur, P.hood];
function greedy(s: GameState): Action | undefined {
  for (const u of characters(s)) {
    for (const option of availableAbilities(s, u)) {
      if (option.disabled) continue;
      if (!option.id && u.code === P.bofur && /Bofur/.test(option.label))
        return { type: "ABILITY", id: u.id };
      if (
        option.id &&
        u.attachments.some((a) => a.id === option.id && a.code === P.hood)
      )
        return { type: "ABILITY", id: u.id, attachmentId: option.id };
    }
  }
  const bilbo = allCharacters(s).find((u) => u.code === "131001");
  const hand = [...s.hand].sort(
    (a, b) =>
      (PRIORITY.includes(b.code) ? 1 : 0) - (PRIORITY.includes(a.code) ? 1 : 0),
  );
  for (const u of hand) {
    const type = card(u.code).type_code;
    if (type === "event" && !NEW_EVENTS.includes(u.code)) continue;
    // Keep 2 Baggins resources for the scenario's cancels.
    if (
      u.code === P.burglar &&
      (s.phase !== "staging" || !bilbo?.committed || bilbo.resources < 3)
    )
      continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (type === "ally" && s.phase !== "planning") continue;
    if (type === "attachment" && s.phase !== "planning") continue;
    // Save up for Gandalf when he is in hand.
    if (
      type !== "event" &&
      u.code !== P.gandalf &&
      hand.some((h) => h.code === P.gandalf) &&
      !allCharacters(s).some((h) => h.code === P.gandalf)
    )
      continue;
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
      const { title, options } = s.choice;
      if (/^Gandalf/.test(title)) used.add(`choice:${P.gandalf}`);
      const selected = /^Gandalf/.test(title)
        ? options.find((o) => o.id === (s.threat < 35 ? "keep" : "discard"))
        : /Goblin-cleaver|Spare Hood|Bofur/.test(title)
          ? options[0]
          : (hooks.choice(s) ??
            options.find((o) => o.id === "skip") ??
            options.find((o) => o.id === "resolve") ??
            options[0]);
      action = { type: "CHOOSE", id: selected!.id };
    } else if (hooks.action(s)) action = hooks.action(s)!;
    else if (s.phase === "setup") action = { type: "KEEP" };
    else if (greedy(s)) {
      action = greedy(s)!;
      used.add(
        action.type === "PLAY"
          ? s.hand.find((u) => u.id === action.id)!.code
          : action.type === "ABILITY" && action.attachmentId
            ? P.hood
            : P.bofur,
      );
    } else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      const ready = characters(s).find(
        (u) =>
          canCommit(s, u) &&
          !s.committedIds.includes(u.id) &&
          u.code !== P.beorn,
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
      const defenders = defendersFor(s, enemy);
      const defender =
        defenders.find((u) => u.code === P.beorn) ??
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
  if (s.log.some((l) => /Expecting Mischief deals 2 damage/.test(l.text)))
    used.add("damage:mischief");
  if (s.log.some((l) => /Spare Hood and Cloak moves/.test(l.text)))
    used.add("moved:hood");
  return { s, steps, used };
}

test("Seeded complete games with the box's player cards keep exact saves and the Hobbit physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed] of [
    ["mirkwood", 1, 4],
    ["mirkwood", 2, 5],
    ["we-must-away-ere-break-of-day", 1, 1],
  ] as const) {
    const r = play(scenarioId, players, seed);
    for (const k of r.used) used.add(k);
    results.push(`${scenarioId}/${players}: ${r.s.status} after ${r.steps}`);
  }
  for (const code of [
    P.bofur,
    P.gandalf,
    P.hood,
    P.cleaver,
    P.late,
    P.mischief,
    P.burglar,
    `choice:${P.gandalf}`,
    "damage:mischief",
    "moved:hood",
  ])
    assert.ok(used.has(code), `${code} was exercised: ${[...used].join(", ")}`);
  assert.equal(results.length, 3);
});
