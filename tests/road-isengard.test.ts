import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, publicState } from "../src/game/engine";
import { card } from "../src/game/cards";
import { draw, fx, get, stagingThreat, stats } from "../src/game/core";
import { check, damage, nextRound, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { rhosgobelHeal } from "../src/game/rhosgobel";
import { forOwner, playerOrder, seatView } from "../src/game/table";
import { consideredEngaged } from "../src/game/considered-engagement";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { UH } from "../src/game/uruk-hai-support";
import {
  RI,
  RI_WIZARDRY,
  ROAD_ISENGARD_RECIPES,
  roadIsengardPublicState,
  roadIsengardSaruman,
} from "../src/game/road-isengard";
import {
  FILLER,
  activate,
  allies,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
  start,
} from "./road-isengard-fixtures";
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
const SNOWBOURN = "01016",
  GUARD = "01013",
  GLEOWINE = "01062";
const count = (list: string[], code: string) =>
  list.filter((c) => c === code).length;
const codes = (s: GameState) => s.staging.map((u) => u.code);

test("Setup adds the four Ents of Fangorn to the staging area and sets Gates of Isengard, Orthanc, Saruman and Saruman's Staff aside, in one to four players and both difficulties", () => {
  for (const easy of [false, true])
    for (const players of [1, 2, 3, 4]) {
      const s = start(players, easy);
      const q = s.roadIsengard!;
      assert.equal(s.stage, 1);
      assert.equal(q.currentQuest, RI.rouse);
      assert.deepEqual(q.setAside, [
        RI.gates,
        RI.orthanc,
        RI.saruman,
        RI.staff,
      ]);
      assert.deepEqual(codes(s), Array(4).fill(RI.ent));
      assert.equal(s.activeLocation, null);
      assert.equal(s.encounterDeck.length, easy ? 22 : 32);
      assert.equal(count(s.encounterDeck, RI.grima), easy ? 0 : 1);
      assert.equal(count(s.encounterDeck, RI.vapour), easy ? 0 : 2);
      assert.equal(count(s.encounterDeck, UH.snaga), easy ? 2 : 3);
      // The first player controls the Fellowship Aragorn.
      assert.ok(seatView(s, 0).heroes.some((h) => h.code === TOS_ARAGORN));
      // Rouse the Ents: the resource phase gave no card and no resource
      // (easy mode's extra resource is part of the setup).
      for (const p of playerOrder(s)) {
        assert.equal(seatView(s, p).hand.length, 6);
        assert.ok(
          seatView(s, p).heroes.every((h) => h.resources === (easy ? 1 : 0)),
        );
      }
      assert.ok(
        s.log.some((l) => l.text === "Round 1 · No hero gains a resource."),
      );
    }
});

test("Rouse the Ents: no card draw or resource gain, no commitment and no reveal during the quest phase", () => {
  let s = base(1, 1);
  deck(s, [FILLER, FILLER]);
  draw(s, 1);
  assert.equal(s.hand.length, 0, "card effects draw nothing");
  draw(s, 1, false);
  assert.equal(s.hand.length, 0, "the resource phase draws nothing");
  assert.ok(
    s.log.some((l) => /prevents drawing cards/.test(l.text)),
    "the draw is refused",
  );
  // The resource phase: no resource.
  s.heroes[0].resources = 0;
  s.phase = "refresh";
  nextRound(s);
  s = settle(s);
  assert.equal(s.heroes[0].resources, 0);
  // The quest phase: nobody commits and no card is revealed.
  s = base(1, 1);
  s.phase = "planning";
  s = act(s, { type: "NEXT" });
  assert.equal(s.phase, "quest");
  assert.throws(() => act(s, { type: "TOGGLE_QUEST", id: s.heroes[0].id }));
  const deckBefore = s.encounterDeck.length;
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.equal(s.encounterDeck.length, deckBefore);
  assert.deepEqual(codes(s), Array(4).fill(RI.ent));
  assert.equal(s.threat, 20, "0 willpower against 0 threat");
});

test("Ent of Fangorn's Quest Action: a hero's willpower above the discarded card's threat places a resource; at 3 the player takes control", () => {
  let s = base(1, 1);
  s.phase = "quest";
  const [ent] = s.staging;
  const hero = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  // Ring-wall of Isengard has 2 threat.
  s.encounterDeck = [RI.ringWall, RI.blast, RI.machines, RI.vapour];
  hero.roundWill = 3 - stats(s, hero).will;
  s = act(s, { type: "ABILITY", id: ent.id });
  s = choose(s, hero.id);
  assert.equal(get(s, hero.id)!.exhausted, true);
  assert.equal(s.encounterDiscard.at(-1), RI.ringWall);
  assert.equal(s.staging.find((u) => u.id === ent.id)!.resources, 1);
  // A treachery has no threat: any willpower above 0 rouses the Ent.
  for (const h of s.heroes.filter((x) => x.id !== hero.id).slice(0, 2)) {
    s = act(s, { type: "ABILITY", id: ent.id });
    s = choose(s, h.id);
  }
  assert.equal(
    s.staging.some((u) => u.id === ent.id),
    false,
    "the Ent left the staging area",
  );
  const controlled = s.allies.find((u) => u.id === ent.id)!;
  assert.ok(controlled, "the player controls Ent of Fangorn");
  assert.equal(controlled.resources, 0);
  assert.equal(stats(s, controlled).will, 2);
  assert.equal(stats(s, controlled).attack, 4);
  // No ready hero left: the action is unavailable.
  assert.throws(() => act(s, { type: "ABILITY", id: s.staging[0].id }));
  // Willpower equal to the discarded card's threat places nothing; Plain of
  // Isengard's X is the number of players.
  s = base(2, 1);
  s.phase = "quest";
  s.encounterDeck = [RI.plain];
  const [ent2] = s.staging;
  const h2 = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  h2.roundWill = 2 - stats(s, h2).will;
  s = act(s, { type: "ABILITY", id: ent2.id });
  s = choose(s, h2.id);
  assert.equal(s.staging.find((u) => u.id === ent2.id)!.resources, 0);
  assert.ok(s.log.some((l) => /\(2 threat\); no resource/.test(l.text)));
  // Outside the quest phase the action is unavailable.
  s = base(1, 1);
  assert.throws(() => act(s, { type: "ABILITY", id: s.staging[0].id }));
});

test("Rouse the Ents: a resource at the end of each round; advancing reveals one card per resource, removes the staged Ents and starts Breaking Isengard", () => {
  let s = base(1, 1);
  s.encounterDiscard = [RI.ringWall];
  run(s, "riRouseRound");
  assert.equal(s.roadIsengard!.rouse, 1);
  assert.match(s.choice!.title, /^Rouse the Ents · The players may advance/);
  s = choose(s, "stay");
  assert.equal(s.stage, 1);
  run(s, "riRouseRound");
  assert.equal(s.roadIsengard!.rouse, 2);
  // One Ent is under the player's control and stays.
  const ent = s.staging[0];
  s.staging = s.staging.filter((u) => u.id !== ent.id);
  s.allies.push(ent);
  s.encounterDeck = Array(10).fill(RI.ringWall);
  s = choose(s, "advance");
  s = settle(s);
  const q = s.roadIsengard!;
  assert.equal(s.stage, 2);
  assert.equal(q.currentQuest, RI.breaking);
  // Two Ring-walls revealed, three Ents removed from the game.
  assert.equal(count(codes(s), RI.ringWall), 2);
  assert.equal(count(codes(s), RI.ent), 0);
  assert.equal(count(s.removedEncounter!, RI.ent), 3);
  assert.ok(s.allies.some((u) => u.id === ent.id));
  // The discard pile was shuffled into the deck first.
  assert.equal(s.encounterDiscard.length, 0);
  assert.equal(s.encounterDeck.length, 9);
  // 2A: Gates of Isengard is active; Saruman and Orthanc are in the staging area.
  assert.equal(s.activeLocation!.code, RI.gates);
  assert.ok(roadIsengardSaruman(s));
  assert.ok(codes(s).includes(RI.orthanc));
  assert.deepEqual(q.setAside, [RI.staff]);
});

test("Breaking Isengard: no travel to Orthanc, 1 damage for each explored non-unique location, and the Ent's Quest Action; at 5 damage The Voice of Saruman begins", () => {
  let s = base(1, 2);
  const orthanc = s.staging.find((u) => u.code === RI.orthanc)!;
  s.phase = "travel";
  assert.throws(() => act(s, { type: "TRAVEL", id: orthanc.id }), /Orthanc/);
  // A unique location does not count; a non-unique one does.
  s = base(1, 2);
  const gates = activate(s, RI.gates);
  progressLocation(s, gates, 1);
  flush(s);
  s = settle(s);
  assert.equal(s.roadIsengard!.breaking, 0);
  assert.ok(s.victoryCards!.includes(RI.gates), "Victory 1");
  const wall = stage(s, RI.ringWall);
  progressLocation(s, wall, 2);
  flush(s);
  s = settle(s);
  assert.equal(s.roadIsengard!.breaking, 1);
  // The Ent's Quest Action places 2 progress on a non-unique location.
  s = base(1, 2);
  const [ent] = allies(s, [RI.ent]);
  const pit = stage(s, RI.pit);
  pit.progress = 1;
  s.phase = "quest";
  s = act(s, { type: "ABILITY", id: ent.id });
  assert.equal(get(s, ent.id)!.exhausted, true);
  assert.match(s.choice!.title, /^Breaking Isengard · Place 2 progress/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [pit.id],
    "only non-unique locations",
  );
  const threat = s.threat;
  s = choose(s, pit.id);
  s = settle(s);
  // Open Pit is explored: 1 damage here and its Wizardry raises threat by 2.
  assert.equal(s.roadIsengard!.breaking, 1);
  assert.equal(s.threat, threat + 2);
  assert.throws(() => act(s, { type: "ABILITY", id: ent.id }), /exhausted/);
  // At 5 damage: each player draws 6 cards, discards down to 6, and
  // Saruman's Staff is attached to Saruman.
  s = base(2, 2);
  s.roadIsengard!.breaking = 4;
  hand(s, [FILLER, FILLER, FILLER], 1);
  for (const p of [0, 1]) deck(s, Array(10).fill(FILLER), p);
  const vent = stage(s, RI.vent);
  progressLocation(s, vent, 4);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 3);
  assert.equal(s.roadIsengard!.currentQuest, RI.voice);
  assert.equal(seatView(s, 0).hand.length, 6);
  assert.equal(seatView(s, 1).hand.length, 6, "9 cards, 3 discarded");
  assert.equal(seatView(s, 1).discard.length, 3);
  assert.ok(
    roadIsengardSaruman(s)!.attachments.some((a) => a.code === RI.staff),
  );
  assert.deepEqual(s.roadIsengard!.setAside, []);
});

