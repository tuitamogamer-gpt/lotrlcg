import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { engagementCost, fx, get, stagingThreat, stats } from "../src/game/core";
import { check, damage, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { syncAttachmentText } from "../src/game/attachment-text";
import { playerCardImmune } from "../src/game/card-immunity";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { attachmentHasTrait } from "../src/game/expansion-passives";
import { reduceThreat } from "../src/game/threat-reduction";
import {
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  LAND_SHADOW_FRODO,
  LAND_SHADOW_ONE_RING,
  oneRing,
  ringBearer,
} from "../src/game/lotr-saga";
import {
  POM,
  PASSAGE_MARSHES_RECIPES,
  mireValue,
  passageMarshesPublicState,
  passageMarshesStageInfo,
  pomGollum,
  pomSmeagol,
  PASSAGE_MARSHES_HOOKS,
} from "../src/game/passage-marshes";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./passage-marshes-fixtures";
import type { GameState } from "../src/game/types";

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
/**
 * The refresh phase: characters and attachments ready, each player raises
 * his threat by 1, then the round ends; stops at the first decision.
 */
const refresh = (s: GameState) => {
  s.queue.push(fx("refreshReady"));
  flush(s);
  s = settle(s);
  assert.equal(s.phase, "refresh");
  return act(s, { type: "NEXT" });
};
const endRound = (s: GameState) => settle(refresh(s));
/** Continue past the optional responses offered as a card is revealed. */
const pastReveal = (s: GameState) => {
  while (s.choice && /^Revealed · /.test(s.choice.title)) s = choose(s, "resolve");
  return s;
};
const GUARD = "01013",
  SNOWBOURN = "01016",
  GANDALF = "01073";
const deckSize = (easy: boolean) =>
  PASSAGE_MARSHES_RECIPES.find((r) => r.mode === (easy ? "easy" : "standard"))!
    .cards.filter((c) => c.section === "sharedEncounterDeck")
    .reduce((n, c) => n + c.quantity, 0);

test("Setup: the first player controls Frodo Baggins with The One Ring, Gollum engages him and each player reveals a location, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy, 901 + players);
      const first = firstPlayer(s);
      const frodo = ringBearer(s)!;
      assert.equal(frodo.code, LAND_SHADOW_FRODO);
      assert.equal(oneRing(s)!.code, LAND_SHADOW_ONE_RING);
      assert.ok(seatView(s, first).heroes.some((h) => h.id === frodo.id));
      const gollum = pomGollum(s)!;
      assert.ok(seatView(s, first).engaged.some((u) => u.id === gollum.id));
      assert.equal(gollum.exhausted, false);
      // Each player revealed a location (Shifting Quagmire surges).
      const locations = s.staging.filter(
        (u) => card(u.code).type_code === "location",
      );
      assert.ok(locations.length >= players, `${players}/${easy}`);
      assert.equal(
        s.encounterDeck.length +
          s.encounterDiscard.length +
          s.staging.length +
          globalEngaged(s).length -
          1,
        deckSize(easy),
        "every encounter card is in a zone",
      );
      assert.equal(s.stage, 1);
      assert.equal(s.round, 1);
      assert.equal(passageMarshesStageInfo(s)!.quest, 6);
      assert.equal(passageMarshesStageInfo(s)!.name, "The Taming of Sméagol");
    }
  assert.equal(deckSize(false), 36);
  assert.equal(deckSize(true), 25);
});

test("Frodo Baggins: spend 1 resource and exhaust The One Ring for +2 willpower and +2 attack until the end of the round; Morgul Wraith answers The One Ring", () => {
  let s = base(1, 1);
  const frodo = ringBearer(s)!;
  const wraith = stage(s, POM.wraith);
  assert.equal(engagementCost(s, wraith), 45);
  syncAttachmentText(s);
  assert.equal(playerCardImmune(wraith), false, "the quoted immunity is conditional");
  s = act(s, { type: "ABILITY", id: frodo.id });
  const used = get(s, frodo.id)!;
  assert.equal(used.resources, 1);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.equal(stats(s, used).will, 4);
  assert.equal(stats(s, used).attack, 3);
  assert.throws(() => act(s, { type: "ABILITY", id: frodo.id }), /exhausted/);
  // While The One Ring is exhausted: -30 engagement and immunity.
  const w = s.staging.find((u) => u.id === wraith.id)!;
  assert.equal(engagementCost(s, w), 15);
  syncAttachmentText(s);
  assert.equal(playerCardImmune(w), true);
  // The bonus lasts until the end of the round; the refresh readies the Ring.
  s = endRound(s);
  const after = get(s, frodo.id)!;
  assert.equal(stats(s, after).will, 2);
  assert.equal(oneRing(s)!.exhausted, false);
  // Without a resource the action is unavailable.
  after.resources = 0;
  assert.throws(() => act(s, { type: "ABILITY", id: frodo.id }), /resource/);
});

