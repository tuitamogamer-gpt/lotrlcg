import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, progressLocation, revealed } from "../src/game/board";
import { make, stagingThreat, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { MORGUL_VALE as M } from "../src/game/morgul-vale-support";
import {
  NIGHTMARE,
  NIGHTMARE_AS as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import { scenario } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Morgul Spider: an enemy with no "When Revealed" effect and no shadow. */
const QUIET = encounterCards.find((c) => c.name === "Morgul Spider")!.code;
const game = (seed = 5) => nightmareGame("the-morgul-vale", seed);
const two = (seed = 5) => nightmareForTwo("the-morgul-vale", seed);
const towerOf = (s: GameState) =>
  s.staging.find((u) => u.code === M.tower)!.progress;
/** A quiet board: To the Tower (1 progress token) and Murzag staged, a quiet encounter deck. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  const keep = s.staging.filter(
    (u) => u.code === M.tower || u.code === M.murzag,
  );
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: keep,
    nightmare: {},
  });
  s.staging.find((u) => u.code === M.tower)!.progress = 1;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.hand = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
/** Run effects through any review pauses. */
function run(s: GameState, effects: GameState["queue"] = []) {
  s.queue.unshift(...effects);
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const murzagOf = (s: GameState) => s.staging.find((u) => u.code === M.murzag)!;
/** Murzag engaged with the first player. */
function engageMurzag(s: GameState) {
  const m = murzagOf(s);
  s.staging = s.staging.filter((u) => u.id !== m.id);
  s.engaged.push(m);
  return m;
}
const destroyByAttack = (s: GameState, enemy: Unit, hero: Unit) => {
  damage(s, hero.id, 99, { combatDamage: true, enemyId: enemy.id });
  run(s);
};

test("Nightmare: The Morgul Vale's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.morgulCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Morgul Vale - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Forest Bat\n1x Watcher in the Wood\n3x Orc Arbalesters\n1x The Power of Mordor\n2x Morgul Sorcerer\n2x Morgul Tracker\n3x Morgul Road\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nSetup: Place 1 progress token on To the Tower\.$/,
  );
  const sentry = card(N.sentry);
  assert.deepEqual(
    [
      sentry.defense,
      sentry.health,
      sentry.engagement,
      sentry.printed_stats?.threat,
      sentry.printed_stats?.attack,
    ],
    [4, 5, 37, "X", "X"],
  );
  const nurn = card(N.nurn);
  assert.deepEqual(
    [nurn.threat, nurn.attack, nurn.defense, nurn.health, nurn.engagement],
    [2, 4, 3, 5, 18],
  );
  assert.match(nurn.text!, /^Each Captain enemy in play gets \+1 \[defense\]/);
  assert.match(card(N.fumes).text!, /assign damage among heroes he controls/);
  assert.match(card(N.beckons).text!, /The Tower Beckons adds X \[threat\]/);
  assert.match(card(N.ephel).text!, /^While Ephel Dúath is in the staging/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Morgul Vale - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    10,
  );
});

test("Nightmare: The Morgul Vale's Nightmare deck matches its source recipe, with 1 progress token on To the Tower at setup", () => {
  const sets = scenario("the-morgul-vale").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("the-morgul-vale", standard);
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N03.9")!;
  const want: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.code !== N.morgulCard && c.section !== "sharedQuestDeck")
      want[c.code] = (want[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), want);
  for (const [title, n] of Object.entries(
    NIGHTMARE["the-morgul-vale"]!.removals,
  ))
    assert.ok(card(N.morgulCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.morgulCard);
    assert.equal(towerOf(s), 1);
    assert.match(nightmareStatus(s)[0], /1 progress token was placed on To/);
  }
  assert.ok(valid(opening(game())));
});

