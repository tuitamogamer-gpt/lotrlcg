import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  addVictoryCard,
  advanceQuest,
  check,
  damage,
  engage,
  readyCharacter,
} from "../src/game/board";
import { fx, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, canCommit, createGame } from "../src/game/engine";
import { optionalEngagementProblem } from "../src/game/actions";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { watcherWaterCombatEnd } from "../src/game/watcher-water";
import { WATCHER_WATER as W } from "../src/game/watcher-water-support";
import {
  NIGHTMARE,
  NIGHTMARE_DD as D,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatIndices } from "../src/game/table";
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

/** Turbulent Waters: a location with no "When Revealed" effect and no shadow. */
const WATERS = encounterCards.find((c) => c.name === "Turbulent Waters")!.code;
/** Black Uruks: an enemy without the Tentacle trait, with a shadow effect (a Tentacle test hit). */
const URUKS = encounterCards.find((c) => c.name === "Black Uruks")!.code;
const game = (seed = 5) => nightmareGame("watcher-in-the-water", seed);
/** A quiet board in `phase`: nothing staged, engaged, attached or discarded, threat 20. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.allies = [];
      for (const u of s.heroes) {
        u.damage = 0;
        u.committed = false;
        u.exhausted = false;
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
  delete s.nightmare;
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
/** Choices answered: "Revealed:" windows resolve, others take `id` or the first option. */
function settle(s: GameState, id?: (s: GameState) => string | undefined) {
  for (let i = 0; i < 20 && s.choice; i++)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "resolve")?.id ??
        id?.(s) ??
        s.choice.options[0].id,
    );
  return s;
}
/** Stage 2, The Seething Lake: The Watcher in the staging area, Doors of Durin active. */
function lake(s: GameState) {
  s.progress = 13;
  advanceQuest(s);
  flush(s);
  return settle(s);
}
const watcherOf = (s: GameState) =>
  [...s.staging, ...s.engaged].find((u) => u.code === D.watcher)!;
const attached = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code);

