import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canPlay, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  locationQuest,
  make,
  stats,
  threatOf,
} from "../src/game/core";
import { check, nextRound, progressLocation } from "../src/game/board";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { flush } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { hasResourceIcon } from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import { forOwner, seatView } from "../src/game/table";
import {
  SE,
  STONE_ERECH_HOOKS,
  stoneErechPublicState,
} from "../src/game/stone-erech";
import {
  activate,
  allies,
  base,
  choose,
  deck,
  engaged,
  hand,
  night,
  reload,
  settle,
  stage,
  start,
} from "./stone-erech-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = STONE_ERECH_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
const roundEnd = (s: GameState) => run(s, ...H.roundEnd!(s));
const GANDALF = "01073",
  SNEAK = "01023",
  GUARD = "01013";

test("Setup: Tarlang's Neck is active, the Night begins at Eventide and 1 encounter card per player is revealed", () => {
  for (const players of [1, 2, 3, 4]) {
    const s = start(players);
    const q = s.stoneErech!;
    assert.equal(s.activeLocation?.code, SE.neck);
    assert.equal(q.night.code, SE.eventide);
    // Only The Gloaming, revealed during setup, adds progress.
    assert.equal(
      q.night.progress,
      s.encounterDiscard.filter((c) => c === SE.gloaming).length,
    );
    assert.deepEqual(
      [...q.setAside].sort(),
      [SE.derufin, SE.lord, SE.stone, SE.dusk, SE.midnight].sort(),
    );
    assert.equal(q.derufin, "aside");
    // 38 encounter cards; each player reveals one (surge reveals more).
    const revealed = 38 - s.encounterDeck.length;
    assert.ok(revealed >= players, `${players}: ${revealed} revealed`);
    assert.equal(s.round, 1);
    assert.equal(s.stage, 1);
    reload(s);
  }
});

test("The Night: each round end places progress; Eventide and Dusk move on at 4; Midnight raises threat by its progress", () => {
  let s = base();
  const q = s.stoneErech!;
  roundEnd(s);
  assert.equal(q.night.progress, 1);
  q.night.progress = 3;
  roundEnd(s);
  assert.equal(s.stoneErech!.night.code, SE.dusk);
  assert.equal(s.stoneErech!.night.progress, 0);
  assert.deepEqual(s.victoryCards, [SE.eventide]);
  assert.ok(!s.stoneErech!.setAside.includes(SE.dusk));
  s.stoneErech!.night.progress = 3;
  roundEnd(s);
  assert.equal(s.stoneErech!.night.code, SE.midnight);
  assert.deepEqual(s.victoryCards, [SE.eventide, SE.dusk]);
  // Midnight: 1 progress, then each player raises threat by 1, then by 2.
  roundEnd(s);
  assert.equal(s.threat, 21);
  roundEnd(s);
  assert.equal(s.stoneErech!.night.progress, 2);
  assert.equal(s.threat, 23);
  reload(s);
  // The Gloaming adds progress at once and Eventide moves on immediately.
  s = base();
  s.stoneErech!.night.progress = 3;
  s.encounterDeck = [SE.gloaming, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(s.stoneErech!.night.code, SE.dusk);
  // Its surge revealed Banks of Morthond.
  assert.ok(s.staging.some((u) => u.code === SE.banks));
});

test("Dusk and Midnight effects: threat, attack, defense, quest points and Derufin's willpower", () => {
  const s = base();
  const dwimorberg = stage(s, SE.dwimorberg);
  const whisperer = stage(s, SE.whisperer);
  const captain = stage(s, SE.captain);
  const vale = stage(s, SE.vale);
  const derufin = allies(s, [SE.derufin])[0];
  const read = () => [
    threatOf(s, dwimorberg),
    threatOf(s, whisperer),
    stats(s, captain).attack,
    stats(s, captain).defense,
    locationQuest(s, vale),
    stats(s, derufin).will,
  ];
  assert.deepEqual(read(), [1, 2, 4, 1, 3, 3]);
  night(s, SE.dusk);
  assert.deepEqual(read(), [3, 3, 5, 2, 5, 2]);
  night(s, SE.midnight);
  assert.deepEqual(read(), [5, 4, 6, 3, 7, 1]);
  // Whisperer gains doomed 2 at Midnight; Groping Horror gains surge.
  assert.equal(H.revealedDoomed!(s, SE.whisperer, "encounter"), 2);
  assert.ok(H.revealedSurge!(s, SE.groping));
  night(s, SE.dusk);
  assert.equal(H.revealedDoomed!(s, SE.whisperer, "encounter"), 0);
  assert.ok(!H.revealedSurge!(s, SE.groping));
});

test("Spectral: characters attack with their willpower; Relic from the Dark Years removes Spectral for the phase", () => {
  let s = base();
  const aragorn = s.heroes[0];
  const shade = engaged(s, SE.shade);
  s.phase = "attack";
  // Aragorn: 2 willpower against 1 defense, not his 3 attack.
  s = act(s, { type: "ATTACK", enemyId: shade.id, attackerIds: [aragorn.id] });
  s = settle(s);
  assert.equal(get(s, shade.id)!.damage, 1);
  // The Relic can only be claimed at Midnight, and costs no threat.
  s = base();
  const relic = stage(s, SE.relic);
  s.phase = "planning";
  assert.throws(() =>
    act(s, { type: "CLAIM", id: relic.id, heroId: s.heroes[0].id }),
  );
  night(s, SE.midnight);
  s = act(s, { type: "CLAIM", id: relic.id, heroId: s.heroes[0].id });
  assert.equal(s.threat, 20);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === SE.relic));
  // Attacking an Oathbreaker with the Relic's hero: attack, not willpower.
  const captain = engaged(s, SE.captain);
  s.phase = "attack";
  s = act(s, {
    type: "ATTACK",
    enemyId: captain.id,
    attackerIds: [s.heroes[0].id],
  });
  s = settle(s);
  // Aragorn 3 attack − Captain 1+2 (Midnight) defense = 0.
  assert.equal(get(s, captain.id)!.damage, 0);
  assert.deepEqual(s.stoneErech!.unspectral, [captain.id]);
  run(s, fx("endCombat"));
  assert.deepEqual(s.stoneErech!.unspectral, []);
});

