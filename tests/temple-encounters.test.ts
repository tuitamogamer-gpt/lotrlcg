import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, optionalEngagementProblem } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  stats,
  stagingThreat,
  threatOf,
  engagementCost,
} from "../src/game/core";
import {
  damage,
  destroy,
  engage,
  progressLocation,
  revealed,
  check,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  TEMPLE as T,
  TEMPLE_RECIPES,
  templeMapUnits,
  templeAdjacent,
} from "../src/game/temple-support";
import {
  templeEncounterStart,
  templeLocationFlipped,
  templeEncounterAbilityProblem,
} from "../src/game/temple-encounters";
import { WEATHER } from "../src/game/weather-hills-support";
import { templeFlip, templeTravelStart } from "../src/game/temple";
import {
  base,
  start,
  add,
  choose,
  reload,
  settle,
  setActive,
  setFace,
  cell,
} from "./temple-fixtures";
import type { GameState } from "../src/game/types";

const finish = (s: GameState) => {
  flush(s);
  return settle(s);
};
const captain = (s: GameState, code: string) =>
  allCharacters(s).find((u) => u.code === code)!;
function reveal(s: GameState, code: string) {
  revealed(s, code);
  flush(s);
  return s;
}
function defend(
  s: GameState,
  code: string,
  shadows: string[],
  defenderId: string | null,
  player = 0,
) {
  const enemy = add(s, code, "engaged", player);
  enemy.shadows = shadows;
  s.phase = "defense";
  if (s.table) s.table.turn = player;
  selectSeat(s, player);
  return {
    enemyId: enemy.id,
    state: applyAction(reload(s), {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId,
    }),
  };
}

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`original Temple ${easy ? "easy" : "standard"} ${players}-player setup conserves map/Guardian/key/companions and skips opening flip effects`, () => {
      const s = start(players, easy),
        q = s.temple!;
      assert.equal(q.map.length, 15);
      assert.equal(
        q.outOfStaging.length +
          s.staging.filter((u) => q.map.some((c) => c.id === u.id)).length +
          1,
        15,
      );
      assert.equal(s.encounterDeck.length, easy ? 25 : 32);
      assert.equal(q.setAside.length, 0);
      const guardian = s.staging.find((u) => u.code === T.guardian)!,
        key = s.staging.find((u) => u.code === T.key)!;
      assert.equal(guardian.guarding, key.id);
      assert.equal(threatOf(s, guardian), players);
      assert.equal(ownerOf(s, captain(s, T.sahirAlly)), 0);
      assert.equal(ownerOf(s, captain(s, T.naasiyahAlly)), players - 1);
      assert.equal(captain(s, T.sahirAlly).resources, 0);
      assert.equal(
        templeMapUnits(s).filter((u) => !q.hiddenBacks[u.id]).length,
        2,
      );
      assert.equal(
        Object.keys(q.lookedBy).length,
        0,
        "opening Jagged flip never peeks",
      );
      assert.equal(
        s.encounterDiscard.length,
        0,
        "opening Graves flip never discards",
      );
      const recipe = TEMPLE_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      assert.equal(recipe.id, easy ? "E06.6" : "Q06.6");
      for (const c of recipe.cards.filter(
        (c) => c.section === "sharedEncounterDeck",
      ))
        assert.equal(
          s.encounterDeck.filter((code) => code === c.code).length,
          c.quantity,
        );
      reload(s);
    });

test("Guardian and Watcher prohibit only optional engagement; Cursed Temple and Caverns modify actual engagement", () => {
  let s = base(2);
  const guardian = s.staging.find((u) => u.code === T.guardian)!;
  s.phase = "encounter";
  assert.match(optionalEngagementProblem(s, guardian)!, /optionally/);
  const watcher = add(s, T.watcher);
  assert.match(optionalEngagementProblem(s, watcher)!, /optionally/);
  setActive(s, T.cursed);
  assert.equal(engagementCost(s, guardian), 0);
  setActive(s, T.caverns);
  assert.equal(engagementCost(s, guardian), 60);

  s = reload(s);
  forOwner(s, 1, () => engage(s, get(s, guardian.id)!, true));
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === guardian.id));
});

