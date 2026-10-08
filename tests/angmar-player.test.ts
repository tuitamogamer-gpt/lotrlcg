import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import {
  fx,
  get,
  make,
  stats,
  canPay,
  playCost,
  questStat,
  questWill,
} from "../src/game/core";
import {
  damage,
  check,
  collectResources,
  discardHandCard,
  enterAlly,
  phaseEnd,
  readyCharacter,
  revealed,
  takePlayerDiscard,
  returnAlly,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  activeSeat,
  allHeroes,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  effectiveKeyword,
  hasResourceIcon,
  hasTrait,
} from "../src/game/expansion-passives";
import { isHero, isAlly } from "../src/game/card-types";
import {
  playEventFromDiscardEffect,
  replayEventProblem,
} from "../src/game/actions";
import { syncAttachmentText } from "../src/game/attachment-text";
import {
  ANGMAR as A,
  ANGMAR_PLAYER_CARDS,
  ANGMAR_PLAYER_CODES,
} from "../src/game/angmar-player-support";
import * as Angmar from "../src/game/angmar-player";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { base as dikeFixture } from "./deadmens-dike-fixtures";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import { mainQuestUnit, attachToQuest } from "../src/game/quest-state";
import { addQuestProgress } from "../src/game/side-quests";
import {
  base as carnFixture,
  enemy as carnEnemy,
  defend as carnDefend,
} from "./carn-dum-fixtures";
import { CARN as C } from "../src/game/carn-dum-support";
import type { Attachment, Effect, GameState, Unit } from "../src/game/types";

import {
  angmarFixture as fixture,
  angmarAlly as ally,
  angmarHand as hand,
  angmarAttach as attach,
} from "./angmar-player-fixtures";

function effect(s: GameState, e: Effect) {
  assert.equal(Angmar.angmarEffect(s, e), true, e.kind);
  flush(s);
  return s;
}
function select(s: GameState, id: string) {
  return choose(reload(s), id);
}
function play(s: GameState, code: string, target?: string) {
  const u = hand(s, code);
  return applyAction(s, { type: "PLAY", id: u.id, target });
}
function ability(s: GameState, u: Unit, id?: string) {
  return applyAction(s, { type: "ABILITY", id: u.id, attachmentId: id });
}
function responseStart(s: GameState) {
  assert.equal(
    s.choice?.options.find((o) => o.id === "use")?.ability?.type,
    "response",
  );
  return select(s, "use");
}

