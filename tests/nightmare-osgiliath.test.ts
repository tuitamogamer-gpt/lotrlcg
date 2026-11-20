import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, engage } from "../src/game/board";
import { fx, make, stagingThreat, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  ASSAULT_OSGILIATH as A,
  assaultOsgiliathCapture,
} from "../src/game/assault-osgiliath";
import { heirsArcheryTotal } from "../src/game/heirs-numenor";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  NIGHTMARE,
  NIGHTMARE_AS as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Orc War Camp: a location with no "When Revealed" effect and no shadow. */
const QUIET = encounterCards.find((c) => c.name === "Orc War Camp")!.code;
const game = (seed = 5) => nightmareGame("assault-on-osgiliath", seed);
const two = (seed = 5) => nightmareForTwo("assault-on-osgiliath", seed);
/** A quiet board: no location in play or controlled, a quiet encounter deck. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    progress: 0,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(10).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    nightmare: {},
    victoryCards: [],
    questAttachments: {},
    assaultOsgiliath: { controlled: [], archeryBonus: 0 },
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = [];
      s.threat = 20;
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
const run = (s: GameState, effects: GameState["queue"]) => {
  s.queue.unshift(...effects);
  flush(s);
  return s;
};
/** A location the first player now controls. */
const capture = (s: GameState, code: string) => {
  const u = add(s, code);
  assaultOsgiliathCapture(s, u);
  flush(s);
  return u;
};
const held = (s: GameState) => s.assaultOsgiliath!.controlled;

test("Nightmare: Assault on Osgiliath's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.osgiliathCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Assault on Osgiliath - Nightmare", true],
  );
  assert.match(
    c.text!,
    /4x Uruk Soldier\n3x Southron Phalanx\n2x West Quarter\n2x East Quarter\n1x Ruined Tower\n1x Ruined Square\n2x The Master's Malice\n2x Street Fighting\n3x Southron Mercenaries\n1x Uruk Lieutenant\n1x Orc Arbalesters\n1x The Power of Mordor\n/,
  );
  assert.match(
    c.back_text!,
    /^You are playing Nightmare mode\.\nSetup: Add Palace Remains to the staging area\.\nIf there are more Osgiliath locations.*placed on the chosen location\."$/s,
  );
  assert.equal(card(N.haradrim).name, "Haradrim Warrior");
  assert.match(
    card(N.haradrim).text!,
    /After Haradrim Warrior engages a player/,
  );
  assert.equal(card(N.haradrim).printed_stats?.threat, "X");
  assert.equal(card(N.palace).is_unique, true);
  assert.match(
    card(N.palace).text!,
    /it gains: "Forced: After a player takes control/,
  );
  assert.match(
    card(N.eastern).text!,
    /return Eastern Quarter to the staging area/,
  );
  assert.match(
    card(N.overrun).shadow!,
    /2 characters instead if you control 4/,
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Assault on Osgiliath - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    11,
  );
});

test("Nightmare: Assault on Osgiliath's Nightmare deck matches its source recipe, with Palace Remains in the staging area at setup", () => {
  const sets = scenario("assault-on-osgiliath").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("assault-on-osgiliath", standard);
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
  const recipe = recipes.find((r) => r.id === "N03.7")!;
  const want: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.code !== N.osgiliathCard && c.section !== "sharedQuestDeck")
      want[c.code] = (want[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), want);
  for (const [title, n] of Object.entries(
    NIGHTMARE["assault-on-osgiliath"]!.removals,
  ))
    assert.ok(card(N.osgiliathCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [game(), two()]) {
    assert.equal(nightmareCardOf(s), N.osgiliathCard);
    assert.ok(s.staging.some((u) => u.code === N.palace));
    assert.ok(!s.encounterDeck.includes(N.palace));
    assert.match(nightmareStatus(s)[0], /Palace Remains began/);
  }
  assert.ok(valid(opening(game())));
});

