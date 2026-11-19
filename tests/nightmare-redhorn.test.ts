import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards, STARTERS } from "../src/game/cards";
import {
  addVictoryCard,
  collectResources,
  engage,
  progress,
  progressLocation,
} from "../src/game/board";
import { fx, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { REDHORN, advanceRedhorn } from "../src/game/redhorn-gate";
import {
  NIGHTMARE,
  NIGHTMARE_DD as D,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { attackersFor, forOwner, seatView } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  choose,
  d,
  nightmareForTwo,
  nightmareGame,
  opening,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const code = (title: string) =>
  encounterCards.find(
    (c) =>
      ["The Redhorn Gate", "Misty Mountains"].includes(c.encounter_set ?? "") &&
      c.name === title,
  )!.code;
/** Turbulent Waters: a location with no "When Revealed" effect and no shadow. */
const WATERS = code("Turbulent Waters"),
  URUKS = code("Black Uruks"),
  CELEBDIL = REDHORN.celebdil,
  FANUIDHOL = REDHORN.fanuidhol,
  SNOW_WARG = REDHORN.warg;
const redhorn = (seed = 5) => nightmareGame("redhorn-gate", seed);
/** A three-player Nightmare mode game. */
function forThree(seed = 5) {
  const seats = [STARTERS[0], STARTERS[1], STARTERS[2]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  return createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "redhorn-gate",
    nightmare: true,
    seats,
  });
}
/** A quiet board in `phase`: Arwen kept, nothing else staged, engaged, attached or discarded. */
function board(phase: GameState["phase"], s: GameState = opening(redhorn())) {
  calm(s, phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  for (const p of s.table ? s.table.seats.map((_, i) => i) : [0])
    forOwner(s, p, () => {
      s.engaged = [];
      s.allies = s.allies.filter((u) => u.code === REDHORN.arwen);
      for (const u of [...s.heroes, ...s.allies]) {
        u.damage = 0;
        u.committed = false;
        u.exhausted = false;
        u.resources = 0;
        u.attachments = [];
      }
    });
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = Array(10).fill(WATERS);
  s.stage = 1;
  s.progress = 0;
  s.victory = 0;
  s.victoryCards = [];
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const attach = (s: GameState, u: Unit, c: string) => {
  const a = { id: `a${s.nextId++}`, code: c, exhausted: false, owner: 0 };
  u.attachments.push(a);
  return a;
};
/** Through the reveal windows ("Revealed: …" may offer a cancellation). */
function resolveWindows(s: GameState) {
  for (let i = 0; i < 10 && s.choice?.title.startsWith("Revealed:"); i++)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "resolve")?.id ??
        s.choice.options[0].id,
    );
  return s;
}

test("Nightmare: The Redhorn Gate's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(D.redhornCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Redhorn Gate - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Redhorn Gate scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x Black Uruks\n3x Mountain Warg\n1x Knees of the Mountain\n2x Turbulent Waters\n2x Warg Lair\n1x The Dimrill Stair\n2x Fell Voices\n2x Fallen Stones\n3x Mountain Goblin\nThen, shuffle .* which is now ready to begin\.$/s,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Remove all copies of Blinding Blizzard from the encounter deck and set them aside, out of play. During this game, player cards in the victory display do not count their victory points.\nForced: When stage 2b is revealed, shuffle each set aside copy of Blinding Blizzard into the encounter deck.",
  );
  // The scans correct the catalog: Wolfpelt Goblin's "Surge." and its name
  // without a stray space, Silvertine Marauder's text without stray spaces,
  // and 2 copies of Snow-Giant (the encounter set is numbered 1 to 19).
  assert.equal(
    card(D.wolfpelt).text,
    "Surge.\nForced: After engaging Wolfpelt Goblin, the engaged player must deal X damage to 1 character he controls, where X is the active location's remaining quest points. Then, remove 2 progress from the active location, if able.",
  );
  assert.equal(
    card(D.marauder).text,
    "While attacking, Silvertine Marauder gets +2 [attack] if the defending character has less than 2 [willpower].",
  );
  assert.equal(
    card(D.silverlode).text,
    "While Frozen Silverlode is in the staging area, characters cannot gain [willpower] from player card effects.",
  );
  for (const x of [D.cavern, D.silverlode])
    assert.equal(
      card(x).shadow,
      "Shadow: Defending character gets -1 [willpower]. Deal the attacking enemy 1 additional shadow card.",
    );
  assert.equal(
    card(D.marauder).shadow,
    "Shadow: Attacking enemy gets +2 [attack] if the defending character has less than 2 [willpower].",
  );
  for (const x of [D.wolfpelt, D.giant, D.blizzard, D.cruel])
    assert.equal(card(x).shadow, undefined, card(x).name);
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health];
  };
  assert.deepEqual(stat(D.wolfpelt), [20, 2, 3, 2, 4]);
  assert.deepEqual(stat(D.marauder), [28, 2, 3, 3, 6]);
  assert.deepEqual(stat(D.giant), [42, 4, 6, 4, 10]);
  assert.equal(card(D.giant).victory, 1);
  // Icy Cavern's [threat] is X.
  assert.deepEqual(
    [D.cavern, D.silverlode].map((x) => [card(x).threat, card(x).quest]),
    [
      [undefined, 6],
      [3, 3],
    ],
  );
  assert.deepEqual(
    [D.wolfpelt, D.giant, D.cavern, D.silverlode, D.blizzard].map(
      (x) => card(x).traits,
    ),
    [
      "Goblin. Orc. Snow.",
      "Giant. Snow.",
      "Mountain. Snow.",
      "Mountain. River.",
      "Snow.",
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Redhorn Gate - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.deepEqual(
    set.map((x) => [x.name, x.quantity]),
    [
      ["The Redhorn Gate", 1],
      ["Wolfpelt Goblin", 3],
      ["Silvertine Marauder", 4],
      ["Snow-Giant", 2],
      ["Icy Cavern", 3],
      ["Frozen Silverlode", 3],
      ["Blinding Blizzard", 2],
      ["Caradhras the Cruel", 2],
    ],
  );
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((a) => set.some((x) => x.code === a.code)).length, 9);
});

