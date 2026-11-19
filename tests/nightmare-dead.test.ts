import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, destroy, progressLocation, revealed } from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { DEAD, deadMarshesAddResources } from "../src/game/dead-marshes";
import {
  NIGHTMARE,
  NIGHTMARE_SOM as G,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { reduceThreat } from "../src/game/threat-reduction";
import { forOwner, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  nightmareForTwo,
  nightmareGame,
  opening,
  reload,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const ORCS = "01089",
  SNARE = "01069";
const dead = (seed = 5) => nightmareGame("dead-marshes", seed);
/** A quiet solo board in `phase`: only The Mere of Dead Faces stays staged. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(dead(seed)), phase);
  s.engaged = [];
  s.staging = s.staging.filter((u) => u.code === G.mere);
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);
const mere = (s: GameState) => s.staging.find((u) => u.code === G.mere)!;
/** Commit the listed characters to the current escape test, then resolve it. */
function escape(s: GameState, commit: string[] = []) {
  for (
    let i = 0;
    i < 20 && s.choice && s.escapeTest?.phase === "committing";
    i++
  ) {
    const next = s.choice.options.find((o) => commit.includes(o.id));
    s = choose(s, next ? next.id : "done");
  }
  assert.equal(s.escapeTest?.phase, "actions");
  assert.ok(valid(s));
  return applyAction(reload(s), { type: "RESOLVE_ESCAPE" });
}

test("Nightmare: The Dead Marshes' setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(G.deadCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Dead Marshes - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Dead Marshes scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x A Wisp of Pale Sheen\n1x Through the Mist\n2x Giant Marsh Worm\n4x Fens and Mires\n3x Eastern Crows\n2x Pursued by Shadow\n2x Treacherous Fog\n1x Wolf Rider\n2x Hill Troll\n2x Goblin Sniper\n2x Wargs\n2x Despair\n2x The Brown Lands\n2x The East Bight\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nPlayers cannot reduce their threat.\nSetup: Search the encounter deck for The Mere of Dead Faces, and add it to the staging area. Then, shuffle the encounter deck.\nForced: After Gollum is placed in the discard pile, shuffle him into the encounter deck.",
  );
  // The scans correct the catalog ("make", "Lorien", "characater").
  assert.match(card(G.wight).text!, /Marsh-wight makes an immediate attack\.$/);
  assert.match(
    card(G.lostSoul).text!,
    /^Forced: After Lost Soul of Lórien is destroyed, .*\(Counts as a Condition attachment/,
  );
  assert.match(card(G.guard).shadow!, /each character you control/);
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(G.thingsPools), [50, 3, 4, 2, 8]);
  assert.deepEqual(stat(G.wight), [40, 4, 3, 2, 5]);
  assert.deepEqual(stat(G.lostSoul), [30, 1, 5, 2, 3]);
  assert.deepEqual(stat(G.guard), [18, 2, 2, 3, 7]);
  assert.ok(card(G.mere).is_unique);
  assert.deepEqual(card(G.mere).printed_stats, { threat: "X", quest: "-" });
  assert.deepEqual([card(G.quagmire).threat, card(G.quagmire).quest], [3, 5]);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Dead Marshes - Nightmare",
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

test("Nightmare: The Dead Marshes' Nightmare encounter deck matches its source recipe, The Mere of Dead Faces holds Gollum's tokens, and threat cannot be reduced", () => {
  const sets = scenario("dead-marshes").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("dead-marshes", standard);
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
  const recipe = recipes.find((r) => r.id === "N01.8")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== G.deadCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(NIGHTMARE["dead-marshes"]!.removals))
    assert.ok(card(G.deadCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "The Dead Marshes (Nightmare)",
      mode: "nightmare",
    }),
    "dead-marshes",
  );
  const s = opening(dead());
  assert.equal(nightmareCardOf(s), G.deadCard);
  assert.match(nightmareStatus(s)[0], /players cannot reduce their threat/);
  assert.ok(s.staging.some((u) => u.code === G.mere));
  assert.ok(!s.encounterDeck.includes(G.mere));
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("dead-marshes"))));
  // "Players cannot reduce their threat."
  const t = board("planning");
  t.threat = 30;
  reduceThreat(t, 5);
  assert.equal(t.threat, 30);
  // The Mere of Dead Faces: X [threat] (its tokens), the tokens meant for
  // Gollum while he is out of play; it cannot be traveled to or take
  // progress.
  const m = mere(t);
  assert.equal(threatOf(t, m), 0);
  deadMarshesAddResources(t, 2);
  assert.equal(m.resources, 2);
  assert.equal(threatOf(t, m), 2);
  assert.match(hooks(t).travelProblem!(t, m)!, /cannot leave the staging area/);
  progressLocation(t, m, 3);
  assert.equal(m.progress, 0);
  assert.ok(t.staging.some((u) => u.id === m.id));
  // Gollum entering play takes 2 tokens and the Mere's.
  revealed(t, DEAD.gollum);
  flush(t);
  const gollum = t.staging.find((u) => u.code === DEAD.gollum)!;
  assert.equal(gollum.resources, 4);
  assert.equal(m.resources, 0);
  deadMarshesAddResources(t, 1);
  assert.deepEqual([gollum.resources, m.resources], [5, 0]);
  // Gollum placed in the discard pile is shuffled into the encounter deck.
  const u = board("planning");
  u.encounterDiscard.push(DEAD.gollum, ORCS);
  const before = u.encounterDeck.length;
  check(u);
  assert.deepEqual(u.encounterDiscard, [ORCS]);
  assert.equal(u.encounterDeck.length, before + 1);
  assert.ok(valid(u));
});

