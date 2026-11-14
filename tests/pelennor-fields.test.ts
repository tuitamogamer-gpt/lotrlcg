import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core";
import { check, destroy, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { playerCardImmune } from "../src/game/card-immunity";
import { syncAttachmentText } from "../src/game/attachment-text";
import { hasTrait } from "../src/game/expansion-passives";
import {
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import { FLAME_WEST_ARAGORN, sagaHero } from "../src/game/lotr-saga";
import {
  PF,
  PELENNOR_FIELDS_HOOKS,
  PELENNOR_FIELDS_RECIPES,
  pelennorFieldsPublicState,
  pelennorFieldsStageInfo,
  pfMinasTirithHealth,
} from "../src/game/pelennor-fields";
import {
  SET_ASIDE,
  activate,
  allies,
  base,
  choose,
  created,
  engaged,
  fromAside,
  hand,
  reload,
  settle,
  stage,
} from "./pelennor-fields-fixtures";
import type { GameState, Unit } from "../src/game/types";

const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** The given player reveals a known card from the top of the encounter deck. */
const reveal = (s: GameState, code: string, p = 0) => {
  s.encounterDeck.unshift(code);
  s.queue.push({ kind: "reveal", player: p });
  flush(s);
  return s;
};
const run = (s: GameState, kind: string, p = 0, extra = {}) => {
  s.queue.push(fx(kind, { player: p, ...extra }));
  flush(s);
  return s;
};
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title))
    s = choose(s, "resolve");
  return s;
};
/** An engaged enemy attacks with the given shadow cards (facedown). */
const defend = (
  s: GameState,
  enemy: Unit,
  defender: Unit | null,
  shadows: string[] = [],
) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const deckSize = (easy: boolean) =>
  PELENNOR_FIELDS_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);
const GUARD = "01013",
  SNOWBOURN = "01016",
  TEST_OF_WILL = "01050",
  HASTY = "01048",
  BLADE = "01039";
const hero = (s: GameState, p = 0) =>
  seatView(s, p).heroes.find((h) => h.code !== FLAME_WEST_ARAGORN)!;
const mtDamage = (s: GameState) =>
  s.staging.find((u) => u.code === PF.minasTirith)?.damage ?? -1;

test("Setup: Pelennor Field is the active location, 1A's cards are set aside and the first player may attach the Esquires to different heroes, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = created(players, easy, 601 + players);
      assert.equal(sagaHero(s)!.code, FLAME_WEST_ARAGORN);
      assert.equal(s.activeLocation?.code, PF.field);
      assert.equal(s.staging.length, 0);
      assert.deepEqual(
        [...s.pelennorFields!.setAside].sort(),
        [...SET_ASIDE].sort(),
      );
      assert.equal(s.encounterDeck.length, deckSize(easy));
      assert.match(
        s.choice!.title,
        /^The Garrison of Gondor · Attach Esquire of Rohan/,
      );
    }
  assert.equal(deckSize(false), 40);
  assert.equal(deckSize(true), 30);
  let s = created(2, false, 611);
  const rohanHero = s.choice!.options.find((o) => o.id !== "skip")!.id;
  s = choose(s, rohanHero);
  assert.match(s.choice!.title, /Attach Esquire of Gondor/);
  assert.ok(
    !s.choice!.options.some((o) => o.id === rohanHero),
    "the Esquires go to different heroes",
  );
  s = choose(s, "skip");
  s = settle(s);
  const holder = get(s, rohanHero)!;
  assert.ok(holder.attachments.some((a) => a.code === PF.esquireRohan));
  assert.ok(
    hasTrait(holder, "Rohan"),
    "Esquire of Rohan grants the Rohan trait",
  );
  assert.ok(s.pelennorFields!.setAside.includes(PF.esquireGondor));
  assert.ok(!s.pelennorFields!.setAside.includes(PF.esquireRohan));
  assert.equal(s.round, 1);
});

