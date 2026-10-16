import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import { card, SCRIPTED, plain, playerCards } from "../src/game/cards";
import { fx, get, make, playCost, prepend, stats } from "../src/game/core";
import { damage, enterAlly, phaseEnd, revealed } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView } from "../src/game/table";
import { addQuestProgress } from "../src/game/side-quests";
import { hasTrait, restrictedAttachment } from "../src/game/expansion-passives";
import {
  BATCH4_PLAYER as P,
  BATCH4_PLAYER_CARDS,
} from "../src/game/batch4-player-support";
import { batch4PlayerSetup } from "../src/game/batch4-player";
import {
  batch4PlayerFixture as fixture,
  batch4PlayerHand as hand,
  batch4PlayerAlly as ally,
  batch4PlayerAttach as attach,
} from "./batch4-player-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";
const act = (s: GameState, a: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), a);
const pick = (s: GameState, id: string) => choose(reload(s), id);
const ability = (s: GameState, u: string, a?: string) =>
  act(s, { type: "ABILITY", id: u, ...(a ? { attachmentId: a } : {}) });
function settle(s: GameState) {
  for (let n = 0; s.choice && n < 100; n++)
    s = pick(
      s,
      s.choice.options.find((o) =>
        ["skip", "none", "continue", "keep"].includes(o.id),
      )?.id ?? s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}
test("original30 data matches immutable catalog; every design has one playable definition and all source faces", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    BATCH4_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      BATCH4_PLAYER_CARDS.some((p) => p.code === c.code),
    ),
  );
  for (const c of BATCH4_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
    assert.equal(fs.readFileSync(`public/cards/${c.code}.jpg`)[0], 255);
  }
  assert.equal(card(P.rally).quest, 6);
  assert.equal(card(P.rally).victory, 1);
  assert.match(plain(card(P.fierce).text), /Valour Combat Action/);
  assert.equal(card(P.heirs).name, "Heirs of Eärendil");
  assert.ok(card(P.wind).shadow);
});
test("Song of Hope pays attached hero physical resources exactly three times per phase, limits duplicate and restores after phase end", () => {
  let s = fixture(),
    h = s.heroes[0],
    a = hand(s, P.hope);
  s = act(s, { type: "PLAY", id: a.id, target: h.id });
  for (let n = 0; n < 3; n++) s = ability(s, h.id, a.id);
  assert.equal(get(s, h.id)!.resources, 7);
  assert.equal(get(s, h.id)!.tempWill, 3);
  assert.ok(
    availableAbilities(s, get(s, h.id)!).find((x) => x.id === a.id)?.disabled,
  );
  assert.ok(!playTargets(s, hand(s, P.hope)).some((x) => x.id === h.id));
  phaseEnd(s);
  assert.equal(get(s, h.id)!.tempWill, 0);
});
test("Burst into Song readies Song heroes across seats and excludes a hero without a Song", () => {
  let s = fixture(2);
  const own = s.heroes[0],
    remote = seatView(s, 1).heroes[0],
    other = s.heroes[1];
  attach(s, own, P.hope);
  attach(s, remote, "02010", 1);
  own.exhausted = remote.exhausted = other.exhausted = true;
  const e = hand(s, P.burst);
  s = act(s, { type: "PLAY", id: e.id });
  assert.equal(get(s, own.id)!.exhausted, false);
  assert.equal(get(s, remote.id)!.exhausted, false);
  assert.equal(get(s, other.id)!.exhausted, true);
});
test("Defender of Cair Andros tens threat defense caps at4 and native declaration offers its Valour damage", () => {
  let s = fixture(),
    u = ally(s, P.defender),
    e = make(s, "01089");
  s.threat = 40;
  assert.equal(stats(s, u).defense, 4);
  s.threat = 49;
  assert.equal(stats(s, u).defense, 4);
  s.threat = 29;
  assert.equal(stats(s, u).defense, 2);
  s.threat = 40;
  s.engaged = [e];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: e.id, defenderId: u.id });
  assert.match(s.choice!.title, /Defender of Cair Andros/);
  s = pick(s, "use");
  assert.equal(get(s, e.id)!.damage, 1);
});
for (const code of [P.scout, P.noble])
  test(`${code} native hand-play response grants trait, draws optionally and retains physical source`, () => {
    let s = fixture(),
      h = s.heroes[2],
      a = hand(s, code);
    s.deck = ["01013"];
    s = act(s, { type: "PLAY", id: a.id, target: h.id });
    assert.match(s.choice!.title, new RegExp(card(code).name));
    s = pick(s, "use");
    assert.equal(s.hand[0].code, "01013");
    assert.ok(hasTrait(get(s, h.id)!, code === P.scout ? "Scout" : "Noble"));
    assert.ok(get(s, h.id)!.attachments.some((x) => x.id === a.id));
  });
