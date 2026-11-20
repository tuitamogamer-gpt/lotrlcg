import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { CATCH_ORC as C } from "../src/game/catch-orc-support";
import { scenario } from "../src/game/scenarios";
import { automatedScenarioId } from "../src/game/support";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  NIGHTMARE,
  NIGHTMARE_VOI as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import type { GameState } from "../src/game/types";
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

/** To Catch an Orc: a location with no effect while in the staging area. */
const QUIET = C.methedras;
const FILLER = "01022"; // a player card for the out-of-play decks
const ID = "to-catch-an-orc";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at stage 2 with 2 time counters and filler out-of-play decks. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
  });
  const q = s.catchOrc!;
  Object.assign(q, { time: 2, searched: [] });
  for (const p of seatIndices(s)) {
    q.decks[p] = Array.from({ length: 6 }, () => make(s, FILLER));
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
  }
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const add = (s: GameState, code: string, engaged = false) => {
  const u = make(s, code);
  (engaged ? s.engaged : s.staging).push(u);
  return u;
};
function run(s: GameState, effects: GameState["queue"] = []) {
  s.queue.unshift(...effects);
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const time = (s: GameState) => s.catchOrc!.time;
const options = (s: GameState) => s.choice!.options.map((o) => o.id);

test("Nightmare: To Catch an Orc's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.catchCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "To Catch an Orc - Nightmare", true],
  );
  assert.match(
    c.text!,
    /1x Methedras Orc\n1x Orc Skirmisher\n1x Orc Hunter\n3x Prowling Wolf\n2x Methedras\n1x Orc Cave\n2x Orc Hunting Party\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Each player shuffles 1 copy of Vigilant Orc into his out-of-play deck. Set both copies of Mugash's Rage and any remaining copies of Vigilant Orc aside, out of play.\nForced: When the players advance to stage 3A, shuffle both copies of Mugash's Rage into the encounter deck.",
  );
  // DragnCards keeps the rules side as the front: the removal list is the .B face.
  assert.match(c.imagesrc!, /aae56769-69c1-4693-bcbe-dcd282c29568\.B\.jpg$/);
  assert.match(c.back_imagesrc!, /aae56769-69c1-4693-bcbe-dcd282c29568\.jpg$/);
  // The scans correct the catalog: Guard Warg's title and Vigilant Orc's Victory 4.
  assert.equal(card(N.guardWarg).name, "Guard Warg");
  assert.equal(card(N.vigilant).victory, 4);
  assert.match(
    card(N.lookout).text!,
    /it gains: "Forced: At the end of the refresh phase, remove 1 time counter from the current quest\."$/,
  );
  assert.match(card(N.patrolling).text!, /^Surge\. Doomed 1\.\n/);
  assert.match(card(N.cunning).text!, /Each player discards the top 3/);
  assert.equal(
    card(N.cunning).shadow,
    "Shadow: Attacking enemy gets +3 [attack] and +3 [defense] until the end of the round.",
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "To Catch an Orc - Nightmare",
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

test("Nightmare: To Catch an Orc's Nightmare deck matches its source recipe; each out-of-play deck hides a Vigilant Orc and Mugash's Rage waits for stage 3A", () => {
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
  const recipe = recipes.find((r) => r.id === "N04.2")!;
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count([...section("sharedEncounterDeck"), ...section("sharedSetAside")]),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.catchCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    const players = seatIndices(s).length;
    const q = s.catchOrc!;
    assert.equal(nightmareCardOf(s), N.catchCard);
    assert.deepEqual(
      seatIndices(s).map(
        (p) => q.decks[p].filter((u) => u.code === N.vigilant).length,
      ),
      Array(players).fill(1),
    );
    assert.equal(
      q.setAside.filter((u) => u.code === N.vigilant).length,
      4 - players,
    );
    assert.equal(s.nightmare?.catchRageAside, 2);
    assert.ok(
      !s.encounterDeck.includes(N.vigilant) &&
        !s.encounterDeck.includes(N.rage),
    );
    // The scenario's own setup still ran: stage 2 and its time counters.
    assert.equal(s.stage, 2);
    assert.ok(valid(s));
  }
  assert.equal(
    automatedScenarioId({
      name: "To Catch an Orc (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(opening(game()))[0],
    /3 more set aside\); both copies of Mugash's Rage are set aside/,
  );
  // Advancing to stage 3A shuffles both copies of Mugash's Rage into the deck, once.
  const s = board("quest");
  s.nightmare = { catchRageAside: 2 };
  add(s, C.mugash);
  run(s, [fx("catchAdvance", { player: 0 })]);
  assert.equal(s.stage, 3);
  assert.equal(s.encounterDeck.filter((c) => c === N.rage).length, 2);
  assert.equal(s.nightmare.catchRageAside, undefined);
  hooks(s).stageRevealed!(s, 3);
  assert.equal(s.encounterDeck.filter((c) => c === N.rage).length, 2);
  assert.match(nightmareStatus(s)[0], /Rage has joined the encounter deck/);
});

test("Nightmare: Vigilant Orc attacks the first player as it enters the staging area, and a kill costs a time counter", () => {
  const s = board("quest");
  const orc = make(s, N.vigilant);
  s.catchOrc!.decks[0] = [orc, ...s.catchOrc!.decks[0]];
  // Found by a search: it joins the staging area and attacks.
  run(s, [fx("catchSearch", { value: 3, player: 0 })]);
  assert.ok(s.staging.some((u) => u.id === orc.id));
  assert.equal(s.combat?.enemyId, orc.id);
  assert.equal(s.combat?.timeOnKill, 1);
  // Undefended against heroes on their last hit point: the kill costs a counter.
  for (const h of s.heroes) h.damage = (card(h.code).health ?? 1) - 1;
  const before = time(s);
  pick(s, "undefended");
  for (let i = 0; i < 10 && s.choice; i++) pick(s, s.choice.options[0].id);
  run(s);
  assert.equal(s.heroes.length, 2, "a hero fell");
  assert.equal(time(s), before - 1);
});

test("Nightmare: Methedras Lookout costs a time counter at the end of each refresh phase; its shadow exhausts a character or sends the attacker back", () => {
  const s = board("refresh");
  s.catchOrc!.time = 3;
  add(s, N.lookout);
  add(s, N.lookout);
  run(s, hooks(s).refreshEndForced!(s));
  assert.equal(time(s), 1, "one counter for each Lookout in the staging area");
  // The end of the refresh phase: the scenario's Time counter runs out first
  // and its expiry reveals 2 more Lookouts, which missed the timing point.
  const t = board("refresh");
  t.catchOrc!.time = 1;
  add(t, N.lookout);
  t.encounterDeck = Array(4).fill(N.lookout);
  run(t, [fx("phaseEnd")]);
  assert.equal(t.staging.filter((u) => u.code === N.lookout).length, 3);
  assert.equal(time(t), 1, "reset to 2, then 1 counter for the first Lookout");
  // Shadow: an engaged attacker may be returned to the staging area.
  const u = board("attack");
  const enemy = add(u, C.methedrasOrc, true);
  shadow(u, enemy, N.lookout, u.heroes[0]);
  run(u);
  assert.ok(options(u).includes("return"));
  pick(u, "return");
  assert.equal(u.combat!.returnToStaging, true);
  const v = board("attack");
  shadow(v, add(v, C.methedrasOrc, true), N.lookout, v.heroes[0]);
  run(v);
  pick(v, v.heroes[1].id);
  assert.equal(v.heroes[1].exhausted, true);
  // An attacker in the staging area cannot go back there: exhaust instead.
  const w = board("attack");
  shadow(w, add(w, N.vigilant), N.lookout);
  run(w);
  assert.ok(!options(w).includes("return"));
});

test("Nightmare: Guard Warg attacks as its player discards from the out-of-play deck, and its shadow wounds the defender", () => {
  const s = board("quest");
  const warg = add(s, N.guardWarg, true);
  // A search: take one card, discard the rest.
  run(s, [fx("catchSearch", { value: 3, player: 0 })]);
  assert.match(s.choice!.title, /Search · Take one player card/);
  pick(s, s.choice!.options[0].id);
  run(s);
  assert.equal(s.combat?.enemyId, warg.id, "an immediate attack");
  // Nothing discarded: no attack.
  const t = board("quest");
  add(t, N.guardWarg, true);
  hooks(t).outOfPlayDiscarded!(t, 0, 0);
  assert.equal(t.queue.length, 0);
  const u = board("attack");
  const hero = u.heroes[0];
  shadow(u, add(u, C.methedrasOrc, true), N.guardWarg, hero);
  assert.equal(hero.damage, 1);
});

test("Nightmare: Methedras Peak counts the first player's characters and sends each player searching as it is explored", () => {
  const s = board("planning", opening(two()));
  const peak = add(s, N.peak);
  const v = seatView(s, 0);
  assert.equal(threatOf(s, peak), v.heroes.length + v.allies.length);
  hooks(s).explored!(s, peak, true);
  assert.deepEqual(
    s.queue.map((e) => [e.kind, e.value, e.player]),
    [
      ["catchSearch", 3, 0],
      ["catchSearch", 3, 1],
    ],
  );
});

test("Nightmare: Orc Trail returns an out-of-play Orc enemy, set aside or from the victory display, then the first player searches 4", () => {
  const s = board("planning");
  const guard = make(s, C.guard);
  const aside = make(s, N.vigilant);
  s.catchOrc!.setAside = [guard, aside];
  s.victoryCards = [C.guard, N.vigilant];
  s.victory = 7;
  const trail = add(s, N.trail);
  hooks(s).explored!(s, trail, true);
  run(s);
  assert.match(s.choice!.title, /Orc Trail · Add an out-of-play Orc enemy/);
  assert.deepEqual(options(s), [
    guard.id,
    aside.id,
    `victory-${C.guard}`,
    `victory-${N.vigilant}`,
  ]);
  pick(s, `victory-${N.vigilant}`);
  run(s);
  assert.deepEqual(s.victoryCards, [C.guard]);
  assert.equal(s.victory, 3);
  const back = s.staging.find((u) => u.code === N.vigilant)!;
  assert.ok(back, "the Vigilant Orc is back in the staging area");
  // It attacks as it enters; then the first player searches 4.
  assert.equal(s.combat?.enemyId, back.id);
  assert.ok(s.queue.some((e) => e.kind === "catchSearch" && e.value === 4));
  // Nothing to choose: the search still follows.
  const t = board("planning");
  t.catchOrc!.setAside = [];
  hooks(t).explored!(t, add(t, N.trail), true);
  run(t);
  assert.equal(t.choice?.title.startsWith("Search"), true);
});

test("Nightmare: Mugash's Cunning digs each out-of-play deck for enemies and surges when none appear; its shadow lasts the round", () => {
  const s = board("staging", opening(two()));
  const q = s.catchOrc!;
  const hidden = make(s, C.guard);
  q.decks[1] = [make(s, FILLER), hidden, ...q.decks[1]];
  const sizes = seatIndices(s).map((p) => q.decks[p].length);
  revealed(s, N.cunning);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => q.decks[p].length),
    sizes.map((n) => n - 3),
  );
  assert.ok(s.staging.some((u) => u.id === hidden.id));
  assert.ok(!s.queue.some((e) => e.kind === "reveal"), "no surge");
  // No enemy among the discarded cards: surge.
  const t = board("staging");
  revealed(t, N.cunning);
  run(t);
  assert.match(
    t.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n"),
    /Mugash's Cunning: no enemy is added to the staging area; it gains surge/,
  );
  // Shadow: +3 [attack] and +3 [defense] until the end of the round.
  const u = board("attack");
  const enemy = add(u, C.methedrasOrc, true);
  const base = stats(u, enemy);
  shadow(u, enemy, N.cunning, u.heroes[0]);
  assert.equal(stats(u, enemy).attack, base.attack + 3);
  assert.equal(stats(u, enemy).defense, base.defense + 3);
  hooks(u).roundEnd!(u);
  assert.equal(stats(u, enemy).attack, base.attack);
});