test("Nightmare: The Watcher in the Water's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(D.watcherCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Watcher in the Water - Nightmare", true],
  );
  assert.equal(
    c.text,
    "Begin with the standard quest deck and encounter deck for The Watcher in the Water scenario.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n1x The Watcher\n2x Makeshift Passage\n4x Black Uruks\n3x Mountain Warg\n2x Warg Lair\nThen, shuffle the encounter cards in this Nightmare Deck into the remainder of the standard The Watcher in the Water encounter deck.\nFinally, flip this setup card over and place it next to the quest deck. Its effect remains active throughout the game, which is now ready to begin.",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nWhile Doors of Durin is in play, The Watcher cannot be engaged.\nForced: When a Tentacle enemy is destroyed, deal 1 damage to The Watcher if it is in play.\nThe players cannot win the game unless both Doors of Durin and The Watcher are in the victory display.",
  );
  // The scans correct the catalog: The Watcher's traits, uniqueness and
  // "damaged", Writhing Tentacle's name in its text, Choking Tentacle's
  // punctuation, and the Tentacle trait of Pulled Under and Rippling From
  // Beneath.
  const w = card(D.watcher);
  assert.deepEqual(
    [w.name, w.traits, w.is_unique],
    ["The Watcher", "Creature. Tentacle.", true],
  );
  assert.equal(
    w.text,
    "While The Watcher is in the staging area, it cannot be damaged by player card effects.\nIf The Watcher is in the staging area at the end of the combat phase, each player must deal 3 damage to 1 character he controls.",
  );
  assert.equal(
    card(D.writhing).text,
    'Forced: When Writhing Tentacle engages a player, discard the top card of the encounter deck. If that card has a shadow effect or is a Tentacle enemy, Writhing Tentacle makes an immediate attack, then attaches to the defending character as a Tentacle attachment with the text: "Attached character cannot commit to the quest."',
  );
  assert.equal(
    card(D.choking).text,
    'Forced: After resolving an attack made by Choking Tentacle, discard the top card of the encounter deck. If that card has a shadow effect or is a Tentacle enemy, attach Choking Tentacle to a character the defending player controls as a Tentacle attachment with the text: "Forced: After attached character readies, deal it 1 damage."',
  );
  assert.equal(
    card(D.banks).text,
    "While Banks of Sirannon is in the staging area, each Tentacle enemy gets +2 [defense].",
  );
  assert.equal(
    card(D.depths).text,
    "Forced: After a player looks at one or more cards in the encounter deck, shuffle the encounter deck.\nTravel: Reveal the topmost Tentacle enemy in the encounter discard pile to travel here.",
  );
  assert.equal(
    card(D.pulled).text,
    "When Revealed: Deal 3 damage to each character with a Tentacle attachment. If no characters were damaged by this effect, Pulled Under gains surge.",
  );
  assert.equal(
    card(D.rippling).text,
    "Surge.\nWhen Revealed: Shuffle X Tentacle enemies from the encounter discard pile into the encounter deck. Heal X damage from The Watcher, if it is in play. X is the number of players in the game.",
  );
  assert.deepEqual(
    [D.watcher, D.writhing, D.choking, D.pulled, D.rippling].map(
      (x) => card(x).traits,
    ),
    ["Creature. Tentacle.", "Tentacle.", "Tentacle.", "Tentacle.", "Tentacle."],
  );
  assert.deepEqual(
    [D.banks, D.depths].map((x) => card(x).traits),
    ["Mountain. Swamp.", "Swamp."],
  );
  assert.deepEqual(
    [D.banks, D.pulled].map((x) => card(x).shadow),
    [
      "Shadow: For each point of damage dealt by this attack, the defending player must discard a random card from his hand.",
      "Shadow: If the defending character has a Tentacle attachment, discard that character.",
    ],
  );
  for (const x of [D.watcher, D.writhing, D.choking, D.depths, D.rippling])
    assert.equal(card(x).shadow, undefined, card(x).name);
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health];
  };
  assert.deepEqual(stat(D.watcher), [50, 4, 7, 7, 21]);
  assert.equal(card(D.watcher).victory, 3);
  assert.deepEqual(stat(D.writhing), [46, 4, 4, 0, 3]);
  assert.deepEqual(stat(D.choking), [10, 2, 5, 1, 4]);
  assert.deepEqual(
    [D.banks, D.depths].map((x) => [card(x).threat, card(x).quest]),
    [
      [3, 3],
      [3, 5],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Watcher in the Water - Nightmare",
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

test("Nightmare: The Watcher in the Water's Nightmare decks match their source recipe, with the Nightmare Watcher set aside", () => {
  const sets = scenario("watcher-in-the-water").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("watcher-in-the-water", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.6")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (!["sharedQuestDeck", "sharedStagingArea"].includes(c.section))
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  for (const [title, n] of Object.entries(
    NIGHTMARE["watcher-in-the-water"]!.removals,
  ))
    assert.ok(card(D.watcherCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "The Watcher in the Water (Nightmare)",
      mode: "nightmare",
    }),
    "watcher-in-the-water",
  );
  // To the West-door's Setup sets the Nightmare Deck's The Watcher aside with
  // Doors of Durin (the standard one was removed).
  for (const s of [
    opening(game()),
    opening(nightmareForTwo("watcher-in-the-water")),
  ]) {
    assert.equal(nightmareCardOf(s), D.watcherCard);
    assert.deepEqual(
      s.watcherWater!.setAside.slice().sort(),
      [D.watcher, W.doors].sort(),
    );
    assert.ok(!s.encounterDeck.includes(D.watcher));
    assert.ok(!s.encounterDeck.includes(W.watcher));
    const recipeSetAside = recipe.cards
      .filter((c) => c.section === "sharedSetAside")
      .map((c) => c.code)
      .sort();
    assert.deepEqual(s.watcherWater!.setAside.slice().sort(), recipeSetAside);
    assert.match(nightmareStatus(s)[0], /The Watcher cannot be engaged/);
    assert.ok(valid(s));
  }
  // The Seething Lake adds it to the staging area.
  const s = lake(board("staging"));
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === D.watcher));
  assert.ok(!s.staging.some((u) => u.code === W.watcher));
  assert.equal(s.activeLocation?.code, W.doors);
  assert.deepEqual(s.watcherWater!.setAside, []);
  assert.ok(valid(s));
});

