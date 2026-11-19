import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, progress } from "../src/game/board";
import { fx, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { KHAZAD, advanceKhazad, khazadStageInfo } from "../src/game/khazad-dum";
import {
  NIGHTMARE,
  NIGHTMARE_KD as K,
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
  nightmareForTwo,
  nightmareGame,
  opening,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

/** Zigil Mineshaft: a location with no "When Revealed" effect. */
const MINE = KHAZAD.shaft;
const STANDARD_ROUTES = [
  KHAZAD.wrong,
  KHAZAD.darkness,
  KHAZAD.council,
  KHAZAD.down,
  KHAZAD.up,
  KHAZAD.narrow,
];
const NEW_ROUTES = [K.ghash, K.flame, K.pursued];
const flight = (seed = 5) => nightmareGame("flight-from-moria", seed);
/** `code` the active route on `side`; the other routes make the quest deck. */
function route(s: GameState, code: string, side: "A" | "B" = "B") {
  const k = s.khazad!;
  k.questDeck = [...STANDARD_ROUTES, ...NEW_ROUTES].filter((c) => c !== code);
  k.activeQuest = code;
  k.questSide = side;
  delete k.narrowIds;
  s.stage = 2;
  s.progress = 0;
  return s;
}
/** A quiet board in `phase` on route `code`: The Nameless Fear alone in the staging area, nothing engaged or discarded. */
function board(
  phase: GameState["phase"],
  code: string = KHAZAD.up,
  side: "A" | "B" = "B",
  s: GameState = opening(flight()),
) {
  calm(s, phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  for (const p of s.table ? s.table.seats.map((_, i) => i) : [0])
    forOwner(s, p, () => {
      s.engaged = [];
      for (const u of [...s.heroes, ...s.allies]) {
        u.damage = 0;
        u.committed = false;
        u.exhausted = false;
      }
    });
  s.staging = s.staging.filter((u) => u.code === KHAZAD.nameless);
  s.encounterDiscard = [];
  s.encounterDeck = Array(10).fill(MINE);
  return route(s, code, side);
}
const hooks = (s: GameState) => batch4Scenario(s);
const run = (s: GameState, kind: string, data: object = {}) => {
  s.queue.push(fx(kind, data));
  flush(s);
  return s;
};
const fearOf = (s: GameState) =>
  s.staging.find((u) => u.code === KHAZAD.nameless)!;
const attach = (s: GameState, u: Unit, code: string, owner = 0) => {
  const a = { id: `a${s.nextId++}`, code, exhausted: false, owner };
  u.attachments.push(a);
  return a;
};

test("Nightmare: Flight from Moria's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(K.flightCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Flight from Moria - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Flight from Moria scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter and quest deck:\n1x Blocked by Shadow\n1x New Devilry\n3x Stray Goblin\n2x The Mountains' Roots\n3x Chance Encounter\n2x Goblin Archer\n1x Goblin Spearman\n2x Plundered Armoury\n3x Cave In\n2x Dark and Dreadful\nShuffle the new stage 2 quest cards in this Nightmare Deck into the quest deck along with the rest of the scenario's stage 2 quest cards, leaving stage 1A on top of the quest deck\. Then, shuffle the encounter cards .* which is now ready to begin\.$/s,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nWhen a quest card is bypassed, shuffle it into the quest deck instead of placing it on the bottom.\nWhile the Escape from Darkness quest card is in play, the Refresh Action on Abandoned Tools can only be triggered once each round.",
  );
  // The three new stage 2 quest cards: Search for an Exit (2A) and their 2B sides.
  assert.deepEqual(
    NEW_ROUTES.map((x) => {
      const q = card(x);
      return [q.type_code, q.name, Number(q.cost), q.back_name, q.back_quest];
    }),
    [
      ["quest", "Search for an Exit", 2, "Ghâsh!", 1],
      ["quest", "Search for an Exit", 2, "Blocked by Flame", undefined],
      ["quest", "Search for an Exit", 2, "Pursued by Shadow", 5],
    ],
  );
  assert.deepEqual(
    NEW_ROUTES.map((x) => card(x).victory),
    [1, 1, undefined],
  );
  for (const x of NEW_ROUTES)
    assert.equal(
      card(x).text,
      "While Search for an Exit is the active quest card, only flip it to side 2B at the beginning of the staging step.",
    );
  assert.equal(
    card(K.ghash).back_text,
    "When Revealed: Deal 1 damage to each questing character.\nPlayers may bypass this quest card at the end of the combat phase.",
  );
  // The scans correct the catalog: Blocked by Flame's text is printed once
  // (the catalog repeated it after "Side B:"), Pursued by Shadow keeps its
  // period, Coal-Black Orc's shadow counts "victory points", and An Evil
  // Fortune is a Shadow. Flame. card with Victory 1.
  assert.equal(
    card(K.flame).back_text,
    "The Nameless Fear attacks each player in turn order during the combat phase (deal and discard a new shadow card for each attack). Characters are eligible to attack The Nameless Fear while it is in the staging area.\nIf The Nameless Fear has 10 or more damage on it, remove all damage from it and advance to the next stage. Players may bypass this quest card at the end of the combat phase.",
  );
  assert.equal(
    card(K.pursued).back_text,
    'Forced: At the end of the round, shuffle the discard pile into the encounter deck and discard the top 5 cards. Resolve the "when revealed" effects of each copy of A Foe Beyond discarded by this effect.\nNo more than 1 progress can be placed on this stage each round.\nIf the players defeat this stage, they win the game.\nPlayers may bypass this quest card at the end of the combat phase.',
  );
  assert.equal(
    card(K.coalBlack).shadow,
    "Shadow: Attacking enemy gets +X [attack]. X is the number of victory points in the victory display.",
  );
  assert.deepEqual(
    [card(K.fortune).traits, card(K.fortune).victory, card(K.fortune).text],
    [
      "Shadow. Flame.",
      1,
      "Surge. Doomed 1.\nWhen Revealed: Add this card to the victory display.",
    ],
  );
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health];
  };
  assert.deepEqual(stat(K.swarming), [10, 1, 3, 1, 6]);
  // Coal-Black Orc's [threat] and [attack] are X.
  assert.deepEqual(stat(K.coalBlack), [34, undefined, undefined, 3, 5]);
  assert.deepEqual([card(K.corridor).threat, card(K.corridor).quest], [4, 6]);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Flight from Moria - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (["nightmare", "quest"].includes(x.type_code) ? 0 : (x.quantity ?? 1)),
      0,
    ),
    16,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    13,
  );
});