test("Nightmare: The Redhorn Gate's Nightmare encounter deck matches its source recipe, and stage 2B shuffles Blinding Blizzard in", () => {
  const sets = scenario("redhorn-gate").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("redhorn-gate", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.4")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.section !== "sharedQuestDeck" && c.code !== D.redhornCard)
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  // The recipe lists 3 Snow-Giants; the printed set has 2.
  assert.equal(expected[D.giant], 3);
  expected[D.giant] = 2;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(NIGHTMARE["redhorn-gate"]!.removals))
    assert.ok(card(D.redhornCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "The Redhorn Gate (Nightmare)",
      mode: "nightmare",
    }),
    "redhorn-gate",
  );
  const s = opening(redhorn());
  assert.equal(nightmareCardOf(s), D.redhornCard);
  assert.match(nightmareStatus(s)[0], /set aside until stage 2B/);
  assert.equal(s.nightmare?.blizzards, 2);
  assert.ok(!s.encounterDeck.includes(D.blizzard));
  assert.ok(!s.encounterDiscard.includes(D.blizzard));
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("redhorn-gate"))));
  // Stage 2B: the set-aside copies are shuffled into the encounter deck
  // (with Snowdrifts' Snowstorms).
  const t = board("quest");
  t.nightmare = { ...t.nightmare, blizzards: 2 };
  const size = t.encounterDeck.length;
  t.progress = 9;
  advanceRedhorn(t);
  flush(t);
  assert.equal(t.stage, 2);
  assert.equal(t.encounterDeck.filter((c) => c === D.blizzard).length, 2);
  assert.equal(
    t.encounterDeck.filter((c) => c === REDHORN.snowstorm).length,
    2,
  );
  assert.equal(t.encounterDeck.length, size + 4);
  assert.equal(t.nightmare?.blizzards, undefined);
  assert.match(nightmareStatus(t)[0], /stage 2B shuffled Blinding Blizzard/);
  assert.ok(valid(t));
});

