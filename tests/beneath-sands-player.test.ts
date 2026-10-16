import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, plain, playerCards, SCRIPTED } from "../src/game/cards";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import { fx, get, make, prepend, stats } from "../src/game/core";
import { phaseEnd, revealed } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import {
  hasTrait,
  questExhausts,
  restrictedAttachment,
} from "../src/game/expansion-passives";
import { addQuestProgress } from "../src/game/side-quests";
import {
  BENEATH_SANDS_PLAYER as P,
  BENEATH_SANDS_PLAYER_CARDS,
} from "../src/game/beneath-sands-player-support";
import {
  beneathSandsFreePeoplesTraitCount,
  beneathSandsHuntingCondition,
  beneathSandsPlayersCommitted,
} from "../src/game/beneath-sands-player";
import {
  beneathSandsPlayerFixture as fixture,
  beneathSandsPlayerHand as hand,
  beneathSandsPlayerAlly as ally,
  beneathSandsPlayerAttach as attach,
} from "./beneath-sands-player-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";
import { WATCHER_WATER } from "../src/game/watcher-water-support";
import { CARROCK } from "../src/game/carrock";
import type { GameState } from "../src/game/types";

const pick = (s: GameState, id: string) => choose(reload(s), id);
const act = (s: GameState, a: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), a);
function settle(s: GameState) {
  for (let n = 0; s.choice && n < 50; n++)
    s = pick(
      s,
      s.choice.options.find((o) =>
        ["skip", "none", "continue", "keep"].includes(o.id),
      )?.id ?? s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}
function succeed(s: GameState, id = s.heroes[0].id) {
  s.phase = "quest";
  s.encounterDeck = ["01099", "01099", "01099"];
  get(s, id)!.tempWill = 6;
  s = act(s, { type: "TOGGLE_QUEST", id });
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  return act(s, { type: "NEXT" });
}

// Four designs have real existing integrations; six have new pack scripts.
test("Beneath Sands keeps ten immutable original records and one playable definition per original code", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    BENEATH_SANDS_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.hirgon),
    ),
  );
  assert.equal(BENEATH_SANDS_PLAYER_CARDS.length, 10);
  assert.equal(
    BENEATH_SANDS_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    28,
  );
  for (const c of BENEATH_SANDS_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
  }
  assert.equal(card(P.watch).quest, 6);
  assert.equal(card(P.watch).victory, 1);
  assert.equal(card(P.arrow).victory, 1);
  assert.match(plain(card(P.spear).text), /Attach to a Harad character/);
  assert.equal(card(P.lookout).name, "Dúnedain Lookout");
});
test("Hirgon native successful quest serializes physical ally selection and matching resource payments", () => {
  let s = fixture(),
    a = hand(s, "17004"),
    h = s.heroes[0];
  const before = h.resources;
  s = succeed(s);
  assert.match(s.choice!.title, /Hirgon/);
  s = pick(s, "use");
  s = pick(s, a.id);
  for (let n = 0; n < 4; n++) {
    assert.match(s.choice!.title, /resource pool/);
    s = pick(s, h.id);
  }
  assert.match(s.choice!.title, /Strengthen/);
  s = pick(s, "raise");
  assert.equal(get(s, h.id)!.resources, before - 4);
  assert.equal(s.threat, 21);
  assert.ok(get(s, a.id));
  assert.ok(!s.hand.some((u) => u.id === a.id));
  assert.equal(stats(s, get(s, a.id)!).attack, (card(a.code).attack ?? 0) + 1);
  assert.equal(
    stats(s, get(s, a.id)!).defense,
    (card(a.code).defense ?? 0) + 1,
  );
});
test("Hirgon declines without spending resources or a physical ally and cannot play an illegal unique ally", () => {
  let s = fixture(),
    a = hand(s, "17004");
  ally(s, "17004");
  s = succeed(s);
  assert.equal(s.choice, null);
  assert.ok(s.hand.some((u) => u.id === a.id));
  s = fixture();
  a = hand(s, "17004");
  s = succeed(s);
  s = pick(s, "skip");
  assert.ok(s.hand.some((u) => u.id === a.id));
  assert.equal(s.heroes[0].resources, 10);
});
test("The Red Arrow native Valour quest response spends the physical attachment then searches only five and reloads", () => {
  let s = fixture(),
    h = s.heroes[1],
    a = attach(s, h, P.arrow);
  s.threat = 40;
  s.deck = ["01013", "01014", "01015", "01016", "01017", "17004"];
  const candidates = s.deck
    .slice(0, 5)
    .filter((code) => card(code).type_code === "ally");
  assert.ok(candidates.length);
  s = succeed(s, h.id);
  assert.match(s.choice!.title, /Red Arrow/);
  s = pick(s, "use");
  assert.ok(s.victoryCards!.includes(P.arrow));
  assert.ok(!get(s, h.id)!.attachments.some((x) => x.id === a.id));
  assert.match(s.choice!.title, /searched ally/);
  assert.ok(!s.choice!.options.some((o) => o.code === "17004"));
  const option = s.choice!.options.find((o) => o.code === candidates[0])!;
  s = pick(s, option.id);
  assert.ok(s.allies.some((u) => u.code === candidates[0]));
});
test("Red Arrow is Gondor-hero only and cannot trigger below Valour or when its host did not quest", () => {
  let s = fixture(),
    a = hand(s, P.arrow);
  assert.ok(playTargets(s, a).some((u) => u.id === s.heroes[0].id));
  assert.ok(!playTargets(s, a).some((u) => u.id === s.heroes[2].id));
  attach(s, s.heroes[1], P.arrow);
  s = succeed(s, s.heroes[1].id);
  assert.equal(s.choice, null);
});
test("Fireside Song native play allows Hobbit heroes once and counts each active Song including itself", () => {
  let s = fixture();
  s.heroes[1] = make(s, "02001");
  s.heroes[1].resources = 10;
  s.heroes[1].phaseResourceIcons = ["spirit"];
  const h = s.heroes[1],
    a = hand(s, P.song),
    before = stats(s, h).will;
  assert.deepEqual(
    playTargets(s, a).map((u) => u.id),
    [h.id],
  );
  s = act(s, { type: "PLAY", id: a.id, target: h.id });
  assert.equal(stats(s, get(s, h.id)!).will, before + 1);
  attach(s, get(s, h.id)!, "02010");
  assert.equal(stats(s, get(s, h.id)!).will, before + 2);
  get(s, h.id)!.attachments.at(-1)!.facedown = true;
  assert.equal(stats(s, get(s, h.id)!).will, before + 1);
  const duplicate = hand(s, P.song);
  assert.ok(!playTargets(s, duplicate).some((u) => u.id === h.id));
});
test("Dunedain Lookout native enemy reveal serializes cancellation and discards only the selected physical ally", () => {
  let s = fixture(),
    cost = ally(s, P.lookout),
    kept = ally(s, P.lookout);
  s.phase = "quest";
  s.heroes[0].committed = true;
  s.encounterDeck = ["01089"];
  prepend(s, fx("reveal"));
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `lookout-${cost.id}`));
  s = pick(s, `lookout-${cost.id}`);
  assert.equal(get(s, cost.id), undefined);
  assert.ok(get(s, kept.id));
  assert.ok(s.discard.includes(P.lookout));
  assert.equal(get(s, s.heroes[0].id)!.damage, 0);
  assert.ok(s.staging.some((u) => u.code === "01089"));
});
test("Lookout's cancellation belongs to its controller and cannot spend a Sacked copy or cancel underworld origin", () => {
  let s = fixture(2),
    cost = ally(s, P.lookout, 1);
  s.heroes[0].committed = true;
  revealed(s, "01089");
  flush(s);
  s = pick(s, `lookout-${cost.id}`);
  assert.ok(seatView(s, 1).discard.includes(P.lookout));
  assert.equal(get(s, cost.id), undefined);
  s = fixture();
  cost = ally(s, P.lookout);
  attach(s, cost, CARROCK.sacked);
  revealed(s, "01089");
  flush(s);
  assert.ok(!s.choice?.options.some((o) => o.id === `lookout-${cost.id}`));
  s = fixture();
  cost = ally(s, P.lookout);
  revealed(s, "01089", undefined, "underworld");
  flush(s);
  assert.ok(!s.choice?.options.some((o) => o.id === `lookout-${cost.id}`));
});
test("Haradrim Spear native play targets Harad characters and its optional attack response grants four total attack then discards exact spear", () => {
  let s = fixture(),
    h = ally(s, "17006"),
    a = hand(s, P.spear),
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s.phase = "planning";
  assert.ok(playTargets(s, a).some((u) => u.id === h.id));
  assert.ok(!playTargets(s, a).some((u) => u.id === s.heroes[0].id));
  assert.ok(restrictedAttachment(P.spear));
  s = act(s, { type: "PLAY", id: a.id, target: h.id });
  assert.equal(stats(s, get(s, h.id)!).attack, (card(h.code).attack ?? 0) + 1);
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [h.id] });
  assert.match(s.choice!.title, /Haradrim Spear/);
  s = pick(s, "use");
  assert.equal(get(s, enemy.id), undefined);
  assert.ok(!get(s, h.id)!.attachments.some((x) => x.id === a.id));
  assert.ok(s.discard.includes(P.spear));
  assert.equal(stats(s, get(s, h.id)!).attack, card(h.code).attack);
});
test("Declining Spear keeps its passive attack and physical attachment for another attack", () => {
  let s = fixture(),
    h = ally(s, "17006"),
    a = attach(s, h, P.spear),
    enemy = make(s, "01089");
  enemy.tempDefense = 20;
  s.engaged = [enemy];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [h.id] });
  s = pick(s, "skip");
  assert.ok(get(s, h.id)!.attachments.some((x) => x.id === a.id));
  assert.ok(!s.discard.includes(P.spear));
});
test("Hunting Party requires two distinct unique controlled Warrior and Scout characters", () => {
  const s = fixture(2);
  assert.equal(beneathSandsHuntingCondition(s), true);
  s.heroes = [s.heroes[0]];
  s.heroes[0].dynamicTraits = ["Warrior", "Scout"];
  assert.equal(beneathSandsHuntingCondition(s), false);
  const remote = seatView(s, 1).heroes[0];
  remote.dynamicTraits = ["Warrior"];
  assert.equal(beneathSandsHuntingCondition(s), false);
});
test("Hunting Party native all-player commitment discards the chosen staging enemy then reveals its replacement before regular staging", () => {
  let s = fixture(),
    a = hand(s, P.hunting),
    enemy = make(s, "01089");
  s.staging = [enemy];
  s.phase = "quest";
  s.encounterDeck = ["01099", "01099", "01099"];
  assert.match(canPlay(s, a)!, /responds/);
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Hunting Party/);
  s = pick(s, enemy.id);
  assert.equal(get(s, enemy.id), undefined);
  assert.equal(s.encounterDiscard.filter((c) => c === enemy.code).length, 1);
  assert.equal(s.staging.filter((u) => u.code === "01099").length, 2);
  assert.ok(s.discard.includes(P.hunting));
});
test("Hunting Party filters immune enemies, keeps its physical event on decline and never answers before the final seat commits", () => {
  let s = fixture(2),
    a = hand(s, P.hunting),
    enemy = make(s, "01089");
  s.staging = [enemy];
  s.phase = "quest";
  s = act(s, { type: "COMMIT" });
  assert.equal(s.choice, null);
  assert.equal(s.table!.active, 1);
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Hunting Party/);
  s = pick(s, "skip");
  assert.ok(seatView(s, 0).hand.some((u) => u.id === a.id));
  s = fixture();
  a = hand(s, P.hunting);
  enemy = make(s, "01089");
  enemy.immuneToPlayerEffects = true;
  s.staging = [enemy];
  beneathSandsPlayersCommitted(s);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.hand.some((u) => u.id === a.id));
});
test("Keep Watch reduces only nonunique engaged enemies, stacks no duplicate and sends duplicate to physical owner's discard", () => {
  const s = fixture(2),
    engaged = make(s, "01089"),
    staging = make(s, "01089"),
    unique = make(s, CARROCK.louis);
  s.engaged = [engaged, unique];
  s.staging = [staging];
  const before = stats(s, engaged).attack;
  const q = make(s, P.watch);
  s.staging.push(q);
  addQuestProgress(s, q, 6);
  assert.equal(stats(s, engaged).attack, before - 1);
  assert.equal(stats(s, staging).attack, card(staging.code).attack);
  assert.equal(stats(s, unique).attack, card(unique.code).attack);
  const duplicate = make(s, P.watch);
  duplicate.owner = 1;
  duplicate.controller = 0;
  s.staging.push(duplicate);
  addQuestProgress(s, duplicate, 6);
  assert.equal(s.victoryCards!.filter((c) => c === P.watch).length, 1);
  assert.ok(seatView(s, 1).discard.includes(P.watch));
  const immune = make(s, "octgn:f35e7236-2e03-4e03-aa92-7c4803e79acf");
  s.engaged.push(immune);
  assert.equal(stats(s, immune).attack, card(immune.code).attack);
});
test("Keep Watch browser fixture defeats its selected side quest via native commitment", () => {
  let s = fixture(),
    q = make(s, P.watch);
  s.staging = [q];
  s.phase = "quest";
  s.sideQuestSelections = {
    shared: { id: q.id, code: q.code, phase: "quest" },
  };
  s.heroes[0].tempWill = 8;
  s.encounterDeck = ["01099"];
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id });
  s = act(s, { type: "COMMIT" });
  s = act(s, { type: "NEXT" });
  s = settle(s);
  assert.ok(s.victoryCards!.includes(P.watch));
  assert.equal(s.progress, 0);
});
test("Rider of Rohan native commitment keeps it ready with either side quest type in victory and exhausts otherwise", () => {
  for (const victory of [[], [P.watch], ["09014"]]) {
    let s = fixture(),
      r = ally(s, P.rider);
    s.victoryCards = victory;
    s.phase = "quest";
    assert.equal(questExhausts(s, r), !victory.length);
    s = act(s, { type: "TOGGLE_QUEST", id: r.id });
    s = act(s, { type: "COMMIT" });
    assert.equal(get(s, r.id)!.exhausted, !victory.length);
    assert.equal(get(s, r.id)!.committed, true);
  }
});
test("Doughty Ranger native hand play grants Ranger, draws optionally and rejects a duplicate attachment", () => {
  let s = fixture(),
    h = s.heroes[2],
    a = hand(s, P.ranger);
  s.deck = ["01013"];
  assert.ok(!hasTrait(h, "Ranger"));
  s = act(s, { type: "PLAY", id: a.id, target: h.id });
  assert.match(s.choice!.title, /Doughty Ranger/);
  assert.ok(hasTrait(get(s, h.id)!, "Ranger"));
  s = pick(s, "use");
  assert.equal(s.hand[0].code, "01013");
  const duplicate = hand(s, P.ranger);
  assert.ok(!playTargets(s, duplicate).some((u) => u.id === h.id));
});
test("Doughty Ranger played on another player's hero grants the trait without drawing for a different controller", () => {
  let s = fixture(2),
    h = seatView(s, 1).heroes[0],
    a = hand(s, P.ranger);
  s = act(s, { type: "PLAY", id: a.id, target: h.id });
  assert.equal(s.choice, null);
  assert.ok(hasTrait(get(s, h.id)!, "Ranger"));
  assert.equal(seatView(s, 1).hand.length, 0);
});
test("The Free Peoples counts distinct controlled traits, readies both players and gives only controller's characters a phase bonus", () => {
  let s = fixture(2),
    a = hand(s, P.peoples);
  ally(s, "17004");
  ally(s, P.rider);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      for (const u of [...s.heroes, ...s.allies]) u.exhausted = true;
    });
  assert.ok(beneathSandsFreePeoplesTraitCount(s) >= 9);
  const before = stats(s, s.heroes[0]).will,
    remote = seatView(s, 1).heroes[0];
  s = act(s, { type: "PLAY", id: a.id });
  assert.equal(get(s, remote.id)!.exhausted, false);
  assert.equal(stats(s, get(s, remote.id)!).will, card(remote.code).willpower);
  assert.equal(stats(s, s.heroes[0]).will, before + 1);
  phaseEnd(s);
  assert.equal(stats(s, s.heroes[0]).will, before);
});
test("The Free Peoples cannot borrow another player's traits; forbidden ready targets stay exhausted while legal willpower still resolves", () => {
  let s = fixture(2),
    a = hand(s, P.peoples);
  ally(s, "17004", 1);
  ally(s, P.rider, 1);
  assert.match(canPlay(s, a)!, /9 different/);
  ally(s, "17004");
  ally(s, P.rider);
  const h = seatView(s, 1).heroes[0];
  h.exhausted = true;
  attach(s, h, WATCHER_WATER.wrapped);
  s = act(s, { type: "PLAY", id: a.id });
  assert.equal(get(s, h.id)!.exhausted, true);
  assert.equal(get(s, h.id)!.tempWill, undefined);
});

test("Lookout browser fixture waits for the final seat then pays the remote physical cancellation cost", () => {
  let s = fixture(2),
    lookout = ally(s, P.lookout, 1),
    kept = ally(s, P.lookout, 1),
    hero = s.heroes[0];
  s.phase = "quest";
  s.encounterDeck = ["01089", "01099"];
  s = act(s, { type: "TOGGLE_QUEST", id: hero.id });
  s = act(s, { type: "COMMIT" });
  assert.equal(s.choice, null);
  s = act(s, { type: "COMMIT" });
  assert.ok(s.choice!.options.some((o) => o.id === `lookout-${lookout.id}`));
  s = pick(s, `lookout-${lookout.id}`);
  assert.ok(get(s, kept.id));
  assert.ok(seatView(s, 1).discard.includes(P.lookout));
  assert.equal(get(s, hero.id)!.damage, 0);
});