test("Nightmare: Flight from Moria's Nightmare encounter and quest decks match their source recipe", () => {
  const sets = scenario("flight-from-moria").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("flight-from-moria", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.3")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.section !== "sharedQuestDeck" && c.code !== K.flightCard)
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  const removals = {
    ...NIGHTMARE["flight-from-moria"]!.removals,
    ...NIGHTMARE["flight-from-moria"]!.questRemovals,
  };
  assert.equal(Object.keys(removals).length, 10);
  for (const [title, n] of Object.entries(removals))
    assert.ok(card(K.flightCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Flight from Moria (Nightmare)",
      mode: "nightmare",
    }),
    "flight-from-moria",
  );
  // The quest deck: A Presence in the Dark, then the stage 2 routes with
  // Ghâsh!, Blocked by Flame and Pursued by Shadow in place of Blocked by
  // Shadow, as in the recipe.
  const s = opening(flight());
  assert.equal(nightmareCardOf(s), K.flightCard);
  assert.match(
    nightmareStatus(s)[0],
    /Ghâsh!, Blocked by Flame and Pursued by Shadow replace Blocked by Shadow/,
  );
  const k = s.khazad!;
  assert.ok(k.victoryCards.includes(KHAZAD.presence));
  assert.deepEqual(
    [KHAZAD.presence, k.activeQuest!, ...k.questDeck].sort(),
    recipe.cards
      .filter((c) => c.section === "sharedQuestDeck")
      .map((c) => c.code)
      .sort(),
  );
  assert.ok(![k.activeQuest, ...k.questDeck].includes(KHAZAD.blocked));
  assert.ok(valid(s));
  const two = opening(nightmareForTwo("flight-from-moria"));
  assert.ok(valid(two));
  assert.equal(two.khazad!.questDeck.length, 8);
  // The new routes read as the active quest card on either side.
  const t = board("planning", K.pursued, "A");
  assert.deepEqual(
    [khazadStageInfo(t)!.name, khazadStageInfo(t)!.side],
    ["Search for an Exit", "A"],
  );
  route(t, K.pursued);
  assert.deepEqual(
    [khazadStageInfo(t)!.name, khazadStageInfo(t)!.quest],
    ["Pursued by Shadow", 5],
  );
  assert.ok(valid(t));
});

