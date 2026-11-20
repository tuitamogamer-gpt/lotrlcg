import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  charactersCommitted,
  engage,
  progressLocation,
  revealed,
} from "../src/game/board";
import { fx, make, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  tharbadEliminationLevel,
  threatElimination,
} from "../src/game/threat-elimination";
import { observe } from "../src/game/presentation";
import { THARBAD as T } from "../src/game/tharbad-support";
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

/** Trouble in Tharbad: a non-unique location without a When Revealed effect. */
const QUIET = T.ruins;
const ALLY = "01017"; // Silverlode Archer: a non-unique ally
const ID = "trouble-in-tharbad";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** A quiet board on stage 1 with 3 time counters; Nalir stays with the first player. */
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
    stage: 1,
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
  });
  s.tharbad!.time = 3;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, {
        threat: 30,
        engaged: [],
        hand: [],
        allies: s.allies.filter((u) => u.code === T.nalir),
      });
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
const ally = (s: GameState) => {
  const u = make(s, ALLY);
  s.allies.push(u);
  return u;
};
function run(s: GameState) {
  for (let i = 0; i < 40; i++) {
    flush(s);
    if (!s.flow?.pending) break;
    s.flow.pending = null;
  }
  return s;
}
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const logText = (s: GameState) =>
  s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");

test("Nightmare: Trouble in Tharbad's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.tharbadCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Trouble in Tharbad - Nightmare", true],
  );
  assert.match(
    c.text!,
    /1x Orc Hunter\n2x Orc Skirmisher\n2x Tharbad Hideout\n2x Hidden Alleyway\n1x Decrepit Rooftops\n2x Orc Hunting Party\n/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Raise each player's starting threat by 5.\nProgress cannot be placed on The Crossing at Tharbad while Bellach is in play.",
  );
  assert.match(c.imagesrc!, /9fb6747a-1dd1-4a38-8c55-9459fda296c1\.jpg$/);
  assert.match(
    card(N.hunter).text!,
    /5 or more allies, Bellach's Hunter gets -20 engagement cost\.\nForced: .*deal 5 damage to a hero he controls\.$/,
  );
  assert.equal(card(N.hunter).engagement, 50);
  assert.equal(
    card(N.seeker).shadow,
    "Shadow: Reduce each player's threat elimination level by 2 (5 instead if undefended).",
  );
  assert.match(card(N.hound).text!, /raise your threat by 5\.$/);
  assert.match(card(N.city).text!, /does not stack with other copies/);
  assert.match(
    card(N.pathway).text!,
    /the first treachery card without the printed surge keyword revealed during the quest phase gains surge\.$/,
  );
  assert.match(card(N.waylaid).text!, /gains doomed 3\.$/);
  assert.match(card(N.patrol).text!, /^Surge\.\nWhen Revealed: Attach/);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Trouble in Tharbad - Nightmare",
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

test("Nightmare: Trouble in Tharbad's Nightmare deck matches its source recipe, raises each starting threat by 5 and guards The Crossing while Bellach is in play", () => {
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
  const recipe = recipes.find((r) => r.id === "N04.6")!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section && c.code !== N.tharbadCard)
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
        "sharedSetAside",
        "sharedStagingArea",
        "player1Play1",
        "sharedActiveLocation",
      ].flatMap(pile),
    ),
  );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.tharbadCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.tharbadCard);
    assert.ok(valid(s));
    for (const p of seatIndices(s)) {
      const v = seatView(s, p);
      const printed = v.heroes.reduce(
        (n, h) => n + (card(h.code).threat ?? 0),
        0,
      );
      assert.equal(v.threat, printed + 5, `seat ${p}`);
    }
  }
  assert.equal(
    automatedScenarioId({
      name: "Trouble in Tharbad (Nightmare)",
      mode: "nightmare",
    }),
    ID,
  );
  assert.match(
    nightmareStatus(opening(game()))[0],
    /starting threat was raised by 5.*Threat elimination level: 50\./,
  );
  // The Crossing at Tharbad takes no progress while Bellach is in play.
  const s = board("quest");
  const crossing = add(s, T.crossing);
  const bellach = add(s, T.bellach);
  progressLocation(s, crossing, 2);
  assert.equal(crossing.progress, 0);
  s.staging = s.staging.filter((u) => u.id !== bellach.id);
  s.engaged.push(bellach);
  progressLocation(s, crossing, 2);
  assert.equal(crossing.progress, 0, "an engaged Bellach is in play too");
  s.engaged = [];
  progressLocation(s, crossing, 2);
  assert.equal(crossing.progress, 2);
});