test("Angmar player pool registers 58 new designs and reuses exactly Elf-friend and The Long Defeat", () => {
  assert.equal(ANGMAR_PLAYER_CARDS.length, 58);
  assert.equal(new Set(ANGMAR_PLAYER_CODES).size, 60);
  for (const code of ANGMAR_PLAYER_CODES) assert.ok(SCRIPTED.has(code), code);
  const source = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  for (const c of ANGMAR_PLAYER_CARDS) {
    const original = source.find((u: { code: string }) => u.code === c.code);
    assert.equal(c.text, original.text, c.code);
    assert.equal(c.octgnid, original.octgnid);
  }
});
test("printed player side quests retain source-audited goals and Victory 1", () => {
  for (const [code, goal] of [
    [A.scout, 4],
    [A.double, 4],
    [A.delay, 8],
    [A.aid, 6],
  ] as const) {
    assert.equal(card(code).quest, goal);
    assert.equal(card(code).victory, 1);
    assert.equal(card(code).deck_limit, 1);
  }
});
test("Ingold counts only his controller's heroes with a nonempty resource pool", () => {
  const s = fixture(2),
    u = ally(s, A.ingold);
  s.heroes[0].resources = 0;
  assert.equal(Angmar.angmarStats(s, u).will, 2);
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.resources = 0)));
  assert.equal(Angmar.angmarStats(s, u).will, 2);
  u.blanked = true;
  assert.equal(Angmar.angmarStats(s, u).will, 0);
});
test("Veteran of Osgiliath gains all three stats at his own player's Valour threshold", () => {
  const s = fixture(2),
    u = ally(s, A.veteran, 1);
  s.threat = 49;
  assert.deepEqual(Angmar.angmarStats(s, u), {
    will: 0,
    attack: 0,
    defense: 0,
  });
  forOwner(s, 1, () => (s.threat = 40));
  assert.deepEqual(Angmar.angmarStats(s, u), {
    will: 1,
    attack: 1,
    defense: 1,
  });
});
test("East Road Ranger gains willpower only while committed to the selected side quest", () => {
  const s = fixture(),
    u = ally(s, A.ranger),
    q = make(s, A.double);
  s.staging.push(q);
  u.committed = true;
  assert.equal(Angmar.angmarStats(s, u).will, 0);
  s.phase = "quest";
  s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  assert.equal(Angmar.angmarStats(s, u).will, 2);
  u.committed = false;
  assert.equal(Angmar.angmarStats(s, u).will, 0);
});
test("Rossiel matches location and enemy traits independently in the victory display", () => {
  const s = fixture(),
    u = make(s, A.rossiel),
    location = make(s, "01099"),
    enemy = make(s, "01096");
  s.heroes[0] = u;
  s.activeLocation = location;
  s.victoryCards = [location.code, enemy.code];
  assert.equal(Angmar.angmarStats(s, u).will, 2);
  assert.equal(Angmar.angmarDefenseBonus(s, u, enemy), 2);
  s.victoryCards = [];
  assert.equal(Angmar.angmarDefenseBonus(s, u, enemy), 0);
  assert.equal(Angmar.angmarStats(s, u).will, 0);
});
test("Guardian of Arnor and Fornost Bowman count their controller's engaged enemies", () => {
  const s = fixture(2),
    guardian = ally(s, A.guardian),
    bowman = ally(s, A.bowman, 1);
  s.engaged.push(make(s, "01096"), make(s, "01096"));
  forOwner(s, 1, () => s.engaged.push(make(s, "01096")));
  assert.equal(Angmar.angmarStats(s, guardian).defense, 2);
  assert.equal(Angmar.angmarStats(s, bowman).attack, 1);
});
test("Amarthiúl's Tactics icon and extra framework resource follow actual engagements", () => {
  const s = fixture(),
    u = s.heroes[2];
  assert.deepEqual(Angmar.angmarResourceIcons(s, u), []);
  s.engaged.push(make(s, "01096"));
  assert.deepEqual(Angmar.angmarResourceIcons(s, u), ["tactics"]);
  assert.equal(Angmar.angmarResourceBonus(s, u), 0);
  s.engaged.push(make(s, "01096"));
  assert.equal(Angmar.angmarResourceBonus(s, u), 1);
  u.blanked = true;
  assert.equal(Angmar.angmarResourceBonus(s, u), 0);
});
test("Erestor contributes three extra draws only to his controller", () => {
  const s = fixture(2);
  s.heroes[0] = make(s, A.erestor);
  assert.equal(Angmar.angmarResourceDrawBonus(s, 0), 3);
  assert.equal(Angmar.angmarResourceDrawBonus(s, 1), 0);
  s.heroes[0].blanked = true;
  assert.equal(Angmar.angmarResourceDrawBonus(s), 0);
});
test("Derndingle Warrior, Wellinghall Preserver and Beechbone enter exhausted", () => {
  for (const code of [A.warrior, A.preserver, A.beechbone]) {
    const s = fixture(),
      u = make(s, code);
    enterAlly(s, u);
    assert.equal(u.exhausted, true, code);
  }
});
test("Merry responds only to an enemy revealed from the encounter deck and exhausts to lower his own threat", () => {
  let s = fixture(2);
  s.heroes[0] = make(s, A.merry);
  s.startingHeroes = s.heroes.map((h) => h.code);
  const h = s.heroes[0];
  s.threat = 30;
  Angmar.angmarRevealed(s, "01096", "underworld");
  assert.equal(s.queue.length, 0);
  Angmar.angmarRevealed(s, "01099");
  assert.equal(s.queue.length, 0);
  Angmar.angmarRevealed(s, "01096");
  flush(s);
  s = responseStart(s);
  assert.equal(get(s, h.id)!.exhausted, true);
  assert.equal(s.threat, 30 - card("01096").threat!);
  assert.equal(seatView(s, 1).threat, 20);
});
test("Hobbit Pony commits a ready Hobbit during staging and uses a serialized Action", () => {
  let s = fixture();
  s.heroes[0] = make(s, A.merry);
  s.startingHeroes = s.heroes.map((h) => h.code);
  const h = s.heroes[0],
    a = attach(s, h, A.pony);
  s.phase = "quest";
  assert.equal(Angmar.angmarAbilityProblem(s, h, a.id), null);
  s = ability(s, h, a.id);
  assert.ok(get(s, h.id)!.committed);
  assert.ok(get(s, h.id)!.exhausted);
  assert.ok(Angmar.angmarAbilityProblem(s, get(s, h.id)!, a.id));
  reload(s);
});
test("Elven Jeweler's hand Action discards two other physical cards and preserves its identity", () => {
  let s = fixture();
  const jeweler = hand(s, A.jeweler),
    one = hand(s, "01020"),
    two = hand(s, "01021");
  assert.ok(availableAbilities(s, jeweler).some((a) => !a.disabled));
  s = ability(s, jeweler);
  assert.ok(!s.choice!.options.some((o) => o.id === jeweler.id));
  s = select(s, one.id);
  s = select(s, two.id);
  assert.ok(s.allies.some((a) => a.id === jeweler.id));
  assert.deepEqual(s.discard, [one.code, two.code]);
  assert.equal(s.hand.length, 0);
  reload(s);
});
test("Elven Jeweler cannot discard itself or pay with fewer than two other cards", () => {
  const s = fixture(),
    jeweler = hand(s, A.jeweler);
  hand(s, "01020");
  assert.match(Angmar.angmarAbilityProblem(s, jeweler)!, /two other/);
});
test("Arwen discards a card to add one resource to another player's Noldor hero and is limited once per round", () => {
  let s = fixture(2);
  const arwen = s.heroes[0],
    cost = hand(s, "01020");
  forOwner(s, 1, () => {
    s.heroes[0] = make(s, "01011");
    s.startingHeroes = s.heroes.map((h) => h.code);
  });
  const target = seatView(s, 1).heroes[0],
    before = target.resources;
  s = ability(s, arwen);
  s = select(s, cost.id);
  s = select(s, target.id);
  assert.equal(get(s, target.id)!.resources, before + 1);
  assert.match(
    Angmar.angmarAbilityProblem(s, get(s, arwen.id)!)!,
    /unused round/,
  );
  reload(s);
});
test("Elven Spear uses the attachment's controller hand and permits exactly three Actions per phase", () => {
  let s = fixture();
  const hero = s.heroes[0],
    a = attach(s, hero, A.spear);
  for (let i = 0; i < 4; i++) hand(s, "01020");
  for (let i = 0; i < 3; i++) {
    s = ability(s, get(s, hero.id)!, a.id);
    s = select(s, s.hand[0].id);
  }
  assert.equal(get(s, hero.id)!.tempAttack, 3);
  assert.match(
    Angmar.angmarAbilityProblem(s, get(s, hero.id)!, a.id)!,
    /three/,
  );
  phaseEnd(s);
  assert.equal(get(s, hero.id)!.tempAttack, 0);
  assert.equal(Angmar.angmarAbilityProblem(s, get(s, hero.id)!, a.id), null);
});
test("Longbeard Sentry discards actual deck cards, gains phase defense/Sentinel and cannot repeat that phase", () => {
  let s = fixture();
  const u = ally(s, A.sentry);
  s.deck = ["01020", "01021", "01022"];
  s = ability(s, u);
  assert.deepEqual(s.discard, ["01020", "01021"]);
  assert.equal(get(s, u.id)!.tempDefense, 1);
  assert.equal(effectiveKeyword(get(s, u.id)!, "Sentinel"), true);
  assert.match(Angmar.angmarAbilityProblem(s, get(s, u.id)!)!, /unused phase/);
  s = reload(s);
  assert.equal(effectiveKeyword(get(s, u.id)!, "Sentinel"), true);
  phaseEnd(s);
  assert.equal(effectiveKeyword(get(s, u.id)!, "Sentinel"), false);
});
test("Fair and Perilous locks the character's current willpower into its phase attack bonus", () => {
  const s = fixture(),
    u = s.heroes[0];
  u.tempWill = 2;
  Angmar.angmarEvent(s, A.fair, u.id);
  const bonus = u.tempAttack;
  u.tempWill = 7;
  assert.equal(u.tempAttack, bonus);
  assert.equal(bonus, card(u.code).willpower! + 2);
});
test("Descendants of Kings readies at most one Dúnedain per engaged enemy under the initiating player's control", () => {
  let s = fixture(2);
  const own = s.heroes[2],
    other = ally(s, "09006", 1);
  own.exhausted = true;
  other.exhausted = true;
  s.engaged.push(make(s, "01096"));
  Angmar.angmarEvent(s, A.descendants);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === own.id));
  assert.ok(!s.choice!.options.some((o) => o.id === other.id));
  s = select(s, own.id);
  assert.equal(get(s, own.id)!.exhausted, false);
  assert.equal(get(s, other.id)!.exhausted, true);
});
test("Dúnedain Message searches the whole owner deck only for player side quests", () => {
  let s = fixture();
  s.deck = ["01020", A.scout, "01021"];
  Angmar.angmarEvent(s, A.message);
  assert.ok(!s.choice!.options.some((o) => o.id === "card-0"));
  s = select(s, "card-1");
  assert.equal(s.hand[0].code, A.scout);
  assert.equal(s.deck.length, 2);
  reload(s);
});
test("Keen as Lances discounts only zero-victory cards, then its physical event enters victory display", () => {
  let s = fixture();
  s.victoryCards = [A.scout, "01096", A.trace];
  assert.equal(Angmar.angmarPlayCost(s, card(A.lances), 5), 3);
  s = play(s, A.lances);
  s = select(s, "threat");
  assert.ok(s.victoryCards!.includes(A.lances));
  assert.ok(!s.discard.includes(A.lances));
  assert.equal(s.threat, 16);
  reload(s);
});
test("Hope Rekindled keeps both printed Actions selectable at Valour and only discounts the next qualifying event", () => {
  let s = fixture();
  s.threat = 40;
  Angmar.angmarEvent(s, A.hope);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["normal", "valour"],
  );
  s = select(s, "normal");
  assert.equal(Angmar.angmarPlayCost(s, card(A.cry), 2), 0);
  assert.equal(Angmar.angmarPlayCost(s, card(A.fair), 1), 1);
  Angmar.angmarEventPlayed(s, A.fair);
  assert.equal(Angmar.angmarPlayCost(s, card(A.cry), 2), 0);
  Angmar.angmarEventPlayed(s, A.cry);
  assert.equal(Angmar.angmarPlayCost(s, card(A.cry), 2), 2);
});
test("Hope Rekindled's Valour search is restricted to ten cards and an event with a Valour trigger", () => {
  let s = fixture();
  s.threat = 40;
  s.deck = [A.fair, A.cry, ...Array(8).fill("01020"), A.wrath];
  Angmar.angmarEvent(s, A.hope);
  s = select(s, "valour");
  assert.ok(s.choice!.options.some((o) => o.id === "card-1"));
  assert.ok(
    !s.choice!.options.some((o) => o.id === "card-0" || o.id === "card-10"),
  );
  s = select(s, "card-1");
  assert.equal(s.hand[0].code, A.cry);
});
test("Horn's Cry ordinary and Valour Actions affect the correct enemy groups and honor immunity", () => {
  let s = fixture(2);
  s.threat = 40;
  const own = make(s, "01096"),
    other = make(s, "01096"),
    immune = make(s, "01096");
  immune.immuneToPlayerEffects = true;
  s.engaged.push(own);
  forOwner(s, 1, () => s.engaged.push(other));
  s.staging.push(immune);
  Angmar.angmarEvent(s, A.cry);
  s = choose(s, "valour");
  s = choose(s, "player-1");
  assert.equal(get(s, other.id)!.tempAttack, -3);
  assert.equal(get(s, own.id)!.tempAttack, undefined);
  assert.equal(get(s, immune.id)!.tempAttack, undefined);
});
test("Doom Hangs Still offers a planning-only quest-failure protection or paid quest skip", () => {
  let s = fixture(2);
  s.threat = 40;
  Angmar.angmarEvent(s, A.doom);
  s = select(s, "valour");
  assert.equal(s.threat, 42);
  assert.equal(seatView(s, 1).threat, 22);
  assert.equal(Angmar.angmarSkipQuest(s), true);
  s.phase = "quest";
  assert.match(Angmar.angmarPlayProblem(s, A.doom)!, /Planning/);
});
test("Hold Your Ground Valour readies all eligible Sentinel characters across players", () => {
  let s = fixture(2);
  s.threat = 40;
  const own = s.heroes[1],
    other = ally(s, A.guardian, 1);
  own.exhausted = true;
  other.exhausted = true;
  Angmar.angmarEvent(s, A.ground, own.id);
  s = select(s, "valour");
  assert.equal(get(s, own.id)!.exhausted, false);
  assert.equal(get(s, other.id)!.exhausted, false);
});
test("Hour of Wrath Valour applies only to the selected player's heroes and survives reload until phase end", () => {
  let s = fixture(2);
  s.threat = 40;
  const own = s.heroes[0],
    other = seatView(s, 1).heroes[0];
  Angmar.angmarEvent(s, A.wrath, own.id);
  s = select(s, "valour");
  s = select(s, "player-1");
  assert.equal(Angmar.angmarNoCombatExhaust(s, get(s, own.id)!), false);
  assert.equal(
    Angmar.angmarNoCombatExhaust(reload(s), get(s, other.id)!),
    true,
  );
  phaseEnd(s);
  assert.equal(Angmar.angmarNoCombatExhaust(s, get(s, other.id)!), false);
});
test("discard-only Noldor events cannot be played from hand", () => {
  const s = fixture();
  for (const code of [A.light, A.lords]) {
    const u = hand(s, code);
    assert.match(canPlay(s, u)!, /discard pile/);
    assert.equal(Angmar.angmarPlayProblem(s, code, "discard"), null);
  }
});
test("Galadhrim Weaver recovers only the actual top discard and respects Power of Angmar", () => {
  let s = fixture(),
    u = ally(s, A.weaver);
  s.discard = ["01020", "01021"];
  s.deck = ["01022"];
  Angmar.angmarAllyEntered(s, u);
  flush(s);
  s = responseStart(s);
  assert.deepEqual(s.discard, ["01020"]);
  assert.deepEqual(new Set(s.deck), new Set(["01021", "01022"]));
  reload(s);
});
test("Lindir draws exactly up to three cards after entering, including put-into-play entry", () => {
  let s = fixture();
  const u = ally(s, A.lindir);
  hand(s, "01020");
  s.deck = ["01021", "01022", "01023"];
  Angmar.angmarAllyEntered(s, u);
  flush(s);
  s = responseStart(s);
  assert.equal(s.hand.length, 3);
  assert.equal(s.deck.length, 1);
});
test("Galadhrim Healer chooses a player and heals each of that player's heroes only", () => {
  let s = fixture(2);
  s.heroes.forEach((h) => (h.damage = 1));
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.damage = 1)));
  const u = ally(s, A.healer);
  Angmar.angmarAllyEntered(s, u);
  flush(s);
  s = responseStart(s);
  s = select(s, "player-1");
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 0));
  assert.ok(s.heroes.every((h) => h.damage === 1));
});
test("Sword-thain changes the physical unique ally into a hero and reverts when removed", () => {
  const s = fixture(),
    u = ally(s, A.lindir),
    a = attach(s, u, A.thain);
  Angmar.angmarSyncSwordThain(s);
  assert.ok(s.heroes.some((h) => h.id === u.id));
  assert.ok(!s.allies.some((h) => h.id === u.id));
  assert.equal(isHero(u), true);
  assert.equal(
    allHeroes(s).some((h) => h.id === u.id),
    true,
  );
  u.attachments = u.attachments.filter((v) => v.id !== a.id);
  Angmar.angmarSyncSwordThain(s);
  assert.equal(isAlly(u), true);
  assert.ok(s.allies.some((h) => h.id === u.id));
  assert.equal(card(u.code).type_code, "ally");
});
test("Sword-thain rejects neutral and non-unique allies; Elf-friend preserves its existing canonical handler", () => {
  const s = fixture(),
    neutral = ally(s, "01073"),
    nonunique = ally(s, A.guard),
    unique = ally(s, A.lindir);
  assert.deepEqual(
    Angmar.angmarPlayTargets(s, A.thain)!.map((u) => u.id),
    [unique.id],
  );
  assert.ok(
    !Angmar.angmarPlayTargets(s, A.thain)!.some(
      (u) => u.id === neutral.id || u.id === nonunique.id,
    ),
  );
  attach(s, s.heroes[1], A.friend);
  assert.equal(hasTrait(s.heroes[1], "Noldor"), true);
  assert.equal(hasTrait(s.heroes[1], "Silvan"), true);
});

