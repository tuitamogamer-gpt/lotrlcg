import { CARROCK } from "../src/game/carrock";
import { angmarSyncSwordThain } from "../src/game/angmar-player";
import { base as ettenFixture } from "./ettenmoors-fixtures";
import { ETTEN } from "../src/game/ettenmoors-support";
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  playTargets,
  needsTarget,
  validateSave,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, make, playCost } from "../src/game/core";
import { enterAlly, discardCharacter, check } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import { questExhausts } from "../src/game/expansion-passives";
import {
  playEventFromDiscardEffect,
  resolvePlayerCard,
} from "../src/game/actions";
import { COBAS_PLAYER as P } from "../src/game/cobas-player-support";
import * as Economy from "../src/game/cobas-economy";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import {
  depthsPlayerFixture as fixture,
  depthsPlayerAlly as ally,
  depthsPlayerHand as hand,
  depthsPlayerAttach as attach,
} from "./depths-player-fixtures";
import type { GameState } from "../src/game/types";
const select = (s: GameState, id: string) => choose(reload(s), id);
const play = (
  s: GameState,
  code: string,
  target?: string,
  payment?: Record<string, number>,
) => applyAction(s, { type: "PLAY", id: hand(s, code).id, target, payment });
function houses(players = 1) {
  const s = fixture(players);
  s.phase = "refresh";
  s.discard = ["01001"];
  s.fallenThreat = 12;
  return s;
}
function cancelEvent(s: GameState) {
  const bane = make(s, S.bane);
  s.staging = [bane];
  attach(s, bane, S.counter);
  s.encounterDeck = [S.flame, "01099"];
}

