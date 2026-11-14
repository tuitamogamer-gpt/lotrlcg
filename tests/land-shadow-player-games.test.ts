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
  needsTarget,
  optionalEngagementProblem,
} from "../src/game/actions";
import { engagementCost, stagingThreat } from "../src/game/core";
import { stormcallerEffectiveThreat as effectiveThreat } from "../src/game/threat-read";
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
import { LAND_SHADOW_PLAYER as P } from "../src/game/land-shadow-player-cards";
import { LAND_SHADOW_FRODO } from "../src/game/lotr-saga-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  pomSimulationAction,
  pomSimulationChoice,
} from "./passage-marshes-simulation-policy";
import { pomSimulationObserver } from "./passage-marshes-simulation-invariants";
import {
  jtcSimulationAction,
  jtcSimulationChoice,
} from "./cross-roads-simulation-policy";
import { jtcSimulationObserver } from "./cross-roads-simulation-invariants";

/**
 * Complete seeded games with a deck built around The Land of Shadow player
 * cards. A greedy policy plays every new card and uses every new ability
 * whenever it is legal and accepts every new response; each action is
 * followed by an exact save restoration and, in The Passage of the Marshes
 * and Journey to the Cross-roads, the scenario's physical-card and privacy
 * observers.
 */
const DECK: Record<string, number> = {
  [P.anborn]: 3,
  [P.skinbark]: 3,
  [P.gamling]: 3,
  [P.staff]: 3,
  [P.ambush]: 3,
  [P.snowmane]: 2,
  [P.taste]: 3,
  [P.shadows]: 3,
  [P.promise]: 3,
  "01069": 2, // Forest Snare
  "05017": 2, // Ranger Spikes
  "02055": 3, // Escort from Edoras
  "01016": 3, // Snowbourn Scout
  "01013": 3, // Guard of the Citadel
  "01029": 3, // Gondorian Spearman
  "01062": 2, // Gléowine
  "01028": 3, // Veteran Axehand
  "01044": 3, // Lórien Guide
};
const SEATS = [
  // Faramir and Damrod with a Rohan hero for Snowmane and Gamling.
  { heroes: [P.faramir, P.damrod, "01007"], deckId: "custom", cards: DECK },
  // Tactics for Skinbark, and the Gondor hero Eleanor for the Staff.
  { heroes: ["01002", "01005", "01008"], deckId: "custom", cards: DECK },
];
type Hooks = {
  choice: (s: GameState) => Option | undefined;
  action: (s: GameState) => Action | undefined;
  observer: () => { observe: (s: GameState) => void };
};
/** The scenario policies choose locations to travel to and Frodo's Ring. */
const scenarioStep = (
  s: GameState,
  policy: (s: GameState) => Action | undefined,
) => (s.phase === "travel" || s.phase === "staging" ? policy(s) : undefined);
const HOOKS: Partial<Record<ScenarioId, Hooks>> = {
  mirkwood: {
    choice: () => undefined,
    action: () => undefined,
    observer: () => ({ observe: () => undefined }),
  },
  "the-passage-of-the-marshes": {
    choice: pomSimulationChoice,
    action: (s) => scenarioStep(s, pomSimulationAction),
    observer: pomSimulationObserver,
  },
  "journey-to-the-cross-roads": {
    choice: jtcSimulationChoice,
    action: (s) => scenarioStep(s, jtcSimulationAction),
    observer: jtcSimulationObserver,
  },
};
/** Frodo is precious; Gamling and Skinbark wait for their own moments. */
const holdBack = (code: string) =>
  [LAND_SHADOW_FRODO, P.gamling, P.skinbark].includes(code as never);
/** The enemy that Taste it Again! made the hero's target this phase. */
const tasteTarget = (s: GameState, heroId: string) =>
  s.used.find((k) => k.startsWith(`phase:lsp-taste:${heroId}:`))?.split(":")[3];