test("Tarlang's Neck: at the beginning of the encounter phase, end it at once or engage every staging enemy; 1B waits for it", () => {
  let s = base();
  activate(s, SE.neck);
  const whisperer = stage(s, SE.whisperer);
  const restless = stage(s, SE.restless);
  s.phase = "travel";
  run(s, fx("startEncounter"));
  assert.match(s.choice!.title, /^Tarlang's Neck/);
  s = choose(s, "end");
  s = settle(s);
  // No engagement: combat begins with both enemies still in the staging area.
  assert.ok(["defense", "attack"].includes(s.phase), s.phase);
  assert.ok(s.staging.some((u) => u.id === restless.id));
  assert.ok(s.staging.some((u) => u.id === whisperer.id));
  assert.equal(s.engaged.length, 0);
  s = base();
  activate(s, SE.neck);
  stage(s, SE.whisperer);
  stage(s, SE.restless);
  run(s, fx("startEncounter"));
  s = choose(s, "engage");
  assert.equal(s.engaged.length, 2);
  assert.equal(
    s.staging.filter((u) => card(u.code).type_code === "enemy").length,
    0,
  );
  // 1B cannot be defeated while Tarlang's Neck is in play.
  s = base();
  s.staging.push(make(s, SE.neck));
  s.progress = 10;
  check(s);
  assert.equal(s.stage, 1);
  s.staging = [];
  check(s);
  flush(s);
  assert.equal(s.stage, 2);
});

test("Stage 2: The Stone of Erech arrives with Derufin; travel exhausts the weak, gives Derufin to the first player and stops readying", () => {
  let s = base(2);
  s.progress = 6;
  check(s);
  flush(s);
  assert.equal(s.stage, 2);
  const stone = s.staging.find((u) => u.code === SE.stone)!;
  assert.ok(stone);
  assert.equal(stone.attachments[0].code, SE.derufin);
  assert.equal(s.stoneErech!.derufin, "attached");
  // X is twice the number of players; immune to player card effects.
  assert.equal(threatOf(s, stone), 4);
  syncAttachmentText(s);
  assert.equal(stone.immuneToPlayerEffects, true);
  // Travel: each character with less than 2 willpower is exhausted.
  const gloin = s.heroes[2];
  const tactics = seatView(s, 1).heroes;
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stone.id });
  s = settle(s);
  assert.equal(s.activeLocation?.code, SE.stone);
  const derufin = seatView(s, 0).allies.find((u) => u.code === SE.derufin);
  assert.ok(derufin, "the first player controls Derufin");
  assert.equal(s.stoneErech!.derufin, "controlled");
  assert.equal(get(s, gloin.id)!.exhausted, false, "Glóin has 2 willpower");
  const legolas = tactics.find((h) => h.code === "01005")!;
  assert.equal(get(s, legolas.id)!.exhausted, true, "Legolas has 1 willpower");
  // While it is active, characters with less than 2 willpower cannot ready.
  run(s, fx("refreshReady"));
  assert.equal(get(s, legolas.id)!.exhausted, true);
  reload(s);
});