test("Mire: at the end of the refresh phase each location in the staging area gets a mire token and is discarded at its Mire value, with its Forced effect", () => {
  let s = base(1, 1);
  const soft = stage(s, POM.softMires);
  const pools = stage(s, POM.pools);
  const fens = stage(s, POM.fens);
  assert.deepEqual(
    [soft, pools, fens].map((u) => mireValue(u.code)),
    [1, 5, 3],
  );
  const threat = stagingThreat(s);
  s.encounterDeck = [POM.groping, POM.softMires];
  s = endRound(s);
  // Soft Mires (Mire 1) is discarded: the first player reveals the top card.
  assert.ok(!s.staging.some((u) => u.id === soft.id));
  assert.ok(s.encounterDiscard.includes(POM.softMires));
  assert.ok(
    s.staging.some((u) => u.code === POM.groping),
    "Soft Mires revealed Groping Dead",
  );
  assert.ok(s.log.some((l) => /Soft Mires has 1 mire token and is discarded by the Mire keyword/.test(l.text)));
  // The others keep their mire tokens; Stagnant Pools gets +1 threat per token.
  assert.equal(s.staging.find((u) => u.id === pools.id)!.resources, 1);
  assert.equal(s.staging.find((u) => u.id === fens.id)!.resources, 1);
  assert.equal(
    stagingThreat(s),
    threat - 2 + 1 + card(POM.groping).threat!,
    "Soft Mires left, Stagnant Pools +1, Groping Dead added",
  );
  const view = passageMarshesPublicState(s)!;
  assert.ok(view.mire.some((m) => m.code === POM.pools && m.tokens === 1));
});

test("Mire Forced effects: Haunted Mere, Stagnant Pools, Shifting Quagmire and Evil-smelling Fens; an explored location triggers nothing", () => {
  // Haunted Mere: search the deck and discard pile for an Undead enemy, reveal it, shuffle.
  let s = base(2, 1);
  const mere = stage(s, POM.mere);
  mere.resources = 1;
  s.encounterDeck = [GUARD, POM.candle, GUARD];
  s.encounterDiscard = [POM.groping];
  s = refresh(s);
  assert.match(s.choice!.title, /^Haunted Mere · Reveal an Undead enemy/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [`deck-${POM.candle}`, `discard-${POM.groping}`].sort(),
  );
  s = choose(s, `deck-${POM.candle}`);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === POM.candle));
  assert.ok(s.log.some((l) => /Haunted Mere: the encounter deck is shuffled/.test(l.text)));
  // Stagnant Pools: each player raises his threat by 5.
  s = base(2, 1);
  const pools = stage(s, POM.pools);
  pools.resources = 4;
  s = endRound(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).threat, 20 + 1 + 5, `player ${p}`);
  // Shifting Quagmire: return a random location or raise threat per location.
  s = base(2, 1);
  stage(s, POM.quagmire);
  s.victoryCards = [POM.fens, POM.softMires];
  s.victory = 5;
  s = refresh(s);
  assert.match(s.choice!.title, /^Shifting Quagmire · Choose one/);
  s = choose(s, "return");
  s = settle(s);
  assert.equal(s.victoryCards!.length, 1);
  assert.equal(
    s.staging.filter((u) => [POM.fens, POM.softMires].includes(u.code as never))
      .length,
    1,
  );
  assert.equal(s.victory, 5 - card(s.staging.at(-1)!.code).victory!);
  s = base(2, 1);
  stage(s, POM.quagmire);
  s.victoryCards = [POM.fens, POM.softMires];
  s = refresh(s);
  s = choose(s, "threat");
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).threat, 20 + 1 + 2);
  // Evil-smelling Fens: 1 damage to each character, Sméagol included.
  s = base(2, 2);
  const fens = stage(s, POM.fens);
  fens.resources = 2;
  s = endRound(s);
  for (const u of globalCharacters(s))
    assert.equal(u.damage, 1, `${card(u.code).name}`);
  // Explored: no Forced effect.
  s = base(1, 1);
  const soft = activate(s, POM.softMires);
  s.encounterDeck = [POM.groping];
  s.phase = "travel";
  progressLocation(s, soft, card(soft.code).quest!);
  flush(s);
  s = settle(s);
  assert.ok(s.victoryCards!.includes(POM.softMires), "explored");
  assert.ok(!s.staging.some((u) => u.code === POM.groping));
});

