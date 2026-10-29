import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAction,
  publicState,
  validateSave,
  canPlay,
  canTravel,
} from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  get,
  make,
  putPlayerDeck,
  stageInfo,
  stats,
  threatOf,
} from "../src/game/core";
import {
  check,
  damage,
  discardLocation,
  engage,
  progress,
  progressLocation,
  raiseThreat,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  ASH as A,
  ASH_QUESTS,
  ASH_RECIPES,
} from "../src/game/ash-mountains-support";
import { ASH_HOOKS as hooks, ashQuestCount } from "../src/game/ash-mountains";
import { base, start, choose, reload, settle } from "./ash-mountains-fixtures";
import type { GameState } from "../src/game/types";
const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const effect = (s: GameState, kind: string, extra = {}) => {
  handle(s, fx(kind, extra));
  flush(s);
  return s;
};
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Ash Mountains ${players} players ${easy ? "easy" : "normal"}: native setup and exact inventory`, () => {
      const s = start(players, easy, 91, true, true);
      assert.equal(s.phase, "resource");
      assert.equal(s.staging.length, players + 1);
      assert.equal(s.ashMountains!.setupChosen.length, players - 1);
      assert.equal(new Set(s.ashMountains!.setupChosen).size, players - 1);
      assert.equal(stageInfo(s).quest, 25);
      const physical = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...s.staging.map((u) => u.code),
        ...ASH_QUESTS.map((c) => c.code),
      ].sort();
      const r = ASH_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      assert.deepEqual(
        physical,
        r.cards.flatMap((r) => Array<string>(r.quantity).fill(r.code)).sort(),
      );
      for (const p of playerOrder(s))
        assert.ok(seatView(s, p).deck.length <= 39);
      reload(s);
    });
test("Patrol and Chasm count main, encounter and player quests; Patrol's five-progress cap counts earlier progress that round", () => {
  const s = base();
  progress(s, 3);
  const patrol = staged(s, A.patrol),
    chasm = staged(s, A.chasm);
  staged(s, A.darkness);
  staged(s, "09014");
  assert.equal(ashQuestCount(s), 3);
  assert.equal(threatOf(s, patrol), 4);
  assert.equal(threatOf(s, chasm), 4);
  progress(s, 9);
  assert.equal(s.progress, 5);
  progress(s, 3);
  assert.equal(s.progress, 5);
  s.staging = s.staging.filter((u) => u.id !== patrol.id);
  progress(s, 2);
  assert.equal(s.progress, 7);
  s.round++;
  s.staging.push(patrol);
  progress(s, 8);
  assert.equal(s.progress, 12);
  reload(s);
});
test("Stage transition reveals a chosen side quest, adds one enemy per living player without reveal text, and wins at stage 2", () => {
  let s = base(2);
  s.encounterDeck = [A.deeps, A.beast, A.darkness, A.spawn, A.wolf];
  s.encounterDiscard = [A.haunt];
  progress(s, 25);
  flush(s);
  assert.equal(s.stage, 2);
  assert.equal(stageInfo(s).side, "A");
  assert.match(s.choice!.title, /An Evil Place/);
  s = choose(s, A.darkness);
  s = settle(s);
  assert.equal(stageInfo(s).side, "B");
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    2,
  );
  assert.ok(s.staging.some((u) => u.code === A.darkness));
  progress(s, 25);
  flush(s);
  assert.equal(s.status, "won");
  reload(s);
});
test("Empty decks survive until end of round, then all empty players are eliminated together and custody returns to owners", () => {
  let s = base(2);
  const deeps = staged(s, A.deeps);
  hooks.cardEntered!(s, deeps, true, false);
  s = reload(s);
  forOwner(s, 0, () => (s.deck = []));
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, false);
  effect(s, "ashRoundEnd");
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(
    s.ashMountains!.custody.some((g) => g.player === 0),
    false,
  );
  forOwner(s, 1, () => (s.deck = []));
  effect(s, "ashRoundEnd");
  check(s);
  assert.equal(s.status, "lost");
  reload(s);
});
test("Round depletion runs once for the shared table and counts side quests", () => {
  let s = base(3);
  staged(s, A.haunt);
  staged(s, A.darkness);
  const sizes = playerOrder(s).map((p) => seatView(s, p).deck.length);
  effect(s, "endRound");
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).deck.length, sizes[p] - 5);
});
for (const mode of ["active", "staging", "discard"] as const)
  test(`Hideous Deeps ${mode} departure preserves exact hidden cards and their owners`, () => {
    let s = base(2);
    const u = staged(s, A.deeps);
    const sizes = playerOrder(s).map((p) => seatView(s, p).deck.length);
    hooks.cardEntered!(s, u, true, false);
    s = reload(s);
    assert.equal(s.ashMountains!.custody.length, 2);
    assert.ok(s.ashMountains!.custody.every((g) => g.cards.length === 3));
    const stored = s.ashMountains!.custody.flatMap((g) =>
      g.cards.map((c) => c.code),
    );
    const before = JSON.stringify(s);
    const projection = publicState(s);
    assert.equal(JSON.stringify(s), before);
    assert.ok(
      (projection as any).ashMountains.custody.every(
        (g: any) => !g.cards && g.count === 3,
      ),
    );
    const host = get(s, u.id)!;
    if (mode === "active") {
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.activeLocation = host;
      progressLocation(s, host, 6);
    }
    if (mode === "staging") progressLocation(s, host, 6);
    if (mode === "discard") discardLocation(s, host);
    flush(s);
    assert.equal(s.ashMountains!.custody.length, 0);
    for (const p of playerOrder(s))
      assert.equal(
        seatView(s, p).deck.length,
        sizes[p] - (mode === "active" ? 0 : 3),
      );
    if (mode !== "active")
      assert.deepEqual(
        playerOrder(s)
          .flatMap((p) => seatView(s, p).discard)
          .sort(),
        stored.sort(),
      );
    reload(s);
  });
test("Lost in the Dark stores ten physical cards per dial, discards one per increase (not per threat), then restores the remainder", () => {
  let s = base(2);
  const side = staged(s, A.lost),
    sizes = playerOrder(s).map((p) => seatView(s, p).deck.length);
  hooks.cardEntered!(s, side, true, false);
  s = reload(s);
  forOwner(s, 1, () => raiseThreat(s, 3));
  flush(s);
  assert.equal(
    s.ashMountains!.custody.find((g) => g.player === 0)!.cards.length,
    10,
  );
  assert.equal(
    s.ashMountains!.custody.find((g) => g.player === 1)!.cards.length,
    9,
  );
  hooks.sideDefeated!(s, get(s, side.id)!);
  flush(s);
  assert.equal(s.ashMountains!.custody.length, 0);
  assert.equal(seatView(s, 0).deck.length, sizes[0]);
  assert.equal(seatView(s, 1).deck.length, sizes[1] - 1);
  reload(s);
});
test("Orc Passage blocks encounter cancellation only in staging and finds a physical Patrol when explored", () => {
  const s = base(),
    u = staged(s, A.orc);
  s.encounterDeck = [A.patrol, A.chasm];
  assert.equal(hooks.cannotCancel!(s), true);
  s.staging = [];
  s.activeLocation = u;
  assert.equal(hooks.cannotCancel!(s), false);
  progressLocation(s, u, 4);
  flush(s);
  assert.equal(s.staging.filter((x) => x.code === A.patrol).length, 1);
  assert.ok(!s.encounterDeck.includes(A.patrol));
  reload(s);
});
test("Tunnels force legal travel, count only active exploration and prevent progress until three resources", () => {
  const s = base(),
    side = staged(s, A.tunnels),
    u = staged(s, A.chasm);
  s.phase = "travel";
  assert.equal(hooks.mustTravel!(s), true);
  assert.equal(hooks.progress!(s, 8, side), 0);
  progressLocation(s, u, 5);
  flush(s);
  assert.equal(side.resources, 0);
  for (let i = 0; i < 3; i++) {
    const location = make(s, A.chasm);
    s.activeLocation = location;
    progressLocation(s, location, 5);
    flush(s);
  }
  assert.equal(side.resources, 3);
  assert.equal(hooks.progress!(s, 8, side), 8);
  reload(s);
});
test("Haunt prevents selecting the side quest while an enemy is staged and limits actual damage per enemy per round", () => {
  const s = base(),
    side = staged(s, A.haunt),
    enemy = staged(s, A.troll);
  assert.equal(hooks.canSelectSideQuest!(s, side), false);
  damage(s, enemy.id, 3);
  damage(s, enemy.id, 3);
  assert.equal(enemy.damage, 4);
  s.round++;
  damage(s, enemy.id, 1);
  assert.equal(enemy.damage, 5);
  s.staging = s.staging.filter((u) => u.id !== enemy.id);
  s.engaged.push(enemy);
  assert.equal(hooks.canSelectSideQuest!(s, side), true);
  assert.equal(hooks.cannotAttach!(s, enemy), true);
  reload(s);
});
test("Overwhelming Darkness discards per played card, and its optional quest response can recover cards despite the event restriction", () => {
  let s = base(2);
  const side = staged(s, A.darkness),
    n = s.deck.length;
  hooks.playerCardPlayed!(s);
  flush(s);
  assert.equal(s.deck.length, n - 1);
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.discard = ["01013", "01022", "01023", "01024"]));
  const sizes = playerOrder(s).map((p) => seatView(s, p).deck.length);
  hooks.sideDefeated!(s, side);
  flush(s);
  s = choose(s, "recover");
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).deck.length, sizes[p] + 3);
    assert.deepEqual(seatView(s, p).discard, ["01013"]);
  }
  reload(s);
});
test("Main quest blocks Will of the West's event shuffle but blanking removes that restriction", () => {
  const s = base();
  s.discard = ["01013", "01022"];
  const n = s.deck.length;
  effect(s, "reshufflePlayer");
  assert.equal(s.deck.length, n);
  assert.equal(s.discard.length, 2);
  s.stageRevealing = true;
  effect(s, "reshufflePlayer");
  assert.equal(s.deck.length, n + 2);
  assert.equal(s.discard.length, 0);
});
test("Ransacked Supplies adds total printed costs only for the current phase; Burning Reek discards per controlled character", () => {
  const s = base(2);
  forOwner(s, 0, () => (s.deck = ["01073", ...s.deck]));
  forOwner(s, 1, () => (s.deck = ["01013", ...s.deck]));
  hooks.encounter!(s, A.supplies);
  flush(s);
  assert.equal(hooks.stagingThreat!(s), 7);
  s.phase = "travel";
  assert.equal(hooks.stagingThreat!(s), 0);
  const sizes = playerOrder(s).map((p) => seatView(s, p).deck.length);
  hooks.encounter!(s, A.reek);
  flush(s);
  for (const p of playerOrder(s))
    assert.equal(
      seatView(s, p).deck.length,
      sizes[p] - seatView(s, p).heroes.length,
    );
  assert.equal(s.ashMountains!.resolving.length, 0);
  reload(s);
});
test("Writhing Shadows assigns damage through saved choices and exhausts only actual damaged characters", () => {
  let s = base();
  const [a, b] = s.heroes;
  a.roundCannotTakeDamage = true;
  hooks.encounter!(s, A.writhing);
  flush(s);
  s = choose(s, a.id);
  s = choose(s, b.id);
  assert.equal(get(s, a.id)!.damage, 0);
  assert.equal(get(s, a.id)!.exhausted, false);
  assert.equal(get(s, b.id)!.damage, 1);
  assert.equal(get(s, b.id)!.exhausted, true);
  assert.deepEqual(s.ashMountains!.writhing, {});
  reload(s);
});
test("Fearful Shadows blanks character text and its shadow prevents readying only this round", () => {
  const s = base(),
    u = s.heroes[0];
  hooks.encounter!(s, A.shadows);
  flush(s);
  assert.equal(hooks.characterBlanked!(s, u), true);
  s.combat = {
    enemyId: "x",
    defenderId: u.id,
    shadowIndex: 0,
    attackBonus: 0,
    defenseBonus: 0,
  } as any;
  hooks.shadow!(s, A.shadows);
  assert.equal(hooks.cannotReady!(s, u), true);
  s.round++;
  assert.equal(hooks.characterBlanked!(s, u), false);
  assert.equal(hooks.cannotReady!(s, u), false);
});
test("Narrow Opening counts earlier plays; Crumbling Passage replaces the active location and damages exhausted characters when leaving", () => {
  const s = base();
  hooks.playerCardPlayed!(s);
  s.activeLocation = make(s, A.opening);
  assert.match(hooks.playProblem!(s)!, /one card/);
  const old = s.activeLocation,
    u = staged(s, A.passage);
  hooks.cardEntered!(s, u, true, false);
  assert.equal(s.activeLocation.id, u.id);
  assert.ok(s.staging.includes(old));
  s.heroes[0].exhausted = true;
  discardLocation(s, u);
  flush(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[1].damage, 0);
  reload(s);
});
test("Twisted Tunnel reveals an enemy without When Revealed; its printed shadow discards exactly one encounter card", () => {
  const s = base(),
    u = staged(s, A.tunnel);
  s.encounterDeck = [A.deeps, A.wolf, A.chasm];
  hooks.cardEntered!(s, u, true, false);
  assert.ok(s.staging.some((u) => u.code === A.wolf));
  assert.deepEqual(s.encounterDeck, [A.chasm]);
  s.combat = {
    enemyId: "x",
    shadowIndex: 0,
    attackBonus: 0,
    defenseBonus: 0,
  } as any;
  s.encounterDeck = [A.spawn, A.chasm];
  hooks.shadow!(s, A.tunnel);
  assert.ok(s.staging.some((u) => u.code === A.spawn));
  assert.deepEqual(s.encounterDeck, [A.chasm]);
});
test("Spawn engagement offers a legal deck discard or attack boost; Nameless Beast uses the discarded card's cost", () => {
  let s = base(),
    u = staged(s, A.spawn);
  s.deck = [];
  engage(s, u);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["attack"],
  );
  s = choose(s, "attack");
  assert.equal(stats(s, get(s, u.id)!).attack, 4);
  s.deck = ["01073"];
  const beast = make(s, A.beast);
  s.engaged.push(beast);
  s.combat = {
    enemyId: beast.id,
    shadowIndex: 0,
    attackBonus: 0,
    defenseBonus: 0,
  } as any;
  hooks.enemyAttackStarted!(s, beast, 0);
  flush(s);
  assert.equal(s.combat!.attackBonus, 5);
  assert.equal(s.deck.length, 0);
  hooks.shadow!(s, A.beast);
  assert.equal(s.combat!.attackBonus, 10);
});
test("Werewolf and Troll post-combat discards use actual destruction and excess combat damage, and cancelled attacks do nothing", () => {
  const s = base(),
    wolf = make(s, A.wolf);
  s.engaged.push(wolf);
  s.combat = {
    enemyId: wolf.id,
    attackPlayer: 0,
    shadowIndex: 0,
    attackBonus: 0,
    defenseBonus: 0,
    attackResolved: true,
  } as any;
  hooks.enemyAttackStarted!(s, wolf, 0);
  assert.equal(hooks.attackFinished!(s, s.combat!)[0].value, 1);
  s.combat!.ashKilled = true;
  hooks.shadow!(s, A.wolf);
  assert.equal(hooks.attackFinished!(s, s.combat!)[0].value, 4);
  assert.deepEqual(hooks.attackFinished!(s, s.combat!, true), []);
  const troll = make(s, A.troll);
  s.engaged.push(troll);
  s.combat!.enemyId = troll.id;
  hooks.enemyAttackStarted!(s, troll, 0);
  const h = s.heroes[0];
  damage(s, h.id, stats(s, h).health + 3, {
    combatDamage: true,
    enemyId: troll.id,
  });
  assert.equal(s.combat!.ashExcess, 3);
  assert.equal(hooks.attackFinished!(s, s.combat!)[0].value, 5);
});
test("Save validation rejects duplicate physical custody, invalid owners and impossible round counters", () => {
  const s = base(2),
    u = staged(s, A.deeps);
  hooks.cardEntered!(s, u, true, false);
  reload(s);
  const raw = JSON.parse(JSON.stringify(s));
  raw.ashMountains.custody[0].cards.push(raw.ashMountains.custody[0].cards[0]);
  assert.equal(validateSave(raw), false);
  const other = JSON.parse(JSON.stringify(s));
  other.ashMountains.custody[0].player = 8;
  assert.equal(validateSave(other), false);
  const future = JSON.parse(JSON.stringify(s));
  future.ashMountains.progressLimit.round = s.round + 1;
  assert.equal(validateSave(future), false);
});
test("Writhing damage replacements resolve before the next assignment and follow damage to Dori", () => {
  let s = base();
  const [h, other] = s.heroes,
    dori = make(s, "131009");
  s.allies.push(dori);
  hooks.encounter!(s, A.writhing);
  flush(s);
  s = choose(s, h.id);
  assert.match(s.choice!.title, /Dori/);
  s = choose(s, dori.id);
  assert.match(s.choice!.title, /Assign 1 damage/);
  s = choose(s, other.id);
  assert.equal(get(s, h.id)!.damage, 0);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, dori.id)!.damage, 1);
  assert.equal(get(s, dori.id)!.exhausted, true);
  assert.equal(get(s, other.id)!.exhausted, true);
  reload(s);
});
test("Will of the West cannot be initiated while the main quest prohibits its shuffle", () => {
  const s = base(),
    event = make(s, "01049");
  s.hand.push(event);
  s.discard = ["01013"];
  assert.match(canPlay(s, event)!, /prevents events/);
});
test("Ransacked Supplies excludes Permanent and immune attachments from its discard choice", () => {
  const s = base(),
    h = s.heroes[0];
  h.attachments.push(
    { id: `a${s.nextId++}`, code: "21001", exhausted: false, owner: 0 },
    { id: `a${s.nextId++}`, code: "01039", exhausted: false, owner: 0 },
  );
  effect(s, "ashDiscardAttachment", { player: 0 });
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    ["01039"],
  );
  reload(s);
});
test("Hideous Deeps returns a foreign physical card to its owner's deck, while Lost in the Dark returns it to its dial's player", () => {
  for (const code of [A.deeps, A.lost]) {
    const s = base(2),
      foreign = make(s, "01043");
    foreign.owner = 1;
    putPlayerDeck(s, foreign, 0);
    const sizes = playerOrder(s).map((p) => seatView(s, p).deck.length),
      host = staged(s, code);
    hooks.cardEntered!(s, host, true, false);
    assert.equal(s.ashMountains!.custody[0].cards[0].id, foreign.id);
    assert.equal(s.ashMountains!.custody[0].cards[0].owner, 1);
    if (code === A.deeps) {
      s.staging = s.staging.filter((u) => u.id !== host.id);
      s.activeLocation = host;
      progressLocation(s, host, 6);
      flush(s);
    } else hooks.sideDefeated!(s, host);
    assert.equal(
      seatView(s, 0).deck.length,
      sizes[0] - (code === A.deeps ? 1 : 0),
    );
    assert.equal(
      seatView(s, 1).deck.length,
      sizes[1] + (code === A.deeps ? 1 : 0),
    );
    reload(s);
  }
});
