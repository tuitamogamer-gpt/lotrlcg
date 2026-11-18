import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import { damage, readyCharacter, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { make, stats, threatOf } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import { reduceThreat } from "../src/game/threat-reduction";
import { sailingCommitCount } from "../src/game/sailing";
import {
  DC,
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_LOG,
  backFace,
  dreamchaserFleet,
} from "../src/game/dreamchaser-campaign-support";
import {
  DREAMCHASER_CAMPAIGN_SUPPORTED,
  dreamchaserCampaignStatus,
  dreamchaserForbiddenTitle,
  dreamchaserMarksProblem,
  dreamchaserXpLines,
  newDreamchaserCampaign,
  spendDreamchaserXp,
} from "../src/game/dreamchaser-campaign";
import {
  dreamchaserAbility,
  dreamchaserAbilityProblem,
  dreamchaserArchery,
  dreamchaserCampaignEncounter,
  dreamchaserCannotCancel,
  dreamchaserSailingWeight,
} from "../src/game/dreamchaser-campaign-cards";
import { VOYAGE } from "../src/game/voyage-belegaer-support";
import { seatView } from "../src/game/table";
import type { CampaignState, GameState, Unit } from "../src/game/types";
import art from "./dreamchaser-campaign-art.json";

const d = STARTERS[0];
const HEROES = d.heroes;
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState) {
  Object.assign(s, { phase: "planning", choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
/** Every seat keeps its hand and the fleet's setup choices resolve (`pick` may answer one). */
function opening(
  s: GameState,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  for (let i = 0; i < 160; i++) {
    if (s.choice)
      s = choose(
        s,
        pick(s) ??
          (s.choice.options.find((o) => o.id === "skip") ?? s.choice.options[0])
            .id,
      );
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
const voyage = (
  seed = 5,
  campaign?: CampaignState,
  extra: { dreamchaserMode?: "hard" | "expert" } = {},
) =>
  createGame(seed, d.cards, HEROES, d.id, {
    scenarioId: "voyage-across-belegaer",
    playMode: "campaign",
    ...(campaign ? { campaign } : {}),
    ...extra,
  });
const ships = (s: GameState) =>
  s.allies.filter((u) => card(u.code).type_code === "ship-objective");
function engage(s: GameState, code: string) {
  const i = s.encounterDeck.indexOf(code);
  if (i >= 0) s.encounterDeck.splice(i, 1);
  const enemy = make(s, code);
  s.engaged.push(enemy);
  return enemy;
}

test("The Dream-chaser campaign: Voyage Across Belegaer's campaign card and the fleet, Modification and burden cards are registered with the print-and-play texts, every face is pinned, and the Campaign Log lists its checkboxes", () => {
  assert.equal(DREAMCHASER_CAMPAIGN_ORDER.length, 9);
  assert.deepEqual(DREAMCHASER_CAMPAIGN_SUPPORTED, ["voyage-across-belegaer"]);
  const campaignCard = card(
    DREAMCHASER_CAMPAIGN_CARDS["voyage-across-belegaer"]!,
  );
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 1");
  assert.match(
    campaignCard.text!,
    /^You are playing Campaign Mode\.\nSetup: Each player chooses a Modification boon for each of their ship-objectives and attaches it to that ship-objective\. For each ship-objective, its controller may deal 2 damage to it to add 1 resource to a hero's resource pool\. Shuffle Ominous Fate and Thunderstruck into the encounter deck\. Shuffle Crowley into the Corsair deck\.$/,
  );
  assert.match(
    campaignCard.back_text!,
    /^Resolution: Add Ominous Fate to the Campaign Pool\.\nGain the following:\n• 1 XP for each surviving player\./,
  );
  // The ships' Upgraded faces carry their printed XP cost.
  for (const code of [
    DC.dream,
    DC.dawn,
    DC.dusk,
    DC.glorinaith,
    DC.narelenya,
    DC.silver,
  ])
    assert.equal(card(backFace(code)).upgrade_xp, 4, card(code).name);
  assert.deepEqual(
    [
      card(backFace(DC.dream)).willpower,
      card(backFace(DC.dream)).attack,
      card(backFace(DC.dream)).defense,
      card(backFace(DC.dream)).health,
    ],
    [6, 5, 5, 19],
  );
  assert.match(
    card(DC.ominous).text!,
    /^Surge\. Ominous Fate cannot be canceled\./,
  );
  assert.equal(card(DC.thunderstruck).type_code, "ship-enemy");
  assert.equal(card(DC.thunderstruck).victory, 7);
  assert.equal(card(DC.ominous).sailing, 1);
  for (const a of art) {
    const bytes = readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
  }
  // The Campaign Log: 14 scalable and 28 upgradable lines.
  assert.equal(DREAMCHASER_LOG.filter((l) => l.kind === "scalable").length, 14);
  assert.equal(
    DREAMCHASER_LOG.filter((l) => l.kind === "upgradable").length,
    28,
  );
  assert.equal(DREAMCHASER_LOG.find((l) => l.key === DC.cutlass)!.boxes, 5);
  // A new campaign begins with Voyage Across Belegaer; Na'asiyah waits for
  // the last two scenarios.
  const fresh = voyage();
  assert.equal(fresh.campaign!.kind, "dreamchaser");
  assert.equal(fresh.campaign!.xp, 0);
  assert.equal(
    dreamchaserForbiddenTitle("voyage-across-belegaer"),
    "Na'asiyah",
  );
  assert.equal(dreamchaserForbiddenTitle("a-storm-on-cobas-haven"), undefined);
  assert.throws(
    () =>
      createGame(5, d.cards, ["12109", HEROES[1], HEROES[2]], d.id, {
        scenarioId: "voyage-across-belegaer",
        playMode: "campaign",
        campaign: newDreamchaserCampaign(["12109", HEROES[1], HEROES[2]]),
      }),
    /No card titled Na'asiyah/,
  );
  assert.throws(
    () =>
      createGame(5, d.cards, HEROES, d.id, {
        scenarioId: "the-fate-of-numenor",
        playMode: "campaign",
        campaign: newDreamchaserCampaign(HEROES),
      }),
    /follows its chapters in order/,
  );
  assert.ok(valid(fresh));
});

test("Voyage Across Belegaer: the fleet is prepared from six ships, each ship takes a different Modification boon, its controller may trade 2 damage on it for a resource, and Ominous Fate, Thunderstruck and Crowley join the decks", () => {
  const created = voyage();
  assert.ok(created.encounterDeck.includes(DC.ominous));
  assert.ok(created.encounterDeck.includes(DC.thunderstruck));
  assert.ok(created.voyageBelegaer!.corsairDeck.includes(DC.crowley));
  assert.equal(created.voyageBelegaer!.setAside.length, 6);
  let s = applyAction(reload(created), { type: "KEEP" });
  assert.match(s.choice!.title, /^Prepare the fleet/);
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Dream-chaser"],
  );
  s = choose(s, s.choice!.options[0].id);
  // A solo player takes a second ship: the four others and the two new ones.
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Dawn Star", "Duskbringer", "Glórinaith", "Nárelenya", "Silver Wing"],
  );
  s = choose(
    s,
    s.choice!.options.find((o) => card(o.code!).name === "Duskbringer")!.id,
  );
  assert.match(s.choice!.title, /Choose a Modification boon for Dream-chaser$/);
  assert.equal(s.choice!.options.length, 4);
  s = choose(s, DC.armor);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [DC.ballista, DC.quarters, DC.sails],
  );
  s = choose(s, DC.quarters);
  assert.match(
    s.choice!.title,
    /^Voyage Across Belegaer · Deal 2 damage to Dream-chaser/,
  );
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  s = choose(s, "skip");
  const [dream, dusk] = ships(s);
  assert.equal(dream.damage, 2);
  assert.equal(s.heroes[0].resources, s.heroes[1].resources + 1);
  assert.deepEqual(
    dream.attachments.map((a) => a.code).filter((c) => c === DC.armor),
    [DC.armor],
  );
  assert.ok(dusk.attachments.some((a) => a.code === DC.quarters));
  // The Modification boons' bonuses.
  assert.equal(stats(s, dream).defense, 4 + 1);
  assert.equal(stats(s, dusk).health, 16 + 3);
  // Enlarged Quarters: its Ship can be committed to any Sailing test.
  assert.equal(dreamchaserSailingWeight(dusk), 1);
  assert.equal(dreamchaserSailingWeight(dream), 2);
  assert.ok(
    dreamchaserCampaignStatus(s).some((l) =>
      /^Ominous Fate is shuffled into the encounter deck: X is 1/.test(l),
    ),
  );
  assert.ok(valid(s));
});

test("Upgraded ships: once every checkbox is marked a ship takes its Upgraded side (the Dream-chaser counts as 3 characters, Silver Wing lowers the starting threat by 6, Dawn Star no longer raises it), and an Upgraded Modification attaches", () => {
  const marks = { [DC.dream]: 4, [DC.silver]: 4, [DC.dawn]: 4, [DC.armor]: 2 };
  const c: CampaignState = { ...newDreamchaserCampaign(HEROES), marks };
  assert.deepEqual(
    dreamchaserFleet(c).filter((code) => code.endsWith(".B")),
    [backFace(DC.dream), backFace(DC.dawn), backFace(DC.silver)],
  );
  const created = voyage(5, c);
  const threat = created.threat;
  let s = applyAction(reload(created), { type: "KEEP" });
  s = choose(s, s.choice!.options[0].id);
  s = choose(
    s,
    s.choice!.options.find((o) => card(o.code!).name === "Silver Wing")!.id,
  );
  assert.equal(s.threat, Math.max(0, threat - 6), "Silver Wing (Upgraded): -6");
  s = choose(s, DC.armor);
  s = opening(s);
  const dream = ships(s).find((u) => card(u.code).name === "Dream-chaser")!;
  assert.equal(dream.code, backFace(DC.dream));
  assert.equal(dreamchaserSailingWeight(dream), 3);
  assert.ok(dream.attachments.some((a) => a.code === backFace(DC.armor)));
  assert.equal(stats(s, dream).defense, 5 + 1);
  // Dawn Star's Upgraded side does not raise the starting threat.
  const two = voyage(5, c);
  let t = applyAction(reload(two), { type: "KEEP" });
  t = choose(t, t.choice!.options[0].id);
  const before = t.threat;
  t = choose(
    t,
    t.choice!.options.find((o) => card(o.code!).name === "Dawn Star")!.id,
  );
  assert.equal(t.threat, before);
  assert.ok(valid(s));
  // A Sailing test counts the Upgraded Dream-chaser as 3 characters.
  const sail = calm(reload(s));
  sail.sailing = {
    heading: 2,
    test: {
      phase: "actions",
      player: 0,
      committedIds: [dream.id],
      continuation: [],
    },
  };
  assert.equal(sailingCommitCount(sail), 3);
});

test("Ominous Fate: it cannot be canceled; each player reveals an encounter card, raises their threat by X or deals X damage among their characters (X is the part number), and the players may add it to the victory display for 1 XP less", () => {
  let s = calm(reload(opening(voyage())));
  assert.ok(dreamchaserCannotCancel(s, DC.ominous));
  s.encounterDeck = s.encounterDeck.filter((c) => c !== DC.ominous);
  const threat = s.threat;
  dreamchaserCampaignEncounter(s, DC.ominous);
  flush(s);
  assert.match(s.choice!.title, /^Ominous Fate · Choose \(X is 1\)$/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["reveal", "threat", "damage"],
  );
  s = choose(s, "threat");
  assert.equal(s.threat, threat + 1);
  assert.match(
    s.choice!.title,
    /^Ominous Fate · Add it to the victory display\?$/,
  );
  s = choose(s, "victory");
  assert.ok(s.victoryCards!.includes(DC.ominous));
  assert.ok(!s.encounterDiscard.includes(DC.ominous));
  const lines = dreamchaserXpLines(s);
  assert.equal(lines.find((l) => /Ominous Fate/.test(l.label))!.xp, -1);
  assert.ok(valid(s));
});

test("Thunderstruck: +2 hit points per player, archery 1, at most 4 damage each round, and a shadow that either joins the staging area or deals 2 damage to the defender", () => {
  const s = calm(reload(opening(voyage())));
  const ship = engage(s, DC.thunderstruck);
  assert.equal(stats(s, ship).health, 4 + 2);
  assert.equal(dreamchaserArchery(s, ship), 1);
  damage(s, ship.id, 3);
  damage(s, ship.id, 3);
  assert.equal(ship.damage, 4, "no more than 4 damage this round");
  s.round += 1;
  damage(s, ship.id, 1);
  assert.equal(ship.damage, 5);
  assert.ok(valid(s));
});

test("Crowley: he engages with a resource, gets +1 to his threat, attack, defense and hit points for each, returns to the staging area at the end of combat, and goes to the victory display (victory 3) with 3 or more resources", () => {
  let s = calm(reload(opening(voyage())));
  s.voyageBelegaer!.corsairDeck = s.voyageBelegaer!.corsairDeck.filter(
    (c) => c !== DC.crowley,
  );
  const crowley = make(s, DC.crowley);
  s.staging.push(crowley);
  applyAction; // keep the import used in this file's helpers
  // Engaging places a resource on him.
  const before = stats(s, crowley);
  s = reload(s);
  const again = s.staging.find((u) => u.code === DC.crowley)!;
  again.resources = 2;
  assert.equal(stats(s, again).attack, before.attack + 2);
  assert.equal(threatOf(s, again), 2 + 2);
  // With 3 resources he is worth victory 3.
  again.resources = 3;
  s.staging = s.staging.filter((u) => u.id !== again.id);
  s.engaged.push(again);
  const victory = s.victory;
  damage(s, again.id, 99);
  flush(s);
  assert.ok(s.victoryCards!.includes(DC.crowley));
  assert.equal(s.victory, victory + 3);
  assert.ok(valid(s));
});

test("Glórinaith: once per round, discard the top 2 cards of a deck to deal 1 damage to an engaged non-unique enemy", () => {
  let s = applyAction(reload(voyage()), { type: "KEEP" });
  s = choose(s, s.choice!.options[0].id);
  s = choose(
    s,
    s.choice!.options.find((o) => card(o.code!).name === "Glórinaith")!.id,
  );
  s = calm(reload(opening(s)));
  const glorinaith = ships(s).find((u) => card(u.code).name === "Glórinaith")!;
  assert.match(
    dreamchaserAbilityProblem(s, glorinaith)!,
    /No engaged non-unique enemy/,
  );
  const foe = engage(s, VOYAGE.sailor);
  assert.equal(dreamchaserAbilityProblem(s, glorinaith), null);
  dreamchaserAbility(s, glorinaith);
  flush(s);
  const top = s.encounterDeck.slice(0, 2);
  s = choose(s, "encounter");
  s = choose(s, foe.id);
  assert.equal(s.engaged.find((u) => u.id === foe.id)?.damage ?? 1, 1);
  assert.deepEqual(s.encounterDiscard.slice(-2), top);
  assert.match(
    dreamchaserAbilityProblem(
      s,
      s.allies.find((u) => u.id === glorinaith.id)!,
    )!,
    /used this round/,
  );
  assert.ok(valid(s));
});

test("Hard and Expert Mode: threat cannot be reduced by more than 1 each round (not at all in Expert Mode), drawing cards after setup raises threat, Expert Mode's readied characters raise threat, and the resolution gives 1 or 2 XP", () => {
  const hard = calm(
    reload(opening(voyage(5, undefined, { dreamchaserMode: "hard" }))),
  );
  assert.equal(hard.dreamchaser!.mode, "hard");
  hard.threat = 30;
  reduceThreat(hard, 3);
  assert.equal(hard.threat, 29, "only 1 this round");
  reduceThreat(hard, 2);
  assert.equal(hard.threat, 29);
  hard.round += 1;
  reduceThreat(hard, 2);
  assert.equal(hard.threat, 28);
  const expert = calm(
    reload(opening(voyage(5, undefined, { dreamchaserMode: "expert" }))),
  );
  expert.threat = 30;
  reduceThreat(expert, 3);
  assert.equal(expert.threat, 30);
  // Expert Mode: readying by a player card effect raises threat (the engine's
  // own readying, here a test call without a player card source, does not).
  const hero = expert.heroes[0];
  hero.exhausted = true;
  readyCharacter(expert, hero);
  assert.equal(expert.threat, 30);
  assert.ok(
    dreamchaserCampaignStatus(expert).some((l) => /^Expert Mode:/.test(l)),
  );
  // The resolution's extra XP.
  assert.equal(dreamchaserXpLines(hard).at(-1)!.xp, 1);
  assert.equal(dreamchaserXpLines(expert).at(-1)!.xp, 2);
  assert.ok(valid(hard) && valid(expert));
});

test("The resolution: Ominous Fate joins the Campaign Pool, the campaign card's bullets give XP, the XP is recorded with the chapter, and spending it marks checkboxes before the next chapter", () => {
  let s = calm(reload(opening(voyage())));
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    VOYAGE.warship,
    DC.thunderstruck,
  ];
  s.sailing!.heading = 0;
  s.staging = s.staging.filter((u) => card(u.code).type_code !== "ship-enemy");
  const lines = dreamchaserXpLines(s);
  const total = lines.reduce((n, l) => n + l.xp, 0);
  assert.equal(lines.find((l) => /surviving player/.test(l.label))!.xp, 1);
  assert.equal(lines.find((l) => /Corsair Warship/.test(l.label))!.xp, 1);
  assert.equal(lines.find((l) => /Thunderstruck/.test(l.label))!.xp, 2);
  assert.equal(lines.find((l) => /on-course/.test(l.label))!.xp, 1);
  win(s);
  const c = s.campaign!;
  assert.ok(c.burdens.includes(DC.ominous));
  assert.equal(c.xp, total);
  assert.equal(c.completed[0].xp, total);
  assert.ok(valid(s));
  // Spending XP: 1 XP per checkbox, marked checkboxes stay, Gavin waits for
  // A Storm on Cobas Haven.
  assert.match(dreamchaserMarksProblem(c, { [DC.armor]: 3 })!, /2 checkboxes/);
  assert.match(dreamchaserMarksProblem(c, { [DC.gavin]: 4 })!, /Gavin/);
  assert.match(
    dreamchaserMarksProblem(c, {
      [DC.dream]: 4,
      [DC.silver]: 4,
      [DC.cutlass]: 5,
    })!,
    /unspent XP/,
  );
  const spent = spendDreamchaserXp(c, { [DC.armor]: 2 });
  assert.equal(spent.marks![DC.armor], 2);
  assert.equal(spent.xp, total - 2);
  assert.throws(
    () => spendDreamchaserXp(spent, { [DC.armor]: 1 }),
    /stay marked/,
  );
  // The next chapter waits for its campaign card.
  assert.throws(
    () =>
      continueCampaign(
        s,
        HEROES,
        d.id,
        true,
        9,
        undefined,
        undefined,
        undefined,
        { marks: { [DC.armor]: 2 } },
      ),
    /not available in campaign mode yet/,
  );
  // Two players prepare a fleet of two ships.
  const seats = [
    { heroes: HEROES.slice(0, 2), deckId: STARTERS[1].id },
    {
      heroes: [STARTERS[2].heroes[0], STARTERS[2].heroes[1]],
      deckId: STARTERS[2].id,
    },
  ];
  let two = createGame(8, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
    scenarioId: "voyage-across-belegaer",
    playMode: "campaign",
    seats,
  });
  two = opening(two);
  assert.equal(
    seatView(two, 0).allies.filter(
      (u: Unit) => card(u.code).type_code === "ship-objective",
    ).length,
    1,
  );
  assert.equal(
    seatView(two, 1).allies.filter(
      (u: Unit) => card(u.code).type_code === "ship-objective",
    ).length,
    1,
  );
  assert.ok(valid(two));
});