test("The Voice of Saruman: Saruman is engaged with the first player while Orthanc is active, he is Indestructible, and his Staff attacks each player who draws", () => {
  let s = base(2, 3);
  const saruman = roadIsengardSaruman(s)!;
  assert.equal(consideredEngaged(s, saruman, 0), false);
  activate(s, RI.orthanc);
  s.staging = s.staging.filter((u) => u.code !== RI.orthanc);
  assert.equal(consideredEngaged(s, saruman, 0), true);
  assert.equal(consideredEngaged(s, saruman, 1), false);
  // He cannot be engaged and cannot leave the staging area.
  s.phase = "encounter";
  assert.throws(() => act(s, { type: "ENGAGE", id: saruman.id }));
  // Indestructible: damage beyond his hit points stays on him.
  damage(s, saruman.id, 9);
  check(s);
  assert.equal(roadIsengardSaruman(s)!.damage, 9);
  // Saruman's Staff: a draw makes Saruman attack with 2 shadow cards, then
  // 1 damage is removed from him.
  s = base(1, 3);
  deck(s, [FILLER, FILLER]);
  s.encounterDeck = [RI.machines, RI.blast, ...s.encounterDeck];
  roadIsengardSaruman(s)!.damage = 3;
  draw(s, 1);
  flush(s);
  assert.match(s.choice!.title, /^Saruman · Immediate attack/);
  assert.equal(s.combat?.enemyId, roadIsengardSaruman(s)!.id);
  assert.equal(roadIsengardSaruman(s)!.shadows.length, 2);
  s = choose(s, "undefended");
  s = settle(s);
  assert.equal(roadIsengardSaruman(s)!.damage, 2);
  // Machines of Isengard (+1) and Blast of Sorcery (+1, the player keeps 3
  // cards): 8 undefended damage on a hero.
  assert.ok(s.log.some((l) => /Saruman's Staff: you drew cards/.test(l.text)));
  // The resource phase: Saruman attacks each player once.
  s = base(2, 3);
  for (const p of [0, 1]) deck(s, Array(5).fill(FILLER), p);
  s.phase = "refresh";
  nextRound(s);
  flush(s);
  s = settle(s, "undefended");
  const attacks = s.log.filter((l) =>
    /^Saruman's Staff: .* drew cards, so Saruman attacks them/.test(l.text),
  );
  assert.equal(attacks.length, 2, "one attack for each player's draw");
  // Ring-wall of Isengard dealt to Saruman: its Wizardry effect is resolved
  // by the defending player as if he was the only player.
  assert.ok(
    s.log.some((l) =>
      /^Saruman is dealt Ring-wall of Isengard: .* as if they were the only player/.test(
        l.text,
      ),
    ),
  );
});

test("Orthanc: explored at 3B it cancels the phase's quest progress and returns to the staging area; in the staging area it reveals 1 of the top 3 cards after a successful quest", () => {
  let s = base(1, 3);
  const orthanc = s.staging.find((u) => u.code === RI.orthanc)!;
  s.staging = s.staging.filter((u) => u.id !== orthanc.id);
  s.activeLocation = orthanc;
  s.progress = 4;
  s.phase = "quest";
  // 2 progress placed on the quest earlier this phase, then a successful
  // quest of 6: 1 explores Orthanc and the other 5 are canceled with the 2.
  addCurrentQuestProgress(s, 2);
  assert.equal(s.progress, 6);
  s.queue.push(fx("successfulQuestProgress", { value: 6, player: 0 }));
  flush(s);
  s = settle(s);
  assert.equal(s.progress, 4, "the progress of this phase is canceled");
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === orthanc.id && u.progress === 0));
  assert.ok(
    s.log.some((l) =>
      /Orthanc is explored, so 2 progress placed on the quest this phase are canceled/.test(
        l.text,
      ),
    ),
  );
  assert.ok(
    s.log.some((l) =>
      /Orthanc was explored this phase: 5 progress placed on the quest are canceled/.test(
        l.text,
      ),
    ),
  );
  // Progress from earlier phases stays; a later phase places progress again.
  assert.equal(consideredEngaged(s, roadIsengardSaruman(s)!, 0), false);
  // Later in the same phase, progress on the quest is canceled too.
  s.queue.push(fx("successfulQuestProgress", { value: 2, player: 0 }));
  flush(s);
  assert.equal(s.progress, 4);
  // Orthanc in the staging area: look at the top 3, reveal 1, discard the others.
  s = base(1, 3);
  s.phase = "quest";
  s.encounterDeck = [RI.lieutenant, RI.ringWall, RI.blast, RI.pit];
  s.lastQuest = { will: 5, threat: 0, net: 5 };
  s.queue.push(fx("questSucceeded", { value: 5, player: 0 }));
  flush(s);
  s = settle(s, "look-1");
  assert.ok(codes(s).includes(RI.ringWall));
  assert.deepEqual(s.encounterDiscard.sort(), [RI.blast, RI.lieutenant].sort());
  assert.deepEqual(s.encounterDeck, [RI.pit]);
});

