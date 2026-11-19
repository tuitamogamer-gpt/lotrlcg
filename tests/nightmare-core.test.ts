import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  discardLocation,
  engage,
  exhaustCharacter,
  readyCharacter,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { make, stats } from "../src/game/core";
import { createGame } from "../src/game/engine";
import {
  NIGHTMARE,
  NIGHTMARE_CORE as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareSupported,
} from "../src/game/nightmare";
import { playerCardImmune } from "../src/game/card-immunity";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import { forOwner, seatView } from "../src/game/table";
import art from "./nightmare-art.json";
import {
  calm,
  d,
  damageOf,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const mirkwood = (seed = 5) => nightmareGame("mirkwood", seed);
const forTwo = () => nightmareForTwo("mirkwood");

test("Nightmare: Passage Through Mirkwood's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.mirkwoodCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Passage Through Mirkwood - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Passage Through Mirkwood scenario found in the LOTR LCG core set\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\nUngoliant's Spawn x1\nBlack Forest Bats x1\nForest Spider x3\nDol Guldur Orcs x3\nOld Forest Road x1\nForest Gate x2\nMountains of Mirkwood x3\nCaught in a Web x2\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: During setup, each player reveals 1 card from the encounter deck and adds it to the staging area.",
  );
  // The scans correct the catalog.
  assert.match(
    card(N.glade).text!,
    /^While Glade of the Spawn is the active location/,
  );
  assert.match(card(N.web).text!, /\(Counts as a Condition attachment/);
  assert.equal(
    card(N.spawn).shadow,
    "Shadow: Raise defending player's threat by 5. (Raise defending player's threat by 10 instead if undefended.)",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(N.flies), [27, 4, 1, 0, 3]);
  assert.deepEqual(stat(N.spiders), [18, 3, 2, 2, 4]);
  assert.deepEqual(stat(N.brood), [31, 2, 3, 2, 5]);
  assert.deepEqual(stat(N.spawn), [32, 3, 5, 3, 9]);
  assert.deepEqual(
    [
      card(N.camp).threat,
      card(N.camp).quest,
      card(N.glade).threat,
      card(N.glade).quest,
    ],
    [2, 2, 4, 4],
  );
  // 9 cards, 10 faces pinned.
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Passage Through Mirkwood - Nightmare",
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
  for (const x of set)
    assert.ok(
      art.some((a) => a.code === x.code && a.face === "front"),
      x.name,
    );
  assert.ok(art.some((a) => a.code === N.mirkwoodCard && a.face === "back"));
});

test("Nightmare: the Nightmare encounter deck is the standard one without the setup card's removals, plus its Nightmare Deck (as the source recipe)", () => {
  const sets = scenario("mirkwood").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("mirkwood", standard);
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
  const recipe = recipes.find((r) => r.id === "N01.1")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== N.mirkwoodCard
    )
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  // The removals are the printed ones.
  for (const [title, n] of Object.entries(NIGHTMARE.mirkwood!.removals))
    assert.ok(card(N.mirkwoodCard).text!.includes(`${title} x${n}`), title);
  // The audit counts the supported Nightmare recipe only.
  assert.equal(
    automatedScenarioId({
      name: "Passage Through Mirkwood (Nightmare)",
      mode: "nightmare",
    }),
    "mirkwood",
  );
  assert.equal(
    automatedScenarioId({
      name: "The Wizard's Quest (Nightmare)",
      mode: "nightmare",
    }),
    null,
  );
  assert.ok(nightmareSupported("mirkwood"));
  assert.equal(nightmareSupported("the-wizards-quest"), false);
});