test("Creeping Marshes: surge and doomed 1, attached to the current quest as a Condition; at the end of the refresh phase it places a mire token on each location in the staging area and is discarded", () => {
  let s = base(1, 1);
  const pools = stage(s, POM.pools);
  const fens = stage(s, POM.fens);
  s.encounterDeck = [POM.creeping, POM.mere, POM.mere];
  s.phase = "staging";
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  s = settle(s);
  assert.equal(s.threat, 21, "Doomed 1");
  assert.ok(
    s.staging.some((u) => u.code === POM.mere),
    "Surge revealed Haunted Mere",
  );
  const attached = s.questAttachments![POM.taming];
  assert.equal(attached.length, 1);
  assert.equal(attached[0].code, POM.creeping);
  assert.ok(attachmentHasTrait(attached[0], "Condition"));
  assert.ok(!s.encounterDiscard.includes(POM.creeping));
  s.phase = "planning";
  s = endRound(s);
  // Mire keyword + Creeping Marshes: 2 tokens on each location.
  assert.equal(s.staging.find((u) => u.id === pools.id)!.resources, 2);
  assert.equal(s.staging.find((u) => u.id === fens.id)!.resources, 2);
  assert.equal(s.questAttachments?.[POM.taming]?.length ?? 0, 0);
  assert.ok(s.encounterDiscard.includes(POM.creeping));
  // Haunted Mere (Mire 2) is discarded by the Mire keyword.
  assert.ok(!s.staging.some((u) => u.code === POM.mere));
});

test("Travel costs: exhaust Sméagol for Haunted Mere and Stagnant Pools, spend a Fellowship resource for Shifting Quagmire, raise each player's threat for Soft Mires and Evil-smelling Fens", () => {
  // Without Sméagol (stage 1, Gollum is in play) Haunted Mere cannot be travelled to.
  let s = base(1, 1);
  const mere = stage(s, POM.mere);
  s.phase = "travel";
  assert.throws(() => act(s, { type: "TRAVEL", id: mere.id }), /Sméagol/);
  s = base(2, 2);
  const pools = stage(s, POM.pools);
  s.phase = "travel";
  s = settle(act(s, { type: "TRAVEL", id: pools.id }));
  assert.equal(s.activeLocation?.id, pools.id);
  assert.equal(pomSmeagol(s)!.exhausted, true);
  // Shifting Quagmire: Frodo spends 1 resource.
  s = base(2, 2);
  const quagmire = stage(s, POM.quagmire);
  ringBearer(s)!.resources = 0;
  s.phase = "travel";
  assert.throws(() => act(s, { type: "TRAVEL", id: quagmire.id }), /Fellowship/);
  ringBearer(s)!.resources = 1;
  s = settle(act(s, { type: "TRAVEL", id: quagmire.id }));
  assert.equal(s.activeLocation?.id, quagmire.id);
  assert.equal(ringBearer(s)!.resources, 0);
  // Soft Mires and Evil-smelling Fens: each player raises his threat by 1.
  for (const code of [POM.softMires, POM.fens]) {
    s = base(2, 1);
    const location = stage(s, code);
    s.phase = "travel";
    s = settle(act(s, { type: "TRAVEL", id: location.id }));
    assert.equal(s.activeLocation?.id, location.id);
    for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 21);
  }
});

