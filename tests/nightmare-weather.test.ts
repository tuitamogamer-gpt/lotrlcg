import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  check,
  damage,
  engage,
  progress,
  progressLocation,
  revealed,
} from "../src/game/board";
import {
  engagementCost,
  fx,
  make,
  stats,
  stagingThreat,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { rhosgobelHeal } from "../src/game/rhosgobel";
import { engagementCheckThreat } from "../src/game/threat-read";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import {
  WEATHER as W,
  validateWeather,
} from "../src/game/weather-hills-support";
import {
  NIGHTMARE,
  NIGHTMARE_TLR as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatView } from "../src/game/table";
import type { Effect, GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  shadow,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload } from "./weather-hills-fixtures";

const ID = "the-weather-hills";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
const SCOUT = "01016";
/** A quiet Nightmare table (the scenario's own fixture). */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
/** Resolve queued effects, answering each choice with `pick` (or the first option). */
function run(
  s: GameState,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 60, "decisions terminate");
    s = choose(reload(s), pick(s) ?? s.choice.options[0].id);
  }
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const engagedWith = (s: GameState, code: string, p = 0) => {
  const u = make(s, code);
  forOwner(s, p, () => s.engaged.push(u));
  return u;
};
const mission = (s: GameState) => s.staging.find((u) => u.code === W.mission)!;
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const villagersOf = (s: GameState, p: number) =>
  seatView(s, p).allies.filter((u) => u.code === N.villager);

test("Nightmare: The Weather Hills' setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.weatherCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Weather Hills - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Weather Hills scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Cornered Orc\n2x Sheltered Valley\n1x Concealed Orc-camp\n2x Angmar Marauder\n2x Angmar Orc\n3x Ruins of Arnor\n2x Tragic Discovery\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Shuffle each copy of Captive Villager and Rearguard Ambusher into the Orc deck.\nThe players cannot win the game while a Captive Villager is guarded by an encounter card. If a Captive Villager leaves play, the players lose the game.",
    "the scan's rules side (the catalogue had none)",
  );
  const v = card(N.villager);
  assert.deepEqual(
    [
      v.type_code,
      v.traits,
      v.willpower,
      v.attack,
      v.defense,
      v.health,
      v.quantity,
    ],
    ["objective-ally", "Bree.", 0, 0, 1, 2, 3],
  );
  const a = card(N.ambusher);
  assert.deepEqual(
    [a.engagement, a.threat, a.attack, a.defense, a.health, a.quantity],
    [17, 1, 4, 2, 4, 3],
  );
  const r = card(N.raider);
  assert.deepEqual(
    [r.engagement, r.threat, r.attack, r.defense, r.health, r.quantity],
    [44, 3, 5, 3, 5, 4],
  );
  assert.equal(
    card(N.valley).text,
    "Progress cannot be placed on Weather-torn Valley while it is in the staging area.\nWhile Weather-torn Valley is the active location, Weather cards cannot be canceled.",
    'the scan\'s "in the staging area" and hyphen',
  );
  assert.match(
    card(N.tower).text!,
    /^While Ruined Watch-tower is in the staging area/,
  );
  assert.equal(card(N.tracks).traits, "Weather.");
  assert.equal(
    card(N.tracks).shadow,
    "Shadow: Either remove 1 resource token from the Mission objective, or attacking enemy gets +3 [attack].",
  );
  assert.deepEqual(
    [card(N.track).type_code, card(N.track).quest, card(N.track).victory],
    ["encounter-side-quest", 8, 10],
  );
  assert.match(card(N.track).text!, /^Each enemy gets \+10 engagement cost/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Weather Hills - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((x) => set.some((y) => y.code === x.code)).length, 9);
});