test("The Voice of Saruman: a player without cards in hand is eliminated, and the players win once the stage is defeated and Saruman has no hit points remaining", () => {
  let s = base(1, 3);
  s.hand = [];
  check(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason, /no cards in hand/);
  s = base(2, 3);
  forOwner(s, 1, () => {
    s.hand = [];
  });
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.seats[1].eliminated, true);
  // 15 progress with Saruman standing: no victory yet.
  s = base(1, 3);
  s.progress = 15;
  check(s);
  assert.equal(s.status, "playing");
  // Saruman's damage reaches his hit points: the players win.
  roadIsengardSaruman(s)!.damage = 6;
  check(s);
  assert.equal(s.status, "won");
  assert.match(s.reason, /Saruman has no hit points remaining/);
});

test("Wizardry: each location's effect when it leaves play as an explored location, active or not, and Machines of Isengard", () => {
  // Steaming Vent: X = players + 1 damage among characters in play.
  let s = base(2, 2);
  progressLocation(s, stage(s, RI.vent), 4);
  flush(s);
  assert.match(s.choice!.title, /^Steaming Vent · Assign damage · 3 remaining/);
  const victim = seatView(s, 1).heroes[0];
  for (let i = 0; i < 3; i++) s = choose(s, victim.id);
  assert.equal(
    seatView(s, 1).heroes.find((h) => h.id === victim.id)!.damage,
    3,
  );
  // Open Pit: each player raises his threat by 2.
  s = base(2, 2);
  progressLocation(s, stage(s, RI.pit), 3);
  flush(s);
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  // Plain of Isengard: each player discards 1 ally he controls.
  s = base(2, 2);
  const [a0] = allies(s, [SNOWBOURN], 0);
  const [a1] = allies(s, [GLEOWINE], 1);
  progressLocation(s, stage(s, RI.plain), 3);
  flush(s);
  s = settle(s);
  assert.equal(get(s, a0.id), undefined);
  assert.ok(!seatView(s, 1).allies.some((u) => u.id === a1.id));
  // Underground Armoury: each player exhausts a character he controls.
  s = base(2, 2);
  progressLocation(s, stage(s, RI.armoury), 3);
  flush(s);
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).heroes.filter((h) => h.exhausted).length, 1);
  // Ring-wall of Isengard: each player discards 1 random card.
  s = base(2, 3);
  progressLocation(s, stage(s, RI.ringWall), 2);
  flush(s);
  s = settle(s);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).hand.length, 2);
  // Machines of Isengard triggers the active location's Wizardry effect.
  s = base(2, 2);
  activate(s, RI.pit);
  s.phase = "quest";
  reveal(s, RI.machines);
  s = settle(s);
  assert.deepEqual(
    playerOrder(s).map((p) => seatView(s, p).threat),
    [22, 22],
  );
  assert.ok(s.encounterDiscard.includes(RI.machines));
  // Without a Wizardry effect on the active location, it gains surge.
  s = base(1, 2);
  activate(s, RI.gates);
  s.phase = "quest";
  s.encounterDeck = [RI.ringWall, ...s.encounterDeck];
  reveal(s, RI.machines);
  s = settle(s);
  assert.ok(codes(s).includes(RI.ringWall), "surge");
  assert.equal(RI_WIZARDRY.length, 5);
});