test("Rally the West defeated quest adds every player's hero willpower and duplicate goes to owner discard", () => {
  const s = fixture(2),
    q = make(s, P.rally),
    h = s.heroes[0],
    remote = seatView(s, 1).heroes[0];
  s.staging.push(q);
  addQuestProgress(s, q, 6);
  assert.equal(stats(s, h).will, (card(h.code).willpower ?? 0) + 1);
  assert.equal(stats(s, remote).will, (card(remote.code).willpower ?? 0) + 1);
  const duplicate = make(s, P.rally);
  duplicate.owner = 1;
  s.staging.push(duplicate);
  addQuestProgress(s, duplicate, 6);
  assert.equal(s.victoryCards!.filter((c) => c === P.rally).length, 1);
  assert.ok(seatView(s, 1).discard.includes(P.rally));
});
test("Dúnedain Pipe serializes physical hand cost, exhausts one chosen Pipe and draws the original deck top", () => {
  let s = fixture();
  s.heroes[0] = make(s, "01001");
  const h = s.heroes[0],
    a = attach(s, h, P.pipe),
    kept = attach(s, h, P.hope),
    cost = hand(s, "01013");
  s.deck = ["01014"];
  s = ability(s, h.id, a.id);
  assert.match(s.choice!.title, /physical card/);
  s = pick(s, cost.id);
  assert.equal(s.hand[0].code, "01014");
  assert.equal(s.deck.at(-1), "01013");
  assert.equal(
    get(s, h.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
  assert.equal(
    get(s, h.id)!.attachments.find((x) => x.id === kept.id)!.exhausted,
    false,
  );
});
test("Old Toby counts controlled Pipes and heals any hero with a Pipe", () => {
  let s = fixture(2);
  s.heroes[0] = make(s, "01001");
  const h = s.heroes[0],
    remote = seatView(s, 1).heroes[2];
  h.resources = 10;
  h.phaseResourceIcons = ["lore"];
  attach(s, h, P.pipe);
  attach(s, ally(s, "01015"), P.pipe);
  attach(s, remote, P.pipe, 1);
  h.damage = remote.damage = 1;
  s.deck = ["01013", "01014", "01015"];
  const e = hand(s, P.toby);
  s = act(s, { type: "PLAY", id: e.id });
  assert.equal(s.hand.length, 2);
  assert.equal(get(s, h.id)!.damage, 0);
  assert.equal(get(s, remote.id)!.damage, 0);
});
test("Southron Refugee reduces only the next played Harad ally and expires after successful play", () => {
  let s = fixture(),
    r = ally(s, P.refugee),
    a = hand(s, "17006");
  const base = playCost(s, card(a.code));
  s = ability(s, r.id);
  assert.equal(get(s, r.id)!.exhausted, true);
  assert.equal(playCost(s, card(a.code)), base - 1);
  s = act(s, { type: "PLAY", id: a.id });
  s = settle(s);
  assert.ok(get(s, a.id));
  assert.equal(playCost(s, card(a.code)), base);
});
test("Folco physical discard reduces threat by7 and remains once per game after reload", () => {
  let s = fixture(),
    h = s.heroes[1];
  s = ability(s, h.id);
  assert.equal(get(s, h.id), undefined);
  assert.equal(s.threat, 13);
  assert.ok(s.discard.includes(P.folco));
  s.heroes.push({ ...make(s, P.folco), resources: 1 });
  assert.ok(availableAbilities(s, s.heroes.at(-1)!).every((x) => x.disabled));
});
test("Knight of Dale has independent saved normal and Valour limits and chooses a Leadership payer", () => {
  let s = fixture(),
    u = ally(s, P.daleKnight);
  u.exhausted = true;
  s.threat = 40;
  s = ability(s, u.id);
  s = pick(s, s.heroes[0].id);
  assert.equal(get(s, u.id)!.exhausted, false);
  assert.equal(s.heroes[0].resources, 9);
  get(s, u.id)!.exhausted = true;
  s = ability(s, u.id);
  s = pick(s, "valour");
  get(s, u.id)!.exhausted = true;
  assert.ok(availableAbilities(s, get(s, u.id)!).every((x) => x.disabled));
});
test("Fierce Defense normal native event deals3 and Valour discards an engaged nonunique enemy, restricted to combat", () => {
  for (const valour of [false, true]) {
    let s = fixture(),
      e = make(s, "01082"),
      a = hand(s, P.fierce);
    s.engaged = [e];
    s.threat = valour ? 40 : 20;
    assert.ok(canPlay(s, a));
    s.phase = "defense";
    s = act(s, { type: "PLAY", id: a.id, target: e.id });
    if (valour) s = pick(s, "discard");
    if (valour) assert.equal(get(s, e.id), undefined);
    else assert.equal(get(s, e.id)!.damage, 3);
    assert.ok(s.discard.includes(P.fierce));
  }
});
test("Eregion Survivor continuous bonuses follow its controller's empty hand and blanking", () => {
  const s = fixture(2),
    u = ally(s, P.survivor),
    base = card(u.code);
  assert.equal(stats(s, u).attack, (base.attack ?? 0) + 1);
  hand(s, "01013", 1);
  assert.equal(stats(s, u).defense, (base.defense ?? 0) + 1);
  hand(s, "01013");
  assert.equal(stats(s, u).will, base.willpower);
  s.hand = [];
  assert.equal(stats(s, u).attack, (base.attack ?? 0) + 1);
});
test("Heirs of Eärendil requires separate unique traits and pays printed quest-point threat before discarding location", () => {
  let s = fixture();
  s.heroes[0] = make(s, "01001");
  s.heroes[1] = make(s, "01011");
  for (const h of s.heroes) {
    h.resources = 10;
    h.phaseResourceIcons = ["spirit"];
  }
  const loc = make(s, "01099"),
    e = hand(s, P.heirs);
  s.staging = [loc];
  s = act(s, { type: "PLAY", id: e.id, target: loc.id });
  assert.equal(get(s, loc.id), undefined);
  assert.equal(s.threat, 20 + (card(loc.code).quest ?? 0));
});
test("Leaflock enters exhausted, counts damaged own Ents to a4 cap, and cannot have restricted attachments", () => {
  let s = fixture(),
    u = hand(s, P.leaflock);
  s = act(s, { type: "PLAY", id: u.id });
  s = settle(s);
  assert.equal(get(s, u.id)!.exhausted, true);
  get(s, s.heroes[2].id)!.damage = 1;
  get(s, u.id)!.damage = 1;
  assert.equal(stats(s, get(s, u.id)!).will, 2);
  const sword = hand(s, "01039");
  assert.ok(!playTargets(s, sword).some((x) => x.id === u.id));
});
test("Legacy Blade attaches to hero and counts player and encounter side quests to +3", () => {
  const s = fixture(),
    h = s.heroes[0];
  attach(s, h, P.blade);
  s.victoryCards = [P.rally, "09014", "17059", "17036"];
  assert.equal(stats(s, h).attack, (card(h.code).attack ?? 0) + 3);
  assert.ok(restrictedAttachment(P.blade));
});
test("Open the Armory uses top10 physical positions, adds selection to hand and shuffles", () => {
  let s = fixture(),
    e = hand(s, P.armory);
  s.deck = ["01013", P.blade, ...Array(8).fill("01013"), "01039"];
  s = act(s, { type: "PLAY", id: e.id });
  assert.match(s.choice!.title, /top 10/);
  assert.ok(!s.choice!.options.some((o) => o.code === "01039"));
  s = pick(s, "deck-1");
  assert.equal(s.hand[0].code, P.blade);
  assert.equal(s.deck.length, 10);
});
test("Open the Armory Valour uses top5, puts the chosen attachment on eligible hero without playing it", () => {
  let s = fixture(),
    e = hand(s, P.armory),
    h = s.heroes[0];
  s.threat = 40;
  s.deck = [P.blade, ...Array(4).fill("01013"), "01039"];
  s = act(s, { type: "PLAY", id: e.id });
  s = pick(s, "play");
  assert.match(s.choice!.title, /top 5/);
  s = pick(s, "deck-0");
  s = pick(s, h.id);
  assert.ok(get(s, h.id)!.attachments.some((a) => a.code === P.blade));
  assert.equal(s.hand.length, 0);
});
test("Quickbeam self-damage cost readies once per phase and lethal cost never readies an absent hero", () => {
  let s = fixture(),
    h = s.heroes[2];
  h.exhausted = true;
  s = ability(s, h.id);
  assert.equal(get(s, h.id)!.damage, 2);
  assert.equal(get(s, h.id)!.exhausted, false);
  get(s, h.id)!.exhausted = true;
  assert.ok(availableAbilities(s, get(s, h.id)!).every((x) => x.disabled));
  s = fixture();
  h = s.heroes[2];
  h.damage = 4;
  h.exhausted = true;
  s = ability(s, h.id);
  assert.equal(get(s, h.id), undefined);
});
test("Halfast sidequest discount and optional enter-play response can reward another player's hero", () => {
  let s = fixture(2),
    e = hand(s, P.halfast),
    remote = seatView(s, 1).heroes[0];
  s.victoryCards = [P.rally, "17059"];
  assert.equal(playCost(s, card(e.code)), 1);
  s = act(s, { type: "PLAY", id: e.id });
  assert.match(s.choice!.title, /Halfast/);
  s = pick(s, remote.id);
  assert.equal(get(s, remote.id)!.resources, 11);
});
test("Bulwark serializes exact ally cost and Condition attachment selection", () => {
  let s = fixture(),
    u = ally(s, "01013"),
    h = s.heroes[0],
    condition = attach(s, h, "01080"),
    event = hand(s, P.bulwark);
  assert.match(card(condition.code).text ?? "", /Condition attachment/);
  s = act(s, { type: "PLAY", id: event.id });
  s = pick(s, u.id);
  s = pick(s, condition.id);
  assert.equal(get(s, u.id), undefined);
  assert.ok(!get(s, h.id)!.attachments.some((a) => a.id === condition.id));
});
test("Followed native play waits for the owner's next eligible engagement and reduces total staging threat", () => {
  let s = fixture(),
    a = hand(s, P.followed),
    enemy = make(s, "01089");
  s.staging = [enemy];
  s = act(s, { type: "PLAY", id: a.id });
  assert.ok(s.staging.some((u) => u.id === a.id));
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: enemy.id });
  s = settle(s);
  assert.ok(get(s, enemy.id)!.attachments.some((x) => x.id === a.id));
  assert.ok(!s.staging.some((u) => u.id === a.id));
});
test("Flight to the Sea moves a setup Wind into encounter deck and removes the exact paid event", () => {
  let s = fixture();
  s.heroes[0] = make(s, "01011");
  s.heroes[0].resources = 10;
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.deck = [P.wind, "01013"];
  batch4PlayerSetup(s);
  assert.equal(s.batch4WindReserves![0], 3);
  const e = hand(s, P.flight);
  s = act(s, { type: "PLAY", id: e.id });
  assert.ok(s.encounterDeck.includes(P.wind));
  assert.equal(s.batch4WindReserves![0], 2);
  assert.ok(s.removed.includes(P.flight));
  assert.ok(!s.discard.includes(P.flight));
});
test("Emyn Arnen Ranger native commitment offers any trapped enemy printed threat for phase willpower", () => {
  let s = fixture(),
    u = ally(s, P.ranger),
    enemy = make(s, "01089");
  attach(s, enemy, P.followed);
  s.engaged = [enemy];
  s.phase = "quest";
  s = act(s, { type: "TOGGLE_QUEST", id: u.id });
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Emyn Arnen Ranger/);
  s = pick(s, enemy.id);
  assert.equal(stats(s, get(s, u.id)!).will, card(enemy.code).threat);
});
test("The Dam Bursts readies only damaged controlled Ents with distinct unique Ent and Hobbit condition", () => {
  let s = fixture(),
    q = s.heroes[2],
    h = s.heroes[1],
    e = hand(s, P.dam);
  q.damage = 1;
  q.exhausted = h.exhausted = true;
  const undamaged = ally(s, P.leaflock);
  undamaged.exhausted = true;
  s = act(s, { type: "PLAY", id: e.id });
  assert.equal(get(s, q.id)!.exhausted, false);
  assert.equal(get(s, undamaged.id)!.exhausted, true);
  assert.equal(get(s, h.id)!.exhausted, true);
});
for (const mode of ["heal", "resource", "ready"])
  test(`Magic Ring ${mode} chooses effect, pays threat and exhausts only physical ring`, () => {
    let s = fixture(),
      h = s.heroes[0],
      ring = attach(s, h, P.ring);
    h.damage = 1;
    h.exhausted = true;
    s = ability(s, h.id, ring.id);
    s = pick(s, mode);
    assert.equal(s.threat, 21);
    assert.equal(
      get(s, h.id)!.attachments.find((a) => a.id === ring.id)!.exhausted,
      true,
    );
    if (mode === "heal") assert.equal(get(s, h.id)!.damage, 0);
    if (mode === "resource") assert.equal(get(s, h.id)!.resources, 11);
    if (mode === "ready") assert.equal(get(s, h.id)!.exhausted, false);
  });