test("Temple Halls modifies actual all-seat characters; Flooded and engaged Faithless add their current threat", () => {
  const s = base(2),
    h = s.heroes[0],
    normal = stats(s, h);
  setActive(s, T.halls, 1, 4);
  assert.equal(stats(s, h).attack, normal.attack - 1);
  assert.equal(stats(s, h).defense, normal.defense - 1);
  const flooded = setActive(s, T.flooded);
  flooded.tempThreat = 2;
  const before = stagingThreat(s),
    enemy = add(s, T.desecrator, "engaged", 1);
  enemy.tempThreat = 1;
  assert.equal(stagingThreat(s), before + 3);
  enemy.blanked = true;
  assert.equal(stagingThreat(s), before);
  assert.ok(stagingThreat(s) >= 5, "active Flooded current threat contributes");
});

test("Deeper snapshots every leftward map face including outside staging, stacks and expires; conditional Doom is canceled with WR", () => {
  let s = base(2);
  setActive(s, T.flooded, 1, 3);
  s.phase = "staging";
  const expected = [0, 1, 2]
    .map((col) => cell(s, 1, col))
    .reduce((n, u) => n + threatOf(s, u), 0);
  assert.ok(!s.staging.includes(cell(s, 1, 0)));
  s = reveal(s, T.deeper);
  assert.equal(s.temple!.phaseThreat, expected);
  s = reveal(s, T.deeper);
  assert.equal(s.temple!.phaseThreat, 2 * expected);
  handle(s, fx("phaseEnd"));
  assert.equal(s.temple!.phaseThreat, 0);
  setActive(s, T.flooded, 1, 0);
  const threat = s.threat;
  s = reveal(s, T.deeper);
  assert.equal(s.threat, threat + 1);
  s = base(3);
  setActive(s, T.flooded, 1, 0);
  s.phase = "staging";
  add(s, "01050", "hand", 2);
  s = reveal(s, T.deeper);
  assert.match(s.choice!.title, /Revealed:/);
  const cancel = s.choice!.options.find((o) => /Test of Will/.test(o.label))!;
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.equal(
    s.threat,
    20,
    "the conditional body Doom was not treated as a printed keyword",
  );
});

test("Sunken snapshots staged Uncharted copies, discards resources from effective heroes and objective allies across seats", () => {
  let s = base(2);
  setActive(s, T.cursed);
  s.phase = "staging";
  const targets = s.staging
    .filter((u) => [T.lost, T.temple].includes(u.code))
    .map((u) => u.id);
  const sword = add(s, "04058", "allies", 1);
  sword.attachments.push({
    id: `c${s.nextId++}`,
    code: "10149",
    exhausted: false,
  });
  sword.resources = 3;
  forOwner(s, 1, () => {
    s.allies = s.allies.filter((u) => u.id !== sword.id);
    s.heroes.push(sword);
  });
  s = finish(reveal(s, T.sunken));
  assert.equal(get(s, sword.id)!.resources, 2);
  for (const p of playerOrder(s))
    for (const h of seatView(s, p).heroes.filter((h) => h.id !== sword.id))
      assert.equal(h.resources, 9);
  assert.equal(captain(s, T.sahirAlly).resources, 9);
  assert.equal(captain(s, T.naasiyahAlly).resources, 9);
  for (const id of targets) assert.equal(threatOf(s, get(s, id)!), 3);
  const other = templeMapUnits(s).find(
    (u) => u.code === T.lost && !targets.includes(u.id),
  )!;
  assert.equal(threatOf(s, other), 2);
  handle(s, fx("phaseEnd"));
  for (const id of targets) assert.equal(threatOf(s, get(s, id)!), 2);
});