test("The Garrison of Gondor: no quest or combat phase, 1 progress at the end of each planning phase, then Retreat from Osgiliath brings a Wraith on Wings, an encounter card and an ally from each deck into the staging area", () => {
  let s = base(2, 1);
  assert.equal(PELENNOR_FIELDS_HOOKS.skipQuestPhase!(s), true);
  assert.equal(PELENNOR_FIELDS_HOOKS.skipPhase!(s, "combat"), true);
  assert.equal(PELENNOR_FIELDS_HOOKS.skipPhase!(s, "encounter"), false);
  assert.equal(pelennorFieldsStageInfo(s)!.quest, 2);
  s = run(s, "pfGarrison");
  assert.equal(s.progress, 1);
  assert.equal(s.stage, 1);
  // The decks' tops: a filler then an ally for each player.
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01022", GUARD, ...s.deck];
    });
  s.encounterDeck = [PF.field, PF.field, PF.field];
  s = run(s, "pfGarrison");
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.pelennorFields!.currentQuest, PF.retreat);
  assert.equal(s.staging.filter((u) => u.code === PF.wraith).length, 2);
  assert.equal(s.staging.filter((u) => u.code === PF.field).length, 2);
  const guards = s.staging.filter((u) => u.code === GUARD);
  assert.equal(guards.length, 2);
  for (const p of playerOrder(s))
    assert.ok(
      seatView(s, p).discard.includes("01022"),
      "the filler is discarded",
    );
  // 2B: X is the total cost of the allies in the staging area; they are blank and immune.
  assert.equal(pelennorFieldsStageInfo(s)!.quest, 2 * Number(card(GUARD).cost));
  syncAttachmentText(s);
  assert.ok(guards.every((g) => get(s, g.id)?.blanked));
  assert.ok(guards.every((g) => playerCardImmune(get(s, g.id)!)));
  assert.equal(pelennorFieldsPublicState(s)!.allies, 2);
});

test("Retreat from Osgiliath: at the end of the round the allies in the staging area take damage for each enemy there; at X progress The White City Besieged returns them exhausted with Minas Tirith, Grond and The Witch-king", () => {
  let s = base(2, 2);
  const [a, b] = [
    [0, GUARD],
    [1, SNOWBOURN],
  ].map(([p, code]) => {
    let u!: Unit;
    forOwner(s, p as number, () => {
      u = make(s, code as string);
      u.owner = p as number;
      s.staging.push(u);
    });
    return u;
  });
  fromAside(s, PF.wraith);
  stage(s, PF.eye);
  s.queue.push(...PELENNOR_FIELDS_HOOKS.roundEnd!(s));
  flush(s);
  assert.match(
    s.choice!.title,
    /Assign damage among allies in the staging area · 2 remaining/,
  );
  s = choose(s, a.id);
  s = choose(s, a.id);
  s = settle(s);
  assert.ok(
    !s.staging.some((u) => u.id === a.id),
    "Guard of the Citadel (2 hit points) is discarded",
  );
  assert.ok(seatView(s, 0).discard.includes(GUARD));
  assert.equal(pelennorFieldsStageInfo(s)!.quest, Number(card(SNOWBOURN).cost));
  // X progress defeats 2B; 3A returns the allies and adds the city.
  s.encounterDeck = [PF.orc, PF.eye, PF.serpent];
  s.progress = Number(card(SNOWBOURN).cost);
  check(s);
  flush(s);
  assert.match(
    s.choice!.title,
    /^The White City Besieged · Search for a different enemy/,
  );
  s = choose(s, `deck-${PF.serpent}`);
  s = settle(s);
  assert.equal(s.stage, 3);
  const scout = seatView(s, 1).allies.find((u) => u.id === b.id)!;
  assert.ok(
    scout && scout.exhausted,
    "the ally returns exhausted to its owner",
  );
  for (const code of [PF.minasTirith, PF.grond, PF.witchKing, PF.serpent])
    assert.ok(
      s.staging.some((u) => u.code === code),
      card(code).name,
    );
  const witch = s.staging.find((u) => u.code === PF.witchKing)!;
  assert.ok(!witch.flipped, "The Witch-king enters Captain side faceup");
  assert.equal(pelennorFieldsStageInfo(s)!.quest, 4 + 4 * 2);
  assert.equal(
    pelennorFieldsPublicState(s)!.minasTirith!.health,
    pfMinasTirithHealth(2),
  );
  assert.equal(pfMinasTirithHealth(1), 40);
  assert.equal(pfMinasTirithHealth(4), 70);
});

