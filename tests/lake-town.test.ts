import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { damage, placeEncounter } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { syncAttachmentText } from "../src/game/attachment-text";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { defendersFor, forOwner, seatView } from "../src/game/table";
import {
  LAKE as L,
  LAKE_RECIPES,
  LAKE_SMAUGS,
  LAKE_TOWN_HOOKS as H,
  lakeBurnOf,
  lakeBurnTotal,
  lakeSmaug,
  lakeTownDamage,
  lakeTownPublicState,
} from "../src/game/lake-town";
import { lakeTownUnit } from "../src/game/lake-town-support";
import {
  allies,
  base,
  choose,
  deck,
  hand,
  reload,
  settle,
  smaug,
  stage,
  start,
} from "./lake-town-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";

const run = (s: GameState) => {
  flush(s);
  return s;
};
/** Queue effects so the engine's state checks run after each one. */
const play = (s: GameState, ...effects: Effect[]) => {
  s.queue.push(...effects);
  return run(s);
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const town = (s: GameState) => lakeTownUnit(s)!;
const setTown = (s: GameState, n: number) => {
  town(s).damage = n;
};
const GUARD = "01013";
const THRORS_KEY = "132016";
const reveal = (s: GameState, code: string) => {
  s.phase = "staging";
  s.encounterDeck = [code, L.west, L.west];
  handle(s, fx("reveal", { player: 0 }));
  return run(s);
};

test("Setup builds a separate Smaug deck of 9, adds Lake-town to the staging area, reveals 1 card per player, then deals 1 damage per player to Lake-town", () => {
  const recipe = LAKE_RECIPES.find((r) => r.mode === "standard")!;
  const count = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .reduce((n, c) => n + c.quantity, 0);
  assert.equal(count("sharedEncounterDeck"), 36);
  assert.equal(count("sharedEncounterDeck2"), 9);
  assert.equal(LAKE_RECIPES.length, 1, "standard recipe only");
  for (const players of [1, 2, 3, 4]) {
    const s = start(players, false, 101 + players);
    const q = s.lakeTown!;
    assert.equal(q.smaugDeck.length, 9);
    for (const code of LAKE_SMAUGS)
      assert.equal(q.smaugDeck.filter((c) => c === code).length, 3);
    assert.ok(town(s), "Lake-town is in the staging area");
    assert.equal(s.stage, 1);
    assert.equal(q.currentQuest, L.terror);
    assert.ok(
      s.log.some((l) => l.text.includes(`Lake-town takes ${players} damage`)),
      "stage 1B deals 1 damage per player",
    );
    assert.ok(lakeTownDamage(s) >= players);
    // Encounter deck: 36 minus the cards revealed during setup.
    const revealed = s.log.filter((l) => l.text.startsWith("Revealed ")).length;
    assert.ok(revealed >= players);
    assert.ok(!lakeSmaug(s), "Smaug is not in play before the first quest");
  }
  // Easy mode uses the same 46 cards.
  const easy = start(1, true, 7);
  assert.equal(easy.lakeTown!.smaugDeck.length, 9);
});

test("At the beginning of each quest phase the first player chooses where the next Smaug goes before it is revealed", () => {
  let s = base(2);
  s.lakeTown!.smaugRound = 0;
  s.phase = "planning";
  const first = s.table!.first;
  play(s, fx("startQuest", { player: first }));
  assert.match(s.choice!.title, /Where does the dragon strike/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["staging", "engaged"],
  );
  s = choose(s, "engaged");
  s = settle(s);
  const smaugUnit = lakeSmaug(s)!;
  assert.equal(smaugUnit.code, L.terrible);
  assert.ok(
    seatView(s, first).engaged.some((u) => u.id === smaugUnit.id),
    "Smaug engages the first player",
  );
  assert.equal(s.lakeTown!.smaugDeck.length, 8);
  assert.equal(s.lakeTown!.smaugRound, s.round);
  // Only once per round.
  assert.deepEqual(H.questBegin!(s), []);
  // A staging choice places the dragon in the staging area.
  let t = base();
  t.lakeTown!.smaugRound = 0;
  play(t, fx("lakeSmaugChoice", { player: 0 }));
  t = choose(t, "staging");
  t = settle(t);
  assert.ok(t.staging.some((u) => u.code === L.terrible));
});

test("The previous Smaug is discarded and its damage moves to the new one, up to the stage's limit; an empty Smaug deck is reshuffled", () => {
  let s = base();
  s.stage = 2;
  s.lakeTown!.currentQuest = L.fireWater;
  const old = smaug(s, L.mighty, 9);
  s.lakeTown!.smaugDeck = [L.terrible];
  s.lakeTown!.smaugRound = 0;
  play(s, fx("lakeSmaugReveal", { flag: false, player: 0 }));
  s = settle(s);
  assert.ok(!get(s, old.id), "the previous Smaug leaves play");
  assert.deepEqual(s.lakeTown!.smaugDiscard, [L.mighty]);
  const fresh = lakeSmaug(s)!;
  assert.equal(fresh.code, L.terrible);
  assert.equal(fresh.damage, 9);
  // The Smaug deck is empty: the discard pile becomes the new deck.
  s.round += 1;
  s.lakeTown!.smaugDiscard.push(L.magnificent);
  play(s, fx("lakeSmaugReveal", { flag: false, player: 0 }));
  s = settle(s);
  const third = lakeSmaug(s)!;
  assert.ok([L.mighty, L.magnificent].includes(third.code));
  assert.deepEqual(s.lakeTown!.smaugDiscard, [L.terrible]);
  assert.equal(
    s.lakeTown!.smaugDeck.length + s.lakeTown!.smaugDiscard.length + 1,
    3,
  );
  // Stage 1B: carried damage is limited to 6.
  let t = base();
  smaug(t, L.mighty, 6);
  t.lakeTown!.smaugDeck = [L.terrible];
  t.lakeTown!.smaugRound = 0;
  play(t, fx("lakeSmaugReveal", { flag: false, player: 0 }));
  t = settle(t);
  assert.equal(lakeSmaug(t)!.damage, 6);
});

test("Smaug the Magnificent moves 3 damage to Lake-town and his excess attack damage burns the town", () => {
  let s = base();
  s.stage = 2;
  s.lakeTown!.currentQuest = L.fireWater;
  smaug(s, L.terrible, 5);
  s.lakeTown!.smaugDeck = [L.magnificent];
  s.lakeTown!.smaugRound = 0;
  play(s, fx("lakeSmaugReveal", { flag: false, player: 0 }));
  s = settle(s);
  assert.equal(lakeSmaug(s)!.damage, 2);
  assert.equal(lakeTownDamage(s), 3);
  // Excess damage from his attack goes to Lake-town.
  let t = base();
  const m = smaug(t, L.magnificent, 0, 0);
  const defender = t.heroes[0];
  defender.damage = stats(t, defender).health - 1;
  t.phase = "defense";
  t = act(t, { type: "DEFEND", enemyId: m.id, defenderId: defender.id });
  t = settle(t);
  // 8 attack − defense; the hero had 1 hit point left.
  const def = stats(base(), base().heroes[0]).defense;
  const excess = Math.max(0, 8 - def - 1);
  assert.ok(!t.heroes.some((h) => h.id === defender.id));
  assert.equal(lakeTownDamage(t), excess);
});

test("Smaug the Mighty attacks each player when revealed, dealing a shadow card for each attack", () => {
  let s = base(2);
  s.encounterDeck = Array(10).fill(L.west);
  s.lakeTown!.smaugDeck = [L.mighty];
  s.lakeTown!.smaugRound = 0;
  play(s, fx("lakeSmaugReveal", { flag: false, player: s.table!.first }));
  const attacked: number[] = [];
  for (
    let n = 0;
    n < 60 && s.status === "playing" && (s.choice || s.flow?.pending);
    n++
  ) {
    if (s.choice?.title.includes("Immediate attack")) {
      attacked.push(s.combat!.attackPlayer!);
      assert.equal(get(s, s.combat!.enemyId)!.shadows.length, 1);
      s = choose(s, "undefended");
    } else
      s = s.flow?.pending
        ? applyAction(reload(s), {
            type: "CONTINUE",
            stepId: s.flow.pending.id,
          })
        : choose(s, s.choice!.options[0].id);
  }
  assert.deepEqual(
    attacked.sort(),
    [0, 1],
    "Smaug the Mighty attacks each player",
  );
  assert.equal(
    s.encounterDiscard.filter((c) => c === L.west).length,
    2,
    "a shadow card was dealt for each attack",
  );
});

test("Smaug the Terrible, Great House and Scorching Blast resolve burn: each player may exhaust characters to take it, and the rest burns Lake-town", () => {
  let s = base();
  const north = stage(s, L.north);
  const west = stage(s, L.west);
  assert.equal(lakeBurnOf(s, north), 3, "Burn 2 plus West Pier's Burn 1");
  assert.equal(lakeBurnOf(s, west), 1);
  assert.equal(lakeBurnTotal(s), 4);
  s.lakeTown!.smaugDeck = [L.terrible];
  s.lakeTown!.smaugRound = 0;
  play(s, fx("lakeSmaugReveal", { flag: false, player: 0 }));
  assert.match(s.choice!.title, /Burn · 4 damage to assign/);
  const hero = s.heroes[0];
  assert.ok(s.choice!.options.some((o) => o.id === hero.id));
  s = choose(s, hero.id);
  // Any amount up to the character's remaining hit points.
  assert.match(s.choice!.title, /takes how much burn damage/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["take-1", "take-2", "take-3", "take-4", "back"],
  );
  assert.match(
    s.choice!.options.find((o) => o.id === "take-4")!.label,
    stats(s, hero).health === 4 ? /destroyed/ : /^((?!destroyed).)*$/,
  );
  s = choose(s, "take-1");
  assert.ok(get(s, hero.id)!.exhausted);
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.match(s.choice!.title, /Burn · 3 damage to assign/);
  assert.ok(
    !s.choice!.options.some((o) => o.id === hero.id),
    "an exhausted character cannot take more burn",
  );
  s = choose(s, "town");
  assert.equal(lakeTownDamage(s), 3);
  // Great House does not count its own Burn when its When Revealed resolves.
  let t = base();
  stage(t, L.north);
  reveal(t, L.house);
  assert.match(t.choice!.title, /Burn · 2 damage to assign/);
  t = settle(t);
  assert.equal(lakeTownDamage(t), 2);
  // Scorching Blast as a treachery.
  let b = base();
  stage(b, L.south);
  reveal(b, L.blast);
  b = settle(b);
  assert.equal(lakeTownDamage(b), 2);
  assert.ok(b.encounterDiscard.includes(L.blast));
  // In a multiplayer game each player may take part of it.
  let m = base(2);
  stage(m, L.house);
  play(m, fx("lakeBurn", { player: m.table!.first }));
  const first = m.table!.first;
  assert.match(m.choice!.title, /Burn · 3 damage/);
  const h0 = seatView(m, first).heroes[0];
  m = choose(m, h0.id);
  m = choose(m, "take-1");
  m = choose(m, "town");
  assert.match(m.choice!.title, /Burn · 2 damage/);
  const h1 = seatView(m, 1 - first).heroes[0];
  m = choose(m, h1.id);
  m = choose(m, "back");
  assert.match(m.choice!.title, /Burn · 2 damage/, "back to the characters");
  m = choose(m, h1.id);
  m = choose(m, "take-2");
  assert.equal(lakeTownDamage(m), 0);
  assert.equal(get(m, h1.id)!.damage, 2);
});

test("Town-Baiting: Smaug attacks Lake-town, the last player may defend, undefended and excess damage burns the town, and it cannot be canceled", () => {
  // Undefended: Smaug the Terrible's 7 attack burns Lake-town.
  let s = base();
  const terrible = smaug(s, L.terrible);
  assert.equal(H.cannotCancel!(s, false, L.baiting), true);
  assert.equal(H.cannotCancel!(s, true, L.baiting), false);
  reveal(s, L.baiting);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.combat!.enemyId, terrible.id);
  s = choose(s, "undefended");
  s = settle(s);
  assert.equal(lakeTownDamage(s), 7);
  assert.ok(
    s.heroes.every((h) => h.damage === 0),
    "no hero takes damage",
  );
  assert.ok(s.encounterDiscard.includes(L.baiting));
  // Defended: excess damage beyond the defender's hit points burns the town.
  let t = base();
  smaug(t, L.terrible);
  const hero = t.heroes[0];
  const left = 2;
  hero.damage = stats(t, hero).health - left;
  const amount = 7 - stats(t, hero).defense;
  reveal(t, L.baiting);
  t = choose(t, hero.id);
  t = settle(t);
  assert.ok(!t.heroes.some((h) => h.id === hero.id));
  assert.equal(lakeTownDamage(t), amount - left);
  // The last player declares the defender in a multiplayer game.
  let m = base(3);
  smaug(m, L.mighty);
  m.phase = "staging";
  m.encounterDeck = [L.baiting, L.west, L.west];
  handle(m, fx("reveal", { player: m.table!.first }));
  run(m);
  const last = (m.table!.first + 2) % 3;
  assert.equal(m.combat!.attackPlayer, last);
  m = settle(choose(m, "undefended"));
  assert.equal(lakeTownDamage(m), 5);
  // Without Smaug in play nothing happens.
  let n = base();
  reveal(n, L.baiting);
  n = settle(n);
  assert.equal(lakeTownDamage(n), 0);
});

