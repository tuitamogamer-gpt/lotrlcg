import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
} from "../src/game/engine";
import { fx, get, make, stats } from "../src/game/core";
import {
  damage,
  destroy,
  discardCharacter,
  enterAlly,
  phaseEnd,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { playerAttackKilled, resolvePlayerAttack } from "../src/game/combat";
import { forOwner, seatView, selectSeat, syncSeat } from "../src/game/table";
import { hasTrait } from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import * as Storm from "../src/game/stormcaller-player";
import {
  STORMCALLER_PLAYER as P,
  STORMCALLER_PLAYER_CARDS,
} from "../src/game/stormcaller-player-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import {
  stormcallerPlayerFixture as fixture,
  stormcallerPlayerHand as hand,
  stormcallerPlayerAlly as ally,
  stormcallerPlayerAttach as attach,
} from "./stormcaller-player-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";
import { FATE as F } from "../src/game/fate-numenor-support";
import { base as fateFixture } from "./fate-numenor-fixtures";
import { base as ninFixture } from "./nin-eilph-fixtures";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import { CHETWOOD as C } from "../src/game/chetwood-support";

const select = (s: GameState, id: string) => choose(reload(s), id);
function effect(s: GameState, e: Effect) {
  s.queue.push(e);
  flush(s);
  return s;
}
function play(s: GameState, code: string, target?: string) {
  const c = hand(s, code);
  return applyAction(s, { type: "PLAY", id: c.id, target });
}
function ability(s: GameState, u: Unit, attachmentId?: string) {
  return applyAction(s, { type: "ABILITY", id: u.id, attachmentId });
}
function attackFixture(players = 1) {
  const s = fixture(players),
    defender = ally(s, P.guardian),
    enemy = make(s, "01082");
  s.phase = "defense";
  defender.exhausted = true;
  s.engaged.push(enemy);
  s.combat = { enemyId: enemy.id, defenderId: defender.id, attackBonus: 0 };
  return { s, defender, enemy };
}

