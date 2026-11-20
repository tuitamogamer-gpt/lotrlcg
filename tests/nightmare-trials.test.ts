import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { trialsCheck, trialsRemoveTime } from "../src/game/three-trials";
import { canTravel } from "../src/game/engine";
import { TRIALS as T } from "../src/game/three-trials-support";
import { syncAttachmentText } from "../src/game/attachment-text";
import { playerCardImmune } from "../src/game/card-immunity";
import { mainQuestUnit } from "../src/game/quest-state";
import { scenario } from "../src/game/scenarios";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_RINGMAKER as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
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

/** The Three Trials: a location with no effect while in the staging area. */
const QUIET = T.forest;
const ALLY = "01017"; // Silverlode Archer: a non-unique ally
const ID = "the-three-trials";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board in a trial, with nothing staged, engaged or active. */
function board(
  phase: GameState["phase"],
  trial = T.strength,
  s: GameState = opening(game()),
) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    stage: 2,
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
    questAttachments: {},
  });
  const q = s.threeTrials!;
  q.activeQuest = trial;
  q.currentKey =
    trial === T.strength
      ? T.wolfKey
      : trial === T.perseverance
        ? T.boarKey
        : T.ravenKey;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [], allies: [] });
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
const key = (s: GameState, hero: Unit, code: string) =>
  hero.attachments.push({ id: `k${s.nextId++}`, code, exhausted: false });
function run(s: GameState) {
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);

test("Nightmare: The Three Trials' setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.trialsCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Three Trials - Nightmare", true],
  );
  assert.match(
    c.text!,
    /3x Spirit of the Wild\n3x Grim Foothills\n1x Tangled Woods\n3x Turned Around\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nEach engaged Guardian enemy contributes its [threat] to the total [threat] in the staging area.\nWhile the Trial of Intuition is the current trial, each Guardian enemy cannot be damaged, and each Barrow location cannot be the active location and is immune to player card effects.",
  );
  assert.match(c.imagesrc!, /f096ca9b-c50e-4897-b0c6-216c9c520bee\.jpg$/);
  assert.match(
    card(N.wolfSpirit).text!,
    /each Wolf enemy gets \+1 \[attack\]\.\nForced:.*Wolf's Guardian, if able\.$/,
  );
  assert.match(
    card(N.boarSpirit).text!,
    /each Boar enemy gets \+1 \[defense\]/,
  );
  assert.match(
    card(N.ravenSpirit).text!,
    /each Raven enemy gets \+1 \[threat\]/,
  );
  assert.match(
    card(N.sacred).text!,
    /removed\."\nTravel: Remove each time counter/,
  );
  assert.equal(
    card(N.pillars).shadow,
    "Shadow: Attacking enemy gets +3 [defense] until the end of the phase.",
  );
  assert.equal(
    card(N.ancestors).shadow,
    "Shadow: If the defending character is not unique, attacking enemy gets +10 [attack].",
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Three Trials - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((a) => set.some((x) => x.code === a.code)).length, 9);
});

test("Nightmare: The Three Trials' Nightmare deck matches its source recipe, and engaged Guardians add their threat to the staging area", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const recipe = recipes.find((r) => r.id === "N04.5")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count([...pile("sharedEncounterDeck"), ...pile("sharedSetAside")]),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.trialsCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.trialsCard);
    assert.ok(valid(s));
  }
  assert.equal(
    automatedScenarioId({
      name: "The Three Trials (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(opening(game()))[0],
    /engaged Guardian enemy contributes/,
  );
  const s = board("quest");
  const guardian = add(s, T.wolf, true);
  assert.equal(hooks(s).stagingThreat!(s), threatOf(s, guardian));
  s.engaged = [];
  s.staging.push(guardian);
  assert.equal(
    hooks(s).stagingThreat!(s),
    0,
    "a staged Guardian counts as usual",
  );
});