test("The White City Besieged (Assault): no threat for an unsuccessful quest but damage to Minas Tirith, no questing progress on the stage, progress for each destroyed enemy and no travel to Pelennor locations", () => {
  let s = base(1, 3);
  fromAside(s, PF.minasTirith);
  const threat = s.threat;
  assert.equal(PELENNOR_FIELDS_HOOKS.failedQuest!(s, 4), true);
  assert.equal(s.threat, threat);
  assert.equal(mtDamage(s), 4);
  assert.equal(PELENNOR_FIELDS_HOOKS.successfulQuestProgressBlocked!(s), true);
  assert.equal(PELENNOR_FIELDS_HOOKS.playerQuestProgressBlocked!(s), true);
  // A destroyed enemy places progress equal to its total threat (active location first).
  const loc = activate(s, PF.tower);
  const orc = engaged(s, PF.eye);
  destroy(s, orc, true);
  flush(s);
  assert.equal(get(s, loc.id)?.progress ?? s.activeLocation?.progress, 2);
  assert.equal(s.progress, 0);
  const champion = engaged(s, PF.champion);
  destroy(s, champion, true);
  flush(s);
  assert.equal(
    s.progress,
    1,
    "1 progress explores the Tower, 1 reaches the stage",
  );
  const field = stage(s, PF.field);
  s.phase = "travel";
  s.activeLocation = null;
  assert.match(
    String(canTravel(s, field)),
    /cannot travel to Pelennor locations/,
  );
});

test("Minas Tirith: at the end of the round 1 damage for each enemy in the staging area, the game is lost without hit points, and City Wall takes its damage first", () => {
  let s = base(1, 3);
  const mt = fromAside(s, PF.minasTirith);
  stage(s, PF.eye);
  stage(s, PF.orc);
  stage(s, PF.field);
  s.queue.push(...PELENNOR_FIELDS_HOOKS.roundEnd!(s));
  flush(s);
  assert.equal(get(s, mt.id)?.damage ?? mt.damage, 2);
  // City Wall: the damage goes there first; at 4 it is discarded for 3 threat each.
  s = base(2, 3);
  const city = fromAside(s, PF.minasTirith);
  activate(s, PF.wall);
  const threats = [0, 1].map((p) => seatView(s, p).threat);
  s = run(s, "pfMinas", 0, { value: 6, text: "Test" });
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(PF.wall));
  assert.equal(city.damage, 2);
  for (const p of [0, 1]) assert.equal(seatView(s, p).threat, threats[p] + 3);
  // No hit points remaining at the end of the round: the players lose.
  s = base(1, 3);
  const doomed = fromAside(s, PF.minasTirith);
  doomed.damage = pfMinasTirithHealth(1) - 1;
  stage(s, PF.eye);
  s.queue.push(...PELENNOR_FIELDS_HOOKS.roundEnd!(s));
  flush(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Minas Tirith has no hit points remaining/);
  // "For each player" counts the players still in the game.
  s = base(2, 3);
  const walls = fromAside(s, PF.minasTirith);
  walls.damage = pfMinasTirithHealth(1);
  assert.equal(
    pelennorFieldsPublicState(s)!.minasTirith!.health,
    pfMinasTirithHealth(2),
  );
  s.table!.seats[1].eliminated = true;
  assert.equal(
    pelennorFieldsPublicState(s)!.minasTirith!.health,
    pfMinasTirithHealth(1),
  );
  s.queue.push(...PELENNOR_FIELDS_HOOKS.roundEnd!(s));
  flush(s);
  assert.equal(s.status, "lost");
});