test("Flight of the Stormcaller registers all 11 unchanged original player designs and31 physical cards", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.equal(STORMCALLER_PLAYER_CARDS.length, 11);
  assert.equal(
    STORMCALLER_PLAYER_CARDS.reduce((n, c) => n + (c.quantity ?? 0), 0),
    31,
  );
  for (const c of STORMCALLER_PLAYER_CARDS) {
    const source = catalog.find((x: { code: string }) => x.code === c.code);
    assert.equal(c.text, source.text);
    assert.equal(c.octgnid, source.octgnid);
    assert.ok(SCRIPTED.has(c.code), c.code);
  }
});
test("Denethor's printed Setup adds two resources before initial hands are kept and cannot repeat after reload", () => {
  const deck = Object.fromEntries(
    STARTERS.flatMap((d) => Object.entries(d.cards))
      .slice(0, 18)
      .map(([code]) => [code, 3]),
  );
  let s = createGame(47, deck, [P.denethor, "08084", "01001"], "custom");
  const denethor = s.heroes.find((h) => h.code === P.denethor)!;
  assert.equal(denethor.resources, 2);
  s = reload(s);
  Storm.stormcallerSetup(s);
  assert.equal(get(s, denethor.id)!.resources, 2);
});
test("Denethor transfers to a remote Gondor hero without spending, exhaustion or resource-gain bonus", () => {
  let s = fixture(2);
  const denethor = s.heroes[0],
    remote = seatView(s, 1).heroes[0];
  attach(s, remote, P.service);
  const before = remote.resources;
  s = ability(s, denethor);
  assert.ok(s.choice!.options.some((o) => o.id === remote.id));
  assert.ok(!s.choice!.options.some((o) => o.id === denethor.id));
  s = select(s, remote.id);
  assert.equal(get(s, denethor.id)!.resources, 9);
  assert.equal(get(s, remote.id)!.resources, before + 1);
  assert.equal(get(s, denethor.id)!.resourcesSpentRound, undefined);
  assert.equal(get(s, denethor.id)!.exhausted, false);
  assert.match(
    Storm.stormcallerAbilityProblem(s, get(s, denethor.id)!)!,
    /already/,
  );
});
test("Denethor's round limit survives phase changes and requires an eligible distinct Gondor hero", () => {
  let s = fixture();
  const d = s.heroes[0],
    target = s.heroes[1];
  s = ability(s, d);
  s = select(s, target.id);
  phaseEnd(s);
  assert.match(Storm.stormcallerAbilityProblem(s, get(s, d.id)!)!, /already/);
  s.used = s.used.filter((k) => !k.startsWith("round:"));
  s.round++;
  assert.equal(Storm.stormcallerAbilityProblem(s, get(s, d.id)!), null);
  s.heroes = [get(s, d.id)!];
  s.startingHeroes = [P.denethor];
  assert.match(
    Storm.stormcallerAbilityProblem(s, s.heroes[0])!,
    /another Gondor/,
  );
});
test("In Service of the Steward grants Gondor continuously and enables Rod's actual attachment target", () => {
  let s = fixture();
  const aragorn = s.heroes[2];
  assert.equal(hasTrait(aragorn, "Gondor"), false);
  const rodCard = hand(s, P.rod);
  assert.ok(!playTargets(s, rodCard).some((u) => u.id === aragorn.id));
  s = play(s, P.service, aragorn.id);
  assert.equal(hasTrait(get(s, aragorn.id)!, "Gondor"), true);
  assert.ok(playTargets(s, rodCard).some((u) => u.id === aragorn.id));
  get(s, aragorn.id)!.attachments.find((a) => a.code === P.service)!.facedown =
    true;
  syncAttachmentText(s);
  assert.equal(hasTrait(get(s, aragorn.id)!, "Gondor"), false);
});
test("Rod repeatedly spends exactly its attached hero's two resources and draws to the attachment controller", () => {
  let s = fixture(2);
  const remote = seatView(s, 1).heroes[0];
  attach(s, remote, P.service);
  s = play(s, P.rod, remote.id);
  const rod = get(s, remote.id)!.attachments.find((a) => a.code === P.rod)!;
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.deck = ["01020", "01021", "01022"];
  const localBefore = seatView(s, 0).heroes.map((h) => h.resources),
    remoteBefore = get(s, remote.id)!.resources;
  s = ability(s, get(s, remote.id)!, rod.id);
  s = ability(reload(s), get(s, remote.id)!, rod.id);
  assert.deepEqual(
    s.hand.map((c) => c.code),
    ["01020", "01021"],
  );
  assert.equal(get(s, remote.id)!.resources, remoteBefore - 4);
  assert.deepEqual(
    seatView(s, 0).heroes.map((h) => h.resources),
    localBefore,
  );
  assert.equal(get(s, remote.id)!.exhausted, false);
  assert.equal(
    get(s, remote.id)!.attachments.find((a) => a.id === rod.id)!.exhausted,
    false,
  );
});
test("Rod rejects insufficient resources and static draw restrictions before payment", () => {
  for (const makeState of [fixture, fateFixture, ninFixture]) {
    const s = makeState();
    if (s.fateNumenor) s.activeLocation = make(s, F.shrine);
    const h = s.heroes[0],
      a = attach(s, h, P.rod);
    s.deck = ["01020"];
    if (!s.fateNumenor && !s.ninEilph) h.resources = 1;
    assert.ok(Storm.stormcallerAbilityProblem(s, h, a.id));
    const before = h.resources;
    assert.throws(() => ability(s, h, a.id));
    assert.equal(h.resources, before);
  }
});
test("Glorfindel plays the chosen physical discard copy with normal payment and uniqueness checks", () => {
  let s = fixture();
  s.discard = [P.glorfindel, "01020", P.glorfindel];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(reload(s), { type: "PLAY_DISCARD", index: 2 });
  assert.ok(s.allies.some((u) => u.code === P.glorfindel));
  assert.deepEqual(s.discard, [P.glorfindel, "01020"]);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 5,
  );
  assert.throws(
    () => applyAction(s, { type: "PLAY_DISCARD", index: 0 }),
    /unique|title/,
  );
});
test("Glorfindel cannot be played from another player's discard or outside planning", () => {
  const s = fixture(2);
  seatView(s, 1).discard.push(P.glorfindel);
  assert.throws(() => applyAction(s, { type: "PLAY_DISCARD", index: 0 }));
  s.discard = [P.glorfindel];
  s.phase = "attack";
  assert.throws(
    () => applyAction(s, { type: "PLAY_DISCARD", index: 0 }),
    /Planning|planning/,
  );
});
test("Glorfindel's hand-discard ready Action is physical, once per phase, and reload-safe", () => {
  let s = fixture();
  const g = ally(s, P.glorfindel),
    cost = hand(s, "01020");
  g.exhausted = true;
  s = ability(s, g);
  s = select(s, cost.id);
  assert.equal(get(s, g.id)!.exhausted, false);
  assert.deepEqual(s.discard, ["01020"]);
  get(s, g.id)!.exhausted = true;
  hand(s, "01021");
  assert.match(
    Storm.stormcallerAbilityProblem(reload(s), get(s, g.id)!)!,
    /already/,
  );
  phaseEnd(s);
  assert.equal(Storm.stormcallerAbilityProblem(s, get(s, g.id)!), null);
});
test("Glorfindel rejects an already ready character or a protected hand card", () => {
  const s = fixture(),
    g = ally(s, P.glorfindel);
  hand(s, "01020");
  assert.match(Storm.stormcallerAbilityProblem(s, g)!, /ready/);
  g.exhausted = true;
  s.hand = [];
  assert.ok(Storm.stormcallerAbilityProblem(s, g));
});
test("Imladris Caregiver heals a remote character twice per round without exhaustion", () => {
  let s = fixture(2);
  const healer = ally(s, P.caregiver),
    target = seatView(s, 1).heroes[0];
  target.damage = 2;
  for (const code of ["01020", "01021"]) {
    const c = hand(s, code);
    s = ability(s, get(s, healer.id)!);
    s = select(s, target.id);
    s = select(s, c.id);
  }
  assert.equal(get(s, target.id)!.damage, 0);
  assert.equal(get(s, healer.id)!.exhausted, false);
  get(s, target.id)!.damage = 1;
  hand(s, "01022");
  phaseEnd(s);
  assert.match(
    Storm.stormcallerAbilityProblem(s, get(s, healer.id)!)!,
    /twice/,
  );
});
test("Imladris Caregiver requires a real healing target and each physical healer has its own limit", () => {
  const s = fixture(),
    one = ally(s, P.caregiver),
    two = ally(s, P.caregiver);
  hand(s, "01020");
  assert.match(Storm.stormcallerAbilityProblem(s, one)!, /damaged/);
  s.heroes[0].damage = 1;
  s.used.push(
    `round:stormcaller:caregiver:${one.id}`,
    `round:stormcaller:caregiver:${one.id}`,
  );
  assert.match(Storm.stormcallerAbilityProblem(s, one)!, /twice/);
  assert.equal(Storm.stormcallerAbilityProblem(s, two), null);
});
test("Guardian simultaneously pays two distinct other physical hand cards and its chosen resource allocation", () => {
  let s = fixture();
  const g = hand(s, P.guardian),
    one = hand(s, "01020"),
    two = hand(s, "01020"),
    kept = hand(s, "01021"),
    payer = s.heroes[2];
  const before = payer.resources;
  s = applyAction(s, { type: "PLAY", id: g.id, payment: { [payer.id]: 3 } });
  assert.ok(!s.choice!.options.some((o) => o.id === g.id));
  assert.equal(get(s, payer.id)!.resources, before);
  s = select(s, one.id);
  assert.ok(!s.choice!.options.some((o) => o.id === one.id));
  assert.equal(s.hand.length, 4);
  s = select(s, two.id);
  assert.ok(s.allies.some((u) => u.id === g.id));
  assert.deepEqual(s.discard, ["01020", "01020"]);
  assert.deepEqual(
    s.hand.map((u) => u.id),
    [kept.id],
  );
  assert.equal(get(s, payer.id)!.resources, before - 3);
  reload(s);
});
test("Guardian preflight rejects missing other hand cards without resource loss", () => {
  const s = fixture(),
    g = hand(s, P.guardian);
  hand(s, "01020");
  assert.match(canPlay(s, g)!, /two other/);
  assert.throws(() => applyAction(s, { type: "PLAY", id: g.id }), /two other/);
  assert.equal(s.heroes[0].resources, 10);
  assert.equal(s.hand.length, 2);
});
test("Guardian put into play bypasses its printed PLAY-from-hand additional cost", () => {
  const s = fixture(),
    g = hand(s, P.guardian);
  s.hand = [];
  enterAlly(s, g, false, false, true);
  flush(s);
  assert.ok(s.allies.some((u) => u.id === g.id));
  assert.equal(s.choice, null);
  assert.deepEqual(s.discard, []);
});
test("Heed the Dream searches the chosen player's top five and group-pays a physical second search across reload", () => {
  let s = fixture(2);
  s.deck = ["01020"];
  forOwner(s, 1, () => {
    s.deck = ["01021", "01022", "01023", "01024", "01025", "01027"];
    for (const h of s.heroes) h.resources = 0;
  });
  const localPayer = s.heroes[0],
    remotePayer = seatView(s, 1).heroes[0];
  localPayer.resources = 3;
  remotePayer.resources = 1;
  s = play(s, P.heed);
  s = select(s, "player-1");
  assert.ok(!s.choice!.options.some((o) => o.code === "01027"));
  s = select(s, "deck-0");
  assert.deepEqual(
    seatView(s, 1).hand.map((c) => c.code),
    ["01021"],
  );
  const beforeLocal = get(s, localPayer.id)!.resources,
    beforeRemote = get(s, remotePayer.id)!.resources;
  s = select(s, "pay");
  s = select(s, localPayer.id);
  s = select(s, remotePayer.id);
  assert.equal(get(s, localPayer.id)!.resources, beforeLocal);
  assert.equal(get(s, remotePayer.id)!.resources, beforeRemote);
  s = select(s, localPayer.id);
  assert.equal(get(s, localPayer.id)!.resources, beforeLocal - 2);
  assert.equal(get(s, remotePayer.id)!.resources, beforeRemote - 1);
  const chosen = s.choice!.options.find((o) => o.code === "01027")!;
  s = select(s, chosen.id);
  assert.deepEqual(
    seatView(s, 1).hand.map((c) => c.code),
    ["01021", "01027"],
  );
  assert.ok(seatView(s, 0).discard.includes(P.heed));
  assert.equal(s.choice, null);
});
test("Heed search failure shuffles but does not offer its Then payment or spend group resources", () => {
  let s = fixture();
  const before = s.heroes.map((h) => h.resources);
  s.deck = ["01020", "01021", "01022"];
  s = play(s, P.heed);
  s = select(s, "player-0");
  s = select(s, "none");
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 0);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before.reduce((a, b) => a + b, 0) - 1,
  );
  assert.equal(s.deck.length, 3);
  assert.ok(s.discard.includes(P.heed));
});
test("Vanish checks actual controlled heroes only at initiation and preserves the physical threat counter", () => {
  let s = fixture();
  const event = hand(s, P.vanish);
  assert.match(canPlay(s, event)!, /2 or fewer/);
  s.heroes.pop();
  s.startingHeroes = s.heroes.map((u) => u.code);
  s.threat = 37;
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.equal(s.threat, 37);
  assert.equal(Storm.stormcallerEffectiveThreat(s), 20);
  s.heroes.push(make(s, "01004"));
  s.startingHeroes.push("01004");
  assert.equal(Storm.stormcallerEffectiveThreat(reload(s)), 20);
  phaseEnd(s);
  assert.equal(Storm.stormcallerEffectiveThreat(s), 37);
});
test("Vanish does not raise threat below20 and counts a Sword-thain as a controlled hero", () => {
  const s = fixture();
  s.heroes.pop();
  s.startingHeroes = s.heroes.map((u) => u.code);
  const converted = ally(s, P.azain);
  attach(s, converted, "10149");
  const event = hand(s, P.vanish);
  assert.match(canPlay(s, event)!, /2 or fewer/);
  s.allies = [];
  s.threat = 15;
  Storm.stormcallerEvent(s, P.vanish);
  assert.equal(Storm.stormcallerEffectiveThreat(s), 15);
});
test("Last Stand is offered after actual Warrior defender destruction and uses printed attack", () => {
  let { s, defender, enemy } = attackFixture();
  const event = hand(s, P.lastStand);
  defender.tempAttack = 9;
  damage(s, defender.id, 3, { combatDamage: true, enemyId: enemy.id });
  flush(s);
  assert.ok(!get(s, defender.id));
  assert.match(s.choice!.title, /Last Stand/);
  s = select(s, event.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.ok(s.discard.includes(P.lastStand));
});
test("Last Stand covers shadow/direct destruction but never simple discard or a non-Warrior defender", () => {
  let a = attackFixture();
  const event = hand(a.s, P.lastStand);
  destroy(a.s, a.defender);
  flush(a.s);
  assert.match(a.s.choice!.title, /Last Stand/);
  a.s = select(a.s, event.id);
  const b = attackFixture();
  hand(b.s, P.lastStand);
  discardCharacter(b.s, b.defender);
  flush(b.s);
  assert.equal(b.s.choice, null);
  const c = attackFixture();
  c.s.allies = [];
  const nonWarrior = ally(c.s, P.caregiver);
  c.s.combat!.defenderId = nonWarrior.id;
  hand(c.s, P.lastStand);
  destroy(c.s, nonWarrior);
  flush(c.s);
  assert.equal(c.s.choice, null);
});
test("Last Stand response windows use each player's actual physical event across save/reload", () => {
  let { s, defender, enemy } = attackFixture(2);
  const remote = hand(s, P.lastStand, 1);
  destroy(s, defender);
  flush(s);
  s = select(s, remote.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.ok(seatView(s, 1).discard.includes(P.lastStand));
});
test("Tides responds to an actual shadow attack increase, grants one-attack defense, and permits declined follow-up", () => {
  let { s, defender } = attackFixture();
  const event = hand(s, P.tides);
  s = effect(s, fx("shadowEffect", { code: "01085" }));
  assert.equal(s.combat!.attackBonus, 1);
  assert.match(s.choice!.title, /Tides of Fate/);
  s = select(s, event.id);
  s = select(s, defender.id);
  s = select(s, "skip");
  assert.equal(s.combat!.defenseBonuses![defender.id], 3);
  assert.equal(get(s, defender.id)!.tempDefense, undefined);
  assert.equal(get(s, defender.id)!.exhausted, true);
  assert.ok(s.discard.includes(P.tides));
  s.combat = null;
  assert.equal(stats(s, get(s, defender.id)!).defense, 3);
});
test("Tides collects split group payment before spending and gives only the next attack its bonus", () => {
  let { s, defender, enemy } = attackFixture(2);
  const event = hand(s, P.tides),
    local = s.heroes[0],
    remote = seatView(s, 1).heroes[0];
  s = effect(s, fx("shadowEffect", { code: "01085" }));
  s = select(s, event.id);
  s = select(s, defender.id);
  s = select(s, "pay");
  const a = get(s, local.id)!.resources,
    b = get(s, remote.id)!.resources;
  s = select(s, local.id);
  assert.equal(get(s, local.id)!.resources, a);
  s = select(s, remote.id);
  assert.equal(get(s, local.id)!.resources, a - 1);
  assert.equal(get(s, remote.id)!.resources, b - 1);
  assert.equal(get(s, defender.id)!.exhausted, false);
  assert.equal(Storm.stormcallerAttackBonus(s, get(s, defender.id)!), 3);
  assert.equal(
    stats(s, get(s, defender.id)!).attack,
    2,
    "bonus is not a global/Battle stat modifier",
  );
  s.combat = null;
  s.phase = "attack";
  resolvePlayerAttack(s, get(s, enemy.id)!, [defender.id], 0);
  flush(s);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(Storm.stormcallerAttackBonus(s, get(s, defender.id)!), 0);
});
test("Tides does not trigger for a canceled/zero boost, an undefended attack or a replaced attack context", () => {
  const a = attackFixture();
  hand(a.s, P.tides);
  Storm.stormcallerShadowAttackIncreased(a.s, a.s.combat, 0);
  flush(a.s);
  assert.equal(a.s.choice, null);
  a.s.combat!.defenderId = null;
  a.s.combat!.attackBonus++;
  Storm.stormcallerShadowAttackIncreased(a.s, a.s.combat, 0);
  flush(a.s);
  assert.equal(a.s.choice, null);
  const b = attackFixture();
  hand(b.s, P.tides);
  const previous = b.s.combat;
  b.s.combat = { ...previous!, attackBonus: 2 };
  Storm.stormcallerShadowAttackIncreased(b.s, previous, 0);
  flush(b.s);
  assert.equal(b.s.choice, null);
});
test("Response events cannot be manually played outside their printed window", () => {
  const s = fixture();
  for (const code of [P.lastStand, P.tides])
    assert.match(canPlay(s, hand(s, code))!, /Response window/);
});
test("Azain lets a remote player initiate and pay its response, with last-known traits and ability attribution", () => {
  let s = fixture(2);
  s.scenarioId = "deadmens-dike";
  s.deadmensDike = {
    initialized: true,
    setAside: [make(s, D.thaurdir)],
    undeadRevealRound: -1,
    terrorRound: -1,
    terrorThreat: 0,
  };
  s.allies.push(make(s, C.iarion));
  s.activeLocation = make(s, D.gate);
  const azain = ally(s, P.azain),
    victim = make(s, "01074"),
    target = make(s, "01089"),
    payer = seatView(s, 1).heroes[0];
  s.staging.push(target);
  s.deck = ["01020"];
  forOwner(s, 1, () => {
    s.deck = ["01021", "01022"];
  });
  playerAttackKilled(s, victim, [azain.id], undefined, ["Orc"]);
  flush(s);
  assert.equal(
    s.choice!.options.find((o) => o.id === "player-1")!.ability!.player,
    1,
  );
  s = select(s, "player-1");
  s = select(s, payer.id);
  s = select(s, target.id);
  assert.equal(get(s, target.id)!.damage, 2);
  assert.deepEqual(seatView(s, 0).deck, ["01020"]);
  assert.deepEqual(seatView(s, 1).deck, ["01022"]);
});
test("New active abilities are exposed with their exact printed costs", () => {
  const s = fixture(),
    denethor = s.heroes[0],
    g = ally(s, P.glorfindel),
    c = ally(s, P.caregiver),
    a = attach(s, denethor, P.rod);
  hand(s, "01020");
  g.exhausted = true;
  denethor.damage = 1;
  for (const u of [denethor, g, c])
    assert.ok(
      availableAbilities(s, u).some((x) =>
        /Move 1|Discard a card/.test(x.label),
      ),
    );
  assert.ok(
    availableAbilities(s, denethor).some(
      (x) => x.id === a.id && /Spend 2/.test(x.label),
    ),
  );
  syncSeat(s);
  reload(s);
});

test("Guardian pays all costs before Silver Harp's save-resumable Response and reserves its original physical card", () => {
  let s = fixture();
  const g = hand(s, P.guardian),
    one = hand(s, "01020"),
    two = hand(s, "01021"),
    payer = s.heroes[0];
  const harp = attach(s, payer, "10090");
  s = applyAction(s, { type: "PLAY", id: g.id, payment: { [payer.id]: 3 } });
  s = select(s, one.id);
  s = select(s, two.id);
  assert.match(s.choice!.title, /Silver Harp/);
  assert.equal(get(s, payer.id)!.resources, 7);
  assert.ok(!s.hand.some((c) => c.id === g.id));
  assert.equal(s.pendingPlayerPlays![0].unit.id, g.id);
  assert.ok(!s.allies.some((c) => c.id === g.id));
  s = select(s, "use");
  assert.ok(s.hand.some((c) => c.id === two.id || c.id === one.id));
  assert.ok(
    get(s, payer.id)!.attachments.find((a) => a.id === harp.id)!.exhausted,
  );
  assert.ok(s.allies.some((c) => c.id === g.id));
  assert.equal(s.pendingPlayerPlays, undefined);
});

test("Heed rejects Shrine's search prohibition before spending the printed resource cost", () => {
  const s = fateFixture();
  s.activeLocation = make(s, F.shrine);
  const c = hand(s, P.heed),
    before = s.heroes.map((h) => h.resources);
  assert.match(canPlay(s, c)!, /deck can be searched/);
  assert.throws(
    () => applyAction(s, { type: "PLAY", id: c.id }),
    /deck can be searched/,
  );
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    before,
  );
});
test("Heed excludes the remote Cadaver controller and a stale saved search cannot bypass Shrine", () => {
  let s = fateFixture(2);
  s.heroes[0].phaseResourceIcons = ["lore"];
  forOwner(s, 1, () => {
    s.engaged.push(make(s, F.cadaver));
    s.deck = ["01020"];
  });
  s = play(s, P.heed);
  assert.ok(s.choice!.options.some((o) => o.id === "player-0"));
  assert.ok(!s.choice!.options.some((o) => o.id === "player-1"));
  s = select(s, "player-0");
  const choice = s.choice!.options.find((o) => o.id === "deck-0")!,
    before = [...s.deck];
  s.activeLocation = make(s, F.shrine);
  s = select(s, choice.id);
  assert.deepEqual(s.deck, before);
  assert.equal(s.hand.length, 0);
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(P.heed));
});

