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
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { FLAME_WEST_PLAYER as P } from "../src/game/flame-west-player-cards";
import { FLAME_WEST_ARAGORN } from "../src/game/lotr-saga-codes";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";
import {
  sgSimulationAction,
  sgSimulationChoice,
} from "./siege-gondor-simulation-policy";
import { sgSimulationObserver } from "./siege-gondor-simulation-invariants";
import {
  pfSimulationAction,
  pfSimulationChoice,
} from "./pelennor-fields-simulation-policy";
import { pfSimulationObserver } from "./pelennor-fields-simulation-invariants";

/**
 * Complete seeded games with a deck built around The Flame of the West
 * player cards. A greedy policy plays every new card and uses every new
 * ability whenever it is legal and accepts every new response; each action
 * is followed by an exact save restoration and, in The Siege of Gondor and
 * The Battle of the Pelennor Fields, the scenario's physical-card and
 * privacy observers.
 */
const DECK: Record<string, number> = {
  [P.grimbold]: 3,
  [P.imrahil]: 3,
  [P.halbarad]: 3,
  [P.ghan]: 3,
  [P.sterner]: 3,
  [P.shield]: 3,
  [P.livery]: 3,
  [P.roheryn]: 3,
  [P.banner]: 3,
  "01039": 3, // Blade of Gondolin (Weapon)
  "01040": 3, // Citadel Plate (Armor)
  "01013": 3, // Guard of the Citadel
  "01016": 3, // Snowbourn Scout
  "01029": 3, // Gondorian Spearman
  "01028": 3, // Veteran Axehand
  "01062": 2, // Gléowine
  "01044": 3, // Lórien Guide
  "01060": 2, // Henamarth Riversong
};
const SEATS = [
  // Éowyn (Rohan) for Golden Shield, Beregond (Gondor) for the Livery and
  // Théodred; the first player also controls the Fellowship Aragorn.
  {
    heroes: [P.eowyn, P.beregond, "01002"],
    deckId: "custom",
    cards: DECK,
  },
  // Lore for Ghân-buri-Ghân and two Spirit heroes for Prince Imrahil.
  { heroes: ["01012", "01009", "01008"], deckId: "custom", cards: DECK },
];
type Hooks = {
  choice: (s: GameState) => Option | undefined;
  action: (s: GameState) => Action | undefined;
  observer: () => { observe: (s: GameState) => void };
};
/** The scenario policies choose their own decisions and travel. */
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
  "the-siege-of-gondor": {
    choice: sgSimulationChoice,
    action: (s) => scenarioStep(s, sgSimulationAction),
    observer: sgSimulationObserver,
  },
  "the-battle-of-the-pelennor-fields": {
    choice: pfSimulationChoice,
    action: (s) => scenarioStep(s, pfSimulationAction),
    observer: pfSimulationObserver,
  },
};

/** Responses and choices of the new cards that the policy always takes. */
function flameWestChoice(s: GameState): Option | undefined {
  const { title, options } = s.choice!;
  if (
    /^(Beregond|Golden Shield|Roheryn) ·/.test(title) ||
    /^Livery of the Tower ·/.test(title)
  )
    return (
      options.find((o) => o.id === "use") ??
      [...options].reverse().find((o) => o.id.startsWith("cancel-")) ??
      options.find((o) => o.id !== "skip")
    );
  if (/^(Grimbold|Ghân-buri-Ghân|Sterner than Steel) ·/.test(title))
    return options[0];
  if (/^A shadow falls/.test(title))
    return options.find((o) => o.ability?.code === P.sterner);
  return undefined;
}
const ABILITIES = [P.eowyn, P.grimbold, P.ghan] as const;
/** A ready hero with a ready Roheryn: it stays back from the quest to ride. */
const riding = (u: {
  exhausted: boolean;
  attachments: { code: string; exhausted: boolean }[];
}) =>
  !u.exhausted &&
  u.attachments.some((a) => a.code === P.roheryn && !a.exhausted);
/** A hero with a ready Golden Shield defends with its willpower added. */
const shielded = (u: { attachments: { code: string; exhausted: boolean }[] }) =>
  u.attachments.some((a) => a.code === P.shield && !a.exhausted);