test("Nightmare: The Watcher cannot be engaged while Doors of Durin is in play", () => {
  const s = lake(board("encounter"));
  const w = watcherOf(s);
  assert.ok(s.staging.includes(w));
  assert.equal(hooks(s).cannotEngage!(s, w), true);
  engage(s, w);
  flush(s);
  assert.ok(s.staging.includes(w), "it stays in the staging area");
  assert.match(
    optionalEngagementProblem(s, w)!,
    /cannot be optionally engaged/,
  );
  // Doors of Durin added to the victory display: it can be engaged.
  s.activeLocation = null;
  addVictoryCard(s, W.doors);
  assert.equal(hooks(s).cannotEngage!(s, w), false);
  engage(s, w);
  flush(s);
  assert.ok(s.engaged.some((u) => u.id === w.id));
  assert.ok(valid(s));
  // A Normal game: the standard rules only.
  const n = board(
    "encounter",
    opening(
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "watcher-in-the-water",
      }),
    ),
  );
  n.activeLocation = make(n, W.doors);
  const nw = make(n, D.watcher);
  n.staging.push(nw);
  assert.equal(!!hooks(n).cannotEngage?.(n, nw), false);
});

test("Nightmare: a destroyed Tentacle enemy deals 1 damage to The Watcher, which player card effects cannot damage in the staging area", () => {
  const s = lake(board("attack"));
  const w = watcherOf(s);
  // A Tentacle enemy destroyed (a Nightmare and a standard one).
  for (const code of [D.writhing, W.grasping]) {
    const t = make(s, code);
    s.engaged.push(t);
    damage(s, t.id, card(code).health!, {
      combatDamage: true,
      enemyId: t.id,
    });
    flush(s);
    assert.ok(!s.engaged.some((u) => u.id === t.id), card(code).name);
  }
  assert.equal(w.damage, 2);
  // Even while the player card effect that destroyed it is resolving.
  s.playerAbilitySources = [{ source: s.heroes[0].id, code: "01001" }];
  const t = make(s, D.choking);
  s.engaged.push(t);
  damage(s, t.id, 4);
  flush(s);
  assert.ok(!s.engaged.some((u) => u.id === t.id));
  assert.equal(w.damage, 3);
  // A player card effect cannot damage it in the staging area...
  damage(s, w.id, 2);
  assert.equal(w.damage, 3);
  delete s.playerAbilitySources;
  // ...though an encounter effect can.
  damage(s, w.id, 1);
  assert.equal(w.damage, 4);
  // Once engaged (Doors of Durin gone), player card effects damage it.
  s.activeLocation = null;
  addVictoryCard(s, W.doors);
  engage(s, w);
  flush(s);
  s.playerAbilitySources = [{ source: s.heroes[0].id, code: "01001" }];
  damage(s, w.id, 2);
  assert.equal(w.damage, 6);
  delete s.playerAbilitySources;
  // A non-Tentacle enemy destroyed: no damage.
  const uruk = make(s, URUKS);
  s.engaged.push(uruk);
  damage(s, uruk.id, card(URUKS).health!);
  flush(s);
  assert.ok(!s.engaged.some((u) => u.id === uruk.id));
  assert.equal(w.damage, 6);
  // Without The Watcher in play (stage 1), a destroyed Tentacle does nothing.
  const t1 = board("attack");
  const g = make(t1, W.grasping);
  t1.engaged.push(g);
  damage(t1, g.id, card(W.grasping).health!);
  flush(t1);
  assert.ok(!t1.engaged.some((u) => u.id === g.id));
  assert.ok(valid(t1));
});

test("Nightmare: the players cannot win unless both Doors of Durin and The Watcher are in the victory display", () => {
  // Doors of Durin alone (3 victory points).
  const s = lake(board("quest"));
  s.progress = 5;
  s.activeLocation = null;
  addVictoryCard(s, W.doors);
  check(s);
  assert.equal(s.victory, 3);
  assert.equal(s.status, "playing");
  // The Watcher alone.
  const t = lake(board("quest"));
  t.progress = 5;
  t.staging = t.staging.filter((u) => u.code !== D.watcher);
  addVictoryCard(t, D.watcher);
  check(t);
  assert.equal(t.victory, 3);
  assert.equal(t.status, "playing");
  // Both.
  t.activeLocation = null;
  addVictoryCard(t, W.doors);
  check(t);
  assert.equal(t.status, "won");
  // The Watcher destroyed in combat goes to the victory display.
  const u = lake(board("attack"));
  u.activeLocation = null;
  addVictoryCard(u, W.doors);
  u.progress = 5;
  const w = watcherOf(u);
  engage(u, w);
  flush(u);
  damage(u, w.id, 21, { combatDamage: true, enemyId: w.id });
  flush(u);
  check(u);
  assert.ok(u.victoryCards!.includes(D.watcher));
  assert.equal(u.status, "won");
});

test("Nightmare: The Watcher deals its end-of-combat damage from the staging area", () => {
  const s = lake(board("attack"));
  watcherWaterCombatEnd(s);
  flush(s);
  assert.match(s.choice!.title, /The Watcher · Deal three damage/);
  const t = choose(s, s.heroes[0].id);
  assert.equal(t.heroes[0].damage, 3);
});

