import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, canPlay, publicState, score } from "../src/game/actions";
import { card } from "../src/game/cards";
import {
  check,
  damage,
  placeEncounter as encounter,
  phaseEnd,
  raiseThreat,
  shadow,
} from "../src/game/board";
import { fx, make, playCost, stats } from "../src/game/core";
import { flush } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import { reduceThreat } from "../src/game/threat-reduction";
import { angmarFavor } from "../src/game/angmar-player";
import { angmarValour } from "../src/game/angmar-player-support";
import { questExhausts, secrecyDiscount } from "../src/game/expansion-passives";
import { ringMakerSecrecy } from "../src/game/ring-maker-player";
import { redhornPlayerAttackBonus } from "../src/game/redhorn-player-cards";
import { handleShadowFlamePlayerEffect } from "../src/game/shadow-flame-player-cards";
import { useWatcherPlayerAbility } from "../src/game/watcher-player-cards";
import { heirsQuestStat } from "../src/game/heirs-numenor";
import { rhosgobelCheck, RHOS } from "../src/game/rhosgobel";
import { REDHORN } from "../src/game/redhorn-gate";
import { ROAD } from "../src/game/road-rivendell";
import { RETURN } from "../src/game/return-mirkwood";
import {
  stormcallerEffectiveThreat as threat,
  STORMCALLER_VANISH,
} from "../src/game/threat-read";
import { base, reload } from "./against-shadow-final-fixtures";
import { base as tharbadFixture } from "./tharbad-fixtures";
import { base as voyageFixture } from "./voyage-belegaer-fixtures";
import { base as gramFixture } from "./mount-gram-fixtures";
import { VOYAGE as V } from "../src/game/voyage-belegaer-support";
import { SHIP_CONTROLLER_ELIMINATED } from "../src/game/voyage-belegaer";
import type { GameState, ScenarioId } from "../src/game/types";

function fixture(players = 1) {
  const s = base("mirkwood", players);
  for (let player = 0; player < players; player++)
    forOwner(s, player, () => {
      s.heroes = [make(s, "01006"), make(s, "01007")];
      s.startingHeroes = s.heroes.map((h) => h.code);
      for (const h of s.heroes) h.resources = 10;
    });
  return s;
}

/** A serialized lasting-effect fixture; the real PLAY path is tested separately. */
function active(s: GameState, player = 0, actual = 40) {
  forOwner(s, player, () => {
    s.threat = actual;
    s.used.push(STORMCALLER_VANISH);
  });
  return s;
}

test("Vanish's real play restriction and lasting effect leave the physical counter unchanged", () => {
  let s = fixture();
  s.threat = 40;
  const event = make(s, "12011");
  s.hand.push(event);
  s.heroes.push(make(s, "01009"));
  assert.ok(canPlay(s, event));
  s.heroes.pop();
  assert.equal(canPlay(s, event), null);
  s = applyAction(s, { type: "PLAY", id: event.id });
  assert.equal(s.threat, 40);
  assert.equal(threat(s), 20);
  assert.ok(s.used.includes(STORMCALLER_VANISH));
  // The initiation restriction does not stop an already resolved lasting effect.
  s.heroes.push(make(s, "01009"));
  assert.equal(threat(s), 20);
});

test("the reader caps only threats above 20 and never mutates their stored values", () => {
  for (const actual of [0, 7, 19, 20, 21, 49, 50, 57]) {
    const s = active(fixture(), 0, actual);
    assert.equal(threat(s), Math.min(actual, 20));
    assert.equal(s.threat, actual);
  }
});

test("Vanish belongs to one seat and follows that seat across active-player projections", () => {
  const s = active(fixture(2), 0, 50);
  forOwner(s, 1, () => {
    s.threat = 43;
  });
  assert.equal(threat(s, 0), 20);
  assert.equal(threat(s, 1), 43);
  selectSeat(s, 1);
  assert.equal(threat(s), 43);
  assert.equal(threat(s, 0), 20);
  assert.equal(threat(seatView(s, 0)), 20);
  assert.equal(seatView(s, 0).threat, 50);
});

test("actual raises, reductions, saved state, score and public dial retain the physical threat", () => {
  let s = active(fixture(), 0, 44);
  const before = score(s);
  raiseThreat(s, 5, "encounter");
  assert.equal(s.threat, 49);
  assert.equal(threat(s), 20);
  assert.equal(score(s), before + 5);
  assert.equal(publicState(s).threat, 49);
  s = reload(s);
  assert.equal(s.threat, 49);
  assert.equal(threat(s), 20);
  reduceThreat(s, 4);
  assert.equal(threat(s), 20);
  assert.equal(s.threat, 45);
});