test("Nightmare: Patrolling Orcs attach to the current quest; each engagement then costs a character's readiness or a time counter", () => {
  const s = board("staging");
  revealed(s, N.patrolling);
  run(s);
  assert.ok(mainQuestUnit(s)!.attachments.some((a) => a.code === N.patrolling));
  const enemy = add(s, C.methedrasOrc);
  calm(s, "encounter");
  hooks(s).engaged!(s, enemy);
  run(s);
  assert.match(s.choice!.title, /Patrolling Orcs · Exhaust a character/);
  assert.ok(options(s).includes("time"));
  pick(s, "time");
  run(s);
  assert.equal(time(s), 1);
  // No time counters left: a character must exhaust.
  s.catchOrc!.time = 0;
  hooks(s).engaged!(s, enemy);
  run(s);
  assert.ok(!options(s).includes("time"));
  pick(s, s.heroes[0].id);
  assert.equal(s.heroes[0].exhausted, true);
});

test("Nightmare: Mugash's Rage frees the captive to engage and attack its guard's player; its shadow shields the attacker for the round", () => {
  const s = board("staging");
  const hero = s.heroes[0];
  const id = `captive-${s.nextId++}`;
  hero.attachments.push({ id, code: C.mugash, exhausted: false });
  revealed(s, N.rage);
  run(s);
  assert.ok(!hero.attachments.some((a) => a.code === C.mugash));
  const mugash = s.engaged.find((u) => u.code === C.mugash)!;
  assert.equal(mugash?.id, id, "Mugash keeps his identity");
  assert.equal(s.combat?.enemyId, id, "and attacks at once");
  assert.equal(s.status, "playing");
  // Mugash is not captured: nothing happens.
  const t = board("staging");
  revealed(t, N.rage);
  run(t);
  assert.equal(t.combat, null);
  assert.ok(t.encounterDiscard.includes(N.rage));
  // Shadow: the attacking enemy cannot take damage this round.
  const u = board("attack");
  const enemy = add(u, C.methedrasOrc, true);
  shadow(u, enemy, N.rage, u.heroes[0]);
  damage(u, enemy.id, 3);
  assert.equal(enemy.damage, 0);
  u.round += 1;
  damage(u, enemy.id, 3);
  assert.equal(enemy.damage, 3);
});

test("Nightmare: To Catch an Orc's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    catchRageAside: 2,
    catchCunning: [{ enemy: "x1", round: 1 }],
    catchRage: [{ enemy: "x2", round: 1 }],
  };
  assert.ok(valid(s));
  s.nightmare = { catchRageAside: 3 };
  assert.equal(valid(s), false);
  s.nightmare = { catchCunning: [{ enemy: 4, round: 1 }] as never };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