test("Nightmare: player cards in the victory display count no victory points, and Blinding Blizzard takes progress and resources", () => {
  // Snow-Giant counts its victory point; a player side quest does not.
  const s = board("planning");
  addVictoryCard(s, D.giant);
  addVictoryCard(s, "10009");
  assert.equal(card("10009").victory, 1);
  assert.equal(s.victory, 1);
  assert.deepEqual(s.victoryCards, [D.giant, "10009"]);
  // In a standard game, it does.
  const standard = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "redhorn-gate",
  });
  const before = standard.victory;
  addVictoryCard(standard, "10009");
  assert.equal(standard.victory, before + 1);
  // Blinding Blizzard enters the staging area; heroes collect no resources.
  let t = reveal(board("staging"), D.blizzard);
  const b = t.staging.find((u) => u.code === D.blizzard)!;
  assert.ok(b);
  assert.ok(!t.encounterDiscard.includes(D.blizzard));
  assert.equal(hooks(t).cannotCollectResources!(t, t.heroes[0]), true);
  collectResources(t);
  assert.deepEqual(
    t.heroes.map((h) => h.resources),
    [0, 0, 0],
  );
  assert.ok(valid(t));
  // Progress for the current quest is placed on it; at 5 it is discarded
  // (the progress beyond the 5th is lost with it).
  calm(t, "quest");
  progress(t, 3);
  flush(t);
  assert.deepEqual([t.progress, b.progress], [0, 3]);
  progress(t, 3);
  flush(t);
  assert.equal(t.progress, 0);
  assert.ok(!t.staging.some((u) => u.id === b.id));
  assert.ok(t.encounterDiscard.includes(D.blizzard));
  progress(t, 2);
  flush(t);
  assert.equal(t.progress, 2);
  t = board("planning", t);
  collectResources(t);
  assert.deepEqual(
    t.heroes.map((h) => h.resources),
    [1, 1, 1],
  );
  // Progress for a Snow location is placed on it too; not for another
  // location.
  const u = board("quest");
  const blizzard = make(u, D.blizzard);
  u.staging.push(blizzard);
  const celebdil = make(u, CELEBDIL);
  u.activeLocation = celebdil;
  progress(u, 3);
  flush(u);
  assert.deepEqual(
    [celebdil.progress, u.progress, blizzard.progress],
    [0, 0, 3],
  );
  const waters = make(u, WATERS);
  progressLocation(u, waters, 1);
  assert.deepEqual([waters.progress, blizzard.progress], [1, 3]);
  assert.ok(valid(u));
});