// Official FAQ 1.9, section 1.57 explicitly names Vanish from Sight: the
// physical dial still eliminates its player immediately, before phase expiry.
test("actual dial 50 eliminates solo immediately while Vanish still treats threat as 20", () => {
  const s = reload(active(fixture(), 0, 50));
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /threat reached 50/i);
  assert.equal(s.threat, 50);
  assert.equal(threat(s), 20);
  assert.ok(s.used.includes(STORMCALLER_VANISH));
});

test("phase expiry restores card comparisons at actual 49 without eliminating the player", () => {
  const s = active(fixture(), 0, 49);
  check(s);
  assert.equal(s.status, "playing");
  phaseEnd(s);
  assert.equal(threat(s), 49);
  check(s);
  assert.equal(s.status, "playing");
});

test("a remote marked seat is eliminated at its actual dial while the other fellowship survives", () => {
  let s = active(base("mirkwood", 2), 0, 50);
  forOwner(s, 1, () => {
    s.threat = 43;
  });
  selectSeat(s, 1);
  s = reload(s);
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.seats[1].eliminated, false);
  assert.equal(s.status, "playing");
  assert.equal(seatView(s, 0).threat, 50);
  assert.equal(threat(s, 0), 20);
  assert.equal(seatView(s, 1).threat, 43);
});

test("all fellowships at their actual elimination level lose immediately despite Vanish", () => {
  const s = active(active(fixture(2), 0, 50), 1, 50);
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.status, "lost");
});

test("actual threat controls variable elimination levels above, at and below 20", () => {
  for (const level of [30, 20, 10]) {
    let s = active(tharbadFixture(), 0, level - 1);
    s.tharbad!.elimination = level;
    s = reload(s);
    check(s);
    assert.equal(s.status, "playing");
    raiseThreat(s, 1, "encounter");
    check(s);
    assert.equal(s.status, "lost");
    assert.match(s.reason, new RegExp(`threat reached ${level}`));
    assert.equal(s.threat, level);
    assert.equal(threat(s), Math.min(level, 20));
  }
});

test("Vanish cannot protect a remote prisoner's fellowship from actual threat elimination", () => {
  let s = base("dol-guldur", 2);
  assert.ok(s.prisoner);
  const owner = s.prisoner.owner ?? 0;
  active(s, owner, 50);
  selectSeat(s, 1 - owner);
  s = reload(s);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /prisoner's fellowship has been eliminated/i);
  assert.equal(threat(s, owner), 20);
  assert.equal(seatView(s, owner).threat, 50);
});

test("a captured hero exception does not override actual threat elimination", () => {
  let s = active(gramFixture(), 0, 49);
  const captives = s.heroes.splice(0);
  for (const hero of captives) {
    hero.resources = 0;
    hero.owner = 0;
  }
  (s.mountGram!.capturedDecks[0] ??= []).push(...captives);
  s = reload(s);
  check(s);
  assert.equal(s.status, "playing");
  raiseThreat(s, 1, "encounter");
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /threat reached 50/i);
  assert.equal(threat(s), 20);
});

test("Favor prevents actual elimination of a remote prisoner's fellowship under Vanish", () => {
  let s = base("dol-guldur", 2);
  assert.ok(s.prisoner);
  const owner = s.prisoner.owner ?? 0;
  active(s, owner, 50);
  forOwner(s, owner, () => {
    s.threatAttachments = [
      { id: `a${s.nextId++}`, code: "10124", owner, exhausted: false },
    ];
  });
  selectSeat(s, 1 - owner);
  s = reload(s);
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(seatView(s, owner).threat, 45);
  assert.equal(threat(s, owner), 20);
  assert.ok(s.prisoner);
  assert.ok(seatView(s, owner).discard.includes("10124"));
});

test("ship destruction directly eliminates its controller even under Vanish and preserves the dial", () => {
  const s = active(voyageFixture(2), 1, 44);
  const ship = seatView(s, 1).allies.find(
    (u) => card(u.code).type_code === "ship-objective",
  )!;
  damage(s, ship.id, stats(s, ship).health);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.table!.seats[0].eliminated, false);
  assert.ok(seatView(s, 1).used.includes(SHIP_CONTROLLER_ELIMINATED));
  assert.equal(seatView(s, 1).threat, 44);
});

test("a solo companion ship's destruction loses the game at low actual threat", () => {
  const s = active(voyageFixture(), 0, 12);
  const companion = s.allies.find((u) => u.code === V.narelenya)!;
  damage(s, companion.id, stats(s, companion).health);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Ship objective was destroyed/i);
  assert.equal(s.threat, 12);
});

test("Dream-chaser's destruction is an immediate fleet loss under Vanish", () => {
  const s = active(voyageFixture(2), 0, 45);
  const dream = s.allies.find((u) => u.code === V.dream)!;
  damage(s, dream.id, stats(s, dream).health);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Dream-chaser is destroyed/i);
  assert.equal(s.threat, 45);
});