test("Dwindling randomly discards independently to three; only an actual zero-discard resolution gains Doom", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    for (let i = 0; i < 5; i++) add(s, "01018", "hand", p);
  s = finish(reveal(s, T.supplies));
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).hand.length, 3);
    assert.equal(seatView(s, p).discard.length, 2);
    assert.equal(seatView(s, p).threat, 20);
  }
  s = finish(reveal(s, T.supplies));
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
});

test("Furious Rainstorm routes saved separate choices to each player's own committed characters", () => {
  let s = base(2);
  for (const p of playerOrder(s))
    for (const h of seatView(s, p).heroes.slice(0, p + 1)) h.committed = true;
  s = reveal(s, T.rain);
  assert.equal(s.table!.active, 0);
  s = choose(reload(s), "threat");
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), "damage");
  s = finish(s);
  assert.equal(seatView(s, 1).threat, 20);
  assert.deepEqual(
    seatView(s, 1).heroes.map((h) => h.damage),
    [1, 1, 0],
  );
});

test("actual Jungle flip exhausts only ready characters with current attack at least two, with saved seat ownership", () => {
  let s = base(2);
  const u = setActive(s, T.flooded),
    target = setFace(s, u.id, T.jungle, true);
  templeFlip(s, target);
  flush(s);
  assert.match(s.choice!.title, /Jungle Path/);
  for (const option of s.choice!.options)
    assert.ok(stats(s, get(s, option.id)!).attack >= 2);
  const first = s.choice!.options[0].id;
  s = choose(reload(s), first);
  assert.equal(get(s, first)!.exhausted, true);
  assert.equal(s.table!.active, 1);
  const second = s.choice!.options[0].id;
  s = choose(reload(s), second);
  s = finish(s);
  assert.equal(get(s, second)!.exhausted, true);
});

test("actual Jagged flip grants shared peek of each orthogonal Lost Island, including the excluded right location", () => {
  let s = base(2);
  const u = setActive(s, T.flooded),
    target = setFace(s, u.id, T.cliffs, true);
  const adjacent = templeAdjacent(s, target.id)
    .filter((u) => u.code === T.lost)
    .map((u) => u.id);
  templeFlip(s, target);
  s = finish(s);
  for (const id of adjacent) assert.deepEqual(s.temple!.lookedBy[id], [0, 1]);
  assert.ok(!s.staging.some((u) => u.id === cell(s, 1, 2).id));
});

test("Drowned Graves saved selections use only copies discarded by this flip; added enemies are not revealed", () => {
  let s = base(2);
  const u = setActive(s, T.flooded),
    target = setFace(s, u.id, T.graves, true);
  s.encounterDiscard = [T.watcher];
  s.encounterDeck = [T.cadaver, T.throngs, T.throngs, T.rain];
  templeFlip(s, target);
  flush(s);
  assert.equal(s.encounterDeck.length, 0);
  assert.ok(!s.choice!.options.some((o) => o.code === T.watcher));
  s = choose(reload(s), T.throngs);
  s = choose(reload(s), T.throngs);
  s = finish(s);
  assert.equal(s.staging.filter((u) => u.code === T.throngs).length, 2);
  assert.equal(
    s.encounterDiscard.filter((code) => code === T.throngs).length,
    0,
  );
  assert.ok(
    !s.queue.some((e) => e.kind === "reveal"),
    "added Surge enemies do not surge",
  );
});

test("Watcher highest-threat tie is first-player ordered and its two physical shadows survive reload before the normal combat shadow", () => {
  let s = base(2);
  setActive(s, T.cursed);
  const watcher = add(s, T.watcher);
  s.phase = "encounter";
  s.queue.push(...templeEncounterStart(s));
  flush(s);
  assert.match(s.choice!.title, /Highest threat tie/);
  s = choose(reload(s), "player-1");
  assert.equal(ownerOf(s, get(s, watcher.id)!), 1);
  assert.equal(get(s, watcher.id)!.shadows.length, 2);
  s = finish(s);
  handle(s, fx("prepareCombat"));
  s = finish(s);
  assert.equal(get(s, watcher.id)!.shadows.length, 3);
});