test("Reckless in His Rage: Smaug gets +2 threat, +2 attack and −2 defense and allies cannot defend against him until the end of the round", () => {
  let s = base();
  const terrible = smaug(s, L.terrible, 0, 0);
  const [guard] = allies(s, [GUARD]);
  const before = {
    threat: threatOf(s, terrible),
    attack: stats(s, terrible).attack,
    defense: stats(s, terrible).defense,
  };
  assert.ok(defendersFor(s, terrible).some((u) => u.id === guard.id));
  reveal(s, L.reckless);
  s = settle(s);
  const u = get(s, terrible.id)!;
  assert.equal(threatOf(s, u), before.threat + 2);
  assert.equal(stats(s, u).attack, before.attack + 2);
  assert.equal(stats(s, u).defense, before.defense - 2);
  assert.ok(!defendersFor(s, u).some((d) => d.id === guard.id));
  assert.ok(defendersFor(s, u).some((d) => d.id === s.heroes[0].id));
  // Two copies stack.
  reveal(s, L.reckless);
  s = settle(s);
  assert.equal(stats(s, get(s, terrible.id)!).attack, before.attack + 4);
  // The effect ends with the round.
  s.round += 1;
  assert.equal(stats(s, get(s, terrible.id)!).attack, before.attack);
  assert.ok(
    defendersFor(s, get(s, terrible.id)!).some((d) => d.id === guard.id),
  );
  // Without Smaug in play the treachery has no effect.
  let t = base();
  reveal(t, L.reckless);
  t = settle(t);
  assert.equal(t.lakeTown!.reckless.count, 0);
});

