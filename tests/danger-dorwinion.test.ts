import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  threatOf,
  stageInfo,
  removePlayerShadowCard,
} from "../src/game/core";
import {
  check,
  damage,
  destroy,
  discardAttachment,
  discardLocation,
  engage,
  progressLocation,
  raiseThreat,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table";
import { isAlly, unitType } from "../src/game/card-types";
import { reduceThreat } from "../src/game/threat-reduction";
import { threatEliminationLevel } from "../src/game/tharbad-support";
import { addQuestProgress } from "../src/game/side-quests";
import {
  DANGER_DORWINION as D,
  DANGER_DORWINION_RECIPES,
  DANGER_DORWINION_QUESTS,
  dangerDorwinionPublicState,
} from "../src/game/danger-dorwinion-support";
import { dangerDorwinionShadow } from "../src/game/danger-dorwinion";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  base,
  start,
  reload,
  settle,
  choose,
} from "./danger-dorwinion-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const active = (s: GameState, code: string) => {
  const u = make(s, code);
  s.activeLocation = u;
  return u;
};
const ally = (s: GameState, code = "01028", player = 0) => {
  const u = make(s, code);
  u.owner = player;
  forOwner(s, player, () => s.allies.push(u));
  return u;
};
const enemy = (s: GameState, code: string, player = 0) => {
  const u = staged(s, code);
  forOwner(s, player, () => engage(s, u));
  return u;
};
function stage(s: GameState, n: 1 | 2 | 3) {
  s.stage = n;
  s.dangerDorwinion!.currentQuest = DANGER_DORWINION_QUESTS[n - 1].code;
  s.dangerDorwinion!.resources = 0;
}
function finish(s: GameState) {
  check(s);
  flush(s);
  return settle(s);
}
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function target(s: GameState, id: string) {
  const o = s.choice!.options.find(
    (o) =>
      o.id === id ||
      o.effects.some((e) => e.target === id || e.ids?.includes(id)),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return o.id;
}
function quiet(s: GameState) {
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
}

for (const easy of [false, true])
  for (let n = 1; n <= 4; n++)
    test(`Dorwinion ${easy ? "easy" : "standard"} ${n}p: native setup, physical counts, different locations, saves`, () => {
      const s = start(n, easy, 121, true, true);
      assert.equal(s.phase, "resource");
      assert.equal(s.dangerDorwinion!.setAside.length, 6);
      assert.equal(s.staging.length, n);
      assert.equal(new Set(s.staging.map((u) => u.code)).size, n);
      assert.ok(s.staging.some((u) => u.code === D.street));
      assert.equal(s.encounterDeck.length + s.staging.length, easy ? 28 : 36);
      assert.deepEqual(reload(s), s);
      assert.equal(stageInfo(s).quest, 5);
    });
test("Dorwinion source stage order and goals retain original printed faces", () => {
  assert.deepEqual(
    DANGER_DORWINION_QUESTS.map((c) => c.code),
    [D.first, D.second, D.third],
  );
  assert.deepEqual(
    DANGER_DORWINION_QUESTS.map((c) => c.back_quest ?? 0),
    [5, 0, 0],
  );
  assert.equal(card(D.fear).quest, 6);
  assert.equal(card(D.unwelcome).quest, 5);
  assert.equal(card(D.evidence).victory, 1);
  assert.equal(card(D.black).victory, 6);
  assert.equal(DANGER_DORWINION_RECIPES.length, 2);
});
test("City in Turmoil needs both progress and two explored-active resources; staged exploration is not enough", () => {
  let s = base();
  s.progress = 5;
  const stagedManor = staged(s, D.manor);
  progressLocation(s, stagedManor, 30);
  s = finish(s);
  assert.equal(s.stage, 1);
  assert.equal(s.dangerDorwinion!.resources, 0);
  progressLocation(s, active(s, D.manor), 30);
  s = finish(s);
  assert.equal(s.stage, 1);
  assert.equal(s.dangerDorwinion!.resources, 1);
  progressLocation(s, active(s, D.manor), 30);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.dangerDorwinion!.resources, 0);
  assert.equal(s.dangerDorwinion!.setAside.length, 5);
  assert.equal(
    s.staging.filter((u) => [D.worship, D.bribes, D.submit].includes(u.code))
      .length,
    1,
  );
  assert.ok(validateSave(s));
});
test("Shadow of Mordor reveals before its exploration resource and advances at players plus three", () => {
  let s = base(2);
  stage(s, 2);
  s.dangerDorwinion!.resources = 4;
  s.encounterDeck = [D.manor, D.manor, D.manor];
  progressLocation(s, active(s, D.street), 30);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.equal(s.dangerDorwinion!.resources, 0);
  assert.ok(s.staging.some((u) => u.code === D.manor));
  assert.equal(
    s.staging.filter((u) => [D.black, D.governor, D.priest].includes(u.code))
      .length,
    1,
  );
});
test("Stage three limits total Cultist damage each round to the active location's PRINTED quest points", () => {
  let s = base();
  stage(s, 3);
  const boss = enemy(s, D.black);
  quiet(s);
  damage(s, boss.id, 4);
  assert.equal(boss.damage, 0);
  const l = active(s, D.manor);
  l.attachments.push({
    id: "pursuit",
    code: "21008",
    owner: 0,
    exhausted: false,
  });
  const printed = card(l.code).quest!;
  damage(s, boss.id, 2);
  damage(s, boss.id, 100);
  assert.equal(boss.damage, printed);
  assert.equal(s.dangerDorwinion!.cultistDamage.amount, printed);
  s = reload(s);
  damage(s, boss.id, 100);
  assert.equal(get(s, boss.id)?.damage, printed);
  s.round++;
  damage(s, boss.id, 1);
  assert.equal(get(s, boss.id)?.damage, printed + 1);
});
for (const code of [D.black, D.governor, D.priest])
  test(`Defeating ${card(code).name} at stage three wins; direct discard does not win`, () => {
    let s = base();
    stage(s, 3);
    const boss = enemy(s, code);
    quiet(s);
    destroy(s, boss, false);
    s = finish(s);
    assert.notEqual(s.status, "won");
    const next = enemy(s, code);
    quiet(s);
    active(s, D.forum);
    s.phase = "attack";
    next.damage = stats(s, next).health - 1;
    s.heroes[0].tempAttack = 30;
    s = applyAction(s, {
      type: "ATTACK",
      enemyId: next.id,
      attackerIds: [s.heroes[0].id],
    });
    s = settle(s);
    assert.equal(s.status, "won");
    assert.ok(s.victoryCards?.includes(code));
  });