test("Linhir single-pool actual hand play offers a saveable optional Response and both characters quest ready", () => {
  let s = fixture();
  const hero = s.heroes[0];
  s = play(s, P.linhir, undefined, { [hero.id]: 3 });
  const linhir = s.allies.find((u) => u.code === P.linhir)!;
  assert.match(s.choice!.title, /Linhir/);
  assert.equal(get(s, hero.id)!.resources, 7);
  s = select(s, "use");
  assert.equal(questExhausts(s, get(s, hero.id)!), false);
  assert.equal(questExhausts(s, get(s, linhir.id)!), false);
  s.phase = "quest";
  s.committedIds = [hero.id, linhir.id];
  s = applyAction(s, { type: "COMMIT" });
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.equal(get(s, linhir.id)!.exhausted, false);
  assert.equal(get(s, linhir.id)!.committed, true);
});
test("Linhir split payment, zero paid cost, and put-into-play do not manufacture a single-pool Response", () => {
  let s = fixture();
  s = play(s, P.linhir, undefined, {
    [s.heroes[0].id]: 2,
    [s.heroes[1].id]: 1,
  });
  assert.equal(s.choice, null);
  const u = make(s, P.linhir);
  Economy.cobasEconomyCardPaid(s, u, {}, true, true);
  enterAlly(s, u, false, true, true);
  flush(s);
  assert.equal(s.choice, null);
  enterAlly(s, make(s, P.linhir), false, false, true);
  flush(s);
  assert.equal(s.choice, null);
});
test("Declining Linhir leaves both ordinary quest costs intact", () => {
  let s = fixture();
  const hero = s.heroes[0];
  s = play(s, P.linhir, undefined, { [hero.id]: 3 });
  s = select(s, "skip");
  assert.equal(questExhausts(s, get(s, hero.id)!), true);
  assert.equal(questExhausts(s, s.allies[0]), true);
});
test("Linhir's lasting effect survives blanking/control transfer but departure clears that card instance", () => {
  let s = fixture(2);
  const hero = s.heroes[0];
  s = play(s, P.linhir, undefined, { [hero.id]: 3 });
  s = select(s, "use");
  const u = s.allies.find((u) => u.code === P.linhir)!;
  u.blanked = true;
  s.allies = s.allies.filter((a) => a.id !== u.id);
  forOwner(s, 1, () => s.allies.push(u));
  selectSeat(s, 1);
  assert.equal(questExhausts(s, u), false);
  discardCharacter(s, u);
  assert.equal(Economy.cobasEconomyNoQuestExhaust(s, u), false);
  assert.equal(Economy.cobasEconomyNoQuestExhaust(s, get(s, hero.id)!), true);
});
test("Houses is refresh-only, targets a living player's dead hero, and respects title uniqueness", () => {
  const s = houses(2),
    u = hand(s, P.houses);
  assert.equal(needsTarget(u), true);
  assert.equal(canPlay(s, u), null);
  assert.deepEqual(
    playTargets(s, u).map((u) => u.id),
    ["discard-0-0"],
  );
  s.phase = "planning";
  assert.match(canPlay(s, u)!, /Refresh/);
  s.phase = "refresh";
  ally(s, "01001", 1);
  assert.equal(playTargets(s, u).length, 0);
});
test("Houses can be initiated with only the discounted resources and pays chosen Healers on confirmation", () => {
  let s = houses();
  const healer = ally(s, P.ioreth),
    hero = s.heroes[0],
    u = hand(s, P.houses);
  for (const h of s.heroes) h.resources = h.id === hero.id ? 4 : 0;
  assert.equal(playCost(s, card(P.houses)), 4);
  assert.equal(canPlay(s, u), null);
  s = applyAction(s, {
    type: "PLAY",
    id: u.id,
    target: "discard-0",
    payment: { [hero.id]: 4 },
  });
  assert.ok(!s.choice!.options.some((o) => o.id === "pay"));
  s = select(s, healer.id);
  assert.equal(get(s, healer.id)!.exhausted, false);
  assert.equal(get(s, hero.id)!.resources, 4);
  s = select(s, "pay");
  assert.equal(get(s, healer.id)!.exhausted, true);
  assert.equal(get(s, hero.id)!.resources, 0);
  const returned = s.heroes.find((h) => h.code === "01001")!;
  assert.equal(returned.damage, 1);
  assert.equal(returned.resources, 0);
  assert.equal(s.fallenThreat, 0);
  assert.deepEqual(s.discard, [P.houses]);
});
test("Houses can decline every Healer and pay five, or cancel selection without paying", () => {
  let s = houses();
  const healer = ally(s, P.ioreth),
    before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, P.houses, "discard-0");
  s = select(s, "skip");
  assert.equal(s.hand.filter((u) => u.code === P.houses).length, 1);
  assert.equal(get(s, healer.id)!.exhausted, false);
  const u = s.hand.find((u) => u.code === P.houses)!;
  s = applyAction(s, { type: "PLAY", id: u.id, target: "discard-0" });
  s = select(s, "pay");
  assert.equal(get(s, healer.id)!.exhausted, false);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 5,
  );
});
test("Houses excludes another player's Healers and returns the hero to its owning player", () => {
  let s = houses(2);
  s.discard = [];
  forOwner(s, 1, () => {
    s.discard = ["01001"];
    s.fallenThreat = 12;
  });
  const ours = ally(s, P.ioreth),
    theirs = ally(s, "04083", 1);
  s = play(s, P.houses, "discard-1-0");
  assert.ok(s.choice!.options.some((o) => o.id === ours.id));
  assert.ok(!s.choice!.options.some((o) => o.id === theirs.id));
  s = select(s, ours.id);
  s = select(s, "pay");
  const revived = seatView(s, 1).heroes.find((h) => h.code === "01001")!;
  assert.equal(revived.owner, 1);
  assert.equal(revived.damage, 1);
  assert.equal(seatView(s, 1).fallenThreat, 0);
  assert.ok(!s.heroes.some((h) => h.id === revived.id));
});
test("Houses exhaustion and resources remain paid when Counter-Spell cancels resurrection", () => {
  let s = houses();
  cancelEvent(s);
  const healer = ally(s, P.ioreth),
    before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, P.houses, "discard-0");
  s = select(s, healer.id);
  s = select(s, "pay");
  assert.equal(get(s, healer.id)!.exhausted, true);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 4,
  );
  assert.ok(s.discard.includes("01001"));
  assert.ok(s.discard.includes(P.houses));
  assert.ok(!s.heroes.some((h) => h.code === "01001"));
});
test("Houses paid replay takes the selected physical discard slot and fixes later hero target indexes", () => {
  let s = houses();
  s.discard = [P.houses, "01001", P.houses];
  const healer = ally(s, P.ioreth);
  playEventFromDiscardEffect(s, 0, { target: "discard-1", bottom: true });
  flush(s);
  s = select(s, healer.id);
  s = select(s, "pay");
  assert.equal(s.heroes.find((h) => h.code === "01001")!.damage, 1);
  assert.deepEqual(s.discard, [P.houses]);
  assert.equal(s.deck.at(-1), P.houses);
});
test("Houses stale healer selection rejects mutation before any resources are spent", () => {
  let s = houses();
  const healer = ally(s, P.ioreth);
  s = play(s, P.houses, "discard-0");
  s = select(s, healer.id);
  get(s, healer.id)!.exhausted = true;
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  assert.throws(() => choose(s, "pay"), /Healer/);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before,
  );
});
test("Justice moves its own event into victory as a cost and survives a pending save without duplication", () => {
  let s = fixture();
  const u = hand(s, P.justice);
  s.hand = s.hand.filter((h) => h.id !== u.id);
  resolvePlayerCard(s, u, undefined, 0, true, true);
  assert.deepEqual(s.victoryCards, [P.justice]);
  assert.equal(s.resolvingEvents?.[0].unit.id, u.id);
  assert.equal(s.resolvingEvents?.[0].destination, "spent");
  assert.ok(!s.discard.includes(P.justice));
  s = reload(s);
  flush(s);
  assert.deepEqual(s.victoryCards, [P.justice]);
  assert.equal(s.resolvingEvents, undefined);
  assert.equal(s.hand.length, 3);
  assert.ok(s.heroes.every((h) => h.resources === 13));
});
test("Justice cancellation still pays the victory cost but creates no economy or delayed elimination", () => {
  let s = fixture();
  cancelEvent(s);
  s = play(s, P.justice);
  assert.deepEqual(s.victoryCards, [P.justice]);
  assert.ok(s.heroes.every((h) => h.resources === 10));
  assert.equal(s.hand.length, 0);
  assert.deepEqual(Economy.cobasEconomyRoundEnd(s), []);
  assert.equal(s.resolvingEvents, undefined);
});
test("Justice refresh round-end eliminates only its player without raising their threat", () => {
  let s = fixture(2);
  const threat = s.threat;
  s = play(s, P.justice);
  assert.equal(s.status, "playing");
  s = reload(s);
  selectSeat(s, 1);
  s.phase = "refresh";
  handle(s, fx("endRound"));
  flush(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(seatView(s, 0).threat, threat);
  assert.equal(s.table!.seats[1].eliminated, false);
  assert.equal(s.status, "playing");
  assert.ok(seatView(s, 1).heroes.length > 0);
});
test("Justice solo end-round loses the game and another player's simultaneous use eliminates both", () => {
  let s = fixture();
  s = play(s, P.justice);
  s.phase = "refresh";
  s = applyAction(s, { type: "NEXT" });
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Justice/);
  s = fixture(2);
  s = play(s, P.justice);
  selectSeat(s, 1);
  s = play(s, P.justice);
  s.phase = "refresh";
  handle(s, fx("endRound"));
  flush(s);
  check(s);
  assert.equal(s.status, "lost");
  assert.ok(s.table!.seats.every((p) => p.eliminated));
});