test("Nightmare: The Weather Hills' Nightmare decks match their source recipe, with Captive Villagers and Rearguard Ambushers in the Orc deck", () => {
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
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.weatherCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N05.2")!;
  const standard = recipes.find((r) => r.id === "Q05.2")!;
  const sections = [
    "sharedEncounterDeck",
    "sharedEncounterDeck2",
    "sharedSetAside",
  ];
  const piles = nightmareEncounterDecks(
    ID,
    sections.map((x) => pile(standard, x)),
    (c) => (([N.villager, N.ambusher] as string[]).includes(c) ? 1 : 0),
  );
  sections.forEach((x, i) =>
    assert.deepEqual(count(piles[i]), count(pile(nightmare, x)), x),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.weatherCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.weatherCard);
    assert.ok(valid(s));
    assert.equal(s.encounterDeck.length, 34);
    assert.equal(s.weatherHills!.orcDeck.length, 12);
    assert.equal(
      s.weatherHills!.orcDeck.filter((c) => c === N.villager).length,
      3,
    );
    assert.ok(!s.encounterDeck.includes(W.valley), "no Sheltered Valley");
    assert.match(nightmareStatus(s)[0], /^The Weather Hills · Nightmare/);
  }
  const s = opening(game());
  s.weatherHills!.orcDeck.unshift(N.villager);
  const standardGame = JSON.parse(JSON.stringify(s)) as GameState;
  delete standardGame.nightmareMode;
  assert.equal(
    validateWeather(standardGame, () => true),
    false,
    "only a Nightmare game's Orc deck holds Captive Villagers",
  );
});

test("Nightmare: a Captive Villager revealed from the Orc deck is guarded by the next Orc card, then goes to the first player with +5 threat for engagement checks", () => {
  let s = board(2);
  s.weatherHills!.orcDeck = [N.villager, C.captain, C.marauder];
  queue(s, fx("weatherRevealOrcs", { value: 1, player: 0 }));
  s = run(s);
  const villager = s.staging.find((u) => u.code === N.villager)!;
  const guard = s.staging.find((u) => u.code === C.captain)!;
  assert.ok(villager && guard, "the villager and its guard are staged");
  assert.equal(guard.guarding, villager.id);
  assert.deepEqual(s.weatherHills!.orcDeck, [C.marauder]);
  assert.deepEqual(s.nightmare!.weatherVillagers, [villager.id]);
  assert.equal(hooks(s).cannotWin!(s), true);
  assert.match(nightmareStatus(s)[0], /1 guarded now/);
  check(s);
  assert.ok(
    s.staging.some((u) => u.id === villager.id),
    "still guarded",
  );
  // The guard leaves play: the villager is free, under the first player's control.
  s.staging = s.staging.filter((u) => u.id !== guard.id);
  check(s);
  assert.equal(villagersOf(s, 0).length, 1);
  assert.equal(hooks(s).cannotWin!(s), false);
  assert.equal(engagementCheckThreat(s, 0), seatView(s, 0).threat + 5);
  assert.equal(engagementCheckThreat(s, 1), seatView(s, 1).threat);
  // Control follows the first-player token.
  s.table!.first = 1;
  check(s);
  assert.equal(villagersOf(s, 0).length, 0);
  assert.equal(villagersOf(s, 1).length, 1);
  assert.ok(valid(s));
  // With the Orc deck empty, a villager is free at once.
  let t = board();
  t.weatherHills!.orcDeck = [];
  revealed(t, N.villager);
  t = run(t);
  check(t);
  assert.equal(villagersOf(t, 0).length, 1);
});

test("Nightmare: if a Captive Villager leaves play the players lose, and the players cannot win while one is guarded", () => {
  let s = board();
  s.weatherHills!.orcDeck = [];
  revealed(s, N.villager);
  s = run(s);
  check(s);
  const v = villagersOf(s, 0)[0];
  damage(s, v.id, 2);
  s = run(s);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Captive Villager has left play/);
  // Stage 2, 20 progress: the guarded villager holds the win.
  let t = board();
  t.stage = 2;
  mission(t).flipped = true;
  mission(t).resources = 3;
  t.weatherHills!.setAside = [];
  t.weatherHills!.orcDeck = [C.captain];
  revealed(t, N.villager);
  t = run(t);
  progress(t, 20);
  t = run(t);
  check(t);
  assert.equal(t.status, "playing");
  t.staging = t.staging.filter((u) => u.code !== C.captain);
  check(t);
  assert.equal(t.status, "won");
});