test("Staging-area effects: Steaming Vent, Open Pit, Underground Armoury, Ring-wall of Isengard and Plain of Isengard", () => {
  // Steaming Vent: after a player commits characters, 1 damage to one of them.
  let s = base(1, 2);
  stage(s, RI.vent);
  s = act(s, { type: "NEXT" });
  const quester = s.heroes.find((h) => h.code !== TOS_ARAGORN)!;
  s = act(s, { type: "TOGGLE_QUEST", id: quester.id });
  s = act(s, { type: "COMMIT" });
  // Théodred's own response comes first.
  if (/response/.test(s.choice?.title ?? ""))
    s = choose(
      s,
      s.choice!.options.find((o) => o.id === "skip")?.id ??
        s.choice!.options[0].id,
    );
  assert.match(
    s.choice!.title,
    /^Steaming Vent · Deal 1 damage to a questing character/,
  );
  s = choose(s, quester.id);
  assert.equal(get(s, quester.id)!.damage, 1);
  // Open Pit: a player card draw raises threat by 2; the resource draw does not.
  s = base(1, 2);
  stage(s, RI.pit);
  deck(s, Array(5).fill(FILLER));
  draw(s, 1, false);
  flush(s);
  assert.equal(s.threat, 20);
  draw(s, 1);
  flush(s);
  assert.equal(s.threat, 22);
  // Underground Armoury: after an enemy engages a player, deal it a shadow card.
  s = base(1, 2);
  stage(s, RI.armoury);
  const lieutenant = stage(s, RI.lieutenant);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: lieutenant.id });
  assert.equal(get(s, lieutenant.id)!.shadows.length, 1);
  // Ring-wall of Isengard: healing damage discards a card of the owner's choice.
  s = base(1, 3);
  stage(s, RI.ringWall);
  const hurt = s.heroes[0];
  hurt.damage = 2;
  rhosgobelHeal(s, hurt, 1);
  flush(s);
  assert.match(s.choice!.title, /^Ring-wall of Isengard · Discard 1 card/);
  s = choose(s, s.hand[0].id);
  assert.equal(s.hand.length, 2);
  // Plain of Isengard: X threat; archery damage goes to allies, if able.
  s = base(2, 2);
  const plain = stage(s, RI.plain);
  assert.equal(stats(s, plain).threat ?? 0, 0);
  assert.equal(stagingThreat(s), 4 + 2 + 2, "Saruman, Orthanc and X = 2");
  const [ally] = allies(s, [GUARD], 0);
  stage(s, RI.orc);
  s.phase = "encounter";
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /^Assign Archery damage/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [ally.id],
  );
});