test("Nightmare: During the Trial of Intuition, Guardians cannot be damaged and Barrows can neither be active nor affected by player cards", () => {
  const s = board("travel", T.intuition);
  const guardian = add(s, T.raven, true);
  damage(s, guardian.id, 3);
  assert.equal(guardian.damage, 0);
  const barrow = add(s, T.hill);
  syncAttachmentText(s);
  assert.equal(playerCardImmune(barrow), true);
  s.phase = "travel";
  assert.match(
    canTravel(s, barrow) ?? "",
    /cannot be active during the Trial of Intuition/,
  );
  // An active Barrow returns to the staging area.
  s.staging = [];
  s.activeLocation = barrow;
  trialsCheck(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === barrow.id));
  // Another trial: no Nightmare restriction.
  const t = board("travel", T.perseverance);
  const other = add(t, T.hill);
  syncAttachmentText(t);
  assert.equal(playerCardImmune(other), false);
  assert.equal(hooks(t).cannotBeActiveLocation!(t, other), false);
  const g = add(t, T.boar, true);
  damage(t, g.id, 2);
  assert.equal(g.damage, 0, "the scenario's own Perseverance rule");
});

test("Nightmare: Wolf, Boar and Raven Spirits strengthen their kin beside their Guardian and engage the Key's holder at the beginning of the encounter phase", () => {
  const s = board("encounter");
  const spirit = add(s, N.wolfSpirit);
  const other = add(s, N.wolfSpirit);
  const base = card(N.wolfSpirit).attack!;
  assert.equal(stats(s, spirit).attack, base, "no Wolf's Guardian yet");
  s.victoryCards = [T.wolf];
  assert.equal(stats(s, spirit).attack, base + 2, "one for each Wolf Spirit");
  s.staging = s.staging.filter((u) => u.id !== other.id);
  const boar = add(s, N.boarSpirit);
  const boarGuardian = add(s, T.boar);
  assert.equal(stats(s, boarGuardian).defense, card(T.boar).defense! + 1);
  assert.equal(stats(s, boar).defense, card(N.boarSpirit).defense! + 1);
  const raven = add(s, N.ravenSpirit);
  add(s, T.raven);
  assert.equal(threatOf(s, raven), card(N.ravenSpirit).threat! + 1);
  // Engagement: the holder of Key of the Raven, in a two-player game (not
  // the Trial of Strength's own Key, which would end the trial).
  const t = board("encounter", T.strength, opening(two()));
  const ravenSpirit = add(t, N.ravenSpirit);
  forOwner(t, 1, () => key(t, t.heroes[0], T.ravenKey));
  hooks(t).encounterBegin!(t);
  run(t);
  assert.ok(seatView(t, 1).engaged.some((u) => u.id === ravenSpirit.id));
  // The Guardian engaged with one player and the Key with the other: a choice.
  const u = board("encounter", T.strength, opening(two()));
  const w = add(u, N.ravenSpirit);
  add(u, T.raven, true);
  forOwner(u, 1, () => key(u, u.heroes[0], T.ravenKey));
  hooks(u).encounterBegin!(u);
  run(u);
  assert.match(u.choice!.title, /Choose the player it engages/);
  pick(u, "p0");
  assert.ok(seatView(u, 0).engaged.some((x) => x.id === w.id));
});

test("Nightmare: Sacred Forest heals Guardians as their time counters fall, and its Travel cost strips an enemy's time counters", () => {
  const s = board("travel");
  add(s, N.sacred);
  add(s, N.sacred);
  const guardian = add(s, T.wolf, true);
  Object.assign(guardian, { damage: 9, timeCounters: 3 });
  trialsRemoveTime(s, guardian, 1);
  assert.equal(guardian.damage, 5, "2 for each copy");
  // Travel: each time counter leaves one enemy.
  const t = board("travel");
  const forest = add(t, N.sacred);
  const g = add(t, T.boar, true);
  g.timeCounters = 2;
  assert.equal(hooks(t).travelProblem!(t, forest), null);
  t.queue.unshift(...hooks(t).travelEffects!(t, forest));
  run(t);
  assert.equal(g.timeCounters, 2, "the Boar's Guardian deadline resets it");
  assert.match(
    t.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n"),
    /Boar's Guardian · Time 0/,
  );
  const u = board("travel");
  const lone = add(u, N.sacred);
  assert.match(
    hooks(u).travelProblem!(u, lone) ?? "",
    /requires an enemy with time counters/,
  );
});

