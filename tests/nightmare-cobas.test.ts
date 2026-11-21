import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STARTERS, card, encounterCards } from "../src/game/cards";
import { engage, revealed, shadow } from "../src/game/board";
import {
  cannotReady,
  fx,
  get,
  locationQuest,
  make,
  prepend,
  stats,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { isShipObjective } from "../src/game/ships";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import {
  beginSailingTest,
  sailingContinue,
  sailingSymbols,
} from "../src/game/sailing";
import {
  COBAS as C,
  COBAS_DOL_AMROTH,
  COBAS_OBJECTIVES,
  cobasGuardIds,
} from "../src/game/cobas-support";
import {
  cobasAbility,
  cobasArchery,
  cobasQuestEnd,
  cobasSailingExtraCards,
  cobasWaterAbilities,
} from "../src/game/cobas";
import {
  NIGHTMARE,
  NIGHTMARE_DC as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import { autoplay, choose, opening, reload, valid } from "./nightmare-fixtures";
import { settle } from "./cobas-fixtures";

const ID = "a-storm-on-cobas-haven";
const hooks = (s: GameState) => batch4Scenario(s);
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** A Nightmare mode game as created, before the setup's objective. */
function created(players = 1, seed = 41) {
  const d = STARTERS[0];
  return createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: ID,
    nightmare: true,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
}
const start = (players = 1, seed = 41) => opening(created(players, seed));
/** A quiet Nightmare board in the planning phase (cobas-fixtures' base, in Nightmare mode). */
function board(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDeck: Array(30).fill("01099"),
    encounterDiscard: [],
  });
  if (s.flow) s.flow.pending = null;
  s.sailing = { heading: 0 };
  Object.assign(s.cobas!, {
    advancing: false,
    belfalas: [],
    capturePending: [],
    pendingGuarded: [],
    corsairDiscard: [],
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      for (const u of [...s.heroes, ...s.allies])
        Object.assign(u, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  selectSeat(s, 0);
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
  }
  syncSeat(s);
  return s;
}
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
const pick = (s: GameState, id: string) => {
  const o = s.choice!.options.find(
    (o) => o.id === id || o.effects.some((e) => e.target === id),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return choose(s, o.id);
};
const shipOf = (s: GameState) => s.allies.find(isShipObjective)!;
const unit = (s: GameState, id: string) =>
  allCharacters(s).find((u) => u.id === id) ??
  [...s.staging, ...allEngaged(s)].find((u) => u.id === id)!;
function combat(s: GameState, enemy: Unit, defender?: Unit) {
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
    attackBonus: 0,
    damageDealt: 0,
    attackPlayer: 0,
  };
  return s.combat;
}

test("Nightmare: A Storm on Cobas Haven's setup card and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(N.cobasCard);
  assert.equal(setup.type_code, "nightmare");
  for (const line of [
    "2x Belfalas Islet",
    "2x Cobas Haven",
    "2x Fog Bank",
    "2x Corsair Skirmisher",
    "1x Ramming Speed!",
    "2x Corsair Infiltrator",
    "1x Cunning Pirate",
    "1x Umbar Raider",
  ])
    assert.ok(setup.text!.includes(`${line}\n`), line);
  assert.ok(setup.text!.endsWith("discarded during a Sailing test."));
  const back = setup.back_text!.split("\n");
  assert.equal(back.length, 4);
  assert.match(back[1], /choose randomly among all 6 Dol Amroth objectives/);
  assert.equal(back[2], "Raider Flagship cannot guard objectives.");
  assert.match(back[3], /no more than 5 progress can be placed/);
  for (const code of [N.aearlang, N.docks]) {
    const c = card(code);
    assert.deepEqual(
      [c.type_code, c.traits, c.is_unique, c.victory, c.quantity],
      ["objective", "Dol Amroth. Besieged.", true, undefined, 1],
    );
    assert.ok(c.text!.startsWith("Guarded.\n"));
    assert.equal(c.text!.split("\n").length, 3);
    assert.equal(sailingSymbols(code), 1);
  }
  assert.deepEqual(
    [N.ramming, N.fang].map((code) => {
      const c = card(code);
      return [
        c.type_code,
        c.engagement,
        c.threat,
        c.attack,
        c.defense,
        c.health,
        c.quantity,
        c.traits,
      ];
    }),
    [
      ["ship-enemy", 28, 4, 4, 3, 8, 2, "Corsair. Ship."],
      ["enemy", 42, 2, 5, 3, 3, 3, "Corsair."],
    ],
  );
  assert.equal((card(N.fang).text!.match(/Fang of Sahír/g) ?? []).length, 2);
  assert.deepEqual(
    [N.citySiege, N.seaWall, N.warTorn].map((code) => {
      const c = card(code);
      return [c.threat, c.quest, c.quantity, c.traits, c.victory];
    }),
    [
      [2, 6, 3, "Coastland. Ocean.", undefined],
      [2, 2, 3, "Coastland. Ocean.", undefined],
      [3, 5, 2, "Coastland. Ocean.", undefined],
    ],
  );
  assert.equal(card(N.warTorn).text!.split("\n").length, 2);
  assert.equal(card(N.rudder).text!.split("\n").length, 2);
  assert.deepEqual(
    [N.rudder, N.grappled, N.ramming, N.citySiege].map(sailingSymbols),
    [1, 0, 0, 0],
  );
  const set = encounterCards.filter(
    (c) => c.encounter_set === "A Storm on Cobas Haven - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, c) => n + (c.type_code === "nightmare" ? 0 : (c.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((c) => c.code === a.code)).length,
    11,
  );
  const s = start();
  assert.equal(nightmareCardOf(s), N.cobasCard);
  assert.match(
    nightmareStatus(s)[0],
    /Raider Flagship cannot guard objectives/,
  );
});

test("Nightmare: A Storm on Cobas Haven's encounter deck and Corsair deck match the source recipe, with the printed third City Under Siege", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.8")!;
  const section = (name: string) =>
    tally(
      recipe.cards
        .filter((c) => c.section === name)
        .flatMap((c) => Array<string>(c.quantity).fill(c.code)),
    );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(N.cobasCard).text!.includes(`${n}x ${title}\n`), title);
  // The recipe lists two copies; the printed set numbers 8-10 are three.
  const expected = section("sharedEncounterDeck");
  expected[N.citySiege] += 1;
  // The recipe's staging area holds all six Dol Amroth objectives, which
  // the setup shuffles into the encounter deck to choose one at random.
  for (const code of COBAS_DOL_AMROTH) {
    assert.equal(section("sharedStagingArea")[code], 1);
    expected[code] = 1;
  }
  for (const players of [1, 2]) {
    const s = created(players);
    assert.deepEqual(tally(s.encounterDeck), expected);
    assert.deepEqual(
      tally(s.cobas!.corsairDeck),
      section("sharedEncounterDeck2"),
    );
  }
});