test("The Taming of Sméagol: attacking Gollum discards the top encounter card for +X defense; defeated, Gollum flips to an exhausted Sméagol, and only then can the players advance", () => {
  let s = base(1, 1);
  const gollum = pomGollum(s)!;
  // Gandalf has 4 attack.
  const [a] = allies(s, [GANDALF]);
  // Stagnant Pools has 3 threat: Gollum gets +3 defense for this attack.
  s.encounterDeck = [POM.pools, POM.softMires];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: gollum.id, attackerIds: [a.id] });
  s = settle(s);
  assert.equal(s.encounterDiscard.at(-1), POM.pools);
  assert.ok(s.log.some((l) => /Gollum gets \+3 defense for this attack/.test(l.text)));
  assert.equal(get(s, gollum.id)!.damage, 0, "4 attack against 5 defense");
  assert.equal(s.passageMarshes!.gollumDefense, undefined, "for this attack");
  assert.equal(stats(s, get(s, gollum.id)!).defense, 2);
  // Progress alone does not advance the stage while Gollum is in play.
  s.progress = 6;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 1);
  // Defeat Gollum: he flips to Sméagol, exhausted, with no damage.
  // (A new round: each enemy can be attacked once per round.)
  Object.assign(get(s, gollum.id)!, { damage: 3, attackedBy: [], attacked: false });
  get(s, a.id)!.exhausted = false;
  s.encounterDeck = [POM.call];
  s = act(s, { type: "ATTACK", enemyId: gollum.id, attackerIds: [a.id] });
  s = settle(s);
  const smeagol = pomSmeagol(s)!;
  assert.ok(smeagol, "Sméagol is in play");
  assert.equal(smeagol.id, gollum.id, "the same physical card");
  assert.equal(smeagol.exhausted, true);
  assert.equal(smeagol.damage, 0);
  assert.ok(s.allies.some((u) => u.id === smeagol.id));
  assert.ok(!globalEngaged(s).some((u) => u.code === POM.gollum));
  assert.equal(stats(s, smeagol).will, 2);
  assert.equal(stats(s, smeagol).health, 5);
  assert.ok(playerCardImmune(smeagol), "Sméagol is immune to player card effects");
  // With Sméagol and 6 progress, the players advance to stage 2.
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(passageMarshesStageInfo(s)!.name, "Across the Marshes");
  assert.equal(passageMarshesStageInfo(s)!.quest, 12);
});

test("Sméagol: an unsuccessful quest flips him to a ready Gollum engaged with the first player; if Sméagol is destroyed the players lose", () => {
  let s = base(1, 2);
  const smeagol = pomSmeagol(s)!;
  smeagol.damage = 3;
  s.phase = "staging";
  s.queue.push(fx("failedQuest", { value: 2, player: 0 }));
  flush(s);
  s = settle(s);
  assert.equal(s.threat, 22);
  const gollum = pomGollum(s)!;
  assert.equal(gollum.id, smeagol.id);
  assert.equal(gollum.damage, 0);
  assert.equal(gollum.exhausted, false);
  assert.ok(s.engaged.some((u) => u.id === gollum.id));
  assert.equal(pomSmeagol(s), undefined);
  // Destroyed Sméagol loses the game.
  s = base(1, 2);
  const target = pomSmeagol(s)!;
  damage(s, target.id, 5, {});
  flush(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Sméagol is destroyed/);
});

test("We Hates Them!: surge; the first player may spend a Fellowship resource and exhaust The One Ring to cancel; otherwise Sméagol flips to Gollum, or Gollum attacks", () => {
  // Cancelled: Frodo pays 1 and exhausts The One Ring; surge still reveals.
  let s = base(2, 2);
  s.encounterDeck = [POM.hates, ...Array(5).fill(POM.softMires)];
  s.phase = "staging";
  forOwner(s, 1, () => s.queue.push({ kind: "reveal", player: 1 }));
  flush(s);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^We Hates Them! · Cancel this effect\?/);
  s = choose(s, "cancel");
  s = settle(s);
  assert.ok(pomSmeagol(s), "Sméagol stays");
  assert.equal(oneRing(s)!.exhausted, true);
  assert.equal(ringBearer(s)!.resources, 1);
  assert.ok(s.staging.some((u) => u.code === POM.softMires), "surge");
  assert.ok(s.encounterDiscard.includes(POM.hates));
  // Not cancelled: Sméagol flips to Gollum.
  s = base(1, 2);
  s.phase = "staging";
  reveal(s, POM.hates);
  s = pastReveal(s);
  s = choose(s, "resolve");
  s = settle(s);
  assert.ok(pomGollum(s), "Gollum is back");
  assert.ok(s.engaged.some((u) => u.code === POM.gollum));
  // With Gollum in play and The One Ring exhausted, Gollum attacks at once.
  s = base(1, 1);
  oneRing(s)!.exhausted = true;
  const gollum = pomGollum(s)!;
  s.phase = "staging";
  reveal(s, POM.hates);
  s = settle(s);
  assert.ok(s.log.some((l) => /We Hates Them!: Gollum makes an immediate attack/.test(l.text)));
  assert.equal(get(s, gollum.id)!.code, POM.gollum);
  // Shadow: +1 attack, +3 against Gollum.
  s = base(1, 1);
  s.combat = {
    enemyId: pomGollum(s)!.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  run(s, "shadowEffect", 0, { code: POM.hates });
  assert.equal(s.combat!.attackBonus, 3);
});

