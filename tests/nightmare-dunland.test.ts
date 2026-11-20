import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import {
  draw,
  engagementCost,
  fx,
  make,
  stats,
  stagingThreat,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { DUNLAND_TRAP as D } from "../src/game/dunland-trap-support";
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

/** The Dunland Trap: a location with no effect while in the staging area. */
const QUIET = D.road;
const FILLER = "01022"; // a player card for the decks and hands
const ID = "the-dunland-trap";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board at stage 1 with nothing engaged and filler decks. */
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
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, {
        threat: 20,
        engaged: [],
        hand: [],
        allies: [],
        deck: Array.from({ length: 6 }, () => make(s, FILLER)),
      });
      for (const h of s.heroes)
        Object.assign(h, { damage: 0, exhausted: false, committed: false });
    });
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
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const hand = (s: GameState, n: number, p = 0) =>
  forOwner(s, p, () => {
    s.hand = Array.from({ length: n }, () => make(s, FILLER));
  });

test("Nightmare: The Dunland Trap's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.dunlandCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Dunland Trap - Nightmare", true],
  );
  // The scan lists Plains of Enedwaith, which the catalogue left out.
  assert.match(
    c.text!,
    /4x Boar Clan Warrior\n4x Hithaeglir Stream\n3x Plains of Enedwaith\n1x Dunlending Ambush\n1x Frenzied Attack\n1x Low on Provisions\n/,
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  assert.equal(c.shadow, undefined);
  assert.match(c.imagesrc!, /b42cd34e-7eb6-4163-8ef6-4a2f66f45439\.jpg$/);
  assert.match(
    c.back_imagesrc!,
    /b42cd34e-7eb6-4163-8ef6-4a2f66f45439\.B\.jpg$/,
  );
  for (const code of [N.ambusher, N.skirmisher, N.river, N.assault, N.stalked])
    assert.match(card(code).shadow!, /^Shadow: /);
  assert.match(
    card(N.plains).text!,
    /optionally engaged\.\nTravel: The first player engages the highest \[attack\] enemy/,
  );
  assert.match(
    card(N.river).text!,
    /^While Munuv Dûv River is in the staging area, it gains: "Forced:/,
  );
  assert.match(card(N.woods).text!, /cannot take damage\.\nTravel:/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Dunland Trap - Nightmare",
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

test("Nightmare: The Dunland Trap's Nightmare deck matches its source recipe", () => {
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
  const recipe = recipes.find((r) => r.id === "N04.4")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  // The recipe sets aside Chief Turch and Munuv Dûv Ravine and makes Old
  // South Road active, as the scenario's setup does.
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count([
      ...pile("sharedEncounterDeck"),
      ...pile("sharedSetAside"),
      ...pile("sharedActiveLocation"),
    ]),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.dunlandCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.dunlandCard);
    assert.ok(valid(s));
  }
  assert.equal(
    automatedScenarioId({
      name: "The Dunland Trap (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(opening(game()))[0],
    /The Dunland Trap · Nightmare mode/,
  );
});

test("Nightmare: Boar Clan Ambusher and its shadow cost a random card from hand when its attack destroys a character", () => {
  const s = board("combat");
  hand(s, 3);
  const enemy = add(s, N.ambusher, true);
  run(s, [fx("immediateAttack", { target: enemy.id, player: 0 })]);
  assert.equal(s.combat?.nmHandDiscardOnKill, 1);
  shadow(s, enemy, N.ambusher, s.heroes[0]);
  s.combat!.nmHandDiscardOnKill = 2;
  s.choice = null;
  damage(s, s.heroes[0].id, 99, { combatDamage: true, enemyId: enemy.id });
  run(s);
  assert.equal(s.hand.length, 1, "two random cards, once for each source");
  // Another character destroyed by the same attack: nothing more.
  damage(s, s.heroes[1].id, 99, { combatDamage: true, enemyId: enemy.id });
  run(s);
  assert.equal(s.hand.length, 1);
});

test("Nightmare: Boar Clan Skirmisher and Munuv Dûv River answer each draw in the scenario's draw order; their shadows wound and raise threat", () => {
  const s = board("planning");
  const skirmisher = add(s, N.skirmisher, true);
  add(s, N.river);
  draw(s, 1);
  run(s);
  assert.match(s.choice!.title, /Card draw · Choose the next Forced effect/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [N.skirmisher, N.river],
  );
  pick(s, s.choice!.options[0].id);
  run(s);
  assert.match(
    s.choice!.title,
    /Boar Clan Skirmisher · Deal 1 damage to a hero/,
  );
  pick(s, s.heroes[0].id);
  run(s);
  assert.equal(s.heroes[0].damage, 1);
  // Munuv Dûv River: the only engaged enemy is dealt a shadow card.
  assert.equal(skirmisher.shadows.length, 1);
  // Shadows: 2 damage when undefended; threat for each engaged enemy.
  const t = board("attack");
  shadow(t, add(t, N.ambusher, true), N.skirmisher);
  run(t);
  assert.match(t.choice!.title, /Deal 2 damage/);
  const u = board("attack");
  const a = add(u, N.ambusher, true);
  add(u, N.skirmisher, true);
  shadow(u, a, N.river, u.heroes[0]);
  run(u);
  assert.equal(u.threat, 22);
});

test("Nightmare: Plains of Dunland lures Dunland enemies from the staging area and its Travel cost engages the strongest enemy", () => {
  const s = board("planning");
  const plains = add(s, N.plains);
  const enemy = add(s, N.skirmisher);
  assert.equal(engagementCost(s, enemy), card(N.skirmisher).engagement! - 20);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, enemy), true);
  const strong = add(s, N.ambusher);
  run(s, hooks(s).travelEffects!(s, plains));
  assert.ok(
    s.engaged.some((u) => u.id === strong.id),
    "the 5 [attack] Ambusher",
  );
  // No enemy in the staging area: no travel.
  const t = board("travel");
  const lone = add(t, N.plains);
  assert.match(hooks(t).travelProblem!(t, lone) ?? "", /requires an enemy/);
});

