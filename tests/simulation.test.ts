import { FANGORN } from "../src/game/fangorn-support.ts";
import { applyAction } from "./pass-resource-window.ts";
import nodeTest from "node:test";
import assert from "node:assert/strict";
import { STARTERS, card } from "../src/game/cards.ts";
import {
  createGame,
  canPlay,
  availableAbilities,
  canCommit,
  canTravel,
  characters,
  stats,
  playTargets,
  needsTarget,
  objectiveFree,
  canFight,
  hasClue,
  newCampaign,
  validateSave,
} from "../src/game/engine.ts";
import { CAMPAIGN_CHAPTERS, SCENARIOS } from "../src/game/scenarios.ts";
import { emynMuilMustCommit } from "../src/game/emyn-muil.ts";
import { defendersFor, attackersFor } from "../src/game/table.ts";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support.ts";
import { RHOS } from "../src/game/rhosgobel.ts";
import { KHAZAD, khazadCannotExhaust } from "../src/game/khazad-dum.ts";
import { watcherWaterCannotExhaust } from "../src/game/watcher-water.ts";
import { isSacked } from "../src/game/carrock.ts";
import { HEIRS_NUMENOR as HEIRS } from "../src/game/heirs-numenor-support.ts";
import { STEWARD_CLUES } from "../src/game/steward-fear-support.ts";
import { FOUNDATIONS_STONE as FOUNDATIONS } from "../src/game/foundations-stone-support.ts";
import type {
  ScenarioId,
  PlayMode,
  Action,
  GameState,
  Option,
  ReviewMode,
} from "../src/game/types.ts";

// Partition complete games by registration order, without changing default npm test.
// Manifest mode is checked separately so CI cannot silently omit or duplicate a case.
const shardCount = Number(process.env.SIMULATION_SHARDS ?? 1);
const shardIndex = Number(process.env.SIMULATION_SHARD ?? 0);
const listOnly = process.env.SIMULATION_LIST_ONLY === "1";
if (
  !Number.isInteger(shardCount) ||
  shardCount < 1 ||
  shardCount > 16 ||
  !Number.isInteger(shardIndex) ||
  shardIndex < 0 ||
  shardIndex >= shardCount
)
  throw new Error(
    "Invalid simulation shard: require 0 <= SIMULATION_SHARD < SIMULATION_SHARDS <= 16.",
  );
