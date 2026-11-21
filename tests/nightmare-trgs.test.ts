import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, make, stagingThreat } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  RING_SOUTH_RECIPES,
  RS,
  RS_NIGHTMARE_TENTACLE,
  isRsWarg,
} from "../src/game/ring-south";
import { automatedScenarioId } from "../src/game/support";
import {
  NIGHTMARE,
  NIGHTMARE_TRD as N,
  nightmareCardOf,
  nightmareEncounterDecks,
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
  reload,
  shadow,
  valid,
} from "./nightmare-fixtures";

const ID = "the-ring-goes-south";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
/** Eregion: a location without an effect in the staging area. */
const QUIET = RS.eregion;
/** Guard of the Citadel: a Leadership ally without a response. */
const GUARD = "01013";
/** A quiet board on stage 2: nothing in the staging area, no active location. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    stage: 2,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(12).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    stageRevealing: false,
    progress: 0,
    nightmare: {},
    victoryCards: [],
    victory: 0,
    staging: [],
  });
  Object.assign(s.ringSouth!, {
    currentQuest: card(RS.walkers).code,
    advancing: false,
  });
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      Object.assign(s, { threat: 20, engaged: [], hand: [] });
      for (const h of [...s.heroes, ...s.allies])
        Object.assign(h, {
          damage: 0,
          exhausted: false,
          committed: false,
          resources: 0,
        });
    });
  return s;
}
const hooks = (s: GameState) => batch4Scenario(s);
function place(s: GameState, code: string, active = false) {
  const u = make(s, code);
  if (active) s.activeLocation = u;
  else s.staging.push(u);
  return u;
}
/** A second active location (stage 4B). */
function second(s: GameState, code: string) {
  const u = make(s, code);
  s.extraActiveLocations = [...(s.extraActiveLocations ?? []), u];
  return u;
}
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
const options = (s: GameState) => s.choice!.options.map((o) => o.id);
const logText = (s: GameState) =>
  s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
const characters = (s: GameState, p: number): Unit[] => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const threatOf = (s: GameState, p = 0) => seatView(s, p).threat;
/** An attack's kill: the attacking enemy's combat damage destroys a character (in its current attack, if any). */
function kill(s: GameState, attacker: Unit, victim: Unit, player = 0) {
  if (s.combat?.enemyId !== attacker.id)
    s.combat = {
      enemyId: attacker.id,
      defenderId: victim.id,
      defenderIds: [victim.id],
      attackBonus: 0,
      attackPlayer: player,
    } as never;
  damage(s, victim.id, 99, { combatDamage: true, enemyId: attacker.id });
  run(s);
  return s.combat!;
}

