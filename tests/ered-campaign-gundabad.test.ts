import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import {
  destroy,
  discardLocation,
  exhaustCharacter,
  revealed,
  win,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { make } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  DRAGON_SICKNESS_TREASURES,
  ERED,
  ERED_TREASURES,
  applyEredResolution,
  eredCampaignStatus,
  eredResolutionQuestions,
  newEredCampaign,
  poolEncounterCards,
} from "../src/game/ered-campaign";
import { GUNDABAD } from "../src/game/mount-gundabad-support";
import { FIRE_NIGHT as F } from "../src/game/fire-night-support";
import { seatView } from "../src/game/table";
import type { CampaignState, GameState, Unit } from "../src/game/types";
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
/** The first seven chapters are recorded: Mount Gundabad is next. */
function afterGhost(
  treasures = 0,
  heroes = d.heroes,
  seatHeroes?: number[],
): CampaignState {
  const c = newEredCampaign(heroes, seatHeroes);
  c.completed = (
    [
      "journey-up-the-anduin",
      "lost-in-mirkwood",
      "the-kings-quest",
      "the-withered-heath",
      "roam-across-rhovanion",
      "fire-in-the-night",
      "the-ghost-of-framsburg",
    ] as const
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 6 }));
  c.burdens = [ERED.growing, ERED.ruin, ERED.spawn];
  if (treasures) c.treasures = ERED_TREASURES.slice(0, treasures);
  return c;
}
const gundabad = (campaign = afterGhost(), seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "mount-gundabad",
    playMode: "campaign",
    campaign,
  });
function gundabadForTwo() {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  return createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "mount-gundabad",
    playMode: "campaign",
    campaign: afterGhost(
      0,
      seats.flatMap((p) => p.heroes),
      [3, 3],
    ),
    seats,
  });
}
/** An encounter card revealed from the encounter deck (its choices answered by `pick`). */
function reveal(
  s: GameState,
  code: string,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  revealed(s, code);
  flush(s);
  for (let i = 0; i < 40 && s.choice; i++)
    s = choose(s, pick(s) ?? s.choice!.options[0].id);
  return s;
}
/** Attach a treasure to a character (as claimed or played). */
function give(s: GameState, u: Unit, code: string, owner = 0) {
  u.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false, owner });
}
const treasuresOn = (u: Unit) =>
  u.attachments
    .filter((a) => ERED_TREASURES.includes(a.code))
    .map((a) => a.code)
    .sort();

test("Ered Mithrin: Mount Gundabad's campaign card and Dragon-sickness carry their scans' texts", () => {
  const c = card(ERED.gundabadCard);
  assert.deepEqual(
    [c.type_code, c.subtitle, c.position],
    ["campaign", "Ered Mithrin Part 8", 192],
  );
  assert.match(
    c.text!,
    /^You are playing campaign mode\.\nSetup: If there are 6 or more treasures recorded in the campaign log, shuffle Dragon-sickness into the encounter deck\. A player may search their deck for a unique boon ally and add it to their hand\./,
  );
  assert.match(
    c.text!,
    /If “Melanwar has given you guidance on traversing Wilderland,” search the encounter deck for 2 non-unique locations and the Caves deck for 1 location and remove them from the game\. If “Beldis's care has bolstered the heroes' spirits,” search the encounter deck for 3 treacheries and remove them from the game\. Flip this card\.$/,
  );
  assert.match(
    c.back_text!,
    /^Ignore the discover keyword\. Unique locations cannot be discarded from play by encounter card effects\.\nResolution: The players may, as a group, look at 3 random undiscovered treasures and choose 1 to attach to an eligible character\.\nThe players discover each treasure they control\.\nRemove A Growing Threat from the campaign pool\.\nIf there are 6 or more treasures recorded in the campaign log, add Dragon-sickness to the campaign pool\.$/,
  );
  const s = card(ERED.sickness);
  assert.deepEqual(
    [s.type_code, s.sphere_code, s.position, s.encounter_set],
    ["treachery", "burden", 193, "Ered Mithrin Campaign"],
  );
  assert.equal(
    s.text,
    "Surge.\nWhen Revealed: Attach to a character with 1 or more treasures attached, then attach all unguarded treasures in play to that character. (Counts as a Condition attachment with the text: “Forced: After attached character exhausts, raise your threat by 1 for each treasure attached to it.”)",
  );
  assert.deepEqual(
    art
      .filter((a) => [ERED.gundabadCard, ERED.sickness].includes(a.code))
      .map((a) => `${a.code === ERED.sickness ? "sickness" : "card"}:${a.face}`)
      .sort(),
    ["card:back", "card:front", "sickness:front"],
  );
  assert.ok(art.length >= 47);
  assert.equal(DRAGON_SICKNESS_TREASURES, 6);
});