test("Nightmare: Swarming Mosquitoes, Candles of Corpses, Stagnant Quagmire, Things in the Pools and Ill-fated Guard in escape tests", () => {
  // Swarming Mosquitoes: the first player's test counts [defense]; failed, a
  // token for Gollum (here the Mere) and 1 damage to each character.
  const s = board("staging");
  s.encounterDeck = [G.devilry, G.devilry, ORCS, ORCS];
  const t = reveal(s, G.mosquitoes, () => "done");
  assert.deepEqual(
    [t.escapeTest?.source, t.escapeTest?.stat, t.escapeTest?.count],
    [G.mosquitoes, "defense", 2],
  );
  const damage = t.heroes.map((h) => h.damage);
  const u = escape(t);
  assert.equal(u.escapeTest, undefined);
  assert.equal(mere(u).resources, 1);
  assert.deepEqual(
    u.heroes.map((h) => h.damage),
    damage.map((d) => d + 1),
  );
  assert.ok(u.encounterDiscard.includes(G.mosquitoes));
  // Passed (no escape value), nothing happens; [defense] is counted.
  const v = board("staging");
  v.encounterDeck = [ORCS, ORCS, ORCS];
  const w = reveal(v, G.mosquitoes, (q) =>
    q.choice!.options.some((o) => o.id === q.heroes[0].id)
      ? q.heroes[0].id
      : "done",
  );
  assert.equal(w.escapeTest!.committedIds.length, 1);
  const x = escape(w);
  assert.equal(mere(x).resources, 0);
  assert.ok(
    x.log.some((l) => /Escape test: \d+ defense against 0 Escape/.test(l.text)),
  );
  // Stagnant Quagmire in play adds 2 to each test; Things in the Pools deals
  // 1 damage to a committing character; Ill-fated Guard allows 1 character.
  const y = board("staging");
  y.staging.push(make(y, G.quagmire), make(y, G.thingsPools));
  y.engaged.push(make(y, G.guard));
  y.encounterDeck = [ORCS, ORCS, ORCS];
  const z = reveal(y, G.mosquitoes, (q) =>
    q.choice!.options.some((o) => o.id === q.heroes[0].id)
      ? q.heroes[0].id
      : "done",
  );
  assert.equal(z.heroes[0].damage, 1, "Things in the Pools");
  assert.equal(z.escapeTest!.committedIds.length, 1);
  assert.equal(z.escapeTest!.phase, "actions", "Ill-fated Guard: 1 only");
  const after = applyAction(reload(z), { type: "RESOLVE_ESCAPE" });
  assert.ok(
    after.log.some((l) => /against 2 Escape/.test(l.text)),
    "Stagnant Quagmire: +2",
  );
  // Candles of Corpses: each player's test; failed, discard a hero or raise
  // threat by 5.
  const a = board("staging");
  a.encounterDeck = [G.devilry, G.devilry];
  const b = reveal(a, G.candles, () => "done");
  const c = escape(b);
  assert.match(
    c.choice!.title,
    /Candles of Corpses · Discard a hero you control, or raise your threat by 5/,
  );
  const threat = c.threat;
  const d = choose(c, "threat");
  assert.equal(d.threat, threat + 5);
  const e = board("staging");
  e.encounterDeck = [G.devilry];
  const f = escape(reveal(e, G.candles, () => "done"));
  const victim = f.heroes[0];
  const g = choose(f, victim.id);
  assert.ok(!g.heroes.some((h) => h.id === victim.id));
  assert.ok(valid(g));
});