test("Five own Healers can pay Houses at zero resources while all five exhaustion costs remain real", () => {
  let s = houses();
  const healers = Array.from({ length: 5 }, () => ally(s, "04083"));
  for (const hero of s.heroes) hero.resources = 0;
  const u = hand(s, P.houses);
  assert.equal(playCost(s, card(P.houses)), 0);
  assert.equal(canPlay(s, u), null);
  s = applyAction(s, { type: "PLAY", id: u.id, target: "discard-0" });
  for (const healer of healers) s = select(s, healer.id);
  s = select(s, "pay");
  assert.ok(healers.every((h) => get(s, h.id)!.exhausted));
  assert.equal(s.heroes.find((h) => h.code === "01001")!.damage, 1);
  assert.ok(s.heroes.every((h) => h.resources === 0));
});
test("Justice grants resources to a Sword-thain hero and keeps its physical victory cost on a bottom-deck replay", () => {
  const s = fixture(),
    promoted = ally(s, "02030");
  attach(s, promoted, "10149");
  s.discard = [P.justice, P.justice];
  const deckSize = s.deck.length;
  playEventFromDiscardEffect(s, 0, { bottom: true });
  flush(s);
  assert.equal(get(s, promoted.id)!.resources, 3);
  assert.deepEqual(s.victoryCards, [P.justice]);
  assert.deepEqual(s.discard, [P.justice]);
  assert.equal(s.deck.length, deckSize - 3);
});
test("Linhir bonus expires at the real round boundary", () => {
  let s = fixture();
  const hero = s.heroes[0];
  s = play(s, P.linhir, undefined, { [hero.id]: 3 });
  s = select(s, "use");
  const linhir = s.allies.find((u) => u.code === P.linhir)!;
  s.phase = "refresh";
  s = applyAction(s, { type: "NEXT" });
  assert.equal(Economy.cobasEconomyNoQuestExhaust(s, get(s, hero.id)!), false);
  assert.equal(
    Economy.cobasEconomyNoQuestExhaust(s, get(s, linhir.id)!),
    false,
  );
});

test("A spent event receipt is valid only after Justice's actual victory cost", () => {
  const s = fixture(),
    u = hand(s, P.justice);
  s.hand = s.hand.filter((h) => h.id !== u.id);
  resolvePlayerCard(s, u, undefined, 0, true, true);
  assert.equal(validateSave(s), true);
  const withoutCost = structuredClone(s);
  withoutCost.victoryCards = [];
  assert.equal(validateSave(withoutCost), false);
  const otherEvent = structuredClone(s);
  otherEvent.resolvingEvents![0].unit.code = "01023";
  assert.equal(validateSave(otherEvent), false);
});