test("Nightmare: The Ring Goes South's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.southCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Ring Goes South - Nightmare", true],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Ring Goes South scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x Crebain from Dunland\n2x Howling Warg\n1x Tree-crowned Hill\n3x Hills of Hollin\n2x Snowdrifts\n1x Storm of Howls\nThen, shuffle/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nSetup: Set each copy of Pale-green Tentacle aside, out of play.\nForced: When the players advance to stage 4B, each player puts 1 copy of Pale-green Tentacle into play engaged with him. Shuffle any remaining copies, and the encounter discard pile, into the encounter deck.",
  );
  const tentacle = card(N.tentacle);
  assert.deepEqual(
    [
      tentacle.name,
      tentacle.traits,
      tentacle.engagement,
      tentacle.threat,
      tentacle.attack,
      tentacle.defense,
      tentacle.health,
      tentacle.victory,
    ],
    ["Pale-green Tentacle", "Tentacle.", 22, 3, 5, 1, 5, 3],
  );
  assert.equal(
    tentacle.text,
    "Cannot have attachments.\nWatcher in the Water cannot take damage.\nForced: After Pale-green Tentacle attacks and destroys a character, return Pale-green Tentacle to the staging area.",
  );
  const warg = card(N.warg);
  assert.deepEqual(
    [warg.traits, warg.engagement, warg.threat, warg.attack, warg.defense],
    ["Creature. Warg.", 33, 2, 5, 3],
    "the scan's 5 [attack] (the catalogue had 4)",
  );
  assert.equal(warg.printed_stats?.attack, "5");
  assert.match(
    card(N.hawk).text!,
    /^Cannot have attachments or be optionally engaged\.\nWhile Hunting Hawk is in the staging area it gains, "Forced: After a player plays an ally/,
  );
  assert.match(
    card(N.slopes).text!,
    /^Forced: After a 'when revealed' effect is canceled, place 1 damage on each active location\.\nForced: When Slopes/,
  );
  assert.equal(card(N.expanse).printed_stats?.threat, "X");
  assert.equal(
    card(N.shelterless).shadow,
    "Shadow: Attacking enemy gets +1 [attack] for each damage on each active location.",
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Ring Goes South - Nightmare",
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

test("Nightmare: The Ring Goes South's Nightmare deck matches its source recipe, its Pale-green Tentacles set aside with Lust for the Ring", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    name: string;
    mode: string;
    campaign: boolean;
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
      .filter((c) => c.section === section && c.code !== N.southCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.04")!;
  const standard = RING_SOUTH_RECIPES.find((r) => r.mode === "standard")!;
  const sections = [
    "sharedEncounterDeck",
    "sharedStagingArea",
    "sharedActiveLocation",
    "sharedSetAside",
  ];
  const piles = nightmareEncounterDecks(
    ID,
    sections.map((x) => pile(standard, x)),
    (code) => (code === N.tentacle ? 3 : 0),
  );
  // The source recipe omits Lust for the Ring, which stage 1A sets aside in
  // every mode (the scenario's easy recipe omitted it too).
  const expected = sections.map((x) => pile(nightmare, x));
  expected[1].push(RS.lust);
  sections.forEach((x, i) =>
    assert.deepEqual(count(piles[i]), count(expected[i]), x),
  );
  assert.equal(RS_NIGHTMARE_TENTACLE, N.tentacle);
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.southCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.southCard);
    assert.ok(valid(s));
    assert.equal(s.encounterDeck.length, 34);
    assert.ok(!s.encounterDeck.includes(RS.crebain));
    assert.ok(!s.encounterDeck.includes(N.tentacle));
    assert.deepEqual(
      [...s.ringSouth!.setAside].sort(),
      [
        RS.lust,
        RS.pass,
        RS.doors,
        RS.watcher,
        ...Array(4).fill(N.tentacle),
      ].sort(),
    );
  }
  assert.match(
    nightmareStatus(opening(game())).join("\n"),
    /each player puts a Pale-green Tentacle into play engaged with them.*\(4 set aside now\)/,
  );
  for (const id of ["N0B.04", "N0C.04"])
    assert.equal(
      automatedScenarioId(recipes.find((r) => r.id === id)!),
      ID,
      id,
    );
});

test("Nightmare: as the players advance to stage 4B, each player takes a Pale-green Tentacle engaged with them and the others return to the encounter deck", () => {
  const s = board("quest", opening(two()));
  s.stage = 3;
  s.encounterDiscard = [QUIET, QUIET];
  s.queue.unshift(fx("rgsStageFour", { player: 0 }));
  run(s);
  assert.equal(s.stage, 4);
  assert.deepEqual(
    seatIndices(s).map((p) => seatView(s, p).engaged.map((u) => u.code)),
    [[N.tentacle], [N.tentacle]],
  );
  assert.ok(!s.ringSouth!.setAside.includes(N.tentacle));
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.encounterDeck.filter((c) => c === N.tentacle).length, 2);
  assert.equal(s.encounterDeck.length, 12 + 2 + 2);
  // Stage 4B: each enemy that engages a player places 1 damage on each
  // active location.
  assert.equal(s.activeLocation!.code, RS.doors);
  assert.equal(s.activeLocation!.damage, 2);
  assert.match(logText(s), /a Pale-green Tentacle enters play engaged with/);
  assert.ok(valid(s));
});

test("Nightmare: Pale-green Tentacle cannot have attachments, keeps Watcher in the Water from taking damage, and returns to the staging area after a kill", () => {
  const s = board("combat");
  s.stage = 4;
  const watcher = enemy(s, RS.watcher);
  const tentacle = enemy(s, N.tentacle, 0);
  assert.equal(hooks(s).cannotAttach!(s, tentacle, "01001"), true);
  damage(s, watcher.id, 3);
  run(s);
  assert.equal(watcher.damage, 0, "while a Pale-green Tentacle is in play");
  s.engaged = [];
  damage(s, watcher.id, 3);
  run(s);
  assert.equal(watcher.damage, 3);
  // The kill: it returns to the staging area.
  const t = board("combat");
  const grabber = enemy(t, N.tentacle, 0);
  const c = kill(t, grabber, characters(t, 0)[0]);
  assert.ok(c.rgsDestroyed);
  t.queue.unshift(...hooks(t).attackFinished!(t, c));
  run(t);
  assert.ok(t.staging.some((u) => u.id === grabber.id));
  assert.ok(!seatView(t, 0).engaged.some((u) => u.id === grabber.id));
});

