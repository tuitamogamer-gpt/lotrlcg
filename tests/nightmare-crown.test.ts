import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  damage,
  discardLocation,
  progressLocation,
  revealed,
} from "../src/game/board";
import { fx, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  ANTLERED as A,
  RAVEN_CODES,
  printedLocationTime,
} from "../src/game/antlered-support";
import { scenario } from "../src/game/scenarios";
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
  d,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";

const ID = "the-antlered-crown";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A Raven deck enemy without a When Revealed or engagement effect. */
const BANDIT = RAVEN_CODES.find((c) => card(c).name === "Dunlending Bandit")!;
/** The Antlered Crown: a location whose only effect is its Time effect. */
const QUIET = A.country;
/** A quiet board on stage 1: nothing in the staging area, no active location, Bandits atop the Raven deck. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    stage: 1,
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    staging: [],
  });
  Object.assign(s.antlered!, {
    ravenDeck: Array(6).fill(BANDIT),
    ravenDiscard: [],
    time: 3,
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [] });
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
/** A location in the staging area (or active) with the given time counters. */
function place(
  s: GameState,
  code: string,
  time = printedLocationTime(code),
  active = false,
) {
  const u = make(s, code);
  u.timeCounters = time;
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
/** An enemy in the staging area, or engaged with a player. */
function enemy(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  if (player === undefined) s.staging.push(u);
  else forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function run(s: GameState) {
  for (let i = 0; i < 60; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
/** Order simultaneous Forced effects (the first offered first). */
function settle(s: GameState) {
  for (
    let i = 0;
    i < 12 && s.choice && /^Choose the next|Forced/.test(s.choice.title);
    i++
  ) {
    pick(s, s.choice.options[0].id);
    run(s);
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const logText = (s: GameState) =>
  s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
const draw = (s: GameState, player: number, value = 1) => {
  s.queue.unshift(fx("draw", { value, player }));
  return settle(run(s));
};
const handOf = (s: GameState, player: number) => seatView(s, player).hand;
const codes = (units: Unit[]) => units.map((u) => u.code);

test("Nightmare: The Antlered Crown's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.crownCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Antlered Crown - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n1x Dunland Prowler\n1x Dunland Berserker\n2x Dunlending Bandit\n3x Raven Skirmisher\n3x Raven War-camp\n2x Driven Back\n/,
  );
  assert.match(
    c.text!,
    /\nNote: Dunlending Horde has the "Dunlending Warriors" encounter set icon and should be shuffled into the Raven deck during setup\.$/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nLocations with time counters on them cannot be discarded from play by player card effect.",
  );
  assert.equal(
    card(N.elite).text,
    "When Revealed: Either remove 1 time counter from a location in play, or Raven Clan Elite makes an immediate attack against the first player.",
  );
  assert.equal(
    card(N.druid).text,
    "Forced: After the engaged player draws any number of cards, remove 1 time counter from a location in play.",
  );
  assert.equal(
    card(N.druid).shadow,
    "Shadow: Attacking enemy gets +X [attack], where X is the Time X value on the active location.",
  );
  assert.equal(
    card(N.horde).text,
    "Cannot have attachments or take non-combat damage.\nForced: After the engaged player draws any number of cards, heal all damage from Dunlending Horde.",
  );
  assert.equal(
    card(N.stronghold).text,
    "Time 3. Forced: After the last time counter is removed from this location, each player reveals the top card of the Raven deck and adds it to the staging area.\nForced: When this location is explored, add the top card of the Raven deck to the staging area.",
  );
  assert.equal(
    card(N.highlands).shadow,
    "Shadow: Either remove 1 time counter from a location in play, or return attacking enemy to the staging area after this attack.",
  );
  assert.equal(
    card(N.talisman).shadow,
    "Shadow: Attacking enemy gets +1 [attack]. If this attack destroys a character, discard your hand and draw 3 cards.",
  );
  assert.equal(
    card(N.gathering).text,
    "When Revealed: Add the top 2 cards of the Raven Deck to the staging area. If any player has 5 or more cards in hand, this effect cannot be canceled.",
  );
  assert.deepEqual(
    [N.stronghold, N.highlands].map(printedLocationTime),
    [3, 2],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Antlered Crown - Nightmare",
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

test("Nightmare: The Antlered Crown's Nightmare deck matches its source recipe, and Dunlending Horde joins the Raven deck", () => {
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
  const recipe = recipes.find((r) => r.id === "N04.9")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section && c.code !== N.crownCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const sets = scenario(ID).sets;
  const standard = encounterCards
    .filter((c) => sets.includes(c.encounter_set ?? ""))
    .flatMap((c) => Array<string>(c.quantity ?? 1).fill(c.code));
  assert.deepEqual(
    count(nightmareEncounterDeck(ID, standard)),
    count(
      [
        "sharedEncounterDeck",
        "sharedEncounterDeck2",
        "sharedSetAside",
        "sharedStagingArea",
        "sharedActiveLocation",
        "player1Play1",
      ].flatMap(pile),
    ),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.crownCard).text!.includes(`${n}x ${title}`), title);
  const raven = [...RAVEN_CODES, N.horde];
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.crownCard);
    assert.ok(valid(s));
    // The encounter deck holds the recipe's 37 cards; the Raven deck its
    // 12, less the cards the setup put into play.
    assert.deepEqual(
      count(s.encounterDeck),
      count(pile("sharedEncounterDeck")),
    );
    const inPlay = [
      ...s.staging,
      ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
    ].filter((u) => raven.includes(u.code));
    assert.deepEqual(
      count([...s.antlered!.ravenDeck, ...codes(inPlay)]),
      count(pile("sharedEncounterDeck2")),
    );
    assert.equal(inPlay.length, seatIndices(s).length);
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /locations with time counters cannot be discarded from play by player card effects; the Nightmare Deck's Dunlending Horde joined the Raven deck/,
  );
  // A save's Raven deck may hold the Horde only in Nightmare mode.
  const s = calm(opening(game()), "planning");
  s.antlered!.ravenDeck.push(N.horde);
  assert.ok(valid(s));
  s.nightmareMode = false;
  assert.equal(valid(s), false);
});

test("Nightmare: The Antlered Crown's setup card keeps locations with time counters in play against player card effects", () => {
  const s = board("planning");
  const timed = place(s, A.village, 2),
    spent = place(s, A.village, 0);
  assert.equal(discardLocation(s, timed), false);
  assert.ok(s.staging.includes(timed));
  assert.match(
    logText(s),
    /Raven Village cannot be discarded from play by player card effects\./,
  );
  assert.equal(discardLocation(s, spent), true);
  assert.ok(!s.staging.includes(spent));
  // An encounter card effect discards it, and the standard game lets a
  // player card discard it.
  assert.equal(discardLocation(s, timed, true), true);
  const std = calm(
    opening(createGame(5, d.cards, d.heroes, d.id, { scenarioId: ID })),
    "planning",
  );
  const loc = make(std, A.village);
  loc.timeCounters = 2;
  std.staging.push(loc);
  assert.equal(discardLocation(std, loc), true);
});

test("Nightmare: Raven Clan Elite removes a time counter from a location in play or attacks the first player", () => {
  // Two locations with time counters: the choice, then the location.
  let s = board("staging");
  const village = place(s, A.village, 2),
    stronghold = place(s, N.stronghold, 3);
  revealed(s, N.elite);
  run(s);
  assert.deepEqual(options(s), ["time", "attack"]);
  pick(s, "time");
  run(s);
  assert.deepEqual(options(s), [village.id, stronghold.id]);
  pick(s, stronghold.id);
  run(s);
  assert.deepEqual([village.timeCounters, stronghold.timeCounters], [2, 2]);
  // The immediate attack against the first player.
  s = board("staging");
  place(s, A.village, 2);
  revealed(s, N.elite);
  run(s);
  pick(s, "attack");
  run(s);
  const elite = s.staging.find((u) => u.code === N.elite)!;
  assert.equal(s.combat?.enemyId, elite.id);
  // Without a time counter in play, it attacks.
  s = board("staging");
  place(s, A.village, 0);
  revealed(s, N.elite);
  run(s);
  assert.equal(
    s.combat?.enemyId,
    s.staging.find((u) => u.code === N.elite)!.id,
  );
});

test("Nightmare: Raven Clan Druid removes a time counter when its engaged player draws, and its shadow adds the active location's Time X", () => {
  const s = board("planning", opening(two()));
  const village = place(s, A.village, 2),
    stronghold = place(s, N.stronghold, 3);
  enemy(s, N.druid, 1);
  // The other player draws: nothing.
  draw(s, 0);
  assert.equal(s.choice, null);
  draw(s, 1);
  assert.deepEqual(options(s), [village.id, stronghold.id]);
  pick(s, village.id);
  run(s);
  assert.equal(village.timeCounters, 1);
  // The shadow: the active location's printed Time X.
  const t = board("combat");
  const druid = enemy(t, N.druid, 0);
  place(t, N.stronghold, 1, true);
  shadow(t, druid, N.druid, t.heroes[0]);
  assert.equal(t.combat!.attackBonus, 3);
  const u = board("combat");
  shadow(u, enemy(u, N.druid, 0), N.druid, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 0, "no active location");
});

test("Nightmare: Dunlending Horde takes only combat damage, cannot have attachments, and heals when its engaged player draws", () => {
  const s = board("planning");
  const horde = enemy(s, N.horde, 0);
  damage(s, horde.id, 3);
  run(s);
  assert.equal(horde.damage, 0);
  assert.match(logText(s), /Dunlending Horde cannot take non-combat damage\./);
  damage(s, horde.id, 3, { combatDamage: true, enemyId: horde.id });
  run(s);
  assert.equal(horde.damage, 3);
  assert.equal(hooks(s).cannotAttach!(s, horde, "01062"), true);
  draw(s, 0);
  assert.equal(horde.damage, 0);
});

test("Nightmare: Raven Stronghold reveals a Raven card for each player when its last time counter goes, and adds one when explored", () => {
  const s = board("quest", opening(two()));
  const stronghold = place(s, N.stronghold, 1);
  s.antlered!.ravenDeck = [BANDIT, BANDIT, A.warrior];
  s.queue.unshift(fx("crownRemoveTimeBatch", { ids: [stronghold.id] }));
  settle(run(s));
  assert.equal(stronghold.timeCounters, 0);
  assert.equal(s.staging.filter((u) => u.code === BANDIT).length, 2);
  assert.deepEqual(s.antlered!.ravenDeck, [A.warrior]);
  assert.match(
    logText(s),
    /each player reveals the top card of the Raven deck/,
  );
  // Explored: the top card of the Raven deck joins the staging area.
  const t = board("quest");
  const active = place(t, N.stronghold, 2, true);
  t.antlered!.ravenDeck = [BANDIT, A.warrior];
  progressLocation(t, active, 5);
  settle(run(t));
  assert.equal(t.activeLocation, null);
  assert.deepEqual(codes(t.staging), [BANDIT]);
});

test("Nightmare: Highlands of Dunland returns each enemy to the staging area, and its shadow offers a time counter or the attacker's return", () => {
  const s = board("planning", opening(two()));
  const highlands = place(s, N.highlands, 1);
  const a = enemy(s, BANDIT, 0),
    b = enemy(s, BANDIT, 1);
  s.queue.unshift(fx("crownRemoveTimeBatch", { ids: [highlands.id] }));
  settle(run(s));
  assert.ok([a, b].every((u) => s.staging.some((x) => x.id === u.id)));
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).engaged.length),
    [0, 0],
  );
  // The shadow: either a time counter or the attacker's return.
  const t = board("combat");
  const village = place(t, A.village, 2);
  const attacker = enemy(t, BANDIT, 0);
  shadow(t, attacker, N.highlands, t.heroes[0]);
  run(t);
  assert.deepEqual(options(t), ["time", "return"]);
  pick(t, "time");
  run(t);
  assert.equal(village.timeCounters, 1);
  assert.ok(!t.combat!.returnToStaging);
  const u = board("combat");
  shadow(u, enemy(u, BANDIT, 0), N.highlands, u.heroes[0]);
  run(u);
  assert.equal(u.combat!.returnToStaging, true, "no time counter in play");
});

test("Nightmare: Raven Talisman draws for each player and counts the first player's hand toward the staging area's threat this round", () => {
  const s = board("staging", opening(two()));
  revealed(s, N.talisman);
  settle(run(s));
  assert.deepEqual(
    seatIndices(s).map((p) => handOf(s, p).length),
    [1, 1],
  );
  assert.ok(s.encounterDiscard.includes(N.talisman));
  assert.equal(hooks(s).stagingThreat!(s), 1);
  forOwner(s, 0, () => s.hand.push(make(s, "01062"), make(s, "01062")));
  assert.equal(hooks(s).stagingThreat!(s), 3);
  // A second copy this round counts the hand again.
  revealed(s, N.talisman);
  settle(run(s));
  assert.equal(handOf(s, 0).length, 4);
  assert.equal(hooks(s).stagingThreat!(s), 8);
  s.round++;
  assert.equal(hooks(s).stagingThreat!(s), 0);
  // Its shadow: +1 [attack]; a destroyed character costs the defending
  // player their hand for 3 new cards.
  const t = board("combat", opening(two()));
  const attacker = enemy(t, BANDIT, 1);
  const ally = make(t, "01062");
  ally.damage = 0;
  forOwner(t, 1, () => {
    t.allies.push(ally);
    t.hand = [make(t, "01062"), make(t, "01062")];
  });
  const kept = handOf(t, 1).map((u) => u.id);
  shadow(t, attacker, N.talisman, ally, 1);
  assert.equal(t.combat!.attackBonus, 1);
  damage(t, ally.id, 9, { combatDamage: true, enemyId: attacker.id });
  settle(run(t));
  assert.equal(handOf(t, 1).length, 3);
  assert.ok(handOf(t, 1).every((u) => !kept.includes(u.id)));
  assert.match(
    logText(t),
    /Raven Talisman · .*the hand \(2 cards\) is discarded; 3 cards are drawn\./,
  );
});

test("Nightmare: Gathering Forces adds the top 2 Raven cards, resists cancellation against large hands, and its shadow engages a Raven card", () => {
  const s = board("staging");
  s.antlered!.ravenDeck = [BANDIT, BANDIT, A.warrior];
  revealed(s, N.gathering);
  settle(run(s));
  assert.equal(s.staging.filter((u) => u.code === BANDIT).length, 2);
  assert.deepEqual(s.antlered!.ravenDeck, [A.warrior]);
  forOwner(
    s,
    0,
    () => (s.hand = Array.from({ length: 4 }, () => make(s, "01062"))),
  );
  assert.equal(hooks(s).cannotCancel!(s, false, N.gathering), false);
  forOwner(s, 0, () => s.hand.push(make(s, "01062")));
  assert.equal(hooks(s).cannotCancel!(s, false, N.gathering), true);
  assert.equal(hooks(s).cannotCancel!(s, true, N.gathering), false);
  // The shadow: the top card of the Raven deck engages the defending player.
  const t = board("combat", opening(two()));
  t.antlered!.ravenDeck = [BANDIT, A.warrior];
  shadow(t, enemy(t, BANDIT, 1), N.gathering, undefined, 1);
  run(t);
  assert.deepEqual(codes(seatView(t, 1).engaged), [BANDIT, BANDIT]);
  assert.equal(seatView(t, 0).engaged.length, 0);
});

test("Nightmare: The Antlered Crown's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "planning");
  s.nightmare = { crownTalisman: [1, 1] };
  assert.ok(valid(s));
  s.nightmare = { crownTalisman: [-1] };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
