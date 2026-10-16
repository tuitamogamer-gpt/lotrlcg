import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  make,
  prepend,
  stats,
  threatOf,
  locationQuest,
} from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  placeEncounter,
  progressLocation,
  readyCharacter,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import {
  WILDS_RHOVANION as W,
  WILDS_RHOVANION_RECIPES,
  wildsRhovanionBeginEncounter,
  wildsRhovanionQuestSucceeded,
  wildsRhovanionTravelEntered,
  wildsRhovanionCardEntered,
  wildsRhovanionEngaged,
  wildsRhovanionCheck,
  wildsRhovanionShadow,
  wildsRhovanionEnemyDestination,
  wildsRhovanionFinishShadows,
  wildsRhovanionAttackFinished,
  wildsRhovanionDamageAmount,
} from "../src/game/wilds-rhovanion";
import {
  base,
  choose,
  reload,
  setStage,
  settle,
  start,
} from "./wilds-rhovanion-fixtures";
import type { GameState, ScenarioId, Unit } from "../src/game/types";
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState, prefer?: string) => {
  flush(s);
  return settle(s, prefer);
};
const combat = (s: GameState, e: Unit, d?: Unit) => {
  s.combat = {
    enemyId: e.id,
    attackPlayer: 0,
    defenderId: d?.id ?? null,
    defenderIds: d ? [d.id] : [],
    attackBonus: 0,
  };
};
for (const id of [
  "journey-up-the-anduin",
  "lost-in-mirkwood",
  "the-kings-quest",
] as ScenarioId[])
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true])
      test(`Wilds original ${id} ${players}p ${easy ? "easy" : "standard"} setup uses every physical pile and reloads`, () => {
        const s = reload(start(id, players, easy)),
          q = s.wildsRhovanion!;
        assert.equal(s.status, "playing");
        assert.equal(q.initialized, true);
        assert.equal(s.stage, 1);
        assert.equal(q.currentQuest, mainQuestUnit(s)!.code);
        if (id === "journey-up-the-anduin") {
          assert.equal(q.evilDeck.length, easy ? 6 : 8);
          assert.equal(q.setAside.length, 2);
          assert.equal(
            s.staging.filter((u) => card(u.code).type_code === "location")
              .length,
            players,
          );
          assert.equal(
            s.encounterDeck.length + s.encounterDiscard.length + players,
            easy ? 22 : 35,
          );
        }
        if (id === "the-kings-quest") {
          assert.equal(q.cavesDeck.length, 6);
          assert.equal(q.setAside.length, easy ? 4 : 6);
          assert.equal(s.staging.length, players);
          assert.equal(
            s.encounterDeck.length + s.encounterDiscard.length + players,
            easy ? 26 : 35,
          );
        }
        if (id === "lost-in-mirkwood") {
          assert.equal(
            allCharacters(s).filter((u) => u.code === W.haldan).length,
            1,
          );
          assert.equal(
            s.staging.filter((u) => u.code === "01096").length,
            players,
          );
          assert.ok(q.setAside.length > 0);
          assert.equal(q.questDeck.length, 6);
        }
      });
