import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import { availableAbilities, canPlay, playTargets } from "../src/game/engine";
import {
  canPay,
  enemyAttackPrevented,
  engagementCost,
  fx,
  get,
  make,
  playCost,
  stats,
  threatOf,
} from "../src/game/core";
import {
  charactersCommitted,
  damage,
  destroy,
  discardCharacter,
  discardLocation,
  enterAlly,
  phaseEnd,
  returnAlly,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  effectiveKeyword,
  hasResourceIcon,
  questExhausts,
} from "../src/game/expansion-passives";
import { isHero } from "../src/game/card-types";
import * as E from "../src/game/ered-final-player";
import * as S from "../src/game/ered-final-player-support";
import { ERED_FINAL_PLAYER as P } from "../src/game/ered-final-player-support";
import { ERED_FINAL_PLAYER_ART } from "./ered-final-player-art";
import {
  act,
  ability,
  ally,
  attach,
  fixture,
  hand,
  pick,
  play,
  reload,
} from "./ered-final-player-fixtures";
import type { GameState, Effect } from "../src/game/types";
import { base as roamFixture } from "./roam-rhovanion-fixtures";
import { ROAM_RHOVANION as R } from "../src/game/roam-rhovanion-support";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import { playEventFromDiscardEffect } from "../src/game/actions";

function response(s: GameState) {
  assert.equal(
    s.choice?.options.find((o) => o.id === "use")?.ability?.type,
    "response",
    s.choice?.title,
  );
  return pick(s, "use");
}
function effect(s: GameState, e: Effect) {
  assert.equal(E.handleEredFinalPlayerEffect(s, e), true, e.kind);
  flush(s);
  return s;
}
function actualPlay(
  s: GameState,
  code: string,
  target?: string,
  payment?: Record<string, number>,
) {
  const u = hand(s, code);
  if (s.table) s.table.turn = activeSeat(s);
  return act(s, { type: "PLAY", id: u.id, target, payment });
}

