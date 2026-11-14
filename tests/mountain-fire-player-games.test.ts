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
import { hasTrait } from "../src/game/expansion-passives";
import { MOUNTAIN_FIRE_PLAYER as P } from "../src/game/mountain-fire-player-cards";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  cuSimulationAction,
  cuSimulationChoice,
} from "./cirith-ungol-simulation-policy";
import { cuSimulationObserver } from "./cirith-ungol-simulation-invariants";
import {
  mdSimulationAction,
  mdSimulationChoice,
} from "./mount-doom-simulation-policy";
import { mdSimulationObserver } from "./mount-doom-simulation-invariants";

/**
 * Complete seeded games with a deck built around The Mountain of Fire player
 * cards. A greedy policy plays every new card and uses every new ability
 * whenever it is legal and accepts every new response; each action is
 * followed by an exact save restoration and, in The Tower of Cirith Ungol and
 * Mount Doom, the scenario's physical-card and privacy observers.
 */
const DECK: Record<string, number> = {
  [P.rosie]: 3,
  [P.elfhelm]: 3,
  [P.elladan]: 3,
  [P.elrohir]: 3,
  [P.disguise]: 3,
  [P.captains]: 3,
  [P.guthwine]: 3,
  [P.raise]: 3,
  "01043": 3, // Wandering Took (Spirit Hobbit)
  "10006": 3, // Curious Brandybuck (Spirit Hobbit)
  "01016": 3, // Snowbourn Scout (Rohan)
  "07006": 3, // Westfold Outrider (Rohan)
  "01013": 3, // Guard of the Citadel
  "01029": 3, // Gondorian Spearman
  "01028": 2, // Veteran Axehand
  "01062": 2, // Gléowine
  "01044": 2, // Lórien Guide
  "01060": 2, // Henamarth Riversong
};
const SEATS = [
  // Éomer and Théodred (Rohan, Noble) and Tom Cotton (a Hobbit hero).
  { heroes: [P.eomer, P.tom, "01002"], deckId: "custom", cards: DECK },
  // Legolas (Tactics), Éowyn (Spirit, Rohan) and Beravor (Lore).
  { heroes: ["01005", "01007", "01012"], deckId: "custom", cards: DECK },
];
type Hooks = {
  choice: (s: GameState) => Option | undefined;
  action: (s: GameState) => Action | undefined;
  observer: () => { observe: (s: GameState) => void };
};
/** The scenario policies choose their own decisions, travel and tests. */
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
  "the-tower-of-cirith-ungol": {
    choice: cuSimulationChoice,
    action: (s) => scenarioStep(s, cuSimulationAction),
    observer: cuSimulationObserver,
  },
  "mount-doom": {
    choice: mdSimulationChoice,
    action: (s) => scenarioStep(s, mdSimulationAction),
    observer: mdSimulationObserver,
  },
};

/** Responses and choices of the new cards that the policy always takes. */
function mountainFireChoice(s: GameState): Option | undefined {
  const { title, options } = s.choice!;
  if (
    /^(Tom Cotton|Elladan|Elrohir|Orc Disguise|Gúthwinë) ·/.test(title) &&
    !/^Gúthwinë · Return/.test(title)
  )
    return options.find((o) => o.id === "use");
  if (/^Raise the Shire · You engaged/.test(title))
    return options.find((o) => o.id === "play");
  if (/^(Éomer|Gúthwinë · Return|Raise the Shire · Put|Elfhelm) ·/.test(title))
    return options.find((o) => o.id !== "skip" && o.id !== "none");
  // Rosie Cotton's willpower goes to a questing hero, else to an attack.
  if (/^Rosie Cotton ·/.test(title))
    return (
      options.find((o) => o.id.endsWith(":will")) ??
      options.find((o) => o.id.endsWith(":attack"))
    );
  return undefined;
}
const committedHobbit = (s: GameState) =>
  characters(s).some((u) => u.committed && hasTrait(u, "Hobbit"));