test("Catching Fire shuffles a Pier from the victory display back into the encounter deck, or gains surge; its shadow gives the defender −2 defense", () => {
  let s = base();
  s.victoryCards = [L.north, L.house];
  s.victory = card(L.north).victory! + card(L.house).victory!;
  reveal(s, L.catching);
  assert.match(s.choice!.title, /Catching Fire/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [L.north],
    "only Pier locations",
  );
  s = settle(choose(s, L.north));
  assert.deepEqual(s.victoryCards, [L.house]);
  assert.equal(s.victory, card(L.house).victory);
  assert.ok(s.encounterDeck.includes(L.north));
  assert.ok(s.encounterDiscard.includes(L.catching));
  // No Pier in the victory display: surge reveals another card.
  let t = base();
  t.phase = "staging";
  t.encounterDeck = [L.catching, L.south, L.west];
  handle(t, fx("reveal", { player: 0 }));
  run(t);
  t = settle(t);
  assert.ok(
    t.staging.some((u) => u.code === L.south),
    "surge",
  );
  // Shadow: the defending character gets −2 defense.
  let c = base();
  const mighty = smaug(c, L.mighty, 0, 0);
  mighty.shadows = [L.catching];
  const hero = c.heroes[0];
  const def = stats(c, hero).defense;
  c.phase = "defense";
  c = act(c, { type: "DEFEND", enemyId: mighty.id, defenderId: hero.id });
  c = settle(c);
  assert.equal(def, 2);
  assert.ok(
    !get(c, hero.id),
    "5 attack against 0 defense destroys the 5 hit point defender",
  );
});

