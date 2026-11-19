import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { win } from "../src/game/board";
import {
  applyAction,
  availableAbilities,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  BELDIS_USES,
  ERED,
  applyEredResolution,
  eredResolutionQuestions,
  newEredCampaign,
} from "../src/game/ered-campaign";
import { eredCampaignUnitAbilityProblem } from "../src/game/ered-campaign-cards";
import { firstPlayer, seatView, selectSeat } from "../src/game/table";
import { syncAttachmentText } from "../src/game/attachment-text";
import { WILDS_RHOVANION as W } from "../src/game/wilds-rhovanion-support";
import { ROAM_RHOVANION as R } from "../src/game/roam-rhovanion-support";
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
/** The first five chapters are recorded: Fire in the Night is next. */
function afterRoam(heroes = d.heroes, seatHeroes?: number[]): CampaignState {
  const c = newEredCampaign(heroes, seatHeroes);
  c.completed = (
    [
      "journey-up-the-anduin",
      "lost-in-mirkwood",
      "the-kings-quest",
      "the-withered-heath",
      "roam-across-rhovanion",
    ] as const
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 6 }));
  c.burdens = [ERED.growing, ERED.ruin, ERED.spawn];
  return c;
}
const fire = (campaign = afterRoam(), seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "fire-in-the-night",
    playMode: "campaign",
    campaign,
  });
/** A two-player Fire in the Night in the campaign. */
function fireForTwo() {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  const c = afterRoam(
    seats.flatMap((p) => p.heroes),
    [3, 3],
  );
  return createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "fire-in-the-night",
    playMode: "campaign",
    campaign: c,
    seats,
  });
}
const beldisOf = (s: GameState) =>
  [0, 1]
    .flatMap((p) => (s.table || p === 0 ? seatView(s, p).allies : []))
    .find((u) => u.code === ERED.beldis)!;
const beldisAbility = (s: GameState, u: Unit) =>
  availableAbilities(s, u).find((x) => x.label.startsWith("Beldis"));

test("Ered Mithrin: Fire in the Night's campaign card and Beldis carry their scans' texts", () => {
  const c = card(ERED.fireCard);
  assert.deepEqual(
    [c.type_code, c.subtitle, c.position],
    ["campaign", "Ered Mithrin Part 6", 186],
  );
  assert.match(
    c.text!,
    /^You are playing campaign mode\.\nSetup: The first player gains control of Beldis\. If “Turayn has taken an oath of vigilance,” search the encounter deck for 3 non-unique locations/,
  );
  assert.match(c.text!, /\nIgnore the deep keyword\.\n/);
  // The back prints "and and choose" (kept as printed).
  assert.match(
    c.back_text!,
    /If there is at least 5 progress on Hrogar's Hill, the players look at 3 random undiscovered treasures and and choose 1 to attach to an eligible character\./,
  );
  assert.match(
    c.back_text!,
    /Each player may remove a non-burden card from the campaign pool\.$/,
  );
  const b = card(ERED.beldis);
  assert.deepEqual(
    [
      b.type_code,
      b.sphere_code,
      b.is_unique,
      b.cost,
      b.willpower,
      b.attack,
      b.defense,
      b.health,
      b.traits,
      b.position,
    ],
    ["ally", "boon", true, "1", 2, 1, 1, 3, "Woodsman. Healer.", 187],
  );
  assert.match(
    b.text!,
    /^Action: Spend 1 resource and mark a use in the campaign log to heal 3 damage from a character\. Any player may trigger this ability\. \(Each player has 4 uses for the campaign\.\)$/,
  );
  assert.equal(art.length, 39);
  for (const code of [ERED.fireCard, ERED.beldis])
    assert.ok(
      art.some((a) => a.code === code),
      card(code).name,
    );
});

test("Ered Mithrin: Fire in the Night's setup gives Beldis to the first player and applies Turayn's and Isolde's notes", () => {
  const c = afterRoam();
  c.notes = ["turayn", "isolde"];
  const titles: string[] = [];
  const s = opening(fire(c), (x) => {
    titles.push(x.choice!.title);
    return undefined;
  });
  assert.equal(
    titles.filter((t) => /Remove a non-unique location/.test(t)).length,
    3,
  );
  assert.equal(
    titles.filter((t) => /Remove a non-unique enemy/.test(t)).length,
    3,
  );
  assert.equal(s.removed.length, 6);
  assert.ok(
    s.removed.every((code) => !card(code).is_unique),
    JSON.stringify(s.removed),
  );
  assert.ok(s.allies.some((u) => u.code === ERED.beldis));
  assert.ok(valid(s));
  // In a two-player game Beldis goes to the first player.
  const t = opening(fireForTwo());
  const first = firstPlayer(t);
  assert.ok(seatView(t, first).allies.some((u) => u.code === ERED.beldis));
  assert.ok(!seatView(t, 1 - first).allies.some((u) => u.code === ERED.beldis));
});

