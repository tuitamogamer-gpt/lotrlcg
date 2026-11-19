import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { win } from "../src/game/board";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  ERED,
  ERED_CAMPAIGN_ORDER,
  eredCampaignStatus,
  eredChapterSupported,
  eredResolutionQuestions,
  newEredCampaign,
  nextEredChapter,
} from "../src/game/ered-campaign";
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
/** The first eight chapters are recorded: The Fate of Wilderland is next. */
function afterGundabad(
  heroes = d.heroes,
  seatHeroes?: number[],
): CampaignState {
  const c = newEredCampaign(heroes, seatHeroes);
  c.completed = ERED_CAMPAIGN_ORDER.slice(0, 8).map((scenarioId) => ({
    scenarioId,
    score: 10,
    rounds: 6,
  }));
  c.burdens = [ERED.ruin, ERED.spawn];
  // Turayn and Melanwar (boon allies) and two discovered treasures join the
  // first player's deck.
  c.boons = [ERED.turayn, ERED.melanwar];
  c.treasures = [ERED.axe, ERED.bow];
  c.deckBoons = {
    [ERED.turayn]: 0,
    [ERED.melanwar]: 0,
    [ERED.axe]: 0,
    [ERED.bow]: 0,
  };
  return c;
}
const fate = (campaign = afterGundabad(), seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-fate-of-wilderland",
    playMode: "campaign",
    campaign,
  });
function fateForTwo() {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  const c = afterGundabad(
    seats.flatMap((p) => p.heroes),
    [3, 3],
  );
  c.treasures = [ERED.axe, ERED.bow, ERED.dagger, ERED.lute];
  c.deckBoons = {
    [ERED.turayn]: 0,
    [ERED.bow]: 0,
    [ERED.lute]: 0,
    [ERED.melanwar]: 1,
    [ERED.axe]: 1,
    [ERED.dagger]: 1,
  };
  return createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-fate-of-wilderland",
    playMode: "campaign",
    campaign: c,
    seats,
  });
}
const SEARCHABLE = [ERED.turayn, ERED.melanwar, ERED.axe, ERED.bow];

test("Ered Mithrin: The Fate of Wilderland's campaign card carries its scans' texts", () => {
  const c = card(ERED.fateCard);
  assert.deepEqual(
    [c.type_code, c.subtitle, c.position, c.encounter_set],
    ["campaign", "Ered Mithrin Part 9", 194, "Ered Mithrin Campaign"],
  );
  assert.equal(
    c.text,
    "You are playing campaign mode.\nSetup: Each player may search their deck for a boon or treasure card and add it to their hand. If “Turayn has taken an oath of vigilance,” search the encounter deck for 3 non-unique enemies and remove them from the game. If “Beldis's care has bolstered the heroes' spirits,” search the encounter deck for 3 treacheries and remove them from the game.\nIgnore the deep and discover keywords.",
  );
  assert.equal(c.back_text, "Resolution: The players win the campaign!");
  assert.deepEqual(
    art
      .filter((a) => a.code === ERED.fateCard)
      .map((a) => a.face)
      .sort(),
    ["back", "front"],
  );
  assert.equal(art.length, 49);
  assert.ok(eredChapterSupported("the-fate-of-wilderland"));
});

test("Ered Mithrin: The Fate of Wilderland's setup lets each player search for a boon or treasure and applies Turayn's and Beldis's notes", () => {
  const c = afterGundabad();
  c.notes = ["turayn", "beldis"];
  const titles: string[] = [];
  let searched = "";
  const s = opening(fate(c), (x) => {
    titles.push(x.choice!.title);
    if (/search your deck for a boon or treasure/.test(x.choice!.title)) {
      const take = x.choice!.options.find((o) => o.id !== "decline")!;
      searched = take.id;
      return take.id;
    }
    return undefined;
  });
  assert.equal(
    titles.filter((t) =>
      /^The Fate of Wilderland · You may search your deck for a boon or treasure card/.test(
        t,
      ),
    ).length,
    1,
  );
  assert.ok(SEARCHABLE.includes(searched), searched);
  assert.ok(s.hand.some((u) => u.code === searched));
  assert.ok(!s.deck.includes(searched));
  assert.equal(
    titles.filter((t) => /Remove a non-unique enemy/.test(t)).length,
    3,
  );
  assert.equal(titles.filter((t) => /Remove a treachery/.test(t)).length, 3);
  assert.equal(s.removed.length, 6);
  assert.ok(s.log.some((l) => /The Fate of Wilderland/.test(l.text)));
  assert.match(
    eredCampaignStatus(s)[0],
    /^The Fate of Wilderland: the deep and discover keywords are ignored\. Winning this chapter wins the Ered Mithrin campaign\./,
  );
  assert.ok(valid(s));
  // Declining keeps the deck as it was: the offered cards stay in it.
  let offered: string[] = [];
  const t = opening(fate(), (x) => {
    if (!/search your deck for a boon or treasure/.test(x.choice!.title))
      return undefined;
    offered = x
      .choice!.options.filter((o) => o.id !== "decline")
      .map((o) => o.id);
    return "decline";
  });
  assert.ok(offered.length >= 1);
  assert.ok(offered.every((code) => t.deck.includes(code)));
  assert.ok(
    SEARCHABLE.every(
      (code) => t.deck.includes(code) || t.hand.some((u) => u.code === code),
    ),
  );
  // Two players: each searches their own deck.
  const seen: string[] = [];
  const u = opening(fateForTwo(), (x) => {
    if (/search your deck for a boon or treasure/.test(x.choice!.title))
      seen.push(x.choice!.title);
    return undefined;
  });
  assert.equal(seen.length, 2);
  assert.notEqual(seen[0], seen[1]);
  assert.ok(valid(u));
});

test("Ered Mithrin: The Fate of Wilderland's resolution wins the campaign", () => {
  const s = calm(opening(fate()));
  const treasure = ERED.dagger;
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: treasure,
    exhausted: false,
    owner: 0,
  });
  win(s);
  assert.equal(s.campaign!.outcome, "won");
  assert.equal(s.campaign!.completed.length, 9);
  assert.equal(
    s.campaign!.completed.at(-1)!.scenarioId,
    "the-fate-of-wilderland",
  );
  assert.equal(s.campaign!.resolution ?? null, null);
  assert.deepEqual(eredResolutionQuestions(s), []);
  assert.ok(
    s.log.some((l) =>
      /The Fate of Wilderland · Resolution: the players win the Ered Mithrin campaign!/.test(
        l.text,
      ),
    ),
  );
  // Its resolution only ends the campaign: no treasure is discovered.
  assert.ok(!s.campaign!.treasures!.includes(treasure));
  assert.equal(nextEredChapter(s.campaign!), undefined);
  assert.ok(valid(s));
  assert.throws(
    () => continueCampaign(s, s.campaign!.heroes, s.deckId, true, 9),
    /The campaign is complete/,
  );
  // The outcome belongs to the last chapter only.
  const t = calm(opening(fate()));
  t.campaign!.outcome = "won";
  assert.equal(valid(t), false);
});
