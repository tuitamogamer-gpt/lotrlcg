import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  addVictoryCard,
  charactersCommitted,
  check,
  progressLocation,
} from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { EMYN } from "../src/game/emyn-muil";
import {
  NIGHTMARE,
  NIGHTMARE_SOM as G,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
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
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const ORCS = "01089",
  CROWS = "01115";
const emyn = (seed = 5) => nightmareGame("hills-of-emyn-muil", seed);
/** A quiet solo board in `phase` with nothing engaged or staged. */
const board = (phase: GameState["phase"], seed = 5) => {
  const s = calm(opening(emyn(seed)), phase);
  s.engaged = [];
  s.staging = [];
  s.activeLocation = null;
  return s;
};
const hooks = (s: GameState) => batch4Scenario(s);

test("Nightmare: The Hills of Emyn Muil's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(G.emynCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Hills of Emyn Muil - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Hills of Emyn Muil scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x The East Wall of Rohan\n1x The North Stair\n2x The Shores of Nen Hithoel\n4x The Highlands\n2x Slick Footing\n2x Impassable Chasm\n2x Dol Guldur Orcs\n1x Chieftan Ufthak\n2x Dol Guldur Beastmaster\n2x The Necromancer's Reach\n2x Necromancer's Pass\n2x Enchanted Stream\n3x Evil Storm\n2x Pursued by Shadow\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nNo more than 1 progress may be placed on each location in the staging area each round.",
  );
  // The scan corrects the catalog's "Eymn Muil".
  assert.match(card(G.blast).text!, /Each Emyn Muil location gets \+2/);
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(G.tunneling), [50, 4, 6, 4, 10]);
  assert.deepEqual(stat(G.interceptor), [39, 2, 2, 3, 5]);
  assert.deepEqual(
    [G.brambles, G.rapids].map((x) => [
      card(x).threat,
      card(x).quest,
      card(x).victory,
    ]),
    [
      [3, 5, 3],
      [5, 5, 2],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Hills of Emyn Muil - Nightmare",
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

test("Nightmare: The Hills of Emyn Muil's Nightmare encounter deck matches its source recipe, and the staging area takes 1 progress per location each round", () => {
  const sets = scenario("hills-of-emyn-muil").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("hills-of-emyn-muil", standard);
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
  const recipe = recipes.find((r) => r.id === "N01.7")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== G.emynCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(
    NIGHTMARE["hills-of-emyn-muil"]!.removals,
  ))
    assert.ok(
      card(G.emynCard).text!.includes(
        `${n}x ${title === "Chieftain Ufthak" ? "Chieftan Ufthak" : title}`,
      ),
      title,
    );
  assert.equal(
    automatedScenarioId({
      name: "The Hills of Emyn Muil (Nightmare)",
      mode: "nightmare",
    }),
    "hills-of-emyn-muil",
  );
  const s = opening(emyn());
  assert.equal(nightmareCardOf(s), G.emynCard);
  assert.match(nightmareStatus(s)[0], /no more than 1 progress/);
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("hills-of-emyn-muil"))));
  // "No more than 1 progress may be placed on each location in the staging
  // area each round."
  const t = board("quest");
  const ridge = make(t, EMYN.outerRidge),
    highlands = make(t, EMYN.highlands);
  t.staging.push(ridge, highlands);
  progressLocation(t, ridge, 3);
  progressLocation(t, ridge, 1);
  progressLocation(t, highlands, 2);
  assert.deepEqual([ridge.progress, highlands.progress], [1, 1]);
  t.round++;
  progressLocation(t, ridge, 2);
  assert.equal(ridge.progress, 2);
  // (The active location is not limited.)
  const active = make(t, EMYN.northStair);
  t.activeLocation = active;
  progressLocation(t, active, 3);
  assert.equal(active.progress, 3);
  assert.ok(valid(t));
});

