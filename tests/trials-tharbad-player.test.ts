import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  canPlay,
  playTargets,
  validateSave,
} from "../src/game/engine";
import { card, encounterCards, SCRIPTED } from "../src/game/cards";
import {
  characters,
  fx,
  get,
  make,
  playCost,
  putPlayerDeck,
  shuffle,
  stats,
  takePlayerDeck,
} from "../src/game/core";
import {
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  enterAlly,
  nextRound,
  phaseEnd,
  placeEncounter,
  progressLocation,
  raiseThreat,
  revealed,
  returnAlly,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  playCardFromEffect,
  playEventFromDiscardEffect,
} from "../src/game/actions";
import {
  activeSeat,
  attachmentController,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { ringMakerRoundEnd } from "../src/game/ring-maker-player";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import { KHAZAD } from "../src/game/khazad-dum";
import type { GameState, Unit } from "../src/game/types";

function fixture(n = 1) {
  const s = base("mirkwood", n);
  s.heroes[0] = make(s, "08025");
  s.heroes[2] = make(s, "01012");
  s.startingHeroes = s.heroes.map((u) => u.code);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  return s;
}
function attach(s: GameState, host: Unit, code: string, owner = activeSeat(s)) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false, owner };
  host.attachments.push(a);
  return a;
}
function play(s: GameState, code: string, target?: string) {
  const u = make(s, code);
  s.hand.push(u);
  return applyAction(s, { type: "PLAY", id: u.id, target });
}
function roundReturns(s: GameState) {
  s.queue.push(...ringMakerRoundEnd(s));
  flush(s);
  return s;
}
function message(s: GameState, sending: number, id: string, recipient: number) {
  s = play(s, "08032");
  s = choose(s, `player-${sending}`);
  s = choose(reload(s), id);
  s = choose(s, `player-${recipient}`);
  return reload(s);
}

test("all twenty Three Trials and Tharbad player designs are registered with original provenance", () => {
  for (const [start, end, name] of [
    [25, 34, "The Three Trials"],
    [56, 65, "Trouble in Tharbad"],
  ] as const)
    for (let n = start; n <= end; n++) {
      const code = `08${String(n).padStart(3, "0")}`;
      assert.ok(SCRIPTED.has(code));
      assert.equal(card(code).pack_name, name);
    }
  assert.equal(card("08025").threat, 11);
});