test("Guardian actual destruction yields victory/key; Halls flip restores the same Unit with reset tokens and a saved highest-threat choice", () => {
  let s = base(2);
  const guardian = s.staging.find((u) => u.code === T.guardian)!,
    key = s.staging.find((u) => u.code === T.key)!;
  guardian.damage = 9;
  damage(s, guardian.id, 1);
  s = finish(s);
  assert.ok(s.victoryCards!.includes(T.guardian));
  assert.equal(s.temple!.victoryEnemies[0].id, guardian.id);
  assert.equal(s.victory, 4);
  assert.ok(s.staging.some((u) => u.id === key.id));
  const halls = setActive(s, T.halls, 1, 4);
  s.queue.push(...templeLocationFlipped(s, halls));
  flush(s);
  assert.match(s.choice!.title, /Highest threat tie/);
  s = choose(reload(s), "player-1");
  s = finish(s);
  assert.equal(get(s, guardian.id)!.damage, 0);
  assert.equal(ownerOf(s, get(s, guardian.id)!), 1);
  assert.equal(s.victory, 0);
  assert.ok(!s.victoryCards!.includes(T.guardian));
  assert.equal(s.temple!.victoryEnemies.length, 0);
});

test("Soulless Cadaver puts physical cheap hand cards on the owner's deck bottom in saved chosen order", () => {
  let s = base(2);
  const a = add(s, "01016", "hand", 1),
    b = add(s, "01050", "hand", 1);
  add(s, "01073", "hand", 1);
  const enemy = add(s, T.cadaver);
  forOwner(s, 1, () => engage(s, enemy, true));
  flush(s);
  assert.equal(s.table!.active, 1);
  s = choose(reload(s), b.id);
  s = choose(reload(s), a.id);
  s = finish(s);
  assert.deepEqual(seatView(s, 1).deck.slice(-2), [b.code, a.code]);
  assert.equal(seatView(s, 1).hand.length, 1);
});

test("Throngs Forced bottom-deck discard and encounter-top return resolve before optional destruction Responses", () => {
  let s = base();
  const enemy = add(s, T.throngs, "engaged");
  s.deck = ["01073", "01016"];
  enemy.attachments.push({
    id: `c${s.nextId++}`,
    code: "09012",
    exhausted: false,
  });
  damage(s, enemy.id, 99);
  assert.equal(s.encounterDeck[0], T.throngs);
  assert.equal(s.discard.at(-1), "01016");
  assert.ok(!s.encounterDiscard.includes(T.throngs));
  s = finish(s);
  reload(s);
});

test("Curse follows actual lethal damage to the ally deck, while effective heroes and objective allies are excluded", () => {
  let s = base();
  const ally = add(s, "01016", "allies");
  ally.damage = (card(ally.code).health ?? 0) - 1;
  const sword = add(s, "04058", "allies");
  sword.attachments.push({
    id: `c${s.nextId++}`,
    code: "10149",
    exhausted: false,
  });
  s.allies = s.allies.filter((u) => u.id !== sword.id);
  s.heroes.push(sword);
  s = finish(reveal(s, T.curse));
  assert.ok(!get(s, ally.id));
  assert.equal(s.deck.at(-1), ally.code);
  assert.ok(!s.discard.includes(ally.code));
  assert.equal(get(s, sword.id)!.damage, 0);
  assert.equal(captain(s, T.naasiyahAlly).damage, 0);
});

test("Drowned Dead actual defended lethal attack replaces the ally discard with its owner's physical deck bottom", () => {
  let s = base();
  const ally = add(s, "01018", "allies");
  s = defend(s, T.drowned, [T.sunken], ally.id).state;
  s = finish(s);
  assert.ok(!get(s, ally.id));
  assert.equal(s.deck.at(-1), ally.code);
  assert.ok(!s.discard.includes(ally.code));
});