test("Nightmare: Writhing Tentacle makes an immediate attack on a hit, then attaches to the defending character", () => {
  // A hit (a card with a shadow effect): the immediate attack, then it
  // attaches to the defender, who cannot commit to the quest.
  let s = board("encounter");
  const t = make(s, D.writhing);
  s.staging.push(t);
  s.encounterDeck = [URUKS, ...Array(6).fill(WATERS)];
  engage(s, t);
  flush(s);
  assert.ok(s.encounterDiscard.includes(URUKS));
  assert.match(s.choice!.title, /Writhing Tentacle · Immediate attack/);
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.ok(attached(s.heroes[0], D.writhing));
  assert.ok(!s.engaged.some((u) => u.code === D.writhing));
  assert.equal(s.heroes[0].damage, 2, "4 attack against 2 defense");
  calm(s, "quest");
  s.heroes[0].exhausted = false;
  assert.equal(canCommit(s, s.heroes[0]), false);
  assert.equal(canCommit(s, s.heroes[1]), true);
  assert.ok(valid(s));
  // A Tentacle enemy discarded is a hit too; undefended, it stays engaged.
  let u = board("encounter");
  const t2 = make(u, D.writhing);
  u.staging.push(t2);
  u.encounterDeck = [D.choking, ...Array(6).fill(WATERS)];
  engage(u, t2);
  flush(u);
  u = choose(u, "undefended");
  u = settle(u, (x) => x.heroes[1].id);
  assert.ok(u.engaged.some((x) => x.id === t2.id));
  assert.ok(!u.heroes.some((h) => attached(h, D.writhing)));
  assert.equal(u.nightmare?.writhing, undefined);
  // A miss: no attack.
  const v = board("encounter");
  const t3 = make(v, D.writhing);
  v.staging.push(t3);
  engage(v, t3);
  flush(v);
  assert.equal(v.choice, null);
  assert.ok(v.engaged.some((x) => x.id === t3.id));
  assert.deepEqual(v.encounterDiscard, [WATERS]);
});

test("Nightmare: Choking Tentacle attaches to a character the defending player controls on a hit and damages it when it readies", () => {
  let s = board("encounter");
  const t = make(s, D.choking);
  s.engaged.push(t);
  // Its shadow card, then the discarded card (a Tentacle enemy: a hit).
  s.encounterDeck = [WATERS, D.writhing, ...Array(5).fill(WATERS)];
  s.queue.unshift(fx("immediateAttack", { target: t.id, player: 0 }));
  flush(s);
  s = choose(s, s.heroes[0].id);
  for (let i = 0; i < 10 && s.choice && !/Choking/.test(s.choice.title); i++)
    s = choose(
      s,
      s.choice.options.find((o) => o.id === "resolve")?.id ??
        s.choice.options[0].id,
    );
  assert.match(s.choice!.title, /Choking Tentacle · Attach it/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    s.heroes.map((h) => h.id).sort(),
  );
  s = choose(s, s.heroes[2].id);
  assert.ok(attached(s.heroes[2], D.choking));
  assert.ok(!s.engaged.some((u) => u.id === t.id));
  assert.ok(s.encounterDiscard.includes(D.writhing));
  // After the attached character readies, it takes 1 damage.
  s.heroes[2].exhausted = true;
  readyCharacter(s, s.heroes[2]);
  flush(s);
  assert.equal(s.heroes[2].damage, 1);
  assert.ok(valid(s));
  // A miss: it stays engaged.
  let u = board("encounter");
  const t2 = make(u, D.choking);
  u.engaged.push(t2);
  u.queue.unshift(fx("immediateAttack", { target: t2.id, player: 0 }));
  flush(u);
  u = choose(u, u.heroes[0].id);
  u = settle(u);
  assert.ok(u.engaged.some((x) => x.id === t2.id));
  assert.ok(!u.heroes.some((h) => attached(h, D.choking)));
});

