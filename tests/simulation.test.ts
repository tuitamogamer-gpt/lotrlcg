import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS, card } from "../src/game/cards.ts";
import {
  createGame,
  applyAction,
  canPlay,
  characters,
  stats,
  playTargets,
  needsTarget,
  objectiveFree,
  canFight,
  newCampaign,
  validateSave,
} from "../src/game/engine.ts";
import { SCENARIOS } from "../src/game/scenarios.ts";
import type {
  ScenarioId,
  PlayMode,
  Action,
  GameState,
  Option,
} from "../src/game/types.ts";
function choose(s: GameState): Option {
  const opts = s.choice!.options;
  const title = s.choice!.title;
  const skip = opts.find((o) => o.id === "skip");
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
) {
  const d = STARTERS.find((x) => x.id === id)!;
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
    ...(playMode === "campaign" ? { campaign } : {}),
  });
  let steps = 0;
  while (s.status === "playing" && steps++ < 1000) {
    let action: Action;
    const objective = s.staging.find((u) => objectiveFree(s, u));
    const bearer = [...s.heroes]
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack)
      .find(
        (h) =>
          h.attachments.filter((a) => card(a.code).text?.includes("Restricted"))
            .length < 2,
      );
    if (s.choice) action = { type: "CHOOSE", id: choose(s).id };
    else if (s.phase === "setup") action = { type: "KEEP" };
    else if (objective && bearer && s.threat < 46)
      action = { type: "CLAIM", id: objective.id, heroId: bearer.id };
    else if (s.phase === "planning") {
      const steward = characters(s).flatMap((h) =>
        h.attachments
          .filter((a) => a.code === "01026" && !a.exhausted)
          .map((a) => ({ h, a })),
      )[0];
      if (steward)
        action = {
          type: "ABILITY",
          id: steward.h.id,
          attachmentId: steward.a.id,
        };
      else {
        const playable = s.hand.filter(
          (u) =>
            !canPlay(s, u) &&
            ["ally", "attachment"].includes(card(u.code).type_code) &&
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
      const ready = characters(s)
        .filter((u) => !u.exhausted)
        .sort((a, b) => stats(s, b).will - stats(s, a).will);
      const reserve =
        s.engaged.length ||
        s.staging.some(
          (e) =>
            card(e.code).type_code === "enemy" &&
            (card(e.code).engagement ?? 99) <= s.threat,
        )
          ? 1
          : 0;
      const selected = ready
        .slice(0, Math.max(1, ready.length - reserve))
        .map((u) => u.id);
      const missing = selected.find((id) => !s.committedIds.includes(id));
      action = missing
        ? { type: "TOGGLE_QUEST", id: missing }
        : { type: "COMMIT" };
    } else if (s.phase === "travel") {
      const loc = s.staging
        .filter(
          (u) =>
            card(u.code).type_code === "location" &&
            (u.code !== "01077" || s.heroes.some((h) => !h.exhausted)) &&
            (u.code !== "01094" || s.hand.length >= 2),
        )
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
      const e = s.engaged.find(
        (e) =>
          !e.attacked &&
          !e.feinted &&
          !e.attachments.some((a) => a.code === "01069"),
      );
      assert.ok(
        e,
        "There must be a legal enemy attack or the phase should advance.",
      );
      const ready = characters(s)
        .filter((u) => !u.exhausted && canFight(u))
        .sort((a, b) => stats(s, b).defense - stats(s, a).defense);
      action = {
        type: "DEFEND",
        enemyId: e.id,
        defenderId: ready[0]?.id ?? null,
      };
    } else if (s.phase === "attack") {
      const ready = characters(s).filter((u) => !u.exhausted && canFight(u));
      const enemy = s.engaged
        .filter((e) => !e.attacked)
        .sort(
          (a, b) =>
            stats(s, a).health - a.damage - (stats(s, b).health - b.damage),
        )[0];
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
      s = applyAction(s, action);
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
  return s.status;
}
for (const d of STARTERS)
  test(`${d.subtitle}: 25 seeded complete games terminate without illegal state or stuck decisions`, () => {
    const results = { won: 0, lost: 0 };
    for (let seed = 1; seed <= 25; seed++) {
      const result = run(seed, d.id);
      results[result as "won" | "lost"]++;
    }
    console.log(d.id, results);
  });

for (const q of SCENARIOS)
  for (const mode of ["normal", "campaign"] as const) {
    if (q.id === "mirkwood" && mode === "normal") continue;
    test(`${q.name} / ${mode}: all four starter decks complete 10 seeded games each`, () => {
      const results = { won: 0, lost: 0 };
      for (const d of STARTERS)
        for (let seed = 1; seed <= 10; seed++)
          results[run(seed, d.id, q.id, mode) as "won" | "lost"]++;
      console.log(q.id, mode, results);
    });
  }
