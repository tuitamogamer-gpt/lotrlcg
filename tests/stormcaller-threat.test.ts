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
import {
  stormcallerEffectiveThreat as threat,
  STORMCALLER_VANISH,
} from "../src/game/threat-read";
import { base, reload } from "./against-shadow-final-fixtures";
import { base as tharbadFixture } from "./tharbad-fixtures";
import { base as voyageFixture } from "./voyage-belegaer-fixtures";
import { VOYAGE as V } from "../src/game/voyage-belegaer-support";
import { SHIP_CONTROLLER_ELIMINATED } from "../src/game/voyage-belegaer";
import type { GameState } from "../src/game/types";

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
  let s = active(fixture(), 0, 45);
  const before = score(s);
  raiseThreat(s, 5, "encounter");
  assert.equal(s.threat, 50);
  assert.equal(threat(s), 20);
  assert.equal(score(s), before + 5);
  assert.equal(publicState(s).threat, 50);
  s = reload(s);
  assert.equal(s.threat, 50);
  assert.equal(threat(s), 20);
  reduceThreat(s, 4);
  assert.equal(threat(s), 20);
  assert.equal(s.threat, 46);
});

test("phase expiry exposes the real counter and immediately restores solo elimination", () => {
  const s = active(fixture(), 0, 50);
  check(s);
  assert.equal(s.status, "playing");
  phaseEnd(s);
  assert.equal(threat(s), 50);
  assert.equal(s.threat, 50);
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /threat reached 50/i);
});

test("multiplayer elimination protects only the marked seat and resumes at phase end", () => {
  const s = active(fixture(2), 0, 50);
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.table!.seats[0].eliminated, false);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.status, "playing");
  phaseEnd(s);
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.status, "lost");
});

test("Vanish respects the scenario's current elimination level, including levels below 20", () => {
  const s = active(tharbadFixture(), 0, 45);
  s.tharbad!.elimination = 30;
  check(s);
  assert.equal(s.status, "playing");
  s.tharbad!.elimination = 20;
  check(s);
  assert.equal(s.status, "lost");
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

test("Vanish delays Favor of the Valar until threat elimination actually applies", () => {
  const s = active(fixture(), 0, 50);
  s.threatAttachments = [
    { id: `a${s.nextId++}`, code: "10124", owner: 0, exhausted: false },
  ];
  assert.equal(angmarFavor(s), false);
  assert.equal(s.threatAttachments.length, 1);
  phaseEnd(s);
  assert.equal(angmarFavor(s), true);
  assert.equal(s.threat, 45);
  assert.equal(s.threatAttachments.length, 0);
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

test("objective-ally controller elimination uses treated threat", () => {
  const s = active(base("journey-to-rhosgobel"), 0, 50);
  s.allies.push(make(s, RHOS.wilyador));
  rhosgobelCheck(s);
  assert.equal(s.status, "playing");
  phaseEnd(s);
  rhosgobelCheck(s);
  assert.equal(s.status, "lost");
});

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