test("Idraen responds to active and staging exploration, stays committed and may decline", () => {
  let s = fixture();
  const h = s.heroes[0];
  h.exhausted = h.committed = true;
  s.activeLocation = make(s, "01087");
  progressLocation(s, s.activeLocation, 1);
  flush(s);
  assert.match(s.choice!.title, /Idraen/);
  s = choose(reload(s), "ready");
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.committed, true);
  get(s, h.id)!.exhausted = true;
  const location = make(s, "01087");
  s.staging.push(location);
  progressLocation(s, location, 1);
  flush(s);
  s = choose(s, "skip");
  assert.equal(get(s, h.id)!.exhausted, true);
});
test("Idraen respects printed-text blanking and cannot-ready restrictions", () => {
  const s = fixture();
  const h = s.heroes[0];
  h.exhausted = true;
  attach(s, h, KHAZAD.fear);
  const location = make(s, "01087");
  s.staging = [location];
  progressLocation(s, location, 1);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(h.exhausted, true);
});
test("Warden only attaches to Scout heroes and explores the first one-point location before staging", () => {
  let s = fixture();
  const h = s.heroes[0];
  const w = make(s, "08031");
  s.hand = [w];
  assert.deepEqual(
    playTargets(s, w).map((u) => u.id),
    [h.id],
  );
  s = applyAction(s, { type: "PLAY", id: w.id, target: h.id });
  get(s, h.id)!.committed = get(s, h.id)!.exhausted = true;
  revealed(s, "01087");
  flush(s);
  assert.ok(!s.staging.some((u) => u.code === "01087"));
  assert.ok(s.encounterDiscard.includes("01087"));
  s = choose(reload(s), "ready");
  revealed(s, "01087");
  flush(s);
  assert.equal(s.staging.find((u) => u.code === "01087")!.progress, 0);
});
test("Warden's first reveal is consumed without quest commitment; mere additions do not consume it", () => {
  const s = fixture();
  const h = s.heroes[0];
  attach(s, h, "08031");
  placeEncounter(s, "01087");
  h.committed = true;
  revealed(s, "01099");
  flush(s);
  assert.equal(s.staging.find((u) => u.code === "01099")!.progress, 1);
  nextRound(s);
  h.committed = false;
  revealed(s, "01099");
  flush(s);
  h.committed = true;
  revealed(s, "01099");
  flush(s);
  assert.deepEqual(
    s.staging.filter((u) => u.code === "01099").map((u) => u.progress),
    [1, 0, 0],
  );
});
test("an immune first location consumes Warden even though it cannot receive progress", () => {
  const s = fixture();
  s.heroes[0].committed = true;
  attach(s, s.heroes[0], "08031");
  const code = encounterCards.find((c) => c.name === "Market Square")!.code;
  revealed(s, code);
  flush(s);
  revealed(s, "01099");
  flush(s);
  assert.deepEqual(
    s.staging.map((u) => u.progress),
    [0, 0],
  );
});
test("Warden partial progress survives a saved When Revealed cancellation window", () => {
  let s = fixture();
  s.heroes[0].committed = true;
  attach(s, s.heroes[0], "08031");
  s.hand = [make(s, "01050")];
  const code = encounterCards.find((c) => c.name === "Fouled Well")!.code;
  revealed(s, code);
  flush(s);
  s = choose(reload(s), "cancel");
  assert.equal(s.staging.find((u) => u.code === code)!.progress, 1);
});
test("Noiseless Movement prevents automatic checks for the entire round but permits optional engagement", () => {
  let s = fixture(2);
  const enemy = make(s, "01096");
  s.staging = [enemy];
  s = play(s, "08033", enemy.id);
  const physical = s.hand.find((u) => u.code === "08033")!.id;
  phaseEnd(s);
  s.phase = "encounter";
  s.queue = [fx("engagementRound")];
  flush(s);
  assert.ok(get(s, enemy.id));
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  s = reload(s);
  s = applyAction(s, { type: "ENGAGE", id: enemy.id });
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
  assert.ok(s.hand.some((u) => u.id === physical));
});
test("Noiseless Movement's second play discards and the engagement restriction expires next round", () => {
  let s = fixture();
  const enemy = make(s, "01096");
  s.staging = [enemy];
  s = play(s, "08033", enemy.id);
  const u = s.hand[0];
  s = applyAction(s, { type: "PLAY", id: u.id, target: enemy.id });
  assert.equal(s.hand.length, 0);
  assert.deepEqual(s.discard, ["08033"]);
  nextRound(s);
  s.threat = 45;
  s.queue = [fx("engagementRound")];
  flush(s);
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
});
test("Courage Awakened targets another player's hero, lasts for the phase and returns its physical first copy", () => {
  let s = fixture(2);
  const hero = seatView(s, 1).heroes[0];
  const before = stats(s, hero).will;
  s = play(s, "08061", hero.id);
  const copy = s.hand.find((u) => u.code === "08061")!;
  assert.equal(stats(s, get(s, hero.id)!).will, before + 2);
  s = reload(s);
  s = applyAction(s, { type: "PLAY", id: copy.id, target: hero.id });
  assert.equal(stats(s, get(s, hero.id)!).will, before + 4);
  assert.ok(!s.hand.some((u) => u.id === copy.id));
  phaseEnd(s);
  assert.equal(stats(s, get(s, hero.id)!).will, before);
});
test("Courage and Noiseless count canceled first plays and pay their costs", () => {
  let s = fixture();
  s.scenarioId = "shadow-and-flame";
  s.encounterDeck = ["01117"];
  const bane = make(s, SHADOW_FLAME.bane);
  s.staging = [bane];
  attach(s, bane, SHADOW_FLAME.counter);
  const target = s.heroes[0];
  const resources = characters(s).reduce((n, u) => n + u.resources, 0);
  s = play(s, "08061", target.id);
  assert.equal(get(s, target.id)!.tempWill ?? 0, 0);
  assert.equal(s.hand.length, 0);
  assert.equal(
    characters(s).reduce((n, u) => n + u.resources, 0),
    resources - 1,
  );
  s.encounterDeck = ["01099"];
  s = play(s, "08061", target.id);
  assert.equal(s.hand.length, 0);
  assert.equal(get(s, target.id)!.tempWill, 2);
});
test("Leaf Brooch stacks Secrecy, keys off printed spheres, and consumes only the first matching event", () => {
  let s = fixture();
  attach(s, s.heroes[0], "08034");
  attach(s, s.heroes[1], "08034");
  assert.equal(playCost(s, card("08061")), 0);
  assert.equal(
    playCost(s, card("08033")),
    1,
    "extra resource icons are not printed spheres",
  );
  s.heroes[0].exhausted = true;
  s = play(s, "08003", s.heroes[0].id);
  assert.equal(playCost(s, card("08003")), 1);
  assert.equal(
    playCost(s, card("08061")),
    0,
    "Leadership does not consume the Spirit event",
  );
  s = fixture();
  s.heroes[1] = make(s, "01008");
  attach(s, s.heroes[0], "08034");
  attach(s, s.heroes[1], "08034");
  assert.equal(playCost(s, card("01046")), 1, "two Spirit Brooches stack");
});
test("Leaf Brooch's discount is consumed by a zero-cost response even if threat later falls into Secrecy", () => {
  let s = fixture();
  attach(s, s.heroes[0], "08034");
  s.threat = 21;
  s.hand = [make(s, "08062")];
  raiseThreat(s, 1, "encounter");
  flush(s);
  s = choose(s, s.choice!.options[0].id);
  s.threat = 19;
  assert.equal(playCost(s, card("08061")), 1);
  nextRound(s);
  assert.equal(playCost(s, card("08061")), 0);
});
test("Leaf Brooch applies to paid discard replay and first-event tracking includes free deck plays", () => {
  let s = fixture();
  attach(s, s.heroes[0], "08034");
  s.discard = ["08061"];
  const total = characters(s).reduce((n, h) => n + h.resources, 0);
  playEventFromDiscardEffect(s, 0, { target: s.heroes[0].id, bottom: true });
  flush(s);
  assert.equal(
    characters(s).reduce((n, h) => n + h.resources, 0),
    total,
  );
  assert.ok(s.hand.some((u) => u.code === "08061"));
  assert.equal(playCost(s, card("08061")), 1);
  s = fixture();
  attach(s, s.heroes[0], "08034");
  s.deck = ["08061"];
  playCardFromEffect(s, make(s, "08061"), {
    putIntoPlay: false,
    target: s.heroes[0].id,
  });
  flush(s);
  assert.equal(playCost(s, card("08061")), 1);
  assert.ok(s.hand.some((u) => u.code === "08061"));
});
test("Leaf Brooch played after the first event has no retroactive discount", () => {
  let s = fixture();
  s = play(s, "08061", s.heroes[0].id);
  attach(s, s.heroes[0], "08034");
  assert.equal(playCost(s, card("08061")), 1);
});
test("Greyflood Wanderer offers optional Doomed before its response and places progress on active and staging locations", () => {
  let s = fixture(2);
  s.activeLocation = make(s, "01099");
  s.staging = [make(s, "01099")];
  s = play(s, "08030");
  assert.match(s.choice!.title, /Doomed 2/);
  assert.equal(s.threat, 20);
  s = choose(reload(s), "doomed");
  assert.equal(s.threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  assert.match(s.choice!.title, /Place progress/);
  s = choose(s, "progress");
  assert.equal(s.activeLocation!.progress, 1);
  assert.equal(s.staging[0].progress, 1);
});
test("optional Doomed combines with Gríma as one keyword and skipping still pays Gríma's Doomed 1", () => {
  for (const opt of ["doomed", "skip"]) {
    let s = fixture();
    s.used.push("round:grima-next");
    s.activeLocation = make(s, "01099");
    s = play(s, "08030");
    s = choose(s, opt);
    assert.equal(s.threat, opt === "doomed" ? 23 : 21);
    if (opt === "doomed") s = choose(s, "skip");
    else assert.equal(s.choice, null);
    assert.ok(!s.used.includes("round:grima-next"));
  }
});
test("optional Doomed is unavailable on put-into-play and free deck play; lethal Doomed resolves before its response", () => {
  const s = fixture();
  enterAlly(s, make(s, "08030"));
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.threat, 20);
  s.deck = ["08057"];
  playCardFromEffect(s, make(s, "08057"), { putIntoPlay: false });
  flush(s);
  assert.equal(s.choice, null);
  let t = fixture();
  t.threat = 48;
  t = play(t, "08030");
  t = choose(t, "doomed");
  assert.equal(t.status, "lost");
  assert.equal(t.choice, null);
});
test("Herald lets the chosen recipient put in a cheap ally with its original owner and no played-from-hand response", () => {
  let s = fixture(2);
  let cheap = "",
    expensive = "";
  forOwner(s, 1, () => {
    const a = make(s, "08026"),
      b = make(s, "08028");
    s.hand = [a, b];
    cheap = a.id;
    expensive = b.id;
  });
  s = play(s, "08057");
  s = choose(s, "doomed");
  s = choose(s, "player-1");
  assert.equal(activeSeat(s), 1);
  assert.ok(s.choice!.options.some((o) => o.id === cheap));
  assert.ok(!s.choice!.options.some((o) => o.id === expensive));
  s = choose(reload(s), cheap);
  assert.equal(seatView(s, 1).allies.find((u) => u.id === cheap)!.owner, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.ok(!s.choice);
});
test("Rúmil's hand-play response counts only your ranged characters and can damage another player's enemy", () => {
  let s = fixture(2);
  attach(s, s.heroes[0], "02097");
  const enemy = make(s, "01082");
  seatView(s, 1).engaged.push(enemy);
  s = play(s, "08028");
  s = choose(reload(s), enemy.id);
  assert.equal(
    get(s, enemy.id)!.damage,
    2,
    "Rúmil plus attached ranged hero; other player's Legolas is excluded",
  );
});
test("Rúmil does not respond when put into play or played from the deck", () => {
  const s = fixture();
  s.engaged = [make(s, "01082")];
  enterAlly(s, make(s, "08028"));
  flush(s);
  assert.equal(s.choice, null);
  const t = fixture();
  t.engaged = [make(t, "01082")];
  t.deck = ["08028"];
  playCardFromEffect(t, make(t, "08028"), { putIntoPlay: false });
  flush(t);
  assert.equal(t.choice, null);
});
test("Gwaihir retrieves the selected physical Eagle on free entry and returns it at round end even after Gwaihir leaves", () => {
  let s = fixture();
  s.discard = ["02004", "01020", "02004"];
  const gwaihir = make(s, "08059");
  enterAlly(s, gwaihir);
  flush(s);
  s = choose(reload(s), "discard-2");
  assert.deepEqual(s.discard, ["02004", "01020"]);
  const eagle = s.allies.find((u) => u.code === "02004")!;
  discardCharacter(s, get(s, gwaihir.id)!);
  flush(s);
  s = reload(s);
  roundReturns(s);
  assert.ok(!get(s, eagle.id));
  assert.ok(s.hand.some((u) => u.code === "02004"));
});
test("Gwaihir's delayed return does not follow an Eagle that leaves and re-enters play", () => {
  let s = fixture();
  s.discard = ["02004"];
  enterAlly(s, make(s, "08059"));
  flush(s);
  s = choose(s, "discard-0");
  const eagle = s.allies.find((u) => u.code === "02004")!;
  returnAlly(s, eagle);
  flush(s);
  const returned = s.hand.find((u) => u.code === "02004")!;
  s = applyAction(s, { type: "PLAY", id: returned.id });
  roundReturns(s);
  assert.ok(get(s, returned.id));
});
test("Gwaihir rejects Restricted attachments", () => {
  const s = fixture();
  const g = make(s, "08059"),
    dwarf = make(s, "01028");
  s.allies = [g, dwarf];
  const spear = make(s, "05009");
  assert.ok(playTargets(s, spear).some((u) => u.id === dwarf.id));
  assert.ok(!playTargets(s, spear).some((u) => u.id === g.id));
});
test("Message is multiplayer-only and lets the selected sending player decline", () => {
  let s = fixture();
  const copy = make(s, "08032");
  s.hand = [copy, make(s, "01020")];
  assert.match(canPlay(s, copy)!, /another player/);
  s = fixture(2);
  s.hand = [make(s, "01020")];
  s = play(s, "08032");
  s = choose(s, "player-1");
  s = choose(reload(s), "skip");
  assert.equal(s.ringMaker, undefined);
});
test("Message moves the exact card between two other players and shuffles it to its owner at round end", () => {
  let s = fixture(3);
  let id = "";
  forOwner(s, 1, () => {
    s.hand = [make(s, "01020"), make(s, "01020")];
    id = s.hand[1].id;
  });
  const before = seatView(s, 1).deck.length;
  s = message(s, 1, id, 2);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(seatView(s, 2).hand[0].id, id);
  assert.equal(seatView(s, 2).hand[0].owner, 1);
  roundReturns(s);
  assert.equal(seatView(s, 2).hand.length, 0);
  assert.equal(seatView(s, 1).deck.length, before + 1);
  assert.ok(validateSave(s));
});
test("a borrowed event and a borrowed discarded hand card go to the original owner's discard", () => {
  let s = fixture(2);
  const event = make(s, "01020");
  s.hand = [event];
  s = message(s, 0, event.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  const ally = make(s, "01028");
  ally.exhausted = true;
  s.allies = [ally];
  s = applyAction(s, { type: "PLAY", id: event.id, target: ally.id });
  assert.ok(seatView(s, 0).discard.includes("01020"));
  assert.ok(!seatView(s, 1).discard.includes("01020"));
  s = fixture(2);
  const discarded = make(s, "01020");
  s.hand = [discarded];
  s = message(s, 0, discarded.id, 1);
  selectSeat(s, 1);
  discardHandCard(s, discarded.id);
  assert.ok(seatView(s, 0).discard.includes("01020"));
  assert.equal(s.ringMaker!.returns.length, 0);
});
test("Message shuffles the played borrowed ally to its owner and triggers actual leaves-play responses", () => {
  let s = fixture(2);
  const a = make(s, "08026");
  s.hand = [a];
  s = message(s, 0, a.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = applyAction(s, { type: "PLAY", id: a.id });
  const deckSize = seatView(s, 0).deck.length;
  assert.equal(get(s, a.id)!.owner, 0);
  roundReturns(s);
  assert.ok(!get(s, a.id));
  assert.equal(seatView(s, 0).deck.length, deckSize + 1);
});
test("Message shuffles the exact borrowed attachment out of play without discarding it", () => {
  let s = fixture(2);
  const a = make(s, "08034");
  s.hand = [a];
  s = message(s, 0, a.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = applyAction(s, { type: "PLAY", id: a.id, target: s.heroes[0].id });
  const host = s.heroes[0].id;
  roundReturns(s);
  assert.equal(get(s, host)!.attachments.length, 0);
  assert.ok(seatView(s, 0).deck.includes("08034"));
  assert.ok(!seatView(s, 0).discard.includes("08034"));
});
test("Free to Choose responds only to its controller's encounter or quest-card threat and survives reload", () => {
  let s = fixture(2);
  s.hand = [make(s, "08062")];
  raiseThreat(s, 4, "encounter");
  flush(s);
  s = choose(reload(s), s.choice!.options[0].id);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 20);
  for (const reason of [
    "quest-failure",
    "framework",
    "player-card",
    "cost",
  ] as const) {
    const t = fixture();
    t.hand = [make(t, "08062")];
    raiseThreat(t, 2, reason);
    flush(t);
    assert.equal(t.choice, null);
  }
});
test("Free to Choose offers every eligible physical response copy without undoing Doomed costs", () => {
  let s = fixture();
  s.used.push("round:grima-next");
  s.hand = [make(s, "08062"), make(s, "08062")];
  raiseThreat(s, 3, "encounter");
  flush(s);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.threat, 21);
  assert.match(s.choice!.title, /Free to Choose/);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.threat, 18);
  assert.equal(s.hand.length, 0);
});
test("Free to Choose cannot rescue a player already eliminated by the triggering threat increase", () => {
  const s = fixture();
  s.threat = 49;
  s.hand = [make(s, "08062")];
  raiseThreat(s, 1, "encounter");
  flush(s);
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
});
test("delayed-return and lasting engagement state are validated in saved games", () => {
  const s = fixture();
  const enemy = make(s, "01096");
  s.staging = [enemy];
  enemy.noEngagementRound = s.round;
  assert.ok(validateSave(reload(s)));
  enemy.noEngagementRound = -1;
  assert.ok(!validateSave(s));
  delete enemy.noEngagementRound;
  s.ringMaker = {
    returns: [{ id: "a", code: "08034", owner: 8, player: 0, kind: "message" }],
  };
  assert.ok(!validateSave(s));
});

test("Warden explores a one-point Dreadful Gap before its When Revealed travel effect", () => {
  let s = fixture();
  s.heroes = s.heroes.slice(0, 1);
  s.startingHeroes = ["08025"];
  s.heroes[0].committed = s.heroes[0].exhausted = true;
  attach(s, s.heroes[0], "08031");
  const existing = make(s, "01099");
  s.activeLocation = existing;
  revealed(s, KHAZAD.gap);
  flush(s);
  assert.ok(s.victoryCards?.includes(KHAZAD.gap));
  assert.equal(s.activeLocation!.id, existing.id);
  s = choose(reload(s), "ready");
  assert.ok(!s.staging.some((u) => u.code === KHAZAD.gap));
});
test("The Seeing-stone excludes optional Doomed grants and still finds printed Doomed X", () => {
  let s = fixture();
  s.deck = ["08030", "08057", "08005"];
  s = play(s, "07015");
  assert.ok(s.choice!.options.some((o) => o.code === "08005"));
  assert.ok(
    !s.choice!.options.some((o) => ["08030", "08057"].includes(o.code ?? "")),
  );
});
test("optional Doomed 2 plus Gríma offers one Messenger response for the combined Doomed 3", () => {
  let s = fixture();
  s.allies = [make(s, "07005")];
  s.used.push("round:grima-next");
  const messenger = s.allies[0].id;
  s = play(s, "08057");
  s = choose(s, "doomed");
  assert.equal(s.threat, 23);
  assert.match(s.choice!.title, /Isengard Messenger/);
  s = choose(s, "use");
  assert.equal(stats(s, get(s, messenger)!).will, 2);
  assert.match(s.choice!.title, /Herald/);
});
test("Free to Choose is optional and a canceled copy leaves the encounter increase in place", () => {
  let s = fixture();
  s.hand = [make(s, "08062")];
  raiseThreat(s, 3, "encounter");
  flush(s);
  s = choose(reload(s), "skip");
  assert.equal(s.threat, 23);
  assert.equal(s.hand.length, 1);
  s = fixture();
  s.scenarioId = "shadow-and-flame";
  const bane = make(s, SHADOW_FLAME.bane);
  attach(s, bane, SHADOW_FLAME.counter);
  s.staging = [bane];
  s.hand = [make(s, "08062")];
  s.encounterDeck = ["01117"];
  raiseThreat(s, 3, "encounter");
  flush(s);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.threat, 23);
  assert.ok(s.discard.includes("08062"));
});
test("Message sends a borrowed card to its owner's discard when its recipient is eliminated", () => {
  let s = fixture(2);
  const u = make(s, "01020");
  s.hand = [u];
  s = message(s, 0, u.id, 1);
  selectSeat(s, 1);
  s.threat = 49;
  s.queue = [fx("threat", { value: 1, player: 1 })];
  flush(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.heroes.length, 3);
  assert.ok(seatView(s, 0).discard.includes("01020"));
  assert.equal(s.ringMaker!.returns.length, 0);
});
for (const code of ["05017", "06064", "06115"])
  test(`Message retains separate control and ownership for borrowed Trap ${code}, before and after attachment`, () => {
    for (const attached of [false, true]) {
      let s = fixture(2);
      const u = make(s, code);
      s.hand = [u];
      s = message(s, 0, u.id, 1);
      selectSeat(s, 1);
      s.table!.turn = 1;
      s = applyAction(s, { type: "PLAY", id: u.id });
      const trap = s.staging.find((u) => u.code === code)!;
      assert.equal(trap.owner, 0);
      assert.equal(trap.controller, 1);
      if (attached) {
        placeEncounter(s, "01096");
        flush(s);
        const enemy = s.staging.find((u) => u.code === "01096")!;
        assert.equal(attachmentController(s, enemy, enemy.attachments[0]), 1);
        assert.equal(enemy.attachments[0].owner, 0);
      }
      s = reload(s);
      const before = seatView(s, 0).deck.length;
      roundReturns(s);
      assert.equal(seatView(s, 0).deck.length, before + 1);
      assert.ok(
        !s.staging.some(
          (v) => v.id === u.id || v.attachments.some((a) => a.id === u.id),
        ),
      );
    }
  });