test("Nightmare: during setup the Dol Amroth objective is chosen at random among all six, with no choice offered", () => {
  const chosen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6])
    for (const players of [1, 2]) {
      let s = created(players, seed);
      for (let i = 0; i < 120 && s.phase === "setup"; i++) {
        assert.notEqual(s.choice?.title, "Prepare Dol Amroth’s defenses");
        s = s.choice
          ? choose(s, s.choice.options[0].id)
          : s.flow?.pending
            ? applyAction(reload(s), {
                type: "CONTINUE",
                stepId: s.flow.pending.id,
              })
            : applyAction(reload(s), { type: "KEEP" });
      }
      const staged = s.staging.filter((u) => COBAS_DOL_AMROTH.includes(u.code));
      assert.ok(staged.length >= 1);
      assert.match(
        s.log.map((l) => l.text).join("\n"),
        new RegExp(
          `${card(staged[0].code).name} is chosen at random among the 6 Dol Amroth objectives`,
        ),
      );
      assert.equal(
        [
          ...s.encounterDeck,
          ...s.encounterDiscard,
          ...s.staging.map((u) => u.code),
        ].filter((c) => COBAS_DOL_AMROTH.includes(c)).length,
        6,
      );
      chosen.add(staged[0].code);
      assert.ok(valid(s));
    }
  assert.ok(chosen.has(N.aearlang) && chosen.has(N.docks));
  assert.ok([...chosen].some((c) => COBAS_OBJECTIVES.includes(c)));
});

test("Nightmare: Raider Flagship cannot guard objectives", () => {
  let s = board();
  const o = add(s, C.gull),
    flagship = make(s, C.flagship);
  s.engaged.push(flagship);
  s.encounterDeck = [C.coast, C.coast];
  // The Raiders' Assault finds no other Ship enemy, so it gains surge.
  revealed(s, C.assault);
  s = finish(s);
  const f = allEngaged(s).find((u) => u.id === flagship.id)!;
  assert.deepEqual(cobasGuardIds(f), []);
  assert.ok(s.staging.some((u) => u.code === C.coast));
  assert.ok(!s.staging.find((u) => u.id === o.id)!.exhausted);
  assert.ok(valid(s));
});