test("Honour Guard prevents a lethal point of damage before destruction and exhausts", () => {
  let s = fixture();
  const guard = ally(s, A.guard),
    hero = s.heroes[0];
  hero.damage = card(hero.code).health! - 1;
  damage(s, hero.id, 1);
  flush(s);
  assert.match(s.choice!.title, /Prevent damage/);
  s = select(s, `${guard.id}-normal`);
  assert.ok(get(s, hero.id));
  assert.equal(get(s, hero.id)!.damage, card(hero.code).health! - 1);
  assert.ok(get(s, guard.id)!.exhausted);
  reload(s);
});
test("Honour Guard's Valour mode checks its controller, pays exhaust/discard and cancels a chosen amount up to five", () => {
  let s = fixture(2);
  const guard = ally(s, A.guard, 1),
    hero = s.heroes[0];
  s.threat = 20;
  forOwner(s, 1, () => (s.threat = 40));
  damage(s, hero.id, 4);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `${guard.id}-valour`));
  s = select(s, `${guard.id}-valour`);
  s = select(s, "cancel-4");
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.equal(get(s, guard.id), undefined);
  assert.ok(seatView(s, 1).discard.includes(A.guard));
});
test("declining damage prevention resumes one assignment and does not reoffer the same window", () => {
  let s = fixture();
  ally(s, A.guard);
  const hero = s.heroes[0];
  damage(s, hero.id, 1);
  flush(s);
  s = select(s, "skip");
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(s.choice, null);
});
test("ability cost damage cannot be prevented by Honour Guard", () => {
  const s = fixture();
  ally(s, A.guard);
  const hero = s.heroes[0];
  damage(s, hero.id, 1, { cost: true });
  assert.equal(hero.damage, 1);
  assert.equal(s.choice, null);
  assert.ok(!s.queue.some((e) => e.kind === "angmarDamageWindow"));
});
test("Raven-winged Helm requires Sentinel and prevents only damage to its bearer", () => {
  let s = fixture();
  const hero = s.heroes[1],
    a = attach(s, hero, A.helm);
  assert.ok(
    Angmar.angmarPlayTargets(s, A.helm)!.every((h) =>
      effectiveKeyword(h, "Sentinel"),
    ),
  );
  damage(s, hero.id, 1);
  flush(s);
  s = select(s, `${a.id}-normal`);
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.ok(get(s, hero.id)!.attachments.find((v) => v.id === a.id)!.exhausted);
});
test("Weather-stained Cloak has a prevention Response only while its Ranger bearer is committed", () => {
  let s = fixture();
  const hero = s.heroes[2],
    a = attach(s, hero, A.cloak);
  damage(s, hero.id, 1);
  flush(s);
  assert.equal(s.choice, null);
  hero.committed = true;
  damage(s, hero.id, 1);
  flush(s);
  s = select(s, `${a.id}-normal`);
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.ok(get(s, hero.id)!.attachments.find((v) => v.id === a.id)!.exhausted);
});
test("Boomed and Trumpeted readies a surviving damaged Ent and gives a phase attack bonus", () => {
  let s = fixture();
  const ent = ally(s, A.preserver),
    event = hand(s, A.boomed);
  ent.exhausted = true;
  damage(s, ent.id, 1);
  flush(s);
  assert.match(s.choice!.title, /Boomed/);
  s = select(s, event.id);
  assert.equal(get(s, ent.id)!.exhausted, false);
  assert.equal(get(s, ent.id)!.tempAttack, 3);
  if (s.choice?.title.includes("Wellinghall")) s = select(s, "skip");
  assert.ok(s.discard.includes(A.boomed));
});
test("lethal damage does not offer Boomed and Trumpeted to a destroyed Ent", () => {
  const s = fixture(),
    ent = ally(s, A.preserver);
  hand(s, A.boomed);
  damage(s, ent.id, card(ent.code).health!);
  flush(s);
  assert.equal(get(s, ent.id), undefined);
  assert.ok(!s.choice?.title.includes("Boomed"));
});
test("Wellinghall Preserver heals one damage from an Ent after an actual ready transition", () => {
  let s = fixture();
  const preserver = ally(s, A.preserver),
    ent = ally(s, A.warrior);
  preserver.exhausted = true;
  ent.damage = 1;
  readyCharacter(s, preserver);
  flush(s);
  s = responseStart(s);
  s = select(s, ent.id);
  assert.equal(get(s, ent.id)!.damage, 0);
  readyCharacter(s, get(s, preserver.id)!);
  flush(s);
  assert.equal(s.choice, null);
});
test("Derndingle Warrior pays unpreventable damage and gains defense only for the current attack", () => {
  let s = fixture();
  const warrior = ally(s, A.warrior),
    enemy = make(s, "01096");
  s.engaged.push(enemy);
  s.combat = { enemyId: enemy.id, defenderId: warrior.id, attackBonus: 0 };
  s.phase = "defense";
  s = ability(s, warrior);
  assert.equal(get(s, warrior.id)!.damage, 1);
  assert.equal(s.combat!.defenseBonuses![warrior.id], 3);
  assert.match(
    Angmar.angmarAbilityProblem(s, get(s, warrior.id)!)!,
    /once per attack/,
  );
  reload(s);
});
test("Dori uses current defense and exhausts only after another hero is declared as defender", () => {
  let s = fixture();
  const dori = s.heroes[1],
    defender = s.heroes[0],
    enemy = make(s, "01096");
  s.engaged.push(enemy);
  s.combat = { enemyId: enemy.id, defenderId: defender.id, attackBonus: 0 };
  s.phase = "defense";
  dori.tempDefense = 2;
  Angmar.angmarDefenderDeclared(s, defender);
  flush(s);
  s = responseStart(s);
  assert.equal(
    s.combat!.defenseBonuses![defender.id],
    card(A.dori).defense! + 2,
  );
  assert.equal(get(s, dori.id)!.exhausted, true);
  reload(s);
});
test("Beechbone's attacker Response deals a damage cost, then damage equal to his resulting damage total", () => {
  let s = fixture();
  const beech = ally(s, A.beechbone),
    enemy = make(s, "01082");
  beech.damage = 1;
  s.engaged.push(enemy);
  Angmar.angmarAttackDeclared(s, enemy, [beech]);
  flush(s);
  s = responseStart(s);
  assert.equal(get(s, beech.id)!.damage, 2);
  assert.equal(get(s, enemy.id)!.damage, 2);
});
test("Sword of Númenor grants attack continuously and resources only after a qualifying attack kill", () => {
  let s = fixture();
  const hero = s.heroes[2],
    a = attach(s, hero, A.sword),
    enemy = make(s, "01082"),
    before = hero.resources;
  assert.equal(Angmar.angmarStats(s, hero).attack, 1);
  Angmar.angmarAttackKilled(s, enemy, [hero.id]);
  flush(s);
  s = responseStart(s);
  assert.equal(get(s, hero.id)!.resources, before + 1);
  assert.ok(get(s, hero.id)!.attachments.find((v) => v.id === a.id)!.exhausted);
});
test("None Return moves both the physical destroyed enemy and the resolving event into victory display", () => {
  let s = fixture();
  const enemy = make(s, "01096"),
    event = hand(s, A.none);
  s.encounterDiscard.push(enemy.code);
  Angmar.angmarEnemyDestroyed(s, enemy);
  flush(s);
  s = select(s, event.id);
  assert.deepEqual(s.victoryCards, [enemy.code, A.none]);
  assert.equal(s.encounterDiscard.length, 0);
  assert.ok(!s.discard.includes(A.none));
  reload(s);
});
test("Leave No Trace applies only to a non-unique explored location and caps its victory-display copies", () => {
  let s = fixture();
  const location = make(s, "01099"),
    event = hand(s, A.trace);
  s.encounterDiscard.push(location.code);
  Angmar.angmarLocationExplored(s, location, 0, [], false);
  flush(s);
  s = select(s, event.id);
  assert.deepEqual(s.victoryCards, [location.code, A.trace]);
  s.victoryCards.push(A.trace, A.trace);
  hand(s, A.trace);
  s.encounterDiscard.push(location.code);
  Angmar.angmarLocationExplored(s, location, 0, [], false);
  flush(s);
  assert.equal(s.choice, null);
});
test("Ranger Provisions gives each first-player hero a resource and credits the attachment controller's Response", () => {
  let s = fixture(2);
  const location = make(s, "01099"),
    a = attach(s, location, A.provisions, 1, 1),
    before = s.heroes.map((h) => h.resources);
  location.attachments = [];
  Angmar.angmarLocationExplored(s, location, undefined, [a], false);
  flush(s);
  assert.equal(
    s.choice!.options.find((o) => o.id === "use")!.ability!.player,
    1,
  );
  s = responseStart(s);
  assert.deepEqual(
    seatView(s, 0).heroes.map((h) => h.resources),
    before.map((n) => n + 1),
  );
});
test("Curious Brandybuck travel Response can place its physical owner's card under another player's control", () => {
  let s = fixture(2);
  const u = hand(s, A.brandybuck);
  Angmar.angmarTraveled(s);
  flush(s);
  s = responseStart(s);
  s = select(s, "player-1");
  const moved = seatView(s, 1).allies.find((a) => a.id === u.id)!;
  assert.ok(moved);
  assert.equal(moved.owner, 0);
  assert.equal(s.hand.length, 0);
  reload(s);
});
test("Curious Brandybuck returns to its owner's bottom deck only when the active location is explored", () => {
  let s = fixture(2);
  const u = ally(s, A.brandybuck, 1);
  u.owner = 0;
  const a = attach(s, u, A.spear, 0),
    location = make(s, "01099");
  s.deck = ["01020"];
  Angmar.angmarLocationExplored(s, location, undefined, [], false);
  flush(s);
  assert.ok(get(s, u.id));
  Angmar.angmarLocationExplored(s, location, undefined, [], true);
  flush(s);
  assert.equal(get(s, u.id), undefined);
  assert.equal(seatView(s, 0).deck.at(-1), A.brandybuck);
  assert.ok(seatView(s, 0).discard.includes(a.code));
  reload(s);
});
test("Ranger of Cardolan requires a Dúnedain hero, pays one any-sphere resource and shuffles out at round end", () => {
  let s = fixture();
  const cardolan = hand(s, A.cardolan),
    enemy = make(s, "01096"),
    hero = s.heroes[0],
    before = hero.resources;
  Angmar.angmarEngaged(s, enemy);
  flush(s);
  s = responseStart(s);
  s = select(s, hero.id);
  assert.equal(get(s, hero.id)!.resources, before - 1);
  assert.ok(get(s, cardolan.id));
  s.queue.push(...Angmar.angmarRoundEnd(s));
  flush(s);
  assert.equal(get(s, cardolan.id), undefined);
  assert.ok(s.deck.includes(A.cardolan));
  reload(s);
});
test("Rallying Cry ordinary Response returns a departed ally to its physical owner's hand", () => {
  let s = fixture(2);
  const departed = make(s, A.guard),
    event = hand(s, A.rally, 1);
  s.discard.push(departed.code);
  Angmar.angmarCharacterLeft(s, departed, 1, {
    zone: "discard",
    player: 0,
    index: 0,
  });
  flush(s);
  s = select(s, event.id);
  assert.ok(seatView(s, 0).hand.some((h) => h.id === departed.id));
  assert.equal(seatView(s, 0).discard.length, 0);
  assert.ok(seatView(s, 1).discard.includes(A.rally));
  reload(s);
});
test("Rallying Cry's Valour replacement lasts only for the phase and does not return a discarded hero", () => {
  const s = fixture();
  s.threat = 40;
  Angmar.angmarEvent(s, A.rally);
  const departed = make(s, A.guard);
  s.discard.push(departed.code);
  Angmar.angmarCharacterLeft(s, departed, 0, {
    zone: "discard",
    player: 0,
    index: 0,
  });
  flush(s);
  assert.ok(s.hand.some((h) => h.id === departed.id));
  assert.equal(s.discard.length, 0);
  phaseEnd(s);
  const second = make(s, A.guard);
  s.discard.push(second.code);
  Angmar.angmarCharacterLeft(s, second, 0, {
    zone: "discard",
    player: 0,
    index: 0,
  });
  flush(s);
  assert.equal(s.hand.filter((h) => h.code === A.guard).length, 1);
});
test("Éothain readies after a Rohan ally is discarded by a card effect, and not after damage destruction", () => {
  let s = fixture();
  const u = ally(s, A.eothain),
    rohan = make(s, "01030");
  u.exhausted = true;
  Angmar.angmarCharacterLeft(
    s,
    rohan,
    0,
    { zone: "discard", player: 0, index: 0 },
    false,
  );
  flush(s);
  assert.equal(s.choice, null);
  Angmar.angmarCharacterLeft(
    s,
    rohan,
    0,
    { zone: "discard", player: 0, index: 0 },
    true,
  );
  flush(s);
  s = responseStart(s);
  assert.equal(get(s, u.id)!.exhausted, false);
});
test("Silver Harp returns the discarded physical card, exhausts once and preserves borrowed ownership", () => {
  let s = fixture(2);
  const hero = s.heroes[0],
    harp = attach(s, hero, A.harp),
    copy = hand(s, "01020");
  copy.owner = 1;
  discardHandCard(s, copy.id);
  flush(s);
  s = responseStart(s);
  const returned = seatView(s, 0).hand.find((h) => h.id === copy.id)!;
  assert.ok(returned);
  assert.equal(returned.owner, 1);
  assert.equal(seatView(s, 1).discard.length, 0);
  assert.ok(
    get(s, hero.id)!.attachments.find((a) => a.id === harp.id)!.exhausted,
  );
  reload(s);
});
test("queued Silver Harp recoveries follow shifted discard indexes rather than another identical copy", () => {
  let s = fixture();
  const hero = s.heroes[0];
  attach(s, hero, A.harp);
  s.discard = ["01020"];
  const copy = hand(s, "01021");
  discardHandCard(s, copy.id);
  takePlayerDiscard(s, 0);
  flush(s);
  s = responseStart(s);
  assert.ok(s.hand.some((h) => h.id === copy.id));
  assert.equal(s.discard.length, 0);
});
test("Galdor draws at most once per round even when multiple hand cards are discarded simultaneously", () => {
  let s = fixture();
  const galdor = ally(s, A.galdor),
    one = hand(s, "01020"),
    two = hand(s, "01021");
  s.deck = ["01022", "01023"];
  discardHandCard(s, one.id);
  discardHandCard(s, two.id);
  flush(s);
  s = responseStart(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.deck.length, 1);
  assert.equal(s.choice, null);
  assert.ok(s.used.includes(`round:angmar:galdor:${galdor.id}`));
});
test("Erestor discards the complete hand at end of round while allowing Silver Harp responses afterward", () => {
  let s = fixture();
  s.heroes[1] = make(s, A.erestor);
  s.startingHeroes = s.heroes.map((h) => h.code);
  attach(s, s.heroes[0], A.harp);
  const one = hand(s, "01020"),
    two = hand(s, "01021");
  s.queue.push(...Angmar.angmarRoundEnd(s));
  flush(s);
  assert.equal(s.hand.length, 0);
  assert.deepEqual(s.discard, [one.code, two.code]);
  s = responseStart(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.discard.length, 1);
});
test("The Door is Closed matches titles in victory display and credits a remote player's encounter cancellation", () => {
  const s = fixture(2);
  s.victoryCards = ["01096"];
  const c = hand(s, A.door, 1);
  const opts = Angmar.angmarRevealOptions(s, "01096");
  assert.ok(
    opts.some((o) => o.id === `door-${c.id}` && o.ability?.player === 1),
  );
  assert.ok(
    !Angmar.angmarRevealOptions(s, "01099").some((o) => o.code === A.door),
  );
  assert.equal(Angmar.angmarRevealOptions(s, "01096", "underworld").length, 0);
});
test("Quick Ears requires an own ready Dúnedain or Ranger hero and replaces the entire revealed enemy", () => {
  const s = fixture();
  const c = hand(s, A.ears),
    hero = s.heroes[2];
  const opts = Angmar.angmarRevealOptions(s, "01096");
  assert.ok(opts.some((o) => o.id === `ears-${c.id}-${hero.id}`));
  hero.exhausted = true;
  assert.ok(
    !Angmar.angmarRevealOptions(s, "01096").some(
      (o) => o.id === `ears-${c.id}-${hero.id}`,
    ),
  );
  assert.ok(
    !Angmar.angmarRevealOptions(s, "01099").some((o) => o.code === A.ears),
  );
});
test("Scout Ahead filters objective/victory cards and preserves the chosen top-card order", () => {
  let s = fixture();
  s.encounterDeck = ["01099", "01096", A.scout, "01097", "01098", "01082"];
  effect(s, fx("angmarScoutSearch"));
  assert.ok(!s.choice!.options.some((o) => o.id === "card-2"));
  s = select(s, "card-1");
  assert.deepEqual(s.victoryCards, ["01096"]);
  for (const id of ["card-3", "card-2", "card-1", "card-0"]) s = select(s, id);
  assert.deepEqual(s.encounterDeck.slice(0, 4), [
    "01098",
    "01097",
    A.scout,
    "01099",
  ]);
  assert.equal(s.encounterDeck.at(-1), "01082");
  reload(s);
});
test("Double Back's side-quest Response lowers every living player's threat by five", () => {
  let s = fixture(2);
  const q = make(s, A.double);
  Angmar.angmarSideDefeated(s, q);
  flush(s);
  s = responseStart(s);
  assert.equal(seatView(s, 0).threat, 15);
  assert.equal(seatView(s, 1).threat, 15);
});
test("Delay the Enemy allows each player to discard one own non-unique engaged enemy or decline", () => {
  let s = fixture(2);
  const own = make(s, "01096");
  s.engaged.push(own);
  let other: Unit;
  forOwner(s, 1, () => {
    other = make(s, "01096");
    s.engaged.push(other);
  });
  effect(s, fx("angmarSideResolve", { code: A.delay }));
  assert.ok(s.choice!.options.some((o) => o.id === own.id));
  assert.ok(!s.choice!.options.some((o) => o.id === other!.id));
  s = select(s, own.id);
  s = select(s, "skip");
  assert.equal(get(s, own.id), undefined);
  assert.ok(get(s, other!.id));
});
test("Send for Aid puts a top-ten ally into play without paying and lets another player decline", () => {
  let s = fixture(2);
  s.deck = [A.guard, "01020"];
  forOwner(s, 1, () => (s.deck = [A.preserver, "01021"]));
  effect(s, fx("angmarSideResolve", { code: A.aid }));
  s = select(s, "card-0");
  s = select(s, "skip");
  assert.ok(seatView(s, 0).allies.some((u) => u.code === A.guard));
  assert.ok(!seatView(s, 1).allies.some((u) => u.code === A.preserver));
  assert.deepEqual(seatView(s, 1).deck, [A.preserver, "01021"]);
});
test("Favor of the Valar replaces threat elimination once using the actual scenario threshold", () => {
  const s = fixture();
  s.threat = 45;
  s.threatAttachments = [
    { id: `a${s.nextId++}`, code: A.favor, owner: 0, exhausted: false },
  ];
  assert.equal(Angmar.angmarFavor(s, 45), true);
  assert.equal(s.threat, 40);
  assert.deepEqual(s.discard, [A.favor]);
  assert.equal(s.threatAttachments.length, 0);
  s.threat = 45;
  assert.equal(Angmar.angmarFavor(s, 45), false);
  reload(s);
});