let registeredCases = 0;
const selectedCases: string[] = [];
const test: typeof nodeTest = ((...args: Parameters<typeof nodeTest>) => {
  const index = registeredCases++;
  if (index % shardCount !== shardIndex) return;
  selectedCases.push(String(args[0]));
  if (!listOnly) return nodeTest(...args);
}) as typeof nodeTest;
function choose(s: GameState): Option {
  const opts = s.choice!.options;
  const title = s.choice!.title;
  const skip = opts.find((o) => o.id === "skip");
  if (title === "Choose the current quest")
    return opts.find((o) => o.code === "09014") ?? opts[0];
  if (title.includes("Cave Torch") && title.includes("Illuminate"))
    return opts.find((o) => o.id.endsWith(":3")) ?? opts[0];
  if (
    title.includes("Valiant") ||
    title.includes("Strength of Will") ||
    title.includes("Son of Arnor")
  )
    return skip ?? opts[0];
  if (title.includes("Gandalf has"))
    return s.threat > 35
      ? opts.find((o) => o.id === "threat")!
      : (opts.find((o) => o.detail?.includes("damage")) ??
          opts.find((o) => o.id === "draw")!);
  if (title.includes("Assign") || title.includes("Orcs")) {
    return [...opts].sort((a, b) => {
      const ua = characters(s).find((u) => u.id === a.id),
        ub = characters(s).find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).health - ub.damage : 0) -
        (ua ? stats(s, ua).health - ua.damage : 0)
      );
    })[0];
  }
  if (title.includes("exhaust"))
    return [...opts].sort((a, b) => {
      const ua = characters(s).find((u) => u.id === a.id),
        ub = characters(s).find((u) => u.id === b.id);
      return (ua ? stats(s, ua).attack : 0) - (ub ? stats(s, ub).attack : 0);
    })[0];
  if (title.includes("Path"))
    return opts.find((o) => o.code === "01076") ?? opts[0];
  return (
    opts.find((o) => o.id === "cancel") ??
    opts.find((o) => o.id === "ready") ??
    opts.find((o) => o.id === "bottom") ??
    opts.find((o) => o.id === "continue") ??
    opts.find((o) => o.id !== "skip") ??
    opts[0]
  );
}
function run(
  seed: number,
  id: string,
  scenarioId: ScenarioId = "mirkwood",
  playMode: PlayMode = "normal",
  guided = false,
  reviewMode?: ReviewMode,
  deckOverride?: {
    id: string;
    cards: Record<string, number>;
    heroes: string[];
  },
  observed?: Set<string>,
) {
  const d = deckOverride ?? STARTERS.find((x) => x.id === id)!;
  const campaign = newCampaign(d.heroes);
  const chapter = SCENARIOS.findIndex((q) => q.id === scenarioId);
  campaign.completed = SCENARIOS.slice(0, chapter).map((q) => ({
    scenarioId: q.id,
    score: 100,
    rounds: 6,
  }));
  if (chapter) {
    campaign.boons = ["rc132"];
    campaign.burdens = [seed % 2 ? "rc136" : "rc137"];
  }
  if (chapter === 2) {
    campaign.prisoner = d.heroes[1];
    campaign.permanent[d.heroes[0]] = ["rc133", "rc138"];
    campaign.boons.push("rc133");
    campaign.burdens.push("rc138");
  }
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId,
    playMode,
    guided,
    reviewMode,
    ...(playMode === "campaign" ? { campaign } : {}),
  });
  let steps = 0;
  while (
    (s.status === "playing" || s.flow?.pending) &&
    steps++ < (guided ? 5000 : 1000)
  ) {
    let action: Action;
    const objective = s.staging.find((u) => objectiveFree(s, u));
    const bearer = [...s.heroes]
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack)
      .find(
        (h) =>
          (![
            FANGORN.mugash,
            RHOS.athelas,
            KHAZAD.book,
            KHAZAD.tools,
            HEIRS.scroll,
            ...STEWARD_CLUES,
            FOUNDATIONS.axe,
            FOUNDATIONS.helm,
          ].includes(objective?.code ?? "") ||
            (!h.exhausted &&
              !isSacked(h) &&
              !khazadCannotExhaust(h) &&
              !watcherWaterCannotExhaust(h))) &&
          h.attachments.filter((a) => card(a.code).text?.includes("Restricted"))
            .length < 2,
      );
    if (s.flow?.pending)
      action = { type: "CONTINUE", stepId: s.flow.pending.id };
    else if (s.choice) action = { type: "CHOOSE", id: choose(s).id };
    else if (s.escapeTest) action = { type: "RESOLVE_ESCAPE" };
    else if (s.phase === "setup") action = { type: "KEEP" };
    else if (objective && bearer && s.threat < 46)
      action = { type: "CLAIM", id: objective.id, heroId: bearer.id };
    else if (
      s.phase === "refresh" &&
      s.activeLocation?.code === SHADOW_FLAME.pit &&
      availableAbilities(s, s.activeLocation).some((o) => !o.disabled)
    )
      action = { type: "ABILITY", id: s.activeLocation.id };
    else if (
      s.phase === "refresh" &&
      characters(s).some((h) =>
        h.attachments.some(
          (a) =>
            a.code === KHAZAD.tools &&
            availableAbilities(s, h).some((o) => o.id === a.id && !o.disabled),
        ),
      )
    ) {
      const h = characters(s).find((h) =>
        h.attachments.some(
          (a) =>
            a.code === KHAZAD.tools &&
            availableAbilities(s, h).some((o) => o.id === a.id && !o.disabled),
        ),
      )!;
      action = {
        type: "ABILITY",
        id: h.id,
        attachmentId: h.attachments.find((a) => a.code === KHAZAD.tools)!.id,
      };
    } else if (s.phase === "planning") {
      const encounterAbility = [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
        ...(s.extraActiveLocations ?? []),
      ].find(
        (u) =>
          u.code === KHAZAD.shaft &&
          s.threat < 45 &&
          availableAbilities(s, u).some((o) => !o.disabled),
      );
      const steward = characters(s).flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              ["01026", KHAZAD.fear, KHAZAD.torch].includes(a.code) &&
              availableAbilities(s, h).some(
                (option) => option.id === a.id && !option.disabled,
              ),
          )
          .map((a) => ({ h, a })),
      )[0];
      if (encounterAbility)
        action = { type: "ABILITY", id: encounterAbility.id };
      else if (steward)
        action = {
          type: "ABILITY",
          id: steward.h.id,
          attachmentId: steward.a.id,
        };
      else {
        const playable = s.hand.filter(
          (u) =>
            !canPlay(s, u) &&
            (["ally", "attachment", "player-side-quest"].includes(
              card(u.code).type_code,
            ) ||
              u.code === "09007") &&
            (!needsTarget(u) || playTargets(s, u).length),
        );
        const u = playable.sort(
          (a, b) => Number(card(a.code).cost) - Number(card(b.code).cost),
        )[0];
        action = u
          ? { type: "PLAY", id: u.id, target: playTargets(s, u)[0]?.id }
          : { type: "NEXT" };
      }
    } else if (s.phase === "quest") {
      const ready =
        s.scenarioId === "hunt-for-gollum" &&
        s.stage === 3 &&
        !s.heroes.some(hasClue)
          ? []
          : characters(s)
              .filter((u) => canCommit(s, u))
              .sort((a, b) => stats(s, b).will - stats(s, a).will);
      const reserve =
        engagedEnemies(s).length ||
        s.staging.some(
          (e) =>
            card(e.code).type_code === "enemy" &&
            (card(e.code).engagement ?? 99) <= s.threat,
        )
          ? 1
          : 0;
      const selected = ready
        .slice(
          0,
          Math.max(
            ready.length ? 1 : 0,
            ready.length - (emynMuilMustCommit(s) ? 0 : reserve),
          ),
        )
        .map((u) => u.id);
      const missing = selected.find((id) => !s.committedIds.includes(id));
      action = missing
        ? { type: "TOGGLE_QUEST", id: missing }
        : { type: "COMMIT" };
    } else if (s.phase === "travel") {
      const loc = s.staging
        .filter((u) => !canTravel(s, u))
        .sort(
          (a, b) =>
            Number(b.code === "01088") - Number(a.code === "01088") ||
            (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
        )[0];
      action =
        !s.activeLocation && loc
          ? { type: "TRAVEL", id: loc.id }
          : { type: "NEXT" };
    } else if (s.phase === "defense") {
      const e = engagedEnemies(s).find(
        (e) =>
          normalAttackPending(s, e) &&
          !e.feinted &&
          !e.attachments.some((a) => a.code === "01069"),
      );
      assert.ok(
        e,
        "There must be a legal enemy attack or the phase should advance.",
      );
      const ready = defendersFor(s, e).sort(
        (a, b) => stats(s, b).defense - stats(s, a).defense,
      );
      action = {
        type: "DEFEND",
        enemyId: e.id,
        defenderId: ready[0]?.id ?? null,
      };
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
    if (action.type === "PLAY")
      observed?.add(`played:${s.hand.find((u) => u.id === action.id)?.code}`);
    if (
      action.type === "CHOOSE" &&
      s.choice?.title === "Choose the current quest"
    )
      observed?.add(
        `selected:${s.choice.options.find((o) => o.id === action.id)?.code}`,
      );
    try {
      s = applyAction(s, action);
      if (s.victoryCards?.includes("09014")) observed?.add("defeated:09014");
    } catch (e) {
      throw new Error(
        `${scenarioId}/${playMode}/${id}/seed${seed}/${s.phase}: ${(e as Error).message}`,
        { cause: e },
      );
    }
    assert.ok(
      validateSave(s),
      `${scenarioId}/${playMode}/${id}/seed${seed}: valid save after ${action.type}`,
    );
    assert.ok(Number.isFinite(s.threat));
    assert.ok(s.heroes.every((h) => h.resources >= 0));
    assert.ok(
      [...s.heroes, ...s.allies, ...s.engaged].every(
        (u) => u.damage < stats(s, u).health,
      ),
    );
    assert.equal(
      new Set(
        [...s.heroes, ...s.allies, ...s.hand, ...s.staging, ...s.engaged].map(
          (u) => u.id,
        ),
      ).size,
      s.heroes.length +
        s.allies.length +
        s.hand.length +
        s.staging.length +
        s.engaged.length,
    );
  }
  assert.notEqual(
    s.status,
    "playing",
    `${id} seed ${seed} stalled at ${s.phase}`,
  );
  return s;
}
const lostRealmDeck = {
  id: "custom",
  heroes: ["09001", "09002", "01012"],
  cards: Object.fromEntries(
    [
      "09003",
      "09004",
      "09005",
      "09006",
      "09008",
      "09009",
      "09010",
      "09011",
      "09012",
      "09013",
      "09014",
      "02002",
      "01013",
      "09007",
      "01034",
      "01057",
      "01065",
      "01073",
    ].map((code) => [code, code === "09014" || code === "01073" ? 1 : 3]),
  ),
};
for (const scenarioId of ["mirkwood", "trouble-in-tharbad"] as const)
  test(`Lost Realm fellowship / ${scenarioId}: complete seeded games and every review mode preserve outcomes`, () => {
    const results = { won: 0, lost: 0 };
    for (let seed = 1; seed <= 10; seed++)
      results[
        run(
          seed,
          lostRealmDeck.id,
          scenarioId,
          "normal",
          false,
          undefined,
          lostRealmDeck,
        ).status as "won" | "lost"
      ]++;
    const immediate = run(
      27,
      lostRealmDeck.id,
      scenarioId,
      "normal",
      false,
      undefined,
      lostRealmDeck,
    );
    for (const review of ["all", "hidden", "decisions"] as const) {
      const { flow, ...paced } = run(
        27,
        lostRealmDeck.id,
        scenarioId,
        "normal",
        true,
        review,
        lostRealmDeck,
      );
      assert.deepEqual(paced, immediate);
      assert.equal(flow!.pending, null);
    }
    console.log("Lost Realm fellowship", scenarioId, results);
  });