test("Houses reserves its physical event through Forage's saved cost-damage response before reviving the hero", () => {
  let s = ettenFixture(2);
  s.phase = "refresh";
  s.staging = [make(s, ETTEN.forage)];
  s.discard = ["01011"];
  s.fallenThreat = 12;
  for (const h of s.heroes)
    h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
  const healer = ally(s, P.ioreth),
    dori = ally(s, "131009"),
    event = hand(s, P.houses),
    hero = s.heroes[0];
  s = applyAction(s, {
    type: "PLAY",
    id: event.id,
    target: "discard-0-0",
    payment: { [hero.id]: 4 },
  });
  s = select(s, healer.id);
  s = select(s, "pay");
  assert.match(s.choice!.title, /Dori/);
  assert.equal(s.pendingPlayerPlays?.[0].unit.id, event.id);
  assert.equal(get(s, healer.id)!.exhausted, true);
  assert.equal(s.resolvingEvents, undefined);
  assert.ok(!s.heroes.some((h) => h.code === "01011"));
  s = select(s, dori.id);
  assert.equal(get(s, dori.id)!.damage, 1);
  assert.equal(s.heroes.find((h) => h.code === "01011")!.damage, 1);
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(s.discard.filter((c) => c === P.houses).length, 1);
});

test("Houses can choose different resource pools after declining the preview's optional Healer discount", () => {
  let s = houses();
  const healer = ally(s, P.ioreth),
    first = s.heroes[0],
    second = s.heroes[1];
  s = play(s, P.houses, "discard-0", { [first.id]: 4 });
  s = select(s, "payment");
  const payment = s.choice!.options.find((o) =>
    o.effects.some(
      (e) => e.text && JSON.parse(e.text).payment?.[second.id] === 5,
    ),
  );
  assert.ok(payment);
  s = select(s, payment.id);
  assert.equal(get(s, first.id)!.resources, 10);
  assert.equal(get(s, second.id)!.resources, 5);
  assert.equal(get(s, healer.id)!.exhausted, false);
  assert.equal(s.heroes.find((h) => h.code === "01001")!.damage, 1);
});

test("Linhir's round grant expires after its initiating player is eliminated while the ally survives under new control", () => {
  let s = fixture(2);
  const hero = s.heroes[0];
  s = play(s, P.linhir, undefined, { [hero.id]: 3 });
  s = select(s, "use");
  const u = s.allies.find((a) => a.code === P.linhir)!;
  s.allies = s.allies.filter((a) => a.id !== u.id);
  forOwner(s, 1, () => s.allies.push(u));
  s.threat = 50;
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(Economy.cobasEconomyNoQuestExhaust(s, get(s, u.id)!), true);
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(Economy.cobasEconomyNoQuestExhaust(s, get(s, u.id)!), false);
});

test("Linhir still gains its own lasting effect when Forage destroys the recorded paying hero before entry", () => {
  let s = ettenFixture(2);
  s.staging = [make(s, ETTEN.forage)];
  const payer = s.heroes[0],
    u = hand(s, P.linhir);
  payer.phaseResourceIcons = ["spirit"];
  payer.resources = 3;
  payer.damage = (card(payer.code).health ?? 0) - 1;
  s = applyAction(s, { type: "PLAY", id: u.id, payment: { [payer.id]: 3 } });
  assert.ok(!get(s, payer.id));
  assert.match(s.choice!.title, /Linhir/);
  s = select(s, "use");
  assert.equal(Economy.cobasEconomyNoQuestExhaust(s, get(s, u.id)!), true);
});

test("Sacked permits a Sword-thain Healer to pay Houses' exhaustion cost through a saved choice", () => {
  let s = houses();
  const healer = ally(s, P.ioreth),
    payer = s.heroes[0];
  attach(s, healer, "10149");
  attach(s, healer, CARROCK.sacked);
  angmarSyncSwordThain(s);
  assert.ok(s.heroes.some((hero) => hero.id === healer.id));
  for (const hero of s.heroes) hero.resources = hero.id === payer.id ? 4 : 0;
  const event = hand(s, P.houses);
  assert.equal(playCost(s, card(P.houses)), 4);
  assert.equal(canPlay(s, event), null);
  s = applyAction(reload(s), {
    type: "PLAY",
    id: event.id,
    target: "discard-0",
    payment: { [payer.id]: 4 },
  });
  s = select(s, healer.id);
  assert.equal(get(s, healer.id)!.exhausted, false);
  s = select(s, "pay");
  assert.equal(get(s, healer.id)!.exhausted, true);
  assert.ok(
    get(s, healer.id)!.attachments.some((a) => a.code === CARROCK.sacked),
  );
  assert.equal(get(s, payer.id)!.resources, 0);
  assert.equal(s.heroes.find((h) => h.code === "01001")!.damage, 1);
  assert.equal(s.discard.filter((code) => code === P.houses).length, 1);
  s = reload(s);
  assert.equal(get(s, healer.id)!.exhausted, true);
});