test("Close to the Flame deals 1 damage to each character; as a shadow any player may discard a hero to cancel it", () => {
  let s = base(2);
  allies(s, [GUARD], 0);
  reveal(s, L.close);
  s = settle(s);
  for (const p of [0, 1])
    for (const u of [...seatView(s, p).heroes, ...seatView(s, p).allies])
      assert.equal(u.damage, 1, `${u.code} takes 1 damage`);
  // Shadow: resolve the effect, or a player discards a hero to cancel it.
  let t = base(2);
  const first = t.table!.first;
  const mighty = smaug(t, L.mighty, 0, first);
  mighty.shadows = [L.close];
  t.phase = "defense";
  const defender = seatView(t, first).heroes[0];
  t = act(t, { type: "DEFEND", enemyId: mighty.id, defenderId: defender.id });
  for (
    let n = 0;
    n < 20 && !t.choice?.title.includes("Close to the Flame");
    n++
  )
    t = t.flow?.pending
      ? applyAction(reload(t), { type: "CONTINUE", stepId: t.flow.pending.id })
      : choose(t, t.choice!.options[0].id);
  assert.match(t.choice!.title, /Close to the Flame · Shadow effect/);
  const sacrifice = seatView(t, 1 - first).heroes[2];
  assert.ok(t.choice!.options.some((o) => o.id === `discard-${sacrifice.id}`));
  t = choose(t, `discard-${sacrifice.id}`);
  t = settle(t);
  assert.ok(!get(t, sacrifice.id), "the hero is discarded");
  assert.ok(
    seatView(t, 1 - first).heroes.every((h) => h.damage === 0),
    "the shadow effect is canceled",
  );
  // Resolving it damages every character in play.
  let r = base();
  const m2 = smaug(r, L.mighty, 0, 0);
  m2.shadows = [L.close];
  r.phase = "defense";
  r = act(r, { type: "DEFEND", enemyId: m2.id, defenderId: r.heroes[0].id });
  r = settle(r, "resolve");
  assert.equal(get(r, r.heroes[1].id)!.damage, 1);
  assert.equal(get(r, r.heroes[2].id)!.damage, 1);
});

test("Dire Magnificence: each player discards an ally or Lake-town takes 2 damage; its shadow sends Smaug on to the next player after a kill", () => {
  let s = base(2);
  const first = s.table!.first;
  const [guard] = allies(s, [GUARD, GUARD], first);
  reveal(s, L.dire);
  assert.match(s.choice!.title, /Dire Magnificence · Discard an ally/);
  s = choose(s, guard.id);
  s = settle(s);
  assert.ok(!get(s, guard.id));
  assert.equal(seatView(s, first).allies.length, 1);
  assert.equal(lakeTownDamage(s), 2, "the other player has no ally");
  // Shadow: if this attack destroys a character, Smaug engages the next player and attacks.
  let t = base(2);
  const p0 = t.table!.first,
    p1 = 1 - p0;
  const mighty = smaug(t, L.mighty, 0, p0);
  mighty.shadows = [L.dire];
  const victim = seatView(t, p0).heroes[0];
  victim.damage = stats(t, victim).health - 1;
  t.phase = "defense";
  t = act(t, { type: "DEFEND", enemyId: mighty.id, defenderId: victim.id });
  for (let n = 0; n < 40 && !t.choice?.title.includes("Immediate attack"); n++)
    t = t.flow?.pending
      ? applyAction(reload(t), { type: "CONTINUE", stepId: t.flow.pending.id })
      : choose(t, t.choice!.options[0].id);
  assert.ok(!get(t, victim.id), "the defender is destroyed");
  assert.ok(seatView(t, p1).engaged.some((u) => u.id === mighty.id));
  assert.equal(t.combat!.attackPlayer, p1);
  // Solo: there is no next player.
  let solo = base();
  const m = smaug(solo, L.mighty, 0, 0);
  m.shadows = [L.dire];
  const v = solo.heroes[0];
  v.damage = stats(solo, v).health - 1;
  solo.phase = "defense";
  solo = act(solo, { type: "DEFEND", enemyId: m.id, defenderId: v.id });
  solo = settle(solo);
  assert.ok(!solo.choice);
  assert.ok(solo.engaged.some((u) => u.id === m.id));
});