test("Favor replaces actual dial elimination immediately while Vanish remains active", () => {
  let s = active(fixture(), 0, 49);
  s.threatAttachments = [
    { id: `a${s.nextId++}`, code: "10124", owner: 0, exhausted: false },
  ];
  assert.equal(angmarFavor(s), false);
  assert.equal(s.threatAttachments.length, 1);
  s = reload(s);
  raiseThreat(s, 1, "encounter");
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.threat, 45);
  assert.equal(threat(s), 20);
  assert.equal(s.threatAttachments!.length, 0);
  assert.ok(s.discard.includes("10124"));
  raiseThreat(s, 5, "encounter");
  check(s);
  assert.equal(s.status, "lost");
});

test("Favor uses a variable actual elimination level and the physical card's owner", () => {
  let s = active(tharbadFixture(2), 1, 30);
  s.tharbad!.elimination = 30;
  forOwner(s, 1, () => {
    s.threatAttachments = [
      {
        id: `a${s.nextId++}`,
        code: "10124",
        owner: 0,
        controller: 1,
        exhausted: false,
      },
    ];
  });
  s = reload(s);
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(seatView(s, 1).threat, 25);
  assert.equal(threat(s, 1), 20);
  assert.equal(s.table!.seats[1].eliminated, false);
  assert.equal(seatView(s, 1).threatAttachments!.length, 0);
  assert.ok(seatView(s, 0).discard.includes("10124"));
  assert.ok(!seatView(s, 1).discard.includes("10124"));
});

test("Secrecy and Leaf Brooch use treated threat for the initiating player's actual cost", () => {
  const s = active(fixture(2), 0, 44);
  s.heroes[1].attachments.push({
    id: `a${s.nextId++}`,
    code: "08034",
    owner: 0,
    exhausted: false,
  });
  assert.equal(secrecyDiscount(s, card("04062")), 3);
  assert.equal(playCost(s, card("04062")), 1);
  assert.equal(ringMakerSecrecy(s, card("04132")), 1);
  assert.equal(playCost(s, card("04132")), 0);
  forOwner(s, 1, () => {
    s.threat = 44;
  });
  assert.equal(secrecyDiscount(seatView(s, 1), card("04062")), 0);
  assert.equal(playCost(seatView(s, 1), card("04062")), 4);
  assert.equal(s.threat, 44);
});

test("Valour, conditional stats and quest exhaustion use each controller's treated threat", () => {
  const s = active(fixture(2), 0, 44);
  const veteran = make(s, "10029"),
    angbor = make(s, "22028");
  s.allies.push(veteran, angbor);
  assert.equal(angmarValour(s), false);
  assert.equal(stats(s, veteran).attack, card(veteran.code).attack);
  assert.equal(stats(s, angbor).attack, card(angbor.code).attack);
  assert.equal(questExhausts(s, angbor), true);
  forOwner(s, 1, () => {
    s.threat = 44;
  });
  assert.equal(angmarValour(seatView(s, 1)), true);
  phaseEnd(s);
  assert.equal(angmarValour(s), true);
  assert.equal(stats(s, veteran).attack, card(veteran.code).attack! + 1);
  assert.equal(stats(s, angbor).attack, card(angbor.code).attack! + 2);
  assert.equal(questExhausts(s, angbor), false);
});

test("Pillars of the Kings' below-40 cost condition uses treated threat", () => {
  const s = active(fixture(), 0, 44);
  assert.equal(playCost(s, card("22003")), Number(card("22003").cost) - 4);
  phaseEnd(s);
  assert.equal(playCost(s, card("22003")), Number(card("22003").cost));
});

test("automatic engagement waits at treated 20 while optional engagement remains available", () => {
  const s = active(fixture(), 0, 45),
    enemy = make(s, "01096");
  s.phase = "encounter";
  s.staging = [enemy];
  s.queue.push(fx("automaticEngagement"));
  flush(s);
  assert.equal(s.engaged.length, 0);
  assert.equal(s.staging[0].id, enemy.id);
  const engaged = applyAction(s, { type: "ENGAGE", id: enemy.id });
  assert.equal(engaged.engaged[0].id, enemy.id);
  assert.equal(engaged.threat, 45);
});

test("automatic engagement evaluates the correct seat when another seat is active", () => {
  const s = active(fixture(2), 0, 45),
    enemy = make(s, "01115");
  forOwner(s, 1, () => {
    s.threat = 35;
  });
  s.phase = "encounter";
  s.staging = [enemy];
  s.queue.push(fx("engagementRound"));
  flush(s);
  assert.equal(seatView(s, 0).engaged.length, 0);
  assert.equal(seatView(s, 1).engaged[0].id, enemy.id);
  assert.equal(seatView(s, 0).threat, 45);
});