test("Ered Mithrin: Mount Gundabad's setup shuffles in Dragon-sickness at 6 treasures and applies Melanwar's and Beldis's notes", () => {
  const c = afterGhost(6);
  c.notes = ["melanwar", "beldis"];
  const titles: string[] = [];
  // (The removals keep the Campaign Pool's cards, to see them.)
  const kept = [ERED.sickness, ERED.growing, ERED.ruin];
  const s = opening(gundabad(c), (x) => {
    titles.push(x.choice!.title);
    return x.choice!.options.find(
      (o) => !kept.includes(o.id) && !kept.includes(o.code ?? ""),
    )?.id;
  });
  assert.equal(
    titles.filter((t) =>
      /Remove a non-unique location from the encounter deck/.test(t),
    ).length,
    2,
  );
  assert.equal(
    titles.filter((t) => /Remove a location from the Caves deck/.test(t))
      .length,
    1,
  );
  assert.equal(
    titles.filter((t) => /Remove a treachery from the encounter deck/.test(t))
      .length,
    3,
  );
  assert.equal(s.removed.length, 6);
  assert.ok(s.encounterDeck.includes(ERED.sickness));
  assert.ok(s.log.some((l) => /Dragon-sickness/.test(l.text)));
  // Abandoned Ruin (a burden) joins the Caves deck.
  assert.ok(s.mountGundabad!.cavesDeck.some((u) => u.code === ERED.ruin));
  // A Growing Threat and Dagnir's Spawn are in the encounter deck.
  assert.ok(s.encounterDeck.includes(ERED.growing));
  assert.ok(s.encounterDeck.includes(ERED.spawn));
  assert.ok(valid(s));
  assert.match(
    eredCampaignStatus(s)[0],
    /^Mount Gundabad: the discover keyword is ignored, and unique locations cannot be discarded from play by encounter card effects\. 6 treasures are recorded in the Campaign Log/,
  );
  // With 5 treasures Dragon-sickness stays out.
  const t = opening(gundabad(afterGhost(5)));
  assert.ok(!t.encounterDeck.includes(ERED.sickness));
  assert.ok(!t.encounterDiscard.includes(ERED.sickness));
  assert.ok(valid(t));
});

test("Ered Mithrin: in Mount Gundabad unique locations cannot be discarded from play by encounter card effects", () => {
  const base = calm(opening(gundabad()), "staging");
  // Powerful in Wrath (a Fire in the Night card in the Campaign Pool) cannot
  // discard Throat of the Mountain; it still surges.
  let s = structuredClone(base);
  const throat = make(s, GUNDABAD.throat);
  s.activeLocation = throat;
  const deck = s.encounterDeck.length;
  s = reveal(s, F.wrath);
  assert.equal(s.activeLocation?.id, throat.id);
  assert.ok(!s.encounterDiscard.includes(GUNDABAD.throat));
  assert.ok(
    s.log.some((l) =>
      /Throat of the Mountain is unique: it cannot be discarded from play by encounter card effects/.test(
        l.text,
      ),
    ),
  );
  assert.ok(s.encounterDeck.length < deck, "it surged");
  assert.ok(valid(s));
  // A non-unique active location is discarded.
  let t = structuredClone(base);
  const ruins = make(t, GUNDABAD.ruins);
  t.activeLocation = ruins;
  t = reveal(t, F.wrath);
  assert.notEqual(t.activeLocation?.id, ruins.id);
  assert.ok(t.encounterDiscard.includes(GUNDABAD.ruins));
  // Player card effects may still discard a unique location.
  const u = structuredClone(base);
  const hoard = make(u, GUNDABAD.hoard);
  u.staging.push(hoard);
  assert.equal(discardLocation(u, hoard, true), false);
  assert.ok(u.staging.some((l) => l.id === hoard.id));
  assert.equal(discardLocation(u, hoard), true);
  assert.ok(!u.staging.some((l) => l.id === hoard.id));
  // Outside the campaign the rule does not apply.
  const normal = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "mount-gundabad",
  });
  const other = make(normal, GUNDABAD.hoard);
  normal.staging.push(other);
  assert.equal(discardLocation(normal, other, true), true);
});