test("Lost Realm scenario sweep: played Rangers and selected side quests finish across every supported scenario", () => {
  const observed = new Set<string>();
  const results: { scenario: string; won: number; lost: number }[] = [];
  for (const q of SCENARIOS) {
    const row = { scenario: q.id, won: 0, lost: 0 };
    for (const seed of [10, 31]) {
      const immediate = run(
        seed,
        lostRealmDeck.id,
        q.id,
        "normal",
        false,
        undefined,
        lostRealmDeck,
        observed,
      );
      row[immediate.status as "won" | "lost"]++;
      if (seed === 10) {
        const { flow, ...paced } = run(
          seed,
          lostRealmDeck.id,
          q.id,
          "normal",
          true,
          "decisions",
          lostRealmDeck,
        );
        assert.deepEqual(paced, immediate, `${q.id}: Lost Realm review parity`);
        assert.equal(flow!.pending, null);
      }
    }
    results.push(row);
  }
  assert.ok(observed.has("played:09007"), "Ranger Summons was actually played");
  assert.ok(
    observed.has("played:09014"),
    "Gather Information was actually played",
  );
  assert.ok(
    observed.has("selected:09014"),
    "Gather Information was actually selected",
  );
  assert.ok(
    observed.has("defeated:09014"),
    "Gather Information was actually defeated",
  );
  console.log(
    "Lost Realm scenario sweep",
    JSON.stringify({ results, observed: [...observed].sort() }),
  );
});