test("Anduin stage resource Then adds a physical Evil Creature only after successful questing", () => {
  let s = base();
  s.wildsRhovanion!.evilDeck = ["01082", "01085"];
  wildsRhovanionBeginEncounter(s);
  s = finish(s);
  assert.equal(s.staging.length, 0);
  wildsRhovanionQuestSucceeded(s, 3);
  assert.equal(s.wildsRhovanion!.questResources, 1);
  wildsRhovanionBeginEncounter(s);
  s = finish(s);
  assert.equal(s.wildsRhovanion!.questResources, 0);
  assert.equal(s.staging[0].code, "01082");
  assert.deepEqual(s.wildsRhovanion!.evilDeck, ["01085"]);
});
test("Anduin cannot advance through Evil Creatures and their victory never leaves the auxiliary cycle", () => {
  let s = base();
  s.progress = 10;
  const troll = add(s, "01082");
  destroy(s, troll);
  s = finish(s);
  assert.ok(!s.victoryCards?.includes("01082"));
  assert.ok(s.wildsRhovanion!.evilDiscard.includes("01082"));
  assert.equal(s.stage, 2);
});
test("Anduin native stage2 location progress cap tracks each physical location per round", () => {
  const s = base();
  setStage(s, 2);
  const a = add(s, W.hills),
    b = add(s, W.lonely);
  progressLocation(s, a, 4);
  progressLocation(s, a, 2);
  progressLocation(s, b, 3);
  assert.equal(a.progress, 1);
  assert.equal(b.progress, 1);
  s.round++;
  progressLocation(s, a, 2);
  assert.equal(a.progress, 2);
});
test("Woodmen Village flips the same physical card to guarded Haldan, whose guard defeat transfers control", () => {
  let s = base();
  setStage(s, 2);
  s.wildsRhovanion!.evilDeck = ["01085"];
  const village = s.wildsRhovanion!.setAside.splice(
    s.wildsRhovanion!.setAside.findIndex((u) => u.code === W.village),
    1,
  )[0];
  s.activeLocation = village;
  progressLocation(s, village, 4);
  s = finish(s);
  const haldan = s.staging.find((u) => u.code === W.haldan)!;
  assert.equal(haldan.id, village.id);
  const guard = s.staging.find((u) => u.guarding === haldan.id)!;
  assert.equal(guard.code, "01085");
  destroy(s, guard);
  s = finish(s);
  assert.equal(
    allCharacters(s).find((u) => u.code === W.haldan)!.id,
    village.id,
  );
  assert.ok(!s.encounterDiscard.includes(W.village));
});
test("Native Old Ford travel requires five progress and uses dynamic quest points and staged enemy attacks", () => {
  let s = base();
  setStage(s, 3);
  const ford = s.wildsRhovanion!.setAside.splice(
    s.wildsRhovanion!.setAside.findIndex((u) => u.code === W.ford),
    1,
  )[0];
  s.staging = [ford];
  s.phase = "travel";
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: ford.id }),
    /5 progress/,
  );
  s.progress = 5;
  const e = add(s, W.stray);
  assert.equal(locationQuest(s, ford), 10);
  s = applyAction(reload(s), { type: "TRAVEL", id: ford.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, ford.id);
  destroy(s, e);
  progressLocation(s, ford, 5);
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Native Deep travel discards its physical location, draws one Caves card and preserves pending saves", () => {
  let s = base("the-kings-quest");
  s.phase = "travel";
  const cave = s.wildsRhovanion!.cavesDeck[0];
  cave.code = W.lake;
  s.wildsRhovanion!.cavesDeck = [cave];
  const tunnel = add(s, W.tunnel);
  s = applyAction(reload(s), { type: "TRAVEL", id: tunnel.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, cave.id);
  assert.deepEqual(s.encounterDiscard, [W.tunnel]);
  assert.equal(s.wildsRhovanion!.cavesDeck.length, 0);
});
test("Forked Passage orders physical caves, enters victory, then Deep resolves after the response", () => {
  let s = base("the-kings-quest");
  s.phase = "travel";
  const caves = s.wildsRhovanion!.cavesDeck.slice(0, 2);
  s.wildsRhovanion!.cavesDeck = caves;
  const fork = add(s, W.fork);
  s = applyAction(reload(s), { type: "TRAVEL", id: fork.id });
  assert.match(s.choice!.title, /Forked Passage/);
  s = choose(reload(s), "use");
  s = settle(s);
  assert.ok(s.victoryCards?.includes(W.fork));
  assert.ok(!s.encounterDiscard.includes(W.fork));
  assert.equal(s.activeLocation?.id, caves[0].id);
  assert.equal(s.wildsRhovanion!.cavesDeck[0].id, caves[1].id);
});
test("Three victory locations reveal Lower Depths and put Hoard on the actual bottom of Caves", () => {
  let s = base("the-kings-quest");
  s.victoryCards = [W.armory, W.cavern, W.lake];
  check(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.wildsRhovanion!.cavesDeck.at(-1)!.code, W.hoard);
  assert.ok(s.staging.some((u) => u.code === W.drake));
  assert.ok(!s.wildsRhovanion!.setAside.some((u) => u.code === W.breath));
});
test("Fire-drake X stats scale with living players and Hoard blocks all damage until explored", () => {
  const s = base("the-kings-quest", 4);
  setStage(s, 3);
  const drake = s.wildsRhovanion!.setAside.find((u) => u.code === W.drake)!;
  s.wildsRhovanion!.setAside = s.wildsRhovanion!.setAside.filter(
    (u) => u.id !== drake.id,
  );
  s.staging.push(drake);
  assert.equal(threatOf(s, drake), 5);
  assert.equal(stats(s, drake).defense, 5);
  const hoard = s.wildsRhovanion!.setAside.find((u) => u.code === W.hoard)!;
  s.wildsRhovanion!.setAside = s.wildsRhovanion!.setAside.filter(
    (u) => u.id !== hoard.id,
  );
  s.activeLocation = hoard;
  damage(s, drake.id, 20, { combatDamage: true });
  assert.equal(drake.damage, 0);
});
test("Native Fire-drake player attack spends one main-quest progress per declared attacker", () => {
  let s = base("the-kings-quest");
  setStage(s, 3);
  s.phase = "attack";
  const drake = s.wildsRhovanion!.setAside.splice(
    s.wildsRhovanion!.setAside.findIndex((u) => u.code === W.drake),
    1,
  )[0];
  s.engaged.push(drake);
  drake.owner = 0;
  drake.damage = 16;
  s.heroes[0].tempAttack = 20;
  s.progress = 0;
  syncSeat(s);
  assert.throws(() =>
    applyAction(reload(s), {
      type: "ATTACK",
      enemyId: drake.id,
      attackerIds: [s.heroes[0].id],
    }),
  );
  s.progress = 1;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: drake.id,
    attackerIds: [s.heroes[0].id],
  });
  s = settle(s);
  assert.equal(s.status, "won");
  assert.equal(s.progress, 0);
});
test("Frenzied Creature attaches the physical encounter card to an actual Evil Creature and buffs all three stats", () => {
  let s = base();
  s.wildsRhovanion!.evilDeck = ["01085"];
  placeEncounter(s, W.frenzied, false, 0, undefined, true);
  s = finish(s);
  const e = s.staging.find((u) => u.code === "01085")!;
  assert.equal(e.attachments[0].code, W.frenzied);
  assert.equal(threatOf(s, e), 3);
  assert.equal(stats(s, e).attack, 4);
  assert.equal(stats(s, e).defense, 2);
  assert.equal(s.wildsRhovanion!.resolving.length, 0);
  assert.ok(!s.encounterDiscard.includes(W.frenzied));
});
test("Shared danger effects assign individual damage and Dragon Scales cancels exactly one damage instance", () => {
  let s = base("the-kings-quest");
  setStage(s, 3);
  const drake = add(s, W.drake),
    a = make(s, W.scales);
  drake.attachments.push({ id: a.id, code: a.code, exhausted: false });
  damage(s, drake.id, 3, { combatDamage: true });
  assert.equal(drake.damage, 0);
  assert.ok(s.encounterDiscard.includes(W.scales));
  damage(s, drake.id, 2, { combatDamage: true });
  assert.equal(drake.damage, 2);
});
test("Hills/Lake calculate printed X from the largest fellowship; Dark locations and poison restrictions are live", () => {
  const s = base("the-kings-quest", 2);
  const lake = add(s, W.lake);
  assert.equal(threatOf(s, lake), 3);
  assert.equal(locationQuest(s, lake), 3);
  s.activeLocation = lake;
  s.staging = [];
  const bats = add(s, W.blackBats);
  damage(s, bats.id, 2);
  assert.equal(bats.damage, 0);
  const spider = add(s, W.giantSpider);
  engage(s, spider);
  const hero = s.heroes[0];
  damage(s, hero.id, 1, { enemyId: spider.id, combatDamage: true });
  hero.exhausted = true;
  readyCharacter(s, hero);
  assert.equal(hero.exhausted, true);
  s.round++;
  readyCharacter(s, hero);
  assert.equal(hero.exhausted, false);
});
test("Wilds save rejects invalid hidden quest chains, physical duplicate caves and fabricated auxiliary cards", () => {
  const s = start("the-kings-quest");
  assert.ok(validateSave(s));
  for (const mutate of [
    (x: GameState) => {
      x.wildsRhovanion!.questDeck.reverse();
    },
    (x: GameState) => {
      x.wildsRhovanion!.cavesDeck.push(
        structuredClone(x.wildsRhovanion!.cavesDeck[0]),
      );
    },
    (x: GameState) => {
      x.wildsRhovanion!.evilDeck = [W.drake];
    },
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.equal(validateSave(bad), false);
  }
});
test("Native quest event enters Lonely Lands storage before its ability and still resolves from spent source metadata", () => {
  let s = base();
  s.phase = "quest";
  const lands = add(s, W.lonely),
    event = make(s, "01022");
  s.hand = [event];
  s.heroes[0].code = "01001";
  const hero = s.heroes[0],
    before = stats(s, hero).attack;
  syncSeat(s);
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  s = settle(s);
  assert.equal(s.wildsRhovanion!.storedCards.length, 1);
  assert.equal(s.wildsRhovanion!.storedCards[0].cards[0].id, event.id);
  assert.equal(s.wildsRhovanion!.storedCards[0].locationId, lands.id);
  assert.equal(stats(s, get(s, hero.id)!).attack, before + 1);
  assert.ok(!s.resolvingEvents?.length);
  assert.ok(!s.discard.includes(event.code));
  assert.equal(threatOf(s, get(s, lands.id)!), 4);
});
test("Native successful quest places its actual main-quest progress before the Traveling North resource trigger", () => {
  let s = base();
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 4;
  s.encounterDeck = [W.hills];
  syncSeat(s);
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.ok(s.progress > 0);
  assert.equal(s.wildsRhovanion!.questResources, 1);
});
for (const code of [
  W.crossing,
  W.troop,
  W.stray,
  W.wargs,
  W.riverbank,
  W.frenzied,
  W.supplies,
  W.unseen,
  W.patrol,
  W.giantSpider,
  W.spider,
  W.denizen,
  W.gloom,
  W.swarm,
  W.troll,
  W.blackBats,
  W.darkPlaces,
  W.eyes,
])
  test(`Native Wilds defense resolves ${card(code).name} shadow across save/reload`, () => {
    let s = base("the-kings-quest");
    setStage(s, 3);
    s.phase = "defense";
    const enemy = make(s, W.troop);
    enemy.owner = 0;
    enemy.shadows = [code];
    s.engaged.push(enemy);
    const defender = s.heroes[1];
    defender.tempDefense = 20;
    const a = make(s, "01026");
    defender.attachments.push({ id: a.id, code: a.code, exhausted: false });
    s.encounterDeck = [W.lonely, W.hills];
    syncSeat(s);
    s = applyAction(reload(s), {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: defender.id,
    });
    s = settle(s);
    assert.equal(s.status, "playing");
    if (code === W.frenzied)
      assert.ok(get(s, enemy.id)!.attachments.some((a) => a.code === code));
    if (code === W.stray) assert.ok(s.staging.some((e) => e.code === W.stray));
    if (code === W.unseen) assert.equal(get(s, enemy.id)!.tempDefense ?? 0, 0);
  });
test("Native Hobgoblin entry guards the exact top player card, scales by its cost and returns the same ID", () => {
  let s = base("the-kings-quest");
  s.deck = ["01022", "01032"];
  placeEncounter(s, W.hobgoblin, false, 0, undefined, true);
  s = finish(s);
  const enemy = s.staging.find((u) => u.code === W.hobgoblin)!,
    guarded = s.wildsRhovanion!.guardedPlayerCards[0];
  assert.equal(guarded.card.code, "01022");
  assert.equal(stats(s, enemy).attack, 1 + Number(card("01022").cost));
  destroy(s, enemy);
  s = finish(s);
  assert.equal(s.hand.find((u) => u.code === "01022")!.id, guarded.card.id);
  assert.equal(s.wildsRhovanion!.guardedPlayerCards.length, 0);
});
test("Dragon Hoard frees a guarded Artifact into a legal character attachment after native exploration", () => {
  let s = base("the-kings-quest");
  setStage(s, 3);
  const hoard = s.wildsRhovanion!.setAside.splice(
    s.wildsRhovanion!.setAside.findIndex((u) => u.code === W.hoard),
    1,
  )[0];
  s.activeLocation = hoard;
  const artifact = make(s, "18011");
  s.wildsRhovanion!.guardedPlayerCards.push({
    guardId: hoard.id,
    player: 0,
    card: artifact,
  });
  progressLocation(s, hoard, 7);
  s = finish(s);
  assert.ok(
    allCharacters(s).some((u) =>
      u.attachments.some((a) => a.id === artifact.id),
    ),
  );
  assert.equal(s.wildsRhovanion!.guardedPlayerCards.length, 0);
  assert.ok(!s.hand.some((u) => u.id === artifact.id));
});
test("Native Hills of Wilderland quest action exhausts a first-player character and reduces its threat", () => {
  let s = base();
  s.phase = "quest";
  const hills = add(s, W.hills);
  const before = threatOf(s, hills);
  s = applyAction(reload(s), { type: "ABILITY", id: hills.id });
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(threatOf(s, get(s, hills.id)!), before - 1);
});
test("Native Pack of Wargs blank shadow grants exactly one additional attack without a new shadow", () => {
  let s = base();
  s.phase = "defense";
  const enemy = make(s, W.wargs);
  enemy.owner = 0;
  enemy.shadows = [W.hills];
  s.engaged.push(enemy);
  const defender = s.heroes[0];
  s.encounterDeck = [W.lonely];
  syncSeat(s);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  s = settle(s);
  assert.equal(get(s, defender.id)!.damage, 2);
  assert.equal(
    s.log.filter((e) => e.text.startsWith("Pack of Wargs attacks for")).length,
    2,
  );
  assert.deepEqual(s.encounterDeck, [W.lonely]);
  assert.equal(s.status, "playing");
});
test("Native Werewolf blank shadow damages both before combat and increases this attack by its new damage", () => {
  let s = base("the-kings-quest");
  s.phase = "defense";
  const enemy = make(s, W.werewolf);
  enemy.owner = 0;
  enemy.shadows = [W.hills];
  s.engaged.push(enemy);
  const defender = s.heroes[0];
  s.encounterDeck = [W.lonely];
  syncSeat(s);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  s = settle(s);
  assert.equal(get(s, enemy.id)!.damage, 1);
  assert.equal(get(s, defender.id)!.damage, 2);
});
test("Lost in the Wild cannot pay a native player discard cost but a forced encounter discard sends it to the encounter pile", () => {
  let s = base();
  s.phase = "quest";
  s.heroes[0].code = "01007";
  const lost = make(s, W.lostWild),
    other = make(s, "01022");
  s.hand = [lost, other];
  syncSeat(s);
  s = applyAction(reload(s), { type: "ABILITY", id: s.heroes[0].id });
  assert.ok(!s.choice?.options.some((o) => o.id === lost.id));
  s = settle(s);
  assert.ok(s.hand.some((u) => u.id === lost.id));
  assert.ok(s.discard.includes(other.code));
  s = base("lost-in-mirkwood");
  s.stage = 2;
  s.wildsRhovanion!.completedQuests = [W.ambushed];
  s.wildsRhovanion!.currentQuest = W.orcs;
  s.wildsRhovanion!.questDeck = s.wildsRhovanion!.questDeck.filter(
    (c) => c !== W.orcs,
  );
  s.phase = "defense";
  const wild = make(s, W.lostWild);
  s.hand = [wild];
  const enemy = make(s, W.patrol);
  enemy.owner = 0;
  enemy.shadows = [W.lonely];
  s.engaged.push(enemy);
  syncSeat(s);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  assert.ok(!s.hand.some((u) => u.id === wild.id));
  assert.ok(s.encounterDiscard.includes(W.lostWild));
  assert.ok(!s.discard.includes(W.lostWild));
});
test("Two physical Frenzied Creature Conditions stack their bonuses and preserve granted immunity", () => {
  const s = base();
  const enemy = add(s, "01085");
  for (let i = 0; i < 2; i++) {
    const a = make(s, W.frenzied);
    enemy.attachments.push({ id: a.id, code: a.code, exhausted: false });
  }
  assert.equal(stats(s, enemy).attack, 5);
  assert.equal(stats(s, enemy).defense, 3);
  assert.equal(threatOf(s, enemy), 4);
});
test("Iron Hills excludes two zero-VP Forked Passages from its three scored locations while Contested Depths counts them", () => {
  let s = base("the-kings-quest");
  s.victoryCards = [W.fork, W.fork, W.armory];
  const contested = add(s, W.contested);
  assert.equal(threatOf(s, contested), 4);
  check(s);
  s = finish(s);
  assert.equal(s.stage, 1);
  assert.equal(s.wildsRhovanion!.currentQuest, W.iron);
  assert.ok(!s.staging.some((u) => u.code === W.drake));
});