test("Reinforcements requires resources from three different heroes even when one pool can cover its printed cost", () => {
  const s = fixture();
  s.heroes[1].resources = 0;
  s.heroes[2].resources = 0;
  assert.equal(canPay(s, card(A.reinforcements)), false);
  s.heroes[1].resources = 1;
  s.heroes[2].resources = 1;
  assert.equal(canPay(s, card(A.reinforcements)), true);
});
test("Reinforcements can move two physical allies across players and returns them to their owners at phase end", () => {
  let s = fixture(2);
  const one = hand(s, A.guard),
    two = hand(s, A.preserver, 1);
  const event = hand(s, A.reinforcements);
  s = applyAction(s, {
    type: "PLAY",
    id: event.id,
    payment: Object.fromEntries(s.heroes.map((h) => [h.id, 1])),
  });
  s = select(s, one.id);
  s = select(s, "player-1");
  s = select(s, two.id);
  s = select(s, "player-0");
  assert.equal(get(s, one.id)!.owner, 0);
  assert.equal(get(s, two.id)!.owner, 1);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === one.id));
  assert.ok(seatView(s, 0).allies.some((u) => u.id === two.id));
  reload(s);
  phaseEnd(s);
  flush(s);
  assert.equal(get(s, one.id), undefined);
  assert.equal(get(s, two.id), undefined);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === A.guard));
  assert.ok(seatView(s, 1).hand.some((u) => u.code === A.preserver));
  reload(s);
});
test("Distant Stars pays a Ranger exhaustion cost, discards rather than explores, and searches the deck plus discard", () => {
  let s = fixture();
  const ranger = s.heroes[2],
    location = make(s, "01099");
  s.activeLocation = location;
  s.encounterDeck = ["01100", "01096"];
  const attached = attach(s, location, A.provisions);
  Angmar.angmarEvent(s, A.stars);
  s = select(s, ranger.id);
  s = select(s, location.id);
  assert.ok(get(s, ranger.id)!.exhausted);
  assert.ok(s.encounterDiscard.includes(location.code));
  assert.ok(!s.victoryCards?.includes(location.code));
  assert.ok(!s.queue.some((e) => e.kind === "angmarProvisionsOffer"));
  s = select(s, "deck-0");
  assert.equal(s.activeLocation!.code, "01100");
  assert.ok(s.discard.includes(attached.code));
  reload(s);
});
test("Steed of Imladris responds to actual hero commitment and spends a movable hand card for two active-location progress", () => {
  let s = fixture();
  const hero = s.heroes[0],
    location = make(s, "01099"),
    cost = hand(s, "01020");
  attach(s, hero, A.steed);
  s.activeLocation = location;
  hero.committed = true;
  Angmar.angmarCharactersCommitted(s, [hero.id]);
  flush(s);
  s = responseStart(s);
  s = select(s, cost.id);
  assert.equal(s.activeLocation!.progress, 2);
  assert.ok(s.discard.includes(cost.code));
  reload(s);
});
test("Tale of Tinúviel uses the exhausted character's printed willpower and a different eligible exhausted recipient", () => {
  let s = fixture();
  const noldor = s.heroes[0],
    dunedain = s.heroes[2];
  noldor.tempWill = 4;
  dunedain.exhausted = true;
  Angmar.angmarEvent(s, A.tale);
  s = select(s, noldor.id);
  assert.ok(!s.choice!.options.some((o) => o.id === noldor.id));
  s = select(s, dunedain.id);
  assert.equal(get(s, noldor.id)!.exhausted, true);
  assert.equal(get(s, dunedain.id)!.exhausted, false);
  assert.equal(get(s, dunedain.id)!.tempWill, card(noldor.code).willpower);
  assert.equal(get(s, dunedain.id)!.tempAttack, card(noldor.code).willpower);
  assert.equal(get(s, dunedain.id)!.tempDefense, card(noldor.code).willpower);
  reload(s);
});
test("Elven-light pays its printed Spirit cost from discard, returns that physical event to hand, then draws", () => {
  const s = fixture();
  s.discard = [A.light];
  s.deck = ["01020", "01021"];
  const before = s.heroes[0].resources;
  assert.equal(replayEventProblem(s, make(s, A.light)), null);
  playEventFromDiscardEffect(s, 0, { payment: { [s.heroes[0].id]: 1 } });
  flush(s);
  assert.equal(s.heroes[0].resources, before - 1);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [A.light, "01020"],
  );
  assert.equal(s.discard.length, 0);
  assert.equal(s.deck.length, 1);
  reload(s);
});
test("Lords of the Eldar pays from discard, puts its event on the bottom and grants all three Noldor stats for the round", () => {
  const s = fixture(2);
  s.discard = [A.lords];
  s.deck = ["01020"];
  const target = ally(s, A.jeweler, 1),
    nonNoldor = s.heroes[1];
  playEventFromDiscardEffect(s, 0, { payment: { [s.heroes[0].id]: 3 } });
  flush(s);
  assert.equal(seatView(s, 0).deck.at(-1), A.lords);
  assert.deepEqual(Angmar.angmarStats(s, target), {
    will: 1,
    attack: 1,
    defense: 1,
  });
  assert.deepEqual(Angmar.angmarStats(s, nonNoldor), {
    will: 0,
    attack: 0,
    defense: 0,
  });
  reload(s);
});
test("discard-only event plays fail under The Power of Angmar without paying resources or removing a card", () => {
  const s = fixture();
  s.discard = [A.light];
  const power = JSON.parse(
    fs.readFileSync("src/data/deadmens-dike-encounter-cards.json", "utf8"),
  ).find((u: { name: string }) => u.name === "The Power of Angmar");
  s.staging.push(make(s, power.code));
  const before = s.heroes[0].resources;
  assert.match(replayEventProblem(s, make(s, A.light))!, /Power of Angmar/);
  assert.equal(s.discard[0], A.light);
  assert.equal(s.heroes[0].resources, before);
});
test("Silver Harp cannot recover an encounter card that cannot leave the hand as an ability cost", () => {
  const s = fixture();
  const tidings = JSON.parse(
    fs.readFileSync("src/data/fords-isen-encounter-cards.json", "utf8"),
  ).find((u: { name: string }) => u.name === "Ill Tidings");
  const blocked = hand(s, tidings.code);
  hand(s, A.jeweler);
  hand(s, "01020");
  assert.match(
    Angmar.angmarAbilityProblem(
      s,
      s.hand.find((u) => u.code === A.jeweler)!,
    )!,
    /two other/,
  );
  assert.ok(!Angmar.angmarHandAbilities(s).length);
  assert.equal(blocked.code, tidings.code);
});
test("Sword-thain's promoted hero accepts hero attachments, collects resources and round-trips a valid snapshot", () => {
  let s = fixture();
  const u = ally(s, A.lindir),
    heroResources = s.heroes.map((h) => h.resources);
  s = play(s, A.thain, u.id);
  assert.equal(isHero(get(s, u.id)!), true);
  s = reload(s);
  assert.ok(s.heroes.some((h) => h.id === u.id));
  assert.ok(playTargets(s, make(s, A.harp)).some((h) => h.id === u.id));
  const promoted = get(s, u.id)!;
  promoted.resources = 1;
  assert.equal(hasResourceIcon(promoted, "spirit"), true);
  assert.deepEqual(
    s.heroes.filter((h) => h.id !== u.id).map((h) => h.resources),
    heroResources.map((n, i) => (i === 0 ? n - 4 : n)),
  );
  reload(s);
});
test("Favor of the Valar attaches to a player's threat dial through a real paid physical card play", () => {
  let s = fixture(2);
  const u = hand(s, A.favor),
    targets = playTargets(s, u);
  assert.equal(targets.length, 2);
  assert.ok(targets.every((t) => t.id.startsWith("threat:")));
  s = applyAction(s, {
    type: "PLAY",
    id: u.id,
    target: targets.find((t) => t.id === "threat:1")!.id,
  });
  assert.ok(
    seatView(s, 1).threatAttachments?.some(
      (a) => a.id === u.id && a.owner === 0,
    ),
  );
  reload(s);
  s = applyAction(s, { type: "SELECT_SEAT", seat: 1 });
  assert.equal(activeSeat(s), 1);
  reload(s);
  s = applyAction(s, { type: "SELECT_SEAT", seat: 0 });
  assert.equal(activeSeat(s), 0);
  assert.ok(!s.threatAttachments?.length);
  assert.equal(
    seatView(s, 1).threatAttachments?.filter(
      (a) => a.id === u.id && a.owner === 0,
    ).length,
    1,
  );
  reload(s);
});