test("Rainstorm, Supplies and Desecrator actual shadows change only this attack and raise kill threat by current enemy threat", () => {
  let s = base();
  setActive(s, T.cursed);
  const ally = add(s, "01018", "allies");
  const result = defend(
    s,
    T.desecrator,
    [T.rain, T.supplies, T.desecrator],
    ally.id,
  );
  s = finish(result.state);
  assert.ok(!get(s, ally.id));
  assert.equal(s.threat, 22);
  assert.equal(s.combat, null);
  assert.equal(get(s, result.enemyId)!.tempAttack ?? 0, 0);
});

test("captain deposit uses actual effective-hero resource spending once per round and saves ownership", () => {
  let s = base(2);
  const sahir = captain(s, T.sahirAlly),
    hero = s.heroes[0];
  sahir.resources = 0;
  s = applyAction(reload(s), { type: "ABILITY", id: sahir.id });
  s = choose(reload(s), hero.id);
  s = finish(s);
  assert.equal(get(s, hero.id)!.resources, 9);
  assert.equal(get(s, sahir.id)!.resources, 1);
  assert.equal(stats(s, get(s, sahir.id)!).will, 1);
  assert.match(templeEncounterAbilityProblem(s, get(s, sahir.id)!)!, /already/);
  const n = captain(s, T.naasiyahAlly);
  assert.match(templeEncounterAbilityProblem(s, n)!, /controller/);
});

test("Na'asiyah actual defense permits repeated paid boosts then clears only her own bonus at attack completion", () => {
  let s = base();
  const n = captain(s, T.naasiyahAlly);
  n.resources = 2;
  n.tempDefense = 1;
  s = defend(s, T.drowned, [T.sunken], n.id).state;
  assert.match(s.choice!.title, /Na'asiyah/);
  s = choose(reload(s), "defense");
  s = choose(reload(s), "defense");
  s = choose(reload(s), "continue");
  s = finish(s);
  assert.equal(get(s, n.id)!.resources, 0);
  assert.equal(get(s, n.id)!.damage, 0);
  assert.equal(get(s, n.id)!.tempDefense, 1);
  assert.equal(s.temple!.combatBoosts.length, 0);
});

test("required objective companions cause immediate loss on actual leave or late controller elimination; blanked text is respected", () => {
  let s = base(2);
  s.table!.seats[1].threat = 50;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Na'asiyah/);
  s = base();
  const n = captain(s, T.naasiyahAlly);
  n.damage = 1;
  s.questAttachments = {
    [T.search]: [
      { id: `a${s.nextId++}`, code: WEATHER.cold, exhausted: false },
    ],
  };
  destroy(s, n, false);
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.temple!.removedUnits[0].id, n.id);
  assert.ok(s.removed.includes(n.code));
  assert.ok(!s.encounterDiscard.includes(n.code));
  reload(s);
  s = base();
  destroy(s, captain(s, T.sahirAlly));
  assert.equal(s.status, "lost");
});

test("Grotto revealed face allows player effects and wins immediately on its eighth actual progress", () => {
  const s = base(),
    grotto = setActive(s, T.grotto, 1, 4);
  assert.doesNotMatch(card(T.grotto).text!, /Immune/);
  progressLocation(s, grotto, 8);
  assert.equal(s.status, "won");
  assert.equal(grotto.progress, 8);
});

