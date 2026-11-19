import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  engage,
  progress,
  progressLocation,
} from "../src/game/board";
import {
  fx,
  locationQuest,
  make,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { ROAD } from "../src/game/road-rivendell";
import { mainQuestCode } from "../src/game/quest-state";
import { engagementCheckThreat } from "../src/game/threat-read";
import {
  NIGHTMARE,
  NIGHTMARE_DD as D,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { forOwner, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
import type { GameState } from "../src/game/types";
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

/** Turbulent Waters: a location with no "When Revealed" effect and no shadow. */
const WATERS = encounterCards.find((c) => c.name === "Turbulent Waters")!.code;
const road = (seed = 5) => nightmareGame("road-to-rivendell", seed);
/** A quiet board in `phase`: Arwen kept, nothing staged, engaged or discarded, threat 20. */
function board(phase: GameState["phase"], s: GameState = opening(road())) {
  calm(s, phase);
  s.activeLocation = null;
  delete s.extraActiveLocations;
  for (const p of s.table ? s.table.seats.map((_, i) => i) : [0])
    forOwner(s, p, () => {
      s.engaged = [];
      s.threat = 20;
      s.allies = s.allies.filter((u) => u.code === ROAD.arwen);
      for (const u of [...s.heroes, ...s.allies]) {
        u.damage = 0;
        u.committed = false;
        u.exhausted = false;
      }
    });
  s.staging = [];
  s.encounterDiscard = [];
  s.encounterDeck = Array(10).fill(WATERS);
  s.stage = 1;
  s.progress = 0;
  delete s.roadRivendell?.gateEnemyId;
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
const arwenOf = (s: GameState) =>
  [...s.heroes, ...s.allies].find((u) => u.code === ROAD.arwen);
const resolve = (x: GameState) =>
  x.choice!.options.find((o) => o.id === "resolve")?.id;

test("Nightmare: Road to Rivendell's setup card, Ambush in the Night and Nightmare Deck carry their scans' texts", () => {
  const c = card(D.rivendellCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "Road to Rivendell - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Road to Rivendell scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter and quest deck:\n1x Orc Outpost \(quest stage 2\)\n2x Ruined Road\n2x Barren Hills\n1x Goblin Taskmaster\n4x Black Uruks\n3x Mountain Warg\n3x Bitter Wind\n2x Warg Lair\n5x Goblin Spearman\n2x Goblin Archer\n2x Plundered Armoury\nAdd the new quest card in this Nightmare Deck to the normal quest deck, in stage order\. .* which is now ready to begin\.$/s,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nForced: When an enemy with the ambush keyword engages a player during the quest phase, it contributes its [threat] to the total [threat] in the staging area until the end of the phase.",
  );
  const q = card(D.night);
  assert.deepEqual(
    [q.type_code, q.name, Number(q.cost), q.back_name, q.back_quest],
    ["quest", "Ambush in the Night", 2, "Ambush in the Night", 12],
  );
  assert.equal(
    q.text,
    "When Revealed: Search the encounter deck, discard pile, and victory display for Goblin Gate and add it to the staging area, if able. Shuffle the encounter discard pile into the encounter deck. Discard cards from the top of the encounter deck until X enemies have been discarded, where X is the number of players in the game. Reveal all enemies discarded by this effect.",
  );
  assert.equal(
    q.back_text,
    "When Revealed: The first player loses control of Arwen Undómiel and attaches her to Goblin Gate (she is now guarded by Goblin Gate). While she is guarded, the first player cannot gain control of Arwen Undómiel.\nGoblin Gate gets +1 quest point for each enemy engaged with a player.\nProgress cannot be placed on this stage unless the players control Arwen Undómiel.",
  );
  // The scans correct the catalog: Uruk Elf-stalker's name, Raiding Party's
  // traits, Treacherous Bluffs' Forced effect (any enemy with ambush that
  // engages), Vicious Trackers' name and "for the purposes", Arwen
  // Undómiel's accent.
  assert.equal(card(D.stalker).name, "Uruk Elf-stalker");
  assert.equal(
    card(D.stalker).text,
    "Ambush.\nForced: When Uruk Elf-stalker attacks and destroys a character, deal 1 damage to Arwen Undómiel.",
  );
  assert.equal(card(D.raiding).traits, "Goblin. Orc.");
  assert.equal(
    card(D.bluffs).text,
    "Forced: When an enemy with the ambush keyword engages a player, Treacherous Bluffs gets +2 [threat] until the end of the phase.",
  );
  assert.equal(
    card(D.trackers).text,
    "Surge.\nWhile Vicious Trackers is engaged with a player, that player is considered to have +20 threat for the purposes of engagement checks only.",
  );
  assert.deepEqual(
    [D.stalker, D.trapper, D.bluffs, D.woods].map((x) => card(x).shadow),
    [
      "Shadow: Attacking enemy gets +2 [attack].",
      "Shadow: Add Goblin Trapper to the staging area.",
      "Shadow: Excess damage dealt by this attack must be assigned to Arwen Undómiel.",
      "Shadow: Attacking enemy gets +2 [attack] if engaged with the first player.",
    ],
  );
  for (const x of [D.raiding, D.trackers, D.assault])
    assert.equal(card(x).shadow, undefined, card(x).name);
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health];
  };
  assert.deepEqual(stat(D.stalker), [5, 3, 5, 3, 5]);
  assert.deepEqual(stat(D.trapper), [30, 3, 3, 2, 3]);
  assert.deepEqual(stat(D.raiding), [34, 2, 5, 1, 7]);
  assert.deepEqual(stat(D.trackers), [16, 1, 3, 2, 5]);
  assert.deepEqual(
    [D.bluffs, D.woods].map((x) => [card(x).threat, card(x).quest]),
    [
      [1, 7],
      [4, 4],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Road to Rivendell - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (["nightmare", "quest"].includes(x.type_code) ? 0 : (x.quantity ?? 1)),
      0,
    ),
    18,
  );
  assert.equal(
    art.filter((a) => set.some((x) => x.code === a.code)).length,
    11,
  );
});

test("Nightmare: Road to Rivendell's Nightmare decks match their source recipe", () => {
  const sets = scenario("road-to-rivendell").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("road-to-rivendell", standard);
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
  const recipe = recipes.find((r) => r.id === "N02.5")!;
  const expected: Record<string, number> = {};
  for (const c of recipe.cards)
    if (c.section !== "sharedQuestDeck" && c.code !== D.rivendellCard)
      expected[c.code] = (expected[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), expected);
  const removals = {
    ...NIGHTMARE["road-to-rivendell"]!.removals,
    ...NIGHTMARE["road-to-rivendell"]!.questRemovals,
  };
  for (const [title, n] of Object.entries(removals))
    assert.ok(card(D.rivendellCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "Road to Rivendell (Nightmare)",
      mode: "nightmare",
    }),
    "road-to-rivendell",
  );
  // The quest deck: Ambush in the Night in place of Orc Outpost.
  const s = opening(road());
  assert.equal(nightmareCardOf(s), D.rivendellCard);
  assert.match(nightmareStatus(s)[0], /stage 2 is Ambush in the Night/);
  const quests = [1, 2, 3].map((stage) => {
    s.stage = stage;
    return mainQuestCode(s);
  });
  s.stage = 1;
  assert.deepEqual(
    quests.sort(),
    recipe.cards
      .filter((c) => c.section === "sharedQuestDeck")
      .map((c) => c.code)
      .sort(),
  );
  assert.ok(valid(s));
  assert.ok(valid(opening(nightmareForTwo("road-to-rivendell"))));
});

test("Nightmare: Ambush in the Night brings Goblin Gate, reveals X enemies and guards Arwen Undómiel until Goblin Gate leaves play", () => {
  // 2A: Goblin Gate from the discard pile, the discard pile shuffled in, and
  // cards discarded until an enemy (X = 1) is revealed.
  let s = board("staging");
  s.encounterDiscard = [ROAD.gate];
  s.encounterDeck = [...Array(6).fill(WATERS), D.trapper];
  s.progress = 20;
  advanceQuest(s);
  flush(s);
  for (let i = 0; i < 5 && s.choice; i++)
    s = choose(s, resolve(s) ?? s.choice!.options[0].id);
  assert.equal(s.stage, 2);
  assert.equal(mainQuestCode(s), D.night);
  assert.deepEqual(
    [hooks(s).stageInfo!(s)!.name, hooks(s).stageInfo!(s)!.quest],
    ["Ambush in the Night", 12],
  );
  const gate = s.staging.find((u) => u.code === ROAD.gate)!;
  assert.ok(gate);
  assert.ok(s.staging.some((u) => u.code === D.trapper));
  assert.equal(
    s.encounterDeck.length + s.encounterDiscard.length,
    6,
    "the other cards",
  );
  // 2B: Arwen Undómiel attached to Goblin Gate; the game goes on.
  assert.deepEqual(
    gate.attachments.map((a) => a.code),
    [ROAD.arwen],
  );
  assert.equal(arwenOf(s), undefined);
  assert.equal(s.nightmare?.arwen?.code, ROAD.arwen);
  check(s);
  assert.equal(s.status, "playing");
  assert.ok(valid(s));
  // No progress on the stage while she is guarded; Goblin Gate gets +1
  // quest point for each engaged enemy.
  calm(s, "quest");
  progress(s, 5);
  flush(s);
  assert.equal(s.progress, 0);
  assert.equal(locationQuest(s, gate), 4);
  s.engaged.push(make(s, D.stalker), make(s, D.trapper));
  assert.equal(locationQuest(s, gate), 6);
  // Goblin Gate explored: the first player controls her again.
  s.engaged = [];
  s.staging = s.staging.filter((u) => u.id !== gate.id);
  s.activeLocation = gate;
  progressLocation(s, gate, 4);
  flush(s);
  assert.ok(arwenOf(s));
  assert.equal(s.nightmare?.arwen, undefined);
  progress(s, 5);
  flush(s);
  assert.equal(s.progress, 5);
  assert.ok(valid(s));
  // 12 progress: stage 3 (1 card revealed for each player).
  calm(s, "staging");
  s.encounterDeck = [WATERS, WATERS];
  s.progress = 12;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.encounterDeck.length, 1);
  // Goblin Gate from the victory display.
  const t = board("staging");
  t.victoryCards = [ROAD.gate];
  t.encounterDeck = [D.trapper, WATERS];
  t.progress = 20;
  advanceQuest(t);
  flush(t);
  assert.ok(t.staging.some((u) => u.code === ROAD.gate));
  assert.ok(!t.victoryCards.includes(ROAD.gate));
  // Two players: two enemies revealed.
  const two = board("staging", opening(nightmareForTwo("road-to-rivendell")));
  two.encounterDeck = [D.trapper, WATERS, D.trapper, WATERS];
  two.progress = 20;
  advanceQuest(two);
  flush(two);
  assert.equal(two.staging.filter((u) => u.code === D.trapper).length, 2);
});