test("Call of the Ring: the first player either adds a Nazgûl enemy from the deck, discard pile or victory display, or exhausts The One Ring to reveal another card; its shadow attacks again", () => {
  let s = base(2, 2);
  s.encounterDeck = [POM.call, POM.softMires, POM.wraith, POM.softMires];
  s.victoryCards = [];
  s.phase = "staging";
  forOwner(s, 1, () => s.queue.push({ kind: "reveal", player: 1 }));
  flush(s);
  s = pastReveal(s);
  assert.match(s.choice!.title, /^Call of the Ring · The first player must choose/);
  s = choose(s, "search");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === POM.wraith));
  assert.ok(!s.encounterDeck.includes(POM.wraith));
  // The One Ring: exhausted, and the first player reveals the top card.
  s = base(1, 2);
  s.encounterDeck = [POM.fens, ...Array(5).fill(POM.softMires)];
  s.phase = "staging";
  reveal(s, POM.call);
  s = pastReveal(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["ring"],
    "no Nazgûl enemy to find",
  );
  s = choose(s, "ring");
  s = settle(s);
  assert.equal(oneRing(s)!.exhausted, true);
  assert.ok(s.staging.some((u) => u.code === POM.fens));
  // Shadow: an additional attack.
  s = base(1, 1);
  s.combat = {
    enemyId: pomGollum(s)!.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  run(s, "shadowEffect", 0, { code: POM.call });
  assert.equal(s.combat!.extraAttacks, 1);
});