test("Nightmare: while a player is engaged with Raider Flagship, no more than 5 progress is placed on the current quest each round", () => {
  const s = board();
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 4);
  s.engaged.push(make(s, C.flagship));
  addCurrentQuestProgress(s, 4);
  assert.equal(s.progress, 5);
  addCurrentQuestProgress(s, 3);
  assert.equal(s.progress, 5);
  assert.match(nightmareStatus(s)[0], /\(5 placed this round\)/);
  assert.ok(valid(s));
  s.round += 1;
  addCurrentQuestProgress(s, 7);
  assert.equal(s.progress, 10);
  s.engaged = [];
  addCurrentQuestProgress(s, 2);
  assert.equal(s.progress, 12);
});

test("Nightmare: Aearlang readies a hero and Docks of Dol Amroth heals 2 damage from a Ship objective while the players control them", () => {
  let s = board();
  const aearlang = add(s, N.aearlang),
    docks = add(s, N.docks),
    guard = add(s, C.scout);
  const hero = s.heroes[0],
    ship = shipOf(s);
  hero.exhausted = true;
  ship.damage = 3;
  guard.guarding = aearlang.id;
  assert.match(
    hooks(s).abilityProblem!(s, aearlang)!,
    /controlled by the players/,
  );
  delete guard.guarding;
  assert.equal(hooks(s).abilityProblem!(s, aearlang), null);
  s = applyAction(reload(s), { type: "ABILITY", id: aearlang.id });
  s = finish(pick(s, hero.id));
  assert.equal(unit(s, hero.id).exhausted, false);
  assert.ok(unit(s, aearlang.id).exhausted);
  assert.match(
    hooks(s).abilityProblem!(s, unit(s, aearlang.id))!,
    /ready and unblanked/,
  );
  s = applyAction(reload(s), { type: "ABILITY", id: docks.id });
  s = finish(pick(s, ship.id));
  assert.equal(unit(s, ship.id).damage, 1);
  assert.ok(unit(s, docks.id).exhausted);
  // Nothing left to heal or ready.
  const fresh = board();
  const idle = add(fresh, N.aearlang),
    dock = add(fresh, N.docks);
  assert.match(hooks(fresh).abilityProblem!(fresh, idle)!, /exhausted hero/);
  assert.match(hooks(fresh).abilityProblem!(fresh, dock)!, /damaged Ship/);
});

test("Nightmare: Ramming Ship cannot have attachments and gets +4 attack after it engages; its shadow puts the top Corsair into play engaged and deals it a shadow card", () => {
  let s = board();
  const ram = add(s, N.ramming);
  assert.ok(hooks(s).cannotAttach!(s, ram, "01062"));
  engage(s, ram);
  s = finish(s);
  const engaged = allEngaged(s).find((u) => u.id === ram.id)!;
  assert.equal(stats(s, engaged).attack, 8);
  s = board();
  const enemy = make(s, C.siege);
  enemy.shadows = [N.ramming];
  enemy.revealedShadowCount = 1;
  s.engaged.push(enemy);
  combat(s, enemy, s.heroes[0]);
  s.cobas!.corsairDeck = [C.sailor, C.pirate];
  shadow(s, N.ramming);
  flush(s);
  const sailor = s.engaged.find((u) => u.code === C.sailor)!;
  assert.ok(sailor);
  assert.equal(sailor.shadows.length, 1);
  assert.deepEqual(s.cobas!.corsairDeck, [C.pirate]);
});

test("Nightmare: Fang of Sahír's engagement deals 3 damage to a Ship objective its player controls, or it makes an immediate attack", () => {
  let s = board();
  const fang = add(s, N.fang),
    ship = shipOf(s);
  engage(s, fang);
  flush(s);
  assert.equal(s.choice?.title, "Fang of Sahír · Forced");
  assert.ok(s.choice!.options.some((o) => o.id === "attack"));
  s = finish(choose(s, ship.id));
  assert.equal(unit(s, ship.id).damage, 3);
  // Without a Ship objective of its own, the player is attacked.
  s = board();
  const other = add(s, N.fang);
  s.engaged.push(other);
  s.staging = s.staging.filter((u) => u.id !== other.id);
  s.allies = s.allies.filter((u) => !isShipObjective(u));
  hooks(s).effect!(s, fx("ncbFang", { target: other.id, player: 0 }));
  assert.ok(
    s.queue.some((e) => e.kind === "immediateAttack" && e.target === other.id),
  );
});