test("Nightmare: a bypassed route is shuffled into the quest deck (Shadowed Corridor's cost, Swarming Goblins' Spearman)", () => {
  // The standard bypass puts the route beneath the quest deck; the setup
  // card shuffles it in instead.
  let s = board("attack");
  run(s, "khazadBypassChoice");
  const option = s.choice!.options.find((o) => o.id === "bypass")!;
  assert.equal(option.label, "Shuffle this route into the quest deck");
  s = choose(s, "bypass");
  const k = s.khazad!;
  assert.equal(k.questSide, "A");
  assert.notEqual(k.activeQuest, undefined);
  assert.equal([k.activeQuest, ...k.questDeck].length, 9);
  assert.ok([k.activeQuest, ...k.questDeck].includes(KHAZAD.up));
  assert.ok(
    s.log.some((l) =>
      l.text.includes("the bypassed route is shuffled into the quest deck"),
    ),
  );
  assert.ok(valid(s));
  // The route is shuffled in, not placed beneath: over a few seeds it is
  // not always the bottom card.
  const bottoms = [1, 2, 3, 4, 5, 6].map((seed) => {
    let t = board("attack", KHAZAD.up, "B", opening(flight(seed)));
    run(t, "khazadBypassChoice");
    t = choose(t, "bypass");
    return t.khazad!.questDeck.at(-1) === KHAZAD.up;
  });
  assert.ok(bottoms.includes(false));
  // Shadowed Corridor: each copy in play costs each player 2 threat.
  let u = board("attack", KHAZAD.down);
  const staged = make(u, K.corridor);
  u.staging.push(staged);
  u.activeLocation = make(u, K.corridor);
  const threat = u.threat;
  run(u, "khazadBypassChoice");
  assert.match(
    u.choice!.options.find((o) => o.id === "bypass")!.label,
    /Shadowed Corridor: each player raises their threat by 4/,
  );
  u = choose(u, "bypass");
  assert.equal(u.threat, threat + 4);
  assert.ok(
    [u.khazad!.activeQuest, ...u.khazad!.questDeck].includes(KHAZAD.down),
  );
  // Declining the bypass costs nothing.
  let v = board("attack");
  v.staging.push(make(v, K.corridor));
  const before = v.threat;
  run(v, "khazadBypassChoice");
  v = choose(v, v.choice!.options.find((o) => o.id !== "bypass")!.id);
  assert.deepEqual([v.threat, v.khazad!.activeQuest], [before, KHAZAD.up]);
  // Swarming Goblins: the player engaged with it puts a Goblin Spearman from
  // the discard pile into play engaged with them.
  let w = board(
    "attack",
    KHAZAD.up,
    "B",
    opening(nightmareForTwo("flight-from-moria")),
  );
  forOwner(w, 1, () => w.engaged.push(make(w, K.swarming)));
  w.encounterDiscard = [KHAZAD.spearman, MINE];
  w.staging.push(make(w, K.corridor));
  const threats = [0, 1].map((p) => seatView(w, p).threat);
  run(w, "khazadBypassChoice");
  w = choose(w, "bypass");
  assert.deepEqual(
    [0, 1].map((p) => seatView(w, p).threat),
    threats.map((t) => t + 2),
  );
  assert.deepEqual(w.encounterDiscard, [MINE]);
  assert.deepEqual(
    seatView(w, 1)
      .engaged.map((x) => x.code)
      .sort(),
    [K.swarming, KHAZAD.spearman].sort(),
  );
  assert.equal(seatView(w, 0).engaged.length, 0);
  assert.ok(valid(w));
  // With no Spearman in the discard pile, nothing happens.
  let x = board("attack");
  x.engaged.push(make(x, K.swarming));
  run(x, "khazadBypassChoice");
  x = choose(x, "bypass");
  assert.deepEqual(
    x.engaged.map((y) => y.code),
    [K.swarming],
  );
});

