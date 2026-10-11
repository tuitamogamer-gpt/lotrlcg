import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  applyAction,
  canTravel,
  createGame,
  validateSave,
} from "../src/game/engine";
import { STARTERS, card } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  placeEncounter,
  progress,
  progressLocation,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { allEngaged, forOwner, seatView, selectSeat } from "../src/game/table";
import {
  RAID as R,
  RAID_ENCOUNTERS,
  RAID_QUESTS,
  RAID_RECIPES,
} from "../src/game/raid-grey-havens-support";
import {
  raidAflame,
  raidCombatEnd,
  raidRoundEnd,
} from "../src/game/raid-grey-havens";
import {
  base,
  second,
  reload,
  pick,
  settle,
} from "./raid-grey-havens-fixtures";
import type { GameState, Unit } from "../src/game/types";

function finish(s: GameState) {
  flush(s);
  return settle(s);
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function ally(s: GameState, player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, "01016");
    s.allies.push(u);
  });
  return u;
}
function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(16, d.cards, d.heroes, d.id, {
    scenarioId: "raid-on-the-grey-havens",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 150);
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}

test("Raid: exact original standard/easy recipes, printed faces and cached art", () => {
  assert.equal(RAID_ENCOUNTERS.length, 18);
  assert.equal(RAID_QUESTS.length, 2);
  for (const c of [...RAID_ENCOUNTERS, ...RAID_QUESTS]) {
    assert.equal(card(c.code).name, c.name);
    assert.ok(existsSync(`public${c.imagesrc}`));
  }
  for (const [mode, count] of [
    ["standard", 30],
    ["easy", 21],
  ] as const) {
    const r = RAID_RECIPES.find((r) => r.mode === mode)!;
    assert.equal(
      r.cards
        .filter((c) => c.section === "sharedEncounterDeck")
        .reduce((n, c) => n + c.quantity, 0),
      count,
    );
    assert.equal(
      r.cards.filter((c) => c.section === "sharedSetAside").length,
      6,
    );
  }
});
test("Raid: 1–4 players standard/easy setup places ships without revealing their text", () => {
  for (const easy of [false, true])
    for (let players = 1; players <= 4; players++) {
      const s = start(players, easy);
      assert.equal(s.raidGreyHavens!.initialized, true);
      assert.equal(s.round, 1);
      assert.equal(s.raidGreyHavens!.setAside.length, 2);
      assert.equal(
        s.staging.filter((u) => raidAflame(u) > 0).length,
        players + 1,
      );
      assert.equal(s.staging.filter((u) => u.code === R.ravager).length, 1);
      assert.equal(s.staging.filter((u) => u.code === R.burn).length, 1);
      assert.ok(
        s.staging.filter((u) => raidAflame(u) > 0).every((u) => u.damage === 0),
      );
      assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
      const all = [...s.encounterDeck, ...s.encounterDiscard];
      assert.ok(!all.includes(R.sahir) && !all.includes(R.naasiyah));
    }
});
test("Raid: end-of-round Aflame damages only staging locations and survives reload", () => {
  let s = base();
  const pier = staged(s, R.piers),
    active = make(s, R.white);
  s.activeLocation = active;
  handle(s, fx("raidRoundFire", { ...raidRoundEnd(s)[0] }));
  s = finish(s);
  assert.equal(get(s, pier.id)!.damage, 1);
  assert.equal(get(s, active.id)!.damage, 0);
  assert.equal(threatOf(s, get(s, pier.id)!), 2);
  s = reload(s);
  handle(s, raidRoundEnd(s)[0]);
  s = finish(s);
  assert.equal(get(s, pier.id)!.damage, 2);
});
test("Raid: burning destroys a location without exploring it, propagates Piers damage and reveals", () => {
  let s = base();
  const pier = staged(s, R.piers);
  s.encounterDeck = [R.raider, "01099"];
  damage(s, pier.id, 5);
  assert.ok(!get(s, pier.id));
  assert.equal(s.raidGreyHavens!.burned[0].id, pier.id);
  s = finish(s);
  assert.equal(s.staging.find((u) => u.code === R.dream)!.damage, 3);
  assert.ok(s.staging.some((u) => u.code === R.raider));
  assert.ok(!s.encounterDiscard.includes(R.piers));
  assert.ok(!s.victoryCards?.includes(R.piers));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("Raid: burning Dream-chaser loses immediately; explored damaged ships do not burn", () => {
  let s = base();
  const runner = staged(s, R.runner);
  runner.damage = 2;
  progressLocation(s, runner, 3);
  s = finish(s);
  assert.ok(s.victoryCards?.includes(R.runner));
  assert.equal(s.raidGreyHavens!.burned.length, 0);
  const dream = s.staging.find((u) => u.code === R.dream)!;
  damage(s, dream.id, 12);
  s = finish(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Dream-chaser/);
});
test("Raid: Havens Burn loss threshold uses original number of players", () => {
  for (const players of [1, 2, 4]) {
    let s = base(players);
    s.encounterDeck = Array(20).fill(R.raider);
    for (let n = 0; n < players + 3; n++) {
      const runner = staged(s, R.runner);
      damage(s, runner.id, 3);
      s = finish(s);
      assert.equal(s.status, n === players + 2 ? "lost" : "playing");
    }
  }
});
test("Raid: Mithlond blocks staging progress, Dream-chaser has dash and cannot be traveled to", () => {
  const s = base();
  staged(s, R.harbor);
  const runner = staged(s, R.runner);
  progressLocation(s, runner, 8);
  assert.equal(runner.progress, 0);
  s.activeLocation = runner;
  s.staging = s.staging.filter((u) => u.id !== runner.id);
  progressLocation(s, runner, 3);
  assert.ok(!get(s, runner.id));
  const dream = s.staging.find((u) => u.code === R.dream)!;
  progressLocation(s, dream, 100);
  assert.equal(dream.progress, 0);
  s.phase = "travel";
  assert.match(canTravel(s, dream) ?? "", /Dream-chaser/);
});
test("Raid: stage one advances at 18, stage two reveals first then places resource tokens", () => {
  let s = base(2);
  s.staging.find((u) => u.code === R.dream)!.damage = 3;
  s.encounterDeck = [R.raider, R.infiltrator, "01099"];
  progress(s, 18);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.progress, 0);
  assert.equal(s.stageRevealing, false);
  assert.equal(s.staging.find((u) => u.code === R.sahir)!.resources, 3);
  assert.equal(s.staging.find((u) => u.code === R.naasiyah)!.resources, 3);
  assert.equal(s.staging.find((u) => u.code === R.raider)!.resources, 1);
  assert.equal(s.staging.find((u) => u.code === R.infiltrator)!.resources, 1);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("Raid: quest progress buffers active locations before removing fire, including immune Dream-chaser", () => {
  let s = second();
  const active = make(s, R.pillaged);
  active.progress = 2;
  active.damage = 3;
  s.activeLocation = active;
  const dream = s.staging.find((u) => u.code === R.dream)!;
  dream.damage = 4;
  progress(s, 5, true);
  flush(s);
  assert.ok(!get(s, active.id));
  assert.equal(
    s.choice?.title,
    "Sahír's Advance · Remove damage from locations",
  );
  s = pick(s, `${dream.id}:3`);
  assert.equal(s.staging.find((u) => u.code === R.dream)!.damage, 1);
  assert.equal(s.progress, 0);
});
test("Raid: victory requires Sahír in victory plus every location at zero damage", () => {
  let s = second();
  const sahir = s.staging.find((u) => u.code === R.sahir)!;
  s.staging.find((u) => u.code === R.dream)!.damage = 2;
  destroy(s, sahir);
  check(s);
  assert.equal(s.status, "playing");
  assert.ok(s.victoryCards?.includes(R.sahir));
  progress(s, 2);
  s = finish(s);
  check(s);
  assert.equal(s.status, "won");
});
test("Raid: Sahír cancels damage point by point, exhausting resources before excess damage", () => {
  const s = second();
  const sahir = s.staging.find((u) => u.code === R.sahir)!;
  sahir.resources = 3;
  assert.equal(damage(s, sahir.id, 2), false);
  assert.equal(sahir.damage, 0);
  assert.equal(sahir.resources, 1);
  damage(s, sahir.id, 3);
  assert.equal(sahir.damage, 2);
  assert.equal(sahir.resources, 0);
});
test("Raid: actual Corsair attacks steal resources and Ravager fire chooses tied lowest Aflame", () => {
  let s = base();
  const ravager = make(s, R.ravager);
  s.engaged.push(ravager);
  const a = ally(s);
  const runner = staged(s, R.runner);
  s.phase = "defense";
  ravager.shadows = ["01099"];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: ravager.id,
    defenderIds: [a.id],
  });
  s = settle(s);
  assert.equal(get(s, ravager.id)!.resources, 1);
  assert.equal(get(s, runner.id)!.damage, 1);
  const raider = make(s, R.raider);
  s.engaged.push(raider);
  s.phase = "defense";
  raider.shadows = ["01099"];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: raider.id,
    defenderIds: [s.heroes[0].id],
  });
  s = settle(s);
  assert.equal(get(s, raider.id)!.resources, 1);
});
test("Raid: end combat stage-one fire counts all Corsairs and uses lowest Aflame", () => {
  let s = base();
  staged(s, R.arsonist);
  staged(s, R.raider);
  const runner = staged(s, R.runner);
  handle(s, raidCombatEnd(s)[0]);
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === runner.id));
  s = pick(s, runner.id);
  s = settle(s);
  assert.equal(s.raidGreyHavens!.burned.length, 0);
  assert.equal(get(s, runner.id)!.damage, 2);
});
test("Raid: revealed Raider token survives cancellation; searched/add-to-staging Raiders get none", () => {
  const s = second();
  placeEncounter(s, R.raider, true, 0, undefined, true);
  assert.equal(s.staging.find((u) => u.code === R.raider)!.resources, 1);
  placeEncounter(s, R.infiltrator, false, 0, undefined, false);
  assert.equal(s.staging.find((u) => u.code === R.infiltrator)!.resources, 0);
});
test("Raid: Put to the Torch targets the revealing player's characters across hotseat", () => {
  let s = base(2);
  placeEncounter(s, R.torch);
  flush(s);
  const first = seatView(s, 0).heroes[0];
  s = pick(s, first.id);
  assert.equal(s.table!.active, 1);
  const h = seatView(s, 1).heroes[0];
  assert.ok(s.choice?.options.some((o) => o.id === h.id));
  s = pick(s, h.id);
  assert.ok(
    seatView(s, 1).heroes[0].damage === 3 ||
      !seatView(s, 1).heroes.some((u) => u.id === h.id),
  );
});
test("Raid: restored save rejects foreign burned cards and duplicate physical identities", () => {
  const s = base();
  const json = JSON.parse(JSON.stringify(s));
  json.raidGreyHavens.burned = [make(s, R.raider)];
  assert.equal(validateSave(json), false);
  const duplicate = JSON.parse(JSON.stringify(s));
  duplicate.raidGreyHavens.burned = [
    { ...duplicate.staging.find((u: Unit) => u.code === R.dream) },
  ];
  assert.equal(validateSave(duplicate), false);
});
test("Raid: Raid Leader steals from every hero and its defense changes with tokens", () => {
  let s = base(2);
  const leader = staged(s, R.leader);
  forOwner(s, 1, () => {
    s.heroes[0].resources = 0;
    engage(s, leader);
  });
  s = finish(s);
  const l = allEngaged(s).find((u) => u.id === leader.id)!;
  assert.equal(l.owner, 1);
  assert.equal(l.resources, 2);
  assert.equal(stats(s, l).defense, 3);
  l.resources = 0;
  assert.equal(stats(s, l).defense, 1);
});
test("Raid: Corsair Infiltrator steals only after resources and adds its shadows when it attacks", () => {
  let s = base();
  const infiltrator = make(s, R.infiltrator);
  s.engaged.push(infiltrator);
  s.heroes.forEach((h) => (h.resources = 0));
  handle(s, fx("resourceCollect"));
  flush(s);
  assert.ok(
    s.choice?.options.every((o) =>
      s.heroes.some((h) => h.id === o.id && h.resources === 1),
    ),
  );
  s = pick(s, s.heroes[0].id);
  const i = get(s, infiltrator.id)!;
  assert.equal(i.resources, 1);
  assert.equal(s.heroes[0].resources, 0);
  s.phase = "defense";
  i.shadows = ["01099"];
  s.encounterDeck = ["01099", ...s.encounterDeck];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: i.id,
    defenderId: s.heroes[1].id,
  });
  assert.equal(get(s, i.id)!.shadows.length, 2);
});
test("Raid: Na'asiyah discards engaged player's events, snapshots resources for each attack and discards one afterward", () => {
  let s = second(2);
  const n = s.staging.find((u) => u.code === R.naasiyah)!;
  forOwner(s, 1, () => {
    s.hand = [make(s, "01050"), make(s, "01036"), make(s, "01013")];
    engage(s, n);
  });
  s = finish(s);
  assert.equal(seatView(s, 1).hand.length, 1);
  assert.equal(allEngaged(s).find((u) => u.id === n.id)!.resources, 2);
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.phase = "attack";
  s.heroes[0].tempAttack = 4;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: n.id,
    attackerIds: [seatView(s, 1).heroes[0].id],
  });
  s = settle(s);
  const live = allEngaged(s).find((u) => u.id === n.id)!;
  assert.equal(live.resources, 1);
  assert.equal(live.raidCombatResourceBonus, undefined);
  assert.equal(stats(s, live).defense, 2);
});
test("Raid: elite enemies automatically engage first and last player, and discard effects route to victory", () => {
  let s = second(3);
  s.phase = "encounter";
  handle(s, fx("engagementRound"));
  s = finish(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === R.sahir));
  assert.ok(seatView(s, 2).engaged.some((u) => u.code === R.naasiyah));
  const n = allEngaged(s).find((u) => u.code === R.naasiyah)!;
  forOwner(s, 2, () => destroy(s, n, false));
  assert.ok(s.victoryCards?.includes(R.naasiyah));
  assert.ok(!s.encounterDiscard.includes(R.naasiyah));
});
test("Raid: actual Sahír attack gains four resources after destroying a character; Fires shadow also burns locations", () => {
  let s = second();
  const sahir = s.staging.find((u) => u.code === R.sahir)!;
  engage(s, sahir);
  s = finish(s);
  const victim = ally(s);
  s.phase = "defense";
  sahir.shadows = [R.fires];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: sahir.id,
    defenderId: victim.id,
  });
  s = settle(s);
  assert.ok(!get(s, victim.id));
  assert.equal(get(s, sahir.id)!.resources, 4);
  assert.equal(s.staging.find((u) => u.code === R.dream)!.damage, 1);
});
test("Raid: Burning Piers shadow transfers its physical shadow card to staging", () => {
  let s = base();
  const e = make(s, R.raider);
  s.engaged.push(e);
  e.shadows = [R.piers];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: s.heroes[0].id,
  });
  s = settle(s);
  assert.equal(get(s, e.id)!.shadows.filter((co) => co === R.piers).length, 0);
  assert.equal(s.staging.filter((u) => u.code === R.piers).length, 1);
});
test("Raid: White Ship travel searches without revealing, while Caravel distributes damage separately by player", () => {
  let s = base();
  const white = staged(s, R.white);
  s.encounterDeck = [R.arsonist, "01099"];
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: white.id });
  assert.match(s.choice!.title, /Find a Corsair/);
  s = pick(s, R.arsonist);
  assert.equal(s.activeLocation!.id, white.id);
  assert.ok(!s.choice);
  assert.ok(s.staging.some((u) => u.code === R.arsonist));
  s = base(2);
  const caravel = staged(s, R.caravel);
  caravel.damage = 2;
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: caravel.id });
  s = settle(s);
  assert.equal(s.activeLocation!.id, caravel.id);
  assert.equal(seatView(s, 0).heroes[0].damage, 2);
  assert.equal(seatView(s, 1).heroes[0].damage, 2);
});
test("Raid: Arsonist chooses maximum Aflame among deck and discard; Pillaged chooses topmost discarded enemy", () => {
  let s = base();
  s.encounterDeck = [R.runner, R.white, "01099"];
  s.encounterDiscard = [R.pillaged, R.piers];
  placeEncounter(s, R.arsonist);
  flush(s);
  s = pick(s, "search");
  assert.deepEqual(
    new Set(s.choice!.options.map((o) => o.code)),
    new Set([R.pillaged, R.piers]),
  );
  s = pick(s, R.piers);
  assert.ok(s.staging.some((u) => u.code === R.piers));
  s.encounterDiscard = [R.raider, R.fires, R.leader, R.torch];
  placeEncounter(s, R.pillaged);
  flush(s);
  s = pick(s, "enemy");
  assert.ok(s.staging.some((u) => u.code === R.leader));
  assert.ok(!s.staging.some((u) => u.code === R.raider));
});
test("Raid: canceling The Fires Spread preserves Doomed but suppresses location damage and conditional surge", () => {
  let s = base();
  s.hand = [make(s, "01050")];
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: "02081",
    exhausted: false,
  });
  s.encounterDeck = [R.fires, "01099"];
  const before = s.threat;
  handle(s, fx("reveal"));
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.id === "cancel"));
  s = pick(s, "cancel");
  s = settle(s);
  assert.equal(s.threat, before + 2);
  assert.equal(s.staging.find((u) => u.code === R.dream)!.damage, 0);
  assert.equal(s.encounterDeck[0], "01099");
  assert.ok(s.encounterDiscard.includes(R.fires));
});
test("Raid: searching both piles preserves the selected physical card's zone", () => {
  let s = base();
  s.encounterDeck = [R.raider, "01099"];
  s.encounterDiscard = [R.raider];
  handle(s, fx("raidSearchCorsair"));
  flush(s);
  assert.deepEqual(
    new Set(s.choice!.options.map((o) => o.id)),
    new Set([`deck:${R.raider}`, `discard:${R.raider}`]),
  );
  s = pick(s, `discard:${R.raider}`);
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.encounterDeck.filter((co) => co === R.raider).length, 1);
});
test("Raid: first-player stage 2 entry ordering attaches the real waiting Trap after reload", () => {
  let s = base();
  const trap = staged(s, "05017");
  s.encounterDeck = [R.runner, "01099"];
  progress(s, 18);
  flush(s);
  assert.match(s.choice!.title, /elite enemy's entry effects/);
  s = pick(s, "order-1");
  s = finish(s);
  assert.ok(
    s.staging
      .find((u) => u.code === R.naasiyah)!
      .attachments.some((a) => a.id === trap.id),
  );
  assert.ok(
    !s.staging
      .find((u) => u.code === R.sahir)!
      .attachments.some((a) => a.id === trap.id),
  );
  assert.ok(!s.staging.some((u) => u.id === trap.id));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("Raid: Fresh Tracks responds to a stage 2 elite before encounter reveals and survives reload", () => {
  let s = base();
  s.heroes[0] = make(s, "01005");
  s.heroes[0].resources = 3;
  s.hand = [make(s, "04078")];
  s.encounterDeck = [R.runner, "01099"];
  progress(s, 18);
  flush(s);
  s = pick(s, "order-1");
  assert.match(s.choice!.title, /Fresh Tracks/);
  assert.equal(s.encounterDeck[0], R.runner);
  assert.equal(s.stageRevealing, true);
  s = pick(s, "play");
  assert.equal(s.staging.find((u) => u.code === R.naasiyah)!.damage, 1);
  assert.ok(s.used.some((key) => key.startsWith("round:fresh-tracks:")));
  assert.ok(s.discard.includes("04078"));
  assert.equal(s.stageRevealing, false);
  assert.ok(s.staging.some((u) => u.code === R.runner));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