test("Nightmare: Orc Seeker reduces the threat elimination level or engages the first player and attacks, and its shadow reduces the level by 2 or 5", () => {
  const s = board("staging");
  revealed(s, N.seeker);
  run(s);
  const seeker = s.staging.find((u) => u.code === N.seeker)!;
  assert.deepEqual(options(s), ["reduce", "attack"]);
  pick(s, "reduce");
  assert.equal(threatElimination(s), 48);
  // The scenario's banner and the observed state show the lowered level.
  assert.equal(tharbadEliminationLevel(s), 48);
  assert.equal(
    observe(s, stats as never, () => 0).values["Threat elimination level"],
    "48",
  );
  assert.equal(s.nightmare!.tharbadReduction, 2);
  assert.match(nightmareStatus(s)[0], /Threat elimination level: 48\./);
  assert.ok(s.staging.some((u) => u.id === seeker.id));
  // The scenario's own steps of 10 stack with the Nightmare reductions.
  s.tharbad!.elimination = 40;
  assert.equal(threatElimination(s), 38);
  // Engage and attack: an immediate attack by the Seeker on the first player.
  const t = board("staging");
  revealed(t, N.seeker);
  run(t);
  pick(t, "attack");
  const attacker = t.engaged.find((u) => u.code === N.seeker)!;
  assert.ok(attacker);
  assert.equal(t.combat?.enemyId, attacker.id);
  assert.match(t.choice!.title, /Orc Seeker · Immediate attack/);
  // A lowered level eliminates a player at once.
  const u = board("staging");
  u.threat = 49;
  revealed(u, N.seeker);
  run(u);
  pick(u, "reduce");
  assert.equal(u.status, "lost");
  // Shadow: 2, or 5 when undefended.
  const v = board("combat");
  shadow(v, add(v, N.seeker, true), N.seeker, v.heroes[0]);
  run(v);
  assert.equal(threatElimination(v), 48);
  const w = board("combat");
  shadow(w, add(w, N.seeker, true), N.seeker);
  run(w);
  assert.equal(threatElimination(w), 45);
  // Standard games keep the scenario's own level.
  w.nightmareMode = false;
  assert.equal(threatElimination(w), 50);
});

test("Nightmare: Bellach's Hunter engages early against 5 allies and takes all time counters or 5 damage from a hero", () => {
  const s = board("encounter");
  const hunter = add(s, N.hunter);
  assert.equal(hooks(s).engagementBonus!(s, hunter), 0);
  for (let i = 0; i < 4; i++) ally(s);
  assert.equal(s.allies.length, 5, "Nalir counts as an ally");
  assert.equal(hooks(s).engagementBonus!(s, hunter), -20);
  engage(s, hunter);
  run(s);
  assert.deepEqual(options(s), ["time", ...s.heroes.map((h) => h.id)]);
  pick(s, "time");
  run(s);
  // Removing the last counter: the level falls by 10 and 4 counters return.
  assert.equal(s.tharbad!.elimination, 40);
  assert.equal(s.tharbad!.time, 4);
  // Another player's allies count too; no time counters leaves only damage.
  const t = board("encounter", opening(two()));
  forOwner(t, 1, () => {
    for (let i = 0; i < 5; i++) ally(t);
  });
  const h2 = add(t, N.hunter);
  assert.equal(hooks(t).engagementBonus!(t, h2), -20);
  t.tharbad!.time = 0;
  engage(t, h2);
  run(t);
  assert.deepEqual(
    options(t),
    t.heroes.map((h) => h.id),
  );
  const hero = t.heroes[0];
  pick(t, hero.id);
  run(t);
  assert.equal(hero.damage, 5);
});

