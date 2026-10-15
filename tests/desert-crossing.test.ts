import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  make,
  stats,
  stagingThreat,
  threatOf,
  engagementCost,
  get,
} from "../src/game/core";
import {
  damage,
  engage,
  enterAlly,
  progressLocation,
  readyCharacter,
  revealed,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { syncAttachmentText } from "../src/game/attachment-text";
import { DESERT_CROSSING as D } from "../src/game/desert-crossing-support";
import {
  desertCrossingAdvance,
  desertCrossingCannotDefend,
  desertCrossingCannotReady,
  desertCrossingCheck,
  desertCrossingEffect,
  desertCrossingEncounter,
  desertCrossingExplored,
  desertCrossingRoundEnd,
  desertCrossingSideDefeated,
  desertCrossingTravelEntered,
} from "../src/game/desert-crossing";
import {
  base,
  choose,
  reload,
  setStage,
  settle,
  start,
} from "./desert-crossing-fixtures";
import type { GameState, Unit } from "../src/game/types";

function add(
  s: GameState,
  code: string,
  area: "staging" | "engaged" | "allies" = "staging",
  player = 0,
) {
  const u = make(s, code);
  if (area === "staging") s.staging.push(u);
  else
    forOwner(s, player, () => {
      u.owner = player;
      s[area].push(u);
    });
  return u;
}
function effect(
  s: GameState,
  kind: string,
  fields: Omit<Parameters<typeof fx>[1], never> = {},
) {
  handle(s, fx(kind, fields));
  flush(s);
  return s;
}
function combat(s: GameState, enemy: Unit, player = 0, defender?: Unit) {
  s.phase = "defense";
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: player,
    defenderId: defender?.id ?? null,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    damageDealt: 0,
  };
  return s;
}