test("Ingold counts resources that encounter effects prevent their heroes from spending", () => {
  const s = fixture(),
    ingold = ally(s, A.ingold);
  const vanguard = JSON.parse(
    fs.readFileSync("src/data/heirs-numenor-encounter-cards.json", "utf8"),
  ).find((c: { name: string }) => c.name === "Orc Vanguard");
  assert.ok(vanguard);
  s.staging.push(make(s, vanguard.code));
  assert.equal(Angmar.angmarStats(s, ingold).will, 3);
  s.heroes[0].resources = 0;
  assert.equal(Angmar.angmarStats(s, ingold).will, 2);
});

test("Distant Stars and Tale of Tinúviel cannot exhaust another player's character to pay their costs", () => {
  const s = fixture(2),
    ownIds = s.heroes.map((h) => h.id);
  Angmar.angmarEvent(s, A.stars);
  assert.ok(s.choice!.options.every((o) => ownIds.includes(o.id)));
  s.choice = null;
  Angmar.angmarEvent(s, A.tale);
  assert.ok(s.choice!.options.every((o) => ownIds.includes(o.id)));
  assert.ok(
    !s.choice!.options.some((o) =>
      seatView(s, 1).heroes.some((h) => h.id === o.id),
    ),
  );
});

test("Tale of Tinúviel's separate stat effect applies when the other character is already ready", () => {
  let s = fixture(2);
  forOwner(s, 1, () => {
    s.heroes[0] = make(s, "01001");
    s.startingHeroes = s.heroes.map((h) => h.code);
  });
  const source = s.heroes[0],
    recipient = seatView(s, 1).heroes[0];
  assert.ok(hasTrait(source, "Noldor"));
  assert.ok(hasTrait(recipient, "Dúnedain"));
  assert.equal(recipient.exhausted, false);
  Angmar.angmarEvent(s, A.tale);
  s = select(s, source.id);
  s = select(s, recipient.id);
  assert.ok(get(s, source.id)!.exhausted);
  assert.equal(get(s, recipient.id)!.tempAttack, card(source.code).willpower);
  assert.equal(get(s, recipient.id)!.exhausted, false);
  reload(s);
});