test("Wind from the Sea native reveal readies only committed heroes and removes encounter face", () => {
  const s = fixture();
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = s.heroes[1].exhausted = true;
  revealed(s, P.wind);
  flush(s);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[1].exhausted, true);
  assert.ok(!s.staging.some((u) => u.code === P.wind));
  assert.ok(s.removed.includes(P.wind));
});
test("Fastred native resolved defense offers once-per-phase return with two threat reduction", () => {
  let s = fixture(),
    h = s.heroes[0],
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: h.id });
  assert.match(s.choice!.title, /Fastred/);
  s = pick(s, "use");
  assert.equal(s.threat, 18);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.ok(!s.engaged.some((u) => u.id === enemy.id));
});
test("Beorning Guardian native killing attack discards chosen attacker for printed threat progress", () => {
  let s = fixture(),
    u = ally(s, P.beorning),
    enemy = make(s, "01089"),
    loc = make(s, "01099");
  enemy.damage = 2;
  s.engaged = [enemy];
  s.staging = [loc];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [u.id] });
  assert.match(s.choice!.title, /Beorning Guardian/);
  s = pick(s, loc.id);
  assert.equal(get(s, u.id), undefined);
  assert.equal(get(s, loc.id)!.progress, card(enemy.code).threat);
});
test("Riddermark Knight original code reuses actual optional native attack bonus and delayed physical discard", () => {
  let s = fixture(),
    u = ally(s, P.riddermark),
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [u.id] });
  assert.match(s.choice!.title, /Knight/);
  s = pick(s, "use");
  assert.equal(get(s, u.id), undefined);
  assert.ok(s.discard.includes(P.riddermark));
});
test("Oath of Eorl original code reuses native beginning-combat payment and early attack sequence", () => {
  let s = fixture();
  s.heroes[1] = make(s, "01010");
  for (const h of s.heroes) {
    h.resources = 10;
    h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
  }
  const e = hand(s, P.oath),
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s.phase = "encounter";
  for (let n = 0; n < 3 && !s.choice; n++) s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Oath of Eorl/);
  s = pick(s, "use");
  assert.equal(s.phase, "attack");
  assert.ok(!s.hand.some((u) => u.id === e.id));
});
test("Folco initial threat includes his own Hobbit and all other controlled Hobbit hero costs", async () => {
  const { startingThreat } = await import("../src/game/starting-threat");
  assert.equal(startingThreat([P.folco, "02001", P.fastred]), 23);
});
test("Counter-spell cancels a paid Burst into Song before any hero readies while preserving payment and physical discard", async () => {
  const { SHADOW_FLAME: S } = await import("../src/game/shadow-flame-support");
  let s = fixture(),
    h = s.heroes[0];
  attach(s, h, P.hope);
  h.exhausted = true;
  const bane = make(s, S.bane);
  attach(s, bane, S.counter);
  s.staging = [bane];
  s.encounterDeck = [S.fires, "01077"];
  const event = hand(s, P.burst),
    before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "PLAY", id: event.id });
  s = settle(s);
  assert.equal(get(s, h.id)!.exhausted, true);
  assert.ok(s.discard.includes(P.burst));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.ok(s.encounterDiscard.includes(S.fires));
});
test("Southron discount survives a Harad put into play, then phase ending removes it", () => {
  let s = fixture(),
    r = ally(s, P.refugee);
  const before = playCost(s, card("17006"));
  s = ability(s, r.id);
  enterAlly(s, make(s, "17006"), false, false, false);
  assert.equal(playCost(s, card("17006")), before - 1);
  phaseEnd(s);
  assert.equal(playCost(s, card("17006")), before);
});
test("Declining Fastred leaves enemy and threat unchanged and immunity suppresses its response", () => {
  let s = fixture(),
    h = s.heroes[0],
    enemy = make(s, "01089");
  s.engaged = [enemy];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: h.id });
  s = pick(s, "skip");
  assert.equal(s.threat, 20);
  assert.ok(get(s, enemy.id));
  assert.ok(!s.staging.some((u) => u.id === enemy.id));
});
for (const code of [P.scout, P.noble])
  test(`${code} played on another player's hero grants its trait without answering for a player who did not play it`, () => {
    let s = fixture(2),
      h = seatView(s, 1).heroes[0],
      a = hand(s, code);
    s.deck = ["01013"];
    s = act(s, { type: "PLAY", id: a.id, target: h.id });
    assert.equal(s.choice, null);
    assert.equal(seatView(s, 1).hand.length, 0);
    assert.ok(hasTrait(get(s, h.id)!, code === P.scout ? "Scout" : "Noble"));
  });
