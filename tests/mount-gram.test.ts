import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import { fx, get, make, stats, threatOf, stageInfo } from "../src/game/core";
import {
  damage,
  check,
  placeEncounter,
  progress,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  eachArea,
  globalEachSeat,
  globalPlayerOrder,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  gramArea,
  gramQuestUnit,
  gramRecipe,
  GRAM as G,
  GRAM_ENCOUNTERS,
  GRAM_QUESTS,
} from "../src/game/mount-gram-support";
import {
  gramCardEntered,
  gramCardLeaves,
  gramCombatDamage,
  gramEncounter,
  gramEffect,
  gramRefreshEnd,
  gramShadow,
  gramStats,
  gramTravelStart,
} from "../src/game/mount-gram";
import {
  base,
  captive,
  capturedDeck,
  browserJoin,
  choose,
  flight,
  gate,
  reload,
  settle,
  start,
} from "./mount-gram-fixtures";
import type { GameState, Unit } from "../src/game/types";

function enemy(s: GameState, code = G.torturer) {
  const u = make(s, code);
  s.engaged.push(u);
  return u;
}
function ally(s: GameState, code = "01016") {
  const u = make(s, code);
  s.allies.push(u);
  return u;
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function pick(s: GameState, id: string) {
  const o = s.choice!.options.find(
    (o) => o.id === id || o.effects.some((e) => e.target === id),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return choose(reload(s), o.id);
}

test("Mount Gram registers all original cards, corrected original clauses, and source artwork", () => {
  assert.equal(GRAM_ENCOUNTERS.length, 13);
  assert.equal(GRAM_QUESTS.length, 3);
  for (const c of [...GRAM_ENCOUNTERS, ...GRAM_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.ok(existsSync(`public${imageUrl(c)}`), c.name);
  }
  assert.equal(card(G.flight).back_quest, 16);
  assert.match(card(G.flight).back_text!, /16 progress/);
  assert.match(card(G.tormentor).text!, /Capture 1/);
  assert.match(card(G.torturer).text!, /damage an ally/);
  assert.match(
    card(G.interrogation).shadow!,
    /Discard a random card from your hand/,
  );
  assert.equal(card(G.gate).traits, "Mountain.");
  assert.equal(gramRecipe().initial.length, 24);
  assert.equal(gramRecipe(true).initial.length, 20);
  assert.equal(gramRecipe().initial.filter((c) => c === G.cell).length, 4);
});
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Mount Gram ${players} player ${easy ? "easy" : "standard"} real setup and save`, () => {
      const s = start(players, easy),
        q = s.mountGram!;
      assert.equal(s.stage, 2);
      assert.equal(q.areas.length, players);
      assert.equal(q.split, true);
      assert.equal(q.initialized, true);
      assert.equal(q.orcDeck.length, 9);
      assert.equal(q.setAside.length, 2);
      for (const p of globalPlayerOrder(s)) {
        const v = seatView(s, p),
          a = gramArea(s, p)!;
        assert.equal(v.heroes.length, 1);
        assert.equal(v.heroes[0].resources, easy ? 4 : 3);
        assert.equal(v.threat, card(v.heroes[0].code).threat);
        assert.equal(v.hand.length, 4);
        assert.equal(q.captured[a.quest.id].length, 7);
        const cell = v.staging.find((u) => u.code === G.cell)!;
        assert.ok(cell);
        assert.equal(q.captured[cell.id].length, 3);
        assert.ok(
          q.captured[a.quest.id].some((u) => card(u.code).type_code === "hero"),
        );
        assert.equal(playerOrder(v).length, 1);
        assert.equal(stageInfo(v).quest, 0);
      }
      assert.ok(validateSave(s));
      assert.deepEqual(reload(s), s);
    });
test("Capture applies on entry, retains identity and owner, and Time starts on any entry", () => {
  const s = base(),
    pool = [...capturedDeck(s, Array(10).fill("01016"))];
  placeEncounter(s, G.executioners, false, 0, undefined, false);
  const u = s.staging[0];
  assert.equal(u.timeCounters, 4);
  assert.deepEqual(
    s.mountGram!.captured[u.id].map((u) => u.id),
    pool.slice(0, 5).map((u) => u.id),
  );
  assert.equal(s.mountGram!.capturedDecks[0].length, 5);
  reload(s);
});
test("Capture resolves before reveal cancellation and canceled Cell still captures", () => {
  const s = base();
  const pool = [...capturedDeck(s, ["01016", "01017"])];
  placeEncounter(s, G.cell, true, 0, undefined, true);
  assert.equal(s.mountGram!.captured[s.staging[0].id][0].id, pool[0].id);
  reload(s);
});
test("Dungeon progress rescues random physical cards and heroes immediately enter play", () => {
  const s = base(),
    q = gramQuestUnit(s)!;
  const h = captive(s, q, "01002"),
    a = captive(s, q);
  progress(s, 2);
  assert.equal(s.progress, 0);
  assert.equal(s.mountGram!.captured[q.id], undefined);
  assert.ok(s.heroes.some((u) => u.id === h.id));
  assert.ok(s.hand.some((u) => u.id === a.id));
  reload(s);
});
test("Active location absorbs progress before dungeon prisoners are rescued", () => {
  const s = base(),
    q = gramQuestUnit(s)!,
    a = captive(s, q),
    l = staged(s, G.cell);
  s.staging = [];
  s.activeLocation = l;
  progress(s, 1);
  assert.equal(l.progress, 1);
  assert.equal(s.mountGram!.captured[q.id][0].id, a.id);
});
test("Explored host rescues every physical captive to its actual owner", () => {
  const s = base(2),
    cell = staged(s, G.cell);
  const a = captive(s, cell, "01016", 0),
    b = captive(s, cell, "01057", 1);
  progressLocation(s, cell, card(G.cell).quest!);
  finish(s);
  assert.ok(seatView(s, 0).hand.some((u) => u.id === a.id));
  assert.ok(seatView(s, 1).hand.some((u) => u.id === b.id));
  reload(s);
});
test("Prison Cell Response puts one inspected captive into play without rescuing others", () => {
  const s = base(),
    cell = staged(s, G.cell),
    a = captive(s, cell),
    b = captive(s, cell, "01017");
  s.phase = "travel";
  let t = applyAction(reload(s), { type: "TRAVEL", id: cell.id });
  assert.match(t.choice!.title, /Prison Cell/);
  t = pick(t, a.id);
  t = settle(t);
  assert.ok(t.allies.some((u) => u.id === a.id));
  assert.equal(t.mountGram!.captured[cell.id][0].id, b.id);
  reload(t);
});
test("Dungeon Guard optional Response can put one rescued ally into play", () => {
  const s = base(),
    e = staged(s, G.guard),
    a = captive(s, e);
  s.staging = [];
  gramCardLeaves(s, e);
  flush(s);
  assert.match(s.choice!.title, /Dungeon Guard/);
  const t = settle(pick(s, a.id));
  assert.ok(t.allies.some((u) => u.id === a.id));
  assert.ok(!t.hand.some((u) => u.id === a.id));
  reload(t);
});
test("Jailor attacks the highest-threat player before the defeated Guard's rescue Response", () => {
  const s = flight(2),
    jailor = staged(s, G.jailor),
    guard = staged(s, G.guard);
  captive(s, guard);
  selectSeat(s, 1);
  s.threat = 25;
  selectSeat(s, 0);
  s.staging = s.staging.filter((u) => u.id !== guard.id);
  gramCardLeaves(s, guard);
  flush(s);
  assert.equal(s.table!.active, 1);
  assert.ok(s.engaged.some((u) => u.id === jailor.id));
  assert.equal(s.combat!.enemyId, jailor.id);
  assert.ok(s.queue.some((e) => e.kind === "gramGuardResponse"));
  assert.ok(!/Dungeon Guard/.test(s.choice?.title ?? ""));
  reload(s);
});
test("Cruel Torturer replaces positive attack damage to an ally by physical capture", () => {
  const s = base(),
    e = enemy(s),
    a = ally(s);
  a.resources = 3;
  a.damage = 1;
  a.exhausted = true;
  a.attachments.push({ id: `a${s.nextId++}`, code: "01026", exhausted: false });
  assert.equal(gramCombatDamage(s, a, e, 2), true);
  const c = s.mountGram!.captured[e.id][0];
  assert.equal(c.id, a.id);
  assert.equal(c.damage, 0);
  assert.equal(c.resources, 0);
  assert.equal(c.attachments.length, 0);
  assert.ok(s.discard.includes("01026"));
  assert.ok(!s.allies.length);
  reload(s);
});
test("Cruel Torturer does not capture a hero, zero damage, or a Sword-thain hero", () => {
  const s = base(),
    e = enemy(s),
    a = ally(s);
  assert.equal(gramCombatDamage(s, s.heroes[0], e, 5), false);
  assert.equal(gramCombatDamage(s, a, e, 0), false);
  a.attachments.push({ id: `a${s.nextId++}`, code: "10149", exhausted: false });
  assert.equal(gramCombatDamage(s, a, e, 5), false);
});
test("A captured Eagle can move its exact physical card beneath Eagles of the Misty Mountains", () => {
  const s = base(),
    collector = ally(s, "02119"),
    eagle = ally(s, "02004"),
    torturer = enemy(s);
  assert.equal(gramCombatDamage(s, eagle, torturer, 1), true);
  flush(s);
  assert.match(s.choice!.title, /Eagles of the Misty Mountains/);
  const t = settle(pick(s, collector.id));
  const attachment = get(t, collector.id)!.attachments.find(
    (a) => a.id === eagle.id,
  )!;
  assert.equal(attachment.code, eagle.code);
  assert.equal(attachment.owner, 0);
  assert.equal(attachment.facedown, true);
  assert.equal(t.mountGram!.captured[torturer.id], undefined);
  assert.ok(!t.hand.some((u) => u.id === eagle.id));
  reload(t);
});
test("Tormentor X counts physical hosts with captives including the current dungeon", () => {
  const s = base(),
    e = enemy(s, G.tormentor),
    q = gramQuestUnit(s)!,
    l = staged(s, G.tunnels);
  captive(s, q);
  captive(s, e);
  captive(s, l);
  assert.equal(gramStats(s, e).attack, 3);
  assert.equal(stats(s, e).attack, 3);
  assert.equal(threatOf(s, l), 1);
  delete s.mountGram!.captured[l.id];
  assert.equal(stats(s, e).attack, 2);
});
test("Sound Alarm applies its lasting effect to later entering enemies", () => {
  const s = base();
  enemy(s);
  gramEncounter(s, G.alarm);
  const e = enemy(s, G.guard);
  assert.equal(stats(s, e).attack, (card(e.code).attack ?? 0) + 1);
  s.round++;
  assert.equal(stats(s, e).attack, card(e.code).attack);
});
test("Sound Alarm searches both piles and added enemy resolves Capture without When Revealed", () => {
  const s = base();
  capturedDeck(s, ["01016"]);
  s.encounterDeck = [G.tormentor];
  s.encounterDiscard = [G.guard];
  gramEncounter(s, G.alarm);
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  const t = settle(pick(s, s.choice!.options[0].id));
  const e = t.staging[0];
  assert.ok(e);
  assert.equal(t.mountGram!.captured[e.id].length, 1);
  assert.equal(stats(t, e).attack, 2);
  reload(t);
});
test("Feeble Weary affects only the revealing player's separate dungeon", () => {
  const s = base(2);
  s.heroes[0].exhausted = true;
  const remote = seatView(s, 1).heroes[0];
  remote.exhausted = true;
  gramEncounter(s, G.weary);
  flush(s);
  const t = settle(pick(s, "damage"));
  assert.equal(t.heroes[0].damage, 1);
  assert.equal(seatView(t, 1).heroes[0].damage, 0);
  reload(t);
});
test("Captives of Gornákh captures an owned ally beneath the highest-threat encounter in its own dungeon", () => {
  const s = base(2),
    owned = ally(s),
    cell = staged(s, G.cell),
    highest = staged(s, G.patrol);
  selectSeat(s, 1);
  const remote = ally(s);
  staged(s, G.jailor);
  selectSeat(s, 0);
  gramEncounter(s, G.captives);
  flush(s);
  const t = settle(pick(s, owned.id));
  assert.equal(t.mountGram!.captured[highest.id][0].id, owned.id);
  assert.equal(t.mountGram!.captured[cell.id], undefined);
  assert.ok(seatView(t, 1).allies.some((u) => u.id === remote.id));
  reload(t);
});
test("Interrogation discards physical captured top card and raises printed cost only", () => {
  const s = base(),
    p = [...capturedDeck(s, ["01016"])];
  gramEncounter(s, G.interrogation);
  finish(s);
  assert.ok(s.discard.includes(p[0].code));
  assert.equal(s.threat, 20 + Number(card(p[0].code).cost));
  assert.equal(s.mountGram!.capturedDecks[0].length, 0);
  reload(s);
});
test("Interrogation gains Doomed2 when captured deck is empty", () => {
  const s = base();
  gramEncounter(s, G.interrogation);
  finish(s);
  assert.equal(s.threat, 22);
});
test("Interrogation's gained Doomed opens keyword Responses and stays inside its private area", () => {
  const s = base(2),
    messenger = ally(s, "07005"),
    before = stats(s, messenger).will;
  gramEncounter(s, G.interrogation);
  flush(s);
  assert.match(s.choice!.title, /Isengard Messenger/);
  assert.equal(s.threat, 22);
  assert.equal(seatView(s, 1).threat, 20);
  const t = settle(pick(s, "use"));
  assert.equal(stats(t, get(t, messenger.id)!).will, before + 1);
  reload(t);
});
test("An Interrogation that eliminates an isolated player does not tax another dungeon", () => {
  const s = base(2);
  capturedDeck(s, ["01016"]);
  s.threat = 49;
  gramEncounter(s, G.interrogation);
  const t = finish(s);
  assert.equal(t.table!.seats[0].eliminated, true);
  assert.equal(seatView(t, 1).threat, 20);
  assert.equal(t.mountGram!.areas.length, 1);
  reload(t);
});
test("Interrogation continues through a participant's elimination and resolves gained Doomed for surviving joined players", () => {
  const s = base(2),
    remote = gramArea(s, 1)!;
  captive(s, remote.quest, "01016", 1);
  s.phase = "travel";
  gramTravelStart(s);
  flush(s);
  const t = settle(pick(s, remote.id));
  assert.equal(t.mountGram!.areas.length, 1);
  selectSeat(t, 0);
  t.phase = "planning";
  capturedDeck(t, ["01016"], 0);
  t.threat = 49;
  gramEncounter(t, G.interrogation);
  const u = finish(t);
  assert.equal(u.table!.seats[0].eliminated, true);
  assert.equal(seatView(u, 1).threat, 22);
  assert.ok(seatView(u, 0).discard.includes("01016"));
  reload(u);
});
test("All printed shadows resolve corrected clauses", () => {
  const s = base(),
    e = enemy(s),
    a = ally(s);
  s.combat = { enemyId: e.id, defenderId: a.id, attackBonus: 0 };
  gramShadow(s, G.patrol);
  assert.equal(s.combat.attackBonus, 2);
  gramShadow(s, G.tormentor);
  assert.equal(s.combat.attackBonus, 4);
  gramShadow(s, G.captives);
  assert.equal(s.combat.gramCaptureDamage, true);
  a.attachments.push({ id: `a${s.nextId++}`, code: "01026", exhausted: false });
  gramShadow(s, G.tunnels);
  assert.equal(a.attachments.length, 0);
  assert.equal(s.mountGram!.captured[e.id][0].code, "01026");
  s.hand = [make(s, "01016")];
  gramShadow(s, G.interrogation);
  assert.equal(s.hand.length, 0);
  assert.equal(s.threat, 20 + Number(card("01016").cost));
  reload(s);
});
test("Feeble Weary shadow offers an owned ready character", () => {
  const s = base(),
    e = enemy(s);
  s.combat = { enemyId: e.id, attackBonus: 0 };
  gramShadow(s, G.weary);
  const t = settle(pick(s, s.heroes[0].id));
  assert.equal(t.heroes[0].exhausted, true);
});
test("Executioners Time expiration discards rather than rescues and charges only character costs", () => {
  const s = base(),
    e = staged(s, G.executioners);
  e.timeCounters = 1;
  const a = captive(s, e),
    h = captive(s, e, "01002"),
    att = captive(s, e, "01026");
  gramRefreshEnd(s);
  finish(s);
  assert.equal(s.threat, 26);
  assert.ok(
    s.discard.includes(a.code) &&
      s.discard.includes(h.code) &&
      s.discard.includes(att.code),
  );
  assert.ok(!s.hand.length);
  assert.ok(!s.staging.some((u) => u.id === e.id));
  assert.deepEqual(s.mountGram!.removedEncounter, [G.executioners]);
  reload(s);
});
test("Executioner Time advances in every private area exactly once", () => {
  const s = base(2);
  eachArea(s, () => {
    const e = staged(s, G.executioners);
    e.timeCounters = 2;
    captive(s, e);
  });
  gramRefreshEnd(s);
  eachArea(s, () => assert.equal(s.staging[0].timeCounters, 1));
  reload(s);
});
test("Dungeon join transfers staging, retains engaged enemies, and rescues former active location", () => {
  const s = base(2),
    e = enemy(s),
    l = staged(s, G.cell),
    a = captive(s, l),
    moving = staged(s, G.guard);
  s.staging = s.staging.filter((u) => u.id !== l.id);
  s.activeLocation = l;
  const remoteQuest = gramArea(s, 1)!.quest;
  captive(s, remoteQuest, "01016", 1);
  s.phase = "travel";
  gramTravelStart(s);
  flush(s);
  assert.match(s.choice!.title, /Join another/);
  const t = settle(pick(s, gramArea(s, 1)!.id));
  assert.equal(t.mountGram!.areas.length, 1);
  assert.equal(t.mountGram!.areas[0].players.length, 2);
  assert.ok(t.staging.some((u) => u.id === moving.id));
  assert.ok(t.engaged.some((u) => u.id === e.id));
  assert.ok(t.hand.some((u) => u.id === a.id));
  assert.equal(t.activeLocation, null);
  reload(t);
});
test("A joined three-player dungeon restores its first player's quest turn after a guided staging review", () => {
  let s = browserJoin();
  const destination = gramArea(s, 2)!.id;
  s = applyAction(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Join another/);
  s = settle(pick(s, destination));
  assert.deepEqual(gramArea(s, 0)!.players.slice().sort(), [0, 2]);
  selectSeat(s, 1);
  s.threat = 50;
  check(s);
  selectSeat(s, 2);
  s.phase = "quest";
  s.table!.turn = 2;
  s.mountGram!.resolvedAreas = [];
  s.flow = { nextId: 1, pending: null, history: [] };
  s.queue = [
    fx("questReady", { player: 0 }),
    fx("valiant", { player: 2 }),
    fx("valiant", { player: 2 }),
  ];
  flush(s);
  assert.equal(s.table!.active, 0);
  assert.equal(s.table!.turn, 0);
  assert.ok(s.flow.pending);
  for (let reviews = 0; s.flow?.pending; reviews++) {
    assert.ok(reviews < 10);
    s = applyAction(reload(s), {
      type: "CONTINUE",
      stepId: s.flow.pending!.id,
    });
    assert.equal(s.table!.active, 0);
  }
  assert.equal(s.table!.active, 0);
  s = applyAction(reload(s), { type: "NEXT" });
  assert.ok(s.lastQuest);
  reload(s);
});
test("A joined dungeon preserves a response controller during review and restores its travel decision seat when the queue ends", () => {
  let s = browserJoin();
  const destination = gramArea(s, 2)!.id;
  s = applyAction(s, { type: "NEXT" });
  s = settle(pick(s, destination));
  const before = seatView(s, 2).hand.length;
  s.flow = { nextId: 1, pending: null, history: [] };
  s.queue = [fx("draw", { value: 1, player: 2 })];
  flush(s);
  assert.equal(s.table!.active, 2);
  assert.equal(s.table!.turn, 0);
  assert.ok(s.flow.pending);
  assert.equal(seatView(s, 2).hand.length, before + 1);
  for (let reviews = 0; s.flow?.pending; reviews++) {
    assert.ok(reviews < 10);
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  }
  assert.equal(s.table!.active, 0);
  assert.equal(s.table!.turn, 0);
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.table!.active, 1);
  assert.equal(s.table!.turn, 1);
  reload(s);
});
test("An Orc Slayer destroys a staged Guard after its original dungeon player is eliminated", () => {
  let s = base(3);
  const destination = gramArea(s, 2)!.id;
  const firstQuest = gramArea(s, 0)!.quest;
  captive(s, firstQuest, "01016", 0);
  captive(s, gramArea(s, 2)!.quest, "01016", 2);
  selectSeat(s, 1);
  const guard = staged(s, G.guard);
  guard.damage = stats(s, guard).health - 1;
  s.phase = "travel";
  gramTravelStart(s);
  flush(s);
  s = settle(pick(s, destination));
  selectSeat(s, 0);
  progress(s, 1);
  s = finish(s);
  assert.equal(s.mountGram!.captured[firstQuest.id]?.length ?? 0, 0);
  gramTravelStart(s);
  flush(s);
  s = settle(pick(s, destination));
  assert.equal(s.mountGram!.areas.length, 1);
  selectSeat(s, 1);
  s.threat = 50;
  check(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(gramArea(s, 0)!.staging.some((u) => u.id === guard.id));
  assert.equal(get(s, guard.id)!.owner, 1);
  selectSeat(s, 0);
  s.phase = "planning";
  s.table!.turn = 0;
  const slayer = make(s, "01018");
  s.hand.push(slayer);
  s = applyAction(reload(s), { type: "PLAY", id: slayer.id });
  if (s.choice?.title.includes("Longbeard Orc Slayer")) s = pick(s, "damage");
  s = settle(s);
  assert.equal(s.allies.filter((u) => u.id === slayer.id).length, 1);
  assert.ok(!get(s, guard.id));
  assert.ok(!gramArea(s, 0)!.staging.some((u) => u.id === guard.id));
  assert.equal(s.encounterDiscard.filter((code) => code === G.guard).length, 1);
  reload(s);
});
test("Last completed dungeon advances all players with physical Gate and Jailor and merged Orc deck", () => {
  const s = base();
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s.phase = "travel";
  const asideIds = s.mountGram!.setAside.map((u) => u.id);
  gramTravelStart(s);
  const t = finish(s);
  assert.equal(t.stage, 3);
  assert.equal(t.mountGram!.split, false);
  assert.ok(asideIds.every((id) => get(t, id)));
  assert.equal(t.mountGram!.orcDeck.length, 0);
  assert.equal(t.mountGram!.setAside.length, 0);
  reload(t);
});
test("Southern Gate requires16 progress, raises threat to35, and grants Orc attack while active", () => {
  const s = flight(),
    g = gate(s),
    e = enemy(s, G.guard);
  s.phase = "travel";
  s.progress = 15;
  assert.match(canTravel(s, g)!, /16/);
  s.progress = 16;
  assert.equal(canTravel(s, g), null);
  const t = settle(applyAction(reload(s), { type: "TRAVEL", id: g.id }));
  assert.equal(t.threat, 35);
  assert.equal(stats(t, get(t, e.id)!).attack, (card(e.code).attack ?? 0) + 2);
  reload(t);
});
test("Final dungeon stage cannot be defeated while Gate remains but wins after it is explored", () => {
  const s = flight(),
    g = gate(s);
  s.progress = 16;
  s.activeLocation = g;
  s.staging = [];
  progressLocation(s, g, card(g.code).quest!);
  check(s);
  const t = finish(s);
  assert.equal(t.status, "won");
  reload(t);
});
test("Malformed Gram hidden ownership, duplicate identity and Time counter are rejected", () => {
  const s = base(),
    q = gramQuestUnit(s)!,
    u = captive(s, q);
  assert.ok(validateSave(s));
  const wrong = structuredClone(s);
  wrong.mountGram!.captured[q.id][0].owner = 3;
  assert.equal(validateSave(wrong), false);
  const duplicate = structuredClone(s);
  duplicate.hand.push({ ...u });
  assert.equal(validateSave(duplicate), false);
  const timer = structuredClone(s);
  const e = staged(timer, G.executioners);
  e.timeCounters = 5;
  assert.equal(validateSave(timer), false);
});