test("Nightmare: Banks of Sirannon gives Tentacle enemies +2 defense from the staging area and its shadow discards random cards", () => {
  const s = board("planning");
  const t = make(s, D.choking);
  const g = make(s, W.grasping);
  s.engaged.push(t, g);
  const def = [stats(s, t).defense, stats(s, g).defense];
  s.staging.push(make(s, D.banks));
  assert.deepEqual(
    [stats(s, t).defense, stats(s, g).defense],
    [def[0] + 2, def[1] + 2],
  );
  s.staging.push(make(s, D.banks));
  assert.equal(stats(s, t).defense, def[0] + 4);
  // As the active location, no bonus.
  s.activeLocation = s.staging.pop()!;
  s.staging.pop();
  assert.equal(stats(s, t).defense, def[0]);
  // Its shadow: a random card from the defending player's hand for each
  // point of damage dealt by the attack.
  const w = board("defense");
  const enemy = make(w, D.choking);
  w.engaged.push(enemy);
  const hero = w.heroes[0];
  shadow(w, enemy, D.banks, hero);
  assert.equal(w.nightmare?.banks, enemy.id);
  assert.ok(valid(w));
  const hand = w.hand.length;
  const discard = w.discard.length;
  damage(w, hero.id, 2, { combatDamage: true, enemyId: enemy.id });
  flush(w);
  assert.equal(w.hand.length, hand - 2);
  assert.equal(w.discard.length, discard + 2);
  // Another enemy's damage does not.
  damage(w, hero.id, 1, { combatDamage: true, enemyId: "other" });
  flush(w);
  assert.equal(w.hand.length, hand - 2);
  // The attack resolved: it ends.
  hooks(w).attackFinished!(w, w.combat!);
  assert.equal(w.nightmare?.banks, undefined);
});

test("Nightmare: Hideous Depths shuffles the encounter deck after a player looks at it, and its Travel cost reveals the topmost Tentacle enemy", () => {
  const order = [
    D.writhing,
    D.choking,
    D.banks,
    D.pulled,
    D.rippling,
    WATERS,
    W.grasping,
    W.striking,
  ];
  // A look whose window closes at once (Henamarth Riversong).
  const s = board("planning");
  s.staging.push(make(s, D.depths));
  s.encounterDeck = [...order];
  s.peek = s.encounterDeck[0];
  check(s);
  assert.equal(s.peek, null);
  assert.notDeepEqual(s.encounterDeck, order);
  assert.deepEqual(s.encounterDeck.slice().sort(), order.slice().sort());
  assert.ok(s.log.some((l) => /Hideous Depths/.test(l.text)));
  // A look with a choice (Denethor moving the card to the bottom): the
  // shuffle follows the choice.
  const t = board("planning");
  t.staging.push(make(t, D.depths));
  t.encounterDeck = [...order];
  t.peek = t.encounterDeck[0];
  t.choice = {
    title: "Denethor sees Writhing Tentacle",
    options: [{ id: "keep", label: "Keep", effects: [] }],
  } as never;
  check(t);
  assert.deepEqual(t.encounterDeck, order, "not yet");
  assert.equal(t.nightmare?.peeked, true);
  assert.ok(valid({ ...t, choice: null }));
  t.choice = null;
  t.encounterDeck.push(t.encounterDeck.shift()!);
  t.peek = null;
  check(t);
  assert.notDeepEqual(t.encounterDeck, [...order.slice(1), order[0]]);
  assert.equal(t.nightmare?.peeked, undefined);
  // A dealt shadow card looked at (Dark Knowledge) is not the encounter deck;
  // and without Hideous Depths in play, nothing happens.
  const u = board("defense");
  u.staging.push(make(u, D.depths));
  u.encounterDeck = [...order];
  const enemy = make(u, D.choking);
  enemy.shadows = [D.banks];
  u.engaged.push(enemy);
  u.peek = D.banks;
  check(u);
  assert.deepEqual(u.encounterDeck, order);
  const v = board("planning");
  v.encounterDeck = [...order];
  v.peek = v.encounterDeck[0];
  check(v);
  assert.deepEqual(v.encounterDeck, order);
  assert.equal(v.peek, order[0]);
  // Travel: without a Tentacle enemy in the encounter discard pile, it
  // cannot be travelled to.
  const x = board("travel");
  const depths = make(x, D.depths);
  x.staging.push(depths);
  x.encounterDiscard = [WATERS, D.pulled];
  assert.match(hooks(x).travelProblem!(x, depths)!, /no Tentacle enemy/);
  assert.throws(() => applyAction(x, { type: "TRAVEL", id: depths.id }));
  x.encounterDiscard = [W.grasping, WATERS, D.choking, D.pulled];
  const y = settle(applyAction(x, { type: "TRAVEL", id: depths.id }));
  assert.equal(y.activeLocation?.code, D.depths);
  assert.ok(y.staging.some((u2) => u2.code === D.choking));
  assert.deepEqual(y.encounterDiscard, [W.grasping, WATERS, D.pulled]);
  assert.ok(valid(y));
});