test("Scorching Blast's shadow resolves burn unless a player discards a hero; Reckless in His Rage's shadow resolves burn after a kill", () => {
  let s = base();
  stage(s, L.north);
  const m = smaug(s, L.mighty, 0, 0);
  m.shadows = [L.blast];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: m.id, defenderId: s.heroes[0].id });
  s = settle(s, "resolve");
  assert.equal(lakeTownDamage(s), 2);
  // Reckless shadow: only if the attack destroys a character.
  for (const kill of [true, false]) {
    let t = base();
    stage(t, L.north);
    const mighty = smaug(t, L.mighty, 0, 0);
    mighty.shadows = [L.reckless];
    const hero = t.heroes[0];
    if (kill) hero.damage = stats(t, hero).health - 1;
    t.phase = "defense";
    t = act(t, { type: "DEFEND", enemyId: mighty.id, defenderId: hero.id });
    t = settle(t);
    assert.equal(lakeTownDamage(t), kill ? 2 : 0);
  }
});

test("Esgaroth Wharf makes locations immune and its shadow gives +2 attack and an additional attack; East Pier stops When Revealed cancels", () => {
  const s = base();
  const north = stage(s, L.north);
  assert.equal(H.immune!(s, north), false);
  const wharf = stage(s, L.wharf);
  assert.equal(H.immune!(s, north), true);
  assert.equal(H.immune!(s, wharf), true);
  assert.equal(H.immune!(s, town(s)), false, "objectives are not locations");
  syncAttachmentText(s);
  assert.equal(
    playerEffectImmune(s, north, THRORS_KEY),
    true,
    "Thrór's Key cannot attach to an immune location",
  );
  wharf.blanked = true;
  assert.equal(H.immune!(s, north), false);
  // East Pier: encounter When Revealed effects cannot be canceled, shadows can.
  assert.equal(H.cannotCancel!(s, false, L.close), false);
  stage(s, L.east);
  assert.equal(H.cannotCancel!(s, false, L.close), true);
  assert.equal(H.cannotCancel!(s, true), false);
  // Wharf shadow: +2 attack, then another attack.
  let t = base();
  const mighty = smaug(t, L.mighty, 0, 0);
  mighty.shadows = [L.wharf];
  t.encounterDeck = Array(5).fill(L.west);
  const defender = t.heroes[1];
  t.phase = "defense";
  t = act(t, { type: "DEFEND", enemyId: mighty.id, defenderId: defender.id });
  let attacks = 0;
  for (
    let n = 0;
    n < 40 && t.status === "playing" && (t.choice || t.flow?.pending);
    n++
  ) {
    if (t.choice?.title.includes("Immediate attack")) {
      attacks++;
      t = choose(t, "undefended");
    } else
      t = t.flow?.pending
        ? applyAction(reload(t), {
            type: "CONTINUE",
            stepId: t.flow.pending.id,
          })
        : choose(t, t.choice!.options[0].id);
  }
  assert.equal(attacks, 1, "one additional attack");
  assert.ok(
    t.log.some((l) => /Smaug the Mighty attacks for 7 −/.test(l.text)),
    "5 attack + 2",
  );
});

