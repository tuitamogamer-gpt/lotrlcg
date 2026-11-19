import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { check, damage } from "../src/game/board";
import { make, playCost, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { dealEnemyShadows } from "../src/game/considered-engagement";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support";
import { heirsArcheryTotal } from "../src/game/heirs-numenor";
import {
  NIGHTMARE,
  NIGHTMARE_HON as N,
  nightmareCardOf,
  nightmareEncounterDeck,
  nightmareStatus,
} from "../src/game/nightmare";
import { nightmareCairAndrosGoal } from "../src/game/nightmare-cairandros";
import { forOwner, seatIndices, seatView } from "../src/game/table";
import { automatedScenarioId } from "../src/game/support";
import { scenario } from "../src/game/scenarios";
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

/** Pelargir Docks: a location with no "When Revealed" effect and no shadow. */
const QUIET = H.docks;
const SCOUT = "01016"; // Snowbourn Scout, an ally
const EVENT = "01020"; // Ever Vigilant, an event
const game = (seed = 5) => nightmareGame("siege-of-cair-andros", seed);
const two = (seed = 5) => nightmareForTwo("siege-of-cair-andros", seed);
/** A quiet board in `phase`: an empty staging area, threat 20. */
function board(phase: GameState["phase"], s: GameState = opening(game())) {
  calm(s, phase);
  Object.assign(s, {
    stage: 1,
    stageRevealing: false,
    progress: 0,
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill(QUIET),
    encounterDiscard: [],
    combat: null,
    suspendedCombats: [],
    staging: [],
    nightmare: {},
  });
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
const hit = (s: GameState, u: Unit, value: number) => {
  damage(s, u.id, value);
  check(s);
  flush(s);
  return s;
};

test("Nightmare: The Siege of Cair Andros's setup card and Nightmare Deck carry their scans' texts", () => {
  const c = card(N.siegeCard);
  assert.deepEqual(
    [c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["nightmare", "nightmare", "The Siege of Cair Andros - Nightmare", true],
  );
  // The scans give the setup card's removal list, which prints "Orc
  // Arsonists" (the catalog had a generic text), its back's printed
  // "contibute" (the catalog had "contribure"), Southron Mounted Archer's
  // final period, "Besieged Courtyard" in its text (the catalog had
  // "Beseiged"), Walls of Cair Andros' shadow "where X is" and Ruin and
  // Wroth's "Battleground".
  assert.equal(
    c.text,
    "Begin with the standard quest deck and encounter deck for The Siege of Cair Andros scenario.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Southron Mercenaries\n2x Orc Arsonists\n2x Orc Rabble\n3x Orc Arbalesters\n1x The Power of Mordor\n2x Scourge of Mordor\nThen, shuffle the encounter cards in this Nightmare Deck into the remainder of the standard The Siege of Cair Andros encounter deck.\nFinally, flip this setup card over and place it next to the quest deck. Its effect remains active throughout the game, which is now ready to begin.",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nUntil the end of the game, player cards in the victory display do not contibute their victory points.",
  );
  assert.deepEqual(
    [
      N.archer,
      N.saboteur,
      N.ravager,
      N.courtyard,
      N.walls,
      N.wharf,
      N.ruin,
    ].map((x) => card(x).text),
    [
      "Archery 5.\nDamage from each round's archery total may be assigned to Battleground locations, as well as characters.",
      "Damage dealt by Orc Saboteur's attacks must be assigned to a Battleground location in play, if able.",
      "Forced: When Orc Ravager is dealt a shadow card, it gets +2 [defense] until the end of the phase.",
      "If Besieged Courtyard has 5 or more damage, discard it and exhaust each ready character.",
      "If Walls of Cair Andros has 4 or more damage, discard it and each player must assign 4 damage among characters he controls.",
      "If Anduin Wharf has 6 or more damage, discard it and reveal 2 cards from the top of the encounter deck.\nWhile Anduin Wharf is the active location, allies cost 1 additional matching resource to play from hand.",
      "Doomed 2.\nWhen Revealed: Deal 2 shadow cards to each enemy in play. Deal 2 damage to each Battleground location in play.",
    ],
  );
  assert.deepEqual(
    [N.saboteur, N.ravager, N.courtyard, N.walls, N.ruin].map(
      (x) => card(x).shadow,
    ),
    [
      "Shadow: If this attack destroys a character, deal 2 damage to a Battleground location in play.",
      "Shadow: Exhaust a character you control. Deal attacking enemy another shadow card.",
      "Shadow: Choose one: either attacking enemy makes an additional attack after this one, or deal 10 damage to a Battleground location.",
      "Shadow: Attacking enemy gets +X [attack], where X is the amount of damage on the active location.",
      "Shadow: Discard an attachment you control.",
    ],
  );
  const stat = (x: string) => {
    const k = card(x);
    return [k.engagement, k.threat, k.attack, k.defense, k.health, k.traits];
  };
  assert.deepEqual(stat(N.archer), [45, 3, 4, 2, 4, "Harad."]);
  assert.deepEqual(stat(N.saboteur), [21, 2, 5, 2, 5, "Orc."]);
  assert.deepEqual(stat(N.ravager), [30, 3, 3, 1, 4, "Orc."]);
  assert.deepEqual(
    [N.courtyard, N.walls, N.wharf].map((x) => [
      card(x).threat,
      card(x).quest,
      card(x).traits,
    ]),
    [
      [2, 5, "Cair Andros. Battleground."],
      [4, 4, "Cair Andros. Battleground."],
      [3, 6, "Cair Andros. Battleground. Riverland."],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Siege of Cair Andros - Nightmare",
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

test("Nightmare: The Siege of Cair Andros's Nightmare deck matches its source recipe, and player cards' victory points do not count", () => {
  const sets = scenario("siege-of-cair-andros").sets as readonly string[];
  const standard = encounterCards
    .filter(
      (c) => c.type_code !== "campaign" && sets.includes(c.encounter_set ?? ""),
    )
    .flatMap((c) => Array(c.quantity ?? 1).fill(c.code) as string[]);
  const deck = nightmareEncounterDeck("siege-of-cair-andros", standard);
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
  const recipe = recipes.find((r) => r.id === "N03.3")!;
  const want: Record<string, number> = {};
  for (const c of recipe.cards)
    if (
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section) &&
      c.code !== N.siegeCard
    )
      want[c.code] = (want[c.code] ?? 0) + c.quantity;
  assert.deepEqual(count(deck), want);
  for (const [title, n] of Object.entries(
    NIGHTMARE["siege-of-cair-andros"]!.removals,
  ))
    assert.ok(card(N.siegeCard).text!.includes(`${n}x ${title}`), title);
  assert.equal(
    automatedScenarioId({
      name: "The Siege of Cair Andros (Nightmare)",
      mode: "nightmare",
    }),
    "siege-of-cair-andros",
  );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.siegeCard);
    for (const gone of [H.mercenaries, H.arbalesters, H.power, H.scourge])
      assert.ok(!s.encounterDeck.includes(gone));
    assert.match(nightmareStatus(s)[0], /contribute no victory points/);
    assert.equal(hooks(s).victoryValue!(s, SCOUT), 0);
    assert.equal(hooks(s).victoryValue!(s, N.courtyard), undefined);
    assert.ok(valid(s));
  }
  const n = opening(
    createGame(5, d.cards, d.heroes, d.id, {
      scenarioId: "siege-of-cair-andros",
    }),
  );
  assert.equal(batch4Scenario(n).victoryValue?.(n, SCOUT), undefined);
});

test("Nightmare: Besieged Courtyard, Walls of Cair Andros and Anduin Wharf are discarded at their damage with their effects", () => {
  // Besieged Courtyard: each ready character exhausts (two players).
  let s = board("planning", opening(two()));
  const courtyard = add(s, N.courtyard);
  hit(s, courtyard, 4);
  assert.ok(s.staging.includes(courtyard));
  assert.match(nightmareCairAndrosGoal(s)!, /Besieged Courtyard 4\/5/);
  hit(s, courtyard, 1);
  assert.ok(!s.staging.some((u) => u.id === courtyard.id));
  assert.ok(s.encounterDiscard.includes(N.courtyard));
  for (const p of [0, 1])
    assert.ok(
      seatView(s, p).heroes.every((h) => h.exhausted),
      `player ${p}`,
    );
  assert.equal(nightmareCairAndrosGoal(s), undefined);
  // Walls of Cair Andros: each player assigns 4 damage among their characters.
  s = board("planning");
  const walls = add(s, N.walls);
  hit(s, walls, 4);
  for (let i = 0; i < 4; i++) {
    assert.match(s.choice!.title, /Walls of Cair Andros · Assign 1 damage/);
    pick(s, s.heroes[i % 2].id);
  }
  assert.deepEqual(
    s.heroes.slice(0, 2).map((h) => h.damage),
    [2, 2],
  );
  // Anduin Wharf as the active location: 2 cards revealed.
  s = board("planning");
  const wharf = make(s, N.wharf);
  s.activeLocation = wharf;
  hit(s, wharf, 6);
  assert.equal(s.activeLocation, null);
  assert.equal(s.staging.filter((u) => u.code === QUIET).length, 2);
  assert.ok(valid(s));
});

test("Nightmare: Southron Mounted Archer adds archery 5 that may be assigned to Battleground locations", () => {
  const s = board("attack");
  assert.equal(hooks(s).archeryBonus!(s), 0);
  add(s, N.archer);
  add(s, N.archer, true);
  assert.equal(hooks(s).archeryBonus!(s), 10);
  assert.equal(heirsArcheryTotal(s), 10);
  const banks = add(s, H.banks);
  run(s, [{ kind: "heirsArchery", value: 2, player: 0 }] as never);
  assert.ok(s.choice!.options.some((o) => o.id === banks.id));
  pick(s, banks.id);
  pick(s, s.heroes[0].id);
  assert.deepEqual([banks.damage, s.heroes[0].damage], [1, 1]);
  // Without a Southron Mounted Archer, only characters.
  const t = board("attack");
  const approach = add(t, H.approach);
  run(t, [{ kind: "heirsArchery", value: 1, player: 0 }] as never);
  assert.ok(!t.choice!.options.some((o) => o.id === approach.id));
});

test("Nightmare: Orc Saboteur's attack damage goes to a Battleground location, and its shadow damages one after a destroying attack", () => {
  const s = board("defense");
  const sab = add(s, N.saboteur, true);
  const banks = add(s, H.banks);
  const hero = s.heroes[0];
  damage(s, hero.id, 2, { combatDamage: true, enemyId: sab.id });
  flush(s);
  assert.deepEqual([hero.damage, banks.damage], [0, 2]);
  // Two Battlegrounds: a choice.
  const approach = add(s, H.approach);
  damage(s, hero.id, 1, { combatDamage: true, enemyId: sab.id });
  flush(s);
  assert.match(s.choice!.title, /Deal 1 damage to a Battleground location/);
  pick(s, approach.id);
  assert.equal(approach.damage, 1);
  // Another enemy's attack, or damage from an effect, is not redirected.
  const other = add(s, N.ravager, true);
  damage(s, hero.id, 1, { combatDamage: true, enemyId: other.id });
  damage(s, hero.id, 1);
  flush(s);
  assert.equal(hero.damage, 2);
  // No Battleground in play: the defender takes it.
  const t = board("defense");
  const sab2 = add(t, N.saboteur, true);
  damage(t, t.heroes[0].id, 2, { combatDamage: true, enemyId: sab2.id });
  assert.equal(t.heroes[0].damage, 2);
  // Its shadow: a destroying attack deals 2 damage to a Battleground.
  const u = board("defense");
  const banks2 = add(u, H.banks);
  const foe = add(u, N.ravager, true);
  shadow(u, foe, N.saboteur, u.heroes[1]);
  damage(u, u.heroes[1].id, 9, { combatDamage: true, enemyId: foe.id });
  check(u);
  flush(u);
  for (let i = 0; i < 10 && u.choice; i++) pick(u, u.choice.options[0].id);
  assert.equal(banks2.damage, 2);
  assert.ok(valid(u));
});

test("Nightmare: Orc Ravager hardens as it is dealt shadow cards, and its shadow exhausts a character and deals another", () => {
  const s = board("defense");
  const rav = add(s, N.ravager, true);
  dealEnemyShadows(s, rav, 1);
  assert.equal(stats(s, rav).defense, 3);
  dealEnemyShadows(s, rav, 1);
  assert.equal(stats(s, rav).defense, 5);
  assert.ok(valid(s));
  s.phase = "refresh";
  assert.equal(stats(s, rav).defense, 1, "until the end of the phase");
  // Its shadow on another attacker.
  const t = board("defense");
  const foe = add(t, N.saboteur, true);
  shadow(t, foe, N.ravager, t.heroes[0]);
  flush(t);
  assert.match(t.choice!.title, /Orc Ravager · Exhaust a character/);
  pick(t, t.heroes[2].id);
  assert.equal(t.heroes[2].exhausted, true);
  assert.equal(foe.shadows.length, 2, "another shadow card");
  // On an Orc Ravager: the new card hardens it too.
  const u = board("defense");
  const rav2 = add(u, N.ravager, true);
  shadow(u, rav2, N.ravager, u.heroes[0]);
  flush(u);
  pick(u, u.heroes[0].id);
  assert.equal(stats(u, rav2).defense, 3);
});

test("Nightmare: Besieged Courtyard's shadow makes the attacker attack again or deals 10 damage to a Battleground; Walls of Cair Andros' adds the active location's damage", () => {
  const s = board("defense");
  const foe = add(s, N.saboteur, true);
  shadow(s, foe, N.courtyard, s.heroes[0]);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["attack"],
    "no Battleground in play",
  );
  pick(s, "attack");
  assert.deepEqual(
    hooks(s).attackFinished!(s, s.combat!).map((e) => [e.kind, e.target]),
    [["immediateAttack", foe.id]],
  );
  assert.equal(s.nightmare?.courtyard, undefined);
  const t = board("defense");
  const banks = add(t, H.banks);
  const citadel = add(t, H.citadel);
  const foe2 = add(t, N.ravager, true);
  shadow(t, foe2, N.courtyard, t.heroes[0]);
  flush(t);
  pick(t, "damage");
  pick(t, banks.id);
  check(t);
  assert.ok(
    !t.staging.some((u) => u.id === banks.id),
    "The Banks is destroyed at 3",
  );
  assert.equal(citadel.damage, 0);
  // Walls of Cair Andros: +X [attack].
  const u = board("defense");
  const loc = make(u, H.approach);
  loc.damage = 3;
  u.activeLocation = loc;
  const foe3 = add(u, N.ravager, true);
  shadow(u, foe3, N.walls, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 3);
});

test("Nightmare: Anduin Wharf makes allies cost 1 more while it is the active location", () => {
  const s = board("planning");
  const ally = card(SCOUT),
    event = card(EVENT);
  const base = playCost(s, ally);
  const wharf = add(s, N.wharf);
  assert.equal(playCost(s, ally), base, "not in the staging area");
  s.staging = s.staging.filter((u) => u.id !== wharf.id);
  s.activeLocation = wharf;
  assert.equal(playCost(s, ally), base + 1);
  assert.equal(playCost(s, event), Number(event.cost));
});

test("Nightmare: Ruin and Wroth deals 2 shadow cards to each enemy and 2 damage to each Battleground, and its shadow discards an attachment", () => {
  let s = board("staging");
  const staged = add(s, N.saboteur),
    engaged = add(s, N.ravager, true),
    courtyard = add(s, N.courtyard),
    banks = add(s, H.banks);
  courtyard.damage = 3;
  s = reveal(s, N.ruin);
  assert.equal(s.threat, 22, "Doomed 2");
  const st = s.staging.find((u) => u.id === staged.id)!,
    en = s.engaged.find((u) => u.id === engaged.id)!;
  assert.deepEqual([st.shadows.length, en.shadows.length], [2, 2]);
  assert.equal(stats(s, en).defense, 5, "Orc Ravager, 2 shadow cards");
  assert.equal(s.staging.find((u) => u.id === banks.id)!.damage, 2);
  assert.ok(
    !s.staging.some((u) => u.id === courtyard.id),
    "Besieged Courtyard reaches 5",
  );
  assert.ok(s.heroes.every((h) => h.exhausted));
  assert.ok(s.encounterDiscard.includes(N.ruin));
  // Its shadow.
  const t = board("defense");
  const foe = add(t, N.ravager, true);
  t.heroes[0].attachments.push({
    id: "att1",
    code: "01036",
    exhausted: false,
    owner: 0,
  } as never);
  shadow(t, foe, N.ruin, t.heroes[0]);
  flush(t);
  assert.match(t.choice!.title, /Ruin and Wroth · Discard an attachment/);
  pick(t, "att1");
  assert.equal(t.heroes[0].attachments.length, 0);
});

test("Nightmare: The Siege of Cair Andros's Nightmare state survives saves, and seeded games finish with valid saves", () => {
  const s = board("planning");
  s.nightmare = {
    ravager: { round: 2, phase: "combat", bonus: { u1: 2 } },
    saboteur: [{ enemyId: "u1", player: 0 }],
    courtyard: [{ enemyId: "u2", player: 1 }],
  };
  assert.ok(valid(s));
  for (const bad of [
    { ravager: { round: 1, phase: "combat", bonus: { u1: 0 } } },
    { saboteur: [{ enemyId: 1, player: 0 }] },
    { courtyard: "x" },
  ]) {
    s.nightmare = bad as never;
    assert.equal(valid(s), false, JSON.stringify(bad));
  }
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `siege-of-cair-andros seed ${seed}`);
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", "two-player siege-of-cair-andros");
  // From stage 2, a Besieged Courtyard and an Orc Saboteur in play.
  const t = opening(game(3));
  calm(t, "planning");
  t.stage = 2;
  t.staging.push(make(t, N.courtyard), make(t, N.saboteur));
  const u = autoplay(t, 3000);
  assert.notEqual(u.status, "playing", "from stage 2");
});