test("Nightmare: Wolfpelt Goblin and Snow-Giant as they engage, and Snow-Giant's attack from the staging area", () => {
  // Wolfpelt Goblin: X damage (the active location's remaining quest
  // points) to a character of the engaged player, then 2 progress removed.
  let s = board("encounter");
  const loc = make(s, CELEBDIL);
  loc.progress = 3;
  s.activeLocation = loc;
  const wolf = make(s, D.wolfpelt);
  s.staging.push(wolf);
  engage(s, wolf);
  flush(s);
  assert.match(s.choice!.title, /^Wolfpelt Goblin · Deal 4 damage/);
  assert.equal(s.activeLocation!.progress, 1);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].damage, 4);
  assert.ok(valid(s));
  // Without an active location, no damage.
  const t = board("encounter");
  const wolf2 = make(t, D.wolfpelt);
  t.staging.push(wolf2);
  engage(t, wolf2);
  flush(t);
  assert.equal(t.choice, null);
  assert.ok(t.heroes.every((h) => h.damage === 0));
  // Its surge.
  const r = reveal(board("staging"), D.wolfpelt);
  assert.ok(r.staging.some((u) => u.code === D.wolfpelt));
  assert.equal(r.encounterDeck.length, 9, "surge");
  // Snow-Giant engaging: the ally with the highest [willpower] is
  // discarded (a choice among equals; Arwen Undómiel is an ally).
  let u = board("encounter");
  const faramir = make(u, "01014"),
    guard = make(u, "01013");
  u.allies.push(faramir, guard);
  assert.deepEqual(
    [REDHORN.arwen, "01014", "01013"].map((x) => card(x).willpower),
    [2, 2, 1],
  );
  const giant = make(u, D.giant);
  u.staging.push(giant);
  engage(u, giant);
  flush(u);
  assert.match(u.choice!.title, /^Snow-Giant · Discard the ally/);
  assert.deepEqual(
    u.choice!.options.map((o) => o.code).sort(),
    [REDHORN.arwen, "01014"].sort(),
  );
  u = choose(u, faramir.id);
  assert.deepEqual(
    u.allies.map((a) => a.code).sort(),
    [REDHORN.arwen, "01013"].sort(),
  );
  assert.equal(u.status, "playing");
  // Arwen alone at the top: the escort fails.
  const v = board("encounter");
  v.allies.push(make(v, "01013"));
  const giant2 = make(v, D.giant);
  v.staging.push(giant2);
  engage(v, giant2);
  flush(v);
  assert.equal(v.status, "lost");
  // In the staging area, Snow-Giant attacks the first player during the
  // combat phase (a new shadow card for its attack); the players cannot
  // attack it there.
  let w = board("defense");
  const giant3 = make(w, D.giant);
  w.staging.push(giant3);
  assert.equal(hooks(w).consideredEngaged!(w, giant3, 0), true);
  assert.ok(engagedEnemies(w, 0).some((x) => x.id === giant3.id));
  assert.ok(normalAttackPending(w, giant3, 0));
  const aragorn = w.heroes[0];
  w = applyAction(w, {
    type: "DEFEND",
    enemyId: giant3.id,
    defenderId: aragorn.id,
  });
  assert.equal(w.heroes[0].damage, 6 - stats(w, w.heroes[0]).defense);
  assert.deepEqual(w.encounterDiscard, [WATERS]);
  assert.ok(valid(w));
  calm(w, "attack");
  const staged = w.staging.find((x) => x.code === D.giant)!;
  assert.equal(hooks(w).consideredEngaged!(w, staged, 0), false);
  assert.deepEqual(attackersFor(w, staged), []);
  // Two players: only the first player.
  const two = board("defense", opening(nightmareForTwo("redhorn-gate")));
  const giant4 = make(two, D.giant);
  two.staging.push(giant4);
  assert.deepEqual(
    [0, 1].map((p) => hooks(two).consideredEngaged!(two, giant4, p)),
    [true, false],
  );
  assert.ok(!engagedEnemies(two, 1).some((x) => x.id === giant4.id));
});