test("Enemies: Isengard Orc, Gríma, Lieutenant of Orthanc, Wolf of Isengard and the Snaga Orcs", () => {
  // Isengard Orc: discard a random card or reveal a card; shadow +2 defense.
  let s = base(1, 3);
  s.phase = "quest";
  reveal(s, RI.orc);
  assert.match(s.choice!.title, /^Isengard Orc · Choose one/);
  s = choose(s, "discard");
  assert.equal(s.hand.length, 2);
  let orc = engaged(s, RI.lieutenant);
  let [guard] = allies(s, [GUARD]);
  orc.shadows = [RI.orc];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  s = settle(s);
  assert.equal(stats(s, get(s, orc.id)!).defense, 3 + 2);
  // Gríma's shadow: the attack is considered undefended.
  s = base(1, 2);
  orc = engaged(s, RI.wolf);
  [guard] = allies(s, [GUARD]);
  orc.shadows = [RI.grima];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  s = settle(s);
  assert.ok(s.log.some((l) => /considered undefended/.test(l.text)));
  assert.equal(get(s, guard.id)!.damage, 0, "the defender takes no damage");
  // Gríma: after it attacks, it is shuffled back and the player reveals a card.
  s = base(1, 2);
  const grima = engaged(s, RI.grima);
  [guard] = allies(s, [GUARD]);
  s.encounterDeck = Array(5).fill(RI.ringWall);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: grima.id, defenderId: guard.id });
  s = settle(s);
  assert.equal(get(s, grima.id), undefined);
  assert.equal(count(s.encounterDeck, RI.grima), 1);
  assert.equal(count(codes(s), RI.ringWall), 1, "a card is revealed");
  // Lieutenant of Orthanc: a kill discards a random card of the controller.
  s = base(1, 3);
  const lieutenant = engaged(s, RI.lieutenant);
  const [scout] = allies(s, [SNOWBOURN]);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: lieutenant.id, defenderId: scout.id });
  s = settle(s);
  assert.equal(get(s, scout.id), undefined);
  assert.equal(s.hand.length, 2);
  // Wolf of Isengard's shadow: 1 damage to the defending character (the
  // Isengard Orc's 2 attack does not pass Aragorn's 2 defense).
  s = base(1, 2);
  orc = engaged(s, RI.orc);
  orc.shadows = [RI.wolf];
  const aragorn = s.heroes.find((h) => h.code === TOS_ARAGORN)!;
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: aragorn.id });
  s = settle(s);
  assert.equal(get(s, aragorn.id)!.damage, 1);
  // A shadow card with a Wizardry effect (dealt by Underground Armoury as
  // the wolf engages): discard a card, or an additional attack.
  s = base(1, 3);
  stage(s, RI.armoury);
  const wolf = stage(s, RI.wolf);
  s.encounterDeck = [RI.pit, RI.lieutenant, ...s.encounterDeck];
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: wolf.id });
  assert.deepEqual(get(s, wolf.id)!.shadows, [RI.pit]);
  assert.deepEqual(s.roadIsengard!.wizardry, [
    { enemy: wolf.id, code: RI.pit },
  ]);
  [guard] = allies(s, [GUARD]);
  s = act(s, { type: "NEXT" });
  s = settle(s);
  assert.equal(s.phase, "defense");
  s = act(s, { type: "DEFEND", enemyId: wolf.id, defenderId: guard.id });
  assert.match(s.choice!.title, /^Wolf of Isengard · Choose one/);
  s = choose(s, "attack");
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /^Wolf of Isengard makes an additional attack after this one/.test(
        l.text,
      ),
    ),
  );
  assert.ok(
    s.log.filter((l) => /^Wolf of Isengard attacks for/.test(l.text)).length >=
      2,
    "the additional attack is made",
  );
  assert.equal(s.roadIsengard!.wizardry, undefined);
  // The Snaga Orcs: Snaga and Saruman's Orders are shared with The Uruk-hai.
  s = base(1, 3);
  s.phase = "quest";
  reveal(s, UH.snaga);
  assert.equal(s.hand.length, 2, "Snaga discards a random card");
  s = base(1, 2);
  s.phase = "quest";
  s.encounterDeck = [RI.ringWall, ...s.encounterDeck];
  reveal(s, UH.orders);
  assert.match(s.choice!.title, /^Saruman's Orders · Choose/);
  s = choose(s, "reveal");
  s = settle(s);
  assert.ok(codes(s).includes(RI.ringWall));
  assert.ok(s.encounterDiscard.includes(UH.orders));
});