test("Nightmare: Hithaeglir Woods shields staged Dunland enemies and its Travel cost deals each Dunland enemy a shadow card", () => {
  const s = board("planning");
  const woods = add(s, N.woods);
  const staged = add(s, N.skirmisher);
  const engaged = add(s, N.ambusher, true);
  damage(s, staged.id, 2);
  assert.equal(staged.damage, 0);
  damage(s, engaged.id, 2);
  assert.equal(engaged.damage, 2);
  run(s, hooks(s).travelEffects!(s, woods));
  assert.equal(staged.shadows.length, 1);
  assert.equal(engaged.shadows.length, 1);
});

test("Nightmare: Boar Clan Assault sends each engaged enemy to attack, surging when none can; its shadow strengthens the engaged enemies for the phase", () => {
  const s = board("staging");
  const a = add(s, N.ambusher, true);
  add(s, N.skirmisher, true);
  revealed(s, N.assault);
  run(s);
  assert.match(
    s.choice!.title,
    /Boar Clan Assault · Choose the next enemy to attack/,
  );
  pick(s, s.choice!.options.find((o) => o.effects[0].target === a.id)!.id);
  run(s);
  assert.equal(s.combat?.enemyId, a.id);
  assert.equal(s.nightmare?.dunlandAssault, true);
  // Nothing engaged: surge.
  const t = board("staging");
  revealed(t, N.assault);
  run(t);
  assert.match(
    t.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n"),
    /Boar Clan Assault: no attack was made; it gains surge/,
  );
  // Shadow: +1 [attack] for the engaged enemies until the phase ends.
  const u = board("combat");
  const x = add(u, N.ambusher, true);
  const y = add(u, N.skirmisher, true);
  const base = stats(u, y).attack;
  shadow(u, x, N.assault, u.heroes[0]);
  assert.equal(stats(u, y).attack, base + 1);
  u.phase = "refresh";
  assert.equal(stats(u, y).attack, base);
});

test("Nightmare: Stalked by Dunlendings draws a card each and adds the first player's hand size for the round; its shadow brings back an enemy", () => {
  const s = board("staging", opening(two()));
  hand(s, 2, 0);
  const before = stagingThreat(s);
  revealed(s, N.stalked);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).hand.length),
    [3, 1],
  );
  assert.equal(stagingThreat(s), before + 3);
  hand(s, 5, 0);
  assert.equal(stagingThreat(s), before + 5, "X follows the hand");
  hooks(s).roundEnd!(s);
  assert.equal(stagingThreat(s), before);
  // Shadow: the topmost enemy in the discard pile comes back engaged, with a shadow card.
  const t = board("attack");
  t.encounterDiscard = [N.ambusher, QUIET, N.skirmisher, QUIET];
  const attacker = add(t, N.ambusher, true);
  shadow(t, attacker, N.stalked, t.heroes[0]);
  run(t);
  const back = t.engaged.find((u: Unit) => u.code === N.skirmisher)!;
  assert.ok(back, "the topmost enemy, Boar Clan Skirmisher");
  assert.equal(back.shadows.length, 1);
  assert.deepEqual(t.encounterDiscard, [N.ambusher, QUIET, QUIET]);
});

test("Nightmare: The Dunland Trap's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "planning");
  s.nightmare = {
    dunlandAssault: false,
    dunlandBoost: [{ enemies: ["x1"], round: 1, phase: "combat" }],
    dunlandStalked: { round: 1, copies: 2 },
  };
  assert.ok(valid(s));
  s.nightmare = { dunlandStalked: { round: 1, copies: -1 } };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
