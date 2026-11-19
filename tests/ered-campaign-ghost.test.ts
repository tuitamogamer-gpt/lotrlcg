import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { check, engage, revealed, shadow, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { make, stats } from "../src/game/core";
import {
  applyAction,
  availableAbilities,
  createGame,
  optionalEngagementProblem,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  ERED,
  ERED_FREE_CHANGES,
  applyEredResolution,
  eredResolutionQuestions,
  newEredCampaign,
  poolEncounterCards,
} from "../src/game/ered-campaign";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  GHOST_FRAMSBURG as G,
  ghostControlledLoot,
} from "../src/game/ghost-framsburg";
import { mainQuestUnit } from "../src/game/quest-state";
import { seatView, selectSeat } from "../src/game/table";
import type { CampaignState, GameState } from "../src/game/types";
import art from "./ered-campaign-art.json";

const d = STARTERS[0];
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState, phase: GameState["phase"] = "planning") {
  Object.assign(s, { phase, choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
function opening(
  s: GameState,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  for (let i = 0; i < 160; i++) {
    if (s.choice) s = choose(s, pick(s) ?? s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.phase === "setup") s = applyAction(reload(s), { type: "KEEP" });
    else break;
  }
  return s;
}
/** The first six chapters are recorded: The Ghost of Framsburg is next. */
function afterFire(heroes = d.heroes, seatHeroes?: number[]): CampaignState {
  const c = newEredCampaign(heroes, seatHeroes);
  c.completed = (
    [
      "journey-up-the-anduin",
      "lost-in-mirkwood",
      "the-kings-quest",
      "the-withered-heath",
      "roam-across-rhovanion",
      "fire-in-the-night",
    ] as const
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 6 }));
  c.burdens = [ERED.growing, ERED.ruin, ERED.spawn];
  return c;
}
const ghost = (campaign = afterFire(), seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-ghost-of-framsburg",
    playMode: "campaign",
    campaign,
  });
function ghostForTwo() {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  return createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-ghost-of-framsburg",
    playMode: "campaign",
    campaign: afterFire(
      seats.flatMap((p) => p.heroes),
      [3, 3],
    ),
    seats,
  });
}
/** Remove a card's copies from the encounter deck and discard pile. */
function pull(s: GameState, code: string) {
  s.encounterDeck = s.encounterDeck.filter((c) => c !== code);
  s.encounterDiscard = s.encounterDiscard.filter((c) => c !== code);
}

test("Ered Mithrin: The Ghost of Framsburg's campaign card, Ashen Brazier, Gundabad Hunter and Gundabad Stalker carry their scans' texts", () => {
  const c = card(ERED.ghostCard);
  assert.deepEqual(
    [c.type_code, c.subtitle, c.position],
    ["campaign", "Ered Mithrin Part 7", 188],
  );
  assert.match(
    c.text!,
    /^You are playing campaign mode\.\nSetup: Each player may change hero cards without incurring the \+1 threat penalty\. Shuffle Ashen Brazier, Gundabad Hunter, and Gundabad Stalker into the encounter deck\./,
  );
  assert.match(
    c.back_text!,
    /^Ignore the deep keyword\.\nResponse: After Fram's Shade engages a player while the players are at stage 1B or 2B/,
  );
  assert.match(
    c.back_text!,
    /Action: Raise each player's threat by 1 to shuffle the encounter discard pile into the encounter deck\. \(Any player may trigger this ability\.\)/,
  );
  assert.match(
    c.back_text!,
    /discard cards from the top until 2 Hazard cards are discarded\. The players, as a group, must choose 1 of those cards and add it to the campaign pool\.$/,
  );
  const b = card(ERED.brazier);
  assert.deepEqual(
    [b.type_code, b.sphere_code, b.is_unique, b.traits, b.position],
    ["objective", "boon", true, "Artifact. Item.", 189],
  );
  assert.match(b.text!, /^Loot\.\nIf unattached, the first player claims/);
  const h = card(ERED.hunter);
  assert.deepEqual(
    [h.sphere_code, h.engagement, h.threat, h.attack, h.defense, h.health],
    ["burden", 20, 2, 5, 4, 3],
  );
  assert.equal(h.traits, "Orc. Goblin. Hazard.");
  assert.match(h.shadow!, /additional attack after this one/);
  const t = card(ERED.stalker);
  assert.deepEqual(
    [t.sphere_code, t.engagement, t.threat, t.attack, t.defense, t.health],
    ["burden", 40, 4, 3, 2, 5],
  );
  assert.match(t.shadow!, /return it to the staging area after this attack/);
  assert.ok(art.length >= 44);
  assert.ok(ERED_FREE_CHANGES.includes("the-ghost-of-framsburg"));
});