test("actual rightward map travel resolves engaged Profane attacks before the destination flip; leftward departure does not attack", () => {
  let s = base(2);
  const old = setActive(s, T.cursed, 1, 1),
    target = cell(s, 1, 2);
  setFace(s, target.id, T.jungle, true);
  old.progress = 3;
  const profane = add(s, T.profane, "engaged", 1);
  profane.shadows = [T.supplies];
  s.phase = "travel";
  s.encounterDeck = [T.rain, ...Array(20).fill(T.sunken)];
  s = applyAction(reload(s), { type: "TRAVEL", id: target.id });
  assert.equal(s.activeLocation!.id, target.id);
  assert.equal(
    s.activeLocation!.code,
    T.lost,
    "destination is not flipped before WHEN attack",
  );
  assert.match(s.choice!.title, /Immediate/);
  assert.equal(s.table!.active, 1);
  assert.ok(
    s.encounterDiscard.includes(T.supplies),
    "previous shadow is discarded before new attack",
  );
  assert.deepEqual(get(s, profane.id)!.shadows, [T.rain]);
  s = finish(s);
  assert.equal(s.activeLocation!.code, T.jungle);
  assert.equal(cell(s, 1, 1).progress, 0);
  // The explored old location remains fixed and a later reverse journey is legal.
  s.phase = "travel";
  templeTravelStart(s);
  s.activeLocation!.progress = 3;
  get(s, profane.id)!.attacked = false;
  const before = s.encounterDeck.length;
  s = applyAction(reload(s), { type: "TRAVEL", id: old.id });
  s = finish(s);
  assert.equal(s.activeLocation!.id, old.id);
  assert.equal(s.encounterDeck.length, before);
});

test("Aimless Wandering removes group current willpower then first player may pay saved Doomed to peek a staged Uncharted face", () => {
  let s = base(2);
  setActive(s, T.cursed);
  const committed = allCharacters(s).filter(
    (u) => card(u.code).type_code === "hero",
  );
  for (const u of committed) u.committed = true;
  s = reveal(s, T.wandering);
  let removed = 0;
  while (/Remove at least/.test(s.choice?.title ?? "")) {
    const id = s.choice!.options[0].id;
    removed += stats(s, get(s, id)!).will;
    s = choose(reload(s), id);
  }
  assert.ok(removed >= 4);
  s = choose(reload(s), "doomed");
  const target = s.choice!.options[0].id;
  s = choose(reload(s), target);
  s = finish(s);
  assert.deepEqual(s.temple!.lookedBy[target], [0]);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 22);
});

test("Cursed Temple refresh suppresses only current low-will characters across seats", () => {
  let s = base(2);
  setActive(s, T.cursed);
  s.phase = "refresh";
  for (const u of allCharacters(s)) u.exhausted = true;
  const low = allCharacters(s)
      .filter((u) => stats(s, u).will < 2)
      .map((u) => u.id),
    high = allCharacters(s)
      .filter((u) => stats(s, u).will >= 2)
      .map((u) => u.id);
  handle(s, fx("refreshReady"));
  s = finish(s);
  for (const id of low) assert.equal(get(s, id)!.exhausted, true);
  for (const id of high) assert.equal(get(s, id)!.exhausted, false);
});

test("Curse physical shadow discards bottom immediately and schedules one actual fresh-shadow additional attack", () => {
  let s = base();
  s.deck = ["01073", "01016"];
  const result = defend(s, T.desecrator, [T.curse], s.heroes[0].id);
  s = result.state;
  assert.ok(s.discard.includes("01016"));
  assert.match(s.choice!.title, /Immediate/);
  assert.ok(
    s.encounterDiscard.includes(T.curse),
    "the resolving first attack shadow physically leaves before the additional attack",
  );
  s = finish(s);
  assert.equal(s.combat, null);
});

test("canceled printed Sunken Doomed remains, while canceled conditional Supplies gains no Doomed", () => {
  let s = base(3);
  s.phase = "staging";
  add(s, "01050", "hand", 2);
  s = reveal(s, T.sunken);
  const cancel = s.choice!.options.find((o) => /Test of Will/.test(o.label))!;
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.equal(s.threat, 21);
  assert.deepEqual(s.temple!.sunkenBoosts, []);
  add(s, "01050", "hand", 2);
  s = reveal(s, T.supplies);
  s = choose(
    reload(s),
    s.choice!.options.find((o) => /Test of Will/.test(o.label))!.id,
  );
  s = finish(s);
  assert.equal(s.threat, 21);
});