function greedy(s: GameState, used: Set<string>): Action | undefined {
  // Rosie Cotton helps a committed Hobbit hero quest.
  if (s.phase === "staging" && committedHobbit(s))
    for (const u of characters(s).filter((u) => u.code === P.rosie)) {
      const ability = availableAbilities(s, u).find(
        (a) => !a.disabled && a.label.startsWith("Rosie Cotton"),
      );
      if (ability) {
        used.add(`ability:${P.rosie}`);
        return { type: "ABILITY", id: u.id };
      }
    }
  // Elfhelm joins the defense from the hand.
  if (s.phase === "defense" && engagedEnemies(s).length)
    for (const u of s.hand.filter((u) => u.code === P.elfhelm)) {
      const ability = availableAbilities(s, u).find(
        (a) => !a.disabled && a.label.startsWith("Elfhelm"),
      );
      if (ability) {
        used.add(`ability:${P.elfhelm}`);
        return { type: "ABILITY", id: u.id };
      }
    }
  // Captains of the West before committing to the quest.
  if (s.phase === "quest" && !s.committedIds.length)
    for (const u of s.hand.filter((u) => u.code === P.captains))
      if (!canPlay(s, u)) {
        used.add(P.captains);
        return { type: "PLAY", id: u.id };
      }
  // Engage an Orc for Elladan and Elrohir, or any enemy for Raise the Shire.
  if (s.phase === "encounter" && !s.optionalEngagement && !s.engaged.length) {
    const twins = s.allies.some(
      (u) => (u.code === P.elladan || u.code === P.elrohir) && u.exhausted,
    );
    const raise = s.hand.some((u) => u.code === P.raise);
    const enemy = s.staging.find(
      (u) =>
        card(u.code).type_code === "enemy" &&
        stats(s, u).attack <= 3 &&
        (raise || (twins && hasTrait(u, "Orc"))) &&
        engagementCost(s, u) > effectiveThreat(s, activeSeat(s)) - 60,
    );
    if (enemy) return { type: "ENGAGE", id: enemy.id };
  }
  // The new cards come first; Elfhelm waits in the hand for his Action.
  const order = [
    P.disguise,
    P.guthwine,
    P.rosie,
    P.elladan,
    P.elrohir,
  ] as string[];
  const hand = [...s.hand].sort(
    (a, b) =>
      (order.includes(b.code) ? 1 : 0) - (order.includes(a.code) ? 1 : 0) ||
      order.indexOf(a.code) - order.indexOf(b.code),
  );
  for (const u of hand) {
    const c = card(u.code);
    const type = c.type_code;
    if (type === "event" || u.code === P.elfhelm) continue;
    if (canPlay(s, u)) continue;
    const targets = needsTarget(u) ? playTargets(s, u) : [];
    if (needsTarget(u) && !targets.length) continue;
    if (["ally", "attachment"].includes(type) && s.phase !== "planning")
      continue;
    const own = targets.filter((t) => characters(s).some((x) => x.id === t.id));
    const target = own[0] ?? targets[0];
    return { type: "PLAY", id: u.id, target: target?.id };
  }
  return undefined;
}