test("Evidence uses Guarded(enemy) discard-to-put, boosts its physical guard, and awards victory/resource when guard leaves", () => {
  let s = base();
  s.encounterDeck = [D.disappearances, D.manor, D.easterling];
  s = reveal(s, D.evidence);
  s = settle(s);
  const clue = s.staging.find((u) => u.code === D.evidence)!;
  const guard = s.staging.find((u) => u.code === D.easterling)!;
  assert.equal(guard.guarding, clue.id);
  assert.equal(stats(s, guard).attack, 4);
  assert.equal(stats(s, guard).defense, 2);
  assert.equal(threatOf(s, guard), 4);
  assert.equal(
    s.encounterDiscard.filter((c) => c === D.disappearances).length,
    1,
  );
  assert.equal(s.threat, 20, "discarded treachery is not revealed");
  destroy(s, guard, false);
  s = finish(s);
  assert.equal(s.dangerDorwinion!.resources, 1);
  assert.ok(s.victoryCards?.includes(D.evidence));
  assert.ok(!get(s, clue.id));
});
test("Evidence refills an empty encounter deck for its guard and resolves the no-enemy fallback", () => {
  let s = base();
  s.encounterDeck = [];
  s.encounterDiscard = [D.manor, D.easterling];
  s = settle(reveal(s, D.evidence));
  assert.ok(s.staging.some((u) => u.code === D.easterling && u.guarding));
  const t = base();
  t.encounterDeck = [D.manor];
  t.encounterDiscard = [];
  const done = settle(reveal(t, D.evidence));
  assert.equal(done.dangerDorwinion!.resources, 1);
  assert.ok(done.victoryCards?.includes(D.evidence));
});
test("Secret Cultist chooses highest attack across seats, changes type, blanks all text, and keeps physical ownership", () => {
  let s = base(2);
  const low = ally(s, "01028", 0),
    high = ally(s, "01031", 1);
  high.tempAttack = 6;
  s = reveal(s, D.secret);
  assert.ok(s.choice);
  assert.equal(s.choice.options.length, 1);
  s = choose(s, target(s, high.id));
  s = settle(s);
  const converted = get(s, high.id)!;
  assert.equal(unitType(converted), "enemy");
  assert.equal(isAlly(converted), false);
  assert.equal(converted.blanked, true);
  assert.equal(converted.printedTraitsPreserved, undefined);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === high.id));
  assert.ok(seatView(s, 0).allies.some((u) => u.id === low.id));
  s = reload(s);
  destroy(s, get(s, high.id)!);
  s = finish(s);
  assert.ok(!get(s, high.id));
  assert.equal(seatView(s, 1).discard.filter((c) => c === high.code).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === D.secret).length, 1);
  assert.ok(!s.encounterDiscard.includes(high.code));
});
test("Discarding Secret Cultist discards its former ally even after the attachment is removed", () => {
  let s = base(2);
  const a = ally(s, "01028", 1);
  s = settle(reveal(s, D.secret));
  const converted = get(s, a.id)!;
  assert.equal(unitType(converted), "enemy");
  discardAttachment(
    s,
    converted,
    converted.attachments.find((a) => a.code === D.secret)!,
  );
  s = reload(s);
  s = finish(s);
  assert.ok(!get(s, a.id));
  assert.deepEqual(seatView(s, 1).discard, [a.code]);
  assert.equal(s.encounterDiscard.filter((c) => c === D.secret).length, 1);
});
test("Disappearances discards all players' ally hands once; doomed2 applies only when none were discarded", () => {
  let s = base(2);
  forOwner(s, 1, () => s.hand.push(make(s, "01028")));
  s = settle(reveal(s, D.disappearances));
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 20);
  assert.deepEqual(seatView(s, 1).discard, ["01028"]);
  s = settle(reveal(s, D.disappearances));
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
});
test("Disappearances gained Doomed triggers both players' native keyword responses after both threats rise", () => {
  let s = base(2);
  const guard = ally(s, "07004", 0),
    messenger = ally(s, "07005", 1);
  guard.exhausted = true;
  const hero = seatView(s, 1).heroes[0];
  const keys = {
    id: `a${s.nextId++}`,
    code: "07010",
    exhausted: false,
    owner: 1,
  };
  hero.attachments.push(keys);
  const resources = hero.resources,
    will = stats(s, messenger).will;
  s = reveal(s, D.disappearances);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
  const responses: string[] = [];
  while (s.choice) {
    responses.push(s.choice.title);
    s = choose(s, "use");
  }
  assert.equal(responses.length, 3);
  assert.ok(responses.some((title) => title.includes("Orthanc Guard")));
  assert.ok(responses.some((title) => title.includes("Isengard Messenger")));
  assert.ok(responses.some((title) => title.includes("Keys of Orthanc")));
  assert.equal(get(s, guard.id)!.exhausted, false);
  assert.equal(stats(s, get(s, messenger.id)!).will, will + 1);
  assert.equal(get(s, hero.id)!.resources, resources + 1);
  assert.equal(
    get(s, hero.id)!.attachments.find((a) => a.id === keys.id)!.exhausted,
    true,
  );
  reload(s);
});
test("Darkness gained Surge offers Lanwyn before its extra encounter reveal and survives response reload", () => {
  let s = base();
  const lanwyn = s.heroes[0];
  lanwyn.code = "12030";
  lanwyn.exhausted = true;
  s.encounterDeck = [D.manor];
  s = reveal(s, D.darkness);
  assert.match(s.choice!.title, /Lanwyn/);
  assert.equal(s.staging.length, 0);
  assert.deepEqual(s.encounterDeck, [D.manor]);
  s = choose(s, "ready");
  s = settle(s);
  assert.equal(get(s, lanwyn.id)!.exhausted, false);
  assert.equal(s.staging.filter((u) => u.code === D.manor).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === D.darkness).length, 1);
  reload(s);
});
for (const attachmentCode of ["10122", "10124"])
  test(`Disappearances native shadow discards the only controlled ${card(attachmentCode).name} on its quest or another seat's dial`, () => {
    let s = base(2);
    s.heroes[0].code = "01012";
    const attachment = make(s, attachmentCode);
    s.hand.push(attachment);
    const hostId =
      attachmentCode === "10122" ? mainQuestUnit(s)!.id : "threat:1";
    s = applyAction(reload(s), {
      type: "PLAY",
      id: attachment.id,
      target: hostId,
    });
    s = settle(s);
    assert.ok(get(s, hostId)!.attachments.some((a) => a.id === attachment.id));
    const attacker = enemy(s, D.easterling, 0);
    quiet(s);
    s.heroes[0].tempDefense = 50;
    s.encounterDeck = [D.disappearances, D.manor];
    s.queue.push(fx("immediateAttack", { target: attacker.id, player: 0 }));
    flush(s);
    s = choose(s, target(s, s.heroes[0].id));
    assert.match(s.choice!.title, /Disappearances/);
    assert.deepEqual(
      s.choice!.options.map((o) => o.id),
      [attachment.id],
    );
    s = choose(s, attachment.id);
    s = settle(s);
    assert.ok(!get(s, hostId)!.attachments.some((a) => a.id === attachment.id));
    assert.equal(
      seatView(s, 0).discard.filter((c) => c === attachmentCode).length,
      1,
    );
    assert.equal(
      seatView(s, 1).discard.filter((c) => c === attachmentCode).length,
      0,
    );
    reload(s);
  });
