import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, damage, destroy, engage } from "../src/game/board";
import { make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { STEWARD_FEAR as SF, STREETS } from "../src/game/steward-fear-support";
import {
  NIGHTMARE_AS as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import { nightmareStewardAssassinated } from "../src/game/nightmare-steward";
import { allHeroes, forOwner, seatIndices } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  calm,
  d,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  reveal,
  shadow,
  valid,
} from "./nightmare-fixtures";

const game = (seed = 5) => nightmareGame("the-stewards-fear", seed);
const two = (seed = 5) => nightmareForTwo("the-stewards-fear", seed);
const QUIET = STREETS.cityStreet;
/** A quiet board in `phase` at stage 1: an empty staging area, threat 20, a known underworld deck. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    stage: 1,
    stageRevealing: false,
    progress: 0,
    extraActiveLocations: [],
    encounterDeck: Array(10).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    nightmare: {},
  });
  s.activeLocation = make(s, SF.sewers);
  s.stewardFear!.underneath = {};
  s.stewardFear!.underworldDeck = [STREETS.pickpocket, SF.scrap, SF.dissident];
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
const count = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );

test("Nightmare: The Steward's Fear's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.stewardCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Steward's Fear - Nightmare", true],
  );
  // Its front is the Nightmare Deck's introduction.
  assert.match(c.text!, /^Welcome to The Steward's Fear Nightmare Deck/);
  assert.equal(
    c.back_text,
    'You are playing Nightmare mode.\nSetup: Shuffle each copy of False Accusations into the underworld deck. When randomly determining which Plot is the "hidden" plot card, include the 2 new Plot cards from this Nightmare Deck, as well as the 3 Plot cards from the original scenario.\nForced: After an enemy is destroyed, shuffle it into the underworld deck if you are not at stage 3.\nForced: At the beginning of the refresh phase, if there is a Clue card in the staging area, shuffle it back into the underworld deck.',
  );
  // The scans correct the catalog's names and texts.
  assert.equal(card(N.rise).name, "Rise to Power");
  assert.equal(card(N.champion).name, "The Cabal's Champion");
  assert.equal(card(N.champion).traits, "Title.");
  assert.match(
    card(N.champion).text!,
    /^Surge\. Doomed 1\.\n.*Villain enemy.*\+1 \[defense\], and \+2 hit points/s,
  );
  assert.match(
    card(N.assassination).text!,
    /^When Revealed: Attach Assassination .*Plot attachment/,
  );
  assert.match(card(N.rath).text!, /staging area, it gains/);
  assert.match(card(N.den).text!, /^Underworld 1\.\n.*remove all tokens/s);
  assert.match(
    card(N.tunnel).text!,
    /place the top card of the underworld deck/,
  );
  assert.equal(card(N.turncoat).encounter_set_icon, "Brigands");
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health, k.traits];
  };
  assert.deepEqual(stat(N.turncoat), [20, 1, 5, 3, 4, "Brigand."]);
  assert.deepEqual(stat(N.conspirator), [40, 4, 4, 2, 4, "Brigand."]);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Steward's Fear - Nightmare",
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

test("Nightmare: The Steward's Fear's encounter and underworld decks match their source recipe, the hidden Plot among 5", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N03.4")!;
  const section = (name: string) => {
    const out: Record<string, number> = {};
    for (const c of recipe.cards)
      if (c.section === name) out[c.code] = (out[c.code] ?? 0) + c.quantity;
    return out;
  };
  for (const s of [game(), two()]) {
    const q = s.stewardFear!;
    assert.deepEqual(count(s.encounterDeck), section("sharedEncounterDeck"));
    const star = s.activeLocation!;
    assert.equal(star.code, SF.fourthStar);
    assert.deepEqual(
      count([...q.underworldDeck, ...(q.underneath[star.id] ?? [])]),
      section("sharedEncounterDeck2"),
    );
    const plots = [q.hiddenPlot!, ...q.removedHidden].filter((c) =>
      (card(c).traits ?? "").includes("Plot"),
    );
    assert.equal(plots.length, 5);
    assert.ok(plots.includes(N.rise) && plots.includes(N.assassination));
    assert.equal(nightmareCardOf(s), N.stewardCard);
    assert.match(nightmareStatus(s)[0], /hidden Plot was chosen among 5/);
  }
  assert.equal(
    automatedScenarioId({
      name: "The Steward's Fear (Nightmare)",
      mode: "nightmare",
    }),
    "the-stewards-fear",
  );
  const n = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-stewards-fear",
  });
  assert.equal(
    [n.stewardFear!.hiddenPlot!, ...n.stewardFear!.removedHidden].filter((c) =>
      (card(c).traits ?? "").includes("Plot"),
    ).length,
    3,
    "a Normal game keeps its 3 Plots",
  );
  assert.ok(valid(opening(game())));
});

test("Nightmare: a destroyed enemy is shuffled into the underworld deck before stage 3, and a staged Clue goes back at refresh", () => {
  const s = board("attack");
  const foe = add(s, STREETS.pickpocket, true);
  destroy(s, foe);
  flush(s);
  assert.equal(
    s.stewardFear!.underworldDeck.filter((c) => c === STREETS.pickpocket)
      .length,
    2,
  );
  assert.ok(!s.encounterDiscard.includes(STREETS.pickpocket));
  s.stage = 3;
  const other = add(s, STREETS.pickpocket, true);
  destroy(s, other);
  flush(s);
  assert.ok(s.encounterDiscard.includes(STREETS.pickpocket), "at stage 3");
  const t = board("refresh");
  add(t, SF.map);
  hooks(t).refreshStart!(t);
  assert.ok(!t.staging.some((u) => u.code === SF.map));
  assert.ok(t.stewardFear!.underworldDeck.includes(SF.map));
  assert.ok(valid(t));
});

test("Nightmare: Murderous Turncoat attacks the first player as it is revealed and hides under the active location after combat", () => {
  let s = board("staging");
  s = reveal(s, N.turncoat);
  assert.ok(
    JSON.stringify(s.log).includes("Murderous Turncoat attacks"),
    "its immediate attack",
  );
  const t = board("attack");
  add(t, N.turncoat, true);
  add(t, N.turncoat);
  hooks(t).combatEnd!(t);
  const a = t.activeLocation!;
  assert.deepEqual(t.stewardFear!.underneath[a.id], [N.turncoat, N.turncoat]);
  assert.equal(t.engaged.length + t.staging.length, 0);
  t.stage = 3;
  add(t, N.turncoat, true);
  hooks(t).combatEnd!(t);
  assert.equal(t.engaged.length, 1, "not at stage 3");
});

test("Nightmare: Faithless Conspirator is shielded by facedown cards under the active location, and its shadow returns the attacker", () => {
  const s = board("attack");
  const foe = add(s, N.conspirator, true);
  s.stewardFear!.underneath[s.activeLocation!.id] = [SF.scrap];
  damage(s, foe.id, 2);
  assert.equal(foe.damage, 0);
  s.stewardFear!.underneath = {};
  damage(s, foe.id, 2);
  assert.equal(foe.damage, 2);
  const t = board("defense");
  const enemy = add(t, STREETS.pickpocket, true);
  shadow(t, enemy, N.conspirator, t.heroes[0]);
  const effects = hooks(t).attackFinished!(t, t.combat!);
  t.combat = null;
  run(t, effects);
  assert.ok(t.staging.some((u) => u.id === enemy.id));
});

test("Nightmare: Rath Celerdain reveals the underworld deck's top card each encounter phase, discarding an objective", () => {
  const s = board("encounter");
  add(s, N.rath);
  s.stewardFear!.underworldDeck = [SF.scrap, STREETS.pickpocket];
  hooks(s).encounterBegin!(s);
  flush(s);
  assert.ok(s.encounterDiscard.includes(SF.scrap));
  hooks(s).encounterBegin!(s);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === STREETS.pickpocket));
});

test("Nightmare: Traitors' Den reveals a removed Plot at 4 tokens, and Rise to Power adds its resources to the quest", () => {
  const s = board("refresh");
  const den = add(s, N.den);
  s.stewardFear!.removedHidden = [N.rise, SF.daughter];
  den.resources = 3;
  run(s, hooks(s).roundEnd!(s));
  assert.equal(den.resources, 0);
  const rise = s.staging.find((u) => u.code === N.rise)!;
  assert.ok(rise, "Rise to Power is revealed");
  assert.deepEqual(s.stewardFear!.removedHidden, [SF.daughter]);
  hooks(s).roundEnd!(s);
  assert.equal(rise.resources, 2);
  s.phase = "staging";
  assert.equal(threatOf(s, rise), 2);
  s.phase = "combat" as never;
  assert.equal(threatOf(s, rise), 0, "only during the quest phase");
});

test("Nightmare: Arched Tunnel's Travel reveals its facedown cards and takes the next underworld card", () => {
  const s = board("travel");
  const tunnel = add(s, N.tunnel);
  s.stewardFear!.underneath[tunnel.id] = [STREETS.pickpocket];
  s.stewardFear!.underworldDeck = [SF.scrap];
  run(s, hooks(s).travelEffects!(s, tunnel)!);
  assert.ok(s.staging.some((u) => u.code === STREETS.pickpocket));
  assert.deepEqual(s.stewardFear!.underneath[tunnel.id], [SF.scrap]);
});

test("Nightmare: Assassination marks the costliest hero: enemies strike harder, it cannot heal, undefended damage goes to it, and its loss ends the game", () => {
  const s = board("planning");
  const plotUnit = make(s, N.assassination);
  s.staging.push(plotUnit);
  hooks(s).cardEntered!(s, plotUnit, true, false);
  flush(s);
  for (let i = 0; i < 5 && s.choice; i++) pick(s, s.choice.options[0].id);
  const hero = nightmareStewardAssassinated(s)!;
  assert.ok(hero);
  const max = Math.max(...allHeroes(s).map((h) => card(h.code).threat ?? 0));
  assert.equal(card(hero.code).threat, max);
  const foe = add(s, STREETS.pickpocket, true);
  assert.equal(
    stats(s, foe).attack,
    (card(STREETS.pickpocket).attack ?? 0) + 1,
  );
  assert.equal(hooks(s).cannotHeal!(s, hero), true);
  s.combat = { enemyId: foe.id, attackBonus: 0, attackPlayer: 0 } as never;
  hooks(s).enemyAttackStarted!(s, foe, 0);
  assert.equal(s.combat!.undefendedTargetId, hero.id);
  assert.ok(valid(s));
  s.combat = null;
  s.heroes = s.heroes.filter((h) => h.id !== hero.id);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Assassination/);
});

test("Nightmare: The Cabal's Champion joins a Villain, and False Accusations makes each player pay or its shadow returns an attacker to engage again", () => {
  const s = board("planning");
  add(s, N.champion);
  check(s);
  assert.ok(
    s.staging.some((u) => u.code === N.champion),
    "no Villain yet",
  );
  const villain = add(s, SF.daughter);
  check(s);
  assert.equal(villain.attachments.length, 1);
  assert.equal(stats(s, villain).defense, (card(SF.daughter).defense ?? 0) + 1);
  assert.equal(stats(s, villain).health, (card(SF.daughter).health ?? 0) + 2);
  assert.equal(threatOf(s, villain), (card(SF.daughter).threat ?? 0) + 1);
  // False Accusations' When Revealed.
  let t = board("staging");
  t = reveal(t, N.accusations, (x) =>
    x.choice!.options.some((o) => o.id === "threat") ? "threat" : undefined,
  );
  assert.equal(t.threat, 25);
  let u = board("staging");
  u = reveal(u, N.accusations, (x) =>
    x.choice!.options.some((o) => o.id === "exhaust") ? "exhaust" : undefined,
  );
  assert.ok(u.heroes.every((h) => h.exhausted));
  // Its shadow: back to the staging area, then engagement checks.
  const v = board("defense");
  // Murderous Turncoat: engagement cost 20.
  const enemy = add(v, N.turncoat, true);
  shadow(v, enemy, N.accusations, v.heroes[0]);
  const effects = hooks(v).attackFinished!(v, v.combat!);
  v.combat = null;
  run(v, effects);
  assert.ok(
    v.engaged.some((x) => x.id === enemy.id),
    "threat 20 engages it again",
  );
  void engage;
});

test("Nightmare: The Steward's Fear's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    assassinated: "u1",
    returns: [{ enemyId: "u2", checks: true }],
  };
  assert.ok(valid(s));
  for (const bad of [
    { assassinated: 3 },
    { returns: [{ enemyId: "u2", checks: "yes" }] },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `the-stewards-fear seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player the-stewards-fear");
  void (null as unknown as Unit);
});