/** Responses and choices of the new cards that the policy always takes. */
function landShadowChoice(s: GameState): Option | undefined {
  const { title, options } = s.choice!;
  if (
    /^(Faramir|Damrod|Anborn|Gamling|Staff of Lebethron|Taste it Again!|Snowmane) ·/.test(
      title,
    )
  )
    return options.find((o) => o.id !== "skip");
  if (/^Speak Your Promise! · Choose an enemy/.test(title)) return options[0];
  // Ambush declares every ready character, then attacks.
  if (/^Ambush · Declare attackers/.test(title))
    return options.find((o) => o.id !== "attack") ?? options[0];
  return undefined;
}

function greedy(s: GameState): Action | undefined {
  // Ambush: a Combat Action on an engaged enemy, used during attacks.
  if (s.phase === "attack")
    for (const enemy of s.engaged)
      for (const option of availableAbilities(s, enemy))
        if (
          !option.disabled &&
          option.id &&
          enemy.attachments.find((a) => a.id === option.id)?.code === P.ambush
        )
          return { type: "ABILITY", id: enemy.id, attachmentId: option.id };
  // Engage an enemy above your threat for Faramir, the Staff, Taste it Again!
  // and In the Shadows, while the fellowship can take its attack.
  if (s.phase === "encounter" && !s.optionalEngagement) {
    const high = s.staging.find(
      (u) =>
        card(u.code).type_code === "enemy" &&
        engagementCost(s, u) > effectiveThreat(s, activeSeat(s)) &&
        stats(s, u).attack <= 4 &&
        !optionalEngagementProblem(s, u),
    );
    if (high && !s.engaged.length) return { type: "ENGAGE", id: high.id };
  }
  // The new cards come first.
  const order = [
    P.promise,
    P.shadows,
    P.anborn,
    P.gamling,
    P.skinbark,
    P.staff,
    P.snowmane,
    P.ambush,
  ];
  const hand = [...s.hand].sort(
    (a, b) =>
      (order.includes(b.code as never) ? 1 : 0) -
        (order.includes(a.code as never) ? 1 : 0) ||
      order.indexOf(a.code as never) - order.indexOf(b.code as never),
  );
  // Damrod's Lore resources wait for In the Shadows.
  const saveLore =
    s.phase === "planning" && s.hand.some((u) => u.code === P.shadows);
  for (const u of hand) {
    const c = card(u.code);
    const type = c.type_code;
    if (type === "event" && ![P.promise, P.shadows].includes(u.code as never))
      continue;
    if (saveLore && c.sphere_code === "lore") continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (["ally", "attachment"].includes(type) && s.phase !== "planning")
      continue;
    // The Staff goes to the player's own best defender.
    const own = targets
      .filter((t) => characters(s).some((x) => x.id === t.id))
      .sort((a, b) => stats(s, b).defense - stats(s, a).defense);
    const target =
      own.find((t) => t.code !== LAND_SHADOW_FRODO) ?? own[0] ?? targets[0];
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
        landShadowChoice(s) ??
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
      } else if (action.type === "ABILITY") used.add(`ability:${P.ambush}`);
    } else if (hooks.action(s)) action = hooks.action(s)!;
    else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      // Enough willpower for the staging area and the coming reveals; the
      // best defender stays back, and so do Gamling and Skinbark.
      const target = stagingThreat(s) + 2 * players + 2;
      const committed = characters(s)
        .filter((u) => s.committedIds.includes(u.id))
        .reduce((n, u) => n + stats(s, u).will, 0);
      const guard = [...characters(s)]
        .filter((u) => !holdBack(u.code))
        .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
      const ready = characters(s)
        .filter(
          (u) =>
            canCommit(s, u) &&
            !s.committedIds.includes(u.id) &&
            stats(s, u).will > 0 &&
            u.id !== guard?.id &&
            ![P.gamling, P.skinbark].includes(u.code as never) &&
            !(u.code === LAND_SHADOW_FRODO && u.damage > 0),
        )
        .sort(
          (a, b) =>
            stats(s, b).will -
              stats(s, b).attack -
              (stats(s, a).will - stats(s, a).attack) ||
            stats(s, b).will - stats(s, a).will,
        )[0];
      action =
        ready && committed < target
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
      // Skinbark stays ready to attack an Orc alone.
      const defenders = defendersFor(s, enemy).filter((u) => !holdBack(u.code));
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof defenders)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      const defender = defenders.sort(
        (a, b) =>
          Number(survives(b)) - Number(survives(a)) ||
          stats(s, b).defense - stats(s, a).defense,
      )[0];
      action = {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    } else if (s.phase === "attack") {
      // Frodo never attacks: at least one other character of yours does.
      const open = engagedEnemies(s).filter(
        (e) =>
          !e.attackedBy?.includes(activeSeat(s)) &&
          attackersFor(s, e).some(
            (u) =>
              ownerOf(s, u) === activeSeat(s) && u.code !== LAND_SHADOW_FRODO,
          ),
      );
      // A hero readied by Taste it Again! attacks its enemy first, and
      // Skinbark looks for an Orc.
      const tasted = open.find((e) =>
        attackersFor(s, e).some((u) => tasteTarget(s, u.id) === e.id),
      );
      const orc = open.find(
        (e) =>
          (card(e.code).traits ?? "").includes("Orc") &&
          attackersFor(s, e).some((u) => u.code === P.skinbark),
      );
      const enemy = tasted ?? orc ?? open[0];
      const skinbark =
        enemy && !tasted && enemy === orc
          ? attackersFor(s, enemy).find((u) => u.code === P.skinbark)
          : undefined;
      action = enemy
        ? {
            type: "ATTACK",
            enemyId: enemy.id,
            attackerIds: skinbark
              ? [skinbark.id]
              : attackersFor(s, enemy)
                  .filter((u) => u.code !== LAND_SHADOW_FRODO)
                  .map((u) => u.id),
          }
        : { type: "END_ATTACKS" };
      if (action.type === "ATTACK" && !action.attackerIds.length)
        action = { type: "END_ATTACKS" };
      if (skinbark) used.add("skinbark-alone");
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
    ["faramir", /^Faramir readies/],
    ["damrod", /^Damrod: 1 card is drawn/],
    ["anborn", /^Anborn: .* gets \+5 engagement cost/],
    ["skinbark", /^Skinbark enters play exhausted/],
    ["gamling", /^Gamling is exhausted: /],
    ["staff", /^Staff of Lebethron is exhausted: /],
    ["ambush-attached", /^Ambush is attached to /],
    ["ambush", /^Ambush is discarded: /],
    ["snowmane", /^Snowmane readies/],
    ["taste", /^Taste it Again!: .* readies/],
    ["taste-attack", /^Taste it Again!: .* gets \+2 attack against/],
    ["shadows", /^In the Shadows: .* -1 attack/],
    ["promise", /^Speak Your Promise!: .* readies to pay the cost/],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

const LAND_SHADOW_PLAYER_GAMES = [
  ["the-passage-of-the-marshes", 1, 1],
  ["the-passage-of-the-marshes", 2, 6],
  ["journey-to-the-cross-roads", 2, 7],
  ["mirkwood", 1, 12],
  ["mirkwood", 2, 1],
  ["mirkwood", 2, 3],
] as const;

test("Seeded complete games with The Land of Shadow player cards keep exact saves and the scenario's physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed] of LAND_SHADOW_PLAYER_GAMES) {
    const r = play(scenarioId, players, seed);
    for (const k of r.used) used.add(k);
    results.push(
      `${scenarioId}/${players}/${seed}: ${r.s.status} after ${r.steps}`,
    );
  }
  const missing = [
    ...[
      P.anborn,
      P.skinbark,
      P.gamling,
      P.staff,
      P.ambush,
      P.snowmane,
      P.shadows,
      P.promise,
    ].filter((code) => !used.has(code)),
    ...[
      `ability:${P.ambush}`,
      "skinbark-alone",
      "log:faramir",
      "log:damrod",
      "log:anborn",
      "log:skinbark",
      "log:gamling",
      "log:staff",
      "log:ambush-attached",
      "log:ambush",
      "log:snowmane",
      "log:taste",
      "log:taste-attack",
      "log:shadows",
      "log:promise",
    ].filter((key) => !used.has(key)),
  ];
  assert.deepEqual(
    missing,
    [],
    `${results.join("; ")} | used ${[...used].join(", ")}`,
  );
});
