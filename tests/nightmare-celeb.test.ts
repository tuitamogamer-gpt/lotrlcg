import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, progressLocation, revealed } from "../src/game/board";
import { fx, make, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  celebrimborDamageLocation,
  celebrimborScourAll,
  celebrimborSearchCount,
} from "../src/game/celebrimbor";
import { CELEBRIMBOR as C } from "../src/game/celebrimbor-support";
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
import type { Effect, GameState } from "../src/game/types";
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

/** Celebrimbor's Secret: an Ost-in-Edhil location without a When Revealed effect. */
const QUIET = C.foundation;
const ID = "celebrimbors-secret";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board on stage 1: Bellach, The Orcs' Search and The Secret Chamber in the staging area, nothing else in play. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    stage: 1,
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
    staging: s.staging.filter((u) =>
      [C.bellach, C.search, C.chamber].includes(u.code),
    ),
  });
  const q = s.celebrimbor!;
  q.search = [];
  q.stagingLocations = s.staging.map((u) => u.id);
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [] });
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
  if (!engaged) s.celebrimbor!.stagingLocations.push(u.id);
  return u;
};
function run(s: GameState) {
  for (let i = 0; i < 60; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
/** Answer each step of an assignment of damage with the same location. */
function assign(s: GameState, id: string) {
  for (let i = 0; i < 12 && s.choice?.title.includes("Assign"); i++) {
    pick(s, id);
    run(s);
  }
  return s;
}
const logText = (s: GameState) =>
  s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
const bellachOf = (s: GameState) =>
  s.staging.find((u) => u.code === C.bellach)!;

test("Nightmare: Celebrimbor's Secret's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.celebCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Celebrimbor's Secret - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n1x Orc Skirmisher\n1x Orc Hunter\n3x Prowling Wolf\n1x Ruined Plaza\n1x City Remains\n1x Ancient Foundation\n3x Broken Lands\n1x Spies from Mordor\n2x Orc Hunting Party\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When any amount of progress would be placed on a location in the staging area, reduce that amount to 1.\nScour: Deal 1 damage to a location in play.",
  );
  assert.equal(
    card(N.bodyguard).text,
    "Bellach cannot take damage.\nScour: Heal all damage from Bellach's Bodyguard.",
  );
  assert.equal(
    card(N.bodyguard).shadow,
    "Shadow: Attacking enemy cannot take damage until the end of the phase.",
  );
  assert.match(
    card(N.snuffler).text!,
    /^When Revealed: Trigger Little Snuffler's Scour effect\.\nScour: .*X is the discarded card's cost\.$/,
  );
  assert.match(card(N.bones).text!, /that amount\.\nTravel: Place 2 damage/);
  assert.match(
    card(N.dusty).text!,
    /\nScour: Deal 2 damage to Dusty Labyrinth\.\nTravel:/,
  );
  assert.equal(
    card(N.hateful).shadow,
    "Shadow: Defending player discards a non-objective attachment he controls.",
  );
  assert.equal(
    card(N.agent).shadow,
    "Shadow: Deal 1 damage to the defending character.",
  );
  assert.match(
    card(N.closing).text!,
    /^Surge\.\nWhen Revealed: Place Closing In/,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Celebrimbor's Secret - Nightmare",
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

test("Nightmare: Celebrimbor's Secret's Nightmare deck matches its source recipe, and its Ost-in-Edhil locations join the setup choice", () => {
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
  const recipe = recipes.find((r) => r.id === "N04.8")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section && c.code !== N.celebCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count(["sharedEncounterDeck", "sharedStagingArea"].flatMap(pile)),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.celebCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.celebCard);
    assert.ok(valid(s));
  }
  // The setup's Ost-in-Edhil choice includes the Nightmare Deck's.
  const s = board("planning");
  s.encounterDeck = [C.plaza, N.bones, N.dusty, C.remains];
  s.celebrimbor!.setupLocations = [];
  s.queue.unshift(fx("celebSetupLocation", { player: 0 }));
  run(s);
  assert.deepEqual(options(s), [C.plaza, C.remains, N.bones, N.dusty]);
  pick(s, N.dusty);
  assert.ok(s.staging.some((u) => u.code === N.dusty));
  assert.deepEqual(s.celebrimbor!.setupLocations, [N.dusty]);
  assert.ok(valid(s), "a Nightmare setup location survives saves");
  assert.equal(
    automatedScenarioId({
      name: "Celebrimbor's Secret (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(nightmareStatus(s)[0], /reduced to 1/);
});

test("Nightmare: the setup card keeps staged locations at 1 progress at a time and adds its own Scour to each Scour round", () => {
  const s = board("quest");
  const staged = add(s, QUIET);
  progressLocation(s, staged, 3);
  assert.equal(staged.progress, 1);
  const active = make(s, C.remains);
  s.activeLocation = active;
  progressLocation(s, active, 3);
  assert.equal(active.progress, 3, "the active location takes all of it");
  // Its Scour joins the scenario's own; The Secret Chamber is offered last.
  const t = board("refresh");
  celebrimborScourAll(t);
  const order = t.queue[0] as Effect & { effects?: Effect[] };
  assert.equal(order.kind, "fangornOrder");
  assert.ok(order.effects!.some((e) => e.code === N.celebCard));
  const u = board("refresh");
  const plaza = add(u, QUIET);
  u.queue.unshift(...hooks(u).scourEffects!(u));
  run(u);
  const chamber = u.staging.find((x) => x.code === C.chamber)!;
  assert.deepEqual(options(u), [plaza.id, chamber.id]);
  pick(u, plaza.id);
  assert.equal(plaza.damage, 1);
});

test("Nightmare: Little Snuffler's Scour turns a random hand card's cost into damage among staged locations, also from City Remains", () => {
  const s = board("staging");
  const target = add(s, QUIET);
  s.hand = [make(s, "01017")]; // Silverlode Archer: cost 3
  revealed(s, N.snuffler);
  run(s);
  assign(s, target.id);
  assert.equal(target.damage, 3);
  assert.equal(s.hand.length, 0);
  assert.match(
    logText(s),
    /Little Snuffler: Silverlode Archer is discarded at random; 3 damage/,
  );
  // City Remains triggers it from the discard pile (not Bellach's Bodyguard's).
  const t = board("quest");
  const staged = add(t, QUIET);
  t.hand = [make(t, "01017")];
  t.encounterDiscard = [N.snuffler, N.bodyguard];
  assert.deepEqual(hooks(t).scourCodes!(t, true), [N.snuffler]);
  const remains = make(t, C.remains);
  t.activeLocation = remains;
  progressLocation(t, remains, 1);
  run(t);
  assign(t, staged.id);
  assert.equal(staged.damage, 3);
});

test("Nightmare: Bones of Hollin raises threat with its damage, and its Travel cost damages an Ost-in-Edhil location", () => {
  const s = board("travel", opening(two()));
  const bones = add(s, N.bones);
  celebrimborDamageLocation(s, bones, 2);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  // Travel: 2 damage on a chosen Ost-in-Edhil location in play.
  const t = board("travel");
  const other = add(t, N.bones);
  const plaza = add(t, QUIET);
  assert.equal(hooks(t).travelProblem!(t, other), null);
  t.queue.unshift(...hooks(t).travelEffects!(t, other)!);
  run(t);
  const chamber = t.staging.find((x) => x.code === C.chamber)!;
  assert.deepEqual(options(t), [other.id, plaza.id, chamber.id]);
  pick(t, plaza.id);
  assert.equal(plaza.damage, 2);
  assert.equal(t.threat, 20, "not Bones of Hollin's damage");
});

test("Nightmare: Bellach's Bodyguard shields Bellach, heals itself with its Scour, and its shadow shields the attacker for the phase", () => {
  const s = board("encounter");
  const guard = add(s, N.bodyguard);
  const boss = bellachOf(s);
  damage(s, boss.id, 3);
  assert.equal(boss.damage, 0);
  s.staging = s.staging.filter((u) => u.id !== guard.id);
  damage(s, boss.id, 2);
  assert.equal(boss.damage, 2, "without a Bodyguard in play");
  // Scour: heal all its damage.
  const t = board("refresh");
  const bodyguard = add(t, N.bodyguard);
  bodyguard.damage = 4;
  t.queue.unshift(
    fx("celebScour", { code: N.bodyguard, target: bodyguard.id }),
  );
  run(t);
  assert.equal(bodyguard.damage, 0);
  // Shadow: the attacking enemy cannot take damage until the end of the phase.
  const u = board("defense");
  const attacker = add(u, N.snuffler, true);
  shadow(u, attacker, N.bodyguard, u.heroes[0]);
  u.phase = "attack";
  damage(u, attacker.id, 2);
  assert.equal(attacker.damage, 0, "the combat phase's two steps");
  u.phase = "refresh";
  damage(u, attacker.id, 2);
  assert.equal(attacker.damage, 2);
});

test("Nightmare: Hateful Search damages each staged location and strengthens the damaged ones for the phase, or surges", () => {
  const s = board("staging");
  const a = add(s, QUIET);
  const b = add(s, C.remains);
  const base = threatOf(s, b);
  revealed(s, N.hateful);
  run(s);
  assert.equal(a.damage, 1);
  assert.equal(b.damage, 1);
  assert.equal(threatOf(s, b), base + 1);
  s.phase = "quest";
  assert.equal(threatOf(s, b), base + 1, "the quest phase's two steps");
  s.phase = "travel";
  assert.equal(threatOf(s, b), base);
  assert.ok(s.encounterDiscard.includes(N.hateful));
  // No staged location (only The Secret Chamber's): it is damaged too.
  const t = board("staging");
  t.staging = t.staging.filter((u) => u.code !== C.chamber);
  revealed(t, N.hateful);
  run(t);
  assert.match(
    logText(t),
    /Hateful Search: no location is in the staging area; it gains surge/,
  );
  assert.ok(
    t.staging.some((u) => u.code === QUIET),
    "its surge revealed a card",
  );
});

test("Nightmare: Sauron's Agent sends Bellach against each player and damages the active location for each character destroyed", () => {
  const s = board("staging", opening(two()));
  const boss = bellachOf(s);
  revealed(s, N.agent);
  run(s);
  assert.equal(s.combat?.enemyId, boss.id);
  assert.deepEqual(s.nightmare!.celebAgent, { enemy: boss.id, count: 0 });
  // Two characters destroyed by its attacks: 2 damage on the active location.
  const t = board("staging");
  const active = make(t, C.remains);
  t.activeLocation = active;
  const agentBoss = bellachOf(t);
  t.nightmare = { celebAgent: { enemy: agentBoss.id, count: 0 } };
  for (let i = 0; i < 2; i++)
    hooks(t).characterDestroyed!(t, t.heroes[i], {
      combatDamage: true,
      enemyId: agentBoss.id,
    } as never);
  t.queue.unshift(fx("ncsAgentDone", { player: 0 }));
  run(t);
  assert.equal(active.damage, 2);
  assert.equal(t.nightmare!.celebAgent, undefined);
  // Shadow: 1 damage to the defending character.
  const u = board("defense");
  const hero = u.heroes[1];
  shadow(u, add(u, N.snuffler, true), N.agent, hero);
  run(u);
  assert.equal(hero.damage, 1);
});

test("Nightmare: Dusty Labyrinth grows with its damage, takes 2 with its Scour and costs a hand card to travel; Closing In joins The Orcs' Search", () => {
  const s = board("travel");
  const dusty = add(s, N.dusty);
  const base = threatOf(s, dusty);
  dusty.damage = 2;
  assert.equal(threatOf(s, dusty), base + 2);
  s.queue.unshift(fx("celebScour", { code: N.dusty, target: dusty.id }));
  run(s);
  assert.equal(dusty.damage, 4);
  // Travel: the first player places a chosen hand card under the Search.
  assert.match(
    hooks(s).travelProblem!(s, dusty) ?? "",
    /requires the first player/,
  );
  const card1 = make(s, "01016");
  s.hand = [card1, make(s, "01016")];
  assert.equal(hooks(s).travelProblem!(s, dusty), null);
  s.queue.unshift(...hooks(s).travelEffects!(s, dusty)!);
  run(s);
  pick(s, card1.id);
  assert.equal(s.hand.length, 1);
  assert.equal(celebrimborSearchCount(s), 1);
  // Closing In: under the Search with its surge, and its shadow.
  const t = board("staging");
  revealed(t, N.closing);
  run(t);
  assert.equal(celebrimborSearchCount(t), 1);
  assert.ok(!t.encounterDiscard.includes(N.closing));
  assert.ok(
    t.staging.some((u) => u.code === QUIET),
    "its printed surge",
  );
  const u = board("defense");
  u.celebrimbor!.search = [make(u, N.closing), make(u, QUIET)];
  shadow(u, add(u, N.snuffler, true), N.closing, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 2);
});

test("Nightmare: Celebrimbor's Secret's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "planning");
  s.nightmare = {
    celebNoDamage: [{ id: "x1", round: 1, phase: "combat" }],
    celebHateful: [{ round: 1, phase: "quest" }],
    celebAgent: { enemy: "x2", count: 1 },
  };
  assert.ok(valid(s));
  s.nightmare = { celebAgent: { enemy: "x2", count: -1 } };
  assert.equal(valid(s), false);
  s.nightmare = { celebHateful: [{ round: 1 } as never] };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