test("Ered Mithrin: The Ghost of Framsburg's setup shuffles in its three cards, offers the boon ally search and applies Isolde's and Beldis's notes", () => {
  const c = afterFire();
  c.notes = ["isolde", "beldis"];
  c.boons = [ERED.turayn];
  c.deckBoons = { [ERED.turayn]: 0 };
  const titles: string[] = [];
  const created = ghost(c);
  for (const code of [ERED.brazier, ERED.hunter, ERED.stalker])
    assert.ok(
      created.encounterDeck.includes(code) ||
        created.removed.includes(code) ||
        created.encounterDiscard.includes(code),
      card(code).name,
    );
  const s = opening(created, (x) => {
    titles.push(x.choice!.title);
    return undefined;
  });
  // (Turayn may already be in the starting hand.)
  assert.ok(
    titles.some((t) =>
      /A player may search their deck for a unique boon ally/.test(t),
    ) || created.hand.some((u) => u.code === ERED.turayn),
  );
  assert.equal(titles.filter((t) => /Remove a treachery/.test(t)).length, 3);
  assert.equal(
    titles.filter((t) => /Remove a non-unique location/.test(t)).length,
    3,
  );
  assert.equal(s.removed.length, 6);
  assert.ok(valid(s));
});

test("Ered Mithrin: Ashen Brazier is a Loot objective in The Ghost of Framsburg: discarded when revealed, claimed when free, and its Action looks at a shadow card", () => {
  // Revealed: the Loot keyword discards it and reveals another card.
  const s = calm(opening(ghost()), "staging");
  pull(s, ERED.brazier);
  const deck = s.encounterDeck.length;
  const logged = s.log.length;
  revealed(s, ERED.brazier);
  flush(s);
  assert.ok(s.encounterDiscard.includes(ERED.brazier));
  assert.ok(!s.staging.some((u) => u.code === ERED.brazier));
  assert.equal(s.encounterDeck.length, deck - 1);
  assert.deepEqual(
    s.log
      .slice(logged)
      .filter((l) => l.text.startsWith("Revealed "))
      .map((l) => l.text)
      .slice(0, 1),
    ["Revealed Ashen Brazier."],
  );
  // Guarded, then free: the first player claims it for a hero, and it counts
  // as a Loot objective the players control.
  let t = calm(opening(ghost()));
  pull(t, ERED.brazier);
  const guard = make(t, G.spectre);
  t.staging.push(guard);
  t.ghostFramsburg!.loot.push({
    unit: make(t, ERED.brazier),
    guardId: guard.id,
  });
  assert.ok(valid(t));
  t.staging = t.staging.filter((u) => u.id !== guard.id);
  batch4Scenario(t).hostLeaves!(t, guard, true);
  flush(t);
  assert.match(
    t.choice!.title,
    /^Ashen Brazier · Attach to a hero you control/,
  );
  t = choose(t, t.heroes[0].id);
  assert.ok(t.heroes[0].attachments.some((a) => a.code === ERED.brazier));
  assert.equal(
    ghostControlledLoot(t).filter((x) => x.a.code === ERED.brazier).length,
    1,
  );
  assert.ok(valid(t));
  // "Action: Exhaust Ashen Brazier to look at a facedown shadow card."
  const a = t.heroes[0].attachments.find((x) => x.code === ERED.brazier)!;
  const ability = () =>
    availableAbilities(t, t.heroes[0]).find((x) => x.id === a.id)!;
  assert.ok(ability().disabled, "no facedown shadow card");
  const enemy = make(t, G.spectre);
  enemy.shadows = [G.slammed];
  enemy.revealedShadowCount = 0;
  t.engaged.push(enemy);
  assert.ok(!ability().disabled);
  t = applyAction(reload(t), {
    type: "ABILITY",
    id: t.heroes[0].id,
    attachmentId: a.id,
  } as never);
  assert.match(
    t.choice!.title,
    /^Ashen Brazier · Choose a facedown shadow card/,
  );
  t = choose(t, t.choice!.options[0].id);
  assert.match(t.choice!.title, /^Ashen Brazier · The facedown shadow card/);
  assert.equal(t.choice!.options[0].code, G.slammed);
  t = choose(t, "continue");
  assert.equal(
    t.heroes[0].attachments.find((x) => x.code === ERED.brazier)!.exhausted,
    true,
  );
  assert.ok(valid(t));
});