test("Nightmare: Haunted Pillars must be traveled to, returns the active location or surges, and its shadow hardens the attacker", () => {
  const s = board("travel");
  const pillars = add(s, N.pillars);
  const other = add(s, QUIET);
  assert.equal(hooks(s).mustTravel!(s), true);
  assert.match(hooks(s).travelProblem!(s, other) ?? "", /must travel there/);
  assert.equal(hooks(s).travelProblem!(s, pillars), null);
  // Revealed with an active location: return it or surge.
  const t = board("staging");
  const active = make(t, QUIET);
  t.activeLocation = active;
  revealed(t, N.pillars);
  run(t);
  assert.deepEqual(options(t), [active.id, "surge"]);
  pick(t, active.id);
  assert.equal(t.activeLocation, null);
  assert.ok(t.staging.some((u) => u.id === active.id));
  // No active location: surge.
  const u = board("staging");
  revealed(u, N.pillars);
  run(u);
  assert.match(
    u.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n"),
    /Haunted Pillars: no active location to return; it gains surge/,
  );
  // Shadow: +3 [defense] for the phase, through the players' attacks.
  const v = board("defense");
  const enemy = add(v, N.wolfSpirit, true);
  shadow(v, enemy, N.pillars, v.heroes[0]);
  assert.equal(stats(v, enemy).defense, card(N.wolfSpirit).defense! + 3);
  v.phase = "attack";
  assert.equal(stats(v, enemy).defense, card(N.wolfSpirit).defense! + 3);
  v.phase = "refresh";
  assert.equal(stats(v, enemy).defense, card(N.wolfSpirit).defense!);
});

test("Nightmare: Cursed Burden binds a Key holder: no questing, and no attacking or defending against the Key's kin", () => {
  const s = board("staging");
  const hero = s.heroes[0];
  key(s, hero, T.ravenKey);
  revealed(s, N.burden);
  run(s);
  assert.ok(hero.attachments.some((a) => a.code === N.burden));
  assert.equal(hooks(s).cannotCommit!(s, hero), true);
  const raven = add(s, T.raven, true);
  const boar = add(s, T.boar, true);
  assert.equal(hooks(s).cannotDefend!(s, raven, hero), true);
  assert.equal(hooks(s).cannotAttack!(s, hero, raven), true);
  assert.equal(hooks(s).cannotAttack!(s, hero, boar), false);
  assert.equal(hooks(s).cannotCommit!(s, s.heroes[1]), false);
  // No hero holds a Key: it is discarded.
  const t = board("staging");
  revealed(t, N.burden);
  run(t);
  assert.ok(t.encounterDiscard.includes(N.burden));
});

test("Nightmare: Trial of Ancestors weakens non-unique characters on the current quest, and its shadow punishes a non-unique defender", () => {
  const s = board("quest");
  revealed(s, N.ancestors);
  run(s);
  assert.ok(mainQuestUnit(s)!.attachments.some((a) => a.code === N.ancestors));
  const archer = make(s, ALLY);
  s.allies.push(archer);
  assert.equal(stats(s, archer).will, card(ALLY).willpower! - 1);
  assert.equal(stats(s, s.heroes[0]).will, card(s.heroes[0].code).willpower!);
  // The Trial of Strength's Key is Key of the Wolf: Wolf enemies are barred.
  const wolf = add(s, N.wolfSpirit, true);
  const boar = add(s, N.boarSpirit, true);
  assert.equal(hooks(s).cannotAttack!(s, archer, wolf), true);
  assert.equal(hooks(s).cannotAttack!(s, archer, boar), false);
  assert.equal(hooks(s).cannotAttack!(s, s.heroes[0], wolf), false);
  // Shadow: +10 [attack] against a non-unique defender only.
  const t = board("combat");
  const ally = make(t, ALLY);
  t.allies.push(ally);
  shadow(t, add(t, N.wolfSpirit, true), N.ancestors, ally);
  assert.equal(t.combat!.attackBonus, 10);
  const u = board("combat");
  shadow(u, add(u, N.wolfSpirit, true), N.ancestors, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 0);
});

test("Nightmare: The Three Trials' Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "planning");
  s.nightmare = { trialsGuard: [{ enemy: "x1", round: 1, phase: "combat" }] };
  assert.ok(valid(s));
  s.nightmare = { trialsGuard: [{ enemy: "x1", round: -1, phase: "combat" }] };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