test("Nightmare: Warrior of Nurn shields and heals the Captains, and Ephel Dúath arms them from the staging area", () => {
  const s = board("planning");
  const murzag = murzagOf(s);
  const base = stats(s, murzag);
  add(s, N.nurn);
  add(s, N.nurn, true);
  assert.equal(stats(s, murzag).defense, base.defense + 2);
  add(s, N.ephel);
  assert.equal(stats(s, murzag).attack, base.attack + 2);
  // Ephel Dúath as the active location gives nothing.
  s.activeLocation = make(s, N.ephel);
  assert.equal(stats(s, murzag).attack, base.attack + 2);
  // A non-Captain gets neither.
  const orc = add(s, N.captor);
  assert.deepEqual(
    [stats(s, orc).attack, stats(s, orc).defense],
    [card(N.captor).attack, card(N.captor).defense],
  );
  // The end of the round heals the Captains.
  murzag.damage = 4;
  run(s, hooks(s).roundEnd!(s));
  assert.equal(murzag.damage, 0);
  // Its shadow heals them too.
  const t = board("attack");
  const m = engageMurzag(t);
  m.damage = 3;
  shadow(t, m, N.nurn);
  run(t);
  assert.equal(m.damage, 0);
  // Ephel Dúath's shadow: progress, or an undefended attack.
  let u = board("attack");
  let e = engageMurzag(u);
  shadow(u, e, N.ephel, u.heroes[0]);
  u = pick(u, "undefended");
  assert.equal(u.combat!.defenderId, null);
  assert.equal(towerOf(u), 1);
  u = board("attack");
  e = engageMurzag(u);
  shadow(u, e, N.ephel, u.heroes[0]);
  u = pick(u, "tower");
  assert.equal(towerOf(u), 2);
  assert.equal(u.combat!.defenderId, u.heroes[0].id);
});

test("Nightmare: Orc Captor carries the captives from the staging area and hardens the attacker; Sentry of the White Bridge grows with To the Tower", () => {
  const s = board("planning");
  add(s, N.captor);
  add(s, N.captor, true);
  run(s, hooks(s).roundEnd!(s));
  assert.equal(towerOf(s), 2, "only the staged Orc Captor");
  // Orc Captor's shadow: +3 [defense] until the end of the combat phase.
  const t = board("attack");
  const m = engageMurzag(t);
  const before = stats(t, m).defense;
  shadow(t, m, N.captor);
  assert.equal(stats(t, m).defense, before + 3);
  t.phase = "refresh";
  assert.equal(stats(t, m).defense, before);
  // Sentry of the White Bridge: X is the progress on To the Tower.
  const u = board("planning");
  const sentry = add(u, N.sentry);
  u.staging.find((x) => x.code === M.tower)!.progress = 3;
  assert.equal(threatOf(u, sentry), 3);
  assert.equal(stats(u, sentry).attack, 3);
  // Its shadow: +1 [attack]; a destroyed character places progress.
  const v = board("attack");
  const e = engageMurzag(v);
  const hero = v.heroes[0];
  shadow(v, e, N.sentry, hero);
  assert.equal(v.combat!.attackBonus, 1);
  destroyByAttack(v, e, hero);
  run(v, hooks(v).attackFinished!(v, v.combat!));
  assert.equal(towerOf(v), 2);
  assert.equal(v.nightmare?.morgulKill, undefined);
  // Without a destroyed character, nothing.
  const w = board("attack");
  const f = engageMurzag(w);
  shadow(w, f, N.sentry, w.heroes[0]);
  run(w, hooks(w).attackFinished!(w, w.combat!));
  assert.equal(towerOf(w), 1);
});