test("Unseen Strike compares engagement cost with its character controller's treated threat", () => {
  const s = active(fixture(), 0, 45),
    hero = s.heroes[0],
    enemy = make(s, "01096");
  s.used.push(`phase:unseen-strike:${hero.id}`);
  assert.equal(redhornPlayerAttackBonus(s, hero, enemy), 3);
  s.used = s.used.filter((key) => key !== STORMCALLER_VANISH);
  assert.equal(redhornPlayerAttackBonus(s, hero, enemy), 0);
});

test("threshold encounter and shadow text uses treated threat", () => {
  const s = active(fixture(2), 0, 45);
  forOwner(s, 1, () => {
    s.threat = 36;
  });
  encounter(s, "01116");
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 1));
  s.combat = {
    enemyId: make(s, "01096").id,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
  };
  shadow(s, "01115");
  assert.equal(s.combat.attackBonus, 1);
});

test("highest-threat choices rank players by treated values, without changing their counters", () => {
  const s = active(fixture(2), 0, 45);
  forOwner(s, 1, () => {
    s.threat = 34;
  });
  encounter(s, "01080");
  assert.ok(s.choice);
  assert.deepEqual(
    s.choice.options.map((o) => o.id).sort(),
    seatView(s, 1)
      .heroes.map((h) => h.id)
      .sort(),
  );
  assert.equal(seatView(s, 0).threat, 45);
});

test("scenario quest-stat thresholds see treated threat", () => {
  const s = active(base("into-ithilien"), 0, 40);
  s.stage = 4;
  assert.equal(heirsQuestStat(s), null);
  phaseEnd(s);
  assert.equal(heirsQuestStat(s), "defense");
});

test("Wilyador's direct controller check uses actual threat under Vanish", () => {
  const s = active(base("journey-to-rhosgobel"), 0, 50);
  s.allies.push(make(s, RHOS.wilyador));
  rhosgobelCheck(s);
  assert.equal(s.status, "lost");
  assert.equal(threat(s), 20);
});

for (const [scenario, objective] of [
  ["journey-to-rhosgobel", RHOS.wilyador],
  ["redhorn-gate", REDHORN.arwen],
  ["road-to-rivendell", ROAD.arwen],
  ["return-to-mirkwood", RETURN.gollum],
] as [ScenarioId, string][]) {
  test(`${scenario}: a remote objective controller's actual 50 loses under Vanish`, () => {
    let s = active(base(scenario, 2), 1, 50);
    s.table!.first = 1;
    forOwner(s, 1, () => s.allies.push(make(s, objective)));
    s = reload(s);
    check(s);
    assert.equal(s.status, "lost");
    assert.match(s.reason, /eliminated/i);
    assert.equal(seatView(s, 1).threat, 50);
    assert.equal(threat(s, 1), 20);
    assert.equal(seatView(s, 0).threat, 20);
  });

  test(`${scenario}: Favor replaces remote controller elimination before the objective loss`, () => {
    let s = active(base(scenario, 2), 1, 50);
    s.table!.first = 1;
    forOwner(s, 1, () => {
      s.allies.push(make(s, objective));
      s.threatAttachments = [
        { id: `a${s.nextId++}`, code: "10124", owner: 1, exhausted: false },
      ];
    });
    s = reload(s);
    check(s);
    assert.equal(s.status, "playing");
    assert.equal(seatView(s, 1).threat, 45);
    assert.equal(threat(s, 1), 20);
    assert.equal(s.table!.seats[1].eliminated, false);
    assert.ok(seatView(s, 1).allies.some((u) => u.code === objective));
    assert.ok(seatView(s, 1).discard.includes("10124"));
  });
}

test("Elbereth evaluates treated threat then SETS the actual dial to engagement cost", () => {
  const s = active(fixture(), 0, 40),
    enemy = make(s, "01115");
  s.engaged.push(enemy);
  s.hand.push(make(s, "04132"));
  assert.equal(
    handleShadowFlamePlayerEffect(
      s,
      fx("shadowFlameElberethBottom", { target: enemy.id }),
    ),
    true,
  );
  assert.equal(s.threat, 30);
  assert.equal(threat(s), 20);
  assert.equal(s.encounterDeck.at(-1), enemy.code);
  assert.equal(s.engaged.length, 0);
});

test("Aragorn resets the physical dial rather than subtracting a treated-threat delta", () => {
  const s = active(fixture(), 0, 45),
    aragorn = make(s, "04053");
  s.heroes = [aragorn, s.heroes[0]];
  s.startingThreat = 17;
  s.phase = "refresh";
  assert.equal(useWatcherPlayerAbility(s, aragorn), true);
  assert.equal(s.threat, 17);
  assert.equal(threat(s), 17);
});