test("The Witch-king, Grond and Wraith on Wings at the beginning of the quest phase; Grond's travel and threat X; The Witch-king's Captain side is immune, cannot be optionally engaged or take damage", () => {
  let s = base(2, 3);
  fromAside(s, PF.minasTirith);
  const grond = fromAside(s, PF.grond);
  const witch = fromAside(s, PF.witchKing);
  const wraith = fromAside(s, PF.wraith);
  s.encounterDeck = [PF.field, PF.dart, PF.orc, PF.field];
  s.queue.push(...(PELENNOR_FIELDS_HOOKS.questBegin!(s) ?? []));
  s.phase = "quest";
  flush(s);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === PF.orc),
    "an enemy is discarded into the staging area",
  );
  assert.ok(s.encounterDiscard.includes(PF.field));
  assert.equal(grond.resources, 1);
  assert.equal(threatOf(s, grond), 1);
  assert.equal(mtDamage(s), 1);
  assert.equal(wraith.resources, 1);
  assert.equal(threatOf(s, wraith), 1);
  assert.equal(engagementCost(s, wraith), 45 - 1);
  wraith.resources = 5;
  s.queue.push(fx("pfWraithResource", { target: wraith.id, player: 0 }));
  flush(s);
  assert.equal(wraith.resources, 5, "limit 5 resources");
  syncAttachmentText(s);
  assert.ok(playerCardImmune(witch));
  assert.ok(playerCardImmune(grond));
  assert.ok(PELENNOR_FIELDS_HOOKS.cannotOptionallyEngage!(s, witch));
  assert.equal(PELENNOR_FIELDS_HOOKS.damageAmount!(s, witch, 3, {}), 0);
  assert.ok(PELENNOR_FIELDS_HOOKS.cannotAttach!(s, wraith, BLADE));
  assert.ok(!PELENNOR_FIELDS_HOOKS.cannotAttach!(s, wraith, PF.beast));
  // Grond's travel: The Witch-king makes an immediate attack against each player.
  s.phase = "travel";
  const effects = PELENNOR_FIELDS_HOOKS.travelEffects!(s, grond)!;
  assert.equal(effects.length, 2);
  assert.ok(
    effects.every((e) => e.kind === "immediateAttack" && e.target === witch.id),
  );
  assert.deepEqual(
    effects.map((e) => e.player),
    playerOrder(s),
  );
});

test("Rohan has Come!: The Witch-king is set aside, each player puts an ally of a hero's sphere from the top 10 cards into play, questing progress becomes damage among enemies and the quest phase ends with Fighting in the Fields", () => {
  let s = base(1, 3);
  const witch = fromAside(s, PF.witchKing);
  forOwner(s, 0, () => {
    s.deck = ["01022", GUARD, ...s.deck];
  });
  s.pelennorFields!.advancing = true;
  s = run(s, "pfStageFour");
  assert.ok(!s.staging.some((u) => u.id === witch.id));
  assert.ok(s.pelennorFields!.setAside.includes(PF.witchKing));
  assert.match(s.choice!.title, /^Rohan has Come! · Put an ally into play/);
  s = choose(s, GUARD);
  s = settle(s);
  assert.ok(s.allies.some((u) => u.code === GUARD));
  assert.equal(s.stage, 4);
  // 4B: questing progress is assigned as damage among enemies in play.
  const orc = engaged(s, PF.champion);
  s.progress = 3;
  PELENNOR_FIELDS_HOOKS.successfulQuestProgress!(s, 3);
  flush(s);
  assert.equal(s.progress, 0);
  for (let n = 0; n < 3; n++) s = choose(s, orc.id);
  assert.equal(get(s, orc.id)!.damage, 3);
  // At the end of the quest phase, 5A: The Witch-king (Sorcerer side) with a Fell Beast.
  s.encounterDeck = [PF.field, PF.beast, PF.field];
  PELENNOR_FIELDS_HOOKS.endQuest!(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 5);
  const sorcerer = s.staging.find((u) => u.code === PF.witchKing)!;
  assert.ok(sorcerer.flipped);
  assert.ok(sorcerer.attachments.some((a) => a.code === PF.beast));
  assert.equal(stats(s, sorcerer).attack, 7);
  assert.equal(threatOf(s, sorcerer), 7);
  assert.equal(engagementCost(s, sorcerer), 40);
});

