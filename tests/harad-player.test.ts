import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED, playerCards } from "../src/game/cards";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import { get, make, playCost, stats, eligiblePayers } from "../src/game/core";
import { addQuestProgress } from "../src/game/side-quests";
import {
  advanceQuest,
  enterAlly,
  phaseEnd,
  questDefeated,
} from "../src/game/board";
import { mainQuestUnit, attachToQuest } from "../src/game/quest-state";
import { activeSeat, forOwner, selectSeat, seatView } from "../src/game/table";
import { flush } from "../src/game/effects";
import { CHETWOOD } from "../src/game/chetwood-support";
import {
  HARAD_PLAYER as P,
  HARAD_PLAYER_CARDS,
  haradSideQuestCount,
} from "../src/game/harad-player-support";
import {
  haradPlayerFixture as fixture,
  haradPlayerHand as hand,
  haradPlayerAlly as ally,
  haradPlayerAttach as attach,
} from "./harad-player-fixtures";
import { reload, choose } from "./against-shadow-final-fixtures";
const pick = (s: ReturnType<typeof fixture>, id: string) =>
  choose(reload(s), id);
function play(s: ReturnType<typeof fixture>, id: string, target?: string) {
  return applyAction(reload(s), {
    type: "PLAY",
    id,
    ...(target ? { target } : {}),
  });
}
function settle(s: ReturnType<typeof fixture>) {
  for (let n = 0; s.choice && n < 40; n++)
    s = pick(
      s,
      s.choice.options.find((o) => ["skip", "continue"].includes(o.id))?.id ??
        s.choice.options[0].id,
    );
  return s;
}
test("Harad preserves thirteen original designs, 35 physical cards, and two already registered designs", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    HARAD_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.gimli),
    ),
  );
  assert.equal(HARAD_PLAYER_CARDS.length, 13);
  assert.equal(
    HARAD_PLAYER_CARDS.reduce((n, c) => n + c.quantity!, 0),
    35,
  );
  for (const c of HARAD_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(card(c.code).text, c.text);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
  }
  assert.equal(card(P.storm).quest, 5);
});
test("Unlikely Friendship uses distinct unique Silvan and Dwarf characters, draws and gives an own hero one resource", () => {
  let s = fixture();
  const event = hand(s, P.friendship),
    h = s.heroes[2],
    resources = h.resources;
  s.deck = ["01013", "01014"];
  assert.equal(canPlay(s, event), null);
  assert.ok(
    playTargets(s, event).every((u) => s.heroes.some((h) => h.id === u.id)),
  );
  s = play(s, event.id, h.id);
  assert.equal(get(s, h.id)!.resources, resources + 1);
  assert.equal(s.hand.filter((u) => u.code === "01013").length, 1);
  assert.ok(s.discard.includes(P.friendship));
});
test("Unlikely Friendship cannot borrow another player's trait or count a nonunique Dwarf", () => {
  const s = fixture(2),
    event = hand(s, P.friendship);
  s.heroes = s.heroes.filter((h) => h.code !== P.gimli);
  ally(s, "01016");
  assert.match(canPlay(s, event)!, /unique Silvan/);
  s.heroes[0].dynamicTraits = ["Dwarf"];
  assert.match(canPlay(s, event)!, /another unique Dwarf/);
});
test("Erebor Guard preview, optional deck cost, explicit split payment and physical identity survive saves", () => {
  let s = fixture();
  const guard = hand(s, P.guard),
    hero = s.heroes[0];
  s.deck = ["01013", "01014", "01015"];
  assert.equal(playCost(s, card(P.guard)), 2);
  s = play(s, guard.id);
  assert.match(s.choice!.title, /Optional cost reduction/);
  s = pick(s, "discount");
  assert.deepEqual(s.deck, ["01015"]);
  assert.ok(s.discard.includes("01013") && s.discard.includes("01014"));
  const option = s.choice!.options.find(
    (o) =>
      Object.values(JSON.parse(o.effects[0].text!)).filter((n) => n === 1)
        .length === 2,
  )!;
  assert.ok(option);
  const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = pick(s, option.id);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resources - 2,
  );
  assert.ok(s.allies.some((u) => u.id === guard.id && u.code === P.guard));
  assert.equal(
    s.hand.some((u) => u.id === guard.id),
    false,
  );
  assert.equal(get(s, hero.id)!.resources <= 10, true);
});
test("Erebor Guard may pay full cost without discarding or cancel without initiating a Response", () => {
  let s = fixture();
  const guard = hand(s, P.guard);
  s.deck = ["01013", "01014"];
  s = play(s, guard.id);
  const initiation = s.choice!.options.find((o) => o.id === "cancel")!;
  assert.equal(initiation.ability, undefined);
  s = pick(s, "skip");
  const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = pick(s, s.choice!.options[0].id);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    resources - 4,
  );
  assert.deepEqual(s.deck, ["01013", "01014"]);
});
test("Erebor Guard cannot partially pay the two-card deck cost or discount entry by another effect", () => {
  let s = fixture();
  const guard = hand(s, P.guard);
  s.deck = ["01013"];
  assert.equal(playCost(s, card(P.guard)), 4);
  s = play(s, guard.id);
  assert.ok(!s.choice!.options.some((o) => o.id === "discount"));
  s = pick(s, "cancel");
  assert.ok(s.hand.some((u) => u.id === guard.id));
  assert.equal(playCost(s, { ...card(P.guard), playOrigin: "discard" }), 4);
  assert.equal(playCost(s, { ...card(P.guard), playOrigin: "deck" }), 4);
});
test("Erebor Guard's milling resolves actual Hidden Cache responses before the exact ally enters", () => {
  let s = fixture();
  const guard = hand(s, P.guard),
    hero = s.heroes[0];
  s.deck = ["06143", "01013", "01014"];
  s = play(s, guard.id);
  s = pick(s, "discount");
  assert.match(s.choice!.title, /Hidden Cache/);
  assert.ok(!s.allies.some((u) => u.id === guard.id));
  s = settle(s);
  assert.ok(s.allies.some((u) => u.id === guard.id));
  assert.ok(s.discard.includes("06143"));
  assert.ok(get(s, hero.id));
});
test("Dour Handed counts both kinds of side quest, ignores ordinary enemies, and damages only your enemy", () => {
  let s = fixture(2);
  const event = hand(s, P.dour),
    enemy = make(s, "01089"),
    remote = make(s, "01089");
  s.engaged = [enemy];
  forOwner(s, 1, () => s.engaged.push(remote));
  s.victoryCards = ["09014", CHETWOOD.rearguard, "01082"];
  assert.equal(haradSideQuestCount(s), 2);
  assert.deepEqual(
    playTargets(s, event).map((u) => u.id),
    [enemy.id],
  );
  s = play(s, event.id, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(get(s, remote.id)!.damage, 0);
});
test("Dour Handed requires positive side-quest damage and respects immunity", () => {
  const s = fixture();
  const event = hand(s, P.dour),
    enemy = make(s, "01089");
  s.engaged = [enemy];
  assert.ok(canPlay(s, event));
  s.victoryCards = ["09014"];
  enemy.code = "octgn:e4f6c61b-afb1-4f12-81d5-4edd14a90d32";
  assert.equal(playTargets(s, event).length, 0);
});
test("Dwarven Shield and Mirkwood Long-knife use printed traits, hero type and Restricted bonuses", () => {
  let s = fixture();
  const shield = hand(s, P.shield),
    knife = hand(s, P.knife),
    gimli = s.heroes[0],
    legolas = s.heroes[1];
  assert.ok(playTargets(s, shield).some((u) => u.id === gimli.id));
  assert.ok(!playTargets(s, shield).some((u) => u.id === legolas.id));
  s = play(s, shield.id, gimli.id);
  assert.equal(stats(s, get(s, gimli.id)!).defense, 3);
  s = play(s, knife.id, legolas.id);
  assert.equal(stats(s, get(s, legolas.id)!).attack, 4);
  assert.equal(stats(s, get(s, legolas.id)!).will, 2);
});
test("The Road Goes Ever On attaches to a physical main quest and searches the first player's chosen player's actual deck", () => {
  let s = fixture(2);
  const road = hand(s, P.road),
    quest = mainQuestUnit(s)!;
  forOwner(s, 1, () => {
    s.deck = ["01013", P.storm, "01014"];
  });
  s = play(s, road.id, quest.id);
  assert.ok(mainQuestUnit(s)!.attachments.some((a) => a.id === road.id));
  assert.equal(questDefeated(s, quest.code), true);
  flush(s);
  assert.match(s.choice!.title, /Road Goes Ever On/);
  s = pick(s, "search");
  assert.equal(activeSeat(s), 0);
  s = pick(s, "player-1");
  assert.equal(activeSeat(s), 1);
  s = pick(s, "deck-1");
  assert.equal(seatView(s, 1).hand.filter((u) => u.code === P.storm).length, 1);
  assert.ok(seatView(s, 0).discard.includes(P.road));
  assert.equal(seatView(s, 1).deck.length, 2);
});
test("The Road Goes Ever On triggers from a defeated side quest and each physical copy responds independently", () => {
  let s = fixture();
  const side = make(s, "09014");
  s.staging = [side];
  attach(s, side, P.road);
  attach(s, side, P.road);
  s.deck = [P.storm, "01013"];
  addQuestProgress(s, side, 4);
  flush(s);
  let roadResponses = 0;
  for (let i = 0; s.choice && i < 12; i++) {
    if (/Road Goes Ever On/.test(s.choice.title)) roadResponses++;
    s = pick(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  assert.equal(roadResponses, 2);
  assert.equal(s.discard.filter((c) => c === P.road).length, 2);
});
test("The Road Goes Ever On does not trigger merely because a quest advances without defeat", () => {
  const s = fixture();
  const quest = mainQuestUnit(s)!;
  attachToQuest(s, quest.code, {
    id: "road-advance",
    code: P.road,
    exhausted: false,
  });
  advanceQuest(s);
  flush(s);
  assert.equal(s.choice, null);
});
test("The Storm Comes waives sphere matching only for each player's first actual ally play each round", () => {
  let s = fixture(2);
  const first = hand(s, P.guard),
    second = hand(s, P.archer);
  s.victoryCards = [P.storm];
  s.deck = [];
  for (const h of s.heroes) delete h.phaseResourceIcons;
  s.heroes[1].code = "01006";
  s.heroes[2].code = "01010";
  assert.equal(eligiblePayers(s, card(P.guard)).length, 3);
  s = play(s, first.id);
  s = pick(s, "skip");
  s = pick(s, s.choice!.options[0].id);
  assert.ok(
    eligiblePayers(s, card(P.archer)).every(
      (h) => card(h.code).sphere_code === "leadership",
    ),
  );
  selectSeat(s, 1);
  if (s.table) s.table.turn = 1;
  assert.equal(eligiblePayers(s, card(P.guard)).length, 3);
  assert.ok(seatView(s, 0).hand.some((u) => u.id === second.id));
});
test("The Storm Comes cannot reset a previously played ally, while putting an ally into play leaves its exemption available", () => {
  let s = fixture();
  const first = hand(s, "01013");
  s = play(s, first.id);
  s.victoryCards = [P.storm];
  for (const h of s.heroes) delete h.phaseResourceIcons;
  assert.ok(
    eligiblePayers(s, card(P.guard)).every(
      (h) => card(h.code).sphere_code === "spirit",
    ),
  );
  s = fixture();
  s.victoryCards = [P.storm];
  enterAlly(s, make(s, P.guard));
  assert.equal(eligiblePayers(s, card(P.dunadan)).length, 3);
  const duplicate = hand(s, P.storm);
  assert.equal(canPlay(s, duplicate), null);
});
test("The Storm Comes exemption returns with the next actual round", () => {
  let s = fixture();
  s.victoryCards = [P.storm];
  s.used.push("round:harad:ally-played");
  for (const h of s.heroes) delete h.phaseResourceIcons;
  assert.equal(eligiblePayers(s, card(P.dunadan)).length, 0);
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.equal(s.round, 2);
  assert.equal(eligiblePayers(s, card(P.dunadan)).length, 3);
});
test("Vigilant Dunadan defends consecutive actual enemy attacks without exhausting after a side quest is defeated", () => {
  let s = fixture();
  const d = ally(s, P.dunadan),
    a = make(s, "01090"),
    b = make(s, "01090");
  s.phase = "defense";
  s.engaged = [a, b];
  s.victoryCards = ["09014"];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: a.id,
    defenderId: d.id,
  });
  s = settle(s);
  assert.equal(get(s, d.id)!.exhausted, false);
  assert.equal(get(s, d.id)!.damage, 1);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: b.id,
    defenderId: d.id,
  });
  s = settle(s);
  assert.equal(get(s, d.id)!.exhausted, false);
  assert.equal(get(s, d.id)!.damage, 2);
});
test("Vigilant Dunadan exhausts normally while no side quest is in the victory display", () => {
  let s = fixture();
  const d = ally(s, P.dunadan),
    enemy = make(s, "01089");
  s.phase = "defense";
  s.engaged = [enemy];
  s.victoryCards = ["01082"];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: d.id,
  });
  s = settle(s);
  assert.equal(get(s, d.id)!.exhausted, true);
});

