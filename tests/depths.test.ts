import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import {
  fx,
  get,
  locationQuest,
  make,
  stats,
  stagingThreat,
  threatOf,
} from "../src/game/core";
import {
  damage,
  discardLocation,
  destroy,
  engage,
  progress,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  DEPTHS as D,
  DEPTHS_ENCOUNTERS,
  DEPTHS_QUESTS,
  DEPTHS_RECIPES,
  DEPTHS_CORSAIR_RAIDERS,
  depthsGrappledWith,
} from "../src/game/depths-support";
import { depthsAbilityProblem, depthsTravelStart } from "../src/game/depths";
import { WEATHER } from "../src/game/weather-hills-support";
import {
  base,
  start,
  stage3,
  add,
  choose,
  reload,
  settle,
} from "./depths-fixtures";
import type { GameState } from "../src/game/types";
const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
function third(players = 1) {
  const s = stage3(players);
  s.encounterDiscard.push(...s.depths!.grappled.map((g) => g.enemy.code));
  s.depths!.grappled = [];
  s.staging = s.staging.filter((u) => u.code === D.thing);
  s.encounterDeck = Array(30).fill(D.cargo);
  s.encounterDiscard = [];
  return s;
}
const captain = (s: GameState, code: string) =>
  allCharacters(s).find((u) => u.code === code)!;