test("Terror of the Dead: at the beginning of each round the players skip the planning phase or collect no resources", () => {
  let s = base();
  s.stage = 2;
  s.stoneErech!.currentQuest = SE.terror;
  const before = s.heroes.map((h) => h.resources);
  nextRound(s);
  flush(s);
  assert.match(s.choice!.title, /^Terror of the Dead/);
  s = choose(s, "resources");
  s = settle(s);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    before,
  );
  s = base();
  s.stage = 2;
  s.stoneErech!.currentQuest = SE.terror;
  nextRound(s);
  flush(s);
  s = choose(s, "planning");
  s = settle(s);
  assert.equal(s.stoneErech!.skipPlanning, true);
  run(s, fx("startPlanning"));
  s = settle(s);
  assert.equal(s.stoneErech!.skipPlanning, false);
  assert.notEqual(s.phase, "planning");
});

test("Stage 3: each player searches for an Oathbreaker, The Lord of the Dead arrives, progress needs Derufin, Midnight is a battle", () => {
  let s = base(2);
  s.stage = 2;
  s.stoneErech!.currentQuest = SE.terror;
  s.stoneErech!.setAside = s.stoneErech!.setAside.filter(
    (c) => c !== SE.derufin && c !== SE.stone,
  );
  s.stoneErech!.derufin = "attached";
  s.encounterDeck = [SE.banks, SE.captain, SE.banks];
  s.encounterDiscard = [SE.whisperer];
  s.progress = 8;
  check(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.match(s.choice!.title, /^Search for an Oathbreaker enemy/);
  s = choose(s, `deck-${SE.captain}`);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === SE.captain));
  assert.ok(s.staging.some((u) => u.code === SE.whisperer));
  assert.ok(s.staging.some((u) => u.code === SE.lord));
  assert.equal(s.encounterDiscard.includes(SE.whisperer), false);
  // No progress on 3B until the players control Derufin.
  s.staging = [];
  s.progress = 0;
  addCurrentQuestProgress(s, 5);
  assert.equal(s.progress, 0);
  allies(s, [SE.derufin], 1);
  s.stoneErech!.derufin = "controlled";
  addCurrentQuestProgress(s, 5);
  assert.equal(s.progress, 5);
  // Midnight: Battle.
  assert.equal(H.questStat!(s), undefined);
  night(s, SE.midnight);
  assert.equal(H.questStat!(s), "attack");
  s.progress = 14;
  check(s);
  assert.equal(s.status, "won");
});

test("The Lord of the Dead blanks the characters of his engaged player; Driven by Fear zeroes and blanks a hero", () => {
  let s = base(2);
  const lord = engaged(s, SE.lord, 1);
  syncAttachmentText(s);
  assert.ok(seatView(s, 1).heroes.every((h) => h.blanked));
  assert.ok(seatView(s, 0).heroes.every((h) => !h.blanked));
  assert.equal(lord.attachments.length, 0);
  s = base();
  s.encounterDeck = [SE.driven, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^Driven by Fear/);
  const aragorn = s.heroes[0];
  s = choose(s, aragorn.id);
  s = settle(s);
  const a = get(s, aragorn.id)!;
  syncAttachmentText(s);
  assert.equal(stats(s, a).will, 0);
  assert.equal(a.blanked, true);
});