test("Nightmare: Blood Hound raises its player's threat by 5 as it engages, and its shadow costs 10 threat or another attack", () => {
  const s = board("encounter");
  engage(s, add(s, N.hound));
  run(s);
  assert.equal(s.threat, 35);
  const t = board("combat");
  shadow(t, add(t, N.hound, true), N.hound, t.heroes[0]);
  run(t);
  assert.deepEqual(options(t), ["threat", "attack"]);
  pick(t, "threat");
  assert.equal(t.threat, 40);
  const u = board("combat");
  shadow(u, add(u, N.hound, true), N.hound, u.heroes[0]);
  run(u);
  pick(u, "attack");
  assert.equal(u.combat!.extraAttacks, 1);
});

test("Nightmare: City of Spies raises a player's threat for each character committed, without stacking", () => {
  const s = board("quest", opening(two()));
  add(s, N.city);
  add(s, N.city);
  const committed: Unit[] = [];
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      for (const h of s.heroes.slice(0, p + 1)) {
        h.committed = true;
        committed.push(h);
      }
    });
  charactersCommitted(s, committed);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).threat),
    [31, 32],
  );
  // Explored or traveled to, the City no longer watches.
  const t = board("quest");
  t.activeLocation = make(t, N.city);
  t.heroes[0].committed = true;
  charactersCommitted(t, [t.heroes[0]]);
  run(t);
  assert.equal(t.threat, 30);
});

test("Nightmare: Dark Pathway gives the quest phase's first treachery without printed surge surge, and its shadow takes a time counter or the defense", () => {
  const s = board("staging");
  s.activeLocation = make(s, N.pathway);
  // Conspicuous Lot surges by itself only at 20 threat or less.
  revealed(s, T.lot);
  run(s);
  assert.match(logText(s), /Dark Pathway: Conspicuous Lot.*gains surge/);
  assert.equal(s.staging.length, 1, "its surge revealed another card");
  revealed(s, T.lot);
  run(s);
  assert.equal(s.staging.length, 1, "only the first one");
  // A Conspicuous Lot that gains surge by itself as well still surges once.
  const x = board("staging");
  x.activeLocation = make(x, N.pathway);
  x.threat = 10;
  revealed(x, T.lot);
  run(x);
  assert.equal(x.staging.length, 1);
  assert.match(logText(x), /already has surge from Dark Pathway/);
  assert.equal(x.nightmare!.tharbadPathwayLot, undefined);
  // Without the Pathway, its own surge.
  const y = board("staging");
  y.threat = 10;
  revealed(y, T.lot);
  run(y);
  assert.equal(y.staging.length, 1);
  // A new round's quest phase starts over; another phase does not count.
  const t = board("travel");
  t.activeLocation = make(t, N.pathway);
  revealed(t, T.lot);
  run(t);
  assert.equal(t.staging.length, 0);
  // The first treachery passed while the Pathway was not active.
  const u = board("staging");
  revealed(u, T.lot);
  run(u);
  u.activeLocation = make(u, N.pathway);
  revealed(u, T.lot);
  run(u);
  assert.equal(u.staging.length, 0);
  // Shadow: a time counter, or the attack is undefended.
  const v = board("combat");
  shadow(v, add(v, N.seeker, true), N.pathway, v.heroes[0]);
  run(v);
  assert.deepEqual(options(v), ["time", "undefended"]);
  pick(v, "time");
  assert.equal(v.tharbad!.time, 2);
  const w = board("combat");
  w.tharbad!.time = 0;
  shadow(w, add(w, N.seeker, true), N.pathway, w.heroes[0]);
  run(w);
  assert.equal(w.choice, null);
  assert.equal(w.combat!.defenderId, null);
  assert.deepEqual(w.combat!.defenderIds, []);
});