test("Sauron Worship starts with one token and lowers each seat's elimination level, then increases at round end", () => {
  let s = base(2);
  const plot = staged(s, D.worship);
  plot.damage = 1;
  for (const p of playerOrder(s))
    forOwner(s, p, () => assert.equal(threatEliminationLevel(s), 49));
  handle(s, fx("dorWorship", { target: plot.id }));
  s = finish(s);
  for (const p of playerOrder(s))
    forOwner(s, p, () => assert.equal(threatEliminationLevel(s), 48));
});
test("Bribes discards X real top cards for EACH player and counts only the discarded events", () => {
  let s = base(2);
  const plot = staged(s, D.bribes);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01050", "01028", "01050"];
      s.deckIds = [];
    });
  progressLocation(s, active(s, D.manor), 30);
  s = finish(s);
  assert.equal(get(s, plot.id)?.resources, 2);
  assert.equal(s.staging.find((u) => u.id === plot.id)!.resources, 2);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).deck.length, 1);
});
test("Submit or Die buffs only non-unique enemies and loses after a resolved lethal attack at its player-scaled threshold", () => {
  let s = base(2);
  const plot = staged(s, D.submit);
  plot.damage = 5;
  const nonunique = enemy(s, D.easterling);
  const unique = staged(s, D.black);
  quiet(s);
  assert.equal(stats(s, nonunique).attack, card(nonunique.code).attack! + 1);
  assert.equal(stats(s, unique).attack, card(unique.code).attack);
  const victim = ally(s);
  victim.damage = card(victim.code).health! - 1;
  s.encounterDeck = [D.manor];
  handle(s, fx("immediateAttack", { target: nonunique.id }));
  flush(s);
  s = choose(s, target(s, victim.id));
  s = settle(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason ?? "", /Submit or Die/);
});
test("Hillside Manor tracks each player's actual player-card reduction separately, permits encounter reduction, and resets by round", () => {
  const s = base(2);
  staged(s, D.manor);
  forOwner(s, 0, () => {
    assert.equal(reduceThreat(s, 3), 1);
    assert.equal(reduceThreat(s, 1), 0);
    assert.equal(reduceThreat(s, 3, D.fear, "encounter"), 3);
  });
  forOwner(s, 1, () => assert.equal(reduceThreat(s, 4), 1));
  s.round++;
  forOwner(s, 0, () => assert.equal(reduceThreat(s, 4), 1));
});
test("Hillside Manor respects earlier reductions in the same round when it enters staging later", () => {
  const s = base();
  assert.equal(reduceThreat(s, 3), 3);
  staged(s, D.manor);
  assert.equal(reduceThreat(s, 1), 0);
  assert.equal(s.threat, 17);
});
test("City Forum resources rise after any location exploration and its travel charges each player independently", () => {
  let s = base(2);
  const forum = staged(s, D.forum);
  progressLocation(s, staged(s, D.manor), 30);
  s = finish(s);
  assert.equal(get(s, forum.id)?.resources, 1);
  assert.equal(threatOf(s, get(s, forum.id)!), 2);
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: forum.id });
  s = settle(s);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 21);
});
test("Side Street blocks progress only on OTHER staged locations", () => {
  const s = base();
  const street = staged(s, D.street),
    manor = staged(s, D.manor),
    current = active(s, D.manor);
  progressLocation(s, manor, 1);
  progressLocation(s, street, 1);
  progressLocation(s, current, 1);
  assert.equal(manor.progress, 0);
  assert.equal(street.progress, 1);
  assert.equal(current.progress, 1);
});
test("Catacombs dynamically protects staged enemies, but not engaged enemies", () => {
  const s = base();
  staged(s, D.catacombs);
  const protectedEnemy = staged(s, D.easterling),
    engagedEnemy = enemy(s, D.easterling);
  quiet(s);
  damage(s, protectedEnemy.id, 1);
  damage(s, engagedEnemy.id, 1);
  assert.equal(protectedEnemy.damage, 0);
  assert.equal(engagedEnemy.damage, 1);
});
test("Seedy Tavern native travel keeps the chosen physical card hidden through reload, then reveals it when explored", () => {
  let s = base();
  const tavern = staged(s, D.tavern);
  s.phase = "travel";
  s.encounterDeck = [
    D.disappearances,
    D.easterling,
    D.manor,
    D.street,
    D.catacombs,
    D.manor,
  ];
  s = applyAction(s, { type: "TRAVEL", id: tavern.id });
  assert.match(s.choice!.title, /Seedy Tavern/);
  assert.equal(s.dangerDorwinion!.looked.length, 5);
  const chosen = s.dangerDorwinion!.looked.find(
    (u) => u.code === D.disappearances,
  )!;
  s = choose(s, chosen.id);
  s = settle(s);
  assert.equal(s.activeLocation?.id, tavern.id);
  assert.equal(s.dangerDorwinion!.storedCards[0].cards[0].id, chosen.id);
  assert.deepEqual(dangerDorwinionPublicState(s)!.storedCards, [
    { locationId: tavern.id, count: 1 },
  ]);
  assert.ok(
    !JSON.stringify(dangerDorwinionPublicState(s)).includes(D.disappearances),
  );
  s = reload(s);
  progressLocation(s, s.activeLocation!, 30);
  s = finish(s);
  assert.equal(s.dangerDorwinion!.storedCards.length, 0);
  assert.equal(s.threat, 22);
  assert.ok(s.victoryCards?.includes(D.tavern));
});
test("Tavern discarded without exploration discards its facedown cards without revealing them", () => {
  let s = base();
  const tavern = active(s, D.tavern);
  s.dangerDorwinion!.storedCards.push({
    locationId: tavern.id,
    cards: [make(s, D.disappearances)],
  });
  // A scenario discard removes the location without using a player effect;
  // ordinary discardLocation correctly prohibits player effects on this card.
  assert.throws(() => discardLocation(s, tavern), /immune/);
  s.activeLocation = null;
  s.encounterDiscard.push(tavern.code);
  s = finish(s);
  assert.equal(s.threat, 20);
  assert.ok(s.encounterDiscard.includes(D.disappearances));
});
test("Servant follows first player, gets one immediate attack per phase, and Treacherous Easterling gains a resource for each raise", () => {
  let s = base();
  const servant = enemy(s, D.servant),
    easterling = enemy(s, D.easterling);
  quiet(s);
  s.heroes.forEach((h) => (h.tempDefense = 30));
  s.encounterDeck = Array(20).fill(D.manor);
  raiseThreat(s, 1, "framework");
  flush(s);
  while (s.choice && !s.choice.title.includes("Immediate attack"))
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(s, target(s, s.heroes[0].id));
  s = settle(s);
  assert.equal(get(s, easterling.id)?.resources, 1);
  raiseThreat(s, 1, "encounter");
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(get(s, easterling.id)?.resources, 2);
  s.phase = "travel";
  raiseThreat(s, 1, "encounter");
  flush(s);
  while (s.choice && !s.choice.title.includes("Immediate attack"))
    s = choose(s, s.choice.options[0].id);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.dangerDorwinion!.servantAttacks[servant.id].phase, "travel");
});
test("Overwhelmed protects the first player's enemies dynamically, including later engagements", () => {
  let s = base(2);
  s = settle(reveal(s, D.overwhelmed));
  const first = enemy(s, D.easterling, 0),
    second = enemy(s, D.easterling, 1);
  quiet(s);
  damage(s, first.id, 1);
  damage(s, second.id, 1);
  assert.equal(first.damage, 0);
  assert.equal(second.damage, 1);
  s.round++;
  damage(s, first.id, 1);
  assert.equal(first.damage, 1);
});
test("Threat effects raised by the second player affect only that player's Easterling and Servant", () => {
  let s = base(2);
  s.table!.first = 1;
  // Queued effects are dispatched under their actor by flush(), exactly as
  // an encounter/travel choice would be.
  const a = enemy(s, D.easterling, 0),
    b = enemy(s, D.easterling, 1),
    v = enemy(s, D.servant, 1);
  quiet(s);
  seatView(s, 1).heroes.forEach((h) => (h.tempDefense = 50));
  s.encounterDeck = Array(10).fill(D.manor);
  s.queue.push(fx("dorThreat", { value: 1, player: 1 }));
  flush(s);
  while (s.choice && !s.choice.title.includes("Immediate attack"))
    s = choose(s, s.choice.options[0].id);
  assert.equal(s.combat?.attackPlayer, 1);
  s = choose(s, target(s, seatView(s, 1).heroes[0].id));
  s = settle(s);
  assert.equal(get(s, a.id)?.resources, 0);
  assert.equal(get(s, b.id)?.resources, 1);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 21);
  assert.ok(s.dangerDorwinion!.servantAttacks[v.id]);
});
test("The Governor engages the current first player and attacks on a revealed location, not a location added to staging", () => {
  let s = base(2);
  s.table!.first = 1;
  const boss = enemy(s, D.governor, 0);
  quiet(s);
  seatView(s, 1).heroes.forEach((h) => (h.tempDefense = 50));
  s.encounterDeck = [D.manor, D.manor];
  staged(s, D.manor);
  flush(s);
  assert.equal(s.choice, null);
  s = reveal(s, D.street);
  while (s.choice && !s.choice.title.includes("Immediate attack"))
    s = choose(s, s.choice.options[0].id);
  assert.equal(s.combat?.attackPlayer, 1);
  assert.equal(ownerOf(s, get(s, boss.id)!), 1);
  s = choose(s, target(s, seatView(s, 1).heroes[0].id));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === D.street));
});
test("Priest of Sauron raises every player's threat after actually destroying an ally during its attack", () => {
  let s = base(2);
  const boss = enemy(s, D.priest);
  quiet(s);
  const victim = ally(s);
  victim.damage = card(victim.code).health! - 1;
  s.encounterDeck = [D.manor];
  handle(s, fx("immediateAttack", { target: boss.id }));
  flush(s);
  s = choose(s, target(s, victim.id));
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 22);
});
test("Under Guard repeats a travel effect only after an actual lethal attack and preserves the attacked player's hand", () => {
  let s = base(2);
  const attacker = enemy(s, D.easterling, 1);
  quiet(s);
  active(s, D.manor);
  const victim = ally(s, "01028", 1);
  victim.damage = card(victim.code).health! - 1;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.hand = [make(s, "01050"), make(s, "01050")];
    });
  s.encounterDeck = [D.guard];
  s.queue.push(fx("immediateAttack", { target: attacker.id, player: 1 }));
  flush(s);
  s = choose(s, target(s, victim.id));
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
});
test("Secret Cultist discards the transformed ally as soon as its physical owner is eliminated", () => {
  let s = base(2);
  const a = ally(s, "01028", 1);
  s = settle(reveal(s, D.secret));
  forOwner(s, 1, () => {
    s.deck = [];
    s.deckIds = [];
    s.threat = 50;
  });
  s = finish(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(!get(s, a.id));
  assert.equal(seatView(s, 0).heroes.length, 3);
  assert.equal(s.table!.seats[0].eliminated, false);
  assert.equal(seatView(s, 1).discard.filter((c) => c === a.code).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === D.secret).length, 1);
  assert.equal(s.dangerDorwinion!.secretCultists.length, 0);
});
test("Secret Cultist returned to staging by A Light in the Dark preserves all physical cards when its owner is eliminated", () => {
  let s = base(2);
  s.heroes[0].code = "01007";
  const a = ally(s, "01028", 1);
  const attachment = {
    id: `a${s.nextId++}`,
    code: "01039",
    exhausted: false,
    owner: 0,
  };
  a.attachments.push(attachment);
  s = settle(reveal(s, D.secret));
  const event = make(s, "01052");
  s.hand.push(event);
  s = applyAction(reload(s), { type: "PLAY", id: event.id, target: a.id });
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.ok(!allEngaged(s).some((u) => u.id === a.id));
  get(s, a.id)!.shadows = [D.messenger];
  forOwner(s, 1, () => {
    s.deck = [];
    s.deckIds = [];
    s.threat = 50;
  });
  s = finish(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.ok(!get(s, a.id));
  assert.equal(seatView(s, 0).heroes.length, 3);
  assert.equal(s.table!.seats[0].eliminated, false);
  assert.equal(seatView(s, 1).discard.filter((c) => c === a.code).length, 1);
  assert.equal(
    seatView(s, 0).discard.filter((c) => c === attachment.code).length,
    1,
  );
  assert.equal(s.encounterDiscard.filter((c) => c === D.secret).length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === D.messenger).length, 1);
  assert.equal(s.dangerDorwinion!.secretCultists.length, 0);
  reload(s);
});
test("Secret Cultist engages the physical owner of an ally controlled by another player", () => {
  let s = base(2);
  const a = ally(s, "01028", 0);
  a.owner = 1;
  s = settle(reveal(s, D.secret));
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === a.id));
  assert.equal(s.dangerDorwinion!.secretCultists[0].owner, 1);
  destroy(s, get(s, a.id)!);
  s = finish(s);
  assert.ok(seatView(s, 1).discard.includes(a.code));
  assert.ok(!seatView(s, 0).discard.includes(a.code));
});
test("A transformed Secret Cultist performs an actual enemy attack and can be defeated by a normal player attack", () => {
  let s = base();
  const a = ally(s, "01028");
  s = settle(reveal(s, D.secret));
  s.encounterDeck = [D.manor];
  s.heroes[0].tempDefense = 20;
  handle(s, fx("immediateAttack", { target: a.id }));
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  s = choose(s, target(s, s.heroes[0].id));
  s = settle(s);
  s.phase = "attack";
  s.heroes[1].tempAttack = 30;
  s = applyAction(s, {
    type: "ATTACK",
    enemyId: a.id,
    attackerIds: [s.heroes[1].id],
  });
  s = settle(s);
  assert.ok(!get(s, a.id));
  assert.equal(s.discard.filter((c) => c === a.code).length, 1);
  assert.ok(!s.encounterDiscard.includes(a.code));
  assert.equal(s.encounterDiscard.filter((c) => c === D.secret).length, 1);
});
test("Black Númenórean retains effect shadows across immediate attacks and combat cleanup, replaying old effects", () => {
  let s = base();
  const boss = enemy(s, D.black);
  quiet(s);
  s.heroes.forEach((h) => (h.tempDefense = 50));
  s.encounterDeck = [D.backstabber, D.messenger, D.manor];
  for (let i = 0; i < 2; i++) {
    const defender = s.heroes[i];
    handle(s, fx("immediateAttack", { target: boss.id }));
    flush(s);
    s = choose(s, target(s, defender.id));
    s = settle(s);
    s = reload(s);
  }
  const liveBoss = get(s, boss.id)!;
  assert.deepEqual(liveBoss.shadows, [D.backstabber, D.messenger]);
  assert.deepEqual(liveBoss.faceupShadows, [true, true]);
  assert.equal(s.threat, 22, "old Backstabber shadow resolves on each attack");
  handle(s, fx("endCombat"));
  flush(s);
  s = settle(s);
  assert.deepEqual(get(s, boss.id)?.shadows, [D.backstabber, D.messenger]);
});
test("Black Númenórean prohibits discarding effect shadows but permits discarding blank shadows", () => {
  const s = base();
  const boss = enemy(s, D.black);
  quiet(s);
  boss.shadows = [D.messenger, D.manor];
  assert.equal(removePlayerShadowCard(s, boss, 0), undefined);
  assert.equal(removePlayerShadowCard(s, boss, 1), D.manor);
  assert.deepEqual(boss.shadows, [D.messenger]);
});
test("All six printed shadows dispatch their own effects and non-shadow cards do not gain invented effects", () => {
  const s = base();
  const u = enemy(s, D.easterling);
  quiet(s);
  s.combat = {
    enemyId: u.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 0,
  };
  for (const code of [
    D.darkness,
    D.overwhelmed,
    D.backstabber,
    D.guard,
    D.messenger,
    D.disappearances,
  ])
    assert.equal(dangerDorwinionShadow(s, code), true);
  for (const code of [D.manor, D.tavern, D.black, D.evidence, D.servant])
    assert.equal(dangerDorwinionShadow(s, code), false);
  assert.equal(s.combat.dorwinionUnderGuard, 1);
});
test("Shadow of Fear raises only the engaged player's threat and its defeated response reduces every player", () => {
  let s = base(2);
  const fear = staged(s, D.fear);
  enemy(s, D.easterling, 1);
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 21);
  addQuestProgress(s, get(s, fear.id)!, 6);
  check(s);
  flush(s);
  while (s.choice && !s.choice.options.some((o) => o.id === "reduce"))
    s = choose(s, s.choice.options[0].id);
  assert.ok(s.choice?.options.some((o) => o.id === "reduce"));
  s = choose(s, "reduce");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 17);
  assert.equal(seatView(s, 1).threat, 18);
  assert.ok(s.victoryCards?.includes(D.fear));
});
test("Unwelcome Travelers increases only staged locations and finds an enemy when selected as the current quest", () => {
  let s = base(2);
  s.table!.first = 1;
  const side = staged(s, D.unwelcome),
    l = staged(s, D.manor),
    a = active(s, D.manor);
  assert.equal(threatOf(s, l), card(l.code).threat! + 1);
  assert.equal(threatOf(s, a), card(a.code).threat);
  s.encounterDeck = [D.darkness, D.easterling, D.manor];
  s.phase = "quest";
  s.queue.push(fx("sideQuestChoose", { player: 1 }));
  flush(s);
  s = choose(s, target(s, side.id));
  s = settle(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.code === D.easterling));
  assert.ok(s.encounterDiscard.includes(D.darkness));
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 20);
});
test("Catacombs Travel discards separately for each actor and puts only that actor's discarded enemy into engagement", () => {
  let s = base(2);
  const l = staged(s, D.catacombs);
  s.phase = "travel";
  s.encounterDeck = [D.manor, D.easterling];
  s = applyAction(s, { type: "TRAVEL", id: l.id });
  s = settle(s);
  assert.equal(seatView(s, 0).engaged.length, 0);
  assert.equal(seatView(s, 1).engaged[0]?.code, D.easterling);
  assert.ok(s.encounterDiscard.includes(D.manor));
  assert.equal(s.activeLocation?.id, l.id);
});
test("Under Guard without an active location discards to a location without revealing skipped treacheries", () => {
  let s = base(2);
  s.encounterDeck = [D.disappearances, D.manor];
  s = settle(reveal(s, D.guard));
  assert.ok(s.staging.some((u) => u.code === D.manor));
  assert.ok(s.encounterDiscard.includes(D.disappearances));
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 20);
});
test("Darkness in the East raises each player's threat by the active location's current threat, or surges without one", () => {
  let s = base(2);
  const forum = active(s, D.forum);
  forum.resources = 2;
  s = settle(reveal(s, D.darkness));
  assert.equal(seatView(s, 0).threat, 23);
  assert.equal(seatView(s, 1).threat, 23);
  s.activeLocation = null;
  s.encounterDeck = [D.manor];
  s = settle(reveal(s, D.darkness));
  assert.ok(s.staging.some((u) => u.code === D.manor));
  assert.equal(seatView(s, 0).threat, 23);
});
test("Rhûn Backstabber offers only printed cost two-or-more allies and discards the attacked player's chosen ally", () => {
  let s = base(2);
  const eligible = ally(s, "01028", 1),
    cheap = ally(s, "01060", 1);
  enemy(s, D.backstabber, 1);
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === eligible.id));
  assert.ok(!s.choice?.options.some((o) => o.id === cheap.id));
  s = choose(s, eligible.id);
  s = settle(s);
  assert.ok(!get(s, eligible.id));
  assert.ok(get(s, cheap.id));
  assert.equal(seatView(s, 1).threat, 20);
  assert.ok(seatView(s, 1).discard.includes(eligible.code));
});
test("Malformed Dorwinion saved counters and hidden physical duplicates are rejected", () => {
  const s = base();
  const valid = reload(s);
  assert.ok(validateSave(valid));
  const negative = structuredClone(valid);
  negative.dangerDorwinion!.resources = -1;
  assert.equal(validateSave(negative), false);
  const wrongStage = structuredClone(valid);
  wrongStage.dangerDorwinion!.currentQuest = D.third;
  assert.equal(validateSave(wrongStage), false);
  const duplicate = structuredClone(valid);
  duplicate.dangerDorwinion!.looked.push(
    duplicate.dangerDorwinion!.setAside[0],
  );
  assert.equal(validateSave(duplicate), false);
});