test("two physical Lords of the Eldar plays stack only on the Noldor characters present when they resolve", () => {
  let s = fixture(2);
  const original = ally(s, A.jeweler, 1);
  s.discard = [A.lords, A.lords];
  for (let i = 0; i < 2; i++) {
    s = applyAction(s, {
      type: "PLAY_DISCARD",
      index: 0,
      payment: { [s.heroes[0].id]: 3 },
    });
    s = reload(s);
  }
  const later = ally(s, A.jeweler, 1);
  assert.deepEqual(Angmar.angmarStats(s, get(s, original.id)!), {
    will: 2,
    attack: 2,
    defense: 2,
  });
  assert.deepEqual(Angmar.angmarStats(s, later), {
    will: 0,
    attack: 0,
    defense: 0,
  });
  assert.equal(
    seatView(s, 0).deck.filter((code) => code === A.lords).length,
    2,
  );
  assert.equal(s.discard.length, 0);
  reload(s);
});

test("Lords of the Eldar's snapshot survives a lost Noldor trait but ends when that physical character leaves play", () => {
  let s = fixture();
  const target = ally(s, A.guardian),
    friend = attach(s, target, A.friend);
  s.discard = [A.lords];
  s = applyAction(s, {
    type: "PLAY_DISCARD",
    index: 0,
    payment: { [s.heroes[0].id]: 3 },
  });
  get(s, target.id)!.attachments = get(s, target.id)!.attachments.filter(
    (a) => a.id !== friend.id,
  );
  s.discard.push(friend.code);
  assert.equal(hasTrait(get(s, target.id)!, "Noldor"), false);
  assert.equal(Angmar.angmarStats(s, get(s, target.id)!).will, 1);
  returnAlly(s, get(s, target.id)!);
  const returning = s.hand.find((u) => u.code === target.code)!;
  assert.ok(returning);
  s.hand = s.hand.filter((u) => u.id !== returning.id);
  enterAlly(s, returning);
  assert.equal(Angmar.angmarStats(s, get(s, returning.id)!).will, 0);
  assert.ok(
    !s.used.some((k) => k.startsWith(`round:angmar:lords:${target.id}:`)),
  );
  reload(s);
});