test("Haunted Valley: ready heroes lose their sphere icons; its Planning Action exhausts a hero, which keeps them", () => {
  let s = base();
  const valley = stage(s, SE.haunted);
  syncAttachmentText(s);
  assert.ok(s.heroes.every((h) => !hasResourceIcon(h, "leadership")));
  s.phase = "planning";
  assert.ok(availableAbilities(s, valley).some((a) => !a.disabled));
  s = act(s, { type: "ABILITY", id: valley.id });
  s = choose(s, s.heroes[0].id);
  syncAttachmentText(s);
  assert.equal(hasResourceIcon(s.heroes[0], "leadership"), true);
  assert.equal(hasResourceIcon(s.heroes[1], "leadership"), false);
  // A Leadership card can now be paid with the exhausted hero.
  const guard = hand(s, [GUARD])[0];
  assert.equal(canPlay(s, guard), null);
  s.phase = "quest";
  assert.ok(availableAbilities(s, get(s, valley.id)!).every((x) => x.disabled));
});

test("Groping Horror: skip the next travel phase, or pass hands to the left (solo: discard the hand)", () => {
  let s = base(2);
  s.encounterDeck = [SE.groping, SE.banks];
  hand(s, [GANDALF], 0);
  hand(s, [SNEAK], 1);
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, "hands");
  s = settle(s);
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    [GANDALF],
  );
  assert.deepEqual(
    seatView(s, 0).hand.map((u) => u.code),
    [SNEAK],
  );
  s = base();
  hand(s, [GANDALF, SNEAK]);
  s.encounterDeck = [SE.groping, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, "hands");
  s = settle(s);
  assert.deepEqual(s.hand, []);
  assert.deepEqual([...s.discard].sort(), [GANDALF, SNEAK].sort());
  s = base();
  s.encounterDeck = [SE.groping, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = choose(s, "travel");
  s = settle(s);
  assert.equal(s.stoneErech!.skipTravel, true);
  stage(s, SE.dwimorberg);
  run(s, fx("startTravel"));
  s = settle(s);
  assert.equal(s.phase, "encounter");
  assert.equal(s.activeLocation, null);
  assert.equal(s.stoneErech!.skipTravel, false);
});

test("Shadow-man stops events this round; Restless Dead and Blackroot Graves bring back the topmost Undead", () => {
  let s = base();
  s.encounterDeck = [SE.shadowMan, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  const sneak = hand(s, [SNEAK])[0];
  for (const h of s.heroes) h.resources = 5;
  assert.match(canPlay(s, sneak)!, /cannot play events/);
  nextRound(s);
  flush(s);
  s = settle(s);
  assert.equal(canPlay(s, sneak), null);
  s = base();
  s.encounterDiscard = [SE.whisperer, SE.banks, SE.captain, SE.banks];
  s.encounterDeck = [SE.restless, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  // The topmost Undead enemy is the Captain, not the Whisperer.
  assert.ok(s.staging.some((u) => u.code === SE.captain));
  assert.ok(s.encounterDiscard.includes(SE.whisperer));
  s = base();
  s.encounterDiscard = [SE.whisperer, SE.banks];
  const graves = activate(s, SE.graves);
  progressLocation(s, graves, 1);
  flush(s);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === SE.whisperer));
});