test("Nightmare: Tunneling Nameless Thing, Orc Interceptor, Brambles and Thorns and Sarn Gebir Rapids", () => {
  // Tunneling Nameless Thing engages the first player after the players
  // travel, and returns to the staging area without an active location.
  const s = board("travel");
  const thing = make(s, G.tunneling);
  s.staging.push(thing);
  const ridge = make(s, EMYN.outerRidge);
  s.activeLocation = ridge;
  hooks(s).travelEntered!(s, ridge, true);
  flush(s);
  assert.ok(s.engaged.some((u) => u.id === thing.id));
  check(s);
  assert.ok(
    s.engaged.some((u) => u.id === thing.id),
    "(an active location)",
  );
  s.activeLocation = null;
  check(s);
  assert.ok(s.staging.some((u) => u.id === thing.id));
  assert.ok(!s.engaged.some((u) => u.id === thing.id));
  // In a two-player game it moves to the first player.
  const t = calm(opening(nightmareForTwo("hills-of-emyn-muil")), "travel");
  for (const p of [0, 1]) forOwner(t, p, () => (t.engaged = []));
  t.staging = [];
  const worm = make(t, G.tunneling);
  forOwner(t, 1, () => t.engaged.push(worm));
  t.activeLocation = make(t, EMYN.northStair);
  hooks(t).travelEntered!(t, t.activeLocation, true);
  flush(t);
  assert.ok(seatView(t, 0).engaged.some((u) => u.id === worm.id));
  assert.ok(!seatView(t, 1).engaged.some((u) => u.id === worm.id));
  assert.ok(valid(t));
  // Orc Interceptor: a resource token each time a location is explored, +1
  // [threat] and +1 [attack] each.
  const u = board("quest");
  const orc = make(u, G.interceptor);
  u.staging.push(orc);
  const [atk, thr] = [stats(u, orc).attack, threatOf(u, orc)];
  const north = make(u, EMYN.northStair);
  u.activeLocation = north;
  progressLocation(u, north, 10);
  flush(u);
  assert.equal(u.activeLocation, null, "explored");
  assert.equal(orc.resources, 1);
  assert.deepEqual(
    [stats(u, orc).attack, threatOf(u, orc)],
    [atk + 1, thr + 1],
  );
  assert.ok(u.victoryCards!.includes(EMYN.northStair));
  // Brambles and Thorns: 1 damage to each character committing, once each
  // round whatever the copies.
  const v = board("quest");
  v.staging.push(make(v, G.brambles), make(v, G.brambles));
  const [a, b] = v.heroes;
  a.committed = true;
  charactersCommitted(v, [a]);
  flush(v);
  assert.equal(a.damage, 1);
  charactersCommitted(v, [a]);
  flush(v);
  assert.equal(a.damage, 1, "once each round");
  v.round++;
  b.committed = true;
  charactersCommitted(v, [a, b]);
  flush(v);
  assert.deepEqual([a.damage, b.damage], [2, 1]);
  v.staging = [];
  v.round++;
  charactersCommitted(v, [b]);
  flush(v);
  assert.equal(b.damage, 1, "(without Brambles and Thorns)");
  assert.ok(valid(v));
  // Sarn Gebir Rapids (active): Hazard "when revealed" effects cannot be
  // canceled.
  const w = board("staging");
  assert.equal(hooks(w).cannotCancel!(w, false, G.blast), false);
  w.activeLocation = make(w, G.rapids);
  assert.equal(hooks(w).cannotCancel!(w, false, G.blast), true);
  assert.equal(hooks(w).cannotCancel!(w, false, EMYN.rockslide), true);
  assert.equal(hooks(w).cannotCancel!(w, true, G.blast), false);
  assert.equal(hooks(w).cannotCancel!(w, false, G.hazardous), false);
});