test("Nightmare: Passage Through Mirkwood's setup reveals 1 card for each player into the staging area", () => {
  const s = opening(mirkwood());
  assert.equal(s.nightmareMode, true);
  assert.equal(s.easyMode, undefined);
  assert.equal(nightmareCardOf(s), N.mirkwoodCard);
  // Forest Spider and Old Forest Road, and the revealed card.
  const names = s.staging.map((u) => card(u.code).name);
  assert.ok(names.includes("Forest Spider"));
  assert.ok(names.includes("Old Forest Road"));
  assert.ok(s.log.some((l) => /Nightmare mode/.test(l.text)));
  const revealedCount = s.log.filter((l) => /^Revealed /.test(l.text)).length;
  assert.ok(revealedCount >= 1);
  assert.ok(valid(s));
  // Two players: two cards are revealed at setup.
  const t = opening(forTwo());
  assert.ok(t.log.filter((l) => /^Revealed /.test(l.text)).length >= 2);
  assert.ok(valid(t));
  // Nightmare mode replaces easy mode; it is refused for an unsupported
  // scenario or in campaign mode.
  const both = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "mirkwood",
    nightmare: true,
    easy: true,
  });
  assert.equal(both.easyMode, undefined);
  assert.equal(both.nightmareMode, true);
  assert.throws(
    () =>
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "the-wizards-quest",
        nightmare: true,
      }),
    /Nightmare Deck is not available/,
  );
  const bad = structuredClone(s);
  bad.easyMode = true;
  assert.equal(valid(bad), false);
  const wrong = structuredClone(s);
  (wrong as { nightmareMode: unknown }).nightmareMode = "yes";
  assert.equal(valid(wrong), false);
  // A standard game keeps its own deck.
  const normal = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "mirkwood",
  });
  assert.equal(normal.nightmareMode, undefined);
  assert.ok(!normal.encounterDeck.some((c) => c.startsWith("octgn:e84f94bf")));
});

test("Nightmare: Abandoned Camp, Backtrack! and Glade of the Spawn", () => {
  // Abandoned Camp: immune to player card effects; after it leaves play, each
  // exhausted character takes 2 damage.
  const s = calm(opening(mirkwood()));
  const camp = make(s, N.camp);
  assert.ok(playerCardImmune(camp));
  s.staging.push(camp);
  s.heroes[0].exhausted = true;
  discardLocation(s, camp, true);
  flush(s);
  assert.equal(s.heroes[0].damage, 2);
  assert.equal(s.heroes[1].damage, 0);
  // Its shadow: an undefended attack discards each player attachment.
  const t = calm(opening(mirkwood()), "defense");
  const spider = make(t, "01096");
  t.engaged.push(spider);
  t.heroes[0].attachments.push({
    id: `a${t.nextId++}`,
    code: "01026",
    exhausted: false,
    owner: 0,
  });
  shadow(t, spider, N.camp, t.heroes[1]);
  flush(t);
  assert.equal(t.heroes[0].attachments.length, 1);
  shadow(t, spider, N.camp);
  flush(t);
  assert.equal(t.heroes[0].attachments.length, 0);
  // Backtrack!: the topmost enemy or location of the discard pile returns to
  // the staging area, and it surges.
  const u = calm(opening(mirkwood()), "staging");
  u.encounterDiscard.push("01096", "01079");
  const staged = u.staging.length,
    deck = u.encounterDeck.length;
  const v = reveal(u, N.backtrack);
  assert.ok(v.staging.length >= staged + 1);
  assert.ok(v.staging.some((x) => x.code === "01096"));
  assert.ok(v.encounterDiscard.includes("01079"));
  assert.ok(v.encounterDeck.length < deck, "it surged");
  // Its shadow resolves the discard pile's topmost Shadow effect.
  const w = calm(opening(mirkwood()), "defense");
  const enemy = make(w, "01096");
  w.engaged.push(enemy);
  w.encounterDiscard.push(N.spawn);
  shadow(w, enemy, N.backtrack, w.heroes[0]);
  flush(w);
  assert.ok(enemy.shadows.includes(N.spawn));
  assert.ok(!w.encounterDiscard.includes(N.spawn));
  // Glade of the Spawn (active): after a Spider enemy enters play, each
  // player exhausts a character.
  const x = calm(opening(mirkwood()), "staging");
  x.activeLocation = make(x, N.glade);
  for (const h of x.heroes) h.exhausted = false;
  const y = reveal(x, "01096");
  assert.equal(y.heroes.filter((h) => h.exhausted).length, 1);
  assert.ok(valid(y));
});