test("Fighting in the Fields: The Witch-king engages the first player at the beginning of the encounter phase and attacks; only the engaged player attacks him; he and his shadows are immune; the stage needs Aragorn and The Witch-king in the victory display", () => {
  let s = base(2, 5);
  fromAside(s, PF.minasTirith);
  const witch = fromAside(s, PF.witchKing, true);
  syncAttachmentText(s);
  assert.ok(playerCardImmune(witch));
  assert.ok(PELENNOR_FIELDS_HOOKS.shadowImmune!(s, witch));
  PELENNOR_FIELDS_HOOKS.encounterBegin!(s);
  flush(s);
  assert.ok(seatView(s, firstPlayer(s)).engaged.some((u) => u.id === witch.id));
  assert.ok(
    s.combat?.immediate || /Immediate attack/i.test(s.choice?.title ?? ""),
  );
  s = settle(s);
  const other = seatView(s, 1).heroes[0];
  assert.match(
    String(
      PELENNOR_FIELDS_HOOKS.attackProblem!(s, get(s, witch.id) ?? witch, [
        other.id,
      ]),
    ),
    /Only the engaged player/,
  );
  assert.equal(
    PELENNOR_FIELDS_HOOKS.attackProblem!(s, get(s, witch.id) ?? witch, [
      hero(s, 0).id,
    ]),
    null,
  );
  // 20 progress, but The Witch-king is not in the victory display.
  s = base(1, 5);
  s.progress = 20;
  PELENNOR_FIELDS_HOOKS.advance!(s);
  assert.equal(s.status, "playing");
  s.victoryCards = [PF.witchKing];
  PELENNOR_FIELDS_HOOKS.advance!(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Fighting in the Fields is defeated/);
  // An enemy's attack destroying a character damages Minas Tirith.
  s = base(1, 5);
  const mt = fromAside(s, PF.minasTirith);
  const [scout] = allies(s, [SNOWBOURN]);
  const orc = engaged(s, PF.champion);
  s = defend(s, orc, scout);
  s = settle(s);
  assert.ok(!get(s, scout.id));
  assert.ok((s.staging.find((u) => u.id === mt.id)?.damage ?? 0) >= 1);
});