test("Nightmare: Abandoned Tools' Refresh Action works once each round on Escape from Darkness", () => {
  let s = board("refresh", KHAZAD.darkness);
  const hero = s.heroes[0];
  const tools = attach(s, hero, KHAZAD.tools);
  assert.equal(hooks(s).abilityOncePerRound!(s, KHAZAD.tools), true);
  s = applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: tools.id });
  assert.equal(s.progress, 1);
  s.heroes[0].exhausted = false;
  assert.throws(
    () =>
      applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: tools.id }),
    /once each round/,
  );
  // The next round, it works again.
  s.used = s.used.filter((key) => key.startsWith("game:"));
  s = applyAction(s, { type: "ABILITY", id: hero.id, attachmentId: tools.id });
  assert.equal(s.progress, 2);
  assert.ok(valid(s));
  // Another route: no limit applies (Tools only acts on Escape from Darkness).
  const t = board("refresh", KHAZAD.up);
  assert.equal(hooks(t).abilityOncePerRound!(t, KHAZAD.tools), false);
});

test("Nightmare: Ghâsh! damages each questing character, and Blocked by Flame's Nameless Fear attacks and is attacked from the staging area", () => {
  // Ghâsh!: "When Revealed: Deal 1 damage to each questing character."
  const s = board("staging", K.ghash, "A");
  const [a, b, c] = s.heroes;
  a.committed = true;
  b.committed = true;
  run(s, "khazadFlipQuest");
  assert.equal(s.khazad!.questSide, "B");
  assert.deepEqual([a.damage, b.damage, c.damage], [1, 1, 0]);
  assert.equal(khazadStageInfo(s)!.name, "Ghâsh!");
  assert.ok(valid(s));
  // 1 progress defeats Ghâsh!; it enters the victory display.
  const victory = s.victory;
  s.progress = 1;
  advanceKhazad(s);
  flush(s);
  assert.equal(s.victory, victory + 1);
  assert.ok(s.khazad!.victoryCards.includes(K.ghash));
  assert.equal(s.khazad!.questSide, "A");
  // Blocked by Flame: The Nameless Fear is considered engaged with each
  // player and characters may attack it in the staging area.
  const t = board("attack", K.flame);
  const fear = fearOf(t);
  const goblin = make(t, KHAZAD.scout);
  t.staging.push(goblin);
  assert.equal(hooks(t).consideredEngaged!(t, fear, 0), true);
  assert.equal(hooks(t).consideredEngaged!(t, goblin, 0), false);
  assert.ok(engagedEnemies(t, 0).some((u) => u.id === fear.id));
  assert.ok(attackersFor(t, fear).length > 0);
  // Not on another route.
  route(t, KHAZAD.up);
  assert.equal(hooks(t).consideredEngaged!(t, fear, 0), false);
  route(t, K.flame);
  // Two players: it attacks each of them.
  const two = board(
    "defense",
    K.flame,
    "B",
    opening(nightmareForTwo("flight-from-moria")),
  );
  const f2 = fearOf(two);
  assert.ok(
    [0, 1].every((p) => engagedEnemies(two, p).some((u) => u.id === f2.id)),
  );
  // Each attack deals and discards a new shadow card.
  let atk = board("defense", K.flame);
  atk.victory = 4;
  const f3 = fearOf(atk);
  assert.equal(stats(atk, f3).attack, 4);
  assert.ok(normalAttackPending(atk, f3, 0));
  atk = applyAction(atk, {
    type: "DEFEND",
    enemyId: f3.id,
    defenderId: atk.heroes[0].id,
  });
  assert.equal(atk.heroes[0].damage, 4 - stats(atk, atk.heroes[0]).defense);
  assert.deepEqual(fearOf(atk).shadows, []);
  assert.deepEqual(atk.encounterDiscard, [MINE]);
  assert.equal(normalAttackPending(atk, fearOf(atk), 0), false);
  assert.ok(valid(atk));
  // 10 damage: all damage is removed and the stage is defeated (Blocked by
  // Flame enters the victory display; the next route waits on side A).
  const before = t.victory;
  damage(t, fear.id, 9);
  flush(t);
  advanceKhazad(t);
  assert.deepEqual([fear.damage, t.khazad!.activeQuest], [9, K.flame]);
  damage(t, fear.id, 1);
  flush(t);
  assert.equal(fear.damage, 0);
  assert.ok(
    t.staging.some((u) => u.id === fear.id),
    "the Fear stays",
  );
  assert.equal(t.nightmare?.flameDefeated, true);
  assert.ok(valid(t));
  advanceKhazad(t);
  flush(t);
  assert.equal(t.khazad!.questSide, "A");
  assert.notEqual(t.khazad!.activeQuest, K.flame);
  assert.ok(t.khazad!.victoryCards.includes(K.flame));
  assert.equal(t.victory, before + 1);
  // The next route's flip clears the mark.
  run(t, "khazadFlipQuest");
  assert.equal(t.nightmare?.flameDefeated, undefined);
});