test("Nightmare: Hunting Hawk cannot be optionally engaged or have attachments, and makes a player exhaust each ally they play or damage an active location", () => {
  let s = board("planning");
  const hawk = enemy(s, N.hawk);
  enemy(s, N.hawk);
  assert.equal(hooks(s).cannotOptionallyEngage!(s, hawk), true);
  assert.equal(hooks(s).cannotAttach!(s, hawk, "01001"), true);
  const foothills = place(s, RS.foothills, true);
  s.heroes[0].resources = 2;
  const guard = make(s, GUARD);
  s.hand.push(guard);
  s = applyAction(reload(s), { type: "PLAY", id: guard.id });
  for (let i = 0; i < 5 && s.choice && !options(s).includes("exhaust"); i++)
    s = applyAction(reload(s), { type: "CHOOSE", id: s.choice.options[0].id });
  assert.deepEqual(options(s), ["exhaust", "damage"]);
  s = applyAction(reload(s), { type: "CHOOSE", id: "exhaust" });
  const ally = s.allies.find((u) => u.code === GUARD)!;
  assert.equal(ally.exhausted, true);
  // The second Hawk: the exhausted ally leaves the damage alone.
  assert.equal(s.activeLocation!.id, foothills.id);
  assert.equal(s.activeLocation!.damage, 1);
  assert.match(
    logText(s),
    /Hunting Hawk: 1 damage is placed on Redhorn Foothills/,
  );
});

test("Nightmare: Misty Mountain Warg attacks its revealing player, damages each active location after a kill, and its shadow damages one; it is a Warg", () => {
  const s = board("staging");
  place(s, RS.foothills, true);
  second(s, RS.eregion);
  revealed(s, N.warg);
  run(s);
  const warg = s.staging.find((u) => u.code === N.warg)!;
  assert.equal(s.combat?.enemyId, warg.id);
  assert.equal(s.combat?.nmLocationsOnKill, 2);
  assert.equal(s.nightmare?.southWarg, undefined);
  // The attack (its defender left aside) destroys a character.
  s.choice = null;
  s.queue = [];
  const c = kill(s, warg, characters(s, 0)[0]);
  assert.ok(c.rgsDestroyed);
  s.queue.unshift(...hooks(s).attackFinished!(s, c));
  run(s);
  assert.deepEqual(
    [s.activeLocation!.damage, s.extraActiveLocations![0].damage],
    [2, 2],
  );
  // Its shadow: 1 damage on an active location (the first player chooses).
  const t = board("combat");
  place(t, RS.foothills, true);
  const other = second(t, RS.eregion);
  const attacker = enemy(t, RS.hound, 0);
  shadow(t, attacker, N.warg, characters(t, 0)[0], 0);
  assert.equal(t.combat!.nmLocationOnKill, 1);
  const k = kill(t, attacker, characters(t, 0)[0]);
  t.queue.unshift(...hooks(t).attackFinished!(t, k));
  run(t);
  pick(t, other.id);
  run(t);
  assert.equal(other.damage, 1);
  assert.equal(t.activeLocation!.damage, 0);
  assert.equal(
    isRsWarg(N.warg),
    true,
    "for Great Warg Chief and Storm of Howls",
  );
});

test("Nightmare: Expanse of Hollin's threat counts the enemies in play, and exploring it adds the enemies its damage discards to the staging area", () => {
  const s = board("staging");
  const expanse = place(s, N.expanse);
  enemy(s, RS.hound);
  enemy(s, RS.hound, 0);
  assert.equal(hooks(s).threatBonus!(s, expanse), 3);
  s.encounterDeck = [QUIET, QUIET, QUIET];
  s.encounterDiscard = [RS.hound, RS.hound];
  s.staging = [];
  expanse.damage = 2;
  hooks(s).explored!(s, expanse, true);
  run(s);
  const hounds = s.staging.filter((u) => u.code === RS.hound).length;
  assert.equal(hounds + s.encounterDiscard.length, 2);
  assert.ok(s.encounterDiscard.every((c) => c === QUIET));
  assert.equal(s.encounterDeck.length, 3);
  assert.match(
    logText(s),
    /Expanse of Hollin: the encounter discard pile is shuffled into the encounter deck, then 2 cards are discarded/,
  );
});