test("Fisherman's Dock: its shadow adds it to the staging area, and the players may exhaust a hero to travel there as a second active location", () => {
  let s = base();
  const mighty = smaug(s, L.mighty, 0, 0);
  mighty.shadows = [L.dock];
  s.phase = "defense";
  s = act(s, {
    type: "DEFEND",
    enemyId: mighty.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === L.dock));
  assert.ok(!s.encounterDiscard.includes(L.dock));
  // Travel as a second active location by exhausting a hero.
  let t = base();
  t.activeLocation = make(t, L.west);
  const dock = stage(t, L.dock);
  t.phase = "travel";
  assert.equal(canTravel(t, dock), null);
  t = act(t, { type: "TRAVEL", id: dock.id });
  assert.match(t.choice!.title, /Fisherman's Dock · Exhaust a hero/);
  const hero = t.heroes[2];
  t = choose(t, hero.id);
  t = settle(t);
  assert.deepEqual(
    [t.activeLocation!, ...t.extraActiveLocations!].map((u) => u.code).sort(),
    [L.dock, L.west].sort(),
    "there are now 2 active locations",
  );
  assert.ok(get(t, hero.id)!.exhausted);
  // Without a ready hero the Dock cannot become a second active location.
  const u = base();
  u.activeLocation = make(u, L.west);
  const d2 = stage(u, L.dock);
  for (const h of u.heroes) h.exhausted = true;
  u.phase = "travel";
  assert.match(canTravel(u, d2) ?? "", /exhaust a hero/);
  // With no active location it is an ordinary travel.
  let v = base();
  const d3 = stage(v, L.dock);
  v.phase = "travel";
  v = settle(act(v, { type: "TRAVEL", id: d3.id }));
  assert.equal(v.activeLocation!.id, d3.id);
  assert.ok(v.heroes.every((h) => !h.exhausted));
});

test("Great Bridge discards X cards from each player's deck, X being Lake-town's damage, and gains surge if none are discarded", () => {
  let s = base(2);
  setTown(s, 3);
  deck(s, ["01013", "01013", "01013", "01013"], 0);
  deck(s, ["01013", "01013"], 1);
  reveal(s, L.bridge);
  s = settle(s);
  assert.equal(seatView(s, 0).deck.length, 1);
  assert.equal(seatView(s, 1).deck.length, 0);
  assert.equal(seatView(s, 0).discard.length, 3);
  assert.equal(seatView(s, 1).discard.length, 2);
  // No damage on Lake-town: nothing is discarded and it gains surge.
  let t = base();
  t.phase = "staging";
  t.encounterDeck = [L.bridge, L.south, L.west];
  deck(t, ["01013"], 0);
  handle(t, fx("reveal", { player: 0 }));
  run(t);
  t = settle(t);
  assert.ok(
    t.staging.some((u) => u.code === L.south),
    "surge",
  );
  assert.equal(t.deck.length, 1);
});

test("Merchant's District: its shadow burns Lake-town for 1 (4 if undefended); its Travel Action deals 2 damage per player to add it to the victory display", () => {
  for (const undefended of [false, true]) {
    let s = base();
    const mighty = smaug(s, L.mighty, 0, 0);
    mighty.shadows = [L.merchant];
    s.phase = "defense";
    s = act(s, {
      type: "DEFEND",
      enemyId: mighty.id,
      defenderId: undefended ? null : s.heroes[0].id,
    });
    s = settle(s);
    assert.equal(lakeTownDamage(s), undefended ? 4 : 1);
  }
  let t = base(2);
  const district = stage(t, L.merchant);
  t.phase = "planning";
  assert.equal(availableAbilities(t, district)[0]?.disabled, true);
  t.phase = "travel";
  assert.equal(availableAbilities(t, district)[0]?.disabled, false);
  t = act(t, { type: "ABILITY", id: district.id });
  t = settle(t);
  assert.equal(lakeTownDamage(t), 4);
  assert.ok(!t.staging.some((u) => u.id === district.id));
  assert.deepEqual(t.victoryCards, [L.merchant]);
  assert.equal(t.victory, 3);
  // As the active location.
  let a = base();
  a.activeLocation = make(a, L.merchant);
  a.phase = "travel";
  a = settle(act(a, { type: "ABILITY", id: a.activeLocation.id }));
  assert.equal(a.activeLocation, null);
  assert.deepEqual(a.victoryCards, [L.merchant]);
  assert.equal(lakeTownDamage(a), 2);
});

test("North Pier: Smaug cannot be damaged. South Pier: the players cannot travel to other locations", () => {
  const s = base();
  s.stage = 3;
  s.lakeTown!.currentQuest = L.wrath;
  const terrible = smaug(s, L.terrible);
  damage(s, terrible.id, 3);
  assert.equal(terrible.damage, 3);
  stage(s, L.north);
  damage(s, terrible.id, 3);
  assert.equal(terrible.damage, 3, "North Pier prevents the damage");
  // South Pier.
  const t = base();
  const south = stage(t, L.south);
  const west = stage(t, L.west);
  t.phase = "travel";
  assert.match(canTravel(t, west) ?? "", /South Pier/);
  assert.equal(canTravel(t, south), null);
  south.blanked = true;
  assert.equal(canTravel(t, west), null);
});

test("The Master's Manor moves all of Smaug's damage to Lake-town; its shadow makes the defending player discard their hand after a kill", () => {
  let s = base();
  s.stage = 2;
  s.lakeTown!.currentQuest = L.fireWater;
  smaug(s, L.terrible, 11);
  reveal(s, L.manor);
  s = settle(s);
  assert.equal(lakeSmaug(s)!.damage, 0);
  assert.equal(lakeTownDamage(s), 11);
  for (const kill of [true, false]) {
    let t = base();
    hand(t, [GUARD, GUARD]);
    const mighty = smaug(t, L.mighty, 0, 0);
    mighty.shadows = [L.manor];
    const hero = t.heroes[0];
    if (kill) hero.damage = stats(t, hero).health - 1;
    t.phase = "defense";
    t = act(t, { type: "DEFEND", enemyId: mighty.id, defenderId: hero.id });
    t = settle(t);
    assert.equal(t.hand.length, kill ? 0 : 2);
  }
});

test("Lake-town burns at 50 damage and the players lose", () => {
  let s = base();
  setTown(s, 48);
  play(s, fx("lakeTownDamage", { value: 2, text: "Test", player: 0 }));
  assert.equal(s.status, "lost");
  assert.match(s.reason ?? "", /Lake-town has completely burned/);
  // Burn that the players do not take counts as well.
  let t = base();
  setTown(t, 47);
  stage(t, L.house);
  play(t, fx("lakeBurn", { player: 0 }));
  t = settle(t, "town");
  assert.equal(t.status, "lost");
});

test("The Old Thrush is Guarded; a hero exhausts to claim it, then discards X cards after exhausting to attack Smaug to reduce his defense by X", () => {
  let s = base();
  s.phase = "staging";
  s.encounterDeck = [L.thrush, L.south, L.west];
  handle(s, fx("reveal", { player: 0 }));
  run(s);
  s = settle(s);
  const thrush = s.staging.find((u) => u.code === L.thrush)!;
  const guard = s.staging.find((u) => u.code === L.south)!;
  assert.equal(guard.guarding, thrush.id, "Guarded: the next card guards it");
  assert.equal(H.claimableObjective!(s, thrush), true);
  s.phase = "planning";
  assert.throws(() =>
    applyAction(reload(s), {
      type: "CLAIM",
      id: thrush.id,
      heroId: s.heroes[0].id,
    }),
  );
  // Free of encounters: exhaust a hero to claim it. No threat is raised.
  s.staging = s.staging.filter((u) => u.id !== guard.id);
  const hero = s.heroes[0];
  s.heroes[1].exhausted = true;
  assert.throws(
    () =>
      applyAction(reload(s), {
        type: "CLAIM",
        id: thrush.id,
        heroId: s.heroes[1].id,
      }),
    /ready hero/,
  );
  s = act(s, { type: "CLAIM", id: thrush.id, heroId: hero.id });
  assert.ok(get(s, hero.id)!.exhausted);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === L.thrush));
  assert.ok(!s.staging.some((u) => u.code === L.thrush));
  assert.equal(s.threat, 20);
  // Response after the attached hero exhausts to attack Smaug at stage 3.
  s.stage = 3;
  s.lakeTown!.currentQuest = L.wrath;
  const terrible = smaug(s, L.terrible, 0, 0);
  hand(s, [GUARD, GUARD, GUARD]);
  for (const h of s.heroes) h.exhausted = false;
  s.phase = "attack";
  const attackers = [hero.id];
  s = act(s, { type: "ATTACK", enemyId: terrible.id, attackerIds: attackers });
  assert.match(s.choice!.title, /The Old Thrush/);
  s = choose(s, "use");
  s = choose(s, s.choice!.options[0].id);
  assert.equal(stats(s, get(s, terrible.id)!).defense, 7 - 1);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(stats(s, get(s, terrible.id)!).defense, 7 - 2);
  s = choose(s, "done");
  s = settle(s);
  const attack = stats(s, get(s, hero.id)!).attack;
  assert.equal(get(s, terrible.id)!.damage, Math.max(0, attack - 5));
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 2);
  assert.equal(
    stats(s, get(s, terrible.id)!).defense,
    7,
    "the reduction lasts for this attack only",
  );
  assert.equal(s.lakeTown!.thrush, null);
});