test("Nightmare: Pursued by Shadow takes 1 progress each round, discards 5 at the end of the round and wins the game", () => {
  const s = board("quest", K.pursued);
  progress(s, 3);
  flush(s);
  assert.equal(s.progress, 1);
  progress(s, 2);
  flush(s);
  assert.equal(s.progress, 1);
  assert.ok(valid(s));
  s.round++;
  progress(s, 4);
  flush(s);
  assert.equal(s.progress, 2);
  // Other routes take progress normally.
  const other = board("quest", KHAZAD.up);
  progress(other, 3);
  flush(other);
  assert.equal(other.progress, 3);
  // The end of the round: the discard pile is shuffled into the encounter
  // deck and the top 5 cards are discarded; each A Foe Beyond resolves.
  let t = board("refresh", K.pursued);
  t.encounterDiscard = [MINE, MINE];
  t.encounterDeck = [KHAZAD.foe, MINE, MINE];
  const effects = hooks(t).roundEnd!(t);
  assert.deepEqual(
    effects.map((e) => e.kind),
    ["nfmPursued"],
  );
  t.queue.push(...effects);
  flush(t);
  assert.equal(t.encounterDeck.length, 0);
  assert.match(t.choice!.title, /A Foe Beyond|hero/i);
  const hero = t.heroes[0];
  const attack = stats(t, fearOf(t)).attack;
  assert.ok(attack > 0);
  t = choose(t, hero.id);
  assert.equal(t.heroes[0].damage, attack);
  // A Foe Beyond returns to the discard pile once resolved.
  assert.deepEqual(
    t.encounterDiscard.slice().sort(),
    [KHAZAD.foe, MINE, MINE, MINE, MINE].sort(),
  );
  assert.ok(valid(t));
  // Not on another route.
  const u = board("refresh", KHAZAD.up);
  assert.deepEqual(hooks(u).roundEnd!(u), []);
  // 5 progress: the players win the game.
  const v = board("quest", K.pursued);
  v.progress = 5;
  advanceKhazad(v);
  assert.equal(v.status, "won");
});