test("Nightmare: Rearguard Ambusher cannot be optionally engaged and exhausts each damaged character of the player it engages", () => {
  let s = board();
  const u = staged(s, N.ambusher);
  assert.ok(hooks(s).cannotOptionallyEngage!(s, u));
  const hurt = s.heroes[0];
  hurt.damage = 1;
  const fine = s.heroes[1];
  engage(s, u);
  s = run(s);
  assert.equal(s.heroes.find((h) => h.id === hurt.id)!.exhausted, true);
  assert.equal(s.heroes.find((h) => h.id === fine.id)!.exhausted, false);
});

test("Nightmare: Angmar Raider attacks after a character of its engaged player is healed, and its shadow gives +2 defense for the phase", () => {
  let s = board(2);
  const raider = engagedWith(s, N.raider, 1);
  const hero = seatView(s, 1).heroes[0];
  hero.damage = 2;
  forOwner(s, 1, () =>
    rhosgobelHeal(s, s.heroes[0], 1, { code: SCOUT, id: "test" } as never),
  );
  assert.ok(
    s.queue.some(
      (e) =>
        e.kind === "immediateAttack" &&
        e.target === raider.id &&
        e.player === 1,
    ),
  );
  s.queue = [];
  // Player 1's heal does not move player 2's Raider... and a heal elsewhere does not.
  seatView(s, 0).heroes[0].damage = 1;
  rhosgobelHeal(s, s.heroes[0], 1, { code: SCOUT, id: "test" } as never);
  assert.ok(!s.queue.some((e) => e.kind === "immediateAttack"));
  const other = engagedWith(s, N.raider, 0);
  s.phase = "defense";
  assert.ok(shadow(s, other, N.raider));
  assert.equal(stats(s, other).defense, 5);
  s.phase = "refresh";
  assert.equal(stats(s, other).defense, 3, "until the end of the phase");
});

test("Nightmare: Weather-torn Valley takes no progress in the staging area and keeps Weather cards from being canceled while active", () => {
  const s = board();
  const v = staged(s, N.valley);
  progressLocation(s, v, 3);
  assert.equal(v.progress, 0);
  assert.equal(hooks(s).cannotCancel!(s, false, N.tracks), false);
  s.staging = s.staging.filter((u) => u.id !== v.id);
  s.activeLocation = v;
  progressLocation(s, v, 2);
  assert.equal(v.progress, 2);
  assert.equal(hooks(s).cannotCancel!(s, false, N.tracks), true);
  assert.equal(hooks(s).cannotCancel!(s, true, W.ice), true);
  assert.equal(hooks(s).cannotCancel!(s, false, C.orc), false);
});

test("Nightmare: a staged Ruined Watch-tower has each player deal 1 damage when an Orc enemy is revealed, and gives enemies +3 defense while active", () => {
  let s = board(2);
  const tower = staged(s, N.tower);
  revealed(s, C.captain);
  s = run(s, (x) => x.choice!.options.find((o) => o.code !== undefined)?.id);
  const damaged = [0, 1].map((p) =>
    seatView(s, p).heroes.reduce((n, h) => n + h.damage, 0),
  );
  assert.deepEqual(damaged, [1, 1]);
  // Not for a non-Orc card.
  revealed(s, W.ridge);
  s = run(s);
  assert.deepEqual(
    [0, 1].map((p) => seatView(s, p).heroes.reduce((n, h) => n + h.damage, 0)),
    [1, 1],
  );
  const orc = s.staging.find((u) => u.code === C.captain)!;
  const before = stats(s, orc).defense;
  s.staging = s.staging.filter((u) => u.id !== tower.id);
  s.activeLocation = tower;
  assert.equal(stats(s, orc).defense, before + 3);
});

