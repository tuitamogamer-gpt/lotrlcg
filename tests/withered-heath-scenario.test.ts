import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, locationQuest, make, stats, threatOf } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  placeEncounter,
  progressLocation,
  readyCharacter,
  revealed,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import * as S from "../src/game/withered-heath";
import {
  WITHERED_HEATH as H,
  validateWitheredHeath,
  witheredHeathDragon,
  witheredHeathSigns,
} from "../src/game/withered-heath-support";
import {
  base,
  choose,
  finalFixture,
  reload,
  scoreSigns,
  setStage,
  settle,
  start,
  travelFixture,
} from "./withered-heath-fixtures";

for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Heath native setup ${players} players ${easy ? "easy" : "standard"}`, () => {
      const s = start(players, easy),
        q = s.witheredHeath!;
      assert.ok(q.initialized);
      assert.equal(q.cavesDeck.length, 8);
      assert.equal(q.setAside.length, 3);
      assert.equal(q.cavesDeck.filter((u) => u.code === H.sign).length, 2);
      assert.equal(
        s.staging.filter((u) => card(u.code).type_code === "location").length,
        players,
      );
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length + s.staging.length,
        easy ? 26 : 37,
      );
      assert.ok(validateSave(s));
      assert.ok(validateWitheredHeath(s, () => true));
      const visible = JSON.stringify(publicState(s));
      assert.ok(!visible.includes('"cavesDeck":['));
      assert.ok(!visible.includes('"setAside":['));
      const projected = publicState(s).witheredHeath;
      assert.equal(projected?.cavesDeck, 8);
      assert.equal(projected?.setAside, 3);
      assert.equal(reload(s).witheredHeath!.cavesDeck[0].id, q.cavesDeck[0].id);
    });
test("Heath Deep pays the travel cost, preserves physical sign, ignores treachery effects while finding its enemy guard", () => {
  const f = travelFixture();
  const threat = f.s.threat;
  let s = settle(
    applyAction(reload(f.s), { type: "TRAVEL", id: f.location.id }),
  );
  assert.equal(s.threat, threat + 1);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(H.entrance));
  assert.ok(s.encounterDiscard.includes(H.snow));
  assert.equal(s.witheredHeath!.guards[0].sign.id, f.sign.id);
  const guard = s.staging.find((u) => u.code === H.hatchling)!;
  assert.ok(guard);
  assert.ok(S.witheredHeathImmune(s, guard));
  assert.equal(
    s.heroes.some((h) => h.exhausted),
    false,
    "Guarded(enemy) does not reveal discarded Heavy Snow",
  );
  destroy(s, guard);
  s = settle(s);
  assert.equal(witheredHeathSigns(s), 1);
  assert.equal(s.witheredHeath!.guards.length, 0);
  assert.ok(validateSave(s));
});
test("Heath Deep keeps the same Lost Caves card and its forced entry damage serializes across player ownership", () => {
  let s = base(2);
  s.phase = "travel";
  const l = make(s, H.door);
  s.staging.push(l);
  const q = s.witheredHeath!,
    i = q.cavesDeck.findIndex((u) => u.code === H.cavern),
    cave = q.cavesDeck.splice(i, 1)[0];
  q.cavesDeck.unshift(cave);
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, cave.id);
  for (const p of playerOrder(s))
    assert.equal(
      seatView(s, p).heroes.reduce((n, h) => n + h.damage, 0),
      3,
    );
  assert.ok(validateSave(s));
});
test("Stage2 ignores Deep and an empty Caves deck also leaves a Deep location active", () => {
  let s = base();
  setStage(s, 2);
  s.phase = "travel";
  const l = make(s, H.door);
  s.staging.push(l);
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: l.id }));
  assert.equal(s.activeLocation?.id, l.id);
  assert.equal(s.witheredHeath!.cavesDeck.length, 8);
  const plain = base();
  plain.witheredHeath!.setAside.push(
    ...plain.witheredHeath!.cavesDeck.filter((u) => u.code === H.sign),
  );
  plain.witheredHeath!.cavesDeck = [];
  plain.activeLocation = make(plain, H.door);
  S.witheredHeathTravelEntered(plain, plain.activeLocation, true);
  assert.equal(plain.queue.length, 0);
});
test("The same dragon survives eighteen damage in staging, then retreats with its damage and heals only at round end", () => {
  let s = base(4);
  scoreSigns(s, 1);
  s.progress = 6;
  S.witheredHeathAdvance(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  const id = witheredHeathDragon(s)!.id;
  assert.deepEqual(
    playerOrder(s).filter((p) =>
      S.witheredHeathConsideredEngaged(s, witheredHeathDragon(s)!, p),
    ),
    [0, 1, 2, 3],
  );
  assert.equal(allEngaged(s).filter((u) => u.code === H.drake).length, 0);
  for (let round = 0; round < 3; round++) {
    damage(s, id, 20, { combatDamage: true });
    assert.equal(witheredHeathDragon(s)!.damage, (round + 1) * 6);
    damage(s, id, 20, { combatDamage: true });
    assert.equal(witheredHeathDragon(s)!.damage, (round + 1) * 6);
    if (round < 2) {
      s.round++;
      S.witheredHeathCheck(s);
    }
  }
  assert.equal(s.status, "playing");
  assert.equal(witheredHeathDragon(s)!.id, id);
  assert.equal(s.stage, 2);
  s.progress = 3;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(witheredHeathDragon(s)!.id, id);
  assert.equal(witheredHeathDragon(s)!.damage, 18);
  assert.ok(s.witheredHeath!.setAside.some((u) => u.id === id));
  S.witheredHeathEffect(s, fx("heathHealDragon"));
  assert.equal(witheredHeathDragon(s)!.damage, 15);
  assert.equal(
    s.witheredHeath!.cavesDeck.filter((u) => u.code === H.sign).length,
    3,
  );
  assert.ok(validateSave(s));
});
test("Quest progress and Dragon Sign thresholds both gate the first and third stages", () => {
  const s = base();
  s.progress = 6;
  S.witheredHeathAdvance(s);
  assert.equal(s.witheredHeath!.advancing, false);
  scoreSigns(s, 1);
  s.progress = 5;
  S.witheredHeathAdvance(s);
  assert.equal(s.witheredHeath!.advancing, false);
  setStage(s, 3);
  s.progress = 9;
  S.witheredHeathAdvance(s);
  assert.equal(s.witheredHeath!.advancing, false);
  scoreSigns(s, 2);
  S.witheredHeathAdvance(s);
  assert.equal(s.witheredHeath!.advancing, true);
});
test("Stage4 damage cap spans attacks and players; actual native combat defeat wins", () => {
  let s = base(2);
  const dragon = setStage(s, 4);
  scoreSigns(s, 3);
  damage(s, dragon.id, 4);
  assert.equal(dragon.damage, 0, "non-combat damage is forbidden");
  damage(s, dragon.id, 2, { combatDamage: true });
  damage(s, dragon.id, 8, { combatDamage: true });
  assert.equal(dragon.damage, 3);
  s.round++;
  damage(s, dragon.id, 8, { combatDamage: true });
  assert.equal(dragon.damage, 6);
  const f = finalFixture();
  s = applyAction(reload(f.s), {
    type: "ATTACK",
    enemyId: f.boss.id,
    attackerIds: [f.hero.id],
  });
  s = settle(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards?.includes(H.drake));
  assert.ok(validateSave(s));
});
test("Exploring the active location offers exactly the top three, reveals the selected card and discards the rest", () => {
  let s = base();
  const l = make(s, H.pass);
  s.activeLocation = l;
  s.encounterDeck = [H.snow, H.hatchling, H.troll, H.pass];
  progressLocation(s, l, 4);
  flush(s);
  s = settle(s, "1");
  assert.equal(s.witheredHeath!.peeked.length, 0);
  assert.ok(s.staging.some((u) => u.code === H.hatchling));
  assert.ok(s.encounterDiscard.includes(H.snow));
  assert.ok(s.encounterDiscard.includes(H.troll));
  assert.ok(validateSave(s));
});
test("Creature Den optional search guards the same sign with its location and frees it upon exploration", () => {
  let s = base();
  s.phase = "travel";
  const l = make(s, H.creatureDen);
  s.staging.push(l);
  s.encounterDeck = [H.snow, H.hatchling, H.pass];
  const id = s.witheredHeath!.cavesDeck.find((u) => u.code === H.sign)!.id;
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = settle(s, "use");
  assert.equal(s.witheredHeath!.guards[0].guardId, l.id);
  assert.equal(s.witheredHeath!.guards[0].sign.id, id);
  assert.ok(S.witheredHeathImmune(s, s.activeLocation!));
  progressLocation(s, s.activeLocation!, 4);
  flush(s);
  s = settle(s);
  assert.equal(witheredHeathSigns(s), 1);
  assert.ok(validateSave(s));
});
test("Printed dynamic values use signs, staging locations and the largest player's character count", () => {
  const s = base(2);
  scoreSigns(s, 2);
  const h = make(s, H.hatchling),
    drake = witheredHeathDragon(s)!,
    lake = make(s, H.lake),
    falls = make(s, H.falls),
    door = make(s, H.door);
  s.staging.push(h, lake, falls, door);
  assert.equal(stats(s, h).attack, 4);
  assert.equal(stats(s, h).defense, 0);
  assert.equal(threatOf(s, h), 4);
  assert.equal(stats(s, drake).defense, 3);
  assert.equal(threatOf(s, falls), 3);
  assert.equal(threatOf(s, lake), 3);
  assert.equal(locationQuest(s, lake), 3);
  assert.ok(S.witheredHeathLocationProgressBlocked(s, door));
  progressLocation(s, door, 9);
  assert.equal(door.progress, 0);
});
test("Heavy Snow, Deadly Cold and Ruined Supplies resolve separate multiplayer choices and preserve owner seats", () => {
  let s = base(2);
  placeEncounter(s, H.snow, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  assert.equal(S.witheredHeathCannotPlayerReady(s), true);
  const snowVictim = playerOrder(s)
    .flatMap((p) => seatView(s, p).heroes)
    .find((h) => h.exhausted)!;
  readyCharacter(s, snowVictim, true);
  assert.equal(
    snowVictim.exhausted,
    true,
    "Heavy Snow blocks readiness by a player card effect",
  );
  readyCharacter(s, snowVictim, false);
  assert.equal(
    snowVictim.exhausted,
    false,
    "Framework refresh readiness is permitted",
  );
  snowVictim.exhausted = true;
  assert.equal(
    playerOrder(s)
      .flatMap((p) => seatView(s, p).heroes)
      .filter((h) => h.exhausted).length,
    1,
  );
  s = base(2);
  placeEncounter(s, H.cold, false, 0, undefined, true);
  flush(s);
  s = settle(s, "damage");
  for (const p of playerOrder(s))
    assert.ok(seatView(s, p).heroes.every((h) => h.damage === 1));
  for (const p of playerOrder(s))
    forOwner(s, p, () => s.allies.push(make(s, "01013")));
  placeEncounter(s, H.supplies, false, 0, undefined, true);
  flush(s);
  s = settle(s, "threat");
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 21);
});
test("Mountain Pass blocks only Weather cancellation and only while in staging", () => {
  const s = base();
  const l = make(s, H.pass);
  s.staging.push(l);
  assert.ok(S.witheredHeathCannotCancel(s, false, H.snow));
  assert.equal(S.witheredHeathCannotCancel(s, false, H.supplies), false);
  assert.equal(S.witheredHeathCannotCancel(s, true, H.snow), false);
  s.staging = [];
  s.activeLocation = l;
  assert.equal(S.witheredHeathCannotCancel(s, false, H.cold), false);
});
test("Wild Creatures and native shadows enforce ready, damage immunity and phase expiration", () => {
  const s = base();
  const defender = s.heroes[0],
    enemy = make(s, H.hatchling);
  s.engaged.push(enemy);
  scoreSigns(s, 2);
  s.phase = "defense";
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender.id,
    defenderIds: [defender.id],
    attackBonus: 0,
    damageDealt: 0,
  };
  S.witheredHeathShadow(s, H.hatchling);
  assert.equal(stats(s, enemy).attack, 6);
  assert.equal(stats(s, enemy).defense, 2);
  S.witheredHeathShadow(s, H.spider);
  assert.ok(S.witheredHeathCannotReady(s, defender));
  const lake = s.witheredHeath!.cavesDeck.find((u) => u.code === H.lake)!;
  s.witheredHeath!.cavesDeck = s.witheredHeath!.cavesDeck.filter(
    (u) => u.id !== lake.id,
  );
  s.activeLocation = lake;
  S.witheredHeathShadow(s, H.bats);
  assert.equal(S.witheredHeathDamageAmount(s, enemy, 4, {}), 0);
  s.phase = "attack";
  assert.equal(S.witheredHeathDamageAmount(s, enemy, 4, {}), 4);
  const drake = witheredHeathDragon(s)!;
  S.witheredHeathShadowResolved(s, drake, H.pass);
  assert.ok(S.witheredHeathCannotReady(s, defender));
  s.round++;
  assert.equal(S.witheredHeathCannotReady(s, defender), false);
});
test("Shared Lost in the Wild physically enters the chosen hand, cannot pay a discard cost and discards to encounter", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    s.hand = [make(s, "01025"), make(s, "01050")];
  });
  placeEncounter(s, H.lost, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  assert.ok(seatView(s, 1).hand.some((u) => u.code === H.lost));
  const lost = seatView(s, 1).hand.find((u) => u.code === H.lost)!;
  assert.ok(S.witheredHeathCannotDiscardHand(s, lost, true));
  S.witheredHeathEffect(s, fx("heathDiscardWholeHand", { player: 1 }));
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.ok(s.encounterDiscard.includes(H.lost));
  assert.ok(validateSave(s));
});
test("Save rejects duplicate Caves identity, missing sign, illegal guard and inconsistent quest chain", () => {
  const s = base();
  assert.ok(validateSave(s));
  for (const mutate of [
    (x: typeof s) => {
      x.witheredHeath!.cavesDeck[0].id = x.witheredHeath!.cavesDeck[1].id;
    },
    (x: typeof s) => {
      x.witheredHeath!.setAside = x.witheredHeath!.setAside.filter(
        (u) => u.code !== H.sign,
      );
    },
    (x: typeof s) => {
      x.witheredHeath!.questDeck.reverse();
    },
    (x: typeof s) => {
      const q = x.witheredHeath!,
        i = q.cavesDeck.findIndex((u) => u.code === H.sign);
      q.guards.push({ sign: q.cavesDeck.splice(i, 1)[0], guardId: "missing" });
    },
  ]) {
    const broken = structuredClone(s);
    mutate(broken);
    assert.equal(validateSave(broken), false);
  }
});
test("Native threat elimination ends the dragon hunt in loss", () => {
  const s = base();
  s.threat = 50;
  check(s);
  assert.equal(s.status, "lost");
});
test("Stage2 physical dragon deals fresh shadows for all four normal defenses and stays in staging", () => {
  let s = base(4);
  const dragon = setStage(s, 2);
  s.phase = "defense";
  dragon.shadows = [H.pass];
  s.encounterDeck = [H.snow, H.pass, H.pass, ...Array(20).fill(H.pass)];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.tempDefense = 20;
    });
  for (const p of [0, 1, 2, 3]) {
    const defender = seatView(s, p).heroes[0];
    s = applyAction(reload(s), {
      type: "DEFEND",
      enemyId: dragon.id,
      defenderId: defender.id,
    });
    s = settle(s);
    assert.ok(s.staging.some((u) => u.id === dragon.id));
    assert.equal(allEngaged(s).filter((u) => u.id === dragon.id).length, 0);
  }
  assert.equal(s.phase, "attack");
  assert.equal(s.encounterDiscard.length, 4);
  assert.equal(
    s.witheredHeath!.noReady.length,
    3,
    "blank shadow effect is evaluated for each actual defender",
  );
  assert.ok(validateSave(s));
});
test("Every printed Heath/shared shadow resolves through native defense and reloadable continuations", () => {
  for (const code of [
    H.snow,
    H.cold,
    H.troll,
    H.hatchling,
    H.supplies,
    H.werewolf,
    H.spider,
    H.bats,
  ]) {
    let s = base();
    s.phase = "defense";
    const enemy = make(s, H.hatchling),
      defender = s.heroes[1];
    enemy.shadows = [code];
    s.engaged.push(enemy);
    defender.tempDefense = 30;
    s.encounterDeck = Array(20).fill(H.pass);
    s = applyAction(reload(s), {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: defender.id,
    });
    s = settle(s);
    assert.equal(s.status, "playing", card(code).name);
    assert.ok(validateSave(s));
  }
});
test("Snow-troll returns to staging only after actual combat destruction", () => {
  let s = base();
  s.phase = "defense";
  const enemy = make(s, H.troll),
    defender = s.heroes[0];
  s.engaged.push(enemy);
  defender.damage = 4;
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(!s.engaged.some((u) => u.id === enemy.id));
  assert.ok(!s.heroes.some((u) => u.id === defender.id));
});
test("Cold-Drake's stage4 quest attack walks every seat and preserves the single boss and damage", () => {
  let s = base(3);
  const dragon = setStage(s, 4);
  scoreSigns(s, 3);
  dragon.damage = 9;
  s.phase = "planning";
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) h.tempDefense = 20;
    });
  s.encounterDeck = Array(20).fill(H.pass);
  s.queue.push(...S.witheredHeathBeginQuest(s));
  flush(s);
  s = settle(s);
  assert.equal(witheredHeathDragon(s)!.id, dragon.id);
  assert.equal(witheredHeathDragon(s)!.damage, 9);
  for (const p of playerOrder(s)) assert.ok(seatView(s, p).heroes[0].exhausted);
  assert.equal(s.encounterDiscard.length, 3);
  assert.ok(validateSave(s));
});
test("Weighed Down preserves its physical card, exhausts the most attached hero and discards the owner's other attachment after readying", () => {
  let s = base(2);
  const hero = seatView(s, 1).heroes[0];
  hero.attachments.push({
    id: `a${s.nextId++}`,
    code: "01026",
    exhausted: false,
  });
  placeEncounter(s, H.weighed, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  const attached = seatView(s, 1).heroes[0];
  assert.ok(attached.exhausted);
  const id = attached.attachments.find((a) => a.code === H.weighed)!.id;
  readyCharacter(s, attached, false);
  flush(s);
  s = settle(s);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 1);
  assert.equal(seatView(s, 1).heroes[0].attachments[0].id, id);
  assert.ok(seatView(s, 1).discard.includes("01026"));
  const now = seatView(s, 1).heroes[0];
  now.exhausted = true;
  readyCharacter(s, now, false);
  flush(s);
  s = settle(s);
  assert.equal(seatView(s, 1).heroes[0].attachments.length, 0);
  assert.ok(s.encounterDiscard.includes(H.weighed));
  assert.ok(validateSave(s));
});
test("Ancient Treasury and Lost Armory grant each player optional benefits once per game for the group", () => {
  let s = base(2);
  const treasury = s.witheredHeath!.cavesDeck.find(
    (u) => u.code === H.treasury,
  )!;
  s.witheredHeath!.cavesDeck = s.witheredHeath!.cavesDeck.filter(
    (u) => u.id !== treasury.id,
  );
  s.activeLocation = treasury;
  S.witheredHeathTravelEntered(s, treasury, false);
  flush(s);
  s = choose(s, "use");
  s = settle(s, "threat");
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 17);
  S.witheredHeathTravelEntered(s, treasury, false);
  assert.equal(s.queue.length, 0);
  const armory = s.witheredHeath!.cavesDeck.find((u) => u.code === H.armory)!;
  s.witheredHeath!.cavesDeck = s.witheredHeath!.cavesDeck.filter(
    (u) => u.id !== armory.id,
  );
  s.staging.push(armory);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01039", "01025"];
    });
  S.witheredHeathTravelEntered(s, armory, false);
  flush(s);
  s = choose(s, "use");
  s = settle(s, "deck:0");
  for (const p of playerOrder(s))
    assert.ok(seatView(s, p).hand.some((u) => u.code === "01039"));
  assert.deepEqual(
    s.witheredHeath!.usedResponses.sort(),
    [H.armory, H.treasury].sort(),
  );
  assert.ok(validateSave(s));
});
test("Frightful Den adds one enemy per player without revealing discarded treacheries and Grotto resolves only the treachery's When Revealed", () => {
  let s = base(2);
  s.encounterDeck = [H.snow, H.hatchling, H.supplies, H.troll];
  const den = s.witheredHeath!.cavesDeck.find((u) => u.code === H.frightful)!;
  s.witheredHeath!.cavesDeck = s.witheredHeath!.cavesDeck.filter(
    (u) => u.id !== den.id,
  );
  s.activeLocation = den;
  S.witheredHeathTravelEntered(s, den, false);
  flush(s);
  s = settle(s);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 20);
  s.encounterDeck = [H.pass, H.snow, H.pass];
  S.witheredHeathEffect(s, fx("heathGrotto"));
  flush(s);
  s = settle(s);
  assert.ok(s.heroes.some((h) => h.exhausted));
  for (const p of playerOrder(s))
    assert.equal(
      seatView(s, p).threat,
      20,
      "Discarding Heavy Snow does not trigger Doomed",
    );
  assert.ok(validateSave(s));
});
test("Mountain Pass native cancellation passes the revealed card code and lets non-Weather treacheries be canceled", () => {
  let s = base();
  s.staging.push(make(s, H.pass));
  s.hand.push(make(s, "01050"));
  s.heroes[0].phaseResourceIcons = ["spirit"];
  revealed(s, H.snow);
  flush(s);
  s = settle(s);
  assert.ok(s.heroes.some((h) => h.exhausted));
  assert.ok(s.hand.some((u) => u.code === "01050"));
  revealed(s, H.supplies);
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === "cancel"));
});
test("Hunting the Beast advances to the real fourth quest and resolves its front-face attacks before combat", () => {
  let s = base(2);
  const dragon = setStage(s, 3);
  scoreSigns(s, 3);
  dragon.damage = 15;
  s.progress = 9;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[0].tempDefense = 20;
    });
  s.encounterDeck = Array(20).fill(H.pass);
  S.witheredHeathAdvance(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 4);
  assert.equal(s.witheredHeath!.currentQuest, H.cornered);
  assert.equal(witheredHeathDragon(s)!.id, dragon.id);
  assert.equal(witheredHeathDragon(s)!.damage, 15);
  assert.equal(s.encounterDiscard.length, 2);
  for (const p of playerOrder(s)) assert.ok(seatView(s, p).heroes[0].exhausted);
  assert.equal(
    s.witheredHeath!.setAside.filter((u) => u.code === H.drake).length,
    0,
  );
  assert.ok(validateSave(s));
});
test("High Falls assigns the staging location count among any player's characters before Deep replaces it", () => {
  let s = base(2);
  s.phase = "travel";
  const falls = make(s, H.falls);
  s.staging.push(falls, make(s, H.pass));
  const q = s.witheredHeath!;
  const i = q.cavesDeck.findIndex((u) => u.code === H.armory);
  const cave = q.cavesDeck.splice(i, 1)[0];
  q.cavesDeck.unshift(cave);
  const target = seatView(s, 1).heroes[0];
  s = applyAction(reload(s), { type: "TRAVEL", id: falls.id });
  s = settle(s, target.id);
  assert.equal(seatView(s, 1).heroes[0].damage, 2);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    0,
  );
  assert.equal(s.activeLocation?.id, cave.id);
  assert.ok(validateSave(s));
});