for (const d of STARTERS)
  test(`${d.subtitle}: 25 seeded complete games terminate without illegal state or stuck decisions`, () => {
    const results = { won: 0, lost: 0 };
    for (let seed = 1; seed <= 25; seed++) {
      const result = run(seed, d.id).status;
      results[result as "won" | "lost"]++;
    }
    console.log(d.id, results);
  });

for (const q of SCENARIOS)
  for (const mode of ["normal", "campaign"] as const) {
    if (q.id === "mirkwood" && mode === "normal") continue;
    if (mode === "campaign" && !CAMPAIGN_CHAPTERS.includes(q.id)) continue;
    test(`${q.name} / ${mode}: all four starter decks complete 10 seeded games each`, () => {
      const results = { won: 0, lost: 0 };
      for (const d of STARTERS)
        for (let seed = 1; seed <= 10; seed++)
          results[run(seed, d.id, q.id, mode).status as "won" | "lost"]++;
      console.log(q.id, mode, results);
    });
  }

for (const q of SCENARIOS)
  for (const review of ["hidden", "decisions"] as const)
    test(`${q.name}: ${review} review mode preserves complete-game rules outcomes with fewer pauses`, () => {
      for (const d of STARTERS)
        for (let seed = 1; seed <= 2; seed++) {
          const immediate = run(seed, d.id, q.id, "normal");
          const { flow, ...paced } = run(
            seed,
            d.id,
            q.id,
            "normal",
            true,
            review,
          );
          assert.deepEqual(
            paced,
            immediate,
            `${q.id}/${review}/${d.id}/${seed}`,
          );
          assert.equal(flow!.mode, review);
          if (review === "decisions") assert.equal(flow!.pending, null);
        }
    });
for (const q of SCENARIOS)
  for (const mode of ["normal", "campaign"] as const)
    test(`${q.name} / ${mode}: guided confirmations preserve complete-game rules outcomes`, (t) => {
      if (mode === "campaign" && !CAMPAIGN_CHAPTERS.includes(q.id))
        return t.skip("campaign chapters are the Core Set quests");
      for (const d of STARTERS)
        for (let seed = 1; seed <= 3; seed++) {
          const immediate = run(seed, d.id, q.id, mode);
          const { flow: _flow, ...guided } = run(seed, d.id, q.id, mode, true);
          assert.deepEqual(
            guided,
            immediate,
            `${q.id}/${mode}/${d.id}/${seed}`,
          );
        }
    });

if (listOnly) console.log(JSON.stringify({ registeredCases, selectedCases }));
