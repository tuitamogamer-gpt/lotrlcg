import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import {
  check,
  damage,
  destroy,
  engage,
  exhaustCharacter,
  placeEncounter,
  progress,
  progressLocation,
  travel,
} from "../src/game/board";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  locationQuest,
  make,
  prepend,
  stats,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { addQuestProgress } from "../src/game/side-quests";
import {
  ROAM_RHOVANION as R,
  ROAM_RHOVANION_HOOKS as H,
  roamRhovanionCheck,
  roamRhovanionEffect,
  roamRhovanionFailedQuest,
  roamRhovanionPublicState,
  roamRhovanionQuestBegin,
  roamRhovanionCharacterReadied,
  roamRhovanionShadow,
  roamRhovanionPlayerAttackDeclared,
} from "../src/game/roam-rhovanion";
import {
  add,
  ally,
  base,
  finale,
  reload,
  setStage,
  settle,
  start,
} from "./roam-rhovanion-fixtures";
const finish = (s: ReturnType<typeof base>, preferred?: string) => {
  flush(s);
  return settle(s, preferred);
};
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Roam ${players} players ${easy ? "easy" : "normal"}: original setup has exact physical encounter recipe and one discarded location each`, () => {
      const s = start(players, easy),
        q = s.roamRhovanion!;
      assert.ok(q.initialized);
      assert.equal(s.staging.length, players);
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length + s.staging.length,
        easy ? 26 : 40,
      );
      assert.equal(q.setAside.length, 3);
      assert.equal(
        allCharacters(s).filter((u) => u.code === R.urdug).length,
        1,
      );
      assert.equal(
        ownerOf(
          s,
          allCharacters(s).find((u) => u.code === R.urdug)!,
        ),
        0,
      );
      assert.deepEqual(
        new Set(q.questDeck),
        new Set([R.rescue, R.hornQuest, R.keyQuest, R.gambit]),
      );
      assert.ok(validateSave(s));
    });
test("original reverse scans correct transposed source texts and enemy statistics", () => {
  assert.match(card(R.urdugEnemy).text!, /Indestructible/);
  assert.match(card(R.tinyEnemy).text!, /Urdug cannot take damage/);
  assert.equal(card(R.urdugEnemy).engagement, 15);
  assert.equal(card(R.tinyEnemy).engagement, 50);
  assert.equal(card(R.tinyEnemy).victory, 6);
  assert.equal(card(R.urdugEnemy).health, 5);
});
test("stage 1 blocks staging progress and explores active location to the actual random task", () => {
  let s = base(2);
  const location = add(s, R.slopes);
  progressLocation(s, location, 5);
  assert.equal(location.progress, 0);
  s.staging = [];
  s.activeLocation = location;
  const next = s.roamRhovanion!.questDeck[0];
  progressLocation(s, location, 4);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.roamRhovanion!.currentQuest, next);
  assert.equal(s.roamRhovanion!.guarded.length, 1);
  assert.equal(s.roamRhovanion!.completedQuests[0], R.task);
  assert.ok(validateSave(s));
});
test("Rescue Tiny locks guarded Grey Moorland until 5 progress and reclaims the same physical ally", () => {
  let s = base();
  setStage(s, R.rescue);
  roamRhovanionEffect(s, fx("roamRhovanionStageReveal"));
  const g = s.roamRhovanion!.guarded[0],
    id = g.card.id;
  assert.equal(g.card.code, R.tiny);
  assert.match(H.travelProblem!(s, get(s, g.guardId)!)!, /5 progress/);
  s.progress = 5;
  assert.equal(H.travelProblem!(s, get(s, g.guardId)!), null);
  s.activeLocation = get(s, g.guardId)!;
  s.staging = s.staging.filter((u) => u.id !== g.guardId);
  progressLocation(s, s.activeLocation, 4);
  s = finish(s);
  assert.equal(allCharacters(s).find((u) => u.code === R.tiny)?.id, id);
  assert.notEqual(s.roamRhovanion!.currentQuest, R.rescue);
});
test("Horn's guard gains printed threat/defense and cannot take damage below 5 progress", () => {
  let s = base();
  setStage(s, R.hornQuest);
  roamRhovanionEffect(s, fx("roamRhovanionStageReveal"));
  const g = s.roamRhovanion!.guarded[0],
    giant = get(s, g.guardId)!;
  assert.equal(stats(s, giant).defense, 4);
  assert.equal(threatOf(s, giant), 4);
  damage(s, giant.id, 5);
  assert.equal(giant.damage, 0);
  s.progress = 5;
  damage(s, giant.id, 11);
  s = finish(s);
  assert.ok(
    allCharacters(s)
      .find((u) => u.code === R.urdug)
      ?.attachments.some((a) => a.code === R.horn),
  );
  assert.notEqual(s.roamRhovanion!.currentQuest, R.hornQuest);
});
test("Key task guards are immune; claim chooses first player's hero and hidden top3 decision survives reload", () => {
  let s = base(2);
  setStage(s, R.keyQuest);
  roamRhovanionEffect(s, fx("roamRhovanionStageReveal"));
  const g = s.roamRhovanion!.guarded[0];
  assert.ok(H.immune!(s, get(s, g.guardId)!));
  s.progress = 5;
  s.activeLocation = get(s, g.guardId)!;
  s.staging = s.staging.filter((u) => u.id !== g.guardId);
  progressLocation(s, s.activeLocation, 3);
  flush(s);
  assert.match(s.choice?.title ?? "", /Durin's Key/);
  s = settle(s);
  const hero = allCharacters(s).find((u) =>
    u.attachments.some((a) => a.code === R.key),
  )!;
  s.phase = "quest";
  s.encounterDeck = [R.weather, R.slopes, R.ravine];
  prepend(s, ...roamRhovanionQuestBegin(s));
  flush(s);
  s = reload(s);
  assert.deepEqual(s.roamRhovanion!.keyPeek, [R.weather, R.slopes, R.ravine]);
  assert.equal(roamRhovanionPublicState(s)!.keyPeekCount, 3);
  assert.ok(!JSON.stringify(publicState(s)).includes("Harsh Weather"));
  s = applyAction(s, { type: "CHOOSE", id: "key-1" });
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === R.slopes));
  assert.ok(
    s.encounterDiscard.includes(R.weather) &&
      s.encounterDiscard.includes(R.ravine),
  );
  const a = hero.attachments.find((a) => a.code === R.key)!;
  assert.ok(a);
});
test("finale blocks successful main quest progress, permits side quest and active location progress, and converts failure to main progress", () => {
  let { s } = finale();
  s.activeLocation = make(s, R.slopes);
  progress(s, 8, false, true);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 0);
  s = finish(s);
  assert.equal(roamRhovanionFailedQuest(s, 3), true);
  assert.equal(s.progress, 3);
  assert.equal(s.threat, 20);
  s = reload(s);
  roamRhovanionFailedQuest(s, 2);
  assert.equal(s.status, "lost");
});
test("Tiny's continuous protection, Urdug's indestructibility, victory and exact ally destruction losses", () => {
  let { s, urdug, tiny } = finale();
  damage(s, urdug.id, 10);
  assert.equal(urdug.damage, 0);
  destroy(s, tiny);
  damage(s, urdug.id, 5);
  assert.equal(s.status, "won");
  assert.ok(allEngaged(s).some((u) => u.id === urdug.id));
  let a = base();
  destroy(
    a,
    a.allies.find((u) => u.code === R.urdug)!,
  );
  assert.equal(a.status, "lost");
  a = base();
  const t = a.roamRhovanion!.setAside.find((u) => u.code === R.tiny)!;
  a.roamRhovanion!.setAside = a.roamRhovanion!.setAside.filter(
    (u) => u.id !== t.id,
  );
  a.allies.push(t);
  destroy(a, t);
  assert.equal(a.status, "lost");
});
test("Tiny's paid and effect exhaustion raises the controller's threat exactly once, with ready reuse", () => {
  const s = base(3),
    tiny = s.roamRhovanion!.setAside.find((u) => u.code === R.tiny)!;
  s.roamRhovanion!.setAside = s.roamRhovanion!.setAside.filter(
    (u) => u.id !== tiny.id,
  );
  tiny.owner = 2;
  forOwner(s, 2, () => s.allies.push(tiny));
  exhaustCharacter(s, tiny);
  flush(s);
  assert.equal(seatView(s, 2).threat, 22);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(exhaustCharacter(s, tiny), false);
  flush(s);
  assert.equal(seatView(s, 2).threat, 22);
});
test("Giant discards actual owner deck cards and assigns only the discarded ally count", () => {
  let s = base(2);
  forOwner(
    s,
    1,
    () => (s.deck = ["01013", "01050", "01017", "01050", "01050", "01050"]),
  );
  const giant = add(s, R.giant);
  forOwner(s, 1, () => engage(s, giant));
  flush(s);
  assert.match(s.choice?.title ?? "", /Assign 1 damage/);
  s = settle(s);
  assert.equal(seatView(s, 1).deck.length, 1);
  assert.equal(seatView(s, 1).discard.length, 5);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, u) => n + u.damage, 0),
    2,
  );
  assert.equal(
    seatView(s, 0).heroes.reduce((n, u) => n + u.damage, 0),
    0,
  );
});
test("Hobgoblin captures actual private card identity and returns it to the exact owner", () => {
  let s = base(2);
  forOwner(s, 0, () => (s.deck = ["01013", "01050"]));
  placeEncounter(s, R.hobgoblin, false, 0, undefined, true);
  s = finish(s);
  const g = s.roamRhovanion!.guardedPlayerCards[0];
  assert.equal(g.card.code, "01013");
  assert.equal(
    stats(s, get(s, g.guardId)!).attack,
    1 + Number(card(g.card.code).cost),
  );
  const id = g.card.id;
  destroy(s, get(s, g.guardId)!);
  s = finish(s);
  assert.ok(seatView(s, 0).hand.some((u) => u.id === id));
  assert.ok(!seatView(s, 1).hand.some((u) => u.id === id));
  assert.ok(validateSave(s));
});
test("Harsh Weather makes an individual mandatory choice for each ready character and survives pending reload", () => {
  let s = base(2);
  placeEncounter(s, R.weather, false, 0, undefined, true);
  flush(s);
  assert.match(s.choice?.title ?? "", /Harsh Weather/);
  s = settle(reload(s), "threat");
  assert.equal(seatView(s, 0).threat, 24);
  assert.equal(seatView(s, 1).threat, 23);
  assert.ok(allCharacters(s).every((u) => !u.exhausted));
});
test("Sneaking Off preserves Urdug and his horn as a guarded physical objective, then restores first-player control", () => {
  let s = base();
  const urdug = s.allies.find((u) => u.code === R.urdug)!,
    horn = s.roamRhovanion!.setAside.find((u) => u.code === R.horn)!;
  s.roamRhovanion!.setAside = s.roamRhovanion!.setAside.filter(
    (u) => u.id !== horn.id,
  );
  urdug.attachments.push({ id: horn.id, code: horn.code, exhausted: false });
  const l = add(s, R.slopes);
  placeEncounter(s, R.sneaking, false, 0, undefined, true);
  s = finish(s);
  assert.equal(s.roamRhovanion!.guarded[0].card.id, urdug.id);
  assert.ok(
    s.roamRhovanion!.guarded[0].card.attachments.some((a) => a.id === horn.id),
  );
  assert.equal(s.roamRhovanion!.removed.length, 1);
  s.activeLocation = get(s, l.id)!;
  s.staging = s.staging.filter((u) => u.id !== l.id);
  progressLocation(s, s.activeLocation, 4);
  s = finish(s);
  assert.equal(allCharacters(s).find((u) => u.code === R.urdug)?.id, urdug.id);
});
test("Hills X values and Deep Ravine per-location per-round staging progress limits use live character counts", () => {
  const s = base(2);
  setStage(s, R.rescue);
  const hills = add(s, R.hills),
    ravine = add(s, R.ravine),
    slopes = add(s, R.slopes);
  assert.equal(threatOf(s, hills), 4);
  assert.equal(locationQuest(s, hills), 4);
  progressLocation(s, slopes, 3);
  progressLocation(s, slopes, 3);
  assert.equal(slopes.progress, 1);
  progressLocation(s, ravine, 2);
  assert.equal(ravine.progress, 1);
  s.round++;
  progressLocation(s, slopes, 2);
  assert.equal(slopes.progress, 2);
});
test("native finale failed quest progresses the main quest while a selected side quest stays unchanged", () => {
  let { s } = finale();
  s.phase = "staging";
  const side = add(s, "09014");
  s.sideQuestSelections = { shared: { id: side.id, code: side.code } };
  prepend(s, fx("failedQuest", { value: 2, player: 0 }));
  s = finish(s);
  assert.equal(s.progress, 2);
  assert.equal(get(s, side.id)?.progress, 0);
  assert.equal(s.threat, 20);
  progress(s, 2, false, true);
  assert.equal(get(s, side.id)?.progress, 2);
  assert.equal(s.progress, 2);
});
test("Tiny follows Urdug's native engagement and quest phase attack returns both only if it deals damage", () => {
  let { s, urdug, tiny } = finale();
  s.phase = "quest";
  s.staging = s.engaged.splice(0);
  engage(s, urdug);
  s = finish(s);
  assert.ok(allEngaged(s).some((u) => u.id === urdug.id));
  assert.ok(allEngaged(s).some((u) => u.id === tiny.id));
  s.encounterDeck = [R.ravine];
  const defender = ally(s, "01013");
  defender.tempDefense = 1;
  prepend(s, ...roamRhovanionQuestBegin(s));
  flush(s);
  if (s.choice?.title.startsWith("Durin's Key")) {
    s = applyAction(reload(s), { type: "CHOOSE", id: "key-0" });
    flush(s);
  }
  assert.match(s.choice?.title ?? "", /Immediate attack/);
  s = applyAction(reload(s), { type: "CHOOSE", id: defender.id });
  s = finish(s);
  assert.ok(s.staging.some((u) => u.id === urdug.id));
  assert.ok(s.staging.some((u) => u.id === tiny.id));
  assert.equal(s.roamRhovanion!.urdugQuestAttack, undefined);
});
test("Grey Moorland resolves only treachery when-revealed text after shuffling the actual discard pile", () => {
  let s = base();
  setStage(s, R.hornQuest);
  s.phase = "travel";
  s.encounterDeck = [R.supplies];
  s.encounterDiscard = [];
  const moor = add(s, R.moor);
  H.travelEntered!(s, moor, true);
  s = finish(s, "threat");
  assert.equal(
    s.threat,
    21,
    "one controlled ally taxes supplies but its Doomed1 keyword does not trigger",
  );
  assert.ok(s.encounterDiscard.includes(R.supplies));
});
test("Hunting Eagle mandatory first-player engagement is distinct from optional engagement", () => {
  let s = base(2);
  const eagle = add(s, R.eagle);
  assert.ok(H.cannotOptionallyEngage!(s, eagle));
  H.encounterBegin!(s);
  s = finish(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === eagle.id));
  assert.ok(!seatView(s, 1).engaged.length);
});
test("Wild Creatures uses each player's own staging engagement and adds exactly one discarded Creature if anyone cannot engage", () => {
  let s = base(3);
  const enemy = add(s, R.eagle);
  s.encounterDeck = [R.ravine, R.bear, R.slopes];
  placeEncounter(s, R.creatures, false, 0, undefined, true);
  s = finish(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.id === enemy.id));
  assert.equal(s.staging.filter((u) => u.code === R.bear).length, 1);
  assert.ok(s.encounterDiscard.includes(R.ravine));
  assert.ok(!s.choice);
});
test("Wilderland Bear random-discard alternative affects each owner's actual hand", () => {
  let s = base(3);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const c = make(s, "01050");
      c.owner = p;
      s.hand = [c];
    });
  placeEncounter(s, R.bear, false, 0, undefined, true);
  s = finish(s, "discard");
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).hand.length, 0);
    assert.ok(seatView(s, p).discard.includes("01050"));
  }
});
test("Lost in the Wild chooses a largest eligible hand and discards the actual remaining hand after a player card is played", () => {
  let s = base(2);
  forOwner(s, 1, () => (s.hand = [make(s, "01050"), make(s, "01017")]));
  placeEncounter(s, R.lost, false, 0, undefined, true);
  s = finish(s);
  assert.ok(seatView(s, 1).hand.some((u) => u.code === R.lost));
  assert.ok(
    H.cannotDiscardHand!(
      s,
      seatView(s, 1).hand.find((u) => u.code === R.lost)!,
      true,
    ),
  );
  forOwner(s, 1, () => H.playerCardPlayed!(s, make(s, "01050")));
  s = finish(s);
  assert.equal(seatView(s, 1).hand.length, 0);
  assert.ok(s.encounterDiscard.includes(R.lost));
  assert.equal(seatView(s, 1).discard.length, 2);
});
test("Weighed Down pays the most-attached-hero rule and only permits discarding itself after non-objective attachments are gone", () => {
  let s = base();
  const hero = s.heroes[1],
    a = make(s, "01042"),
    key = s.roamRhovanion!.setAside.find((u) => u.code === R.key)!;
  s.roamRhovanion!.setAside = s.roamRhovanion!.setAside.filter(
    (u) => u.id !== key.id,
  );
  hero.attachments = [
    { id: a.id, code: a.code, exhausted: false },
    { id: key.id, code: key.code, exhausted: false },
  ];
  placeEncounter(s, R.weighed, false, 0, undefined, true);
  s = finish(s);
  assert.ok(get(s, hero.id)!.exhausted);
  const attached = get(s, hero.id)!;
  attached.exhausted = false;
  roamRhovanionCharacterReadied(s, attached);
  flush(s);
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    [a.id],
  );
  s = settle(s);
  assert.ok(!get(s, hero.id)!.attachments.some((v) => v.id === a.id));
  roamRhovanionCharacterReadied(s, get(s, hero.id)!);
  flush(s);
  assert.equal(s.choice?.options.length, 1);
  assert.equal(s.choice?.options[0].code, R.weighed);
  s = settle(s);
  assert.ok(get(s, hero.id)!.attachments.some((v) => v.id === key.id));
});
test("Horn's discarded Hills X threat and Key's phase-wide location reduction use live statistics", () => {
  const s = base(),
    urdug = s.allies.find((u) => u.code === R.urdug)!,
    horn = s.roamRhovanion!.setAside.find((u) => u.code === R.horn)!,
    key = s.roamRhovanion!.setAside.find((u) => u.code === R.key)!;
  s.roamRhovanion!.setAside = s.roamRhovanion!.setAside.filter(
    (u) => ![horn.id, key.id].includes(u.id),
  );
  urdug.attachments.push({ id: horn.id, code: horn.code, exhausted: false });
  s.heroes[0].attachments.push({
    id: key.id,
    code: key.code,
    exhausted: false,
  });
  s.encounterDeck = [R.hills];
  const target = add(s, R.hobgoblin);
  roamRhovanionPlayerAttackDeclared(s, target, [urdug.id]);
  assert.equal(stats(s, urdug).attack, 7);
  const slopes = add(s, R.slopes);
  s.phase = "planning";
  assert.ok(H.ability!(s, s.heroes[0], key.id));
  assert.equal(threatOf(s, slopes), 1);
  s.phase = "travel";
  assert.equal(threatOf(s, slopes), 2);
});
test("all printed native shadow clauses dispatch through Roam's active hooks", () => {
  const s = base(2),
    enemy = add(s, R.bear),
    defender = s.heroes[0];
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: defender.id,
    defenderIds: [defender.id],
    attackBonus: 0,
  };
  assert.ok(roamRhovanionShadow(s, R.eagle));
  assert.equal(s.combat.attackBonus, 2);
  assert.ok(roamRhovanionShadow(s, R.weather));
  assert.equal(s.combat.attackBonus, 3);
  assert.ok(roamRhovanionShadow(s, R.moor));
  assert.equal(s.combat.returnToStaging, true);
  for (const c of [R.wargs, R.supplies, R.troll, R.slopes])
    assert.ok(roamRhovanionShadow(s, c));
  assert.equal(roamRhovanionShadow(s, R.ravine), false);
});
test("Lonely Lands captures the native event before its effect, preserves private physical ownership and reloads a spent pending source", () => {
  let s = base();
  s.phase = "quest";
  const lands = add(s, R.lonely),
    event = make(s, "01022"),
    hero = s.heroes[0],
    before = stats(s, hero).attack;
  event.owner = 0;
  s.hand = [event];
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  s = settle(s);
  assert.equal(s.roamRhovanion!.storedCards[0].cards[0].id, event.id);
  assert.equal(s.roamRhovanion!.storedCards[0].locationId, lands.id);
  assert.equal(stats(s, get(s, hero.id)!).attack, before + 1);
  assert.ok(!s.discard.includes(event.code));
  assert.equal(threatOf(s, get(s, lands.id)!), 4);
  assert.ok(!JSON.stringify(roamRhovanionPublicState(s)).includes(event.id));
  s = reload(s);
  s.resolvingEvents = [
    {
      unit: s.roamRhovanion!.storedCards[0].cards[0],
      player: 0,
      destination: "spent",
    },
  ];
  assert.ok(
    validateSave(s),
    "an actual captured source remains valid during its pending resolution",
  );
});
test("save validation rejects duplicate objective aliases, invalid guards and malformed phase counters", () => {
  const s = base();
  for (const mutate of [
    (x: typeof s) => x.roamRhovanion!.setAside.push(make(x, R.urdug)),
    (x: typeof s) =>
      x.roamRhovanion!.guarded.push({
        card: make(x, R.key),
        guardId: x.heroes[0].id,
      }),
    (x: typeof s) => x.roamRhovanion!.wildEngaged.push(9),
    (x: typeof s) =>
      x.roamRhovanion!.locationProgress.push({
        id: x.heroes[0].id,
        round: x.round,
        amount: 2,
      }),
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.equal(validateSave(bad), false);
  }
});
for (const players of [1, 4])
  test(`all three randomized tasks lead to native reversal with preserved companions and objectives (${players} players)`, () => {
    let s = base(players);
    const urdugId = s.allies.find((u) => u.code === R.urdug)!.id,
      tinyId = s.roamRhovanion!.setAside.find((u) => u.code === R.tiny)!.id;
    s.encounterDeck = [...Array(30).fill(R.slopes), R.moor, R.giant, R.ravine];
    s.activeLocation = make(s, R.slopes);
    progressLocation(s, s.activeLocation, 4);
    s = finish(s);
    for (let i = 0; i < 3; i++) {
      assert.equal(s.stage, 2);
      const g = s.roamRhovanion!.guarded[0];
      assert.ok(g);
      s.progress = 5;
      if (g.card.code === R.horn) damage(s, g.guardId, 11);
      else {
        s.activeLocation = get(s, g.guardId)!;
        s.staging = s.staging.filter((u) => u.id !== g.guardId);
        progressLocation(s, s.activeLocation, 10);
      }
      s = finish(s);
    }
    assert.equal(s.stage, 3);
    assert.equal(s.roamRhovanion!.currentQuest, R.gambit);
    assert.equal(s.roamRhovanion!.completedQuests.length, 4);
    assert.equal(s.roamRhovanion!.setAside.length, 0);
    const urdug = s.staging.find((u) => u.code === R.urdugEnemy)!,
      tiny = s.staging.find((u) => u.code === R.tinyEnemy)!;
    assert.equal(urdug.id, urdugId);
    assert.equal(tiny.id, tinyId);
    assert.ok(urdug.attachments.some((a) => a.code === R.horn));
    assert.ok(
      s.heroes.some((h) => h.attachments.some((a) => a.code === R.key)),
    );
    assert.equal(urdug.damage + tiny.damage, 0);
    s = reload(s);
    damage(s, tinyId, 9);
    damage(s, urdugId, 5);
    assert.equal(s.status, "won");
    assert.ok(validateSave(s));
  });
test("native Durin's Key action enforces the actual attachment controller and pays exhaustion once", () => {
  let s = base(2);
  const key = s.roamRhovanion!.setAside.find((u) => u.code === R.key)!,
    hero = seatView(s, 1).heroes[0],
    location = add(s, R.slopes);
  s.roamRhovanion!.setAside = s.roamRhovanion!.setAside.filter(
    (u) => u.id !== key.id,
  );
  hero.attachments.push({ id: key.id, code: key.code, exhausted: false });
  assert.match(H.abilityProblem!(s, hero, key.id)!, /controller/);
  const before = structuredClone(s);
  assert.throws(
    () =>
      applyAction(reload(s), {
        type: "ABILITY",
        id: hero.id,
        attachmentId: key.id,
      }),
    /controller/,
  );
  assert.equal(
    get(s, hero.id)!.attachments.find((a) => a.id === key.id)!.exhausted,
    false,
  );
  assert.equal(threatOf(s, get(s, location.id)!), 2);
  s = before;
  selectSeat(s, 1);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: hero.id,
    attachmentId: key.id,
  });
  s = finish(s);
  assert.ok(
    get(s, hero.id)!.attachments.find((a) => a.id === key.id)!.exhausted,
  );
  assert.equal(threatOf(s, get(s, location.id)!), 1);
});
test("Rescue Tiny only blocks treachery when-revealed cancellation", () => {
  const s = base();
  setStage(s, R.rescue);
  assert.equal(H.cannotCancel!(s, false, R.supplies), true);
  assert.equal(H.cannotCancel!(s, false, R.bear), false);
  assert.equal(H.cannotCancel!(s, true, R.supplies), false);
});