test("Nightmare: Marsh-wight, Lost Soul of Lórien, Devilry of the Dark Land and the shadows", () => {
  // Marsh-wight: engaging a player begins a 3-card test; failed, 2 tokens and
  // an immediate attack.
  const s = board("encounter");
  s.encounterDeck = [G.devilry, G.devilry, G.devilry, ORCS];
  const wight = make(s, G.wight);
  s.engaged.push(wight);
  hooks(s).engaged!(s, wight, false, true);
  flush(s);
  const t = escape(s);
  assert.equal(mere(t).resources, 2);
  assert.match(t.choice!.title, /Marsh-wight · Immediate attack/);
  // Lost Soul of Lórien: destroyed, it attaches to a hero, whose
  // [willpower] becomes 0.
  const u = board("attack");
  const soul = make(u, G.lostSoul);
  u.engaged.push(soul);
  destroy(u, soul);
  flush(u);
  assert.match(u.choice!.title, /Lost Soul of Lórien · Choose a hero/);
  const target = u.heroes[1];
  const v = choose(u, target.id);
  const held = v.heroes.find((h) => h.id === target.id)!;
  assert.ok(held.attachments.some((a) => a.code === G.lostSoul));
  assert.equal(stats(v, held).will, 0);
  assert.ok(!v.encounterDiscard.includes(G.lostSoul));
  // No hero with 1 or more [willpower] left: it is discarded.
  for (const h of v.heroes)
    h.attachments.push({ id: `l${h.id}`, code: G.lostSoul, exhausted: false });
  const other = make(v, G.lostSoul);
  v.engaged.push(other);
  destroy(v, other);
  flush(v);
  assert.equal(v.choice, null);
  assert.ok(v.encounterDiscard.includes(G.lostSoul));
  // Devilry of the Dark Land: the top X Undead enemies of the discard pile
  // return to the staging area; with none, it gains surge.
  const w = board("staging");
  w.encounterDiscard = [G.wight, ORCS, G.guard];
  const x = reveal(w, G.devilry);
  assert.ok(x.staging.some((e) => e.code === G.guard));
  assert.ok(!x.staging.some((e) => e.code === G.wight), "X is 1");
  assert.ok(x.encounterDiscard.includes(G.wight));
  const y = board("staging");
  y.encounterDeck = [ORCS, ORCS];
  const z = reveal(y, G.devilry);
  assert.ok(z.encounterDeck.length < 2, "it surged");
  // Stagnant Quagmire's shadow: a 1-card test; failed, the defending
  // character is discarded.
  const q = board("defense");
  q.encounterDeck = [G.devilry, ORCS];
  const orc = make(q, ORCS);
  q.engaged.push(orc);
  const defender = q.heroes[2];
  shadow(q, orc, G.quagmire, defender);
  flush(q);
  q.combat = null;
  const r = escape(q);
  assert.ok(!r.heroes.some((h) => h.id === defender.id));
  // Things in the Pools: +1 [attack], +2 for an Undead attacker.
  const m = board("defense");
  const plain = make(m, ORCS),
    ghost = make(m, G.guard);
  m.engaged.push(plain, ghost);
  shadow(m, plain, G.thingsPools, m.heroes[0]);
  assert.equal(m.combat!.attackBonus, 1);
  shadow(m, ghost, G.thingsPools, m.heroes[0]);
  assert.equal(m.combat!.attackBonus, 2);
  // Ill-fated Guard: attachments leave the defending player's characters
  // with 3 or more [willpower].
  const n = board("defense");
  const enemy = make(n, ORCS);
  n.engaged.push(enemy);
  const strong = n.heroes.find((h) => stats(n, h).will >= 3) ?? n.heroes[0];
  strong.tempWill = 3 - stats(n, strong).will + (strong.tempWill ?? 0);
  strong.attachments.push({ id: "x1", code: SNARE, exhausted: false });
  const weak = n.heroes.find((h) => h.id !== strong.id)!;
  weak.attachments.push({ id: "x2", code: SNARE, exhausted: false });
  if (stats(n, weak).will >= 3) weak.tempWill = -5;
  shadow(n, enemy, G.guard, n.heroes[0]);
  assert.equal(strong.attachments.length, 0);
  assert.equal(weak.attachments.length, 1);
  // Two players: Marsh-wight's test belongs to the engaged player.
  const two = calm(opening(nightmareForTwo("dead-marshes")), "encounter");
  for (const p of [0, 1]) forOwner(two, p, () => (two.engaged = []));
  const other2 = make(two, G.wight);
  forOwner(two, 1, () => two.engaged.push(other2));
  hooks(two).engaged!(two, other2, false, true);
  flush(two);
  assert.deepEqual(two.escapeTest?.participants, [1]);
  assert.ok(seatView(two, 1).heroes.length);
  assert.ok(valid(two));
});

test("Nightmare: seeded The Dead Marshes games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(dead(seed));
    assert.notEqual(s.status, "playing", `dead-marshes seed ${seed}`);
  }
  const t = autoplay(nightmareForTwo("dead-marshes", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player dead-marshes");
});