function play(
  scenarioId: ScenarioId,
  players: number,
  seed: number,
  easy: boolean,
) {
  const hooks = HOOKS[scenarioId]!;
  const observer = hooks.observer();
  const used = new Set<string>();
  let s = createGame(seed, DECK, SEATS[0].heroes, "custom", {
    seats: SEATS.slice(0, players),
    scenarioId,
    easy,
  });
  observer.observe(s);
  let steps = 0;
  while (s.status === "playing" && steps++ < 4000) {
    let action: Action;
    if (s.hideTest?.phase === "actions" && !s.choice)
      action = { type: "RESOLVE_HIDE" };
    else if (s.choice) {
      const { options } = s.choice;
      const selected =
        mountainFireChoice(s) ??
        hooks.choice(s) ??
        options.find((o) => o.id === "skip") ??
        options.find((o) => o.id === "resolve") ??
        options[0];
      action = { type: "CHOOSE", id: selected!.id };
    } else if (s.phase === "setup") action = { type: "KEEP" };
    else if (greedy(s, used)) {
      action = greedy(s, used)!;
      if (action.type === "PLAY") {
        const id = action.id;
        used.add(s.hand.find((u) => u.id === id)!.code);
      }
    } else if (hooks.action(s)) action = hooks.action(s)!;
    else if (s.phase === "planning") action = { type: "NEXT" };
    else if (s.phase === "quest") {
      const target = stagingThreat(s) + 2 * players + 2;
      const committed = characters(s)
        .filter((u) => s.committedIds.includes(u.id))
        .reduce((n, u) => n + stats(s, u).will, 0);
      const guard = [...characters(s)].sort(
        (a, b) => stats(s, b).defense - stats(s, a).defense,
      )[0];
      // Éomer commits whenever he can attack into the staging area.
      const eomer = characters(s).find(
        (u) =>
          u.code === P.eomer &&
          canCommit(s, u) &&
          !s.committedIds.includes(u.id) &&
          u.resources > 0 &&
          s.staging.some((e) => card(e.code).type_code === "enemy"),
      );
      const ready =
        eomer ??
        characters(s)
          .filter(
            (u) =>
              canCommit(s, u) &&
              !s.committedIds.includes(u.id) &&
              stats(s, u).will > 0 &&
              u.id !== guard?.id &&
              // Rosie Cotton stays ready to lend her willpower.
              u.code !== P.rosie,
          )
          .sort((a, b) => stats(s, b).will - stats(s, a).will)[0];
      action =
        ready && (committed < target || ready === eomer)
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
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof defenders)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      const defender = defenders
        .filter((u) => !hasTrait(u, "Ring-bearer") || survives(u))
        .sort(
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
      const open = engagedEnemies(s).filter(
        (e) =>
          !e.attackedBy?.includes(activeSeat(s)) &&
          attackersFor(s, e).some((u) => ownerOf(s, u) === activeSeat(s)),
      );
      const enemy = open[0];
      action = enemy
        ? {
            type: "ATTACK",
            enemyId: enemy.id,
            attackerIds: attackersFor(s, enemy).map((u) => u.id),
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
    ["eomer", /^Éomer spends 1 resource from his pool and attacks /],
    ["tom", /^Tom Cotton: .* gets \+2 attack until the end of the round/],
    ["rosie", /^Rosie Cotton: .* gets \+\d+ /],
    ["elfhelm", /^Elfhelm: .* spends 1 resource to put Elfhelm into play/],
    ["elfhelm-discard", /^Elfhelm is discarded at the end of the phase/],
    ["twin", /^(Elladan|Elrohir) readies\./],
    ["disguise", /^Orc Disguise is discarded: /],
    ["captains", /^Captains of the West: /],
    ["guthwine", /^Gúthwinë: .* gets \+2 attack for this attack/],
    ["raise", /^Raise the Shire: .* enters play/],
    ["raise-return", /^Raise the Shire: .* returns to its owner's hand/],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

const MOUNTAIN_FIRE_PLAYER_GAMES = [
  ["the-tower-of-cirith-ungol", 1, 1, true],
  ["the-tower-of-cirith-ungol", 2, 2, true],
  ["mount-doom", 1, 3, true],
  ["mount-doom", 2, 4, true],
  ["mirkwood", 1, 1, false],
  ["mirkwood", 2, 5, true],
] as const;

test("Seeded complete games with The Mountain of Fire player cards keep exact saves and the scenario's physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed, easy] of MOUNTAIN_FIRE_PLAYER_GAMES) {
    const r = play(scenarioId, players, seed, easy);
    for (const k of r.used) used.add(k);
    results.push(
      `${scenarioId}/${players}/${seed}${easy ? "/easy" : ""}: ${r.s.status} after ${r.steps}`,
    );
  }
  const missing = [
    ...[
      P.rosie,
      P.elladan,
      P.elrohir,
      P.disguise,
      P.captains,
      P.guthwine,
    ].filter((code) => !used.has(code)),
    ...[
      `ability:${P.rosie}`,
      `ability:${P.elfhelm}`,
      "log:eomer",
      "log:tom",
      "log:rosie",
      "log:elfhelm",
      "log:elfhelm-discard",
      "log:twin",
      "log:disguise",
      "log:captains",
      "log:guthwine",
      "log:raise",
      "log:raise-return",
    ].filter((key) => !used.has(key)),
  ];
  assert.deepEqual(
    missing,
    [],
    `${results.join("; ")} | used ${[...used].join(", ")}`,
  );
});