test("framework resource collection gives a Sword-thain hero resources and Erestor's controller four draws", () => {
  const s = fixture(2),
    promoted = ally(s, A.lindir);
  attach(s, promoted, A.thain);
  Angmar.angmarSyncSwordThain(s);
  s.heroes[0] = make(s, A.erestor);
  s.startingHeroes = [A.erestor, A.dori, A.amarthiul];
  s.deck = Array(8).fill("01020");
  forOwner(s, 1, () => {
    s.deck = Array(8).fill("01021");
  });
  const before = promoted.resources;
  collectResources(s);
  flush(s);
  assert.equal(get(s, promoted.id)!.resources, before + 1);
  assert.equal(seatView(s, 0).hand.length, 4);
  assert.equal(seatView(s, 1).hand.length, 1);
  reload(s);
});

test("Favor replaces a remote player's real elimination and discards its physical card to the owner's pile", () => {
  const s = fixture(2);
  forOwner(s, 1, () => {
    s.threat = 53;
    s.threatAttachments = [
      {
        id: `a${s.nextId++}`,
        code: A.favor,
        owner: 0,
        controller: 1,
        exhausted: false,
      },
    ];
  });
  check(s);
  assert.equal(seatView(s, 1).threat, 45);
  assert.equal(seatView(s, 1).eliminated, false);
  assert.equal(seatView(s, 1).threatAttachments?.length, 0);
  assert.ok(seatView(s, 0).discard.includes(A.favor));
  assert.ok(!seatView(s, 1).discard.includes(A.favor));
  reload(s);
});

test("The Door is Closed cancels an entire real reveal, including Doomed, Surge and placement, for a remote player", () => {
  let s = fixture(2);
  const event = hand(s, A.door, 1),
    before = seatView(s, 1).heroes.map((h) => h.resources);
  s.victoryCards = ["01106"];
  s.encounterDeck = ["01099"];
  revealed(s, "01106");
  flush(s);
  s = select(s, `door-${event.id}`);
  assert.deepEqual(s.encounterDeck, ["01099"]);
  assert.ok(!s.staging.some((u) => u.code === "01106"));
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 20);
  assert.deepEqual(
    seatView(s, 1).heroes.map((h) => h.resources),
    before.map((n, i) => (i === 0 ? n - Number(card(A.door).cost) : n)),
  );
  assert.ok(seatView(s, 1).discard.includes(event.code));
  assert.ok(s.encounterDiscard.includes("01106"));
  reload(s);
});

test("Quick Ears cancels a real surged enemy, shuffles its physical code back and reveals exactly one replacement", () => {
  let s = fixture();
  const event = hand(s, A.ears),
    hero = s.heroes[2];
  s.encounterDeck = Array(20).fill("01099");
  s.seed = 1;
  revealed(s, "01081");
  flush(s);
  s = select(s, `ears-${event.id}-${hero.id}`);
  assert.ok(get(s, hero.id)!.exhausted);
  assert.equal(s.staging.length, 1);
  assert.equal(s.staging[0].code, "01099");
  assert.equal(s.encounterDeck.length, 20);
  assert.equal(s.encounterDeck.filter((c) => c === "01081").length, 1);
  assert.ok(!s.encounterDiscard.includes("01081"));
  assert.ok(s.discard.includes(event.code));
  reload(s);
});

test("continuing an Angmar cancellation window preserves Thalin's pre-keyword damage and offers Merry only once", () => {
  let s = fixture();
  s.heroes[0] = make(s, A.merry);
  s.heroes[1] = make(s, "01006");
  s.startingHeroes = s.heroes.map((h) => h.code);
  s.heroes[1].committed = true;
  const merry = s.heroes[0],
    event = hand(s, A.ears);
  s.encounterDeck = ["01099"];
  revealed(s, "01096");
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.code === event.code));
  s = select(s, "resolve");
  assert.match(s.choice!.title, /Merry/);
  s = responseStart(s);
  assert.equal(s.threat, 20 - card("01096").threat!);
  assert.ok(get(s, merry.id)!.exhausted);
  assert.equal(s.staging.find((u) => u.code === "01096")!.damage, 1);
  assert.ok(!s.choice?.title.includes("Merry"));
  assert.ok(s.hand.some((u) => u.id === event.id));
  reload(s);
});

test("The Eaves of Mirkwood suppresses both whole-card cancellation choices while the real encounter still resolves", () => {
  const s = fixture();
  hand(s, A.door);
  hand(s, A.ears);
  s.victoryCards = ["01096"];
  s.activeLocation = make(s, "02016");
  revealed(s, "01096");
  flush(s);
  assert.ok(
    !s.choice?.options.some((o) =>
      [A.door, A.ears].includes(o.code as typeof A.door),
    ),
  );
  assert.ok(s.staging.some((u) => u.code === "01096"));
  reload(s);
});

test("entry Responses require their printed condition or an effect that can change the game state", () => {
  const s = fixture();
  for (let i = 0; i < 3; i++) hand(s, "01020");
  for (const code of [A.weaver, A.lindir, A.healer]) {
    const u = ally(s, code);
    Angmar.angmarAllyEntered(s, u);
  }
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(!s.queue.some((e) => e.kind === "angmarEntryOffer"));
  reload(s);
});

test("Dori's real defender Response contributes defense to the attack's damage calculation", () => {
  let s = fixture();
  const defender = s.heroes[0],
    dori = s.heroes[1],
    enemy = make(s, "01096");
  s.engaged.push(enemy);
  s.encounterDeck = ["01099"];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  assert.match(s.choice!.title, /Dori/);
  s = responseStart(s);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.ok(get(s, dori.id)!.exhausted);
  assert.ok(get(s, defender.id)!.exhausted);
  reload(s);
});