test("Treacheries: Blast of Sorcery, Machines of Isengard and Poisoned Vapour, and their shadows", () => {
  // Blast of Sorcery: X = players + 1 damage among committed characters.
  let s = base(2, 2);
  const quester = seatView(s, 1).heroes[0];
  forOwner(s, 1, () => {
    s.heroes[0].committed = true;
    s.committedIds = [s.heroes[0].id];
  });
  s.phase = "quest";
  reveal(s, RI.blast);
  assert.match(
    s.choice!.title,
    /^Blast of Sorcery · Assign damage · 3 remaining/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [quester.id],
  );
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(RI.blast));
  // Its shadow: +2 attack when the defending player has 1 or fewer cards.
  s = base(1, 2);
  let orc = engaged(s, RI.lieutenant);
  let [guard] = allies(s, [GUARD]);
  orc.shadows = [RI.blast];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  s = settle(s);
  assert.ok(
    s.log.some((l) =>
      /gets \+2 attack \(the defending player has 1 or fewer/.test(l.text),
    ),
  );
  // Machines of Isengard's shadow: a kill discards 1 random card.
  s = base(1, 3);
  orc = engaged(s, RI.wolf);
  const [scout] = allies(s, [SNOWBOURN]);
  orc.shadows = [RI.machines];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: scout.id });
  s = settle(s);
  assert.equal(get(s, scout.id), undefined);
  assert.equal(s.hand.length, 2);
  // Poisoned Vapour: exhaust each damaged character; blank until the end of
  // the combat phase.
  s = base(1, 2);
  const hurt = s.heroes[0];
  hurt.damage = 1;
  s.phase = "quest";
  s.encounterDeck = [RI.ringWall, ...s.encounterDeck];
  reveal(s, RI.vapour);
  s = settle(s);
  assert.equal(get(s, hurt.id)!.exhausted, true);
  assert.equal(s.roadIsengard!.vapour?.ids.includes(hurt.id), true);
  assert.ok(codes(s).includes(RI.ringWall), "Surge");
  run(s, "endCombat");
  s = settle(s);
  assert.equal(s.roadIsengard!.vapour, undefined);
  // Its shadow: discard a non-objective attachment you control.
  s = base(1, 2);
  orc = engaged(s, RI.lieutenant);
  [guard] = allies(s, [GUARD]);
  guard.attachments.push({ id: "blade", code: "01039", exhausted: false });
  orc.shadows = [RI.vapour];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: orc.id, defenderId: guard.id });
  assert.match(
    s.choice!.title,
    /^Poisoned Vapour · Discard a non-objective attachment/,
  );
  s = choose(s, "blade");
  assert.ok(s.discard.includes("01039"));
});