test("Ered Mithrin: Gundabad Hunter attacks a player engaged with a unique enemy, Gundabad Stalker waits for one, and their shadows punish unique attackers", () => {
  // Gundabad Hunter: an immediate attack (against the only player).
  let s = calm(opening(ghost()), "staging");
  pull(s, ERED.hunter);
  revealed(s, ERED.hunter);
  flush(s);
  assert.ok(
    !!s.combat ||
      s.choice?.title.includes("Gundabad Hunter") ||
      s.engaged.length > 0,
    JSON.stringify(s.choice?.title),
  );
  // Two players: the one engaged with a unique enemy is attacked.
  let t = calm(opening(ghostForTwo()), "staging");
  pull(t, ERED.hunter);
  const shade = make(t, G.shade);
  selectSeat(t, 1);
  t.engaged.push(shade);
  selectSeat(t, 0);
  revealed(t, ERED.hunter);
  flush(t);
  const attack = t.combat as never as { attackPlayer?: number } | null;
  assert.ok(
    attack?.attackPlayer === 1 ||
      seatView(t, 1).engaged.some((e) => e.code === ERED.hunter) ||
      t.queue.some((e) => e.kind === "immediateAttack" && e.player === 1),
    JSON.stringify({ combat: t.combat, choice: t.choice?.title }),
  );
  // With no one engaged with a unique enemy, the first player chooses any
  // player.
  const u = calm(opening(ghostForTwo()), "staging");
  pull(u, ERED.hunter);
  revealed(u, ERED.hunter);
  flush(u);
  assert.match(
    u.choice!.title,
    /^Gundabad Hunter · Choose a player for its immediate attack/,
  );
  assert.equal(u.choice!.options.length, 2);
  // Gundabad Stalker cannot be optionally engaged except by a player engaged
  // with a unique enemy.
  const v = calm(opening(ghost()), "encounter");
  const stalker = make(v, ERED.stalker);
  v.staging.push(stalker);
  assert.match(
    optionalEngagementProblem(v, stalker)!,
    /^Gundabad Stalker cannot be optionally engaged/,
  );
  v.engaged.push(make(v, G.shade));
  assert.ok(
    !/Gundabad Stalker/.test(optionalEngagementProblem(v, stalker) ?? ""),
  );
  // Their shadows: an additional attack and a return to the staging area,
  // only for a unique attacker.
  const w = calm(opening(ghost()), "defense");
  const unique = make(w, G.shade);
  const plain = make(w, G.spectre);
  w.engaged.push(unique, plain);
  const fight = (enemy: typeof unique, code: string) => {
    w.combat = {
      enemyId: enemy.id,
      defenderId: w.heroes[0].id,
      defenderIds: [w.heroes[0].id],
      attackBonus: 0,
      attackPlayer: 0,
    } as never;
    shadow(w, code);
    return w.combat!;
  };
  assert.equal(fight(unique, ERED.hunter).extraAttacks, 1);
  assert.equal(fight(plain, ERED.hunter).extraAttacks ?? 0, 0);
  assert.equal(fight(unique, ERED.stalker).returnToStaging, true);
  assert.ok(!fight(plain, ERED.stalker).returnToStaging);
  assert.ok(stats(w, unique).attack >= 0);
});