test("Stage 1B and 2B limit Smaug's damage to 6 and 12; at stage 3B he can be damaged and defeated", () => {
  const s = base();
  const terrible = smaug(s, L.terrible, 4);
  damage(s, terrible.id, 5);
  assert.equal(terrible.damage, 6);
  assert.equal(lakeTownPublicState(s)!.smaugCap, 6);
  s.stage = 2;
  s.lakeTown!.currentQuest = L.fireWater;
  damage(s, terrible.id, 10);
  assert.equal(terrible.damage, 12);
  s.stage = 3;
  s.lakeTown!.currentQuest = L.wrath;
  assert.equal(lakeTownPublicState(s)!.smaugCap, null);
  damage(s, terrible.id, 5);
  assert.equal(terrible.damage, 17);
});

test("The players advance from 1B to 2B to 3B; Fire and Water lets them discard progress to remove damage from Lake-town", () => {
  let s = base();
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 14, player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.lakeTown!.currentQuest, L.fireWater);
  assert.equal(s.progress, 0);
  // 2B: progress that would be placed on the quest may remove damage instead.
  setTown(s, 5);
  const active = make(s, L.west);
  s.activeLocation = active;
  s.phase = "quest";
  s.lastQuest = { will: 9, threat: 2, net: 7, stat: "will" };
  play(s, fx("questSucceeded", { value: 7, player: 0 }));
  assert.match(s.choice!.title, /Fire and Water · Douse the flames/);
  // West Pier takes the first 2 progress, so up to 5 could reach the quest.
  const max = Math.min(7 - (card(L.west).quest ?? 0), 5);
  assert.equal(s.choice!.options[0].id, `convert-${max}`);
  s = choose(s, "convert-2");
  s = settle(s);
  assert.equal(lakeTownDamage(s), 3);
  assert.equal(s.progress, 7 - 2 - (card(L.west).quest ?? 0));
  // Then 2B is defeated with 10 progress.
  s.progress = 9;
  s.activeLocation = null;
  setTown(s, 0);
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 1, player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.lakeTown!.currentQuest, L.wrath);
  // 3B has no quest points: progress never advances past it.
  s.phase = "quest";
  handle(s, fx("successfulQuestProgress", { value: 30, player: 0 }));
  run(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.status, "playing");
});