test("A Fell Light and Bitter Reek: Peril treacheries of the Dead Marshes", () => {
  // A Fell Light: the topmost Undead enemy in the discard pile engages you,
  // and each Undead enemy engaged with you attacks.
  let s = base(1, 2);
  s.encounterDiscard = [POM.candle, POM.groping, POM.softMires];
  const old = engaged(s, POM.deadThings);
  s.phase = "staging";
  reveal(s, POM.fellLight);
  const added = s.engaged.find((u) => u.code === POM.groping);
  assert.ok(added, "Groping Dead is the topmost Undead enemy");
  assert.deepEqual(s.encounterDiscard.slice(0, 2), [POM.candle, POM.softMires]);
  assert.equal(
    s.log.filter((l) => /A Fell Light: each Undead enemy engaged with you makes an immediate attack/.test(l.text)).length,
    1,
  );
  s = settle(s);
  assert.ok(get(s, old.id));
  // Its shadow returns the topmost Undead enemy to the staging area.
  s = base(1, 1);
  s.encounterDiscard = [POM.groping, POM.candle];
  s.combat = {
    enemyId: pomGollum(s)!.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  run(s, "shadowEffect", 0, { code: POM.fellLight });
  assert.ok(s.staging.some((u) => u.code === POM.candle));
  assert.deepEqual(s.encounterDiscard, [POM.groping]);
  // Bitter Reek: threat per committed character you control, or 1 damage to each committed character.
  s = base(1, 2);
  const [h1, h2] = s.heroes;
  for (const h of [h1, h2]) h.committed = true;
  s.committedIds = [h1.id, h2.id];
  s.phase = "staging";
  reveal(s, POM.reek);
  assert.match(s.choice!.title, /^Bitter Reek · Choose one/);
  s = choose(s, "threat");
  s = settle(s);
  assert.equal(s.threat, 22);
  s = base(1, 2);
  for (const h of s.heroes.slice(0, 2)) h.committed = true;
  s.phase = "staging";
  reveal(s, POM.reek);
  s = choose(s, "damage");
  s = settle(s);
  assert.deepEqual(
    s.heroes.slice(0, 2).map((h) => h.damage),
    [1, 1],
  );
  // Shadow: raise your threat by the attacking enemy's threat.
  s = base(1, 1);
  const dead = engaged(s, POM.deadThings);
  s.combat = {
    enemyId: dead.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  run(s, "shadowEffect", 0, { code: POM.reek });
  assert.equal(s.threat, 20 + card(POM.deadThings).threat!);
});

test("Undead enemies: the engaged player cannot reduce his threat; Groping Dead, Dead Things and Candle-bearer punish destroyed characters", () => {
  let s = base(2, 1);
  engaged(s, POM.candle, 0);
  assert.equal(reduceThreat(s, 3), 0);
  assert.equal(s.threat, 20);
  assert.ok(s.log.some((l) => /This threat cannot be reduced/.test(l.text)));
  forOwner(s, 1, () => {
    assert.equal(reduceThreat(s, 3), 3, "the other player is not engaged");
  });
  // Groping Dead destroys a character: 1 mire token on the active location.
  for (const [code, check] of [
    [
      POM.groping,
      (x: GameState) => {
        assert.equal(x.activeLocation?.resources, 1);
        return true;
      },
    ],
    [
      POM.deadThings,
      (x: GameState) => {
        assert.equal(x.threat, 23);
        return true;
      },
    ],
    [
      POM.candle,
      (x: GameState) => {
        assert.equal(
          [...x.engaged].find((u) => u.code === POM.candle)!.roundCannotTakeDamage,
          true,
        );
        return true;
      },
    ],
  ] as const) {
    s = base(1, 1);
    activate(s, POM.pools);
    const enemy = engaged(s, code);
    const [victim] = allies(s, [SNOWBOURN]);
    s.combat = {
      enemyId: enemy.id,
      attackPlayer: 0,
      defenderId: victim.id,
      defenderIds: [victim.id],
      attackBonus: 0,
    };
    damage(s, victim.id, 9, { combatDamage: true, enemyId: enemy.id });
    flush(s);
    s.combat = null;
    s = settle(s);
    assert.ok(check(s), card(code).name);
  }
  // Shadows: Groping Dead (once per attack), Dead Things (threat per Undead), Candle-bearer (no damage).
  s = base(1, 1);
  const candle = engaged(s, POM.candle);
  engaged(s, POM.groping);
  s.combat = {
    enemyId: candle.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  run(s, "shadowEffect", 0, { code: POM.deadThings });
  assert.equal(s.threat, 22, "2 Undead enemies engaged");
  run(s, "shadowEffect", 0, { code: POM.candle });
  assert.equal(get(s, candle.id)!.roundCannotTakeDamage, true);
  run(s, "shadowEffect", 0, { code: POM.groping });
  assert.equal(s.combat!.pomMireOnKill, true);
  run(s, "shadowEffect", 0, { code: POM.fens });
  assert.ok(s.log.some((l) => /Evil-smelling Fens: there is no defending character/.test(l.text)));
});

test("Across the Marshes: 2A finds a location when the staging area has fewer than there are players; 2B blocks progress on staged locations, reveals at the end of staging and needs 4 locations in the victory display", () => {
  let s = base(2, 1);
  const gollum = pomGollum(s)!;
  // Gollum is defeated, so the players advance from stage 1 with 6 progress.
  forOwner(s, 0, () => {
    s.engaged = s.engaged.filter((u) => u.id !== gollum.id);
    s.allies.push({ ...gollum, code: POM.smeagol, exhausted: false });
  });
  s.encounterDeck = [GUARD, POM.call, POM.fens, POM.softMires];
  s.progress = 6;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.stageRevealing, false);
  // 2A: Guard of the Citadel is not an encounter card; Call of the Ring is
  // discarded, Evil-smelling Fens is added (no location was staged).
  assert.ok(s.staging.some((u) => u.code === POM.fens));
  assert.ok(s.encounterDiscard.includes(POM.call));
  assert.equal(s.passageMarshes!.currentQuest, POM.across);
  // 2B: no progress on a location in the staging area.
  const staged = s.staging.find((u) => u.code === POM.fens)!;
  progressLocation(s, staged, 2);
  flush(s);
  assert.equal(s.staging.find((u) => u.id === staged.id)!.progress, 0);
  // At the end of the staging step: 1 location for 2 players reveals a card.
  s.encounterDeck = [POM.pools, ...Array(4).fill(POM.softMires)];
  s.phase = "staging";
  run(s, "khazadStagingEnd");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === POM.pools));
  assert.ok(s.log.some((l) => /fewer locations than there are players/.test(l.text)));
  // Advancing needs Sméagol and 4 locations in the victory display.
  s.phase = "planning";
  s.progress = 12;
  s.victoryCards = [POM.fens, POM.fens, POM.softMires];
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  s.victoryCards.push(POM.mere);
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
});