test("Shadows: Shadow-man, Midnight Throng, Regretful Shade, Murmurs of Dread, Blackroot Graves and Banks of Morthond", () => {
  const defend = (s: GameState, enemy: Unit, defender?: Unit) =>
    act(s, {
      type: "DEFEND",
      enemyId: enemy.id,
      defenderId: defender?.id ?? null,
    });
  // Shadow-man's shadow at Dusk: +2 attack.
  let s = base();
  night(s, SE.dusk);
  let enemy = engaged(s, SE.restless);
  enemy.shadows = [SE.shadowMan];
  s.phase = "defense";
  const aragorn = s.heroes[0];
  s = defend(s, enemy, aragorn);
  s = settle(s);
  // Restless Dead 3 + 2 − Aragorn's 2 defense = 3.
  assert.equal(get(s, aragorn.id)!.damage, 3);
  // Regretful Shade at Midnight: 3 additional shadow cards, all resolved.
  s = base();
  night(s, SE.midnight);
  enemy = engaged(s, SE.restless);
  enemy.shadows = [SE.shade];
  s.encounterDeck = [SE.throng, SE.banks, SE.banks, SE.banks];
  s.phase = "defense";
  const gloin = s.heroes[2];
  s = defend(s, enemy, gloin);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 1, "3 additional shadow cards");
  // 3 + 3 (Midnight Throng at Midnight) − 1 = 5 damage: Glóin (4 hp) falls.
  assert.equal(get(s, gloin.id), undefined);
  // Murmurs of Dread at Dusk: an additional attack after this one.
  s = base();
  night(s, SE.dusk);
  enemy = engaged(s, SE.restless);
  enemy.shadows = [SE.murmurs];
  s.phase = "defense";
  s = defend(s, enemy, s.heroes[2]);
  s = settle(s);
  assert.ok(
    s.log.filter((l) => /attacks for/.test(l.text)).length >= 2,
    "two attacks",
  );
  // Murmurs at Midnight cannot be canceled; Midnight Throng neither.
  night(s, SE.midnight);
  assert.ok(H.cannotCancel!(s, true, SE.murmurs));
  assert.ok(H.cannotCancel!(s, false, SE.throng));
  assert.ok(!H.cannotCancel!(s, false, SE.murmurs));
  // Blackroot Graves: 0 willpower defender takes 2 damage.
  s = base();
  enemy = engaged(s, SE.restless);
  enemy.shadows = [SE.graves];
  const guard = allies(s, [GUARD])[0];
  guard.roundWill = -1;
  s.phase = "defense";
  s = defend(s, enemy, guard);
  s = settle(s);
  assert.equal(get(s, guard.id), undefined);
  // Banks of Morthond: a kill adds 1 progress to the current Night objective.
  s = base();
  enemy = engaged(s, SE.restless);
  enemy.shadows = [SE.banks];
  const victim = allies(s, [GUARD])[0];
  s.phase = "defense";
  s = defend(s, enemy, victim);
  s = settle(s);
  assert.equal(s.stoneErech!.night.progress, 1);
});

test("Midnight Throng and The Dead Ride Behind; Murmurs of Dread and Vale of Shadows when revealed", () => {
  let s = base(2);
  s.encounterDeck = [SE.throng, SE.whisperer, SE.banks];
  s.encounterDiscard = [SE.restless];
  run(s, fx("reveal", { player: 0 }));
  assert.match(s.choice!.title, /^Search for an Undead enemy/);
  s = choose(s, `deck-${SE.whisperer}`);
  s = settle(s, `discard-${SE.restless}`);
  assert.ok(s.staging.some((u) => u.code === SE.whisperer));
  assert.ok(s.staging.some((u) => u.code === SE.restless));
  s = base();
  night(s, SE.dusk);
  const guard = allies(s, [GUARD])[0];
  s.encounterDeck = [SE.deadRide, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  // Dusk: less than 3 willpower. Aragorn 2, Théodred 1, Glóin 2, Guard 1.
  assert.deepEqual(
    s.heroes.map((h) => h.damage),
    [1, 1, 1],
  );
  assert.equal(get(s, guard.id)!.damage, 1);
  s = base();
  s.encounterDeck = [SE.murmurs, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(stats(s, s.heroes[0]).will, 1);
  nextRound(s);
  assert.equal(stats(s, s.heroes[0]).will, 2);
  s = base();
  activate(s, SE.neck);
  s.encounterDeck = [SE.vale, SE.banks];
  run(s, fx("reveal", { player: 0 }));
  s = settle(s);
  assert.equal(s.activeLocation?.code, SE.vale);
  assert.ok(s.staging.some((u) => u.code === SE.neck));
});

test("If Derufin leaves play, the players lose", () => {
  let s = base();
  const derufin = allies(s, [SE.derufin])[0];
  s.stoneErech!.derufin = "controlled";
  s.stoneErech!.setAside = s.stoneErech!.setAside.filter(
    (c) => c !== SE.derufin,
  );
  derufin.damage = 2;
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Derufin/);
  void engagementCost;
  void forOwner;
  void deck;
});

test("Saves and the scenario panel", () => {
  const s = base(2);
  night(s, SE.dusk, 2);
  s.stoneErech!.noEventsRound = s.round;
  const restored = reload(s);
  assert.deepEqual(restored.stoneErech, s.stoneErech);
  const view = stoneErechPublicState(restored)!;
  assert.equal(view.night, SE.dusk);
  assert.equal(view.nightProgress, 2);
  assert.equal(view.noEvents, true);
  assert.deepEqual(publicState(restored).stoneErech, view);
});