test("Denethor funds a remote Sword-thain Gondor hero that can then pay its Tides share", () => {
  let { s, defender } = attackFixture(2);
  const converted = ally(s, P.azain, 1),
    denethor = s.heroes[0],
    event = hand(s, P.tides);
  attach(s, converted, "10149", 1);
  attach(s, converted, P.service, 1);
  s = ability(s, denethor);
  s = select(s, converted.id);
  assert.equal(get(s, converted.id)!.resources, 1);
  s = effect(s, fx("shadowEffect", { code: "01085" }));
  s = select(s, event.id);
  s = select(s, defender.id);
  s = select(s, "pay");
  assert.ok(s.choice!.options.some((o) => o.id === converted.id));
  s = select(s, converted.id);
  s = select(s, denethor.id);
  assert.equal(get(s, converted.id)!.resources, 0);
  assert.equal(get(s, denethor.id)!.resources, 8);
  assert.equal(Storm.stormcallerAttackBonus(s, get(s, defender.id)!), 3);
});
test("Caregiver's two round uses follow its physical identity across controllers", () => {
  const s = fixture(2),
    healer = ally(s, P.caregiver),
    key = `round:stormcaller:caregiver:${healer.id}`;
  s.used.push(key, key);
  s.allies = s.allies.filter((u) => u.id !== healer.id);
  forOwner(s, 1, () => {
    s.allies.push(healer);
    s.heroes[0].damage = 1;
    hand(s, "01020");
  });
  selectSeat(s, 1);
  s.table!.turn = 1;
  assert.match(
    Storm.stormcallerAbilityProblem(reload(s), get(s, healer.id)!)!,
    /twice/,
  );
  assert.throws(() => ability(s, healer), /twice/);
});

test("Sword-thain Azain can spend its own Tactics resource for its printed killing Response", () => {
  let s = fixture();
  const azain = ally(s, P.azain),
    target = make(s, "01089"),
    victim = make(s, "01074");
  attach(s, azain, "10149");
  azain.resources = 1;
  for (const h of s.heroes) h.resources = 0;
  s.staging.push(target);
  playerAttackKilled(s, victim, [azain.id], undefined, ["Orc"]);
  flush(s);
  s = select(s, "use");
  assert.ok(s.choice!.options.some((o) => o.id === azain.id));
  s = select(s, azain.id);
  s = select(s, target.id);
  assert.equal(get(s, azain.id)!.resources, 0);
  assert.equal(get(s, target.id)!.damage, 2);
});