function attack(
  s: GameState,
  code: string,
  shadows: string[],
  defenderId: string | null,
  player = 0,
) {
  const enemy = add(s, code, "engaged", player);
  enemy.shadows = [...shadows];
  s.phase = "defense";
  if (s.table) s.table.turn = player;
  selectSeat(s, player);
  return {
    enemy,
    state: applyAction(reload(s), {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId,
    }),
  };
}

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Depths ${easy ? "easy" : "standard"} ${players} players: original setup, quantities, private piles and reload`, () => {
      const s = start(players, easy),
        q = s.depths!;
      assert.equal(s.stage, 1);
      assert.equal(q.currentQuest, D.take);
      assert.deepEqual(q.questDeck, [D.change, D.defend]);
      assert.equal(s.encounterDeck.length, easy ? 13 : 20);
      assert.equal(q.beastDeck.length, easy ? 16 : 18);
      assert.deepEqual(
        s.staging.map((u) => u.code).sort(),
        [D.helm, D.raider].sort(),
      );
      assert.deepEqual(
        q.setAside.map((u) => u.code).sort(),
        [D.thing, D.sahir, D.naasiyah].sort(),
      );
      const recipe = DEPTHS_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const physical = [
        ...s.encounterDeck,
        ...q.beastDeck,
        ...s.staging.map((u) => u.code),
        ...q.setAside.map((u) => u.code),
      ];
      for (const c of recipe.cards.filter(
        (c) => c.section !== "sharedQuestDeck",
      ))
        assert.equal(
          physical.filter((x) => x === c.code).length,
          recipe.cards
            .filter((x) => x.code === c.code && x.section !== "sharedQuestDeck")
            .reduce((n, x) => n + x.quantity, 0),
          card(c.code).name,
        );
      assert.equal(s.sailing, undefined);
      assert.ok(validateSave(reload(s)));
    });

test("Depths originals register all printed faces, derived Elite backs and exact source recipe ids", () => {
  assert.equal(DEPTHS_RECIPES.find((r) => r.mode === "standard")!.id, "Q06.5");
  assert.equal(DEPTHS_RECIPES.find((r) => r.mode === "easy")!.id, "E06.5");
  assert.equal(DEPTHS_ENCOUNTERS.length, 23);
  assert.equal(DEPTHS_QUESTS.length, 3);
  for (const c of [...DEPTHS_ENCOUNTERS, ...DEPTHS_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    for (const src of [imageUrl(c), c.back_imagesrc].filter(Boolean))
      assert.ok(existsSync(`public${src}`), String(src));
  }
  assert.match(card(D.forecastle).shadow!, /no resources/);
  assert.match(card(D.giant).text!, /lowest printed quest/);
  assert.equal(card(D.sahirAlly).type_code, "objective-ally");
  assert.equal(card(D.naasiyahAlly).engagement, undefined);
  assert.equal(card(D.defend).back_quest, undefined);
});

test("Helm blocks main-quest progress until victory; actual exploration performs both quest transitions and flips physical captains", () => {
  let s = base(2);
  progress(s, 4);
  s = finish(s);
  assert.equal(s.progress, 0);
  assert.equal(s.stage, 1);
  const ids = s
    .depths!.setAside.filter((u) => [D.sahir, D.naasiyah].includes(u.code))
    .map((u) => u.id);
  progressLocation(
    s,
    s.staging.find((u) => u.code === D.helm)!,
    1,
  );
  s.staging.push(make(s, D.cargo));
  progress(s, 4);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.deepEqual(s.depths!.completedQuests, [D.take, D.change]);
  assert.ok(s.victoryCards!.includes(D.helm));
  assert.deepEqual(
    allCharacters(s)
      .filter((u) => [D.sahirAlly, D.naasiyahAlly].includes(u.code))
      .map((u) => u.id)
      .sort(),
    ids.sort(),
  );
  assert.equal(ownerOf(s, captain(s, D.sahirAlly)), 0);
  assert.equal(ownerOf(s, captain(s, D.naasiyahAlly)), 1);
  assert.equal(s.depths!.setAside.length, 0);
  assert.equal(s.depths!.beastDeck.length, 0);
  assert.ok(
    ![
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...allEngaged(s).map((u) => u.code),
    ].some((c) => DEPTHS_CORSAIR_RAIDERS.includes(c)),
  );
  reload(s);
});

test("stage-one out-of-play Captains gain round resources only while both are absent", () => {
  let s = base();
  handle(s, fx("endRound"));
  s = finish(s);
  assert.deepEqual(
    s
      .depths!.setAside.filter((u) => [D.sahir, D.naasiyah].includes(u.code))
      .map((u) => u.resources),
    [1, 1],
  );
  const sahir = s.depths!.setAside.find((u) => u.code === D.sahir)!;
  s.depths!.setAside = s.depths!.setAside.filter((u) => u.id !== sahir.id);
  s.staging.push(sahir);
  handle(s, fx("endRound"));
  s = finish(s);
  assert.equal(
    s.depths!.setAside.find((u) => u.code === D.naasiyah)!.resources,
    1,
  );
  assert.equal(get(s, sahir.id)!.resources, 1);
});

test("Helm quest points count resources on Raider enemies and its active-location trigger brings both enemy Captains", () => {
  let s = base(2);
  const helm = s.staging.find((u) => u.code === D.helm)!,
    raider = s.staging.find((u) => u.code === D.raider)!;
  raider.resources = 3;
  assert.equal(locationQuest(s, helm), 4);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: helm.id });
  s = finish(s);
  assert.equal(s.activeLocation!.id, helm.id);
  assert.ok(s.staging.some((u) => u.code === D.sahir));
  assert.ok(s.staging.some((u) => u.code === D.naasiyah));
  const sahir = s.staging.find((u) => u.code === D.sahir)!;
  damage(s, sahir.id, 99);
  flush(s);
  assert.ok(
    get(s, sahir.id),
    "stage-one grant is Indestructible, not damage prevention",
  );
});

test("Sahír cancels one damage per discarded resource and rewards actual attacks, including destroyed characters", () => {
  let s = base();
  const sahir = s.depths!.setAside.find((u) => u.code === D.sahir)!;
  s.depths!.setAside = s.depths!.setAside.filter((u) => u.id !== sahir.id);
  s.engaged.push(sahir);
  sahir.resources = 2;
  damage(s, sahir.id, 3);
  assert.equal(sahir.resources, 0);
  assert.equal(sahir.damage, 1);
  sahir.shadows = [D.cargo];
  s.phase = "defense";
  const defender = s.heroes[0];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: sahir.id,
    defenderId: defender.id,
  });
  s = finish(s);
  assert.equal(get(s, sahir.id)!.resources, 2);
  const ally = add(s, "01018", "allies");
  get(s, sahir.id)!.attacked = false;
  get(s, sahir.id)!.shadows = [D.cargo];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: sahir.id,
    defenderId: ally.id,
  });
  s = finish(s);
  assert.equal(get(s, sahir.id)!.resources, 6);
  assert.ok(!get(s, ally.id));
});

test("front Na’asiyah engages the last player, discards only their events, snapshots resources and clears her attack bonus", () => {
  let s = base(2);
  const n = s.depths!.setAside.find((u) => u.code === D.naasiyah)!;
  s.depths!.setAside = s.depths!.setAside.filter((u) => u.id !== n.id);
  s.staging.push(n);
  forOwner(s, 1, () => {
    s.hand = [make(s, "01050"), make(s, "01018"), make(s, "01048")];
  });
  forOwner(s, 1, () => engage(s, n));
  s = finish(s);
  assert.equal(ownerOf(s, get(s, n.id)!), 1);
  assert.equal(get(s, n.id)!.resources, 2);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    ["01018"],
  );
  assert.equal(seatView(s, 0).hand.length, 0);
  s.phase = "defense";
  s.table!.turn = 1;
  selectSeat(s, 1);
  get(s, n.id)!.shadows = [D.cargo];
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: n.id,
    defenderId: seatView(s, 1).heroes[0].id,
  });
  s = finish(s);
  assert.equal(get(s, n.id)!.resources, 1);
  assert.equal(stats(s, get(s, n.id)!).attack, 2);
  assert.equal(
    stats(s, get(s, n.id)!).defense,
    4,
    "Cargo shadow lasts through the phase",
  );
});

test("objective Captain payment uses a controlled effective hero, costs once per round, and Sahír caps resource stats at six", () => {
  let s = third();
  const sahir = captain(s, D.sahirAlly),
    h = s.heroes[0];
  const before = h.resources;
  s = applyAction(reload(s), { type: "ABILITY", id: sahir.id });
  s = choose(reload(s), h.id);
  s = finish(s);
  assert.equal(get(s, h.id)!.resources, before - 1);
  assert.equal(get(s, h.id)!.resourcesSpentRound, s.round);
  assert.equal(get(s, sahir.id)!.resources, 1);
  assert.match(depthsAbilityProblem(s, get(s, sahir.id)!)!, /already/);
  get(s, sahir.id)!.resources = 9;
  assert.equal(stats(s, get(s, sahir.id)!).attack, 6);
  assert.equal(stats(s, get(s, sahir.id)!).will, 6);
  const sword = make(s, "01014");
  sword.resources = 1;
  sword.attachments.push({
    id: `a${s.nextId++}`,
    code: "10149",
    exhausted: false,
  });
  s.heroes.forEach((h) => (h.resources = 0));
  s.heroes.push(sword);
  s.used = [];
  s = applyAction(reload(s), { type: "ABILITY", id: sahir.id });
  assert.ok(s.choice!.options.some((o) => o.id === sword.id));
  s = choose(reload(s), sword.id);
  s = finish(s);
  assert.equal(get(s, sword.id)!.resources, 0);
});

test("remote Na’asiyah defense actions survive save/reload, spend her tokens repeatedly and expire with this attack", () => {
  let s = third(2);
  const n = captain(s, D.naasiyahAlly);
  n.resources = 2;
  const r = attack(s, D.thrashing, [D.cargo], n.id, 1);
  s = r.state;
  assert.equal(s.table!.active, 1);
  assert.match(s.choice!.title, /Na'asiyah/);
  s = choose(reload(s), "defense");
  s = choose(reload(s), "defense");
  s = choose(reload(s), "continue");
  s = finish(s);
  assert.equal(get(s, n.id)!.damage, 0);
  assert.equal(get(s, n.id)!.resources, 0);
  assert.equal(stats(s, get(s, n.id)!).defense, 2);
  assert.equal(s.depths!.combatBoosts.length, 0);
  assert.equal(s.status, "playing");
});

test("Na’asiyah attack actions change actual attack damage and clear after resolution", () => {
  let s = third();
  const n = captain(s, D.naasiyahAlly);
  n.resources = 2;
  const enemy = add(s, D.giant, "engaged");
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [n.id],
  });
  s = choose(reload(s), "attack");
  s = choose(reload(s), "continue");
  s = finish(s);
  assert.equal(get(s, enemy.id)!.damage, 3);
  assert.equal(stats(s, get(s, n.id)!).attack, 2);
  assert.equal(get(s, n.id)!.resources, 1);
});

test("Weather Deck grants one payable exhaustion per copy and player to other Deck locations; Crew travel includes objective Raiders", () => {
  let s = third(2);
  const w = add(s, D.weather),
    quarter = add(s, D.quarter);
  add(s, D.weather);
  s.phase = "travel";
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.exhausted = true)));
  assert.match(canTravel(s, quarter)!, /each player/);
  assert.equal(canTravel(s, w), null);
  forOwner(s, 1, () => s.heroes.forEach((h) => (h.exhausted = false)));
  s = applyAction(reload(s), { type: "TRAVEL", id: quarter.id });
  s = finish(s);
  for (const p of [0, 1])
    assert.equal(seatView(s, p).heroes.filter((h) => h.exhausted).length, 2);
  s.phase = "travel";
  depthsTravelStart(s);
  const crew = add(s, D.crew);
  const sahir = captain(s, D.sahirAlly),
    n = captain(s, D.naasiyahAlly);
  s = applyAction(reload(s), { type: "TRAVEL", id: crew.id });
  s = finish(s);
  assert.equal(get(s, sahir.id)!.resources, 1);
  assert.equal(get(s, n.id)!.resources, 1);
});

test("Forecastle travel reveals a selected physical enemy and resolves Grapple rather than placing it directly", () => {
  let s = third();
  const forecastle = add(s, D.forecastle);
  s.encounterDeck = [D.giant, D.cargo, D.crew];
  s.encounterDiscard = [D.grasping];
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: forecastle.id });
  assert.match(s.choice!.title, /Choose an enemy/);
  assert.equal(s.choice!.options.length, 2);
  s = choose(reload(s), "discard-0");
  s = finish(s);
  assert.ok(!s.encounterDiscard.includes(D.grasping));
  assert.ok(
    s.staging.some((u) => u.code === D.grasping),
    "no staged host means ordinary staging",
  );
  assert.equal(s.encounterDeck.length, 3);
  reload(s);
});

test("From the Depths discards exactly three, resolves each discarded Grapple, and plain location discard removes attached enemies without boss damage", () => {
  let s = third();
  const host = add(s, D.cargo),
    thing = s.staging.find((u) => u.code === D.thing)!;
  s.encounterDeck = [D.giant, D.cargo, D.grasping, D.crew];
  revealed(s, D.from);
  s = finish(s);
  assert.equal(depthsGrappledWith(s, host.id).length, 2);
  assert.equal(s.encounterDeck.length, 1);
  assert.ok(s.encounterDiscard.includes(D.cargo));
  discardLocation(s, get(s, host.id)!);
  s = finish(s);
  assert.equal(s.depths!.grappled.length, 0);
  assert.equal(get(s, thing.id)!.damage, 0);
  assert.ok(s.encounterDiscard.includes(D.giant));
  assert.ok(s.encounterDiscard.includes(D.grasping));
});

test("canceling From the Depths prevents its discard effect, while Grapple remains an uncancelled keyword", () => {
  let s = third();
  s.heroes.push(Object.assign(make(s, "01007"), { resources: 1 }));
  s.hand = [make(s, "01050")];
  const before = [...s.encounterDeck];
  revealed(s, D.from);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "cancel"));
  s = choose(reload(s), "cancel");
  s = finish(s);
  assert.deepEqual(s.encounterDeck, before);
  assert.ok(s.encounterDiscard.includes(D.from));
  add(s, D.cargo);
  revealed(s, D.giant);
  s = finish(s);
  assert.equal(s.depths!.grappled.length, 1);
});

test("Hold Steady uses each character's current defense across the whole table", () => {
  let s = third(2);
  const low = add(s, "01018", "allies", 1),
    high = add(s, "01018", "allies", 0);
  high.tempDefense = 2;
  revealed(s, D.steady);
  s = finish(s);
  assert.ok(get(s, low.id)!.exhausted);
  assert.ok(!get(s, high.id)!.exhausted);
  for (const u of allCharacters(s))
    assert.equal(u.exhausted, stats(s, u).defense <= 1);
});

test("normal Grasping Arm exhausts before defender declaration, and the forced cost cannot exhaust the already declared defender", () => {
  let s = third();
  const initial = s.heroes[0],
    actual = s.heroes[1];
  const r = attack(s, D.grasping, [D.cargo], initial.id);
  s = r.state;
  assert.equal(s.combat, null);
  assert.match(s.choice!.title, /Exhaust a character/);
  assert.ok(!get(s, initial.id)!.exhausted);
  s = choose(reload(s), initial.id);
  assert.match(s.choice!.title, /Declare defenders/);
  assert.ok(!s.choice!.options.some((o) => o.id === initial.id));
  s = choose(reload(s), actual.id);
  s = finish(s);
  assert.ok(get(s, initial.id)!.exhausted);
  assert.ok(get(s, actual.id)!.exhausted);
  assert.equal(
    get(s, actual.id)!.damage,
    Math.max(0, 4 - stats(s, get(s, actual.id)!).defense),
  );
});

test("Giant Arm receives its conditional attack bonus against allies and not heroes", () => {
  for (const ally of [false, true]) {
    let s = third();
    const defender = ally ? add(s, "01018", "allies") : s.heroes[0];
    defender.tempDefense = 5;
    const r = attack(s, D.giant, [D.cargo], defender.id);
    s = finish(r.state);
    assert.equal(
      get(s, defender.id)?.damage ?? 0,
      Math.max(0, (ally ? 6 : 4) - (card(defender.code).defense ?? 0) - 5),
    );
  }
});

test("Thrashing Arm end-combat damage is assigned to its engaged player after ordinary attacks", () => {
  let s = third(2);
  add(s, D.thrashing, "engaged", 1);
  s.phase = "attack";
  handle(s, fx("endCombat"));
  flush(s);
  assert.equal(s.table!.active, 1);
  const h = seatView(s, 1).heroes[0];
  s = choose(reload(s), h.id);
  s = finish(s);
  assert.equal(get(s, h.id)!.damage, 3);
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
});

test("Lashing Tentacles revelation attacks each living player in turn order with its own fresh shadow", () => {
  let s = third(2);
  s.table!.first = 1;
  s.table!.turn = 1;
  selectSeat(s, 1);
  const thing = s.staging.find((u) => u.code === D.thing)!;
  s.encounterDeck = [D.cargo, D.cargo, D.cargo];
  revealed(s, D.lashing);
  flush(s);
  for (const p of [1, 0]) {
    assert.equal(s.combat!.enemyId, thing.id);
    assert.equal(s.combat!.attackPlayer, p);
    assert.deepEqual(get(s, thing.id)!.shadows, [D.cargo]);
    s = choose(reload(s), seatView(s, p).heroes[0].id);
  }
  s = finish(s);
  assert.equal(s.combat, null);
  assert.ok(!allEngaged(s).some((u) => u.id === thing.id));
});

test("Lashing shadow waits for the original damage, then starts a separate boss attack", () => {
  let s = third();
  const defender = s.heroes[0];
  const r = attack(s, D.thrashing, [D.lashing], defender.id);
  s = r.state;
  assert.equal(
    get(s, defender.id)!.damage,
    5 - stats(s, get(s, defender.id)!).defense,
  );
  assert.equal(
    s.combat!.enemyId,
    s.staging.find((u) => u.code === D.thing)!.id,
  );
  s = choose(reload(s), s.heroes[1].id);
  s = finish(s);
  assert.equal(s.combat, null);
  assert.ok(
    get(s, r.enemy.id)!.shadows.includes(D.lashing),
    "the original physical shadow remains until combat end",
  );
  handle(s, fx("endCombat"));
  s = finish(s);
  assert.ok(s.encounterDiscard.includes(D.lashing));
});

test("Weather and Quarter shadows exhaust or discard only the defending player's controlled cards", () => {
  let s = third(2);
  const defender = seatView(s, 1).heroes[0],
    spare = seatView(s, 1).heroes[1];
  defender.attachments.push({
    id: `a${s.nextId++}`,
    code: "01039",
    exhausted: false,
    owner: 1,
  });
  const a = defender.attachments[0];
  const r = attack(s, D.giant, [D.weather, D.quarter], defender.id, 1);
  s = r.state;
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), spare.id);
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), a.id);
  s = finish(s);
  assert.ok(get(s, spare.id)!.exhausted);
  assert.ok(seatView(s, 1).discard.includes("01039"));
  assert.ok(!seatView(s, 0).discard.includes("01039"));
});

test("From the Depths shadow assigns one damage per staged grapple to the attacked player's characters", () => {
  let s = third(2);
  add(s, D.cargo);
  s.encounterDeck = [D.cargo];
  revealed(s, D.giant);
  s = finish(s);
  revealed(s, D.grasping);
  s = finish(s);
  const defender = seatView(s, 1).heroes[0],
    target = seatView(s, 1).heroes[1];
  const r = attack(s, D.giant, [D.from], defender.id, 1);
  s = r.state;
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), target.id);
  s = choose(reload(s), target.id);
  s = finish(s);
  assert.equal(get(s, target.id)!.damage, 2);
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
});

test("Hold Steady shadow discards a zero-defense ally and gives a nonzero defender minus two defense for only this attack", () => {
  let s = third();
  const ally = add(s, "01018", "allies");
  let r = attack(s, D.giant, [D.steady], ally.id);
  s = r.state;
  assert.ok(!get(s, ally.id));
  s = finish(s);
  s = third();
  const defender = s.heroes[0];
  r = attack(s, D.giant, [D.steady], defender.id);
  s = finish(r.state);
  assert.equal(
    get(s, defender.id)!.damage,
    4 - Math.max(0, (card(defender.code).defense ?? 0) - 2),
  );
  assert.equal(
    stats(s, get(s, defender.id)!).defense,
    card(defender.code).defense,
  );
});

test("Creature destruction actually defeats the immune boss, while ordinary card effects cannot target or engage it", () => {
  let s = third();
  const thing = s.staging.find((u) => u.code === D.thing)!;
  assert.equal(stats(s, thing).health, 11);
  thing.damage = 10;
  const creature = add(s, D.giant, "engaged");
  creature.damage = 5;
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: creature.id,
    attackerIds: [s.heroes[0].id],
  });
  s = finish(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /Stormcaller/);
  assert.ok(s.victoryCards!.includes(D.thing));
});

test("stage-three round loss uses one Ship's total threat including Grapples, not the total of all Ships", () => {
  let s = third();
  const a = add(s, D.forecastle),
    b = add(s, D.quarter);
  s.encounterDeck = Array(20).fill(D.cargo);
  assert.equal(stagingThreat(s), 9);
  handle(s, fx("endRound"));
  s = finish(s);
  assert.equal(s.status, "playing");
  s.phase = "planning";
  get(s, a.id)!.tempThreat = 6;
  handle(s, fx("endRound"));
  s = finish(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /9 or more/);
  assert.equal(threatOf(s, get(s, b.id)!), 4);
});

test("both recovered objective allies follow first/last control and either leaving play loses immediately", () => {
  let s = third(3);
  s.table!.first = 1;
  handle(s, fx("endRound"));
  s = finish(s);
  const order = [
    s.table!.first,
    (s.table!.first + 1) % 3,
    (s.table!.first + 2) % 3,
  ];
  assert.equal(ownerOf(s, captain(s, D.sahirAlly)), order[0]);
  assert.equal(ownerOf(s, captain(s, D.naasiyahAlly)), order[2]);
  destroy(s, captain(s, D.naasiyahAlly), false);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /leaves play/);
});

test("a blanked objective loss clause stays inactive when its ally leaves; restoring its text restores the loss trigger", () => {
  let s = third();
  const n = captain(s, D.naasiyahAlly);
  s.questAttachments = {
    [D.defend]: [
      { id: `a${s.nextId++}`, code: WEATHER.cold, exhausted: false },
    ],
  };
  n.damage = 1;
  destroy(s, n, false);
  s = finish(s);
  assert.equal(s.status, "playing");
  reload(s);
  const returned = add(s, D.naasiyahAlly, "allies");
  returned.blanked = false;
  destroy(s, returned, false);
  assert.equal(s.status, "lost");
});

test("Giant shadow's engaged option conserves the physical card, owner and newly dealt shadow across reload", () => {
  let s = third(2);
  const defender = seatView(s, 1).heroes[0];
  const r = attack(s, D.thrashing, [D.giant], defender.id, 1);
  s = r.state;
  const physical = s.depths!.pendingEnemies[0].id;
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), "engage");
  s = finish(s);
  assert.equal(s.depths!.pendingEnemies.length, 0);
  assert.equal(ownerOf(s, get(s, physical)!), 1);
  assert.deepEqual(get(s, physical)!.shadows, [D.cargo]);
  assert.equal(get(s, r.enemy.id)!.shadows.length, 0);
  assert.ok(!s.encounterDiscard.includes(D.giant));
  reload(s);
});

test("Cargo Hold's active defense and Crew shadow's attack modifier change actual combat", () => {
  let s = third();
  const defender = s.heroes[0],
    enemy = add(s, D.giant, "engaged");
  s.activeLocation = make(s, D.cargo);
  assert.equal(stats(s, enemy).defense, 2);
  enemy.shadows = [D.crew];
  s.phase = "defense";
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender.id,
  });
  s = finish(s);
  assert.equal(
    get(s, defender.id)!.damage,
    6 - stats(s, get(s, defender.id)!).defense,
  );
  s.activeLocation = null;
  assert.equal(stats(s, get(s, enemy.id)!).defense, 1);
});

test("simultaneous Giant and Lashing delayed shadows get a saved first-player order choice after damage", () => {
  let s = third(2);
  const host = add(s, D.cargo),
    defender = seatView(s, 1).heroes[0];
  const r = attack(s, D.thrashing, [D.lashing, D.giant], defender.id, 1);
  s = r.state;
  assert.match(s.choice!.title, /next after-attack/);
  assert.equal(s.table!.active, 0);
  assert.equal(
    get(s, defender.id)!.damage,
    5 - stats(s, get(s, defender.id)!).defense,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.code).sort(),
    [D.giant, D.lashing].sort(),
  );
  assert.ok(s.choice!.options.every((o) => !o.label.startsWith("depths")));
  const giant = s.choice!.options.find((o) => o.code === D.giant)!;
  s = choose(reload(s), giant.id);
  assert.match(s.choice!.title, /Giant Arm/);
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), "grapple");
  assert.equal(depthsGrappledWith(s, host.id).length, 1);
  assert.equal(
    s.combat!.enemyId,
    s.staging.find((u) => u.code === D.thing)!.id,
  );
  assert.equal(s.combat!.attackPlayer, 1);
  s = choose(reload(s), seatView(s, 1).heroes[1].id);
  s = finish(s);
  assert.equal(s.combat, null);
  assert.equal(s.depths!.pendingEnemies.length, 0);
  reload(s);
});

test("Eye's additional boss attack discards its old Quarter shadow before fresh-shadow declaration", () => {
  let s = third();
  const thing = s.staging.find((u) => u.code === D.thing)!;
  add(s, D.eye, "engaged");
  s.activeLocation = make(s, D.quarter);
  s.encounterDeck = [D.quarter, D.cargo, D.crew, D.cargo];
  s.phase = "encounter";
  handle(s, fx("startCombat"));
  flush(s);
  assert.equal(s.combat!.enemyId, thing.id);
  assert.deepEqual(get(s, thing.id)!.shadows, [D.crew]);
  assert.equal(
    s.encounterDiscard.filter((c) => c === D.quarter).length,
    1,
    "the old physical card is already available in encounter discard at the first declaration",
  );
  assert.deepEqual(
    s.combat!.immediatePreviousShadows ?? [],
    [],
    "the old Quarter shadow is not suspended for restoration",
  );
  s = choose(reload(s), s.heroes[0].id);
  s = finish(s);
  assert.equal(s.encounterDiscard.filter((c) => c === D.quarter).length, 1);
  assert.ok(!get(s, thing.id)!.shadows.includes(D.quarter));
  reload(s);
});

test("nonlethal Creature Forced damage uses its snapshot before Secret Vigil's destruction response", () => {
  let s = third();
  const thing = s.staging.find((u) => u.code === D.thing)!,
    arm = add(s, D.thrashing, "engaged");
  arm.damage = 1;
  arm.attachments.push({
    id: `a${s.nextId++}`,
    code: "09012",
    exhausted: false,
    owner: 0,
  });
  assert.equal(threatOf(s, arm), 2);
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: arm.id,
    attackerIds: s.heroes.map((h) => h.id),
  });
  assert.equal(s.status, "playing");
  assert.match(s.choice!.title, /Secret Vigil/);
  assert.equal(
    get(s, thing.id)!.damage,
    2,
    "the Forced effect has already resolved when the Response is offered",
  );
  assert.ok(!get(s, arm.id));
  assert.equal(s.encounterDiscard.filter((c) => c === D.thrashing).length, 1);
  assert.equal(s.discard.filter((c) => c === "09012").length, 1);
  assert.ok(!s.queue.some((e) => e.kind === "depthsThingDamage"));
  s = choose(reload(s), "skip");
  s = finish(s);
  assert.equal(get(s, thing.id)!.damage, 2);
  reload(s);
});

test("non-combat Creature destruction also resolves boss Forced damage before its optional response", () => {
  let s = third();
  const thing = s.staging.find((u) => u.code === D.thing)!,
    arm = add(s, D.thrashing);
  arm.attachments.push({
    id: `a${s.nextId++}`,
    code: "09012",
    exhausted: false,
    owner: 0,
  });
  damage(s, arm.id, 7);
  flush(s);
  assert.equal(get(s, thing.id)!.damage, 2);
  assert.match(s.choice!.title, /Secret Vigil/);
  assert.ok(!get(s, arm.id));
  s = choose(reload(s), "skip");
  s = finish(s);
  reload(s);
});