test("Nightmare: City Under Siege adds archery 2 to the combined total and sends archery damage to Ship objectives; its shadow returns a guarding attacker to the staging area", () => {
  let s = board();
  add(s, N.citySiege);
  add(s, N.citySiege);
  assert.equal(cobasArchery(s, 0), 4);
  add(s, C.heron);
  assert.equal(cobasArchery(s, 1), 1);
  const characters = allCharacters(s);
  assert.deepEqual(
    hooks(s).archeryTargets!(s, characters)!.map((u) => u.id),
    characters.filter(isShipObjective).map((u) => u.id),
  );
  // Without City Under Siege in the staging area, any character may take it.
  s = board();
  assert.equal(
    hooks(s).archeryTargets!(s, allCharacters(s))!.length,
    allCharacters(s).length,
  );
  const o = add(s, C.gull),
    enemy = make(s, C.siege);
  enemy.guarding = o.id;
  s.engaged.push(enemy);
  const c = combat(s, enemy, s.heroes[0]);
  shadow(s, N.citySiege);
  assert.equal(s.combat!.ncbReturn, true);
  assert.ok(valid(s));
  assert.equal(reload(s).combat!.ncbReturn, true);
  prepend(s, ...hooks(s).attackFinished!(s, c));
  s = finish(s);
  const back = s.staging.find((u) => u.id === enemy.id)!;
  assert.ok(back);
  assert.equal(back.guarding, o.id);
  assert.ok(!allEngaged(s).some((u) => u.id === enemy.id));
});

test("Nightmare: Sea-wall gets +2 threat and +2 quest points for each guarded objective, and its shadow gives the attacker +1 attack for each", () => {
  const s = board();
  const wall = add(s, N.seaWall),
    a = add(s, C.gull),
    b = add(s, N.docks);
  assert.deepEqual([threatOf(s, wall), locationQuest(s, wall)], [2, 2]);
  add(s, C.scout).guarding = a.id;
  assert.deepEqual([threatOf(s, wall), locationQuest(s, wall)], [4, 4]);
  add(s, N.warTorn).guarding = b.id;
  assert.deepEqual([threatOf(s, wall), locationQuest(s, wall)], [6, 6]);
  const enemy = make(s, C.siege);
  s.engaged.push(enemy);
  combat(s, enemy, s.heroes[0]);
  shadow(s, N.seaWall);
  assert.equal(s.combat!.attackBonus, 2);
});

test("Nightmare: War-torn Waters guards an unguarded objective at the end of the quest phase, and travelling to it deals 2 damage to each Ship objective", () => {
  let s = board(2);
  const o = add(s, C.sea),
    waters = add(s, N.warTorn);
  s.phase = "quest";
  cobasQuestEnd(s);
  s = finish(s);
  assert.equal(s.staging.find((u) => u.id === waters.id)!.guarding, o.id);
  assert.equal(cobasSailingExtraCards(s), 0);
  const effects = hooks(s).travelEffects!(
    s,
    s.staging.find((u) => u.id === waters.id)!,
  )!;
  assert.deepEqual(
    effects.map((e) => e.kind),
    ["ncbWarTornTravel"],
  );
  prepend(s, ...effects);
  s = finish(s);
  const ships = allCharacters(s).filter(isShipObjective);
  assert.ok(ships.length >= 2);
  assert.ok(ships.every((u) => u.damage === 2));
  assert.ok(valid(s));
});