test("Gate of Gondor, Pelennor Field, Siege Tower and Fire-filled Trench", () => {
  let s = base(1, 3);
  const gate = activate(s, PF.gate);
  const orc = stage(s, PF.orc);
  assert.equal(engagementCost(s, orc), 30 - 30);
  const engagedOrc = engaged(s, PF.champion);
  s.phase = "quest";
  progressLocation(s, gate, 3);
  flush(s);
  assert.ok(
    s.staging.some((u) => u.id === engagedOrc.id),
    "explored, it returns each engaged enemy",
  );
  // Pelennor Field: no progress on locations in the staging area while an enemy is there.
  s = base(1, 3);
  const field = stage(s, PF.field);
  const tower = stage(s, PF.tower);
  assert.ok(!PELENNOR_FIELDS_HOOKS.locationProgressBlocked!(s, tower));
  stage(s, PF.orc);
  assert.ok(PELENNOR_FIELDS_HOOKS.locationProgressBlocked!(s, tower));
  assert.ok(PELENNOR_FIELDS_HOOKS.locationProgressBlocked!(s, field));
  // Siege Tower: Archery 3 in the staging area, with the enemies' Archery.
  s = base(1, 3);
  stage(s, PF.tower);
  stage(s, PF.mumak);
  stage(s, PF.eye);
  PELENNOR_FIELDS_HOOKS.combatBegin!(s);
  flush(s);
  assert.match(s.choice!.title, /^Assign Archery damage · 6 remaining/);
  // Its Forced: after it becomes the active location, an enemy from the deck.
  s = base(1, 3);
  const t2 = stage(s, PF.tower);
  s.phase = "travel";
  s.encounterDeck = [PF.field, PF.field];
  s.encounterDiscard = [PF.serpent];
  s = settle(act(s, { type: "TRAVEL", id: t2.id }));
  assert.equal(s.activeLocation?.code, PF.tower);
  assert.ok(s.staging.some((u) => u.code === PF.serpent));
  // Fire-filled Trench: A Test of Will is canceled and the Trench discarded.
  s = base(3, 3);
  const trench = stage(s, PF.trench);
  const spirit = 2;
  hand(s, [TEST_OF_WILL], spirit);
  forOwner(s, spirit, () => {
    for (const h of s.heroes) h.resources = 3;
  });
  s.phase = "staging";
  s = reveal(s, PF.shadow, 0);
  assert.match(s.choice!.title, /^Revealed[:·] Shadow of Mordor/);
  const cancel = s.choice!.options.find((o) => o.code === TEST_OF_WILL)!;
  assert.ok(cancel, JSON.stringify(s.choice!.options.map((o) => o.id)));
  s = choose(s, cancel.id);
  s = settle(s);
  assert.ok(
    !s.staging.some((u) => u.id === trench.id),
    "the Trench is discarded",
  );
  assert.ok(
    seatView(s, spirit).discard.includes(TEST_OF_WILL),
    "the event was played",
  );
  assert.ok(
    s.log.some((l) =>
      /Fire-filled Trench: the event's effects are canceled/.test(l.text),
    ),
  );
  assert.ok(
    playerOrder(s).some((p) => seatView(s, p).heroes.some((h) => h.damage > 0)),
    "Shadow of Mordor resolves",
  );
  // Hasty Stroke cancels a treachery's shadow effect: the Trench does not
  // answer, as no treachery was just revealed from the encounter deck.
  s = base(3, 3);
  const kept = stage(s, PF.trench);
  hand(s, [HASTY], spirit);
  forOwner(s, spirit, () => {
    for (const h of s.heroes) h.resources = 3;
  });
  const [guard] = allies(s, [GUARD], 0);
  s = defend(s, engaged(s, PF.eye, 0), guard, [PF.ruin]);
  const stroke = s.choice!.options.find((o) => o.code === HASTY)!;
  assert.ok(stroke, JSON.stringify(s.choice!.options.map((o) => o.id)));
  s = choose(s, stroke.id);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.id === kept.id),
    "the Trench stays",
  );
  assert.ok(seatView(s, spirit).discard.includes(HASTY));
  assert.ok(
    !s.log.some((l) => /Fire-filled Trench: the event's effects/.test(l.text)),
  );
});