function greedy(s: GameState, used: Set<string>): Action | undefined {
  // Any player may take a Travel Action: Ghân-buri-Ghân's player takes the seat.
  if (s.table && s.phase === "travel" && !s.activeLocation)
    for (const p of playerOrder(s))
      if (
        p !== activeSeat(s) &&
        seatView(s, p).allies.some((u) => u.code === P.ghan && !u.blanked) &&
        s.staging.some(
          (l) => card(l.code).type_code === "location" && !canTravel(s, l),
        )
      )
        return { type: "SELECT_SEAT", seat: p };
  // Éowyn rides once, in the attack phase; Grimbold holds an attacker back;
  // Ghân-buri-Ghân leads the way when the players travel.
  for (const u of characters(s)) {
    if (!ABILITIES.includes(u.code as (typeof ABILITIES)[number])) continue;
    if (u.code === P.eowyn && (s.phase !== "attack" || !s.engaged.length))
      continue;
    if (
      u.code === P.grimbold &&
      (s.phase !== "defense" ||
        !engagedEnemies(s).some(
          (e) => normalAttackPending(s, e) && stats(s, e).attack >= 4,
        ))
    )
      continue;
    const ability = availableAbilities(s, u).find(
      (a) => !a.disabled && a.label.startsWith(card(u.code).name),
    );
    if (ability) {
      used.add(`ability:${u.code}`);
      return { type: "ABILITY", id: u.id };
    }
  }
  // Engage an enemy for Roheryn while the fellowship can take its attack.
  if (s.phase === "encounter" && !s.optionalEngagement) {
    const rider = characters(s).some((u) => riding(u));
    const enemy = s.staging.find(
      (u) =>
        card(u.code).type_code === "enemy" &&
        stats(s, u).attack <= 4 &&
        engagementCost(s, u) > effectiveThreat(s, activeSeat(s)) - 50,
    );
    if (rider && enemy && !s.engaged.length)
      return { type: "ENGAGE", id: enemy.id };
  }
  // The new cards come first.
  const order = [
    P.banner,
    P.imrahil,
    P.roheryn,
    P.shield,
    P.livery,
    P.halbarad,
    P.grimbold,
    P.ghan,
  ];
  const hand = [...s.hand].sort(
    (a, b) =>
      (order.includes(b.code as never) ? 1 : 0) -
        (order.includes(a.code as never) ? 1 : 0) ||
      order.indexOf(a.code as never) - order.indexOf(b.code as never),
  );
  // Roheryn gives Aragorn the Tactics icon: his resources wait for the Banner.
  const bannerWaits =
    s.hand.some((u) => u.code === P.banner) &&
    !characters(s).some((u) => u.attachments.some((a) => a.code === P.banner));
  for (const u of hand) {
    const c = card(u.code);
    const type = c.type_code;
    if (type === "event") continue;
    if (u.code === P.roheryn && bannerWaits) continue;
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
    if (s.choice) {
      const { options } = s.choice;
      const selected =
        flameWestChoice(s) ??
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
      const ready = characters(s)
        .filter(
          (u) =>
            canCommit(s, u) &&
            !s.committedIds.includes(u.id) &&
            stats(s, u).will > 0 &&
            u.id !== guard?.id &&
            !riding(u) &&
            !shielded(u) &&
            !(u.code === FLAME_WEST_ARAGORN && u.damage > 2),
        )
        .sort((a, b) => stats(s, b).will - stats(s, a).will)[0];
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
      const defenders = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      const defense = (u: (typeof defenders)[number]) =>
        stats(s, u).defense + (shielded(u) ? stats(s, u).will : 0);
      const survives = (u: (typeof defenders)[number]) =>
        stats(s, u).health - u.damage > attack - defense(u);
      // Beregond and the Golden Shield like to defend; Aragorn must survive.
      const defender = defenders
        .filter((u) => u.code !== FLAME_WEST_ARAGORN || survives(u))
        .sort(
          (a, b) =>
            Number(survives(b)) - Number(survives(a)) ||
            Number(shielded(b)) - Number(shielded(a)) ||
            Number(b.code === P.beregond) - Number(a.code === P.beregond) ||
            defense(b) - defense(a),
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
    ["eowyn-setup", /^Éowyn: .*reduce.* threat by 3/],
    ["eowyn", /^Éowyn: .* to ready her/],
    ["beregond", /^Beregond: .*threat is reduced by 1/],
    ["grimbold", /^Grimbold is discarded: /],
    ["imrahil", /^Prince Imrahil loses the ally card type/],
    ["ghan", /^Ghân-buri-Ghân is discarded: /],
    ["sterner", /^Sterner than Steel: .* is exhausted/],
    ["shield", /^Golden Shield: /],
    ["livery", /^Livery of the Tower: /],
    ["roheryn", /^Roheryn: /],
  ] as const)
    if (s.log.some((l) => pattern.test(l.text))) used.add(`log:${key}`);
  return { s, steps, used };
}

// Easy mode's extra resource lets the Fellowship Aragorn pay for Banner of
// Elendil and the Spirit heroes for Prince Imrahil before the games end.
const FLAME_WEST_PLAYER_GAMES = [
  ["the-siege-of-gondor", 1, 1, false],
  ["the-siege-of-gondor", 2, 2, true],
  ["the-battle-of-the-pelennor-fields", 2, 3, true],
  ["the-battle-of-the-pelennor-fields", 1, 5, true],
  ["mirkwood", 2, 1, false],
  ["mirkwood", 2, 4, true],
] as const;

test("Seeded complete games with The Flame of the West player cards keep exact saves and the scenario's physical cards", () => {
  const used = new Set<string>();
  const results: string[] = [];
  for (const [scenarioId, players, seed, easy] of FLAME_WEST_PLAYER_GAMES) {
    const r = play(scenarioId, players, seed, easy);
    for (const k of r.used) used.add(k);
    results.push(
      `${scenarioId}/${players}/${seed}${easy ? "/easy" : ""}: ${r.s.status} after ${r.steps}`,
    );
  }
  const missing = [
    ...[
      P.grimbold,
      P.imrahil,
      P.halbarad,
      P.ghan,
      P.shield,
      P.livery,
      P.roheryn,
      P.banner,
    ].filter((code) => !used.has(code)),
    ...[
      `ability:${P.eowyn}`,
      `ability:${P.grimbold}`,
      "log:eowyn-setup",
      "log:eowyn",
      "log:beregond",
      "log:grimbold",
      "log:shield",
      "log:livery",
      "log:roheryn",
      "log:sterner",
      `ability:${P.ghan}`,
      "log:ghan",
      "log:imrahil",
    ].filter((key) => !used.has(key)),
  ];
  assert.deepEqual(
    missing,
    [],
    `${results.join("; ")} | used ${[...used].join(", ")}`,
  );
});