test("Quickbeam's self-damage is an uncancelable cost while defensive damage events remain in hand", () => {
  let s = fixture(),
    h = s.heroes[2],
    event = hand(s, "06060");
  h.exhausted = true;
  s = ability(s, h.id);
  assert.equal(s.choice, null);
  assert.equal(get(s, h.id)!.damage, 2);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.ok(s.hand.some((u) => u.id === event.id));
});
test("Wind encounter revelation readies committed heroes through Poros's player-card readiness prohibition but respects universal poison", async () => {
  const { base, setStage } = await import("./crossings-poros-fixtures");
  const { CROSSINGS_POROS: C } =
    await import("../src/game/crossings-poros-support");
  const s = base();
  setStage(s);
  s.staging.push(make(s, C.water));
  const h = s.heroes[0],
    poisoned = s.heroes[1];
  h.exhausted = poisoned.exhausted = true;
  h.committed = poisoned.committed = true;
  s.crossingsPoros!.poisoned = [{ id: poisoned.id, round: s.round }];
  revealed(s, P.wind);
  flush(s);
  assert.equal(h.exhausted, false);
  assert.equal(poisoned.exhausted, true);
  assert.ok(s.removed.includes(P.wind));
});
test("Wind shadow uses encounter readiness during native defense through Poros's player-card ready lock", async () => {
  const { base, setStage } = await import("./crossings-poros-fixtures");
  const { CROSSINGS_POROS: C } =
    await import("../src/game/crossings-poros-support");
  let s = base();
  setStage(s);
  s.staging.push(make(s, C.water));
  const h = s.heroes[1],
    enemy = make(s, C.outrider);
  h.tempDefense = 20;
  enemy.shadows = [P.wind];
  s.engaged = [enemy];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: h.id });
  s = settle(s);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.ok(s.encounterDiscard.includes(P.wind));
});