for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Desert Crossing ${easy ? "easy" : "standard"} ${players}p: exact setup, heat and reload`, () => {
      const s = start(players, easy);
      assert.equal(s.desertCrossing!.temperature, 10);
      assert.equal(s.staging.length, players);
      assert.ok(s.staging.every((u) => u.code === D.sands));
      assert.equal(s.encounterDeck.length + s.staging.length, easy ? 31 : 37);
      assert.equal(
        s.encounterDeck.filter((c) => c === D.heat).length,
        2,
        "Both original Unbearable Heat copies remain in easy mode",
      );
      assert.equal(reload(s).desertCrossing!.temperature, 10);
    });
test("Desert Crossing: temperature is shared and reaches60 immediately before queued healing", () => {
  let s = base(4);
  s.desertCrossing!.temperature = 58;
  s.queue = [fx("desertHeat", { value: -10 })];
  desertCrossingEffect(s, fx("desertHeat", { value: 2 }));
  assert.equal(s.status, "lost");
  assert.equal(s.desertCrossing!.temperature, 60);
  assert.deepEqual(s.queue, []);
  assert.equal(reload(s).status, "lost");
});
test("Desert Crossing: stages2/3 heat, reveal perplayer and physical Wereworm search", () => {
  let s = base(2);
  s.progress = 8;
  s.encounterDeck = [D.sands, D.sands, D.worm];
  assert.equal(desertCrossingAdvance(s), true);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.desertCrossing!.temperature, 12);
  assert.equal(s.staging.length, 2);
  s.progress = 14;
  s.encounterDeck = [D.worm];
  s.encounterDiscard = [D.worm];
  s.victoryCards = [D.worm];
  desertCrossingAdvance(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.desertCrossing!.temperature, 14);
  assert.equal(s.staging.filter((u) => u.code === D.worm).length, 2);
  assert.equal(
    s.encounterDeck.filter((c) => c === D.worm).length +
      s.encounterDiscard.filter((c) => c === D.worm).length +
      s.victoryCards!.filter((c) => c === D.worm).length,
    1,
  );
  assert.equal(reload(s).stageRevealing, false);
});
test("Desert Crossing: final progress cannot bypass a Wereworm engaged with a remote player", () => {
  let s = setStage(base(4), 3);
  s.progress = 16;
  const w = add(s, D.worm, "engaged", 3);
  desertCrossingAdvance(s);
  assert.equal(s.status, "playing");
  forOwner(s, 3, () => {
    s.engaged = s.engaged.filter((u) => u.id !== w.id);
  });
  desertCrossingAdvance(s);
  assert.equal(s.status, "won");
});
test("Desert Crossing: stage1 allyentry offers actual exhaustion or damage and survivesreload", () => {
  let s = base(2);
  forOwner(s, 1, () => enterAlly(s, make(s, "01016")));
  flush(s);
  assert.match(s.choice!.title, /Exhaust the ally/);
  s = reload(s);
  const ally = seatView(s, 1).allies[0];
  s = choose(s, "exhaust");
  assert.equal(get(s, ally.id)!.exhausted, true);
  assert.equal(get(s, ally.id)!.damage, 0);
});
test("Desert Crossing: mandatory heat kills an exhausted Scout before its optional response", () => {
  let s = base();
  const scout = make(s, "01016");
  scout.exhausted = true;
  enterAlly(s, scout);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["damage"],
  );
  s = choose(reload(s), "damage");
  assert.equal(get(s, scout.id), undefined);
  assert.equal(s.choice, null, "the departed Scout has no entry response");
});
test("Desert Crossing: Wereworm printedX and Wadi modifiers affect allstats at tens boundaries", () => {
  const s = base();
  const w = add(s, D.worm);
  add(s, D.wadi);
  add(s, D.wadi);
  const h = add(s, D.hamada);
  const sands = add(s, D.sands);
  s.desertCrossing!.temperature = 39;
  assert.equal(stats(s, w).attack, 5);
  assert.equal(stats(s, w).defense, 3);
  assert.equal(threatOf(s, w), 5);
  assert.equal(threatOf(s, h), 3);
  assert.equal(threatOf(s, sands), 2);
  s.desertCrossing!.temperature = 40;
  assert.equal(stats(s, w).attack, 6);
  assert.equal(threatOf(s, sands), 4);
  setStage(s, 3);
  s.phase = "quest";
  assert.equal(
    stagingThreat(s),
    s.staging.reduce((n, u) => n + threatOf(s, u), 0) + 4,
  );
});
test("Desert Crossing: CarrionBird global damagedcount and remote discardchoice", () => {
  let s = base(3);
  s.heroes[0].damage = 1;
  forOwner(s, 2, () => {
    s.heroes[1].damage = 2;
  });
  const bird = add(s, D.bird);
  assert.equal(engagementCost(s, bird), 38);
  forOwner(s, 2, () => engage(s, bird));
  flush(s);
  s = reload(s);
  const chosen = seatView(s, 2).heroes[1];
  assert.equal(s.choice!.options.length, 1);
  s = choose(s, chosen.id);
  assert.ok(!get(s, chosen.id));
  assert.ok(get(s, bird.id));
  assert.equal(ownerOf(s, get(s, bird.id)!), 2);
});
test("Desert Crossing: Wereworm engagement immediateattack deals no new shadow and preservesnormal shadow", () => {
  let s = base(2);
  const w = add(s, D.worm);
  w.shadows = [D.heat];
  const before = s.encounterDeck.length;
  forOwner(s, 1, () => engage(s, w));
  flush(s);
  s = settle(s, "undefended");
  assert.equal(s.encounterDeck.length, before);
  const actual = get(s, w.id);
  assert.ok(actual);
  assert.deepEqual(actual.shadows, [D.heat]);
});
test("Desert Crossing: activeBurntSands and Hamada costs use actual heat/damage choices", () => {
  let s = base(2);
  s.desertCrossing!.temperature = 28;
  const sands = add(s, D.sands);
  s.staging = [];
  s.activeLocation = sands;
  desertCrossingTravelEntered(s, sands, false);
  flush(s);
  assert.equal(s.desertCrossing!.temperature, 30);
  const h = make(s, D.hamada);
  s.activeLocation = h;
  desertCrossingTravelEntered(s, h, false);
  flush(s);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, u) => n + u.damage, 0) +
      seatView(s, 1).heroes.reduce((n, u) => n + u.damage, 0),
    3,
  );
});
test("Desert Crossing: ParchedWadi discardsuntilCreature without revealingit", () => {
  let s = base();
  const wadi = make(s, D.wadi);
  s.activeLocation = wadi;
  s.encounterDeck = [D.sands, D.worm];
  s.encounterDiscard = [];
  desertCrossingTravelEntered(s, wadi, false);
  flush(s);
  s = settle(s);
  assert.equal(s.staging.length, 1);
  assert.equal(s.staging[0].code, D.worm);
  assert.equal(s.combat, null);
  assert.equal(
    [...s.encounterDeck, ...s.encounterDiscard].filter((c) => c === D.sands)
      .length,
    1,
  );
});
test("Desert Crossing: Mirage holdsitsownphysicalcard, discardsactivewithoutOasisresponse andactivatesnewlocation", () => {
  let s = base();
  const oasis = make(s, D.oasis);
  oasis.progress = 1;
  s.activeLocation = oasis;
  s.encounterDeck = [D.sands];
  s.encounterDiscard = [];
  assert.ok(desertCrossingEncounter(s, D.mirage));
  assert.deepEqual(s.desertCrossing!.resolving, [D.mirage]);
  assert.ok(!s.encounterDiscard.includes(D.mirage));
  flush(s);
  s = settle(s);
  assert.ok([D.sands, D.oasis].includes(s.activeLocation!.code));
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(
    s.desertCrossing!.temperature,
    s.activeLocation!.code === D.sands ? 12 : 10,
  );
  assert.deepEqual(s.desertCrossing!.resolving, []);
  assert.ok(s.encounterDiscard.includes(D.mirage));
  assert.equal(s.heroes[0].damage, 0);
});
test("Desert Crossing: ToweringDunes protectsotherstaginglocationsbutnotitself", () => {
  const s = base();
  const dunes = add(s, D.dunes),
    sands = add(s, D.sands);
  progressLocation(s, sands, 2);
  assert.equal(sands.progress, 0);
  progressLocation(s, dunes, 1);
  assert.equal(dunes.progress, 1);
  s.staging = s.staging.filter((u) => u.id !== dunes.id);
  progressLocation(s, sands, 1);
  assert.equal(sands.progress, 1);
});
test("Desert Crossing: Oasis forcedexhaustion reaches eachseat; responseheals acrossfellowships", () => {
  let s = base(2);
  const oasis = make(s, D.oasis);
  s.activeLocation = oasis;
  s.heroes[0].damage = 2;
  forOwner(s, 1, () => {
    s.heroes[0].damage = 2;
  });
  desertCrossingTravelEntered(s, oasis, false);
  flush(s);
  s = settle(s);
  assert.ok(s.heroes.some((h) => h.exhausted));
  assert.ok(seatView(s, 1).heroes.some((h) => h.exhausted));
  const physical = s.activeLocation!;
  s.activeLocation = null;
  desertCrossingExplored(s, physical, true);
  flush(s);
  s = choose(s, "heal");
  s = settle(s);
  assert.equal(
    [...s.heroes, ...seatView(s, 1).heroes].reduce((n, h) => n + h.damage, 0),
    0,
  );
});
test("Desert Crossing: SandViper engagesfirstplayerafteractualtravel, neverdefendable", () => {
  let s = base(3);
  const v = add(s, D.viper, "engaged", 2),
    loc = make(s, D.sands);
  s.activeLocation = loc;
  desertCrossingTravelEntered(s, loc, false);
  flush(s);
  assert.equal(ownerOf(s, v), 2);
  desertCrossingTravelEntered(s, loc, true);
  flush(s);
  s = settle(s);
  assert.equal(ownerOf(s, get(s, v.id)!), 0);
  assert.ok(desertCrossingCannotDefend(s, get(s, v.id)!));
});
test("Desert Crossing: GiantScorpion actualdamage poison blocksframeworkrefresh and persistsreload", () => {
  let s = base();
  const e = add(s, D.scorpion, "engaged"),
    h = s.heroes[0];
  combat(s, e, 0, h);
  h.exhausted = true;
  damage(s, h.id, 1, { enemyId: e.id, combatDamage: true });
  s = reload(s);
  const actual = get(s, h.id)!;
  assert.ok(desertCrossingCannotReady(s, actual));
  readyCharacter(s, actual, false);
  assert.ok(actual.exhausted);
  s.round++;
  readyCharacter(s, actual, false);
  assert.equal(actual.exhausted, false);
});
test("Desert Crossing: GiantScorpion shadowpoisonthedefenderonlyifattackdealsactualdamage", () => {
  let s = base();
  const e = add(s, D.bird, "engaged"),
    h = s.heroes[0];
  combat(s, e, 0, h);
  shadow(s, D.scorpion);
  assert.equal(desertCrossingCannotReady(s, h), false);
  damage(s, h.id, 1, { enemyId: e.id, combatDamage: true });
  assert.ok(desertCrossingCannotReady(s, h));
  assert.equal(desertCrossingCannotReady(s, s.heroes[1]), false);
});
test("Desert Crossing: Scorpion shadow poisons the defender when attack damage is redirected", () => {
  const s = base(),
    enemy = add(s, D.bird, "engaged"),
    defender = s.heroes[0],
    recipient = s.heroes[1];
  combat(s, enemy, 0, defender);
  shadow(s, D.scorpion);
  damage(s, recipient.id, 1, { enemyId: enemy.id, combatDamage: true });
  assert.ok(desertCrossingCannotReady(s, defender));
  assert.equal(desertCrossingCannotReady(s, recipient), false);
});
test("Desert Crossing: FindWater blocksonlyplayerready, defeatedresponsereadieseveryseat", () => {
  let s = base(2);
  const water = add(s, D.water);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[0].exhausted = true;
    });
  readyCharacter(s, s.heroes[0]);
  assert.ok(s.heroes[0].exhausted);
  readyCharacter(s, s.heroes[0], false);
  assert.equal(s.heroes[0].exhausted, false);
  s.heroes[0].exhausted = true;
  s.staging = [];
  desertCrossingSideDefeated(s, water);
  flush(s);
  s = choose(s, "ready");
  s = settle(s);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(seatView(s, 1).heroes[0].exhausted, false);
});
test("Desert Crossing: CraftRemedy blanksdamagedcharacters preservingtraits and restoresafterheal", () => {
  let s = base(2);
  add(s, D.remedy);
  s.heroes[0].damage = 1;
  forOwner(s, 1, () => {
    s.heroes[0].damage = 1;
  });
  syncAttachmentText(s);
  assert.ok(s.heroes[0].blanked);
  assert.ok(s.heroes[0].printedTraitsPreserved);
  assert.ok(seatView(s, 1).heroes[0].blanked);
  const remedy = s.staging[0];
  s.staging = [];
  desertCrossingSideDefeated(s, remedy);
  flush(s);
  s = choose(s, "heal");
  s = settle(s);
  syncAttachmentText(s);
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.heroes[0].blanked, undefined);
  assert.equal(seatView(s, 1).heroes[0].damage, 0);
});
test("Desert Crossing: HeatExhaustion damageschosenalreadyexhaustedcharacters atremoteseat", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes.forEach((h) => {
        h.exhausted = true;
      });
    });
  desertCrossingEncounter(s, D.exhaustion);
  flush(s);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
});
test("Desert Crossing: UnbearableHeat distributestoallplayers andScorchingSun gainsprintedSurge", () => {
  let s = base(2);
  s.desertCrossing!.temperature = 21;
  desertCrossingEncounter(s, D.heat);
  flush(s);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  s.encounterDeck = [D.sands];
  revealed(s, D.scorch);
  flush(s);
  s = settle(s);
  assert.equal(s.desertCrossing!.temperature, 25);
  assert.ok(s.staging.some((u) => u.code === D.sands));
});
test("Desert Crossing: Sandstorm handdiscard andperplayerdamage useactualhandcounts", () => {
  let s = base(2);
  s.hand = [make(s, "01050"), make(s, "01050")];
  forOwner(s, 1, () => {
    s.hand = [make(s, "01050")];
  });
  desertCrossingEncounter(s, D.sandstorm);
  flush(s);
  s = choose(s, "hand");
  s = choose(s, "damage");
  s = settle(s);
  assert.equal(s.hand.length, 0);
  assert.equal(s.discard.length, 2);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
});
test("Desert Crossing: Sandstorm shadowhighestcost tiesandphysicalattachmentdiscard", () => {
  let s = base();
  const h = s.heroes[0],
    e = add(s, D.bird, "engaged");
  h.attachments = [
    { id: "desert-a", code: "01026", exhausted: false },
    { id: "desert-b", code: "01026", exhausted: false },
    { id: "desert-c", code: "01040", exhausted: false },
  ];
  combat(s, e);
  shadow(s, D.sandstorm);
  flush(s);
  const highest = Math.max(
    ...h.attachments.map((a) => Number(card(a.code).cost)),
  );
  assert.equal(
    s.choice!.options.filter((o) => o.id !== "damage").length,
    h.attachments.filter((a) => Number(card(a.code).cost) === highest).length,
  );
  const id = s.choice!.options.find((o) => o.id !== "damage")!.id;
  s = choose(reload(s), id);
  assert.ok(!get(s, h.id)!.attachments.some((a) => a.id === id));
});
test("Desert Crossing: originalshadowtemperaturethreshold/threat/returnbranch", () => {
  let s = base();
  const e = add(s, D.bird, "engaged");
  combat(s, e);
  s.desertCrossing!.temperature = 39;
  shadow(s, D.worm);
  assert.equal(s.combat!.attackBonus, 1);
  s.desertCrossing!.temperature = 40;
  shadow(s, D.worm);
  shadow(s, D.heat);
  assert.equal(s.combat!.attackBonus, 7);
  const before = s.threat;
  shadow(s, D.hamada);
  flush(s);
  assert.equal(s.threat, before + 4);
  shadow(s, D.scorch);
  s = choose(reload(s), "return");
  assert.ok(s.combat!.returnToStaging);
});
test("Desert Crossing: SeekShade endroundordering changesX and stage2Thenusesnewtemperature", () => {
  let s = setStage(base(), 2);
  const shade = add(s, D.shade);
  s.progress = 7;
  s.desertCrossing!.temperature = 28;
  s.queue.push(...desertCrossingRoundEnd(s));
  flush(s);
  assert.equal(s.choice!.options.length, 2);
  s = choose(reload(s), "heat");
  s = settle(s);
  assert.equal(s.desertCrossing!.temperature, 32);
  assert.equal(s.progress, 4);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
  s.staging = [];
  desertCrossingSideDefeated(s, shade);
  flush(s);
  s = choose(s, "reduce");
  assert.equal(s.desertCrossing!.temperature, 22);
});
test("Desert Crossing: validationrejectsmalformedheat/questchain/poisons", () => {
  const s = base();
  syncSeat(s);
  for (const mutate of [
    (x: GameState) => {
      x.desertCrossing!.temperature = -1;
    },
    (x: GameState) => {
      x.desertCrossing!.currentQuest = D.beasts;
    },
    (x: GameState) => {
      x.desertCrossing!.poisoned = [{ id: "x", round: x.round + 1 }];
    },
    (x: GameState) => {
      x.desertCrossing!.resolving = [D.heat];
    },
  ]) {
    const copy = JSON.parse(JSON.stringify(s));
    mutate(copy);
    assert.equal(validateSave(copy), false);
  }
});