test("a real qualifying combat kill offers Sword of Númenor and None Return once each", () => {
  let s = fixture();
  const hero = s.heroes[2],
    sword = attach(s, hero, A.sword),
    enemy = make(s, "01091"),
    event = hand(s, A.none);
  hero.tempAttack = 10;
  enemy.damage = 2;
  s.engaged.push(enemy);
  s.phase = "attack";
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [hero.id],
  });
  let swordOffers = 0,
    noneOffers = 0;
  for (let i = 0; s.choice; i++) {
    assert.ok(i < 5, "combat responses terminate");
    if (s.choice.title.includes("Sword of Númenor")) {
      swordOffers++;
      s = responseStart(s);
    } else if (s.choice.title.includes("None Return")) {
      noneOffers++;
      s = select(s, event.id);
    } else assert.fail(`Unexpected combat choice: ${s.choice.title}`);
  }
  assert.equal(swordOffers, 1);
  assert.equal(noneOffers, 1);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before + 1 - Number(card(A.none).cost),
  );
  assert.ok(
    get(s, hero.id)!.attachments.find((a) => a.id === sword.id)!.exhausted,
  );
  assert.equal(s.victoryCards?.filter((code) => code === enemy.code).length, 1);
  assert.equal(s.victoryCards?.filter((code) => code === event.code).length, 1);
  assert.ok(!s.encounterDiscard.includes(enemy.code));
  reload(s);
});

test("Merry uses an enemy's current threat, including Hunters from Mordor's constant clue bonus", () => {
  let s = fixture();
  s.heroes[0] = make(s, A.merry);
  s.startingHeroes = s.heroes.map((h) => h.code);
  s.staging.push(make(s, "02014"));
  const before = s.threat;
  Angmar.angmarRevealed(s, "02021");
  flush(s);
  s = responseStart(s);
  assert.equal(s.threat, before - card("02021").threat! - 2);
  reload(s);
});

test("a physically played Double Back requires all four progress before its defeated-stage Response", () => {
  let s = fixture(2);
  s = play(s, A.double);
  const quest = s.staging.find((q) => q.code === A.double)!;
  s.phase = "quest";
  s.sideQuestSelections = { shared: { id: quest.id, code: quest.code } };
  addQuestProgress(s, quest, 3);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(get(s, quest.id));
  addQuestProgress(s, quest, 1);
  flush(s);
  assert.equal(get(s, quest.id), undefined);
  assert.deepEqual(s.victoryCards, [A.double]);
  assert.equal(s.sideQuestSelections!.shared.defeated, true);
  s = responseStart(s);
  assert.equal(seatView(s, 0).threat, 15);
  assert.equal(seatView(s, 1).threat, 15);
  assert.equal(s.progress, 0);
  reload(s);
});

test("Delay the Enemy changes actual quest strength to attack while East Road Ranger's willpower bonus remains separate", () => {
  const s = fixture(),
    quest = make(s, A.delay),
    ranger = ally(s, A.ranger);
  s.phase = "quest";
  s.staging.push(quest);
  s.sideQuestSelections = { shared: { id: quest.id, code: quest.code } };
  ranger.committed = true;
  ranger.tempWill = 10;
  assert.equal(questStat(s), "attack");
  assert.equal(questWill(s), stats(s, ranger).attack);
  assert.ok(stats(s, ranger).will > questWill(s));
  reload(s);
});

test("Elven Jeweler's two discard choices initiate one Action for Deadmen's Gate", () => {
  let s = dikeFixture();
  s.activeLocation = make(s, D.gate);
  const jeweler = hand(s, A.jeweler),
    one = hand(s, "01020"),
    two = hand(s, "01021"),
    before = s.deck.length;
  s = ability(s, jeweler);
  s = select(s, one.id);
  s = select(s, two.id);
  assert.ok(s.allies.some((u) => u.id === jeweler.id));
  assert.equal(s.deck.length, before - 1);
  reload(s);
});

test("Arwen's Action and a remote-host Silver Harp Response each credit their initiating player to Deadmen's Gate", () => {
  let s = dikeFixture(2);
  s.heroes[0] = make(s, A.arwen);
  s.startingHeroes = s.heroes.map((h) => h.code);
  forOwner(s, 1, () => {
    s.heroes[0] = make(s, "01007");
    s.startingHeroes = s.heroes.map((h) => h.code);
  });
  s.activeLocation = make(s, D.gate);
  const arwen = s.heroes[0],
    remote = seatView(s, 1).heroes.find((h) => hasResourceIcon(h, "spirit"))!;
  attach(s, remote, A.harp, 0, 1);
  const cost = hand(s, "01020");
  cost.owner = 1;
  const decks = playerOrder(s).map((p) => seatView(s, p).deck.length);
  s = ability(s, arwen);
  s = select(s, cost.id);
  s = select(s, arwen.id);
  assert.equal(
    s.choice,
    null,
    "the other player's Harp cannot respond to Arwen's hand discard",
  );
  assert.equal(seatView(s, 0).deck.length, decks[0] - 1);
  let remoteCost!: Unit;
  forOwner(s, 1, () => {
    remoteCost = hand(s, "01021");
    remoteCost.owner = 0;
    discardHandCard(s, remoteCost.id);
  });
  flush(s);
  assert.match(s.choice!.title, /Silver Harp/);
  assert.equal(
    s.choice!.options.find((o) => o.id === "use")!.ability?.player,
    1,
  );
  s = responseStart(s);
  assert.equal(seatView(s, 0).deck.length, decks[0] - 1);
  assert.equal(seatView(s, 1).deck.length, decks[1] - 1);
  assert.ok(
    seatView(s, 1).hand.some((u) => u.id === remoteCost.id && u.owner === 0),
  );
  reload(s);
});

test("a borrowed Response's Heavy Curse preview uses the physical event owner's discard", () => {
  const s = dikeFixture(2),
    event = hand(s, A.door, 1),
    quest = mainQuestUnit(s)!;
  event.owner = 0;
  attachToQuest(s, quest.code, {
    id: `a${s.nextId++}`,
    code: D.curse,
    exhausted: false,
  });
  s.victoryCards = ["01096"];
  s.discard = [A.door];
  forOwner(s, 1, () => {
    s.heroes.forEach((h, i) => {
      h.resources = i === 0 ? 1 : 0;
      h.phaseResourceIcons = ["lore"];
    });
  });
  assert.ok(
    !Angmar.angmarRevealOptions(s, "01096").some(
      (o) => o.id === `door-${event.id}`,
    ),
  );
  s.discard = [];
  forOwner(s, 1, () => {
    s.discard = [A.door];
  });
  assert.ok(
    Angmar.angmarRevealOptions(s, "01096").some(
      (o) => o.id === `door-${event.id}`,
    ),
  );
  reload(s);
});

for (const cancellation of [
  "Erkenbrand",
  "A Burning Brand",
  "Dúnedain Watcher",
] as const)
  test(`${cancellation} cancels the shadow effect granted by Mountains of Angmar to a card with no printed shadow`, () => {
    let s = carnFixture();
    s.activeLocation = make(s, C.mountains);
    let optionId: string;
    let source: Unit | Attachment;
    const defender = s.heroes[0];
    if (cancellation === "Erkenbrand") {
      s.heroes[0] = make(s, "08137");
      source = s.heroes[0];
      optionId = `erkenbrand-${source.id}`;
    } else if (cancellation === "A Burning Brand") {
      s.heroes[0] = make(s, "01012");
      source = attach(s, s.heroes[0], "02033");
      optionId = `brand-${source.id}`;
    } else {
      source = ally(s, "02096");
      optionId = `watcher-${source.id}`;
    }
    s.heroes[0].tempDefense = 10;
    s.startingHeroes = s.heroes.map((h) => h.code);
    const enemy = carnEnemy(s);
    enemy.shadows = ["01099"];
    assert.equal(!!card("01099").shadow, false);
    s = carnDefend(
      s,
      enemy,
      cancellation === "Dúnedain Watcher" ? defender : s.heroes[0],
    );
    assert.ok(s.choice!.options.some((o) => o.id === optionId));
    s = select(s, optionId);
    assert.equal(s.threat, 20);
    if (cancellation === "Erkenbrand")
      assert.equal(get(s, source.id)!.damage, 1);
    if (cancellation === "A Burning Brand")
      assert.ok(
        get(s, s.heroes[0].id)!.attachments.find((a) => a.id === source.id)!
          .exhausted,
      );
    if (cancellation === "Dúnedain Watcher")
      assert.ok(s.discard.includes(source.code));
    reload(s);
  });