test("Ered Mithrin: Beldis spends 1 resource and marks a use in the Campaign Log to heal 3 damage, 4 uses for each player", () => {
  let s = calm(opening(fire()));
  const beldis = beldisOf(s);
  // With no damage in play there is nothing to heal.
  assert.ok(beldisAbility(s, beldis)!.disabled);
  s.heroes[1].damage = 3;
  s.heroes[0].resources = 2;
  assert.ok(!beldisAbility(s, beldis)!.disabled);
  s = applyAction(reload(s), { type: "ABILITY", id: beldis.id } as never);
  assert.match(
    s.choice!.title,
    /^Beldis · Spend 1 resource from a hero you control/,
  );
  s = choose(s, s.heroes[0].id);
  assert.match(s.choice!.title, /^Beldis · Heal 3 damage from a character/);
  s = choose(s, s.heroes[1].id);
  assert.equal(s.heroes[1].damage, 0);
  assert.equal(s.heroes[0].resources, 1);
  assert.deepEqual(s.campaign!.beldis, [1]);
  assert.ok(valid(s));
  // A hero immune to player card effects (Misplaced Trust) cannot be healed.
  s.heroes[2].damage = 2;
  s.heroes[2].attachments.push({
    id: `a${s.nextId++}`,
    code: ERED.misplaced,
    exhausted: false,
    owner: 0,
  });
  syncAttachmentText(s);
  assert.equal(
    eredCampaignUnitAbilityProblem(s, beldis),
    "No character has damage to heal.",
  );
  // Each player has 4 uses for the campaign.
  s.heroes[1].damage = 1;
  s.campaign!.beldis = [BELDIS_USES];
  assert.match(
    eredCampaignUnitAbilityProblem(s, beldis)!,
    /all 4 of your uses of Beldis/,
  );
  // Any player may trigger it: the other player pays and marks their use.
  let t = calm(opening(fireForTwo()));
  const b = beldisOf(t);
  const owner = seatView(t, 0).allies.some((u) => u.id === b.id) ? 0 : 1;
  const other = 1 - owner;
  selectSeat(t, other);
  t.heroes[0].damage = 2;
  t.heroes[0].resources = 1;
  t = applyAction(reload(t), { type: "ABILITY", id: b.id } as never);
  t = choose(t, t.heroes[0].id);
  t = choose(t, t.heroes[0].id);
  assert.equal(t.heroes[0].damage, 0);
  assert.equal(t.campaign!.beldis![other], 1);
  assert.equal(t.campaign!.beldis![owner] ?? 0, 0);
  assert.ok(valid(t));
});

test("Ered Mithrin: Fire in the Night's resolution offers Beldis, a treasure for 5 progress on Hrogar's Hill and a removal from the Campaign Pool", () => {
  const s = calm(opening(fire()));
  s.campaign!.encounterPool = {
    [W.troll]: 1,
    [R.moor]: 2,
    [ERED.cunning]: 1,
  };
  const won = structuredClone(s);
  won.progress = 5;
  win(won);
  const questions = eredResolutionQuestions(won);
  assert.deepEqual(
    questions.map((q) => q.id),
    ["beldis", "treasure", "remove-0"],
  );
  assert.equal(questions[1].options.length, 3);
  // Urdug's Cunning is a burden: it cannot be removed.
  assert.deepEqual(
    questions[2].options.map((o) => o.id),
    ["none", W.troll, R.moor],
  );
  const treasure = questions[1].options[0].id;
  const t = applyEredResolution(won, {
    beldis: "aid",
    treasure,
    "remove-0": R.moor,
  });
  assert.ok(t.campaign!.boons.includes(ERED.beldis));
  assert.ok(t.campaign!.treasures!.includes(treasure));
  assert.deepEqual(t.campaign!.encounterPool, {
    [W.troll]: 1,
    [R.moor]: 1,
    [ERED.cunning]: 1,
  });
  assert.equal(t.campaign!.resolution, null);
  assert.ok(valid(t));
  // Under 5 progress there is no treasure; the note instead of Beldis, and
  // the last copy of a card leaves the Campaign Pool.
  const short = structuredClone(s);
  short.progress = 4;
  win(short);
  assert.deepEqual(
    eredResolutionQuestions(short).map((q) => q.id),
    ["beldis", "remove-0"],
  );
  const u = applyEredResolution(short, {
    beldis: "note",
    "remove-0": W.troll,
  });
  assert.ok(u.campaign!.notes!.includes("beldis"));
  assert.ok(!u.campaign!.boons.includes(ERED.beldis));
  assert.equal(u.campaign!.encounterPool![W.troll], undefined);
  // The campaign continues with The Ghost of Framsburg (not yet available).
  assert.throws(
    () => continueCampaign(u, u.campaign!.heroes, u.deckId, true, 9),
    /not available in campaign mode yet/,
  );
});

test("Ered Mithrin: in a two-player Fire in the Night each player may remove a card, but not more copies than the Campaign Pool holds", () => {
  const s = calm(opening(fireForTwo()));
  s.campaign!.encounterPool = { [W.troll]: 1, [R.moor]: 2 };
  win(s);
  assert.deepEqual(
    eredResolutionQuestions(s).map((q) => q.id),
    ["beldis", "remove-0", "remove-1"],
  );
  assert.throws(
    () =>
      applyEredResolution(s, {
        beldis: "aid",
        "remove-0": W.troll,
        "remove-1": W.troll,
      }),
    /Only 1 copy of Stone-troll is in the Campaign Pool\./,
  );
  const t = applyEredResolution(s, {
    beldis: "aid",
    "remove-0": R.moor,
    "remove-1": R.moor,
  });
  assert.deepEqual(t.campaign!.encounterPool, { [W.troll]: 1 });
  assert.ok(valid(t));
});