test("Nightmare: with more Osgiliath locations staged than players, the quest's remaining progress goes to a chosen location", () => {
  let s = board("quest");
  const quarter = add(s, N.western);
  add(s, N.palace);
  // Two Osgiliath locations for one player: the Response is offered.
  run(s, hooks(s).questBegin!(s) as GameState["queue"]);
  assert.ok(
    !s.choice!.options.some((o) => o.code === N.palace),
    "non-unique only",
  );
  s = pick(s, quarter.id);
  assert.equal(s.nightmare?.chosen?.locationId, quarter.id);
  s.queue.unshift(fx("successfulQuestProgress", { value: 2 }));
  flush(s);
  assert.deepEqual([quarter.progress, s.progress], [2, 0]);
  // Enough progress captures it.
  s.queue.unshift(fx("successfulQuestProgress", { value: 5 }));
  flush(s);
  assert.ok(held(s).some((u) => u.id === quarter.id));
  // One Osgiliath location for one player: no Response.
  const t = board("quest");
  add(t, A.tower);
  assert.deepEqual(hooks(t).questBegin!(t), []);
});

test("Nightmare: Palace Remains takes a token as a location is taken, gains [threat] and opens to travel at 5", () => {
  const s = board("planning");
  const palace = add(s, N.palace);
  assert.equal(hooks(s).immune!(s, palace), true);
  assert.match(hooks(s).travelProblem!(s, palace)!, /at least 5 resource/);
  capture(s, A.square);
  assert.deepEqual([palace.resources, threatOf(s, palace)], [1, 1]);
  palace.resources = 5;
  assert.equal(hooks(s).travelProblem!(s, palace), null);
  assert.equal(threatOf(s, palace), 5);
});

test("Nightmare: taking control of Eastern Quarter, Western Quarter and Crumbled Battlements costs events, an attachment and an engaged enemy; a cancelled treachery returns the Quarters", () => {
  // Eastern Quarter: each event card in hand is discarded.
  const s = board("planning");
  const events = s.hand.filter((u) => card(u.code).type_code === "event");
  const others = s.hand.length - events.length;
  capture(s, N.eastern);
  assert.equal(s.hand.length, others);
  assert.equal(
    s.hand.filter((u) => card(u.code).type_code === "event").length,
    0,
  );
  // Western Quarter: the highest cost attachment.
  let t = board("planning");
  const blade = t.heroes[0];
  blade.attachments.push(
    { id: "a1", code: "01039", exhausted: false },
    { id: "a2", code: "01046", exhausted: false },
  );
  const costs = blade.attachments.map((a) => Number(card(a.code).cost ?? 0));
  const add2 = add(t, N.western);
  assaultOsgiliathCapture(t, add2);
  flush(t);
  for (let i = 0; i < 3 && t.choice; i++) t = pick(t, t.choice.options[0].id);
  assert.equal(blade.attachments.length, 1);
  assert.equal(
    Number(card(blade.attachments[0].code).cost ?? 0),
    Math.min(...costs),
  );
  // Crumbled Battlements: the discard pile shuffled in, an enemy engaged.
  const u = board("planning");
  u.encounterDeck = [QUIET, QUIET];
  u.encounterDiscard = [QUIET, N.invading];
  capture(u, N.battlements);
  assert.ok(u.engaged.some((x) => x.code === N.invading));
  assert.ok(!u.encounterDiscard.includes(N.invading));
  // A cancelled treachery returns each controlled Quarter.
  const v = board("staging");
  const east = capture(v, N.eastern);
  const west = capture(v, N.western);
  hooks(v).whenRevealedCancelled!(v, A.counter);
  flush(v);
  assert.deepEqual(
    [east, west].map((q) => v.staging.some((x) => x.id === q.id)),
    [true, true],
  );
  assert.equal(held(v).length, 0);
});