test("The Dragon's Wrath reveals 1 additional card during the quest phase and its Refresh Action resets the quest deck to 2B", () => {
  let s = base();
  assert.equal(H.extraStagingReveals!(s), 0);
  s.stage = 3;
  s.lakeTown!.currentQuest = L.wrath;
  assert.equal(H.extraStagingReveals!(s), 1);
  const terrible = smaug(s, L.terrible, 15);
  const quest = get(s, `quest:${L.wrath}`)!;
  assert.match(H.abilityLabel!(L.wrath) ?? "", /Refresh Action/);
  s.phase = "planning";
  assert.equal(availableAbilities(s, quest)[0]?.disabled, true);
  s.phase = "refresh";
  assert.equal(availableAbilities(s, quest)[0]?.disabled, false);
  s = act(s, { type: "ABILITY", id: quest.id });
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.lakeTown!.currentQuest, L.fireWater);
  assert.equal(s.progress, 0);
  assert.equal(get(s, terrible.id)!.damage, 12, "2B's limit applies at once");
  assert.equal(
    get(s, `quest:${L.fireWater}`)
      ? availableAbilities(s, get(s, `quest:${L.fireWater}`)!).length
      : 0,
    0,
    "Fire and Water has no action",
  );
  s = reload(s);
  assert.equal(s.stage, 2);
});

test("At 3B, defeating Smaug wins only if the victory display outweighs Lake-town's damage", () => {
  for (const [vp, burned, result] of [
    [10, 9, "won"],
    [9, 9, "lost"],
    [4, 12, "lost"],
  ] as const) {
    let s = base();
    s.stage = 3;
    s.lakeTown!.currentQuest = L.wrath;
    s.victory = vp;
    s.victoryCards = [];
    setTown(s, burned);
    const terrible = smaug(s, L.terrible, 19);
    play(s, fx("damage", { target: terrible.id, value: 1, player: 0 }));
    s = settle(s);
    assert.equal(s.status, result, `${vp} VP against ${burned} damage`);
    if (result === "lost") assert.match(s.reason ?? "", /Lake-town has burned/);
  }
});

test("Saves keep the Smaug deck, the treacheries in flight and the Old Thrush; malformed Lake-town state is rejected", () => {
  let s = base(2);
  smaug(s, L.mighty, 4);
  s.lakeTown!.smaugDiscard = [L.terrible];
  s.lakeTown!.reckless = { round: s.round, count: 1 };
  setTown(s, 9);
  s = reload(s);
  assert.equal(lakeSmaug(s)!.damage, 4);
  assert.equal(lakeTownDamage(s), 9);
  assert.deepEqual(s.lakeTown!.smaugDiscard, [L.terrible]);
  assert.equal(lakeTownPublicState(s)!.reckless, 1);
  const raw = () => JSON.parse(JSON.stringify(s));
  const bad = (mutate: (x: GameState) => void, why: string) => {
    const x = raw();
    mutate(x);
    assert.equal(validateSave(x), false, why);
  };
  assert.equal(
    validateSave(Object.assign(raw(), { lakeTown: undefined })),
    false,
    "the scenario state is required",
  );
  bad((x) => (x.lakeTown!.smaugDeck = [L.house]), "only Smaugs");
  bad(
    (x) => (x.lakeTown!.smaugDeck = Array(10).fill(L.mighty)),
    "at most 9 Smaugs",
  );
  bad((x) => (x.lakeTown!.currentQuest = L.wrath), "quest matches stage");
  bad((x) => (x.lakeTown!.smaugRound = x.round + 1), "future round");
  bad(
    (x) => (x.lakeTown!.thrush = { enemyId: 3, value: 1 } as never),
    "thrush shape",
  );
  bad((x) => (x.lakeTown!.resolving = [{ id: 1 }] as never), "units");
  // A treachery waiting on a choice is held physically and survives a reload.
  let t = base();
  allies(t, [GUARD]);
  reveal(t, L.dire);
  assert.match(t.choice!.title, /Dire Magnificence/);
  assert.deepEqual(
    t.lakeTown!.resolving.map((u) => u.code),
    [L.dire],
  );
  t = reload(t);
  assert.deepEqual(
    t.lakeTown!.resolving.map((u) => u.code),
    [L.dire],
  );
  t = settle(t);
  assert.deepEqual(t.lakeTown!.resolving, []);
  assert.deepEqual(t.encounterDiscard, [L.dire]);
  // The Old Thrush attached to a hero.
  let a = base();
  const thrush = stage(a, L.thrush);
  a = act(a, { type: "CLAIM", id: thrush.id, heroId: a.heroes[0].id });
  a = reload(a);
  assert.ok(a.heroes[0].attachments.some((x) => x.code === L.thrush));
});

test("The scenario panel's public state reports Lake-town's damage, victory points, burn, Smaug and his deck", () => {
  const s = base();
  setTown(s, 7);
  s.victory = 4;
  stage(s, L.north);
  stage(s, L.west);
  smaug(s, L.magnificent, 5);
  s.lakeTown!.smaugDiscard = [L.mighty];
  const q = lakeTownPublicState(s)!;
  assert.equal(q.townDamage, 7);
  assert.equal(q.townLimit, 50);
  assert.equal(q.victory, 4);
  assert.equal(q.burn, 4);
  assert.equal(q.smaug!.code, L.magnificent);
  assert.equal(q.smaug!.damage, 5);
  assert.equal(q.smaugCap, 6);
  assert.equal(q.smaugDeck, 8);
  assert.deepEqual(q.smaugDiscard, [L.mighty]);
});