test("Sword-thain effective hero pays a companion's actual resource Action without changing the printed player card definition", () => {
  let s = base();
  const payer = add(s, "04058", "allies");
  payer.attachments.push({
    id: `c${s.nextId++}`,
    code: "10149",
    exhausted: false,
  });
  payer.resources = 1;
  s.allies = s.allies.filter((u) => u.id !== payer.id);
  s.heroes.push(payer);
  const n = captain(s, T.naasiyahAlly);
  n.resources = 0;
  s = applyAction(reload(s), { type: "ABILITY", id: n.id });
  assert.ok(s.choice!.options.some((o) => o.id === payer.id));
  s = choose(reload(s), payer.id);
  s = finish(s);
  assert.equal(get(s, payer.id)!.resources, 0);
  assert.equal(get(s, n.id)!.resources, 1);
  assert.equal(card(payer.code).type_code, "ally");
});

test("Na'asiyah actual player attack accepts repeated boosts and clears them even after the defending enemy dies", () => {
  let s = base();
  const n = captain(s, T.naasiyahAlly),
    enemy = add(s, T.desecrator, "engaged");
  n.resources = 2;
  s.phase = "attack";
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: enemy.id,
    attackerIds: [n.id],
  });
  s = choose(reload(s), "attack");
  s = choose(reload(s), "attack");
  s = choose(reload(s), "continue");
  s = finish(s);
  assert.ok(!get(s, enemy.id));
  assert.equal(get(s, n.id)!.resources, 0);
  assert.equal(get(s, n.id)!.tempAttack ?? 0, 0);
  assert.equal(s.temple!.combatBoosts.length, 0);
});

test("Profane's printed shadow adds three attack only while a player controls the physical Key, including a different seat", () => {
  let s = base(2);
  const key = s.staging.find((u) => u.code === T.key)!;
  const defender = seatView(s, 1).heroes[0];
  let result = defend(s, T.desecrator, [T.profane], defender.id, 1);
  s = finish(result.state);
  assert.equal(
    get(s, defender.id)!.damage,
    0,
    "guarded staging Key is not player-controlled",
  );
  s = base(2);
  const hero = s.heroes[0],
    guarded = s.staging.find((u) => u.code === T.guardian)!;
  destroy(s, guarded);
  s = finish(s);
  s = applyAction(reload(s), {
    type: "CLAIM",
    id: s.staging.find((u) => u.code === T.key)!.id,
    heroId: hero.id,
  });
  assert.ok(get(s, hero.id)!.attachments.some((a) => a.id === key.id));
  const defended = seatView(s, 1).heroes[0];
  result = defend(s, T.desecrator, [T.profane], defended.id, 1);
  s = finish(result.state);
  assert.equal(
    get(s, defended.id)!.damage,
    3,
    "another fellowship's claimed Key still increases this attack",
  );
});

test("Profane's actual revealed shadow can be canceled after save/reload even when another player holds the Key", () => {
  let s = base(3);
  const guardian = s.staging.find((u) => u.code === T.guardian)!;
  destroy(s, guardian);
  s = finish(s);
  s = applyAction(reload(s), {
    type: "CLAIM",
    id: s.staging.find((u) => u.code === T.key)!.id,
    heroId: s.heroes[0].id,
  });
  const stroke = add(s, "01048", "hand", 2),
    defender = seatView(s, 1).heroes[0];
  const result = defend(s, T.desecrator, [T.profane], defender.id, 1);
  s = result.state;
  assert.match(s.choice!.title, /shadow/i);
  const cancel = s.choice!.options.find((o) => /Hasty Stroke/.test(o.label))!;
  assert.ok(cancel);
  s = choose(reload(s), cancel.id);
  s = finish(s);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.ok(seatView(s, 2).discard.includes(stroke.code));
});