test("Nightmare: Broken Rudder attaches to a Ship objective, cancels each Sailing symbol found unless its ship takes 1 damage, attaches itself to a committed ship after the test that discards it, and is discarded by exhausting 3 characters", () => {
  let s = board();
  const ship = shipOf(s);
  revealed(s, N.rudder);
  flush(s);
  s = finish(pick(s, ship.id));
  const host = () => unit(s, ship.id);
  assert.equal(host().attachments.filter((a) => a.code === N.rudder).length, 1);
  // A Sailing test finds 2 symbols; keeping 1 deals 1 damage to the ship.
  s.phase = "quest";
  s.sailing = { heading: 1 };
  s.encounterDeck = [C.heavy, N.aearlang, ...s.encounterDeck];
  beginSailingTest(s);
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[1].id);
  s = choose(s, "done");
  sailingContinue(s);
  flush(s);
  assert.equal(s.choice?.title, "Broken Rudder · Sailing symbols");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["rudder-0", "rudder-1", "rudder-2"],
  );
  s = choose(s, "rudder-1");
  flush(s);
  assert.equal(s.sailing!.test!.successes, 1);
  s = choose(s, "sailing-heading-1");
  s = finish(s);
  assert.equal(s.sailing!.heading, 1);
  assert.equal(host().damage, 1);
  // Discarded by the next test, it attaches to the committed Ship objective.
  const rudder = host().attachments.find((a) => a.code === N.rudder)!;
  host().attachments = host().attachments.filter((a) => a.id !== rudder.id);
  s.encounterDeck = [N.rudder, ...s.encounterDeck];
  beginSailingTest(s);
  s = choose(s, ship.id);
  s = choose(s, "done");
  sailingContinue(s);
  s = finish(s);
  assert.equal(host().attachments.filter((a) => a.code === N.rudder).length, 1);
  assert.ok(!s.encounterDiscard.includes(N.rudder));
  assert.ok(valid(s));
  // Its Action: exhaust 3 characters you control.
  s.phase = "planning";
  for (const u of allCharacters(s)) u.exhausted = false;
  const attached = host().attachments.find((a) => a.code === N.rudder)!;
  assert.deepEqual(
    cobasWaterAbilities(s, host()).map((a) => a.label),
    ["Broken Rudder · Exhaust 3 characters you control to discard"],
  );
  cobasAbility(s, host(), attached.id);
  s = finish(s);
  assert.ok(!host().attachments.some((a) => a.code === N.rudder));
  assert.ok(s.encounterDiscard.includes(N.rudder));
});

test("Nightmare: Grappled! attaches to a Ship objective that then cannot ready; its shadow attaches it to a defending Ship", () => {
  let s = board();
  const ship = shipOf(s);
  revealed(s, N.grappled);
  flush(s);
  s = finish(pick(s, ship.id));
  const host = unit(s, ship.id);
  assert.ok(host.attachments.some((a) => a.code === N.grappled));
  assert.ok(cannotReady(host, s));
  assert.deepEqual(
    cobasWaterAbilities(s, host).map((a) => a.label),
    ["Grappled! · Exhaust 3 characters you control to discard"],
  );
  s = board();
  const enemy = make(s, C.siege),
    defender = shipOf(s);
  enemy.shadows = [N.grappled];
  enemy.revealedShadowCount = 1;
  s.engaged.push(enemy);
  combat(s, enemy, defender);
  shadow(s, N.grappled);
  assert.equal(enemy.shadows.length, 0);
  assert.ok(defender.attachments.some((a) => a.code === N.grappled));
  // A defending hero is not a Ship.
  s = board();
  const other = make(s, C.siege);
  other.shadows = [N.grappled];
  other.revealedShadowCount = 1;
  s.engaged.push(other);
  combat(s, other, s.heroes[0]);
  shadow(s, N.grappled);
  assert.equal(other.shadows.length, 1);
  assert.ok(!s.heroes[0].attachments.length);
});

test("Nightmare: A Storm on Cobas Haven's lasting effects survive a reload, and invalid ones are rejected", () => {
  const s = board();
  s.nightmare = {
    cobasProgress: {
      round: s.round,
      quest: `quest:${C.outmaneuver}`,
      placed: 3,
    },
  };
  assert.ok(valid(s));
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  for (const bad of [
    { cobasProgress: { round: s.round + 1, quest: "q", placed: 1 } },
    { cobasProgress: { round: s.round, quest: "q", placed: 0 } },
    { cobasProgress: { round: s.round, quest: 4, placed: 1 } },
  ]) {
    const t = structuredClone(s);
    t.nightmare = bad as GameState["nightmare"];
    assert.ok(!valid(t), JSON.stringify(bad));
  }
  const t = structuredClone(s);
  const enemy = make(t, C.siege);
  t.engaged.push(enemy);
  (combat(t, enemy) as unknown as { ncbReturn: unknown }).ncbReturn = "yes";
  assert.ok(!valid(t));
  assert.ok(get(t, enemy.id));
});

test("Nightmare: A Storm on Cobas Haven Nightmare games keep valid saves to their end", () => {
  for (const players of [1, 2])
    for (const seed of [3, 7, 11]) {
      const s = autoplay(start(players, seed), 3000);
      assert.ok(valid(s), `${players} players, seed ${seed}`);
    }
});