test("Nightmare: Slopes of Hithaeglir damages each active location after a 'when revealed' effect is canceled, and its damage raises each player's threat when it is explored", () => {
  const s = board("staging", opening(two()));
  place(s, N.slopes);
  place(s, N.slopes);
  const active = place(s, RS.foothills, true);
  hooks(s).whenRevealedCancelled!(s, RS.crows);
  run(s);
  assert.equal(active.damage, 2, "one for each copy in play");
  const slopes = s.staging.find((u) => u.code === N.slopes)!;
  slopes.damage = 3;
  hooks(s).explored!(s, slopes, true);
  run(s);
  assert.deepEqual(
    seatIndices(s).map((p) => threatOf(s, p)),
    [23, 23],
  );
});

test("Nightmare: Hunted in Hollin raises the revealing player's threat by 6 or engages the lowest engagement cost enemy and reveals a card; its shadow counts the engaged enemies", () => {
  const s = board("staging");
  const hawk = enemy(s, N.hawk);
  const warg = enemy(s, N.warg);
  revealed(s, N.hunted);
  run(s);
  assert.deepEqual(options(s), ["threat", warg.id]);
  pick(s, warg.id);
  run(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === warg.id));
  assert.ok(s.staging.some((u) => u.id === hawk.id));
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "an encounter card is revealed",
  );
  // Without an enemy that can engage, only the threat.
  const t = board("staging");
  enemy(t, RS.watcher);
  revealed(t, N.hunted);
  run(t);
  assert.deepEqual(options(t), ["threat"]);
  pick(t, "threat");
  run(t);
  assert.equal(threatOf(t), 26);
  // Its shadow: each enemy engaged with the defending player, Watcher in the
  // Water (considered engaged with each player) included.
  const u = board("combat");
  enemy(u, RS.watcher);
  const attacker = enemy(u, RS.hound, 0);
  enemy(u, RS.hound, 0);
  shadow(u, attacker, N.hunted, characters(u, 0)[0], 0);
  run(u);
  assert.equal(threatOf(u), 23);
});

test("Nightmare: Shelterless Land surges with doomed 1 and adds each damage on the active locations to the staging area's threat until the end of the phase; its shadow adds attack", () => {
  const s = board("staging");
  const active = place(s, RS.foothills, true);
  active.damage = 3;
  const before = stagingThreat(s);
  revealed(s, N.shelterless);
  run(s);
  assert.equal(threatOf(s), 21, "its printed doomed 1");
  assert.ok(
    s.staging.some((u) => u.code === QUIET),
    "its printed surge",
  );
  assert.equal(stagingThreat(s), before + (card(QUIET).threat ?? 0) + 3);
  active.damage = 4;
  assert.equal(stagingThreat(s), before + (card(QUIET).threat ?? 0) + 4);
  s.phase = "combat";
  assert.equal(stagingThreat(s), before + (card(QUIET).threat ?? 0));
  const t = board("combat");
  place(t, RS.foothills, true).damage = 2;
  second(t, RS.eregion).damage = 1;
  const attacker = enemy(t, RS.hound, 0);
  shadow(t, attacker, N.shelterless, characters(t, 0)[0], 0);
  assert.equal(t.combat!.attackBonus, 3);
});

test("Nightmare: The Ring Goes South's Nightmare state and set-aside Tentacles survive saves, and malformed ones are refused", () => {
  const s = board("staging");
  place(s, RS.foothills, true).damage = 1;
  revealed(s, N.shelterless);
  run(s);
  s.nightmare!.southWarg = "u999";
  assert.ok(valid(s));
  const back = reload(s);
  assert.deepEqual(back.nightmare?.southShelter, s.nightmare?.southShelter);
  assert.equal(back.nightmare?.southWarg, "u999");
  assert.equal(stagingThreat(back), stagingThreat(s));
  const broken = (f: (x: GameState) => void) => {
    const x = reload(s);
    f(x);
    return valid(x);
  };
  assert.equal(
    broken(
      (x) => (x.nightmare!.southShelter = [{ round: -1, phase: "quest" }]),
    ),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmare!.southWarg = 3 as never)),
    false,
  );
  // Five Tentacles, or Tentacles outside Nightmare mode, are refused.
  assert.equal(
    broken((x) => x.ringSouth!.setAside.push(N.tentacle)),
    false,
  );
  assert.equal(
    broken((x) => (x.nightmareMode = false)),
    false,
  );
});

test("Nightmare: The Ring Goes South's seeded Nightmare games finish with valid saves", () => {
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
});