test("Nightmare: enemies with ambush engaging during the quest phase, Treacherous Bluffs, Goblin Trapper, Raiding Party and Vicious Trackers", () => {
  // The setup card: an enemy with ambush that engages during the quest
  // phase still counts its [threat] there until the end of the phase.
  const s = board("staging");
  const trapper = make(s, D.trapper),
    trackers = make(s, D.trackers);
  s.staging.push(trapper, trackers);
  const before = stagingThreat(s);
  engage(s, trapper);
  flush(s);
  for (let i = 0; i < 5 && s.choice; i++) s.choice = null;
  s.queue = [];
  assert.equal(stagingThreat(s), before);
  engage(s, trackers);
  assert.equal(stagingThreat(s), before - threatOf(s, trackers));
  hooks(s).endQuest!(s);
  assert.equal(stagingThreat(s), 0);
  // Not outside the quest phase.
  const t = board("encounter");
  const t2 = make(t, D.trapper);
  t.staging.push(t2);
  engage(t, t2);
  assert.equal(t.nightmare?.ambushers, undefined);
  // Treacherous Bluffs: +2 [threat] for each engagement of an enemy with
  // ambush this phase.
  const b = board("encounter");
  const bluffs = make(b, D.bluffs);
  b.staging.push(bluffs);
  assert.equal(threatOf(b, bluffs), 1);
  for (const code of [D.stalker, D.stalker]) {
    const e = make(b, code);
    b.staging.push(e);
    engage(b, e);
  }
  assert.equal(threatOf(b, bluffs), 1 + 4);
  const plain = make(b, D.trackers);
  b.staging.push(plain);
  engage(b, plain);
  assert.equal(threatOf(b, bluffs), 1 + 4);
  b.phase = "defense";
  assert.equal(threatOf(b, bluffs), 1);
  // Goblin Trapper: the engaged player exhausts a character.
  let g = board("encounter");
  const gt = make(g, D.trapper);
  g.staging.push(gt);
  engage(g, gt);
  flush(g);
  assert.match(g.choice!.title, /^Goblin Trapper · Exhaust a character/);
  g = choose(g, g.heroes[1].id);
  assert.equal(g.heroes[1].exhausted, true);
  assert.ok(valid(g));
  // Raiding Party: each player discards the top card; an enemy with ambush
  // makes an engagement check (it engages at threat 30, not at 20).
  for (const threat of [20, 35]) {
    const r = board("encounter");
    r.threat = threat;
    r.encounterDeck = [D.trapper, WATERS];
    const party = make(r, D.raiding);
    r.staging.push(party);
    engage(r, party);
    flush(r);
    for (let i = 0; i < 5 && r.choice; i++) r.choice = null;
    r.queue = [];
    const engaged = r.engaged.some((u) => u.code === D.trapper);
    assert.equal(engaged, threat >= 30, `threat ${threat}`);
    assert.equal(r.encounterDiscard.includes(D.trapper), !engaged);
  }
  const two = board("encounter", opening(nightmareForTwo("road-to-rivendell")));
  two.encounterDeck = [WATERS, D.trapper, WATERS];
  forOwner(two, 1, () => (two.threat = 40));
  const party2 = make(two, D.raiding);
  two.staging.push(party2);
  engage(two, party2);
  flush(two);
  for (let i = 0; i < 5 && two.choice; i++) two.choice = null;
  two.queue = [];
  assert.ok(seatView(two, 1).engaged.some((u) => u.code === D.trapper));
  assert.deepEqual(two.encounterDeck, [WATERS]);
  // Vicious Trackers: +20 threat for engagement checks only.
  const v = board("encounter");
  v.engaged.push(make(v, D.trackers));
  assert.equal(engagementCheckThreat(v), 40);
  assert.equal(v.threat, 20);
  v.staging.push(make(v, D.trapper));
  v.queue.push(fx("engagementRound", { player: 0 }));
  flush(v);
  for (let i = 0; i < 5 && v.choice; i++) v.choice = null;
  assert.ok(v.engaged.some((u) => u.code === D.trapper));
});