test("Nightmare: Rain-washed Tracks removes a Mission token or adds 8 threat for the phase, and its shadow removes a token or gives +3 attack", () => {
  let s = board();
  s.phase = "staging";
  // The round's Weather surge is already spent.
  s.weatherHills!.weatherSurgeRound = s.round;
  mission(s).resources = 2;
  const before = stagingThreat(s);
  revealed(s, N.tracks);
  flush(s);
  assert.deepEqual(options(s), ["token", "threat"]);
  s = run(choose(reload(s), "threat"));
  assert.equal(stagingThreat(s), before + 8);
  s.phase = "travel";
  assert.equal(stagingThreat(s), before, "this phase only");
  s.phase = "staging";
  revealed(s, N.tracks);
  s = run(choose(reload(flushed(s)), "token"));
  assert.equal(mission(s).resources, 1);
  // Without a token, the threat resolves alone.
  mission(s).resources = 0;
  revealed(s, N.tracks);
  s = run(s);
  assert.equal(
    s.nightmare!.weatherTracks!.filter((t) => t.round === s.round).length,
    2,
  );
  // Its shadow.
  const orc = engagedWith(s, C.orc);
  mission(s).resources = 1;
  assert.ok(shadow(s, orc, N.tracks, s.heroes[0]));
  flush(s);
  assert.deepEqual(options(s), ["token", "attack"]);
  const c = s.combat!;
  s.queue.unshift(...s.choice!.options.find((o) => o.id === "attack")!.effects);
  s.choice = null;
  flush(s);
  assert.equal(c.attackBonus, 3);
});
function flushed(s: GameState) {
  flush(s);
  return s;
}

test("Nightmare: a Captive Villager guarded by a Concealed Orc-camp is free once the camp is explored, and Rain-washed Tracks is a Weather card for the scenario", () => {
  let s = board();
  s.weatherHills!.orcDeck = [N.villager, W.orcCamp];
  queue(s, fx("weatherRevealOrcs", { value: 1, player: 0 }));
  s = run(s);
  const camp = s.staging.find((u) => u.code === W.orcCamp)!;
  const villager = s.staging.find((u) => u.code === N.villager)!;
  assert.equal(camp.guarding, villager.id);
  check(s);
  assert.equal(villagersOf(s, 0).length, 0);
  s.staging = s.staging.filter((u) => u.id !== camp.id);
  s.activeLocation = camp;
  progressLocation(s, camp, 2);
  s = run(s);
  check(s);
  assert.equal(s.activeLocation, null);
  assert.equal(villagersOf(s, 0).length, 1);
  // Rain-washed Tracks: Weathered Hilltop's token and stage 1's Weather surge.
  const hill = staged(s, W.hilltop);
  const deck = s.encounterDeck.length;
  s.phase = "staging";
  revealed(s, N.tracks);
  s = run(s);
  assert.equal(s.staging.find((u) => u.id === hill.id)!.resources, 1);
  assert.equal(s.encounterDeck.length, deck - 1, "its Weather surge");
});

test("Nightmare: Track the Orcs gives each enemy +10 engagement cost and no optional engagement, and reveals the Orc deck's top card (2 for 3 or more players)", () => {
  for (const players of [1, 3]) {
    let s = board(players);
    s.weatherHills!.orcDeck = [C.captain, C.marauder, C.captain];
    const orc = staged(s, C.orc);
    const cost = engagementCost(s, orc);
    revealed(s, N.track);
    s = run(s);
    assert.ok(s.staging.some((u) => u.code === N.track));
    assert.equal(s.weatherHills!.orcDeck.length, players >= 3 ? 1 : 2);
    const o = s.staging.find((u) => u.id === orc.id)!;
    assert.equal(engagementCost(s, o), cost + 10);
    assert.ok(hooks(s).cannotOptionallyEngage!(s, o));
  }
});

test("Nightmare: The Weather Hills' Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board();
  s.weatherHills!.orcDeck = [C.captain];
  revealed(s, N.villager);
  s = run(s);
  s.phase = "staging";
  queue(s, fx("nwhTracksThreat", { player: 0 }));
  flush(s);
  const raider = engagedWith(s, N.raider);
  s.phase = "defense";
  shadow(s, raider, N.raider);
  s.combat = null;
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.weatherVillagers = [3 as never])),
    false,
  );
  assert.equal(
    broken(
      (x) =>
        (x.nightmare!.weatherTracks = [{ round: 1, phase: "quest", value: 0 }]),
    ),
    false,
  );
  assert.equal(
    broken(
      (x) =>
        (x.nightmare!.weatherRaider = [
          { enemy: "c1", round: 99, phase: "combat" },
        ]),
    ),
    false,
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
