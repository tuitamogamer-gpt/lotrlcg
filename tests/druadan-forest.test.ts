import assert from "node:assert/strict";
import test from "node:test";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  applyAction as engineAction,
  availableAbilities,
  canTravel,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import {
  advanceQuest,
  damage,
  destroy,
  placeEncounter,
  revealed,
  shadow,
} from "../src/game/board.ts";
import {
  get,
  make,
  playCost,
  questStat,
  stats,
  threatOf,
} from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  allEngaged,
  allHeroes,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import {
  DRUADAN_FOREST as D,
  DRUADAN_FOREST_ENCOUNTERS,
  DRUADAN_FOREST_QUESTS,
  DRUADAN_FOREST_RECIPES,
} from "../src/game/druadan-forest-support.ts";
import {
  druadanForestArchery,
  druadanForestCostIncrease,
  druadanForestRevealEffects,
} from "../src/game/druadan-forest.ts";
import { HEIRS_NUMENOR as H } from "../src/game/heirs-numenor-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";
const starter = STARTERS.find((d) => d.id === "leadership")!;
function raw(players = 1, easy = false) {
  return createGame(731, starter.cards, starter.heroes, starter.id, {
    scenarioId: "the-druadan-forest",
    easy,
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
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function settle(s: GameState) {
  for (let n = 0; n < 200 && s.status === "playing"; n++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) =>
          ["resolve", "skip", "damage", "remove", "discard"].includes(o.id),
        )?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function base(players = 1) {
  const s = settle(raw(players));
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    encounterDeck: Array(40).fill("01099"),
    encounterDiscard: [],
    progress: 0,
    stage: 1,
    victory: 0,
    victoryCards: [],
    druadanForest: { bossSetAside: D.boss },
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      Object.assign(s, {
        threat: 20,
        hand: [],
        discard: [],
        allies: [],
        engaged: [],
        used: [],
        deck: Array(30).fill("01043"),
        committedIds: [],
      });
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 8,
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
  return s;
}
function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json));
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored;
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function enemy(s: GameState, code: string, p = 0) {
  const u = make(s, code);
  forOwner(s, p, () => s.engaged.push(u));
  return u;
}
function attach(s: GameState, u: Unit, code: string, owner?: number) {
  const a = {
    id: `df-a${s.nextId++}`,
    code,
    exhausted: false,
    ...(owner === undefined ? {} : { owner }),
  };
  u.attachments.push(a);
  return a;
}
const multiset = (codes: string[]) =>
  Object.fromEntries(
    [...new Set(codes)]
      .sort()
      .map((c) => [c, codes.filter((x) => x === c).length]),
  );

test("Drúadan registers every original encounter design and exact quest sides including printed Siege", () => {
  assert.equal(DRUADAN_FOREST_ENCOUNTERS.length, 11);
  assert.equal(DRUADAN_FOREST_QUESTS.length, 3);
  for (const c of [...DRUADAN_FOREST_ENCOUNTERS, ...DRUADAN_FOREST_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
  assert.deepEqual(
    [D.pursuit, D.untimely, D.passage].map((c) => card(c).quest),
    [11, 17, 14],
  );
  assert.match(card(D.passage).back_text!, /^Siege\./);
  assert.ok(!card(D.boss).text!.includes("[attack]-buri"));
});
test("one-to-four-player original/easy setup preserves the complete canonical recipe through resolution", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = settle(raw(players, easy));
      const recipe = DRUADAN_FOREST_RECIPES.find(
        (r) => r.id === (easy ? "E03.5" : "Q03.5"),
      )!;
      const expected = recipe.cards
        .filter((c) => c.section !== "sharedQuestDeck")
        .flatMap((c) => Array(c.quantity).fill(c.code));
      const actual = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...allEngaged(s).map((u) => u.code),
        s.druadanForest!.bossSetAside!,
      ];
      assert.deepEqual(multiset(actual), multiset(expected));
      assert.equal(s.druadanForest!.bossSetAside, D.boss);
      assert.ok(!s.staging.some((u) => u.code === D.boss));
      assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
    }
});
test("Prowl X discards one shared total across any players and survives a saved allocation", () => {
  let s = base(3);
  for (const h of allHeroes(s)) h.resources = 1;
  const heroes = allHeroes(s).map((h) => h.id),
    before = allHeroes(s).reduce((n, h) => n + h.resources, 0);
  s = reveal(s, D.elite);
  assert.match(s.choice!.title, /Prowl.*3/);
  s = choose(s, heroes[0]);
  s = reload(s);
  s = choose(s, heroes[3]);
  s = choose(s, heroes[6]);
  assert.equal(
    allHeroes(s).reduce((n, h) => n + h.resources, 0),
    before - 3,
  );
  assert.ok(s.staging.some((u) => u.code === D.elite));
});
test("Prowl discards all available resources when the group cannot match its value", () => {
  let s = base(4);
  allHeroes(s).forEach((h) => (h.resources = 0));
  allHeroes(s)[7].resources = 1;
  s = reveal(s, D.elite);
  s = choose(s, allHeroes(s)[7].id);
  assert.equal(
    allHeroes(s).reduce((n, h) => n + h.resources, 0),
    0,
  );
  assert.equal(s.choice, null);
  assert.equal(druadanForestRevealEffects(s, D.elite, "underworld").length, 0);
});
test("Stars resolves Prowl before its cancellable When Revealed payment and leaves allies questing", () => {
  let s = base();
  const h = s.heroes[0],
    ally = make(s, "01043");
  s.allies.push(ally);
  h.resources = 2;
  h.committed = ally.committed = true;
  s.committedIds = [h.id, ally.id];
  s.hand = [make(s, "01050")];
  s.heroes[1].code = "01007";
  s = reveal(s, D.stars);
  s = choose(s, h.id);
  s = choose(s, h.id);
  assert.match(s.choice!.title, /Revealed/);
  assert.ok(s.choice!.options.some((o) => o.id === "cancel"));
  s = choose(s, "resolve");
  s = choose(s, "remove");
  assert.equal(s.heroes[0].committed, false);
  assert.equal(s.allies[0].committed, true);
  assert.deepEqual(s.committedIds, [ally.id]);
});
test("cancelling Stars cannot refund the independent Prowl keyword", () => {
  let s = base();
  s.heroes[0].resources = 3;
  s.heroes[0].committed = true;
  s.committedIds = [s.heroes[0].id];
  s.hand = [make(s, "01050")];
  s.heroes[1].code = "01007";
  s = reveal(s, D.stars);
  s = choose(s, s.heroes[0].id);
  s = choose(s, s.heroes[0].id);
  s = choose(s, "cancel");
  assert.equal(s.heroes[0].resources, 1);
  assert.equal(s.heroes[0].committed, true);
  assert.ok(s.discard.includes("01050"));
});
test("Men in the Dark offers a decision for every hero, surging only if no actual hero damage occurs", () => {
  let s = base(2),
    ids = allHeroes(s).map((h) => h.id);
  s = reveal(s, D.men);
  for (let i = 0; i < ids.length; i++)
    s = choose(s, i === 2 ? "damage" : "pay");
  assert.equal(get(s, ids[2])!.damage, 1);
  assert.equal(s.staging.length, 0);
  assert.equal(s.druadanForest!.menDamageTaken, undefined);
  s = base();
  s = reveal(s, D.men);
  for (let i = 0; i < 3; i++) s = choose(s, "pay");
  assert.equal(s.staging[0].code, "01099");
});
test("Men's surge tracks replaced damage instead of treating a chosen damage option as damage dealt", () => {
  let s = base();
  s.heroes[0].code = "02025"; // Frodo replaces damage with threat.
  s = reveal(s, D.men);
  s = choose(s, "damage");
  assert.match(s.choice!.title, /Frodo/);
  s = choose(s, s.choice!.options.find((o) => o.id !== "skip")!.id);
  s = reload(s);
  s = choose(s, "pay");
  s = choose(s, "pay");
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.staging[0]?.code, "01099");
});
test("Leaves may pay pooled resources for every controlled attachment or discard them across hosts", () => {
  let s = base(2);
  const h0 = seatView(s, 0).heroes[0],
    h1 = seatView(s, 1).heroes[0];
  attach(s, h0, "01026", 1);
  attach(s, h1, "01048", 0);
  const foe = enemy(s, D.elite, 1);
  attach(s, foe, "01035", 0);
  s = reveal(s, D.leaves);
  s = choose(s, "pay");
  s = choose(s, h0.id);
  s = reload(s);
  s = choose(s, h0.id);
  s = choose(s, "discard");
  assert.equal(seatView(s, 0).heroes[0].resources, 6);
  assert.equal(seatView(s, 0).heroes[0].attachments.length, 1);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 0);
  assert.equal(get(s, foe.id)!.attachments.length, 1);
});
test("Drummers increase only staging Woses; Glade threat uses highest cumulative Wose Archery", () => {
  const s = base(2);
  const drummer = make(s, D.drummer),
    hunter = make(s, D.hunter),
    elite = enemy(s, D.elite, 1);
  s.staging.push(drummer, hunter, make(s, D.glade), make(s, D.glade));
  allHeroes(s).forEach((h) => (h.resources = 0));
  assert.equal(threatOf(s, drummer), 2);
  assert.equal(threatOf(s, hunter), 4);
  assert.equal(threatOf(s, elite), 2);
  assert.equal(druadanForestArchery(s, hunter), 8);
  assert.equal(druadanForestArchery(s, elite), 4);
  assert.equal(threatOf(s, s.staging[2]), 8);
  hunter.blanked = true;
  assert.equal(threatOf(s, s.staging[2]), 4);
  drummer.blanked = true;
  assert.equal(threatOf(s, s.staging[2]), 4);
});
test("at stage 2 Archery must exhaust all ally health before heroes become legal, across reload", () => {
  let s = base(2);
  s.stage = 2;
  s.phase = "encounter";
  const ally = make(s, "01043");
  forOwner(s, 1, () => s.allies.push(ally));
  enemy(s, D.elite);
  s = act(s, { type: "NEXT" });
  if (!s.choice) s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Archery.*2/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [ally.id],
  );
  s = reload(s);
  s = choose(s, ally.id);
  if (get(s, ally.id)) s = choose(s, ally.id); // Guard has two hit points.
  assert.ok(!get(s, ally.id));
  assert.equal(
    allHeroes(s).reduce((n, h) => n + h.damage, 0),
    0,
  );
});
test("stage 2 Archery switches to heroes after the final ally dies within the same allocation", () => {
  let s = base();
  s.stage = 2;
  s.phase = "encounter";
  const ally = make(s, "01043");
  ally.damage = card(ally.code).health! - 1;
  s.allies.push(ally);
  enemy(s, D.elite);
  s = act(s, { type: "NEXT" });
  s = choose(s, ally.id);
  assert.ok(
    s.choice!.options.every((o) => s.heroes.some((h) => h.id === o.id)),
  );
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].damage, 1);
});
test("Ancestral Clearing increases all player play costs in staging and active, respecting blanking", () => {
  const s = base();
  s.staging.push(make(s, D.clearing));
  s.activeLocation = make(s, D.clearing);
  assert.equal(playCost(s, card("01043")), Number(card("01043").cost) + 2);
  assert.equal(playCost(s, card("01050")), Number(card("01050").cost) + 2);
  s.activeLocation.blanked = true;
  assert.equal(druadanForestCostIncrease(s), 1);
  s.activeLocation = null;
  assert.equal(playCost(s, card("01043")), Number(card("01043").cost) + 1);
});
test("Clearing travel pays exhaustion before entering; Garden requires one resource per living player", () => {
  let s = base(2);
  s.phase = "travel";
  placeEncounter(s, D.clearing);
  const l = s.staging[0],
    h = s.heroes[0];
  s = act(s, { type: "TRAVEL", id: l.id });
  assert.equal(s.activeLocation, null);
  s = choose(s, h.id);
  assert.equal(s.activeLocation!.id, l.id);
  assert.equal(s.heroes[0].exhausted, true);
  s = base(2);
  s.phase = "travel";
  placeEncounter(s, D.garden);
  const garden = s.staging[0];
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.resources = 0)));
  assert.match(canTravel(s, garden)!, /Each player/);
  forOwner(s, 1, () => (s.heroes[0].resources = 1));
  s = act(s, { type: "TRAVEL", id: garden.id });
  s = choose(s, seatView(s, 0).heroes[0].id);
  s = reload(s);
  s = choose(s, seatView(s, 1).heroes[0].id);
  assert.equal(s.activeLocation!.id, garden.id);
});
test("Garden blocks Steward, Glóin and Horn card-effect resource gains but preserves ordinary resource phase", () => {
  let s = base();
  s.staging.push(make(s, D.garden));
  const h = s.heroes[0];
  attach(s, h, "01026");
  const before = h.resources;
  assert.throws(
    () =>
      act(s, { type: "ABILITY", id: h.id, attachmentId: h.attachments[0].id }),
    /cannot (gain|collect) resources/,
  );
  assert.equal(s.heroes[0].resources, before);
  s.heroes[0].code = "01003";
  damage(s, s.heroes[0].id, 1);
  flush(s);
  assert.equal(s.heroes[0].resources, before);
  attach(s, s.heroes[0], "01042");
  const ally = make(s, "01043");
  s.allies.push(ally);
  destroy(s, ally);
  flush(s);
  assert.equal(s.heroes[0].resources, before);
  s.phase = "refresh";
  s.choice = null;
  s.queue = [];
  s = engineAction(s, { type: "NEXT" });
  assert.equal(s.phase, "resource");
  assert.equal(s.heroes[0].resources, before + 1);
});
test("Garden suppresses Miruvor's resource option while its other benefits remain legal", () => {
  let s = base();
  s.staging.push(make(s, D.garden));
  const h = s.heroes[0],
    a = attach(s, h, "04133");
  s = act(s, { type: "ABILITY", id: h.id, attachmentId: a.id });
  assert.ok(!s.choice!.options.some((o) => o.id === "resource"));
  s = choose(s, "will");
  s = choose(s, "top");
  assert.equal(s.deck[0], "04133");
});
test("The Passage Out is Siege, adds the public boss once, and requires his victory display presence", () => {
  let s = base();
  s.stage = 2;
  s.progress = 17;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(questStat(s), "defense");
  assert.equal(s.staging.filter((u) => u.code === D.boss).length, 1);
  assert.equal(s.druadanForest!.bossSetAside, undefined);
  s.progress = 99;
  advanceQuest(s);
  assert.equal(s.status, "playing");
  s = reloadedStage(s);
  assert.equal(s.staging.filter((u) => u.code === D.boss).length, 1);
});
function reloadedStage(s: GameState) {
  return reload(s);
}
test("boss prevents allied defenders, including Sentinel, through the public defense action", () => {
  let s = base();
  delete s.druadanForest!.bossSetAside;
  s.phase = "defense";
  const boss = enemy(s, D.boss),
    ally = make(s, "01043");
  s.allies.push(ally);
  assert.throws(
    () => act(s, { type: "DEFEND", enemyId: boss.id, defenderId: ally.id }),
    /ready characters able to defend/,
  );
  assert.equal(s.combat, null);
  s = act(s, { type: "DEFEND", enemyId: boss.id, defenderId: s.heroes[0].id });
  assert.ok(!s.error);
});
test("stage 3 attacks use willpower, accumulate progress, and transfer exactly the enemy's threshold directly to quest", () => {
  let s = base();
  s.stage = 3;
  s.phase = "attack";
  const e = enemy(s, D.elite);
  e.progress = 2;
  s.activeLocation = make(s, "01099");
  const h = s.heroes[0];
  h.tempWill = 8;
  h.tempAttack = 40;
  const beforeDamage = e.damage;
  s = act(s, { type: "ATTACK", enemyId: e.id, attackerIds: [h.id] });
  assert.ok(s.victoryCards!.includes(D.elite));
  assert.ok(!get(s, e.id));
  assert.equal(e.damage, beforeDamage);
  assert.equal(s.progress, 4);
  assert.equal(s.activeLocation!.progress, 0);
  assert.ok(!s.encounterDiscard.includes(D.elite));
  assert.ok(!s.choice?.title.includes("Foe-hammer"));
});
test("peaceful boss removal grants global willpower/defense and wins after transfer without damage responses", () => {
  let s = base(2);
  s.stage = 3;
  s.phase = "attack";
  s.progress = 8;
  delete s.druadanForest!.bossSetAside;
  const boss = enemy(s, D.boss),
    h = s.heroes[0];
  h.tempWill = 20;
  const prior = stats(s, seatView(s, 1).heroes[0]);
  s = act(s, { type: "ATTACK", enemyId: boss.id, attackerIds: [h.id] });
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(D.boss));
  assert.equal(stats(s, seatView(s, 1).heroes[0]).will, prior.will + 1);
  assert.equal(stats(s, seatView(s, 1).heroes[0]).defense, prior.defense + 1);
});
test("Drummer, Hunter and Men shadows use defending player's resources and persist across attacks", () => {
  const s = base(2);
  selectSeat(s, 1);
  const e = enemy(s, D.hunter, 1),
    e2 = enemy(s, D.elite, 1);
  s.heroes[0].resources = s.heroes[1].resources = 0;
  s.combat = {
    enemyId: e.id,
    defenderId: s.heroes[2].id,
    attackBonus: 0,
    defenseBonus: 0,
  };
  shadow(s, D.men);
  assert.equal(s.combat.attackBonus, 2);
  shadow(s, D.hunter);
  assert.equal(s.combat.attackBonus, 4);
  shadow(s, D.drummer);
  assert.equal(s.combat.attackBonus, 5);
  assert.equal(e2.boost, 1);
  shadow(s, D.stars);
  assert.equal(s.heroes[2].resources, 0);
});
test("Elite/Thief shadow offers any player payment after the attack and survives reload", () => {
  let s = base(2);
  s.phase = "defense";
  const e = enemy(s, D.thief),
    h = s.heroes[0];
  e.shadows = [D.elite];
  s.encounterDeck = ["01099"];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: h.id });
  assert.match(s.choice!.title, /Pay 1 resource or return/);
  const payer = seatView(s, 1).heroes[0];
  s = reload(s);
  s = choose(s, payer.id);
  assert.equal(seatView(s, 1).heroes[0].resources, 7);
  assert.ok(allEngaged(s).some((u) => u.id === e.id));
  s = base();
  s.phase = "defense";
  const thief = enemy(s, D.thief);
  thief.shadows = [D.thief];
  s.encounterDeck = ["01099"];
  s = act(s, { type: "DEFEND", enemyId: thief.id, defenderId: s.heroes[0].id });
  s = choose(s, "return");
  assert.ok(s.staging.some((u) => u.id === thief.id));
  assert.ok(!allEngaged(s).some((u) => u.id === thief.id));
});
test("Leaves shadow discards only a defender attachment, leaving other hosts intact", () => {
  let s = base();
  s.phase = "defense";
  const e = enemy(s, D.thief),
    h = s.heroes[0],
    a = attach(s, h, "01026");
  attach(s, s.heroes[1], "01048");
  e.shadows = [D.leaves];
  s.encounterDeck = ["01099"];
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: h.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [a.id],
  );
  s = choose(s, a.id);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.equal(s.heroes[1].attachments.length, 1);
});
test("save validation rejects arbitrary set-aside identity and forged treachery tracking", () => {
  const s = base();
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  const forged = JSON.parse(JSON.stringify(s));
  forged.druadanForest.bossSetAside = D.elite;
  assert.equal(validateSave(forged), false);
  forged.druadanForest.bossSetAside = D.boss;
  forged.druadanForest.menDamageTaken = "yes";
  assert.equal(validateSave(forged), false);
});
test("shared Brooding Forest remains scripted in this scenario", () => {
  const s = base();
  assert.ok(SCRIPTED.has(H.trail));
  assert.ok(SCRIPTED.has(H.glade));
  assert.ok(SCRIPTED.has(H.lostCompanion));
  const trail = make(s, H.trail);
  s.staging.push(trail);
  assert.ok(availableAbilities(s, trail).length > 0);
});
test("Garden prevents Errand-rider resource transfer without exhausting or charging the donor", () => {
  let s = base(2);
  s.staging.push(make(s, D.garden));
  const rider = make(s, "05003");
  s.allies.push(rider);
  const before = allHeroes(s).map((h) => h.resources);
  assert.ok(availableAbilities(s, rider).every((a) => a.disabled));
  assert.throws(
    () => act(s, { type: "ABILITY", id: rider.id }),
    /hero.*resource|another hero/i,
  );
  assert.deepEqual(
    allHeroes(s).map((h) => h.resources),
    before,
  );
  assert.equal(rider.exhausted, false);
});
test("Prowl discards from heroes whose resources cannot currently be spent", () => {
  let s = base();
  allHeroes(s).forEach((h) => (h.resources = 0));
  s.heroes[0].resources = 1;
  s.staging.push(make(s, H.vanguard));
  s = reveal(s, D.hunter);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, 0);
  assert.ok(s.staging.some((u) => u.code === D.hunter));
});