test("\"Don't Look at the Lights!\": each player puts an Undead enemy into play engaged, the victory display's locations return to the encounter deck; no progress while an Undead enemy is engaged; Sméagol wins the game", () => {
  let s = base(2, 2);
  s.encounterDeck = [POM.groping, POM.softMires, POM.softMires];
  s.encounterDiscard = [POM.candle];
  s.victoryCards = [POM.fens, POM.mere, POM.softMires, POM.pools];
  s.victory = 3 + 4 + 2 + 3;
  s.progress = 12;
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  for (const p of playerOrder(s))
    assert.ok(
      seatView(s, p).engaged.some((u) => card(u.code).traits === "Undead."),
      `player ${p} engages an Undead enemy`,
    );
  assert.deepEqual(s.victoryCards, []);
  assert.equal(s.victory, 0);
  assert.equal(
    s.encounterDeck.filter((c) => card(c).type_code === "location").length,
    2 + 4,
  );
  // 3B: no progress while any player is engaged with an Undead enemy.
  s.phase = "staging";
  s.queue.push(fx("questSucceeded", { value: 5, player: 0 }));
  flush(s);
  s = settle(s);
  assert.equal(s.progress, 0);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((u) => card(u.code).traits !== "Undead.");
    });
  s.queue.push(fx("questSucceeded", { value: 5, player: 0 }));
  flush(s);
  s = settle(s);
  assert.equal(s.progress, 5);
  // Without Sméagol the stage cannot be defeated; with him, the players win.
  const smeagol = pomSmeagol(s)!;
  forOwner(s, 0, () => {
    s.allies = s.allies.filter((u) => u.id !== smeagol.id);
  });
  s.progress = 24;
  s.phase = "planning";
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.status, "playing");
  forOwner(s, 0, () => s.allies.push(smeagol));
  check(s);
  flush(s);
  s = settle(s);
  assert.equal(s.status, "won");
  assert.match(s.reason!, /cross the Dead Marshes/);
});

test("The first player token passes: Frodo and Sméagol follow it, and Gollum engages the new first player and attacks at once", () => {
  let s = base(2, 2);
  const smeagol = pomSmeagol(s)!;
  s = endRound(s);
  assert.equal(firstPlayer(s), 1);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === smeagol.id));
  assert.ok(seatView(s, 1).heroes.some((u) => u.code === LAND_SHADOW_FRODO));
  // Gollum follows the first player token and attacks during the refresh phase.
  s = base(2, 1);
  const gollum = pomGollum(s)!;
  s = refresh(s);
  // The attack is made against the new first player.
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === gollum.id));
  assert.ok(
    s.log.some((l) => /Gollum engages the first player during the refresh phase and makes an immediate attack/.test(l.text)),
  );
  s = settle(s);
  // Solo: the first player never changes, so Gollum does not attack.
  s = base(1, 1);
  s = endRound(s);
  assert.ok(
    !s.log.some((l) => /during the refresh phase and makes an immediate attack/.test(l.text)),
  );
});

test("Immunity: Gollum ignores non-Fellowship player cards, Sméagol every player card, and Morgul Wraith takes only Morgul attachments", () => {
  let s = base(1, 1);
  const gollum = pomGollum(s)!;
  syncAttachmentText(s);
  assert.equal(playerEffectImmune(s, gollum, "01048"), true, "a Tactics event");
  assert.equal(
    playerEffectImmune(s, gollum, LAND_SHADOW_FRODO),
    false,
    "a Fellowship card",
  );
  s = base(1, 2);
  const smeagol = pomSmeagol(s)!;
  assert.equal(playerEffectImmune(s, smeagol, LAND_SHADOW_FRODO), true);
  // Morgul Wraith: cannot have non-Morgul attachments.
  const wraith = stage(s, POM.wraith);
  const hooks = PASSAGE_MARSHES_HOOKS;
  assert.equal(hooks.cannotAttach!(s, wraith, "01056"), true);
  // Public state and save restoration.
  const view = publicState(s) as unknown as {
    passageMarshes: { side: string; currentQuest: string };
  };
  assert.equal(view.passageMarshes.side, "smeagol");
  assert.equal(view.passageMarshes.currentQuest, POM.across);
  reload(s);
});