test("Saruman in combat: engaged with the first player through Orthanc, he attacks and is attacked, and a Wizardry shadow is resolved by the defending player alone", () => {
  let s = base(2, 3);
  const orthanc = s.staging.find((u) => u.code === RI.orthanc)!;
  s.staging = s.staging.filter((u) => u.id !== orthanc.id);
  s.activeLocation = orthanc;
  s.encounterDeck = [RI.pit, ...s.encounterDeck];
  s.phase = "encounter";
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  // Saruman attacks the first player; Open Pit's Wizardry raises only his threat.
  for (let n = 0; n < 20 && s.phase === "defense"; n++) {
    if (s.choice) {
      s = settle(s, "undefended");
      continue;
    }
    const saruman = roadIsengardSaruman(s)!;
    s = act(s, { type: "DEFEND", enemyId: saruman.id, defenderId: null });
  }
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 20);
  // The first player attacks Saruman: Indestructible, he keeps every damage.
  assert.equal(s.phase, "attack");
  const saruman = roadIsengardSaruman(s)!;
  saruman.damage = 5;
  const attackers = seatView(s, 0).heroes.filter((h) => !h.exhausted);
  const power = attackers.reduce((n, u) => n + stats(s, u).attack, 0);
  assert.ok(power > stats(s, saruman).defense);
  s = act(s, {
    type: "ATTACK",
    enemyId: saruman.id,
    attackerIds: attackers.map((u) => u.id),
  });
  s = settle(s);
  assert.equal(
    roadIsengardSaruman(s)!.damage,
    5 + power - stats(s, saruman).defense,
  );
  assert.ok(roadIsengardSaruman(s)!.damage >= 6, "no hit points remaining");
});

test("Saves validate, and the panel data shows the stage, the tokens and Saruman", () => {
  let s = base(2, 3);
  roadIsengardSaruman(s)!.damage = 4;
  const restored = reload(s);
  const view = publicState(restored) as unknown as {
    roadIsengard: {
      saruman: { damage: number; hitPoints: number; staff: boolean };
    };
  };
  assert.deepEqual(view.roadIsengard.saruman, {
    damage: 4,
    hitPoints: 2,
    staff: true,
  });
  assert.deepEqual(roadIsengardPublicState(restored), view.roadIsengard);
  s = base(1, 1);
  s.roadIsengard!.rouse = 2;
  s.staging[0].resources = 1;
  const panel = roadIsengardPublicState(reload(s))!;
  assert.equal(panel.rouse, 2);
  assert.equal(panel.ents, 4);
  assert.equal(
    ROAD_ISENGARD_RECIPES.find((r) => r.mode === "standard")!.id,
    "Q0B.09",
  );
  assert.equal(card(RI.gates).victory, 1);
});