test("Nightmare: Pulled Under damages each character with a Tentacle attachment (or gains surge) and its shadow discards such a defender", () => {
  const s = board("staging");
  assert.equal(hooks(s).revealedSurge!(s, D.pulled), true);
  s.heroes[0].attachments.push({
    id: "t1",
    code: D.writhing,
    exhausted: false,
  });
  s.heroes[1].attachments.push({ id: "t2", code: W.wrapped, exhausted: false });
  assert.equal(hooks(s).revealedSurge!(s, D.pulled), false);
  const deck = s.encounterDeck.length;
  const t = reveal(
    s,
    D.pulled,
    (x) => x.choice!.options.find((o) => o.id === "resolve")?.id,
  );
  assert.deepEqual(
    t.heroes.map((h) => h.damage),
    [3, 3, 0],
  );
  assert.equal(t.encounterDeck.length, deck, "no surge");
  assert.ok(t.encounterDiscard.includes(D.pulled));
  // No character with a Tentacle attachment: it gains surge.
  const u = board("staging");
  const v = reveal(
    u,
    D.pulled,
    (x) => x.choice!.options.find((o) => o.id === "resolve")?.id,
  );
  assert.equal(v.encounterDeck.length, 9, "surge");
  assert.ok(valid(v));
  // Its shadow: a defending character with a Tentacle attachment is
  // discarded; one without stays.
  const w = board("defense");
  const enemy = make(w, D.choking);
  w.engaged.push(enemy);
  const hero = w.heroes[0];
  shadow(w, enemy, D.pulled, w.heroes[1]);
  flush(w);
  assert.equal(w.heroes.length, 3);
  hero.attachments.push({ id: "t3", code: D.choking, exhausted: false });
  shadow(w, enemy, D.pulled, hero);
  flush(w);
  assert.ok(!w.heroes.some((h) => h.id === hero.id));
});

test("Nightmare: Rippling From Beneath shuffles X Tentacle enemies into the encounter deck and heals X damage from The Watcher", () => {
  assert.match(card(D.rippling).text!, /^Surge\.\n/);
  const s = lake(board("staging"));
  const w = watcherOf(s);
  w.damage = 5;
  s.encounterDeck = Array(4).fill(WATERS);
  s.encounterDiscard = [D.writhing, W.grasping, WATERS, D.pulled];
  hooks(s).encounter!(s, D.rippling);
  flush(s);
  // X = 1: the topmost Tentacle enemy (Pulled Under is a treachery).
  assert.deepEqual(s.encounterDiscard, [
    D.writhing,
    WATERS,
    D.pulled,
    D.rippling,
  ]);
  assert.ok(s.encounterDeck.includes(W.grasping));
  assert.equal(s.encounterDeck.length, 5);
  assert.equal(w.damage, 4);
  // Two players: X = 2.
  const t = lake(
    board("staging", opening(nightmareForTwo("watcher-in-the-water"))),
  );
  const w2 = watcherOf(t);
  w2.damage = 1;
  t.encounterDeck = Array(4).fill(WATERS);
  t.encounterDiscard = [D.writhing, W.grasping, WATERS, D.choking];
  hooks(t).encounter!(t, D.rippling);
  flush(t);
  assert.deepEqual(t.encounterDiscard, [D.writhing, WATERS, D.rippling]);
  assert.equal(t.encounterDeck.length, 6);
  assert.equal(w2.damage, 0, "heals what it can");
  assert.ok(valid(t));
  // Without The Watcher in play, only the shuffle.
  const u = board("staging");
  u.encounterDiscard = [D.choking];
  hooks(u).encounter!(u, D.rippling);
  flush(u);
  assert.deepEqual(u.encounterDiscard, [D.rippling]);
});

test("Nightmare: The Watcher in the Water's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = { writhing: "u1", banks: "u2", peeked: true };
  assert.ok(valid(s));
  for (const bad of [{ writhing: 1 }, { banks: false }, { peeked: "yes" }]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `watcher seed ${seed}`);
  }
  // From stage 2, The Seething Lake.
  const t = lake(board("staging", opening(game(3))));
  calm(t, "planning");
  assert.equal(t.stage, 2);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
  const two = autoplay(nightmareForTwo("watcher-in-the-water", 7), 4000);
  assert.notEqual(two.status, "playing", "two-player watcher-in-the-water");
});
