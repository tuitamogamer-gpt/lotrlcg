import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  fx,
  make,
  prepend,
  putPlayerDeck,
  stats,
  threatOf,
  engagementCost as engagementOf,
} from "../src/game/core";
import {
  addVictoryCard,
  check,
  damage,
  destroy,
  engage,
  placeEncounter,
  progressLocation,
  readyCharacter,
  revealed as revealCard,
  discardCharacter,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { canPlay } from "../src/game/actions";
import { prepareEnemyShadows } from "../src/game/considered-engagement";
import {
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
  allCharacters,
  allEngaged,
} from "../src/game/table";
import {
  MOUNT_GUNDABAD_HOOKS as H,
  GUNDABAD as G,
  MOUNT_GUNDABAD_RECIPES,
  MOUNT_GUNDABAD_ENCOUNTERS,
  MOUNT_GUNDABAD_QUESTS,
  gundabadDragon,
  gundabadQuestCount,
  gundabadX,
  mountGundabadPublicState,
  mountGundabadStageInfo,
} from "../src/game/mount-gundabad";
import {
  base,
  choose,
  giveSword,
  newGame,
  reload,
  second,
  setQuest,
  settle,
  start,
} from "./mount-gundabad-fixtures";
import type { GameState } from "../src/game/types";
import nativeGundabad from "../src/data/mount-gundabad-encounter-cards.json";

const finish = (s: GameState, prefer?: string) => {
  flush(s);
  return settle(s, prefer);
};
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const effect = (s: GameState, kind: string, fields = {}) => {
  prepend(s, fx(kind, fields));
  flush(s);
  return s;
};
const countInventory = (s: GameState) => {
  const q = s.mountGundabad!,
    codes = [
      ...s.encounterDeck,
      ...s.encounterDiscard,
      ...s.staging.map((u) => u.code),
      ...(s.activeLocation ? [s.activeLocation.code] : []),
      ...(s.extraActiveLocations ?? []).map((u) => u.code),
      ...allEngaged(s).map((u) => u.code),
      ...q.cavesDeck.map((u) => u.code),
      ...q.setAside.map((u) => u.code),
      ...q.resolving.map((u) => u.code),
      ...q.removed.map((u) => u.code),
      ...allCharacters(s).flatMap((u) => u.attachments.map((a) => a.code)),
    ];
  return Object.fromEntries(
    [...new Set(codes)]
      .sort()
      .map((c) => [c, codes.filter((v) => v === c).length]),
  );
};
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Gundabad original ${players}p ${easy ? "easy" : "normal"} opening conserves every physical card and reloads`, () => {
      const s = reload(start(players, easy)),
        q = s.mountGundabad!;
      assert.equal(q.initialized, true);
      assert.equal(s.stage, 1);
      assert.equal(q.currentQuest, G.door);
      assert.equal(q.questDeck.length, 7);
      assert.equal(new Set(q.questDeck).size, 7);
      assert.equal(q.cavesDeck.length, 8);
      assert.ok(q.cavesDeck.some((u) => u.code === G.hoard));
      assert.ok(q.cavesDeck.some((u) => u.code === G.throat));
      assert.ok(!q.cavesDeck.some((u) => u.code === G.forge));
      assert.equal(
        s.staging.filter((u) => card(u.code).type_code === "location").length,
        players - 1,
      );
      assert.ok(gundabadDragon(s));
      assert.equal(q.setAside.length, 1);
      assert.equal(q.setAside[0].code, G.forge);
      assert.equal(
        allCharacters(s)
          .flatMap((u) => u.attachments)
          .filter((a) => a.code === G.sword).length,
        1,
      );
      const recipe = MOUNT_GUNDABAD_RECIPES.find(
          (r) => r.mode === (easy ? "easy" : "standard"),
        )!,
        counts: Record<string, number> = {};
      for (const row of recipe.cards.filter(
        (r) => r.section !== "sharedQuestDeck",
      ))
        counts[row.code] = (counts[row.code] ?? 0) + row.quantity;
      assert.deepEqual(
        countInventory(s),
        Object.fromEntries(
          Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
        ),
      );
      assert.equal(
        Object.values(counts).reduce((a, b) => a + b, 0),
        easy ? 41 : 52,
      );
      assert.equal(mainQuestUnit(s)?.code, G.door);
    });
test("Gundabad keeps immutable source separate and corrects original faces/easy Bane quantities", () => {
  assert.equal(MOUNT_GUNDABAD_ENCOUNTERS.length, 13);
  assert.equal(MOUNT_GUNDABAD_QUESTS.length, 8);
  assert.equal(card(G.sword).type_code, "objective");
  assert.equal(
    nativeGundabad.find((c) => c.code === G.sword)!.back_type_code,
    "objective",
  );
  assert.equal(card(G.sword).back_traits, "Artifact. Weapon. Reforged.");
  assert.equal(card(G.warriors).back_name, "Frenzied Warrens");
  for (const code of [
    G.forge,
    G.hoard,
    G.throat,
    ...MOUNT_GUNDABAD_QUESTS.map((c) => c.code),
  ])
    assert.equal(card(code).victory, 1);
  assert.equal(
    MOUNT_GUNDABAD_RECIPES.find((r) => r.mode === "easy")!.cards.find(
      (c) => c.code === G.bane,
    )!.quantity,
    2,
  );
});
test("Setup waits for every opening hand; choosing a remote bearer survives the actual prompt reload", () => {
  let s = newGame(2);
  assert.equal(s.mountGundabad!.initialized, false);
  assert.equal(s.mountGundabad!.setAside.length, 2);
  s = applyAction(reload(s), { type: "KEEP" });
  assert.equal(s.mountGundabad!.initialized, false);
  s = applyAction(reload(s), { type: "KEEP" });
  while (s.flow?.pending)
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /Wormsbane/);
  const hero = seatView(s, 1).heroes[0];
  s = choose(reload(s), hero.id);
  s = settle(s);
  assert.ok(
    seatView(s, 1).heroes[0].attachments.some((a) => a.code === G.sword),
  );
  assert.equal(s.mountGundabad!.initialized, true);
});
test("Side Door planning end looks at two quests, bottoms chosen card and enters 2A without flipping early", () => {
  let s = base();
  const first = s.mountGundabad!.questDeck[0],
    bottom = s.mountGundabad!.questDeck[1];
  s = applyAction(reload(s), { type: "NEXT" });
  while (s.flow?.pending)
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /Quest deck/);
  assert.equal(s.choice!.options.length, 2);
  s = choose(reload(s), bottom);
  assert.equal(s.stage, 2);
  assert.equal(s.mountGundabad!.currentQuest, first);
  assert.equal(s.mountGundabad!.questDeck.at(-1), bottom);
  assert.equal(s.mountGundabad!.questFront, s.phase !== "quest");
  assert.ok(s.victoryCards?.includes(G.door));
  assert.equal(gundabadQuestCount(s), 1);
  s = settle(s);
  assert.equal(s.phase, "quest");
  assert.equal(s.mountGundabad!.questFront, false);
});
test("A main quest on 2A legally takes progress then discards it at the quest-phase flip", () => {
  let s = second();
  setQuest(s, G.lower, true);
  addQuestProgress(s, mainQuestUnit(s)!, 2);
  assert.equal(s.progress, 2);
  assert.equal(s.mountGundabad!.currentQuest, G.lower);
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.equal(s.phase, "quest");
  assert.equal(s.progress, 0);
  assert.equal(s.mountGundabad!.questFront, false);
  assert.equal(s.mountGundabad!.currentQuest, G.lower);
});
test("Defeated player side quests count toward all quest-count thresholds and Reforged Wormsbane", () => {
  let s = second();
  s.mountGundabad!.reforged = true;
  const h = s.heroes[0],
    before = stats(s, h).attack;
  s.phase = "quest";
  const side = add(s, "09014");
  addQuestProgress(s, side, 4);
  s = finish(s);
  assert.ok(s.victoryCards?.includes("09014"));
  assert.equal(gundabadQuestCount(s), 2);
  assert.equal(gundabadX(s), 3);
  assert.equal(stats(s, s.heroes[0]).attack, before + 1);
  assert.equal(s.mountGundabad!.completedQuests.length, 1);
  assert.equal(threatOf(s, gundabadDragon(s)!), 3);
});
test("Upper Levels defeats into victory and shuffles the physical First Forge into Caves", () => {
  let s = second();
  const forge = s.mountGundabad!.setAside[0];
  addQuestProgress(s, mainQuestUnit(s)!, 3);
  check(s);
  s = finish(s);
  assert.ok(s.victoryCards?.includes(G.upper));
  assert.ok(s.mountGundabad!.cavesDeck.some((u) => u.id === forge.id));
  assert.equal(s.mountGundabad!.setAside.length, 0);
  assert.equal(s.mountGundabad!.questFront, true);
  assert.equal(s.progress, 0);
});
test("Lower Deeps defeat searches actual Caves, retains the previous active location and reloads the decision", () => {
  let s = second(2);
  setQuest(s, G.lower);
  const old = make(s, G.ruins);
  s.activeLocation = old;
  const cave = s.mountGundabad!.cavesDeck.find((u) => u.code === G.lake)!;
  addQuestProgress(s, mainQuestUnit(s)!, 3);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Lower Deeps/);
  s = choose(reload(s), cave.id);
  s = settle(s);
  assert.equal(s.activeLocation?.id, cave.id);
  assert.ok(!s.encounterDiscard.includes(old.code));
  assert.ok(s.extraActiveLocations?.some((u) => u.id === old.id));
  assert.ok(s.victoryCards?.includes(G.lower));
});
test("Foreboding Darkness defeat chooses/bottoms a quest then flips the replacement immediately", () => {
  let s = second();
  setQuest(s, G.darkness);
  const top = s.mountGundabad!.questDeck.slice(0, 2);
  addQuestProgress(s, mainQuestUnit(s)!, 4);
  check(s);
  flush(s);
  s = choose(reload(s), top[0]);
  s = settle(s);
  assert.equal(s.mountGundabad!.currentQuest, top[1]);
  assert.equal(s.mountGundabad!.questDeck.at(-1), top[0]);
  assert.equal(s.mountGundabad!.questFront, false);
});
test("Bypass puts the current quest on the bottom without victory and returns engaged Dagnir to staging", () => {
  let s = second();
  const d = gundabadDragon(s)!;
  engage(s, d);
  s = finish(s);
  s.combat = null;
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  const before = [...s.victoryCards!],
    next = s.mountGundabad!.questDeck[0];
  s = effect(s, "gundabadBypass");
  s = settle(s);
  assert.equal(s.mountGundabad!.currentQuest, next);
  assert.equal(s.mountGundabad!.questDeck.at(-1), G.upper);
  assert.equal(s.mountGundabad!.questFront, true);
  assert.deepEqual(s.victoryCards, before);
  assert.ok(s.staging.some((u) => u.id === d.id));
  assert.equal(allEngaged(s).length, 0);
});
test("Great Worm must bypass with four quest cards, remains at five, and has no automatic victory at zero HP", () => {
  let s = second();
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower, G.pursuit]);
  gundabadDragon(s)!.damage = 20;
  check(s);
  assert.equal(s.status, "playing");
  H.combatEnd!(s);
  s = finish(s);
  assert.notEqual(s.mountGundabad!.currentQuest, G.worm);
  s = second();
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower, G.pursuit, G.warriors]);
  H.combatEnd!(s);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.mountGundabad!.currentQuest, G.worm);
});
test("Dagnir round cap resets naturally, counts actual uncancelled damage and quest damage bypasses Slave/cap", () => {
  let s = second();
  const d = gundabadDragon(s)!;
  damage(s, d.id, 8);
  assert.equal(d.damage, 2);
  damage(s, d.id, 2);
  assert.equal(d.damage, 2);
  add(s, G.slave);
  damage(s, d.id, 5);
  assert.equal(d.damage, 2);
  damage(s, d.id, 5, { questEffect: true });
  assert.equal(d.damage, 7);
  assert.equal(s.mountGundabad!.damageTaken, 2);
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  const dragon = gundabadDragon(s)!;
  s.staging = s.staging.filter((u) => u.code !== G.slave);
  damage(s, dragon.id, 3);
  assert.equal(dragon.damage, 9);
  assert.equal(s.mountGundabad!.damageTaken, 2);
});
test("Dragon Scales cancels an entire damage event, leaves cap unused, and still cancels quest damage", () => {
  let s = second(),
    d = gundabadDragon(s)!;
  const scales = make(s, G.scales);
  d.attachments.push({ id: scales.id, code: scales.code, exhausted: false });
  damage(s, d.id, 10);
  assert.equal(d.damage, 0);
  assert.equal(d.attachments.length, 0);
  assert.equal(s.mountGundabad!.damageTaken, 0);
  assert.ok(s.encounterDiscard.includes(G.scales));
  const a = make(s, G.scales);
  d.attachments.push({ id: a.id, code: a.code, exhausted: false });
  damage(s, d.id, 5, { questEffect: true });
  assert.equal(d.damage, 0);
  damage(s, d.id, 10);
  assert.equal(d.damage, 2);
});
test("Five quest cards make Dagnir considered engaged with every player without moving or optional engagement", () => {
  const s = second(3);
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower, G.pursuit, G.warriors]);
  const d = gundabadDragon(s)!;
  for (const p of playerOrder(s))
    assert.equal(H.consideredEngaged!(s, d, p), true);
  assert.equal(H.cannotEngage!(s, d), true);
  assert.equal(H.cannotLeave!(s, d), true);
  destroy(s, d);
  assert.ok(s.staging.some((u) => u.id === d.id));
});
test("The actual Great Worm player attack offers the sole win response before five completed quests", () => {
  let s = second();
  setQuest(s, G.worm);
  giveSword(s, 0);
  const d = gundabadDragon(s)!;
  d.damage = 20;
  d.owner = 0;
  s.staging = [];
  s.engaged = [d];
  s.phase = "attack";
  const h = s.heroes[0];
  h.tempAttack = 30;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: d.id,
    attackerIds: [h.id],
  });
  s = settle(s, "skip");
  assert.equal(s.status, "playing");
  s.heroes[0].attacked = false;
  s.heroes[0].exhausted = false;
  gundabadDragon(s)!.attackedBy = [];
  gundabadDragon(s)!.attacked = false;
  s = applyAction(reload(s), {
    type: "ATTACK",
    enemyId: d.id,
    attackerIds: [h.id],
  });
  while (s.flow?.pending)
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /Great Worm/);
  s = choose(reload(s), "use");
  s = settle(s);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards?.includes(G.dagnir));
  assert.ok(!s.heroes[0].attachments.some((a) => a.code === G.sword));
});
test("A remote attack cannot spend another player's Reforged Wormsbane", () => {
  const s = second(2);
  setQuest(s, G.worm);
  giveSword(s, 0);
  const d = gundabadDragon(s)!;
  d.damage = 20;
  selectSeat(s, 1);
  H.playerAttackResolved!(s, d, [], 0, 0);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.status, "playing");
});
test("Wormsbane bearer leaving by discard loses even if other heroes survive", () => {
  const s = second(2),
    bearer = s.heroes[0];
  discardCharacter(s, bearer);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Wormsbane/);
  assert.ok(seatView(s, 1).heroes.length);
});
test("Narrow Stair forces actual travel and its Deep keyword replaces it with the physical Caves card", () => {
  let s = second();
  s.phase = "travel";
  const stairs = add(s, G.stairs),
    other = add(s, G.ruins),
    cave = s.mountGundabad!.cavesDeck[0];
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: other.id }),
    /Narrow Stair/,
  );
  s = applyAction(reload(s), { type: "TRAVEL", id: stairs.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, cave.id);
  assert.ok(s.encounterDiscard.includes(G.stairs));
});
test("Deep does nothing with empty Caves, and Forked Passage response still resolves Deep after entering victory", () => {
  let s = second();
  s.phase = "travel";
  s.mountGundabad!.cavesDeck = [];
  let tunnel = add(s, G.tunnel);
  s = applyAction(reload(s), { type: "TRAVEL", id: tunnel.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, tunnel.id);
  s = second(2);
  s.phase = "travel";
  const fork = add(s, G.fork),
    top = s.mountGundabad!.cavesDeck.slice(0, 2);
  s = applyAction(reload(s), { type: "TRAVEL", id: fork.id });
  while (s.flow?.pending)
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  s = choose(reload(s), "use");
  s = choose(reload(s), top[1].id);
  s = settle(s);
  assert.ok(s.victoryCards?.includes(G.fork));
  assert.equal(s.activeLocation?.id, top[1].id);
  assert.equal(s.mountGundabad!.cavesDeck.at(-1)?.id, top[0].id);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
});
test("First Forge exhausts only bearer, blocks every ready route until explored, and reattaches the same reforged objective", () => {
  let s = second(2);
  const forge = s.mountGundabad!.setAside.shift()!,
    id = giveSword(s, 0, false);
  s.staging.push(forge);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: forge.id });
  s = settle(s);
  assert.equal(s.heroes[0].exhausted, true);
  readyCharacter(s, s.heroes[0], false);
  assert.equal(s.heroes[0].exhausted, true);
  progressLocation(s, s.activeLocation!, 1);
  flush(s);
  s = choose(reload(s), "use");
  const other = seatView(s, 1).heroes[0];
  s = choose(reload(s), other.id);
  s = settle(s);
  assert.equal(s.mountGundabad!.reforged, true);
  assert.ok(seatView(s, 1).heroes[0].attachments.some((a) => a.id === id));
  assert.ok(s.victoryCards?.includes(G.forge));
});
test("Dagnir's Hoard exploration attacks every seat in turn order before the optional Item search", () => {
  let s = second(2);
  s.activeLocation = make(s, G.hoard);
  progressLocation(s, s.activeLocation, 7);
  s = finish(s);
  assert.deepEqual(
    s.log
      .filter((l) => l.text.startsWith("Dagnir attacks for"))
      .map((l) => l.player),
    [0, 1],
  );
  assert.ok(s.victoryCards?.includes(G.hoard));
  assert.equal(s.status, "playing");
});
test("Throat of Mountain's optional response replaces/bypasses current quest, flips now and conserves hidden quest identities", () => {
  let s = second();
  s.activeLocation = make(s, G.throat);
  const before = [...s.mountGundabad!.questDeck, G.upper].sort(),
    chosen = s.mountGundabad!.questDeck[0];
  progressLocation(s, s.activeLocation, 4);
  flush(s);
  s = choose(reload(s), "use");
  s = choose(reload(s), chosen);
  s = settle(s);
  assert.equal(s.mountGundabad!.currentQuest, chosen);
  assert.equal(s.mountGundabad!.questFront, false);
  assert.deepEqual([...s.mountGundabad!.questDeck, chosen].sort(), before);
  assert.ok(!s.victoryCards?.includes(G.upper));
});
test("Hobgoblin guards the real first player's top card and returns that identity to its owner's hand", () => {
  let s = second(2);
  s.table!.first = 1;
  const top = make(s, "01014");
  forOwner(s, 1, () => {
    s.deck = [];
    putPlayerDeck(s, top);
  });
  placeEncounter(s, G.hobgoblin, false, 0, undefined, true);
  s = finish(s);
  const goblin = s.staging.find((u) => u.code === G.hobgoblin)!,
    held = s.mountGundabad!.guardedPlayerCards[0];
  assert.equal(held.player, 1);
  assert.equal(held.card.id, top.id);
  assert.equal(stats(s, goblin).attack, 5);
  assert.equal(threatOf(s, goblin), 5);
  destroy(s, goblin);
  s = finish(s);
  assert.ok(seatView(s, 1).hand.some((u) => u.id === top.id));
  assert.equal(s.mountGundabad!.guardedPlayerCards.length, 0);
});
test("Deep-dweller immediately attacks its engaged player and returns only after surviving damage", () => {
  let s = second(2);
  const u = add(s, G.dweller);
  forOwner(s, 1, () => engage(s, u));
  s = finish(s);
  assert.ok(
    s.log.some(
      (l) => l.player === 1 && l.text.startsWith("Deep-dweller attacks for"),
    ),
  );
  damage(s, u.id, 1);
  s = finish(s);
  assert.ok(s.staging.some((v) => v.id === u.id));
  assert.equal(seatView(s, 1).engaged.length, 0);
  damage(s, u.id, 3);
  s = finish(s);
  assert.ok(!s.staging.some((v) => v.id === u.id));
  assert.ok(s.encounterDiscard.includes(G.dweller));
});
test("Guardian, Ruins, Mines and Great Worm continuous modifiers use all quest cards, not location victory", () => {
  const s = second();
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower]);
  const guardian = add(s, G.guardian),
    ruins = add(s, G.ruins),
    d = gundabadDragon(s)!;
  assert.equal(stats(s, guardian).defense, 3);
  assert.equal(threatOf(s, ruins), 4);
  const before = engagementOf(s, d);
  add(s, G.mines);
  assert.equal(engagementOf(s, d), before - 10);
  addVictoryCard(s, G.armory);
  assert.equal(gundabadQuestCount(s), 3);
});
test("Dark Tunnel blocks only Dark staging progress; Underground Lake scales to largest seat and exhausts entering allies", () => {
  const s = second(2),
    t = add(s, G.tunnel),
    ruins = add(s, G.ruins);
  progressLocation(s, ruins, 10);
  assert.equal(ruins.progress, 0);
  s.staging = s.staging.filter((v) => v.id !== t.id);
  progressLocation(s, ruins, 1);
  assert.equal(ruins.progress, 1);
  const lake = add(s, G.lake);
  const ally = make(s, "01013");
  seatView(s, 1).allies.push(ally);
  H.allyEntered!(s, ally, true, true);
  assert.equal(ally.exhausted, true);
  assert.equal(threatOf(s, lake), 4);
});
test("Lower Deeps prevents cancellation of only the first revealed treachery, including duplicate physical copies", () => {
  let s = second();
  setQuest(s, G.lower);
  s.hand = [make(s, "01050")];
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.encounterDeck = [];
  revealCard(s, G.darkPlaces);
  flush(s);
  assert.ok(!s.choice?.options.some((o) => o.code === "01050"));
  s = settle(s);
  revealCard(s, G.darkPlaces);
  flush(s);
  assert.ok(s.choice?.options.some((o) => o.code === "01050"));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
});
test("A canceled treachery before entering Lower Deeps still consumes the round's first revelation", () => {
  const s = second();
  H.revealed!(s, G.darkPlaces, "encounter");
  setQuest(s, G.lower);
  H.revealed!(s, G.darkPlaces, "encounter");
  assert.equal(H.cannotCancel!(s, false, G.darkPlaces), false);
});
test("Foreboding Darkness limits actual player card plays by seat and phase while puts into play are separate", () => {
  let s = second(2);
  setQuest(s, G.darkness);
  s.hand = [make(s, "01013"), make(s, "01014")];
  s = applyAction(reload(s), { type: "PLAY", id: s.hand[0].id });
  s = settle(s);
  assert.match(canPlay(s, s.hand[0]) ?? "", /Foreboding/);
  s = applyAction(reload(s), { type: "NEXT" });
  forOwner(s, 1, () => {
    s.hand = [make(s, "01013")];
    assert.equal(canPlay(s, s.hand[0]), null);
  });
  s.phase = "travel";
  assert.doesNotMatch(canPlay(s, s.hand[0]) ?? "", /Foreboding/);
});
test("Suffocating Shadows assigns only each player's allies and preserves the allocation through reload", () => {
  let s = second(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies = [make(s, "01014")];
    });
  placeEncounter(s, G.shadows, false, 0, undefined, true);
  flush(s);
  assert.match(s.choice!.title, /allies/);
  assert.ok(
    s.choice!.options.every((o) => o.id.startsWith(s.allies[0].id + ":")),
  );
  s = choose(reload(s), s.allies[0].id + ":2");
  s = settle(s);
  assert.equal(seatView(s, 0).allies[0].damage, 2);
  assert.equal(seatView(s, 1).allies[0].damage, 2);
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
});
test("Afraid of the Dark attaches/removes a questing hero, blanks it only with a Dark active location", () => {
  let s = second();
  const h = s.heroes[0];
  h.committed = true;
  s.committedIds = [h.id];
  placeEncounter(s, G.afraid, false, 0, undefined, true);
  flush(s);
  s = choose(reload(s), h.id);
  s = settle(s);
  assert.equal(s.heroes[0].committed, false);
  assert.ok(stats(s, s.heroes[0]).will > 0);
  s.activeLocation = make(s, G.ruins);
  assert.equal(stats(s, s.heroes[0]).will, 0);
  assert.equal(s.heroes[0].blanked, true);
  s.activeLocation = null;
  stats(s, s.heroes[0]);
  assert.equal(!!s.heroes[0].blanked, false);
});
test("Wilderland's Bane grants a round-long engagement reduction when no player is engaged", () => {
  let s = second();
  const before = engagementOf(s, gundabadDragon(s)!);
  placeEncounter(s, G.bane, false, 0, undefined, true);
  s = finish(s);
  assert.equal(engagementOf(s, gundabadDragon(s)!), Math.max(0, before - 30));
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.equal(engagementOf(s, gundabadDragon(s)!), before);
});
test("Dragon Breath resolves damage for the attacked remote seat before the native defender prompt", () => {
  let s = second(2);
  const d = gundabadDragon(s)!,
    a = make(s, G.breath);
  d.attachments.push({ id: a.id, code: a.code, exhausted: false });
  s = effect(s, "immediateAttack", { target: d.id, player: 1 });
  s = settle(s);
  assert.ok(seatView(s, 1).heroes.every((h) => h.damage === 1));
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
  assert.ok(s.encounterDiscard.includes(G.breath));
  assert.equal(gundabadDragon(s)!.attachments.length, 0);
});
test("Narrow Stair shadow blocks player ready effects through refresh but permits normal readying", () => {
  let s = second();
  const enemy = add(s, G.guardian),
    h = s.heroes[1];
  s.combat = {
    enemyId: enemy.id,
    defenderId: h.id,
    attackBonus: 0,
    attackPlayer: 0,
  };
  H.shadow!(s, G.stairs);
  h.exhausted = true;
  readyCharacter(s, h, true);
  assert.equal(h.exhausted, true);
  readyCharacter(s, h, false);
  assert.equal(h.exhausted, false);
  s.combat = null;
  s.phase = "refresh";
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.equal(H.cannotPlayerReadyCharacter!(s, s.heroes[1]), false);
});
for (const [code, bonus] of [
  [G.slave, 1],
  [G.shadows, 1],
  [G.darkPlaces, 1],
] as const)
  test(`${card(code).name} original shadow applies its printed attack branch`, () => {
    const s = second(),
      e = add(s, G.guardian);
    s.combat = { enemyId: e.id, defenderId: s.heroes[1].id, attackBonus: 0 };
    assert.equal(H.shadow!(s, code), true);
    assert.equal(s.combat.attackBonus, bonus);
  });
test("Guardian shadow persists as defense through player attacks, Suffocating/Slave higher branches use current victory/engagement", () => {
  const s = second();
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower, G.pursuit, G.warriors]);
  const e = add(s, G.guardian);
  s.combat = { enemyId: e.id, defenderId: s.heroes[1].id, attackBonus: 0 };
  H.shadow!(s, G.guardian);
  assert.equal(stats(s, e).defense, 5);
  H.shadow!(s, G.shadows);
  assert.equal(s.combat.attackBonus, 3);
  H.shadow!(s, G.slave);
  assert.equal(s.combat.attackBonus, 5);
  H.shadow!(s, G.bane);
  assert.equal(s.combat.extraAttacks, 1);
});
test("Gundabad public state contains counts but never leaks hidden Caves/quest identities", () => {
  const s = second(),
    p = mountGundabadPublicState(s)!;
  assert.equal(typeof p.cavesDeck, "number");
  assert.equal(typeof p.questDeck, "number");
  assert.ok(!JSON.stringify(p).includes(s.mountGundabad!.cavesDeck[0].id));
  assert.ok(publicState(s));
  const bad = JSON.parse(JSON.stringify(s));
  bad.mountGundabad.questDeck.push(bad.mountGundabad.questDeck[0]);
  assert.equal(validateSave(bad), false);
});

test("Upper Levels triggers once after all actual multiplayer commitments, never after just the first seat", () => {
  let s = second(2);
  s.phase = "quest";
  const first = s.heroes[1].id;
  s = applyAction(reload(s), { type: "TOGGLE_QUEST", id: first });
  s = applyAction(reload(s), { type: "COMMIT" });
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [20, 20],
  );
  assert.equal(s.table!.active, 1);
  s = applyAction(reload(s), { type: "TOGGLE_QUEST", id: s.heroes[1].id });
  s = applyAction(reload(s), { type: "COMMIT" });
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [21, 21],
  );
  assert.equal(s.phase, "staging");
});
test("Frenzied Warrens discards exactly five and adds one seeded random enemy, never reveals its keywords", () => {
  let s = second();
  setQuest(s, G.warriors);
  s.encounterDeck = [
    G.bane,
    G.dweller,
    G.guardian,
    G.darkPlaces,
    G.ruins,
    G.mines,
  ];
  H.committed!(s);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.encounterDiscard.length, 4);
  assert.equal(
    s.staging.filter((u) => [G.dweller, G.guardian].includes(u.code)).length,
    1,
  );
  assert.equal(s.log.filter((l) => l.text.startsWith("Revealed")).length, 0);
  s = second(2);
  setQuest(s, G.warriors);
  addQuestProgress(s, mainQuestUnit(s)!, 5);
  check(s);
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [15, 15],
  );
  assert.ok(s.victoryCards?.includes(G.warriors));
});
test("Dagnir's Wrath chooses the attack order among six-character players and its quest damage bypasses cap/Slave", () => {
  let s = second(3);
  setQuest(s, G.wrath);
  for (const p of [0, 2])
    forOwner(s, p, () => {
      s.allies = [make(s, "01013"), make(s, "01013"), make(s, "01013")];
    });
  H.committed!(s);
  flush(s);
  assert.match(s.choice!.title, /next player attacked/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["0", "2"],
  );
  s = choose(reload(s), "2");
  s = settle(s);
  assert.deepEqual(
    s.log
      .filter((l) => l.text.startsWith("Dagnir attacks for"))
      .map((l) => l.player),
    [2, 0],
  );
  s = second();
  setQuest(s, G.wrath);
  const d = gundabadDragon(s)!;
  d.damage = 4;
  s.mountGundabad!.damageTaken = gundabadX(s);
  add(s, G.slave);
  addQuestProgress(s, mainQuestUnit(s)!, 7);
  check(s);
  s = finish(s);
  assert.equal(gundabadDragon(s)!.damage, 9);
  assert.equal(s.mountGundabad!.damageTaken, 2);
});
test("Imminent Pursuit damages a chosen own quester in each seat and defeat discards a non-unique enemy", () => {
  let s = second(2);
  setQuest(s, G.pursuit);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[1].committed = true;
      s.committedIds = [s.heroes[1].id];
    });
  H.committed!(s);
  flush(s);
  assert.ok(s.choice!.options.every((o) => o.id === s.heroes[1].id));
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[1].damage, 2);
  assert.equal(seatView(s, 1).heroes[1].damage, 2);
  const target = add(s, G.guardian);
  addQuestProgress(s, mainQuestUnit(s)!, 6);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Discard a non-unique/);
  assert.ok(!s.choice!.options.some((o) => o.code === G.dagnir));
  s = choose(reload(s), target.id);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.id === target.id));
  assert.ok(s.encounterDiscard.includes(G.guardian));
});
test("Crumbling Cavern assigns one simultaneous allocation per player using that player's character count", () => {
  let s = second(2);
  const cavern = s.mountGundabad!.cavesDeck.find((u) => u.code === G.cavern)!;
  s.mountGundabad!.cavesDeck = s.mountGundabad!.cavesDeck.filter(
    (u) => u.id !== cavern.id,
  );
  s.staging.push(cavern);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: cavern.id });
  while (s.flow?.pending)
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /Assign 3 damage/);
  s = choose(reload(s), s.heroes[1].id + ":3");
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[1].damage, 3);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    3,
  );
});
test("Frightful Den reshuffles the discard pile and adds exactly one discarded enemy per surviving player", () => {
  let s = second(2);
  const den = s.mountGundabad!.cavesDeck.find((u) => u.code === G.den)!;
  s.mountGundabad!.cavesDeck = s.mountGundabad!.cavesDeck.filter(
    (u) => u.id !== den.id,
  );
  s.staging.push(den);
  s.phase = "travel";
  s.encounterDeck = [G.ruins, G.dweller];
  s.encounterDiscard = [G.guardian, G.bane];
  s = applyAction(reload(s), { type: "TRAVEL", id: den.id });
  s = settle(s);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    3,
  );
  assert.ok(s.staging.some((u) => u.code === G.dweller));
  assert.ok(s.staging.some((u) => u.code === G.guardian));
  assert.equal(allEngaged(s).length, 0);
});
test("Lightless Grotto resolves only the discarded treachery's When Revealed, without its Surge or Doomed", () => {
  let s = second();
  setQuest(s, G.darkness);
  const grotto = make(s, G.grotto);
  s.activeLocation = grotto;
  s.encounterDeck = [G.ruins, G.eyes, G.guardian];
  s.heroes[1].committed = true;
  s.committedIds = [s.heroes[1].id];
  H.committed!(s);
  s = finish(s, "threat");
  assert.equal(s.threat, 21);
  assert.deepEqual(s.encounterDeck, [G.guardian]);
  assert.ok(s.encounterDiscard.includes(G.ruins));
  assert.ok(s.encounterDiscard.includes(G.eyes));
  assert.equal(s.mountGundabad!.firstTreacheryRound, -1);
});
test("Ancient Treasury may be declined and later used once for the group, with separate seat choices", () => {
  let s = second(2);
  const treasury = s.mountGundabad!.cavesDeck.find(
    (u) => u.code === G.treasury,
  )!;
  s.mountGundabad!.cavesDeck = s.mountGundabad!.cavesDeck.filter(
    (u) => u.id !== treasury.id,
  );
  s.staging.push(treasury);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: treasury.id });
  s = settle(s, "skip");
  assert.ok(!s.mountGundabad!.usedResponses.includes(G.treasury));
  H.travelEntered!(s, s.activeLocation!, false);
  flush(s);
  s = choose(reload(s), "use");
  s = choose(reload(s), "threat");
  s = choose(reload(s), "draw");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 17);
  assert.equal(seatView(s, 1).hand.length, 2);
  assert.ok(s.mountGundabad!.usedResponses.includes(G.treasury));
  H.travelEntered!(s, s.activeLocation!, false);
  flush(s);
  assert.equal(s.choice, null);
});
test("Lost Armory searches Weapon or Armor only, keeps actual card identity, and consumes its group limit", () => {
  let s = second();
  const armory = s.mountGundabad!.cavesDeck.find((u) => u.code === G.armory)!;
  s.mountGundabad!.cavesDeck = s.mountGundabad!.cavesDeck.filter(
    (u) => u.id !== armory.id,
  );
  s.staging.push(armory);
  s.phase = "travel";
  s.deck = ["01027", "01039", "01026"];
  s = applyAction(reload(s), { type: "TRAVEL", id: armory.id });
  while (s.flow?.pending)
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  s = choose(reload(s), "use");
  assert.ok(!s.choice!.options.some((o) => o.id === "01027"));
  assert.ok(s.choice!.options.some((o) => o.id === "01039"));
  s = choose(reload(s), "01039");
  s = settle(s);
  assert.equal(s.hand[0].code, "01039");
  assert.equal(s.deck.length, 2);
  assert.ok(s.mountGundabad!.usedResponses.includes(G.armory));
});
test("Eyes in the Dark can discard a chosen remote quester instead of raising that player's threat", () => {
  let s = second(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[1].committed = true;
      s.committedIds = [s.heroes[1].id];
    });
  placeEncounter(s, G.eyes, false, 0, undefined, true);
  flush(s);
  s = choose(reload(s), "threat");
  const target = seatView(s, 1).heroes[1];
  s = choose(reload(s), target.id);
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 20);
  assert.ok(!seatView(s, 1).heroes.some((h) => h.id === target.id));
  assert.equal(s.heroes.length, 3);
});
test("Dark Places uses the active location's total threat and otherwise discards to a location without revealing it", () => {
  let s = second(2);
  s.activeLocation = make(s, G.lake);
  placeEncounter(s, G.darkPlaces, false, 0, undefined, true);
  s = finish(s);
  assert.equal(H.stagingThreat!(s), 3);
  s.phase = "travel";
  assert.equal(H.stagingThreat!(s), 0);
  s = second();
  s.encounterDeck = [G.bane, G.dweller, G.mines, G.ruins];
  placeEncounter(s, G.darkPlaces, false, 0, undefined, true);
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === G.mines));
  assert.deepEqual(s.encounterDeck, [G.ruins]);
  assert.equal(s.log.filter((l) => l.text.includes("immediate")).length, 0);
});
test("Dragon Might treacheries attach the physical card, obey limit one and keep printed Surge", () => {
  let s = second();
  s.encounterDeck = [G.ruins];
  revealCard(s, G.scales);
  flush(s);
  const d = gundabadDragon(s)!;
  s = choose(reload(s), d.id);
  s = settle(s);
  assert.equal(gundabadDragon(s)!.attachments[0].code, G.scales);
  assert.ok(s.staging.some((u) => u.code === G.ruins));
  assert.ok(!s.encounterDiscard.includes(G.scales));
  placeEncounter(s, G.scales, false, 0, undefined, true);
  s = finish(s);
  assert.equal(
    gundabadDragon(s)!.attachments.filter((a) => a.code === G.scales).length,
    1,
  );
  assert.ok(s.encounterDiscard.includes(G.scales));
});
test("Mines shadow assigns damage only for a Dagnir attack and only among the attacked seat's characters", () => {
  let s = second(2),
    d = gundabadDragon(s)!;
  s.combat = {
    enemyId: d.id,
    defenderId: seatView(s, 1).heroes[1].id,
    attackBonus: 0,
    attackPlayer: 1,
  };
  H.shadow!(s, G.mines);
  flush(s);
  assert.match(s.choice!.title, /Assign 2 damage/);
  assert.ok(
    s.choice!.options.every((o) =>
      seatView(s, 1).heroes.some((h) => o.id.startsWith(h.id + ":")),
    ),
  );
  s = settle(s);
  assert.equal(
    seatView(s, 0).heroes.reduce((n, h) => n + h.damage, 0),
    0,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.damage, 0),
    2,
  );
  const e = add(s, G.guardian);
  s.combat = { enemyId: e.id, defenderId: s.heroes[1].id, attackBonus: 0 };
  H.shadow!(s, G.mines);
  flush(s);
  assert.equal(s.choice, null);
});
test("Stone Troll's shadow chooses an attachment controlled by the victim even on a remote host", () => {
  let s = second(2);
  const enemy = add(s, G.guardian),
    a = make(s, "01027");
  seatView(s, 1).heroes[1].attachments.push({
    id: a.id,
    code: a.code,
    owner: 0,
    exhausted: false,
  });
  s.combat = {
    enemyId: enemy.id,
    defenderId: seatView(s, 1).heroes[1].id,
    attackBonus: 0,
    attackPlayer: 1,
  };
  H.shadow!(s, G.troll);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === a.id));
  assert.ok(!s.choice!.options.some((o) => o.code === G.sword));
  s = choose(reload(s), a.id);
  s = settle(s);
  assert.ok(!seatView(s, 1).heroes[1].attachments.some((v) => v.id === a.id));
  assert.ok(seatView(s, 0).discard.includes(a.code));
});
test("Eyes shadow discards only an attacked player's ally for an undefended attack", () => {
  let s = second(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies = [make(s, "01013")];
    });
  const e = add(s, G.guardian);
  s.combat = {
    enemyId: e.id,
    defenderId: null,
    attackBonus: 0,
    attackPlayer: 1,
  };
  H.shadow!(s, G.eyes);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [seatView(s, 1).allies[0].id],
  );
  s = settle(s);
  assert.equal(seatView(s, 0).allies.length, 1);
  assert.equal(seatView(s, 1).allies.length, 0);
});
test("Desecrated Ruins shadow discards a random card from each seat only after that actual attack destroys a character", () => {
  let s = second(2);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.hand = [make(s, "01013"), make(s, "01014")];
    });
  const e = add(s, G.guardian),
    victim = make(s, "01013");
  victim.owner = 1;
  seatView(s, 1).allies.push(victim);
  s.combat = {
    enemyId: e.id,
    defenderId: victim.id,
    attackBonus: 0,
    attackPlayer: 1,
  };
  H.shadow!(s, G.ruins);
  damage(s, victim.id, 3, { enemyId: e.id, combatDamage: true });
  check(s);
  const completed = s.combat!;
  s.combat = null;
  prepend(s, ...H.attackFinished!(s, completed));
  s = finish(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).hand.length),
    [1, 1],
  );
});

test("The Long Defeat actual attachment responds after Lower Deeps Forced search, retaining its discarded physical identity", () => {
  let s = second();
  setQuest(s, G.lower);
  const a = make(s, "10122");
  s.hand = [a];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: a.id,
    target: mainQuestUnit(s)!.id,
  });
  s = settle(s);
  assert.equal(s.questAttachments![G.lower][0].id, a.id);
  addQuestProgress(s, mainQuestUnit(s)!, 3);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Lower Deeps/);
  assert.ok(s.discard.includes("10122"));
  const lake = s.mountGundabad!.cavesDeck.find((u) => u.code === G.lake)!;
  s = choose(reload(s), lake.id);
  assert.match(s.choice!.title, /Long Defeat/);
  assert.equal(s.activeLocation?.id, lake.id);
  s = choose(reload(s), s.choice!.options.find((o) => o.id !== "skip")!.id);
  s = choose(reload(s), "draw");
  s = settle(s);
  assert.equal(s.hand.length, 2);
  assert.equal(s.mountGundabad!.questFront, true);
  assert.equal(s.pendingQuestDefeat, undefined);
});
test("The Road Goes Ever On resolves after Foreboding Darkness replaces its quest, using last-known attachment information", () => {
  let s = second(2);
  setQuest(s, G.darkness);
  const a = make(s, "16012");
  s.hand = [a];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: a.id,
    target: mainQuestUnit(s)!.id,
  });
  s = settle(s);
  forOwner(s, 1, () => {
    s.deck = ["09014", "01014"];
  });
  const top = s.mountGundabad!.questDeck.slice(0, 2);
  addQuestProgress(s, mainQuestUnit(s)!, 4);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Quest deck/);
  s = choose(reload(s), top[0]);
  assert.equal(s.mountGundabad!.currentQuest, top[1]);
  assert.equal(s.mountGundabad!.questFront, false);
  assert.match(s.choice!.title, /Road Goes Ever On/);
  s = choose(reload(s), "search");
  s = choose(reload(s), "player-1");
  s = choose(reload(s), s.choice!.options.find((o) => o.code === "09014")!.id);
  s = settle(s);
  assert.ok(seatView(s, 1).hand.some((u) => u.code === "09014"));
  assert.ok(seatView(s, 0).discard.includes("16012"));
});
test("Bypass and the 2A-to-2B flip discard quest attachments without a defeat response", () => {
  let s = second();
  const a = make(s, "10122");
  s.hand = [a];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: a.id,
    target: mainQuestUnit(s)!.id,
  });
  s = settle(s);
  s = effect(s, "gundabadBypass");
  s = settle(s);
  assert.ok(s.discard.includes("10122"));
  assert.equal(s.hand.length, 0);
  assert.ok(!s.victoryCards?.includes(G.upper));
  s = second();
  setQuest(s, G.lower, true);
  s.hand = [make(s, "10122")];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: s.hand[0].id,
    target: mainQuestUnit(s)!.id,
  });
  s = settle(s);
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.ok(s.discard.includes("10122"));
  assert.equal(s.hand.length, 0);
  assert.equal(s.mountGundabad!.questFront, false);
});
test("Public 2A metadata is indistinguishable for all seven hidden backs, then exposes the actual revealed 2B", () => {
  const s = second(),
    states = [];
  for (const code of [
    G.upper,
    G.lower,
    G.warriors,
    G.wrath,
    G.darkness,
    G.pursuit,
    G.worm,
  ]) {
    setQuest(s, code, true);
    const info = mountGundabadStageInfo(s)!;
    assert.equal(info.side, "A");
    assert.equal(info.cardCode, G.upper);
    assert.equal(info.name, "Exploring Gundabad");
    states.push({
      info,
      currentQuest: mountGundabadPublicState(s)!.currentQuest,
    });
  }
  assert.ok(
    states.every((v) => JSON.stringify(v) === JSON.stringify(states[0])),
  );
  setQuest(s, G.wrath, false);
  assert.equal(mountGundabadStageInfo(s)!.name, "Dagnir's Wrath");
  assert.equal(mountGundabadStageInfo(s)!.cardCode, G.wrath);
  assert.equal(mountGundabadStageInfo(s)!.side, "B");
});

test("Wilderland's Bane uses first-player attack order for all considered-engaged players", () => {
  let s = second(2);
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower, G.warriors, G.pursuit]);
  placeEncounter(s, G.bane, false, 0, undefined, true);
  flush(s);
  assert.match(s.choice!.title, /Wilderland's Bane.*next player/);
  s = choose(reload(s), "1");
  s = settle(s);
  assert.deepEqual(
    s.log
      .filter((l) => l.text.startsWith("Dagnir attacks for"))
      .map((l) => l.player),
    [1, 0],
  );
});

test("Narrow Stair does not prevent leaving travel when an active location already prevents traveling", () => {
  let s = second(3);
  s.activeLocation = make(s, G.lake);
  add(s, G.stairs);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "NEXT" });
  s = settle(s);
  assert.notEqual(s.phase, "travel");
  assert.equal(s.activeLocation?.code, G.lake);
});

// Designer clarification 3.346: a physically single enemy considered engaged
// with each player receives a new shadow for every attack, including normals.
test("Dagnir receives distinct fresh physical shadows for two players' actual normal attacks", () => {
  let s = second(2);
  setQuest(s, G.worm, false, [G.door, G.upper, G.lower, G.warriors, G.pursuit]);
  s.encounterDeck = [G.ruins, G.guardian, G.shadows, G.darkPlaces];
  s.encounterDiscard = [];
  s.phase = "defense";
  const id = gundabadDragon(s)!.id;
  prepareEnemyShadows(s, gundabadDragon(s)!);
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: id,
    defenderId: s.heroes[1].id,
  });
  s = settle(s);
  assert.equal(s.encounterDeck.length, 3);
  assert.ok(s.encounterDiscard.includes(G.ruins));
  assert.deepEqual(gundabadDragon(s)!.shadows, []);
  assert.equal(s.table!.active, 1);
  assert.equal(s.phase, "defense");
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: id,
    defenderId: s.heroes[1].id,
  });
  s = settle(s);
  assert.equal(s.encounterDeck.length, 2);
  assert.ok(s.encounterDiscard.includes(G.guardian));
  assert.deepEqual(gundabadDragon(s)!.shadows, []);
  assert.equal(stats(s, gundabadDragon(s)!).defense, 7);
});

test("Direct-progress Lower Deeps defeat preserves an active immune First Forge, its ready restriction and every physical card", () => {
  let s = second(2);
  setQuest(s, G.lower, false, [G.door, G.upper]);
  const forge = s.mountGundabad!.setAside.shift()!;
  s.activeLocation = forge;
  H.travelEntered!(s, forge, false);
  s = finish(s);
  assert.equal(s.heroes[0].exhausted, true);
  const before = countInventory(s),
    lake = s.mountGundabad!.cavesDeck.find((u) => u.code === G.lake)!;
  addQuestProgress(s, mainQuestUnit(s)!, 3);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Lower Deeps/);
  s = choose(reload(s), lake.id);
  s = settle(s);
  s = reload(s);
  assert.equal(s.activeLocation?.id, lake.id);
  assert.ok(s.extraActiveLocations?.some((u) => u.id === forge.id));
  assert.ok(!s.encounterDiscard.includes(G.forge));
  assert.ok(!s.victoryCards?.includes(G.forge));
  readyCharacter(s, s.heroes[0], false);
  assert.equal(s.heroes[0].exhausted, true);
  assert.deepEqual(countInventory(s), before);
  assert.equal(s.status, "playing");
});