test("Nightmare: Waylaid by Agents takes a time counter or an ally from each player, gains doomed 3 at 20 threat, and its shadow strengthens the attacker", () => {
  const s = board("staging");
  const archer = ally(s);
  revealed(s, N.waylaid);
  run(s);
  assert.deepEqual(options(s), ["time", ...s.allies.map((a) => a.id)]);
  pick(s, archer.id);
  run(s);
  assert.ok(!s.allies.some((a) => a.id === archer.id));
  assert.equal(s.tharbad!.time, 3);
  assert.equal(s.threat, 30, "no player is at 20 threat or less");
  // Each player chooses; one at 20 threat: doomed 3 for every player.
  const t = board("staging", opening(two()));
  forOwner(t, 1, () => {
    t.threat = 20;
    ally(t);
  });
  revealed(t, N.waylaid);
  run(t);
  pick(t, "time");
  run(t);
  pick(t, "time");
  run(t);
  assert.equal(t.tharbad!.time, 1);
  assert.deepEqual(
    seatIndices(t).map((p) => seatView(t, p).threat),
    [33, 23],
  );
  // Shadow: +1, or +3 at 20 threat or less.
  const u = board("combat");
  shadow(u, add(u, N.seeker, true), N.waylaid, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 1);
  const v = board("combat");
  v.threat = 20;
  shadow(v, add(v, N.seeker, true), N.waylaid, v.heroes[0]);
  assert.equal(v.combat!.attackBonus, 3);
});

test("Nightmare: Tharbad Patrol attaches to a non-unique staged location and springs its trap when the players travel there", () => {
  const s = board("staging");
  const host = add(s, QUIET);
  revealed(s, N.patrol);
  run(s);
  assert.ok(host.attachments.some((a) => a.code === N.patrol));
  assert.equal(s.staging.length, 2, "its printed surge revealed another card");
  // Without a host: discarded.
  const t = board("staging");
  add(t, T.crossing);
  revealed(t, N.patrol);
  run(t);
  assert.ok(t.encounterDiscard.includes(N.patrol));
  assert.ok(t.staging.every((l) => !l.attachments.length));
  // Traveling there: each player discards 2 cards and engages each enemy.
  const u = board("travel", opening(two()));
  const patrolled = add(u, QUIET);
  patrolled.attachments.push({
    id: `a${u.nextId++}`,
    code: N.patrol,
    exhausted: false,
  });
  u.encounterDeck = [T.spy, QUIET, QUIET, T.marauder, QUIET];
  u.queue.unshift(fx("travelEnter", { target: patrolled.id, player: 0 }));
  run(u);
  assert.equal(u.activeLocation?.id, patrolled.id);
  assert.deepEqual(
    seatIndices(u).map((p) => seatView(u, p).engaged.map((e) => e.code)),
    [[T.spy], [T.marauder]],
  );
  assert.deepEqual(u.encounterDeck, [QUIET]);
  assert.deepEqual(u.encounterDiscard, [QUIET, QUIET]);
});

test("Nightmare: Trouble in Tharbad's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = calm(opening(game()), "planning");
  s.nightmare = {
    tharbadReduction: 4,
    tharbadPathwayRound: 1,
    tharbadPathwayLot: 1,
  };
  assert.ok(valid(s));
  s.nightmare = { tharbadReduction: 2.5 };
  assert.equal(valid(s), false);
  s.nightmare = { tharbadPathwayRound: -1 };
  assert.equal(valid(s), false);
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