test("twenty source designs retain their immutable records and only nineteen add native definitions", () => {
  const source = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.equal(S.ERED_FINAL_PLAYER_CARDS.length, 20);
  for (const c of S.ERED_FINAL_PLAYER_CARDS) {
    const original = source.find((x: { code: string }) => x.code === c.code);
    assert.deepEqual({ ...c, imagesrc: original.imagesrc }, original, c.code);
    assert.equal(
      playerCards.filter((x) => x.code === c.code).length,
      1,
      c.code,
    );
    assert.ok(SCRIPTED.has(c.code));
  }
  assert.equal(
    S.ERED_FINAL_PLAYER_CARDS.filter((c) => c.code !== P.armor).length,
    19,
  );
  assert.equal(
    card(P.radagast).text,
    S.ERED_FINAL_PLAYER_CARDS.find((c) => c.code === P.radagast)!.text,
  );
  assert.match(card(P.reforged).text!, /Item/);
  assert.equal(
    (card(P.shirt).text!.match(/Guarded \(location\)/g) ?? []).length,
    1,
  );
  assert.match(card(P.raven).text!, /or have attachments/);
});
test("twenty original art files preserve publisher scan identities, byte counts and SHA256 pins", () => {
  assert.equal(ERED_FINAL_PLAYER_ART.length, 20);
  for (const a of ERED_FINAL_PLAYER_ART) {
    const bytes = fs.readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    assert.match(a.source, new RegExp(`${a.octgnid}\\.jpg$`));
  }
});
test("Radagast conditionally pays printed extra spheres only for Creature allies", () => {
  const s = fixture(),
    rad = s.heroes[1];
  s.heroes.forEach((h) => {
    delete h.phaseResourceIcons;
    h.resources = h === rad ? 4 : 0;
  });
  assert.equal(hasResourceIcon(rad, "tactics"), false);
  assert.ok(
    canPay(s, card("02098")),
    "Creature Eagle can use Radagast's Lore resources as Tactics",
  );
  assert.equal(
    canPay(s, card("10004")),
    false,
    "non-Creature Tactics ally cannot",
  );
  assert.equal(
    S.eredFinalPlayerResourceMatch(s, rad, {
      ...card("02098"),
      sphere_code: "baggins",
    }),
    false,
    "errata does not add the Baggins icon",
  );
  assert.equal(
    hasResourceIcon(rad, "tactics"),
    false,
    "no icon persists after preview",
  );
  rad.blanked = true;
  assert.equal(S.eredFinalPlayerResourceMatch(s, rad, card("02098")), false);
});
test("a real Creature play pays Radagast and offers his optional round quest-exhaustion response", () => {
  let s = fixture();
  const rad = s.heroes[1],
    eagle = hand(s, "02098");
  s.heroes.forEach((h) => {
    delete h.phaseResourceIcons;
    h.resources = h.id === rad.id ? 4 : 0;
  });
  s = play(s, eagle.id);
  assert.match(s.choice!.title, /Radagast/);
  s = response(s);
  assert.equal(get(s, rad.id)!.resources, 3);
  assert.equal(questExhausts(s, get(s, rad.id)!), false);
  get(s, rad.id)!.blanked = true;
  assert.equal(
    questExhausts(s, get(s, rad.id)!),
    false,
    "lasting response survives source blanking",
  );
  reload(s);
});
test("putting a Creature into play does not initiate Radagast's after-play response", () => {
  const s = fixture();
  enterAlly(s, make(s, "02098"));
  flush(s);
  assert.ok(!s.choice?.title.includes("Radagast"));
  assert.equal(questExhausts(s, s.heroes[1]), true);
});
test("Bilbo captures current enemy threat, retains the phase bonus and damages a guarded enemy after success", () => {
  let s = fixture();
  const bilbo = s.heroes[0],
    enemy = make(s, "01096"),
    guarded = hand(s, P.sting);
  enemy.attachments.push({
    id: guarded.id,
    code: guarded.code,
    owner: 0,
    exhausted: false,
  });
  s.hand = [];
  s.staging.push(enemy);
  s.phase = "quest";
  bilbo.committed = true;
  charactersCommitted(s, [bilbo], [bilbo.id]);
  flush(s);
  s = response(s);
  s = pick(s, enemy.id);
  const original = threatOf(s, get(s, enemy.id)!);
  get(s, enemy.id)!.tempThreat = 4;
  assert.equal(get(s, bilbo.id)!.tempWill, original);
  E.eredFinalPlayerQuestSucceeded(s);
  flush(s);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(s.used.filter((k) => k.includes(":bilbo:")).length, 0);
  reload(s);
});
test("Bilbo can recommit for two separate delayed damage instances and the effects survive his departure", () => {
  let s = fixture();
  const bilbo = s.heroes[0],
    enemy = make(s, "01091");
  s.staging.push(enemy);
  s.phase = "quest";
  bilbo.committed = true;
  for (let i = 0; i < 2; i++) {
    E.eredFinalPlayerCharactersCommitted(s, [get(s, bilbo.id)!]);
    flush(s);
    s = response(s);
    s = pick(s, enemy.id);
  }
  assert.equal(get(s, bilbo.id)!.tempWill, 2 * card(enemy.code).threat!);
  destroy(s, get(s, bilbo.id)!);
  flush(s);
  E.eredFinalPlayerQuestSucceeded(s);
  flush(s);
  assert.equal(get(s, enemy.id)!.damage, 2);
  reload(s);
});
test("Bilbo rejects immune staging enemies and never damages an enemy after it has left play", () => {
  const s = fixture(),
    bilbo = s.heroes[0],
    enemy = make(s, "01096");
  s.phase = "quest";
  bilbo.committed = true;
  enemy.immuneToPlayerEffects = true;
  s.staging.push(enemy);
  E.eredFinalPlayerCharactersCommitted(s, [bilbo]);
  flush(s);
  assert.equal(s.choice, null);
  enemy.immuneToPlayerEffects = false;
  s.used.push(`phase:ered-final:bilbo:${bilbo.id}:${enemy.id}:123`);
  discardCharacter(s, enemy);
  flush(s);
  assert.ok(!s.used.some((k) => k.includes(":bilbo:")));
  E.eredFinalPlayerQuestSucceeded(s);
  flush(s);
  reload(s);
});
test("Greenwood Defender's actual entry response lasts the round and is optional", () => {
  let s = fixture();
  const u = make(s, P.defender);
  enterAlly(s, u);
  flush(s);
  s = response(s);
  assert.equal(S.eredFinalPlayerNoDefenseExhaust(s, get(s, u.id)!), true);
  get(s, u.id)!.blanked = true;
  assert.equal(S.eredFinalPlayerNoDefenseExhaust(s, get(s, u.id)!), true);
  E.eredFinalPlayerUnitLeaving(s, get(s, u.id)!);
  assert.equal(S.eredFinalPlayerNoDefenseExhaust(s, get(s, u.id)!), false);
  reload(s);
});
test("Elf Guide returns its controlled Silvan as a cost and grants a resource to another player's hero", () => {
  let s = fixture(2),
    silvan = ally(s, "10089"),
    target = seatView(s, 1).heroes[0],
    before = target.resources;
  s = actualPlay(s, P.guide, silvan.id);
  assert.equal(get(s, silvan.id), undefined);
  assert.match(s.choice!.title, /Elf Guide/);
  s = pick(s, target.id);
  assert.equal(get(s, target.id)!.resources, before + 1);
  assert.ok(seatView(s, 0).hand.some((u) => u.code === silvan.code));
  assert.ok(seatView(s, 0).discard.includes(P.guide));
  reload(s);
});
test("Elf Guide cannot use another player's Silvan as an exhaustion-free return cost", () => {
  const s = fixture(2),
    foreign = ally(s, "10089", 1),
    u = hand(s, P.guide);
  assert.ok(!playTargets(s, u).some((x) => x.id === foreign.id));
  assert.match(canPlay(s, u)!, /Silvan/);
});
test("Drinking Song shuffles the remaining physical hand and draws its count plus one for a unique Hobbit", () => {
  let s = fixture(2);
  const borrowed = hand(s, "01020");
  borrowed.owner = 1;
  hand(s, "01021");
  s.deck = Array(10).fill("01022");
  s = actualPlay(s, P.song);
  assert.equal(s.hand.length, 3);
  assert.equal(s.deck.length, 9);
  assert.ok(s.discard.includes(P.song));
  assert.equal(s.hand.filter((u) => u.code === P.song).length, 0);
  reload(s);
});
test("Drinking Song does not grant the additional draw without a unique Hobbit character", () => {
  let s = fixture();
  s.heroes[0] = make(s, "01007");
  s.startingHeroes = s.heroes.map((h) => h.code);
  hand(s, "01020");
  s.deck = Array(10).fill("01022");
  s = actualPlay(s, P.song);
  assert.equal(s.hand.length, 1);
  assert.equal(s.deck.length, 10);
  reload(s);
});
test("The Shirefolk checks every current hero including a promoted non-Hobbit", () => {
  let s = fixture();
  const u = hand(s, P.shirefolk);
  assert.match(canPlay(s, u)!, /Hobbit/);
  s.heroes = s.heroes.slice(0, 1);
  s.startingHeroes = s.heroes.map((h) => h.code);
  const lindir = ally(s, "10120");
  s = actualPlay(s, "10149", lindir.id);
  assert.equal(isHero(get(s, lindir.id)!), true);
  assert.match(
    canPlay(
      s,
      s.hand.find((h) => h.id === u.id)!,
    )!,
    /Hobbit/,
  );
  destroy(s, get(s, lindir.id)!);
  flush(s);
  let played = play(s, u.id);
  assert.equal(played.threat, 16);
  reload(played);
});
test("Bywater Shirriff reads its own controller's modified threat and strictly higher engagement cost", () => {
  const s = fixture(2),
    u = ally(s, P.shirriff, 1),
    enemy = make(s, "01096");
  forOwner(s, 1, () => s.engaged.push(enemy));
  forOwner(s, 1, () => {
    s.threat = engagementCost(s, enemy);
  });
  assert.equal(S.eredFinalPlayerStats(s, u).attack, 0);
  forOwner(s, 1, () => {
    s.threat--;
  });
  assert.equal(S.eredFinalPlayerStats(s, u).attack, 1);
  forOwner(s, 1, () => {
    s.threat = 45;
    s.used.push("phase:stormcaller:vanish");
  });
  assert.equal(S.eredFinalPlayerStats(s, u).attack, 1);
  u.blanked = true;
  assert.equal(S.eredFinalPlayerStats(s, u).attack, 0);
});
test("Gaffer Gamgee returns as a Combat Action and prevents only its initiating player's attacks for the round", () => {
  let s = fixture(2);
  s.phase = "defense";
  const gaffer = ally(s, P.gaffer),
    enemy = make(s, "01096");
  s.staging.push(enemy);
  s = ability(s, gaffer.id);
  s = pick(s, enemy.id);
  assert.equal(get(s, gaffer.id), undefined);
  assert.ok(s.hand.some((u) => u.code === P.gaffer));
  assert.equal(enemyAttackPrevented(s, get(s, enemy.id)!, 0), true);
  assert.equal(enemyAttackPrevented(s, get(s, enemy.id)!, 1), false);
  s.threat = 49;
  assert.equal(
    enemyAttackPrevented(s, get(s, enemy.id)!, 0),
    true,
    "restriction is a lasting snapshot",
  );
  reload(s);
});
test("Gaffer enforces Combat timing, strict threat comparison and control while allowing an exhausted source", () => {
  const s = fixture(2),
    g = ally(s, P.gaffer),
    enemy = make(s, "01096");
  s.staging.push(enemy);
  assert.ok(E.eredFinalPlayerAbilityProblem(s, g));
  s.phase = "attack";
  s.threat = engagementCost(s, enemy);
  assert.ok(E.eredFinalPlayerAbilityProblem(s, g));
  s.threat = 20;
  g.exhausted = true;
  assert.equal(E.eredFinalPlayerAbilityProblem(s, g), null);
  enemy.immuneToPlayerEffects = true;
  assert.ok(E.eredFinalPlayerAbilityProblem(s, g));
  enemy.immuneToPlayerEffects = false;
  selectSeat(s, 1);
  assert.ok(E.eredFinalPlayerAbilityProblem(s, g));
});