test("Nightmare: Silvertine Marauder, Icy Cavern, Frozen Silverlode and Caradhras the Cruel", () => {
  // Silvertine Marauder: +2 [attack] against a defender with less than 2
  // [willpower] (Théodred has 1, Aragorn 2), and as a shadow card.
  const s = board("defense");
  const [aragorn, theodred] = s.heroes;
  const m = make(s, D.marauder);
  s.engaged.push(m);
  assert.equal(stats(s, m).attack, 3);
  shadow(s, m, WATERS, theodred);
  assert.equal(stats(s, m).attack, 5);
  shadow(s, m, WATERS, aragorn);
  assert.equal(stats(s, m).attack, 3);
  const uruks = make(s, URUKS);
  s.engaged.push(uruks);
  const base = card(URUKS).attack!;
  shadow(s, uruks, D.marauder, theodred);
  assert.equal(stats(s, uruks).attack, base + 2);
  hooks(s).attackFinished!(s, uruks);
  assert.equal(s.nightmare?.marauders, undefined);
  assert.equal(stats(s, uruks).attack, base);
  // Icy Cavern: [threat] X, the Snow cards in the staging area (itself
  // among them).
  const t = board("planning");
  const cave = make(t, D.cavern);
  t.staging.push(cave);
  assert.equal(threatOf(t, cave), 1);
  t.staging.push(make(t, SNOW_WARG), make(t, D.blizzard), make(t, WATERS));
  assert.equal(threatOf(t, cave), 3);
  // Its Travel cost reveals a Freezing Cold from the encounter deck or
  // discard pile; without one, it cannot be travelled to.
  const u = board("travel");
  const cave2 = make(u, D.cavern);
  u.staging.push(cave2);
  assert.match(hooks(u).travelProblem!(u, cave2)!, /no copy of Freezing Cold/);
  assert.throws(
    () => applyAction(u, { type: "TRAVEL", id: cave2.id }),
    /Freezing Cold/,
  );
  u.encounterDiscard = [REDHORN.cold];
  let v = resolveWindows(applyAction(u, { type: "TRAVEL", id: cave2.id }));
  assert.match(v.choice!.title, /Freezing Cold/);
  v = choose(v, v.heroes[1].id);
  assert.ok(v.heroes[1].attachments.some((a) => a.code === REDHORN.cold));
  assert.equal(v.activeLocation?.code, D.cavern);
  assert.ok(!v.encounterDiscard.includes(REDHORN.cold));
  assert.ok(valid(v));
  // The shadows: the defender gets -1 [willpower], and the attacking enemy
  // another shadow card.
  for (const x of [D.cavern, D.silverlode]) {
    const w = board("defense");
    const enemy = make(w, URUKS);
    w.engaged.push(enemy);
    const hero = w.heroes[0];
    const will = stats(w, hero).will;
    shadow(w, enemy, x, hero);
    flush(w);
    assert.equal(stats(w, hero).will, will - 1, card(x).name);
    assert.deepEqual(enemy.shadows, [x, WATERS]);
  }
  // Frozen Silverlode in the staging area: no [willpower] from player card
  // effects (Celebrían's Stone), while reductions still apply.
  const f = board("planning");
  const hero = f.heroes[0];
  attach(f, hero, "01027");
  assert.equal(stats(f, hero).will, 2 + 2);
  const silverlode = make(f, D.silverlode);
  f.staging.push(silverlode);
  assert.equal(stats(f, hero).will, 2);
  attach(f, hero, REDHORN.cold);
  assert.equal(stats(f, hero).will, 0);
  f.staging = [];
  f.activeLocation = silverlode;
  assert.equal(stats(f, hero).will, 2);
  // Caradhras the Cruel: the Snow cards of the discard pile go to the top of
  // the encounter deck, in random order, and the top card is revealed.
  const g = board("staging");
  g.encounterDiscard = [SNOW_WARG, WATERS, FANUIDHOL];
  g.encounterDeck = [WATERS, WATERS];
  const h = reveal(
    g,
    D.cruel,
    (x) => x.choice!.options.find((o) => o.id === "resolve")?.id,
  );
  assert.deepEqual(h.encounterDiscard.slice().sort(), [WATERS, D.cruel].sort());
  assert.deepEqual(
    [...h.staging.map((x) => x.code), h.encounterDeck[0]].sort(),
    [SNOW_WARG, FANUIDHOL].sort(),
  );
  assert.equal(h.encounterDeck.length, 3);
  assert.ok(valid(h));
  // With 3 players, the top 2 cards.
  const three = board("staging", opening(forThree()));
  three.encounterDiscard = [SNOW_WARG, FANUIDHOL];
  three.encounterDeck = [WATERS];
  const k = reveal(
    three,
    D.cruel,
    (x) => x.choice!.options.find((o) => o.id === "resolve")?.id,
  );
  assert.deepEqual(
    k.staging.map((x) => x.code).sort(),
    [SNOW_WARG, FANUIDHOL].sort(),
  );
  assert.deepEqual(k.encounterDeck, [WATERS]);
  assert.equal(seatView(k, 2).heroes.length, 3);
});

test("Nightmare: seeded The Redhorn Gate games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(redhorn(seed), 3000);
    assert.notEqual(s.status, "playing", `redhorn-gate seed ${seed}`);
  }
  // From stage 2B, with Blinding Blizzard in the encounter deck.
  const t = board("planning", opening(redhorn(3)));
  t.nightmare = { ...t.nightmare, blizzards: 2 };
  t.progress = 9;
  calm(t, "quest");
  advanceRedhorn(t);
  flush(t);
  calm(t, "planning");
  assert.equal(t.stage, 2);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2B");
  const two = autoplay(nightmareForTwo("redhorn-gate", 7), 4000);
  assert.notEqual(two.status, "playing", "two-player redhorn-gate");
  // A Blinding Blizzard reveal resolves through the queue as well.
  const v = board("staging");
  v.queue.push(fx("reveal", { player: 0 }));
  v.encounterDeck = [D.blizzard, WATERS];
  flush(v);
  assert.ok(v.staging.some((x) => x.code === D.blizzard));
});