test("The Black Serpent, War Mûmak, Southron Champion, Morgul Captain, Orc of the Eye and Mordor Orc", () => {
  let s = base(2, 3);
  s.phase = "staging";
  s = reveal(s, PF.serpent, 1);
  s = pastReveal(s);
  assert.ok(
    s.combat?.immediate || /Immediate attack/i.test(s.choice?.title ?? ""),
  );
  s = settle(s);
  const serpent = [...s.staging, ...seatView(s, 0).engaged].find(
    (u) => u.code === PF.serpent,
  )!;
  assert.ok(PELENNOR_FIELDS_HOOKS.cannotAttach!(s, serpent, BLADE));
  assert.match(
    String(PELENNOR_FIELDS_HOOKS.attackProblem!(s, serpent, ["a", "b"])),
    /more than 1 character/,
  );
  // War Mûmak: no more than 3 damage each round; defeated, each player -4 threat.
  s = base(2, 3);
  const mumak = engaged(s, PF.mumak);
  assert.equal(PELENNOR_FIELDS_HOOKS.damageAmount!(s, mumak, 5, {}), 3);
  PELENNOR_FIELDS_HOOKS.damageDealt!(s, mumak, 3, {});
  assert.equal(PELENNOR_FIELDS_HOOKS.damageAmount!(s, mumak, 2, {}), 0);
  s.round++;
  assert.equal(PELENNOR_FIELDS_HOOKS.damageAmount!(s, mumak, 2, {}), 2);
  const threats = [0, 1].map((p) => seatView(s, p).threat);
  destroy(s, mumak, true);
  flush(s);
  for (const p of [0, 1]) assert.equal(seatView(s, p).threat, threats[p] - 4);
  // Southron Champion: a shadow with no shadow effect, then 3 damage or an extra attack.
  s = base(1, 3);
  fromAside(s, PF.minasTirith);
  const champ = engaged(s, PF.champion);
  const [g1] = allies(s, [GUARD]);
  s = defend(s, champ, g1, [PF.tower]);
  assert.match(s.choice!.title, /^Southron Champion · Choose one/);
  s = choose(s, "minas");
  s = settle(s);
  assert.equal(mtDamage(s), 3);
  // Morgul Captain (Peril): the topmost Orc in the discard pile engages you.
  s = base(1, 3);
  s.encounterDiscard = [PF.orc, PF.field, PF.eye, PF.field];
  s.phase = "staging";
  s = reveal(s, PF.captain);
  s = pastReveal(s);
  s = settle(s);
  assert.ok(s.engaged.some((u) => u.code === PF.eye));
  assert.ok(s.encounterDiscard.includes(PF.orc));
  // Orc of the Eye (Peril): 2 damage to a hero, or to Minas Tirith.
  s = base(1, 3);
  fromAside(s, PF.minasTirith);
  s.phase = "staging";
  s = reveal(s, PF.eye);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Orc of the Eye · Choose one/);
  s = choose(s, "minas");
  s = settle(s);
  assert.equal(mtDamage(s), 2);
  // Mordor Orc: undefended damage goes to Minas Tirith; its shadow engages it.
  s = base(1, 3);
  fromAside(s, PF.minasTirith);
  const mordor = engaged(s, PF.orc);
  s = defend(s, mordor, null);
  s = settle(s);
  assert.equal(mtDamage(s), 2);
  assert.ok(s.heroes.every((h) => h.damage === 0));
  s = base(1, 3);
  fromAside(s, PF.minasTirith);
  const champ2 = engaged(s, PF.champion);
  const [g2] = allies(s, [GUARD]);
  s.encounterDeck = [PF.field, PF.field];
  s = defend(s, champ2, g2, [PF.orc]);
  s = settle(s);
  const newOrc = s.engaged.find((u) => u.code === PF.orc);
  assert.ok(newOrc, "Mordor Orc engages the defending player");
});

