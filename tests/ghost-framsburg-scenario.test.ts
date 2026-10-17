import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, make, prepend, stats, threatOf } from "../src/game/core";
import {
  check,
  damage,
  destroy,
  engage,
  placeEncounter,
  progressLocation,
  readyCharacter,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import { reduceThreat } from "../src/game/threat-reduction";
import { prepareEnemyShadows } from "../src/game/considered-engagement";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_HOOKS as H,
  ghostControlledLoot,
  ghostDiscoverValue,
  ghostFramsburgEffect,
  ghostFramsburgShadow,
  ghostFramsburgPublicState,
} from "../src/game/ghost-framsburg";
import {
  base,
  choose,
  reload,
  setStage,
  settle,
  start,
} from "./ghost-framsburg-fixtures";
import type { GameState, Unit } from "../src/game/types";
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState, prefer?: string) => {
  flush(s);
  return settle(s, prefer);
};
export function attachLoot(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  seatView(s, player).heroes[0].attachments.push({
    id: u.id,
    code,
    exhausted: false,
    owner: player,
    controller: player,
  });
  return u.id;
}
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Ghost original ${players}p ${easy ? "easy" : "normal"} setup chooses different locations and reloads`, () => {
      const s = reload(start(players, easy));
      assert.equal(s.status, "playing");
      assert.equal(s.ghostFramsburg!.initialized, true);
      assert.equal(s.staging.length, players);
      assert.equal(new Set(s.staging.map((u) => u.code)).size, players);
      assert.ok(s.staging.every((u) => card(u.code).type_code === "location"));
      assert.equal(s.ghostFramsburg!.setAside[0].code, G.tomb);
      assert.equal(
        s.encounterDeck.length + s.encounterDiscard.length + s.staging.length,
        easy ? 29 : 41,
      );
      assert.equal(mainQuestUnit(s)?.code, G.keep);
    });
test("Native travel finds one physical Loot, reveals one seeded random Hazard and discards leftovers across reload", () => {
  let s = base();
  s.phase = "travel";
  const hall = add(s, G.hall);
  s.encounterDeck = [G.key, G.lantern, G.spectre, G.moonlit];
  s = applyAction(reload(s), { type: "TRAVEL", id: hall.id });
  while (!s.choice?.title.startsWith("Discover")) {
    assert.ok(s.flow?.pending);
    s = applyAction(reload(s), { type: "CONTINUE", stepId: s.flow.pending.id });
  }
  assert.equal(s.ghostFramsburg!.discoverCards.length, 4);
  assert.equal(s.choice.options.length, 2);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  s = choose(reload(s), s.choice.options.find((o) => o.code === G.key)!.id);
  s = settle(s);
  assert.equal(s.ghostFramsburg!.loot.length, 1);
  assert.equal(s.ghostFramsburg!.loot[0].unit.code, G.key);
  assert.equal(s.ghostFramsburg!.loot[0].guardId, hall.id);
  assert.ok(s.staging.some((u) => u.code === G.spectre));
  assert.deepEqual(s.encounterDiscard.sort(), [G.lantern, G.moonlit].sort());
  assert.equal(s.ghostFramsburg!.discoverCards.length, 0);
  progressLocation(s, s.activeLocation!, 4);
  s = finish(s);
  assert.equal(ghostControlledLoot(s).length, 1);
  assert.equal(ghostControlledLoot(s)[0].a.code, G.key);
  assert.equal(ghostControlledLoot(s)[0].a.id, s.heroes[0].attachments[0].id);
});
test("Discover reshuffles only before examining and Hidden Staircase rewards no Hazard", () => {
  let s = base(2);
  s.activeLocation = make(s, G.staircase);
  s.encounterDeck = [G.key];
  s.encounterDiscard = [G.lantern, G.teeth];
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 31));
  prepend(
    s,
    fx("ghostFramsburgDiscover", { target: s.activeLocation.id, player: 0 }),
  );
  s = finish(s);
  assert.equal(s.ghostFramsburg!.loot.length, 1);
  assert.equal(s.encounterDiscard.length, 2);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [28, 28],
  );
});
test("Normally revealed Loot is replaced without entering play", () => {
  let s = base();
  s.encounterDeck = [G.moonlit];
  placeEncounter(s, G.key, false, 0, undefined, true);
  s = finish(s);
  assert.ok(s.encounterDiscard.includes(G.key));
  assert.equal(s.staging.length, 1);
  assert.equal(s.staging[0].code, G.moonlit);
  assert.equal(ghostControlledLoot(s).length, 0);
});
test("Stage gates need controlled Loot, stage 2 starts with reshuffle/reveal and stage 3 adds actual Tomb", () => {
  let s = base(3);
  s.progress = 6;
  check(s);
  assert.equal(s.stage, 1);
  attachLoot(s, G.key);
  check(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.staging.length, 3);
  s.staging = [];
  s.progress = 12;
  check(s);
  assert.equal(s.stage, 2);
  attachLoot(s, G.lantern);
  check(s);
  s = finish(s);
  assert.equal(s.stage, 3);
  assert.ok(s.staging.some((u) => u.code === G.tomb));
  assert.equal(s.ghostFramsburg!.setAside.length, 0);
});
test("Cursed Tomb native travel requires 3 Loot and attacks every seat; Tomb+Shade victory completes stage", () => {
  let s = base(2);
  setStage(s, 3);
  s.phase = "travel";
  const tomb = s.ghostFramsburg!.setAside.splice(0)[0];
  s.staging.push(tomb);
  attachLoot(s, G.key);
  attachLoot(s, G.lantern, 1);
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: tomb.id }),
    /3 Loot/,
  );
  attachLoot(s, G.teeth);
  s.encounterDeck = [G.shade, ...Array(20).fill(G.moonlit)];
  s = applyAction(reload(s), { type: "TRAVEL", id: tomb.id });
  assert.equal(s.activeLocation?.id, tomb.id);
  assert.ok(s.combat, "the first immediate attack opens native defense");
  assert.equal(s.combat.attackPlayer, 0);
  s = settle(s);
  assert.deepEqual(
    s.log
      .filter((l) => l.text.startsWith("Fram's Shade attacks for"))
      .map((l) => l.player),
    [0, 1],
  );
  s.combat = null;
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  progressLocation(s, s.activeLocation!, 5);
  s = finish(s);
  assert.ok(s.victoryCards?.includes(G.tomb));
  assert.equal(s.victory, 5);
  s.progress = 6;
  check(s);
  assert.equal(s.status, "playing");
  const shade = [...s.staging, ...allEngaged(s)].find(
    (u) => u.code === G.shade,
  )!;
  destroy(s, shade);
  s = finish(s);
  assert.ok(s.victoryCards?.includes(G.shade));
  assert.equal(s.victory, 11);
  assert.equal(s.status, "won");
});
test("Fram dynamic stats, immunity, multi-shadow replacement and destroyed destination follow controlled Loot", () => {
  let s = base(4);
  const shade = add(s, G.shade),
    stalker = add(s, G.stalker),
    stairs = add(s, G.staircase);
  forOwner(s, 0, () => (s.threat = 37));
  assert.equal(stats(s, stalker).attack, 3);
  assert.equal(threatOf(s, stalker), 3);
  assert.equal(threatOf(s, stairs), 3);
  for (const [i, c] of [G.key, G.lantern, G.teeth].entries())
    attachLoot(s, c, i);
  assert.equal(stats(s, shade).attack, 6);
  assert.equal(stats(s, shade).defense, 6);
  assert.equal(threatOf(s, shade), 6);
  prepareEnemyShadows(s, shade);
  assert.equal(shade.shadows.length, 3);
  setStage(s, 3);
  assert.equal(H.immune!(s, shade), true);
  damage(s, shade.id, 6, { combatDamage: true });
  s = finish(s);
  assert.ok(!s.victoryCards?.includes(G.shade));
  assert.ok(s.encounterDiscard.includes(G.shade));
});
test("Forgotten Crypt finds Undead, guards discard Loot and preserving its ID claims for current first player", () => {
  let s = base(3);
  s.phase = "travel";
  s.table!.first = 2;
  const crypt = add(s, G.crypt);
  s.encounterDeck = [G.key, G.moonlit, G.spectre];
  s = applyAction(reload(s), { type: "TRAVEL", id: crypt.id });
  s = settle(s);
  const loot = s.ghostFramsburg!.loot[0],
    id = loot.unit.id;
  assert.equal(loot.unit.code, G.key);
  const guard = s.staging.find((u) => u.id === loot.guardId)!;
  destroy(s, guard);
  s = finish(s);
  assert.equal(
    ghostControlledLoot(s).find((v) => v.a.id === id)?.host.owner,
    2,
  );
  assert.equal(
    ghostControlledLoot(s).find((v) => v.a.id === id)?.a.code,
    G.key,
  );
});
test("Loot follows ordinary attachment discard when its attached hero leaves play", () => {
  let s = base(2);
  const id = attachLoot(s, G.key, 1),
    hero = seatView(s, 1).heroes[0];
  destroy(s, hero);
  s = finish(s);
  assert.ok(!ghostControlledLoot(s).some((v) => v.a.id === id));
  assert.ok(s.encounterDiscard.includes(G.key));
  assert.equal(s.ghostFramsburg!.loot.length, 0);
});
test("Crypt Key response exhausts actual objective and resolves adjusted Discover", () => {
  let s = base();
  s.phase = "travel";
  attachLoot(s, G.key);
  const moon = add(s, G.moonlit);
  s.encounterDeck = [G.lantern, G.teeth, G.spectre];
  s = applyAction(reload(s), { type: "TRAVEL", id: moon.id });
  s = settle(s, "increase");
  assert.ok(
    ghostControlledLoot(s).find((v) => v.a.code === G.key)?.a.exhausted,
  );
  assert.ok(s.staging.some((u) => u.code === G.spectre));
  assert.equal(s.ghostFramsburg!.loot.length, 1);
});
test("Old Lantern and Scatha's Teeth use actual attachment costs and chosen seat private deck", () => {
  let s = base(2);
  const lantern = attachLoot(s, G.lantern),
    teeth = attachLoot(s, G.teeth),
    host = s.heroes[0];
  s.activeLocation = make(s, G.moonlit);
  forOwner(s, 1, () => (s.deck = ["01013", "01014", "01015", "01016"]));
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: host.id,
    attachmentId: lantern,
  });
  s = choose(reload(s), "1");
  s = settle(s);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    ["01013"],
  );
  assert.deepEqual(seatView(s, 1).deck, ["01015", "01016", "01014"]);
  selectSeat(s, 0);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: host.id,
    attachmentId: teeth,
  });
  s = choose(reload(s), "1");
  s = settle(s);
  assert.equal(seatView(s, 1).threat, 18);
  assert.equal(seatView(s, 0).heroes[0].exhausted, true);
  assert.ok(
    seatView(s, 0).heroes[0].attachments.find((a) => a.id === teeth)?.exhausted,
  );
});
test("Moonlit Passage caps each player's player-card reductions and leaves encounter Loot reductions legal", () => {
  const s = base(2);
  add(s, G.moonlit);
  assert.equal(reduceThreat(s, 3), 1);
  assert.equal(reduceThreat(s, 2), 0);
  forOwner(s, 1, () => {
    assert.equal(reduceThreat(s, 3), 1);
  });
  assert.equal(reduceThreat(s, 2, undefined, "encounter"), 2);
  assert.equal(seatView(s, 0).threat, 17);
  assert.equal(seatView(s, 1).threat, 19);
});
test("Moonlit Passage counts earlier player-card reductions in the same round before it entered staging", () => {
  const s = base();
  assert.equal(reduceThreat(s, 4), 4);
  add(s, G.moonlit);
  assert.equal(reduceThreat(s, 2), 0);
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  s.round++;
  assert.equal(reduceThreat(s, 2), 1);
});
test("Encounter shadows resolve attacker, owner and duration effects across pending saves", () => {
  let s = base(2);
  const enemy = add(s, G.spectre),
    hero = seatView(s, 1).heroes[0];
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 1,
    defenderId: hero.id,
    defenderIds: [hero.id],
    attackBonus: 0,
  };
  ghostFramsburgShadow(s, G.moonlit);
  s = finish(s);
  assert.equal(seatView(s, 1).threat, 21);
  ghostFramsburgShadow(s, G.stalker);
  flush(s);
  assert.ok(s.choice);
  s = choose(reload(s), "threat");
  s = settle(s);
  assert.equal(seatView(s, 1).threat, 23);
  ghostFramsburgShadow(s, G.ruins);
  assert.equal(s.combat!.extraAttacks, 1);
  ghostFramsburgShadow(s, G.terrible);
  assert.equal(s.combat!.attackBonus, 1);
  s.activeLocation = make(s, G.hall);
  s.phase = "defense";
  ghostFramsburgShadow(s, G.spectre);
  assert.equal(s.combat!.attackBonus, 3);
  ghostFramsburgShadow(s, G.bats);
  assert.equal(H.damageAmount!(s, enemy, 2, {}), 0);
  s.phase = "attack";
  assert.equal(
    H.damageAmount!(s, enemy, 2, {}),
    0,
    "shadow protection lasts throughout the actual combat phase",
  );
  s.phase = "refresh";
  assert.equal(H.damageAmount!(s, enemy, 2, {}), 2);
});
test("Evil Spectre returns to shuffled encounter deck only after destruction in the Dark", () => {
  let s = base();
  s.activeLocation = make(s, G.hall);
  const spectre = add(s, G.spectre);
  s.encounterDeck = [G.moonlit];
  destroy(s, spectre);
  s = finish(s);
  assert.equal(s.encounterDeck.filter((c) => c === G.spectre).length, 1);
  assert.ok(!s.encounterDiscard.includes(G.spectre));
  const other = add(s, G.spectre);
  s.activeLocation = null;
  destroy(s, other);
  s = finish(s);
  assert.ok(s.encounterDiscard.includes(G.spectre));
});
test("Stage 2 beginning-of-quest forced choice is mandatory and resolves for the whole group", () => {
  let s = base(4);
  setStage(s, 2);
  s.encounterDeck = [G.key, G.spectre, G.hall, G.moonlit];
  prepend(s, ...H.questBegin!(s)!);
  s = finish(s, "location");
  assert.ok(s.staging.some((u) => u.code === G.hall));
  assert.deepEqual(s.encounterDiscard, [G.key, G.spectre]);
  prepend(s, ...H.questBegin!(s)!);
  s = finish(s, "threat");
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22, 22, 22],
  );
});
for (const players of [1, 2, 3, 4])
  test(`Guarded Loot claim stays with current first player at ${players} seats through reload`, () => {
    let s = base(players);
    if (s.table) s.table.first = players - 1;
    const guard = add(s, G.spectre),
      loot = make(s, G.teeth);
    s.ghostFramsburg!.loot.push({ unit: loot, guardId: guard.id });
    destroy(s, guard);
    s = finish(s);
    const actual = ghostControlledLoot(s).find((v) => v.a.id === loot.id)!;
    assert.equal(actual.a.controller, players - 1);
    assert.equal(actual.host.owner ?? 0, players - 1);
    s = reload(s);
    assert.ok(ghostControlledLoot(s).some((v) => v.a.id === loot.id));
  });
test("Haunted Hall reacts once per placement per copy; Terrible Shadows expires; Slammed Shut blocks player ready", () => {
  let s = base(2);
  const tower = add(s, G.tower);
  add(s, G.hall);
  add(s, G.hall);
  selectSeat(s, 1);
  progressLocation(s, tower, 1);
  s = finish(s);
  assert.equal(seatView(s, 1).threat, 22);
  placeEncounter(s, G.terrible);
  s = finish(s);
  assert.equal(
    stats(s, seatView(s, 0).heroes[0]).attack,
    card(seatView(s, 0).heroes[0].code).attack! - 1,
  );
  placeEncounter(s, G.slammed);
  s = finish(s);
  const h = seatView(s, 0).heroes[0];
  h.exhausted = true;
  readyCharacter(s, h, true);
  assert.equal(h.exhausted, true);
  s.round++;
  readyCharacter(s, h, true);
  assert.equal(h.exhausted, false);
  assert.equal(stats(s, h).attack, card(h.code).attack);
});
test("Shared Wilds encounter definitions explicitly route afraid, eyes, spider, bats and werewolf in Ghost", () => {
  let s = base();
  s.activeLocation = make(s, G.hall);
  const spider = add(s, G.spider),
    bats = add(s, G.bats);
  assert.equal(H.damageAmount!(s, bats, 3, {}), 0);
  const hero = s.heroes[0];
  hero.committed = true;
  s.committedIds = [hero.id];
  placeEncounter(s, G.afraid);
  s = finish(s);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === G.afraid));
  assert.equal(stats(s, s.heroes[0]).will, 0);
  assert.equal(s.heroes[0].committed, false);
  s.combat = {
    enemyId: spider.id,
    attackPlayer: 0,
    defenderId: hero.id,
    attackBonus: 0,
  };
  ghostFramsburgShadow(s, G.spider);
  hero.exhausted = true;
  readyCharacter(s, hero);
  assert.equal(hero.exhausted, true);
  const wolf = add(s, G.werewolf);
  wolf.damage = 2;
  assert.equal(stats(s, wolf).attack, card(wolf.code).attack! + 2);
});
test("Public Ghost state exposes hidden pile counts only and validation rejects forged guarded ids and physical duplicates", () => {
  const s = base();
  s.ghostFramsburg!.discoverCards = [make(s, G.key), make(s, G.shade)];
  const p = ghostFramsburgPublicState(s)!;
  assert.equal(p.discoverCards, 2);
  assert.ok(!JSON.stringify(p).includes(G.key));
  assert.ok(!JSON.stringify(publicState(s)).includes('"discoverCards":[{'));
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  s.ghostFramsburg!.loot.push({
    unit: make(s, G.lantern),
    guardId: "not-real",
  });
  assert.equal(validateSave(JSON.parse(JSON.stringify(s))), false);
});
test("Native quest progress cannot bypass Loot requirements and hero elimination still loses", () => {
  let s = base();
  addQuestProgress(s, 6, mainQuestUnit(s));
  s = finish(s);
  assert.equal(s.stage, 1);
  for (const h of [...s.heroes]) destroy(s, h);
  s = finish(s);
  assert.equal(s.status, "lost");
});