test("Nightmare: Haradrim Warrior counts the first player's locations for its [threat], archery and engagement, and Invading Orc takes a location back", () => {
  const s = board("planning");
  const warrior = add(s, N.haradrim);
  capture(s, A.square);
  capture(s, A.tower);
  assert.equal(threatOf(s, warrior), 2);
  assert.equal(heirsArcheryTotal(s), 2);
  engage(s, warrior);
  assert.deepEqual(
    [stats(s, warrior).attack, stats(s, warrior).defense],
    [5, 5],
  );
  s.round += 1;
  assert.deepEqual(
    [stats(s, warrior).attack, stats(s, warrior).defense],
    [3, 3],
  );
  // Its shadow: 1 damage to the defending character.
  const t = board("defense");
  const foe = add(t, N.invading, true);
  shadow(t, foe, N.haradrim, t.heroes[0]);
  flush(t);
  assert.equal(t.heroes[0].damage, 1);
  // Invading Orc: a destroyed character returns a location its controller holds.
  const u = board("defense");
  const orc = add(u, N.invading, true);
  const harbor = capture(u, A.harbor);
  const ally = make(u, "01016");
  u.allies.push(ally);
  u.hand = [];
  u.combat = {
    enemyId: orc.id,
    defenderId: ally.id,
    defenderIds: [ally.id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  damage(u, ally.id, 5, { combatDamage: true, enemyId: orc.id });
  flush(u);
  assert.ok(u.staging.some((x) => x.id === harbor.id));
  // Its shadow, on another enemy: a location returns once.
  const v = board("defense");
  const other = add(v, N.haradrim, true);
  capture(v, A.harbor);
  capture(v, A.bridge);
  const a2 = make(v, "01016");
  v.allies.push(a2);
  v.hand = [];
  shadow(v, other, N.invading, a2);
  damage(v, a2.id, 5, { combatDamage: true, enemyId: other.id });
  flush(v);
  for (let i = 0; i < 3 && v.choice; i++) pick(v, v.choice.options[0].id);
  assert.equal(held(v).length, 1);
});

test("Nightmare: Relentless Attack, Overrun Defenses and Pressed on All Sides follow the controlled locations", () => {
  // Relentless Attack: on the quest, -X engagement and a reveal.
  let s = board("staging");
  capture(s, A.square);
  capture(s, A.tower);
  const foe = add(s, N.invading);
  s = reveal(s, N.relentless);
  assert.equal(
    mainQuestUnit(s)!.attachments.filter((a) => a.code === N.relentless).length,
    1,
  );
  assert.equal(hooks(s).engagementBonus!(s, foe), -2);
  s.staging = s.staging.filter((u) => u.id !== foe.id);
  hooks(s).encounterBegin!(s);
  flush(s);
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "an encounter card",
  );
  // Overrun Defenses: X in the staging area this phase; doomed 2 below 4.
  let t = board("staging");
  capture(t, A.square);
  const threat = t.threat;
  const staged = stagingThreat(t);
  t = reveal(t, N.overrun);
  assert.equal(stagingThreat(t), staged + 1);
  assert.equal(t.threat, threat + 2, "doomed 2");
  t.phase = "travel";
  assert.equal(stagingThreat(t), staged);
  // Its shadow: 1 character exhausted (2 with 4 locations).
  let u = board("defense");
  for (const code of [A.square, A.tower, A.square, A.tower]) capture(u, code);
  const orc = add(u, N.invading, true);
  shadow(u, orc, N.overrun, u.heroes[0]);
  flush(u);
  for (let i = 0; i < 3 && u.choice; i++) u = pick(u, u.choice.options[0].id);
  assert.equal(u.heroes.filter((h) => h.exhausted).length, 2);
  // Pressed on All Sides: the controlled threat beats the staging area's.
  let v = board("quest");
  capture(v, A.tower);
  capture(v, A.square);
  const before2 = v.threat;
  v = reveal(v, N.pressed);
  assert.equal(v.threat, before2 + 2);
  assert.ok(
    v.queue.some((e) => e.kind === "finishQuestPhase") || v.phase !== "quest",
  );
  // Not greater: nothing.
  let w = board("quest");
  add(w, N.palace).resources = 9;
  const before3 = w.threat;
  w = reveal(w, N.pressed);
  assert.equal(w.threat, before3);
  // Its shadow: +1 [attack] for each location the defending player controls.
  const x = board("defense");
  capture(x, A.square);
  capture(x, A.tower);
  const raider = add(x, N.invading, true);
  shadow(x, raider, N.pressed, x.heroes[0]);
  assert.equal(x.combat!.attackBonus, 2);
});

test("Nightmare: Assault on Osgiliath's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    chosen: { round: 1, locationId: "c1" },
    warriors: [{ enemyId: "c2", round: 1, x: 2 }],
    overrun: [{ round: 1, phase: "quest", x: 3 }],
    invading: [{ enemyId: "c2", player: 0, done: true }],
  };
  assert.ok(valid(s));
  s.nightmare = { overrun: [{ round: 1, phase: "quest", x: -1 }] };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `assault-on-osgiliath seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player assault-on-osgiliath");
});