test("Message's attachment controller persists on a location and the printed owner gets the returning card", () => {
  let s = fixture(2);
  const u = make(s, "02056");
  s.hand = [u];
  s = message(s, 0, u.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.staging = [make(s, "01099")];
  s = applyAction(s, { type: "PLAY", id: u.id, target: s.staging[0].id });
  const host = s.staging[0];
  assert.equal(attachmentController(s, host, host.attachments[0]), 1);
  roundReturns(s);
  assert.ok(seatView(s, 0).deck.includes("02056"));
  assert.equal(host.attachments.length, 0);
});
test("a location discarded by Lampwright still consumes Warden's first reveal", () => {
  const s = fixture();
  s.heroes[0].committed = true;
  attach(s, s.heroes[0], "08031");
  s.used.push("game:lampwright-next:fixture:location");
  revealed(s, "01099");
  flush(s);
  revealed(s, "01099");
  flush(s);
  assert.deepEqual(s.encounterDiscard, ["01099"]);
  assert.equal(s.staging[0].progress, 0);
});
test("the normal refresh action resolves Gwaihir and Message returns before next-round drawing", () => {
  let s = fixture(2);
  const passed = make(s, "08034");
  s.hand = [passed];
  s = message(s, 0, passed.id, 1);
  selectSeat(s, 0);
  s.table!.turn = 0;
  s.discard = ["02075"];
  s = play(s, "08059");
  s = choose(s, "discard-0");
  const eagle = s.allies.find((u) => u.code === "02075")!;
  const before = s.round;
  const deckSize = s.deck.length;
  s.phase = "refresh";
  s.table!.passed = [1];
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.round, before + 1);
  assert.equal(s.deck.length, deckSize);
  assert.ok(s.deck.includes("08034") || s.hand.some((u) => u.code === "08034"));
  assert.ok(!seatView(s, 1).hand.some((u) => u.id === passed.id));
  assert.ok(!s.allies.some((u) => u.id === eagle.id));
  assert.ok(s.hand.some((u) => u.code === "02075"));
  assert.deepEqual(s.ringMaker!.returns, []);
});
test("a borrowed self-returning event stays in its printed player's hand until Message's round-end return", () => {
  let s = fixture(2);
  const u = make(s, "08061");
  s.hand = [u];
  s = message(s, 0, u.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = applyAction(s, { type: "PLAY", id: u.id, target: s.heroes[0].id });
  assert.equal(seatView(s, 1).hand[0].id, u.id);
  assert.equal(seatView(s, 1).hand[0].owner, 0);
  assert.ok(!seatView(s, 0).hand.some((h) => h.id === u.id));
  s = reload(s);
  roundReturns(s);
  assert.ok(seatView(s, 0).deck.includes("08061"));
  assert.ok(!seatView(s, 1).hand.some((h) => h.id === u.id));
});
test("Gildor can move a borrowed card into his controller's deck without changing its owner", () => {
  let s = fixture(2);
  const u = make(s, "08034");
  s.hand = [u];
  s = message(s, 0, u.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  const gildor = make(s, "02079");
  s.allies = [gildor];
  s.deck = ["01058", "01059", "01061", "01073"];
  s = applyAction(s, { type: "ABILITY", id: gildor.id });
  s = choose(s, "deck-1");
  s = choose(reload(s), u.id);
  s = choose(s, "order-2");
  s = choose(s, "order-1");
  s = choose(s, "order-0");
  assert.deepEqual(s.deck, ["01061", "08034", "01058", "01073"]);
  assert.deepEqual(s.ringMaker!.returns, []);
  shuffle(s, s.deck);
  nextRound(s);
  s = reload(s);
  selectSeat(s, 1);
  let drawn = s.hand.find((h) => h.code === "08034");
  if (!drawn) {
    drawn = takePlayerDeck(s, s.deck.indexOf("08034"));
    s.hand.push(drawn);
  }
  assert.equal(drawn.owner, 0);
  discardHandCard(s, drawn.id);
  assert.ok(seatView(s, 0).discard.includes("08034"));
  assert.ok(!seatView(s, 1).discard.includes("08034"));
});
test("milling and Well-Equipped retain original ownership of borrowed deck cards", () => {
  for (const equipped of [false, true]) {
    let s = fixture(2);
    const u = make(s, "08034");
    s.hand = [u];
    s = message(s, 0, u.id, 1);
    selectSeat(s, 1);
    s.table!.turn = 1;
    const physical = s.hand.pop()!;
    s.deck = ["01058"];
    putPlayerDeck(s, physical, 0);
    s = reload(s);
    if (!equipped) {
      discardPlayerDeck(s, 1);
      assert.ok(seatView(s, 0).discard.includes("08034"));
      assert.ok(!s.discard.includes("08034"));
    } else {
      s = play(s, "06116");
      s = choose(reload(s), "attachment-0-1");
      const target = s.heroes[0].id;
      s = choose(s, target);
      assert.equal(get(s, target)!.attachments[0].owner, 0);
      assert.ok(!seatView(s, 0).discard.includes("08034"));
    }
    assert.ok(validateSave(s));
  }
});
test("borrowed deck identity is validated and returns to its owner's discard on elimination", () => {
  let s = fixture(2);
  const u = make(s, "08034");
  s.hand = [u];
  s = message(s, 0, u.id, 1);
  selectSeat(s, 1);
  s.table!.turn = 1;
  putPlayerDeck(s, s.hand.pop()!, 0);
  s = reload(s);
  const corrupt = structuredClone(s);
  corrupt.used = corrupt.used.map((k) =>
    k.startsWith("game:borrowed-deck:")
      ? k.replace('"owner":0', '"owner":8')
      : k,
  );
  assert.ok(!validateSave(corrupt));
  s.threat = 49;
  s.queue = [fx("threat", { value: 1, player: 1 })];
  flush(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(seatView(s, 0).discard.includes("08034"));
  assert.equal(s.heroes.length, 3);
  assert.ok(validateSave(s));
});