test("Ered Mithrin: Dragon-sickness gathers the unguarded treasures on a character and raises its controller's threat when that character exhausts", () => {
  // With no treasure in play it is discarded, and it surges.
  const empty = calm(opening(gundabad()), "staging");
  const deck = empty.encounterDeck.length;
  const discarded = reveal(empty, ERED.sickness);
  assert.ok(discarded.encounterDiscard.includes(ERED.sickness));
  assert.ok(discarded.encounterDeck.length < deck, "it surged");
  assert.ok(
    discarded.log.some((l) =>
      /no character has a treasure attached/.test(l.text),
    ),
  );
  // Treasures on two heroes and an ally: Dragon-sickness attaches to the ally,
  // which gathers the unguarded treasures (Dwarf-Lord's Crown can only be
  // attached to a hero).
  let s = calm(opening(gundabad()), "staging");
  const ally = make(s, "01016");
  ally.owner = 0;
  s.allies.push(ally);
  give(s, s.heroes[0], ERED.axe);
  give(s, s.heroes[1], ERED.crown);
  give(s, s.heroes[1], ERED.jewels);
  give(s, ally, ERED.bow);
  s = reveal(s, ERED.sickness, (x) =>
    x.choice?.title.startsWith("Dragon-sickness")
      ? x.choice.options.find((o) => o.code === "01016")?.id
      : undefined,
  );
  const host = s.allies.find((u) => u.id === ally.id)!;
  assert.ok(host.attachments.some((a) => a.code === ERED.sickness));
  assert.deepEqual(treasuresOn(host), [ERED.axe, ERED.jewels, ERED.bow].sort());
  assert.deepEqual(treasuresOn(s.heroes[0]), []);
  assert.deepEqual(treasuresOn(s.heroes[1]), [ERED.crown]);
  assert.ok(valid(s));
  // "Forced: After attached character exhausts, raise your threat by 1 for
  // each treasure attached to it."
  const threat = s.threat;
  exhaustCharacter(s, host);
  flush(s);
  assert.equal(s.threat, threat + 3);
  // Exhausting another character does nothing.
  exhaustCharacter(s, s.heroes[1]);
  flush(s);
  assert.equal(s.threat, threat + 3);
  // When the character leaves play, Dragon-sickness goes to the encounter
  // discard pile.
  destroy(s, host);
  flush(s);
  assert.ok(s.encounterDiscard.includes(ERED.sickness));
  assert.ok(valid(s));
  // Two players: the threat goes to the attached character's controller.
  let t = calm(opening(gundabadForTwo()), "staging");
  const theirs = seatView(t, 1).heroes[0];
  give(t, theirs, ERED.anvil, 1);
  t = reveal(t, ERED.sickness);
  const target = seatView(t, 1).heroes.find((h) => h.id === theirs.id)!;
  assert.ok(target.attachments.some((a) => a.code === ERED.sickness));
  const before = [seatView(t, 0).threat, seatView(t, 1).threat];
  exhaustCharacter(t, target);
  flush(t);
  assert.deepEqual(
    [seatView(t, 0).threat, seatView(t, 1).threat],
    [before[0], before[1] + 1],
  );
  assert.ok(valid(t));
});

test("Ered Mithrin: Mount Gundabad's resolution offers an optional treasure, removes A Growing Threat and adds Dragon-sickness at 6 treasures", () => {
  // 5 treasures recorded: a 6th from the resolution adds Dragon-sickness.
  const s = calm(opening(gundabad(afterGhost(5))));
  win(s);
  assert.ok(!s.campaign!.burdens.includes(ERED.growing));
  assert.ok(!poolEncounterCards(s.campaign!).includes(ERED.growing));
  const questions = eredResolutionQuestions(s);
  assert.deepEqual(
    questions.map((q) => q.id),
    ["treasure"],
  );
  assert.equal(questions[0].options.length, 4);
  assert.equal(questions[0].options.at(-1)!.id, "none");
  assert.match(questions[0].label, /a 6th adds Dragon-sickness/);
  assert.ok(
    questions[0].options
      .slice(0, 3)
      .every((o) => !s.campaign!.treasures!.includes(o.id)),
  );
  const pick = questions[0].options[0].id;
  const t = applyEredResolution(s, { treasure: pick });
  assert.equal(t.campaign!.treasures!.length, 6);
  assert.ok(t.campaign!.treasures!.includes(pick));
  assert.ok(t.campaign!.burdens.includes(ERED.sickness));
  assert.ok(poolEncounterCards(t.campaign!).includes(ERED.sickness));
  assert.equal(t.campaign!.resolution, null);
  assert.equal(t.eredCampaign?.looking, undefined);
  assert.ok(valid(t));
  // Taking no treasure keeps Dragon-sickness out.
  const u = applyEredResolution(s, { treasure: "none" });
  assert.equal(u.campaign!.treasures!.length, 5);
  assert.ok(!u.campaign!.burdens.includes(ERED.sickness));
  assert.ok(valid(u));
  // A treasure the players control is discovered first, and is not offered.
  const v = calm(opening(gundabad(afterGhost(5))));
  give(v, v.heroes[0], ERED.bow);
  win(v);
  assert.ok(v.campaign!.treasures!.includes(ERED.bow));
  assert.ok(v.campaign!.burdens.includes(ERED.sickness));
  assert.ok(
    eredResolutionQuestions(v)[0].options.every((o) => o.id !== ERED.bow),
  );
  // Every treasure discovered: nothing to look at, and Dragon-sickness joins.
  const w = calm(opening(gundabad(afterGhost(9))));
  win(w);
  assert.deepEqual(eredResolutionQuestions(w), []);
  assert.equal(w.campaign!.resolution, null);
  assert.ok(w.campaign!.burdens.includes(ERED.sickness));
  assert.ok(valid(w));
  // The campaign continues with The Fate of Wilderland.
  const next = continueCampaign(t, t.campaign!.heroes, t.deckId, true, 9);
  assert.equal(next.scenarioId, "the-fate-of-wilderland");
});