for (const players of [1, 2, 3, 4])
  test(`Original Greenwood Archer readies an actual hero across ${players} fellowship${players === 1 ? "" : "s"} with saved response choices`, () => {
    let s = fixture(players);
    const a = hand(s, P.archer),
      target = seatView(s, players - 1).heroes[0];
    target.exhausted = true;
    s = play(s, a.id);
    assert.match(s.choice!.title, /Greenwood Archer/);
    s = pick(s, "use");
    s = pick(s, target.id);
    assert.equal(get(s, target.id)!.exhausted, false);
    assert.ok(seatView(s, 0).allies.some((u) => u.id === a.id));
    assert.ok(!seatView(s, players - 1).hand.some((u) => u.id === a.id));
  });

test("MEC55 limits The Storm Comes in victory, while another already-played copy is defeated into its original owner's discard", () => {
  let s = fixture(2);
  const first = make(s, P.storm),
    second = make(s, P.storm),
    road = attach(s, second, P.road);
  second.owner = 1;
  second.controller = 0;
  s.staging = [first, second];
  addQuestProgress(s, first, 5);
  flush(s);
  s = settle(s);
  assert.equal(s.victoryCards!.filter((c) => c === P.storm).length, 1);
  addQuestProgress(s, get(s, second.id)!, 5);
  flush(s);
  assert.match(s.choice!.title, /Road Goes Ever On/);
  s = pick(s, "skip");
  assert.equal(s.victoryCards!.filter((c) => c === P.storm).length, 1);
  assert.equal(seatView(s, 1).discard.filter((c) => c === P.storm).length, 1);
  assert.equal(seatView(s, 0).discard.filter((c) => c === P.storm).length, 0);
  assert.ok(seatView(s, 0).discard.includes(road.code));
});