test("The Rammas is Breached, Fell Beast, Black Dart, Spells of Ruin, Dread and Despair and Shadow of Mordor", () => {
  let s = base(2, 3);
  s.encounterDeck = [PF.field, PF.champion, PF.orc];
  s.encounterDiscard = [PF.eye];
  s.phase = "staging";
  s = reveal(s, PF.rammas);
  s = pastReveal(s);
  assert.match(
    s.choice!.title,
    /^The Rammas is Breached · Search for an enemy/,
  );
  s = choose(s, `deck-${PF.champion}`);
  s = choose(s, `discard-${PF.eye}`);
  s = settle(s);
  assert.ok(seatView(s, 0).engaged.some((u) => u.code === PF.champion));
  assert.ok(seatView(s, 1).engaged.some((u) => u.code === PF.eye));
  // Fell Beast: attached to a Nazgûl enemy; at the end of the round it returns to the staging area.
  s = base(1, 3);
  const wraith = fromAside(s, PF.wraith);
  s.staging = s.staging.filter((u) => u.id !== wraith.id);
  s.engaged.push(wraith);
  s.encounterDeck = [PF.field, PF.field];
  s.phase = "staging";
  s = reveal(s, PF.beast);
  s = pastReveal(s);
  s = settle(s);
  const mounted = s.engaged.find((u) => u.id === wraith.id)!;
  assert.ok(mounted.attachments.some((a) => a.code === PF.beast));
  assert.equal(stats(s, mounted).attack, 7);
  assert.equal(stats(s, mounted).defense, 5);
  s.queue.push(...PELENNOR_FIELDS_HOOKS.roundEnd!(s));
  flush(s);
  assert.ok(s.staging.some((u) => u.id === wraith.id));
  // Black Dart: removed from the quest, then 1 damage at the end of each round.
  s = base(1, 3);
  const h = hero(s);
  h.committed = true;
  s.committedIds = [h.id];
  s.phase = "staging";
  s = reveal(s, PF.dart);
  s = pastReveal(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [h.id],
    "a questing hero must be chosen if able",
  );
  s = choose(s, h.id);
  s = settle(s);
  assert.ok(!get(s, h.id)!.committed);
  assert.ok(get(s, h.id)!.attachments.some((a) => a.code === PF.dart));
  s.queue.push(...PELENNOR_FIELDS_HOOKS.roundEnd!(s));
  flush(s);
  assert.equal(get(s, h.id)!.damage, 1);
  // Spells of Ruin: 1 damage to each exhausted character, or 5 to Minas Tirith.
  s = base(1, 3);
  fromAside(s, PF.minasTirith);
  hero(s).exhausted = true;
  s.phase = "staging";
  s = reveal(s, PF.ruin);
  s = pastReveal(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["exhausted", "minas"],
  );
  s = choose(s, "exhausted");
  s = settle(s);
  assert.equal(hero(s).damage, 1);
  // Dread and Despair (Peril, Doomed 1): an ally is discarded, +1 threat per ally in the discard pile.
  s = base(1, 3);
  allies(s, [GUARD]);
  s.discard = [SNOWBOURN];
  s.phase = "staging";
  const before = stagingThreat(s);
  s = reveal(s, PF.despair);
  s = pastReveal(s);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.code === GUARD));
  assert.equal(stagingThreat(s), before + 2);
  s.phase = "travel";
  assert.equal(stagingThreat(s), before);
  // Shadow of Mordor (Doomed 1): 1 damage to a hero; each damaged character's
  // printed text box is blank this round, an ally damaged earlier included.
  s = base(1, 3);
  const [wounded, fresh] = allies(s, [GUARD, SNOWBOURN]);
  wounded.damage = 1;
  s.phase = "staging";
  s = reveal(s, PF.shadow);
  s = pastReveal(s);
  const target = hero(s);
  const spared = s.heroes.find(
    (h) => h.code !== FLAME_WEST_ARAGORN && h.id !== target.id,
  )!;
  s = choose(s, target.id);
  s = settle(s);
  syncAttachmentText(s);
  assert.equal(get(s, target.id)!.damage, 1);
  assert.ok(get(s, target.id)!.blanked);
  assert.ok(get(s, wounded.id)!.blanked, "a damaged ally is blank too");
  assert.ok(!get(s, fresh.id)!.blanked, "an undamaged ally keeps its text");
  assert.ok(!get(s, spared.id)!.blanked, "an undamaged hero keeps its text");
  assert.ok(
    hasTrait(
      get(s, target.id)!,
      card(target.code).traits!.split(".")[0].trim(),
    ),
    "traits stay",
  );
  s.round++;
  syncAttachmentText(s);
  assert.ok(!get(s, target.id)!.blanked);
});

test("The Esquires: Esquire of Gondor's willpower with another questing Gondor character, Esquire of Rohan's attack with another Rohan attacker", () => {
  const s = base(1, 3);
  const [a, b] = s.heroes.filter((h) => h.code !== FLAME_WEST_ARAGORN);
  a.attachments.push({
    id: make(s, PF.esquireGondor).id,
    code: PF.esquireGondor,
    exhausted: false,
    owner: 0,
  });
  b.attachments.push({
    id: make(s, PF.esquireRohan).id,
    code: PF.esquireRohan,
    exhausted: false,
    owner: 0,
  });
  assert.ok(hasTrait(a, "Gondor"));
  assert.ok(hasTrait(b, "Rohan"));
  const will = stats(s, a).will;
  a.committed = true;
  s.committedIds = [a.id];
  const [guard] = allies(s, [GUARD]);
  guard.committed = true;
  assert.equal(
    stats(s, a).will,
    will + 1,
    "Guard of the Citadel is a Gondor character",
  );
  guard.committed = false;
  assert.equal(stats(s, a).will, will);
  const enemy = engaged(s, PF.orc);
  const [scout] = allies(s, [SNOWBOURN]);
  assert.equal(
    PELENNOR_FIELDS_HOOKS.playerAttackBonus!(s, b, enemy, [b, scout]),
    1,
  );
  assert.equal(PELENNOR_FIELDS_HOOKS.playerAttackBonus!(s, b, enemy, [b]), 0);
});