test("Bilbo deals two damage when a Hobgoblin guards its player card in Roam's separate custody zone", () => {
  let s = roamFixture();
  s.heroes[0] = make(s, P.bilbo);
  s.startingHeroes = s.heroes.map((h) => h.code);
  const bilbo = s.heroes[0],
    hobgoblin = make(s, R.hobgoblin),
    guarded = make(s, "01020");
  s.roamRhovanion!.guardedPlayerCards.push({
    guardId: hobgoblin.id,
    player: 0,
    card: guarded,
  });
  s.staging.push(hobgoblin);
  s.phase = "quest";
  bilbo.committed = true;
  E.eredFinalPlayerCharactersCommitted(s, [bilbo]);
  flush(s);
  s = response(s);
  s = pick(s, hobgoblin.id);
  assert.equal(get(s, hobgoblin.id)!.attachments.length, 0);
  assert.equal(E.eredFinalEnemyGuardingCard(s, get(s, hobgoblin.id)!), true);
  E.eredFinalPlayerQuestSucceeded(s);
  flush(s);
  assert.equal(get(s, hobgoblin.id)!.damage, 2);
  reload(s);
});
test("Sting's guarded enemy search discards locations without revealing them and claims the same physical attachment", () => {
  let s = fixture();
  s.encounterDeck = ["01099", "01103"];
  const sting = hand(s, P.sting),
    bilbo = s.heroes[0],
    before = s.threat;
  s = play(s, sting.id);
  const guard = s.staging.find((u) => u.code === "01103")!;
  assert.ok(guard);
  assert.equal(
    s.threat,
    before,
    "Doomed does not resolve on a guard put into play",
  );
  assert.ok(s.encounterDiscard.includes("01099"));
  assert.equal(guard.attachments.find((a) => a.code === P.sting)!.id, sting.id);
  assert.equal(
    stats(s, guard).attack,
    card(guard.code).attack,
    "the guarded weapon does not boost its enemy",
  );
  destroy(s, guard);
  flush(s);
  s = pick(s, bilbo.id);
  const a = get(s, bilbo.id)!.attachments.find((a) => a.code === P.sting)!;
  assert.equal(a.id, sting.id);
  assert.equal(a.owner, 0);
  assert.equal(stats(s, get(s, bilbo.id)!).attack, card(P.bilbo).attack! + 1);
  assert.equal(stats(s, get(s, bilbo.id)!).defense, card(P.bilbo).defense! + 1);
  reload(s);
});
test("Mithril Shirt acquires a location-only guard and can be claimed by any hero without using a Restricted slot", () => {
  let s = fixture();
  s.encounterDeck = ["01096", "01099"];
  const shirt = hand(s, P.shirt),
    rad = s.heroes[1];
  s = play(s, shirt.id);
  const guard = s.staging.find((u) => u.code === "01099")!;
  assert.ok(guard);
  assert.ok(s.encounterDiscard.includes("01096"));
  discardLocation(s, guard);
  flush(s);
  s = pick(s, rad.id);
  assert.equal(
    get(s, rad.id)!.attachments.find((a) => a.code === P.shirt)!.id,
    shirt.id,
  );
  assert.ok(!/Restricted/.test(card(P.shirt).text!));
  reload(s);
});
test("Sting is claimed after exhausting a location-only encounter pool without a viable enemy guard", () => {
  let s = fixture();
  s.encounterDeck = ["01099"];
  s.encounterDiscard = ["01100"];
  const sting = hand(s, P.sting),
    bilbo = s.heroes[0];
  s = play(s, sting.id);
  assert.ok(s.choice?.options.some((o) => o.id === bilbo.id));
  assert.equal(
    s.staging.some((u) => u.code === "01099" || u.code === "01100"),
    false,
  );
  s = pick(s, bilbo.id);
  const claimed = get(s, bilbo.id)!.attachments.find(
    (a) => a.code === P.sting,
  )!;
  assert.equal(claimed.id, sting.id);
  assert.equal(claimed.owner, 0);
  assert.deepEqual([...s.encounterDeck, ...s.encounterDiscard].sort(), [
    "01099",
    "01100",
  ]);
  reload(s);
});
test("The King's Return searches an actual Guarded attachment and still acquires its typed guard on entry", () => {
  let s = fixture();
  s.deck = [P.shirt, "01020"];
  s.encounterDeck = ["01096", "01099"];
  s = actualPlay(s, P.kingsReturn);
  s = pick(s, "card-0");
  assert.equal(s.deck.length, 1);
  assert.ok(
    s.staging.some(
      (u) =>
        u.code === "01099" && u.attachments.some((a) => a.code === P.shirt),
    ),
  );
  assert.ok(
    !allHeroes(s).some((u) => u.attachments.some((a) => a.code === P.shirt)),
  );
  assert.ok(s.encounterDiscard.includes("01096"));
  assert.ok(s.discard.includes(P.kingsReturn));
  reload(s);
});
test("Armor of Erebor reuses its single canonical defense, Sentinel, trait and Restricted rules", () => {
  let s = fixture();
  const dwarf = ally(s, P.toymaker),
    before = stats(s, dwarf).defense;
  s = actualPlay(s, P.armor, dwarf.id);
  assert.equal(stats(s, get(s, dwarf.id)!).defense, before + 1);
  assert.equal(effectiveKeyword(get(s, dwarf.id)!, "Sentinel"), true);
  const other = ally(s, "10004");
  assert.ok(!playTargets(s, make(s, P.armor)).some((u) => u.id === other.id));
  reload(s);
});
test("Erebor Toymaker's real hand-play response discounts the group's next attachment, including another player's", () => {
  let s = fixture(2);
  s = actualPlay(s, P.toymaker);
  s = response(s);
  const target = seatView(s, 1).heroes[0],
    before = seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0);
  forOwner(s, 1, () => {
    assert.equal(playCost(s, card("10149")), 2);
  });
  s = act(s, { type: "SELECT_SEAT", seat: 1 });
  const armorTarget = ally(s, P.toymaker);
  s = actualPlay(s, P.armor, armorTarget.id);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    before,
    "printed2 attachment is reduced to0",
  );
  for (const p of playerOrder(s))
    forOwner(s, p, () => assert.equal(playCost(s, card("10149")), 4));
  assert.ok(get(s, target.id));
  reload(s);
});
test("putting Toymaker into play does not grant its hand-play discount; declining its Response also grants none", () => {
  let s = fixture();
  const u = make(s, P.toymaker);
  enterAlly(s, u);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(playCost(s, card(P.armor)), 2);
  s = actualPlay(s, P.toymaker);
  s = pick(s, "skip");
  assert.equal(playCost(s, card(P.armor)), 2);
  reload(s);
});
test("Mithril Shirt prevents one point once per assignment, remains ready and can respond to a later assignment", () => {
  let s = fixture();
  const hero = s.heroes[1],
    shirt = attach(s, hero, P.shirt);
  damage(s, hero.id, 3);
  flush(s);
  s = pick(s, shirt.id);
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.equal(s.choice, null);
  assert.equal(
    get(s, hero.id)!.attachments.find((a) => a.id === shirt.id)!.exhausted,
    false,
  );
  damage(s, hero.id, 1);
  flush(s);
  s = pick(s, shirt.id);
  assert.equal(get(s, hero.id)!.damage, 2);
  reload(s);
});
test("Loyal Hound cancels a chosen one or two damage before a controlled hero is destroyed and pays discard as cost", () => {
  let s = fixture(2);
  const hero = s.heroes[0],
    hound = ally(s, P.hound);
  hero.damage = 1;
  damage(s, hero.id, 2);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `${hound.id}-1`));
  assert.ok(s.choice!.options.some((o) => o.id === `${hound.id}-2`));
  s = pick(s, `${hound.id}-2`);
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(get(s, hound.id), undefined);
  assert.ok(seatView(s, 0).discard.includes(P.hound));
  reload(s);
});
test("a remote Loyal Hound cannot protect another player's hero and neither prevention cancels a damage cost", () => {
  const s = fixture(2),
    hero = s.heroes[1];
  ally(s, P.hound, 1);
  attach(s, hero, P.shirt);
  damage(s, hero.id, 1, { cost: true });
  flush(s);
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(s.choice, null);
  hero.attachments = [];
  damage(s, hero.id, 1);
  flush(s);
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.equal(s.choice, null);
  reload(s);
});
test("declining Shirt and Hound prevention resumes a single damage event without looping", () => {
  let s = fixture();
  const hero = s.heroes[1];
  attach(s, hero, P.shirt);
  ally(s, P.hound);
  damage(s, hero.id, 1);
  flush(s);
  s = pick(s, "skip");
  assert.equal(get(s, hero.id)!.damage, 1);
  assert.equal(s.choice, null);
  reload(s);
});
test("Messenger Raven and Loyal Hound cannot have attachments; Raven also cannot attack or defend", () => {
  const s = fixture(),
    raven = ally(s, P.raven),
    hound = ally(s, P.hound),
    armor = make(s, P.shield);
  assert.ok(
    !playTargets(s, armor).some((u) => [raven.id, hound.id].includes(u.id)),
  );
  assert.equal(S.eredFinalPlayerCannotFight(raven), true);
  raven.blanked = true;
  assert.equal(S.eredFinalPlayerCannotFight(raven), false);
});
test("Messenger Raven names a type before inspecting another player's top card and preserves physical owner on a match", () => {
  let s = fixture(2);
  s.phase = "refresh";
  const raven = ally(s, P.raven);
  forOwner(s, 1, () => {
    s.deck = ["01013", "01021"];
  });
  s = ability(s, raven.id);
  assert.equal(get(s, raven.id), undefined);
  s = pick(s, "ally");
  s = pick(s, "player-1");
  assert.equal(s.choice!.options[0].code, "01013");
  s = pick(s, "continue");
  assert.ok(
    seatView(s, 1).hand.some((u) => u.code === "01013" && u.owner === 1),
  );
  assert.ok(seatView(s, 0).hand.some((u) => u.code === P.raven));
  reload(s);
});
test("Messenger Raven discards a mismatched top card instead of drawing it and obeys Refresh timing", () => {
  let s = fixture();
  const raven = ally(s, P.raven);
  s.deck = ["01013", "01021"];
  assert.ok(E.eredFinalPlayerAbilityProblem(s, raven));
  s.phase = "refresh";
  s = ability(s, raven.id);
  s = pick(s, "event");
  s = pick(s, "player-0");
  s = pick(s, "continue");
  assert.ok(s.discard.includes("01013"));
  assert.ok(!s.hand.some((u) => u.code === "01013"));
  reload(s);
});