test("Ered Mithrin: Fram's Shade guards a treasure once it engages a player at stage 1 or 2, once per game", () => {
  let s = calm(opening(ghost()), "encounter");
  assert.ok(s.stage === 1 || s.stage === 2);
  const shade = make(s, G.shade);
  s.staging.push(shade);
  engage(s, shade);
  flush(s);
  assert.ok(s.choice, "the treasure look");
  s = choose(s, s.choice!.options[0].id);
  for (let i = 0; i < 4 && s.choice; i++)
    s = choose(s, s.choice!.options[0].id);
  assert.equal(s.eredCampaign!.guarded?.length, 1);
  assert.equal(s.eredCampaign!.guarded![0].guardId, shade.id);
  assert.equal(s.eredCampaign!.shadeTreasure, true);
  assert.ok(valid(s));
  // A second engagement offers nothing.
  const t = calm(structuredClone(s), "encounter");
  const again = t.engaged.find((e) => e.id === shade.id)!;
  t.engaged = t.engaged.filter((e) => e.id !== shade.id);
  t.staging.push(again);
  engage(t, again);
  flush(t);
  assert.equal(t.choice, null);
  // At stage 3 the Response is not offered.
  const u = calm(opening(ghost()), "encounter");
  u.stage = 3;
  const late = make(u, G.shade);
  u.staging.push(late);
  engage(u, late);
  flush(u);
  assert.equal(u.choice, null);
  assert.ok(!u.eredCampaign?.shadeTreasure);
});

test("Ered Mithrin: The Ghost of Framsburg's campaign card Action raises each threat by 1 to shuffle the encounter discard pile back, for any player", () => {
  let s = calm(opening(ghost()));
  const quest = mainQuestUnit(s)!;
  const action = () =>
    availableAbilities(s, quest).find((x) =>
      x.label.startsWith("The Ghost of Framsburg"),
    );
  s.encounterDiscard = [];
  assert.ok(action()!.disabled, "an empty discard pile");
  s.encounterDiscard = [G.slammed, G.terrible];
  assert.ok(!action()!.disabled);
  const threat = s.threat;
  const deck = s.encounterDeck.length;
  s = applyAction(reload(s), { type: "ABILITY", id: quest.id } as never);
  assert.equal(s.threat, threat + 1);
  assert.deepEqual(s.encounterDiscard, []);
  assert.equal(s.encounterDeck.length, deck + 2);
  assert.ok(valid(s));
  // Two players: the second player triggers it and both threats rise.
  let t = calm(opening(ghostForTwo()));
  t.encounterDiscard = [G.slammed];
  const before = [seatView(t, 0).threat, seatView(t, 1).threat];
  selectSeat(t, 1);
  t = applyAction(reload(t), {
    type: "ABILITY",
    id: mainQuestUnit(t)!.id,
  } as never);
  assert.deepEqual(
    [seatView(t, 0).threat, seatView(t, 1).threat],
    [before[0] + 1, before[1] + 1],
  );
  assert.deepEqual(t.encounterDiscard, []);
});

test("Ered Mithrin: The Ghost of Framsburg's resolution adds Gundabad Hunter or Stalker and one of 2 discarded Hazard cards to the Campaign Pool", () => {
  const s = calm(opening(ghost()));
  win(s);
  const questions = eredResolutionQuestions(s);
  assert.deepEqual(
    questions.map((q) => q.id),
    ["burden", "hazard"],
  );
  assert.deepEqual(
    questions[0].options.map((o) => o.id),
    [ERED.hunter, ERED.stalker],
  );
  const hazards = s.eredCampaign!.hazards!;
  assert.equal(hazards.length, 2);
  assert.ok(
    hazards.every((code) => (card(code).traits ?? "").includes("Hazard")),
  );
  const pick = questions[1].options[0].id;
  const t = applyEredResolution(s, { burden: ERED.hunter, hazard: pick });
  assert.ok(t.campaign!.burdens.includes(ERED.hunter));
  assert.ok(
    card(pick).sphere_code === "burden"
      ? t.campaign!.burdens.includes(pick)
      : t.campaign!.encounterPool![pick] === 1,
  );
  assert.equal(t.eredCampaign!.hazards, undefined);
  assert.equal(t.campaign!.resolution, null);
  assert.ok(valid(t));
  // Gundabad Hunter joins every later encounter deck.
  assert.ok(poolEncounterCards(t.campaign!).includes(ERED.hunter));
  // The campaign continues with Mount Gundabad.
  const next = continueCampaign(t, t.campaign!.heroes, t.deckId, true, 9);
  assert.equal(next.scenarioId, "mount-gundabad");
  void check;
});