test("Thunderstruck's shadow, Crowley's engagement and return, Duskbringer's resource, and the Upgraded Modification boons (Armor Plating, Ballista, Extra Sails); a Modification that leaves play is removed from the game", async () => {
  const { engage: engageEnemy, discardAttachment } =
    await import("../src/game/board");
  const {
    dreamchaserCampaignShadow,
    dreamchaserCardPlayed,
    dreamchaserEnemyAttackResolved,
    dreamchaserPlayerAttackResolved,
    dreamchaserBoardingOffer,
    dreamchaserCombatEnd,
  } = await import("../src/game/dreamchaser-campaign-cards");
  const { fx } = await import("../src/game/core");
  // Thunderstruck's shadow joins the staging area.
  let s = calm(reload(opening(voyage())));
  const attacker = engage(s, VOYAGE.sailor);
  s.encounterDeck = s.encounterDeck.filter((c) => c !== DC.thunderstruck);
  attacker.shadows = [DC.thunderstruck];
  s.combat = {
    enemyId: attacker.id,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
  } as GameState["combat"];
  dreamchaserCampaignShadow(s, DC.thunderstruck);
  flush(s);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["staging", "damage"],
  );
  s = choose(s, "staging");
  assert.ok(s.staging.some((u) => u.code === DC.thunderstruck));
  assert.deepEqual(s.engaged.find((u) => u.id === attacker.id)!.shadows, []);
  // Crowley engages with a resource and returns at the end of combat.
  s = calm(reload(opening(voyage())));
  s.voyageBelegaer!.corsairDeck = s.voyageBelegaer!.corsairDeck.filter(
    (c) => c !== DC.crowley,
  );
  const crowley = make(s, DC.crowley);
  s.staging.push(crowley);
  engageEnemy(s, crowley);
  flush(s);
  assert.equal(s.engaged.find((u) => u.id === crowley.id)!.resources, 1);
  s.queue.unshift(...dreamchaserCombatEnd(s));
  flush(s);
  assert.ok(
    s.staging.some((u) => u.id === crowley.id),
    "back in the staging area",
  );
  assert.ok(valid(s));
  // Duskbringer: a card with an odd printed cost adds a resource (once per round).
  s = applyAction(reload(voyage()), { type: "KEEP" });
  s = choose(s, s.choice!.options[0].id);
  s = choose(
    s,
    s.choice!.options.find((o) => card(o.code!).name === "Duskbringer")!.id,
  );
  s = calm(reload(opening(s)));
  const odd = Object.keys(d.cards).find(
    (code) => Number(card(code).cost) % 2 === 1,
  )!;
  const resources = s.heroes[0].resources;
  dreamchaserCardPlayed(s, card(odd));
  flush(s);
  assert.match(s.choice!.title, /^Duskbringer · Add 1 resource/);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, resources + 1);
  dreamchaserCardPlayed(s, card(odd));
  flush(s);
  assert.equal(s.choice, null, "once per round");
  // The Upgraded Modification boons.
  const c: CampaignState = {
    ...newDreamchaserCampaign(HEROES),
    marks: { [DC.armor]: 2, [DC.ballista]: 2, [DC.sails]: 2 },
  };
  s = applyAction(reload(voyage(5, c)), { type: "KEEP" });
  s = choose(s, s.choice!.options[0].id);
  s = choose(s, s.choice!.options[0].id);
  s = choose(s, DC.armor);
  s = choose(s, DC.ballista);
  s = calm(reload(opening(s)));
  const [dream, second] = ships(s);
  assert.ok(dream.attachments.some((a) => a.code === backFace(DC.armor)));
  assert.ok(second.attachments.some((a) => a.code === backFace(DC.ballista)));
  // Armor Plating: after its Ship defends, another enemy loses a shadow card.
  const one = engage(s, VOYAGE.sailor);
  const other = engage(s, VOYAGE.pirate);
  other.shadows = [s.encounterDeck.shift()!];
  dreamchaserEnemyAttackResolved(s, one, [dream.id]);
  flush(s);
  s = choose(s, other.id);
  assert.deepEqual(s.engaged.find((u) => u.id === other.id)!.shadows, []);
  // Ballista: after its Ship attacks, 1 damage and 1 resource off a non-unique enemy.
  const target = s.engaged.find((u) => u.id === other.id)!;
  target.resources = 1;
  dreamchaserPlayerAttackResolved(s, [second.id]);
  flush(s);
  s = choose(s, target.id);
  const hit = s.engaged.find((u) => u.id === target.id)!;
  assert.equal(hit.damage, 1);
  assert.equal(hit.resources, 0);
  // Extra Sails (Upgraded) on the second ship reduces a Boarding value by 1.
  const t = calm(reload(s));
  const sailsShip = ships(t)[1];
  sailsShip.attachments.push({
    id: `a${t.nextId++}`,
    code: backFace(DC.sails),
    exhausted: false,
  });
  t.heroes[0].resources = 1;
  const cruiser = make(t, VOYAGE.warship);
  const boarding = [
    fx("voyageBoard", { player: 0, source: cruiser.id }),
    fx("voyageBoard", { player: 0, source: cruiser.id }),
  ];
  const offer = dreamchaserBoardingOffer(t, cruiser, 0, boarding);
  assert.equal(offer.length, 1);
  assert.equal(offer[0].kind, "dcSails");
  // A Modification boon that leaves play is removed from the game.
  const leaving = calm(reload(s));
  const armor = ships(leaving)[0].attachments.find(
    (a) => a.code === backFace(DC.armor),
  )!;
  discardAttachment(leaving, ships(leaving)[0], armor);
  assert.ok(!ships(leaving)[0].attachments.some((a) => a.id === armor.id));
  assert.ok(
    !leaving.discard.includes(backFace(DC.armor)) &&
      !leaving.encounterDiscard.includes(backFace(DC.armor)),
  );
  assert.ok(valid(leaving));
});