test("Nightmare: Forest Flies, Spiders of Mirkwood, Ungoliant's Brood and Ungoliant's Spawn", () => {
  // Forest Flies: engaging it deals 1 damage to each exhausted character.
  const s = calm(opening(mirkwood()), "encounter");
  const flies = make(s, N.flies);
  s.staging.push(flies);
  s.heroes[1].exhausted = true;
  const before = damageOf(s);
  engage(s, flies);
  flush(s);
  assert.equal(damageOf(s), before + 1);
  assert.equal(s.heroes[1].damage, 1);
  // Its shadow: an Insect attacker is dealt 2 more shadow cards.
  const t = calm(opening(mirkwood()), "defense");
  const insect = make(t, N.flies);
  t.engaged.push(insect);
  shadow(t, insect, N.flies, t.heroes[0]);
  assert.ok(
    t.queue.some((e) => e.kind === "khazadExtraShadows" && e.count === 2),
  );
  const other = make(t, "01096");
  t.engaged.push(other);
  t.queue = [];
  shadow(t, other, N.flies, t.heroes[0]);
  assert.ok(!t.queue.some((e) => e.kind === "khazadExtraShadows"));
  // Spiders of Mirkwood: +1 [attack] for each exhausted character of the
  // player it is engaged with; its shadow exhausts a character (2 damage if
  // undefended).
  const u = calm(opening(mirkwood()), "combat");
  const spiders = make(u, N.spiders);
  u.engaged.push(spiders);
  const base = stats(u, spiders).attack;
  exhaustCharacter(u, u.heroes[0]);
  exhaustCharacter(u, u.heroes[1]);
  assert.equal(stats(u, spiders).attack, base + 2);
  for (const h of u.heroes) h.exhausted = false;
  shadow(u, spiders, N.spiders);
  flush(u);
  let v = pick(u, u.choice!.options[0].id);
  assert.equal(v.heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(v.heroes.find((h) => h.exhausted)!.damage, 2);
  // Ungoliant's Brood: after you engage it, your cards cannot ready this
  // round; its undefended shadow exhausts all your characters.
  const w = calm(opening(mirkwood()), "encounter");
  const brood = make(w, N.brood);
  w.staging.push(brood);
  engage(w, brood);
  flush(w);
  w.heroes[0].exhausted = true;
  readyCharacter(w, w.heroes[0]);
  assert.equal(w.heroes[0].exhausted, true);
  w.round++;
  readyCharacter(w, w.heroes[0]);
  assert.equal(w.heroes[0].exhausted, false);
  assert.ok(valid(w));
  const x = calm(opening(mirkwood()), "defense");
  const brood2 = make(x, N.brood);
  x.engaged.push(brood2);
  for (const h of x.heroes) h.exhausted = false;
  shadow(x, brood2, N.brood);
  assert.ok(x.heroes.every((h) => h.exhausted));
  // Ungoliant's Spawn: committed characters get -2 [willpower] this phase,
  // and one at 0 is discarded; its shadow raises the threat by 5 (10
  // undefended).
  const y = calm(opening(mirkwood()), "staging");
  for (const h of y.heroes) h.committed = true;
  const will = y.heroes.map((h) => stats(y, h).will);
  const z = reveal(y, N.spawn);
  const kept = z.heroes.filter((h) => h.committed);
  for (const h of kept)
    assert.equal(
      stats(z, h).will,
      will[y.heroes.findIndex((x) => x.code === h.code)] - 2,
    );
  assert.ok(z.log.some((l) => /Ungoliant's Spawn: \d committed/.test(l.text)));
  const a = calm(opening(mirkwood()), "defense");
  const spawn = make(a, N.spawn);
  a.engaged.push(spawn);
  const threat = a.threat;
  shadow(a, spawn, N.spawn, a.heroes[0]);
  flush(a);
  assert.equal(a.threat, threat + 5);
  shadow(a, spawn, N.spawn);
  flush(a);
  assert.equal(a.threat, threat + 15);
  v = a;
  assert.ok(valid(v));
});

test("Nightmare: The Spider's Web exhausts the highest-threat player's heroes and wounds its hero each time it readies", () => {
  const s = calm(opening(forTwo()), "staging");
  seatView(s, 1).threat; // (seat 1's view)
  const threats = [seatView(s, 0).threat, seatView(s, 1).threat];
  const top = threats[0] >= threats[1] ? 0 : 1;
  const t = reveal(s, N.web);
  assert.ok(seatView(t, top).heroes.every((h) => h.exhausted));
  const host = seatView(t, top).heroes.find((h) =>
    h.attachments.some((a) => a.code === N.web),
  )!;
  assert.ok(host);
  host.exhausted = true;
  const before = host.damage;
  readyCharacter(t, host);
  flush(t);
  assert.equal(host.damage, before + 1);
  assert.ok(valid(t));
});

test("Nightmare: a Nightmare card's threat raise is the defending player's own (Ungoliant's Spawn's shadow in a two-player game)", () => {
  const s = calm(opening(forTwo()), "defense");
  const spawn = make(s, N.spawn);
  forOwner(s, 1, () => s.engaged.push(spawn));
  const [first, second] = [seatView(s, 0).threat, seatView(s, 1).threat];
  shadow(s, spawn, N.spawn, undefined, 1);
  flush(s);
  assert.equal(seatView(s, 1).threat, second + 10);
  assert.equal(seatView(s, 0).threat, first);
  assert.ok(valid(s));
});