test("Nightmare: Coal-Black Orc, Shadowed Corridor, Dismay and Fear and An Evil Fortune", () => {
  // Coal-Black Orc: X is the victory points in the victory display.
  const s = board("defense");
  const orc = make(s, K.coalBlack);
  s.staging.push(orc);
  s.victory = 4;
  assert.deepEqual([threatOf(s, orc), stats(s, orc).attack], [4, 4]);
  s.victory = 1;
  assert.deepEqual([threatOf(s, orc), stats(s, orc).attack], [1, 1]);
  const goblin = make(s, KHAZAD.scout);
  s.engaged.push(goblin);
  s.victory = 3;
  shadow(s, goblin, K.coalBlack, s.heroes[0]);
  assert.equal(s.combat!.attackBonus, 3);
  // Shadowed Corridor: a hero defender loses its resources; the attacker
  // gets another shadow card for each.
  const t = board("defense");
  const enemy = make(t, KHAZAD.scout);
  t.engaged.push(enemy);
  const hero = t.heroes[0];
  hero.resources = 2;
  shadow(t, enemy, K.corridor, hero);
  flush(t);
  assert.equal(hero.resources, 0);
  assert.deepEqual(enemy.shadows, [K.corridor, MINE, MINE]);
  // An ally defender (or no defender) keeps its resources.
  delete t.flow;
  const ally = make(t, "01013");
  t.allies.push(ally);
  t.heroes[1].resources = 3;
  shadow(t, enemy, K.corridor, ally);
  flush(t);
  assert.deepEqual(enemy.shadows, [K.corridor]);
  shadow(t, enemy, K.corridor);
  flush(t);
  assert.deepEqual(enemy.shadows, [K.corridor]);
  // Dismay and Fear: characters are removed from the quest until their
  // [willpower] reaches The Nameless Fear's [threat].
  let u = board("staging");
  u.victory = 3;
  const x = threatOf(u, fearOf(u));
  assert.equal(x, 3);
  for (const h of u.heroes) h.committed = true;
  u.committedIds = u.heroes.map((h) => h.id);
  // Aragorn (2) then Théodred (1): 3 [willpower].
  u = reveal(
    u,
    K.dismay,
    (v) =>
      v.choice!.options.find((o) => o.code === "01001")?.id ??
      v.choice!.options.find((o) => o.code === "01002")?.id,
  );
  assert.deepEqual(
    u.heroes.filter((h) => h.committed).map((h) => h.code),
    ["01003"],
  );
  assert.ok(u.encounterDiscard.includes(K.dismay));
  assert.ok(valid(u));
  // Dismay and Fear's shadow: the defending player's attachments costing
  // less than the Fear's [threat] are discarded (not encounter attachments).
  const w = board("defense");
  w.victory = 3;
  const foe = make(w, KHAZAD.scout);
  w.engaged.push(foe);
  const cheap = attach(w, w.heroes[0], "01026");
  const dear = attach(w, w.heroes[1], "01040");
  const condition = attach(w, w.heroes[2], KHAZAD.fear);
  shadow(w, foe, K.dismay, w.heroes[0]);
  const left = w.heroes.flatMap((h) => h.attachments.map((a) => a.id));
  assert.ok(!left.includes(cheap.id));
  assert.ok(left.includes(dear.id));
  assert.ok(left.includes(condition.id));
  // An Evil Fortune: Doomed 1 and Surge; it enters the victory display.
  let y = board("staging");
  const threat = y.threat;
  const victory = y.victory;
  y = reveal(y, K.fortune);
  assert.equal(y.threat, threat + 1);
  assert.equal(y.victory, victory + 1);
  assert.ok(y.victoryCards!.includes(K.fortune));
  assert.ok(y.khazad!.victoryCards.includes(K.fortune));
  assert.ok(!y.encounterDiscard.includes(K.fortune));
  assert.equal(y.encounterDeck.length, 9, "surge");
  assert.ok(valid(y));
  // Its shadow: an attack that destroys a character adds it to the victory
  // display.
  const z = board("defense");
  const orc2 = make(z, KHAZAD.scout);
  z.engaged.push(orc2);
  const victim = z.heroes[1];
  shadow(z, orc2, K.fortune, victim);
  assert.equal(z.nightmare?.fortune, orc2.id);
  const before = z.victory;
  damage(z, victim.id, 99, { combatDamage: true, enemyId: orc2.id });
  flush(z);
  assert.ok(!z.heroes.some((h) => h.id === victim.id));
  assert.equal(z.victory, before + 1);
  assert.deepEqual(orc2.shadows, []);
  assert.equal(z.nightmare?.fortune, undefined);
  // An attack that destroys nothing leaves it among the shadow cards.
  const q = board("defense");
  const orc3 = make(q, KHAZAD.scout);
  q.engaged.push(orc3);
  shadow(q, orc3, K.fortune, q.heroes[0]);
  damage(q, q.heroes[0].id, 1, { combatDamage: true, enemyId: orc3.id });
  hooks(q).attackFinished!(q, orc3);
  assert.equal(q.nightmare?.fortune, undefined);
  assert.deepEqual(orc3.shadows, [K.fortune]);
  assert.equal(q.victoryCards?.includes(K.fortune) ?? false, false);
});

test("Nightmare: seeded Flight from Moria games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(flight(seed));
    assert.notEqual(s.status, "playing", `flight-from-moria seed ${seed}`);
  }
  // From each new route.
  for (const code of NEW_ROUTES) {
    const t = autoplay(board("planning", code, "A", opening(flight(3))), 3000);
    assert.notEqual(t.status, "playing", card(code).back_name);
  }
  const two = autoplay(nightmareForTwo("flight-from-moria", 7), 4000);
  assert.notEqual(two.status, "playing", "two-player flight-from-moria");
});