test("Radagast's Staff attaches to either native Radagast, requires active ownership and exhausts once for a mode", () => {
  let s = fixture(2);
  const rad = s.heroes[1];
  s = actualPlay(s, P.staff, rad.id);
  const staff = get(s, rad.id)!.attachments.find((a) => a.code === P.staff)!;
  s = ability(s, rad.id, staff.id);
  assert.equal(
    get(s, rad.id)!.attachments.find((a) => a.id === staff.id)!.exhausted,
    true,
  );
  s = pick(s, "discount");
  assert.ok(E.eredFinalPlayerAbilityProblem(s, get(s, rad.id)!, staff.id));
  selectSeat(s, 1);
  assert.ok(E.eredFinalPlayerAbilityProblem(s, get(s, rad.id)!, staff.id));
  const other = fixture();
  other.heroes[1] = make(other, "01012");
  other.startingHeroes = other.heroes.map((h) => h.code);
  const allyRad = ally(other, "02059");
  assert.ok(
    playTargets(other, make(other, P.staff)).some((u) => u.id === allyRad.id),
  );
  assert.ok(
    !playTargets(other, make(other, P.staff)).some((u) => u.code === P.bilbo),
  );
  reload(s);
});
test("Radagast's Staff discount applies only to its player's next Creature ally and survives other plays", () => {
  let s = fixture(2);
  const rad = s.heroes[1],
    staff = attach(s, rad, P.staff);
  s = ability(s, rad.id, staff.id);
  s = pick(s, "discount");
  assert.equal(playCost(s, card("02098")), 0);
  forOwner(s, 1, () => assert.equal(playCost(s, card("02098")), 1));
  s = actualPlay(s, "10004");
  assert.equal(playCost(s, card("02098")), 0);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = actualPlay(s, "02098");
  s = response(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before,
  );
  assert.equal(playCost(s, card("02098")), 1);
  reload(s);
});
test("Radagast's Staff readies another player's Creature ally without readying an ineligible character", () => {
  let s = fixture(2);
  const rad = s.heroes[1],
    staff = attach(s, rad, P.staff),
    eagle = ally(s, "02098", 1),
    other = ally(s, "10004", 1);
  eagle.exhausted = true;
  other.exhausted = true;
  s = ability(s, rad.id, staff.id);
  s = pick(s, "ready");
  assert.ok(!s.choice!.options.some((o) => o.id === other.id));
  s = pick(s, eagle.id);
  assert.equal(get(s, eagle.id)!.exhausted, false);
  assert.equal(get(s, other.id)!.exhausted, true);
  reload(s);
});
test("Radagast's Staff returns only a non-unique Creature physically engaged with its controller", () => {
  let s = fixture(2);
  const rad = s.heroes[1],
    staff = attach(s, rad, P.staff),
    spider = make(s, "01096"),
    foreign = make(s, "01096");
  s.engaged.push(spider);
  forOwner(s, 1, () => s.engaged.push(foreign));
  s = ability(s, rad.id, staff.id);
  s = pick(s, "return");
  assert.ok(!s.choice!.options.some((o) => o.id === foreign.id));
  s = pick(s, spider.id);
  assert.ok(s.staging.some((u) => u.id === spider.id));
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === foreign.id));
  reload(s);
});
test("blanked or facedown Staff has no usable Action and its unspent discount expires at phase end", () => {
  let s = fixture();
  const rad = s.heroes[1],
    staff = attach(s, rad, P.staff);
  staff.blanked = true;
  assert.ok(E.eredFinalPlayerAbilityProblem(s, rad, staff.id));
  staff.blanked = false;
  staff.facedown = true;
  assert.ok(E.eredFinalPlayerAbilityProblem(s, rad, staff.id));
  delete staff.facedown;
  s = ability(s, rad.id, staff.id);
  s = pick(s, "discount");
  assert.equal(playCost(s, card("02098")), 0);
  phaseEnd(s);
  flush(s);
  assert.equal(playCost(s, card("02098")), 1);
  reload(s);
});
test("The Great Hunt requires three real hero pools and discards a non-unique staging enemy during combat", () => {
  let s = fixture();
  s.phase = "attack";
  const enemy = make(s, "01096");
  s.staging.push(enemy);
  s.heroes.forEach((h, i) => {
    h.resources = i === 0 ? 3 : 0;
  });
  assert.equal(canPay(s, card(P.hunt)), false);
  s.heroes.forEach((h) => {
    h.resources = 1;
  });
  const payment = Object.fromEntries(s.heroes.map((h) => [h.id, 1]));
  s = actualPlay(s, P.hunt, enemy.id, payment);
  assert.equal(get(s, enemy.id), undefined);
  assert.ok(s.encounterDiscard.includes(enemy.code));
  assert.ok(s.discard.includes(P.hunt));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    0,
  );
  reload(s);
});
test("The Great Hunt discards a Victory enemy without awarding its defeat-only victory points", () => {
  let s = fixture();
  s.phase = "attack";
  const troll = make(s, "01082");
  s.staging.push(troll);
  const payment = Object.fromEntries(s.heroes.map((h) => [h.id, 1]));
  s = actualPlay(s, P.hunt, troll.id, payment);
  assert.ok(s.encounterDiscard.includes(troll.code));
  assert.ok(!s.victoryCards?.includes(troll.code));
  assert.equal(s.victory, 0);
  reload(s);
});
test("The Great Hunt excludes engaged and immune enemies and rejects a Planning Action", () => {
  const s = fixture(),
    enemy = make(s, "01096"),
    immune = make(s, "01091"),
    u = hand(s, P.hunt);
  immune.immuneToPlayerEffects = true;
  s.engaged.push(enemy);
  s.staging.push(immune);
  assert.ok(!E.eredFinalPlayerPlayTargets(s, P.hunt)!.length);
  assert.match(canPlay(s, u)!, /Combat|combat/);
});
test("Gwaihir's Debt checks two different unique controlled characters, searches five and returns the physical ally at round end", () => {
  let s = fixture();
  const meneldor = ally(s, "19031");
  assert.ok(card(meneldor.code).is_unique);
  s.deck = ["02053", "01020", "01021", "01022", "01023", "02098"];
  s = actualPlay(s, P.debt);
  assert.ok(!s.choice!.options.some((o) => o.id === "card-5"));
  s = pick(s, "card-0");
  const landroval = s.allies.find((u) => u.code === "02053")!;
  assert.ok(landroval);
  assert.ok(
    !s.choice?.title.includes("Radagast"),
    "put-into-play is not a Creature play",
  );
  for (const e of E.eredFinalPlayerRoundEnd(s)) handle(s, e);
  flush(s);
  assert.equal(get(s, landroval.id), undefined);
  assert.ok(s.hand.some((u) => u.code === "02053"));
  assert.ok(get(s, meneldor.id));
  reload(s);
});
test("Gwaihir's Debt cannot use another player's unique Eagle for its play-only condition", () => {
  const s = fixture(2),
    u = hand(s, P.debt),
    eagle = ally(s, "19031", 1);
  assert.match(canPlay(s, u)!, /Istari|Eagle/);
  forOwner(s, 1, () => {
    s.allies = s.allies.filter((a) => a.id !== eagle.id);
  });
  s.allies.push(eagle);
  assert.equal(E.eredFinalPlayerPlayProblem(s, u), null);
  reload(s);
});
test("a Gwaihir's Debt ally that leaves and returns by another effect is a new instance without the old return", () => {
  let s = fixture();
  ally(s, "19031");
  s.deck = ["02053", "01020"];
  s = actualPlay(s, P.debt);
  s = pick(s, "card-0");
  const u = s.allies.find((u) => u.code === "02053")!;
  returnAlly(s, u);
  const returned = s.hand.find((u) => u.code === "02053")!;
  s.hand = s.hand.filter((u) => u.id !== returned.id);
  enterAlly(s, returned);
  flush(s);
  assert.equal(E.eredFinalPlayerRoundEnd(s).length, 0);
  reload(s);
});
test("Reforged permits X zero and plays an actual discarded Item attachment without paying it a second time", () => {
  let s = fixture();
  s.discard = [P.shield];
  const hero = s.heroes[0],
    before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = actualPlay(s, P.reforged, "discard-0");
  assert.match(s.choice!.title, /Reforged/);
  s = pick(s, hero.id);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === P.shield));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before,
  );
  assert.deepEqual(s.discard, [P.reforged]);
  reload(s);
});
test("Reforged pays chosen X in Spirit and preserves ownership when playing another player's Lore Item", () => {
  let s = fixture(2);
  s.heroes = ["01007", "01008", "01009"].map((code) => make(s, code));
  s.startingHeroes = s.heroes.map((h) => h.code);
  s.heroes.forEach((h) => (h.resources = 5));
  const target = ally(s, P.toymaker),
    before = s.heroes.reduce((n, h) => n + h.resources, 0);
  forOwner(s, 1, () => {
    s.discard = [P.armor];
  });
  s = actualPlay(s, P.reforged, "discard-1-0");
  s = pick(s, target.id);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  const armor = get(s, target.id)!.attachments.find((a) => a.code === P.armor)!;
  assert.equal(armor.owner, 1);
  assert.equal(seatView(s, 1).discard.length, 0);
  assert.ok(seatView(s, 0).discard.includes(P.reforged));
  reload(s);
});
test("Reforged obeys its confirmed Item erratum and The Power of Angmar's discard restriction", () => {
  const s = fixture(),
    u = hand(s, P.reforged);
  s.discard = ["01026", P.shield];
  assert.ok(
    !playTargets(s, u).some((x) => x.id === "discard-0"),
    "Steward of Gondor is not an Item",
  );
  assert.ok(playTargets(s, u).some((x) => x.id === "discard-1"));
  s.staging.push(make(s, D.power));
  assert.ok(!playTargets(s, u).length);
  assert.ok(canPlay(s, u));
});
test("Reforged from a trusted discard-play effect follows the selected Item after removing its own earlier discard index", () => {
  let s = fixture();
  s.discard = [P.reforged, P.shield];
  const hero = s.heroes[0];
  playEventFromDiscardEffect(s, 0, { target: "discard-1", payment: {} });
  flush(s);
  s = pick(s, hero.id);
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.code === P.shield));
  assert.deepEqual(s.discard, [P.reforged]);
  reload(s);
});

for (const players of [1, 2, 3, 4])
  test(`all pending Hound choices and ownership survive JSON reload with ${players} players`, () => {
    let s = fixture(players);
    const player = players - 1;
    let target!: string, hound!: string;
    forOwner(s, player, () => {
      target = s.heroes[0].id;
      hound = ally(s, P.hound).id;
    });
    damage(s, target, 1);
    flush(s);
    s = pick(s, `${hound}-1`);
    assert.equal(get(s, target)!.damage, 0);
    assert.ok(seatView(s, player).discard.includes(P.hound));
    reload(s);
  });