test("Nightmare: Uruk Elf-stalker, the shadows, Concealed Woods and Tumultuous Assault", () => {
  // Uruk Elf-stalker: a character its attack destroys deals 1 damage to
  // Arwen Undómiel.
  const s = board("defense");
  const stalker = make(s, D.stalker);
  s.engaged.push(stalker);
  const hero = s.heroes[2];
  damage(s, hero.id, 99, { combatDamage: true, enemyId: stalker.id });
  flush(s);
  assert.ok(!s.heroes.some((h) => h.id === hero.id));
  assert.equal(arwenOf(s)!.damage, 1);
  // Its shadow: +2 [attack].
  const t = board("defense");
  const orc = make(t, D.raiding);
  t.engaged.push(orc);
  shadow(t, orc, D.stalker, t.heroes[0]);
  assert.equal(t.combat!.attackBonus, 2);
  // Goblin Trapper's shadow adds it to the staging area (its ambush makes an
  // engagement check: none at threat 20, but with Vicious Trackers engaged
  // the check counts 40).
  shadow(t, orc, D.trapper, t.heroes[0]);
  flush(t);
  assert.deepEqual(orc.shadows, []);
  assert.ok(t.staging.some((u) => u.code === D.trapper));
  t.engaged.push(make(t, D.trackers));
  shadow(t, orc, D.trapper, t.heroes[0]);
  flush(t);
  assert.ok(t.engaged.some((u) => u.code === D.trapper));
  // Treacherous Bluffs' shadow: the excess damage goes to Arwen Undómiel.
  const u = board("defense");
  const enemy = make(u, D.trackers);
  u.engaged.push(enemy);
  const defender = u.heroes[1];
  const left = stats(u, defender).health - defender.damage;
  shadow(u, enemy, D.bluffs, defender);
  damage(u, defender.id, left + 1, { combatDamage: true, enemyId: enemy.id });
  flush(u);
  assert.equal(arwenOf(u)!.damage, 1);
  hooks(u).attackFinished!(u, enemy);
  assert.equal(u.nightmare?.excess, undefined);
  // Concealed Woods' shadow: +2 [attack] against the first player only.
  const w = board("defense", opening(nightmareForTwo("road-to-rivendell")));
  const e0 = make(w, D.trackers);
  w.engaged.push(e0);
  shadow(w, e0, D.woods, w.heroes[0]);
  assert.equal(w.combat!.attackBonus, 2);
  let e1 = make(w, D.trackers);
  forOwner(w, 1, () => w.engaged.push(e1));
  e1 = seatView(w, 1).engaged[0];
  shadow(w, e1, D.woods, undefined, 1);
  assert.equal(w.combat!.attackBonus, 0);
  // Concealed Woods active: the first enemy with ambush revealed each round
  // gains surge.
  const x = board("staging");
  x.activeLocation = make(x, D.woods);
  x.encounterDeck = Array(6).fill(WATERS);
  const y = reveal(x, D.trapper, resolve);
  assert.equal(y.encounterDeck.length, 5, "surge");
  const z = reveal(y, D.trapper, resolve);
  assert.equal(z.encounterDeck.length, 5, "no surge");
  z.round++;
  const z2 = reveal(z, D.trapper, resolve);
  assert.equal(z2.encounterDeck.length, 4, "next round");
  // Tumultuous Assault: engaged enemies with ambush return to the staging
  // area and each player makes engagement checks (the Elf-stalker engages
  // again at threat 20, the Trapper does not).
  const a = board("staging");
  a.engaged.push(make(a, D.stalker), make(a, D.trapper));
  a.encounterDeck = [WATERS, WATERS];
  const b = reveal(a, D.assault, resolve);
  assert.deepEqual(
    b.engaged.map((u) => u.code),
    [D.stalker],
  );
  assert.ok(b.staging.some((u) => u.code === D.trapper));
  assert.equal(b.encounterDeck.length, 2, "no surge");
  assert.ok(b.encounterDiscard.includes(D.assault));
  // With Vicious Trackers engaged (it stays: it has no ambush), the checks
  // count 40 threat and the Trapper engages too.
  const a2 = board("staging");
  a2.engaged.push(make(a2, D.trapper), make(a2, D.trackers));
  a2.encounterDeck = [WATERS, WATERS];
  const b2 = reveal(a2, D.assault, resolve);
  assert.deepEqual(
    b2.engaged.map((u) => u.code).sort(),
    [D.trackers, D.trapper].sort(),
  );
  // With no enemy with ambush in play, it gains surge.
  const c = board("staging");
  c.encounterDeck = [WATERS, WATERS];
  const d2 = reveal(c, D.assault, resolve);
  assert.equal(d2.encounterDeck.length, 1, "surge");
  assert.ok(valid(d2));
});

test("Nightmare: seeded Road to Rivendell games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const s = autoplay(road(seed), 3000);
    assert.notEqual(s.status, "playing", `road-to-rivendell seed ${seed}`);
  }
  // From stage 2, Ambush in the Night.
  let t = board("staging", opening(road(3)));
  t.encounterDiscard = [ROAD.gate];
  t.progress = 20;
  advanceQuest(t);
  flush(t);
  for (let i = 0; i < 5 && t.choice; i++)
    t = choose(t, resolve(t) ?? t.choice!.options[0].id);
  calm(t, "planning");
  assert.equal(t.stage, 2);
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
  const two = autoplay(nightmareForTwo("road-to-rivendell", 7), 4000);
  assert.notEqual(two.status, "playing", "two-player road-to-rivendell");
});