test("Nightmare: A Hurrying Darkness, Blast of Savage Wind, Hazardous Terrain and Retraced Steps", () => {
  // A Hurrying Darkness: each player raises their threat by 5 or reveals an
  // encounter card.
  const s = board("staging");
  const threat = s.threat;
  const t = reveal(s, G.hurrying, () => "threat");
  assert.equal(t.threat, threat + 5);
  const u = board("staging");
  u.encounterDeck = [CROWS, CROWS, CROWS];
  const v = reveal(u, G.hurrying, (x) =>
    x.choice!.options.some((o) => o.id === "reveal") ? "reveal" : undefined,
  );
  assert.ok(v.encounterDeck.length < 3, "an encounter card was revealed");
  const two = calm(opening(nightmareForTwo("hills-of-emyn-muil")), "staging");
  const before = [0, 1].map((p) => seatView(two, p).threat);
  const both = reveal(two, G.hurrying, () => "threat");
  assert.deepEqual(
    [0, 1].map((p) => seatView(both, p).threat),
    before.map((x) => x + 5),
  );
  // Its shadow: +X [attack], X the active location's [threat].
  const w = board("defense");
  const orc = make(w, ORCS);
  w.engaged.push(orc);
  w.activeLocation = make(w, EMYN.outerRidge);
  shadow(w, orc, G.hurrying, w.heroes[0]);
  assert.equal(w.combat!.attackBonus, threatOf(w, w.activeLocation));
  // Blast of Savage Wind: progress removed from each Emyn Muil location and
  // +2 [threat] to each until the end of the round.
  const x = board("staging");
  const ridge = make(x, EMYN.outerRidge);
  ridge.progress = 1;
  const north = make(x, EMYN.northStair);
  north.progress = 2;
  x.staging.push(ridge);
  x.activeLocation = north;
  const base = threatOf(x, ridge);
  const y = reveal(x, G.blast);
  const [r, n] = [y.staging.find((l) => l.id === ridge.id)!, y.activeLocation!];
  assert.deepEqual([r.progress, n.progress], [0, 0]);
  assert.equal(threatOf(y, r), base + 2);
  const late = make(y, EMYN.highlands);
  y.staging.push(late);
  assert.equal(
    threatOf(y, late),
    card(EMYN.highlands).threat,
    "(entered later)",
  );
  y.round++;
  assert.equal(threatOf(y, r), base);
  // Its shadow removes the progress.
  const z = board("defense");
  const enemy = make(z, ORCS);
  z.engaged.push(enemy);
  z.activeLocation = make(z, EMYN.northStair);
  z.activeLocation.progress = 2;
  shadow(z, enemy, G.blast, z.heroes[0]);
  assert.equal(z.activeLocation.progress, 0);
  // Hazardous Terrain (surge): each Hazard card in the encounter discard pile
  // is shuffled into the encounter deck; its shadow deals another shadow card.
  const q = board("staging");
  q.encounterDeck = [CROWS, CROWS];
  q.encounterDiscard = [G.blast, EMYN.rockslide, CROWS, EMYN.chasm];
  hooks(q).encounter!(q, G.hazardous, false, true);
  flush(q);
  assert.deepEqual(q.encounterDiscard, [CROWS, G.hazardous]);
  assert.equal(q.encounterDeck.length, 5);
  const h = board("staging");
  h.encounterDeck = [EMYN.outerRidge, EMYN.outerRidge];
  const after = reveal(h, G.hazardous);
  assert.equal(after.encounterDeck.length, 1, "it surged");
  const m = board("defense");
  const foe = make(m, ORCS);
  m.engaged.push(foe);
  m.encounterDiscard = [EMYN.footing];
  shadow(m, foe, G.hazardous, m.heroes[0]);
  flush(m);
  assert.ok(!m.encounterDiscard.includes(EMYN.footing));
  assert.equal(foe.shadows.length, 2, "another shadow card");
  // Retraced Steps (surge): a random Emyn Muil location leaves the victory
  // display.
  const k = board("staging");
  k.encounterDeck = [EMYN.outerRidge, EMYN.outerRidge];
  addVictoryCard(k, EMYN.outerRidge);
  addVictoryCard(k, EMYN.highlands);
  const vp = k.victory;
  const l = reveal(k, G.retraced);
  assert.equal(l.victoryCards!.length, 1);
  const gone = [EMYN.outerRidge, EMYN.highlands].find(
    (c) => !l.victoryCards!.includes(c),
  )!;
  assert.equal(l.victory, vp - card(gone).victory!);
  assert.ok(l.encounterDiscard.includes(gone));
  assert.ok(valid(l));
});

test("Nightmare: seeded The Hills of Emyn Muil games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(emyn(seed));
    assert.notEqual(s.status, "playing", `hills-of-emyn-muil seed ${seed}`);
  }
  const t = autoplay(nightmareForTwo("hills-of-emyn-muil", 7), 4000);
  assert.notEqual(t.status, "playing", "two-player hills-of-emyn-muil");
});