test("Nightmare: Banks of Morgulduin becomes a Captain's shadow card when explored, and deals a Captain 3 more shadow cards", () => {
  const s = board("planning");
  const banks = add(s, N.banks);
  progressLocation(s, banks, 4);
  run(s);
  const murzag = murzagOf(s);
  assert.ok(murzag.shadows.includes(N.banks));
  assert.ok(!s.encounterDiscard.includes(N.banks));
  assert.ok(!s.staging.some((u) => u.id === banks.id));
  assert.ok(valid(s));
  // With no Captain in play, it is discarded.
  const t = board("planning");
  t.staging = t.staging.filter((u) => u.code !== M.murzag);
  const other = add(t, N.banks);
  progressLocation(t, other, 4);
  run(t);
  assert.ok(t.encounterDiscard.includes(N.banks));
  // Its shadow: 3 additional shadow cards for a Captain, revealed now.
  const u = board("attack");
  const m = engageMurzag(u);
  shadow(u, m, N.banks, u.heroes[0]);
  run(u);
  assert.equal(m.shadows.length, 4);
  assert.equal(m.revealedShadowCount, 4);
  // None for another enemy.
  const v = board("attack");
  const orc = add(v, N.captor, true);
  shadow(v, orc, N.banks, v.heroes[0]);
  run(v);
  assert.equal(orc.shadows.length, 1);
  // Lord Alcaron attacks again for each one without a shadow effect.
  const w = board("attack");
  const alcaron = add(w, M.alcaron, true);
  shadow(w, alcaron, N.banks, w.heroes[0]);
  run(w);
  assert.equal(alcaron.shadows.length, 4);
  assert.equal(alcaron.morgulExtraAttacks, 3);
});

test("Nightmare: White-flowered Fields exhausts a hero or carries the captives at the end of the round, and its shadow sends the attacker back", () => {
  let s = board("planning");
  add(s, N.fields);
  run(s, hooks(s).roundEnd!(s));
  assert.ok(s.choice);
  const hero = s.heroes[0];
  s = pick(s, hero.id);
  assert.ok(hero.exhausted);
  assert.equal(towerOf(s), 1);
  // With no ready hero, the progress is placed.
  const t = board("planning");
  add(t, N.fields);
  for (const h of t.heroes) h.exhausted = true;
  run(t, hooks(t).roundEnd!(t));
  assert.equal(t.choice, null);
  assert.equal(towerOf(t), 2);
  // As the active location it applies too, for each player.
  const u = board("planning", opening(two()));
  u.activeLocation = make(u, N.fields);
  const effects = hooks(u).roundEnd!(u);
  assert.equal(effects.filter((e) => e.kind === "nmvFields").length, 2);
  // Its shadow returns the attacking enemy to the staging area.
  const v = board("attack");
  const m = engageMurzag(v);
  shadow(v, m, N.fields);
  assert.equal(v.combat!.returnToStaging, true);
});

test("Nightmare: The Tower Beckons adds To the Tower's progress to the staging area for the phase; Noxious Fumes deals it to each player's heroes", () => {
  const s = board("staging");
  const before = stagingThreat(s);
  revealed(s, N.beckons);
  run(s);
  assert.equal(towerOf(s), 2);
  assert.equal(stagingThreat(s), before + 2);
  s.phase = "travel";
  assert.equal(stagingThreat(s), before);
  // Its shadow places a progress token.
  const t = board("attack");
  const m = engageMurzag(t);
  shadow(t, m, N.beckons);
  run(t);
  assert.equal(towerOf(t), 2);
  // Noxious Fumes: 2 damage assigned among the heroes, together.
  let u = board("planning");
  revealed(u, N.fumes);
  run(u);
  assert.equal(towerOf(u), 2);
  const first = u.heroes[0];
  for (let i = 0; i < 4 && u.choice; i++) u = pick(u, first.id);
  run(u);
  assert.equal(first.damage, 2);
  assert.equal(
    u.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  assert.ok(u.encounterDiscard.includes(N.fumes));
  // Its shadow: a destroyed character places progress.
  const v = board("attack");
  const e = engageMurzag(v);
  const hero = v.heroes[0];
  shadow(v, e, N.fumes, hero);
  destroyByAttack(v, e, hero);
  run(v, hooks(v).attackFinished!(v, v.combat!));
  assert.equal(towerOf(v), 2);
});

test("Nightmare: The Morgul Vale's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    morgulBeckons: { round: 1, phase: "quest", n: 1 },
    morgulCaptor: { round: 1, bonus: { c1: 3 } },
    morgulKill: { enemyId: "c1", n: 1, killed: false },
  };
  assert.ok(valid(s));
  s.nightmare = { morgulKill: { enemyId: "c1", n: 0, killed: false } };
  assert.equal(valid(s), false);
  s.nightmare = { morgulCaptor: { round: 1, bonus: { c1: -3 } } };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `the-morgul-vale seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player the-morgul-vale");
});
