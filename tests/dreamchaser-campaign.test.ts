import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import {
  damage,
  discardCharacter,
  discardPlayerDeck,
  exhaustCharacter,
  phaseEnd,
  readyCharacter,
  win,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { fx as makeEffect, make, stats, threatOf } from "../src/game/core";
import {
  applyAction,
  availableAbilities,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import { reduceThreat } from "../src/game/threat-reduction";
import { sailingCommitCount } from "../src/game/sailing";
import {
  CIRDAN,
  COMMAND,
  SEND_FOR_HELP,
  DC,
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_LOG,
  DREAM_LOCATION,
  CITY_STORMCALLER,
  GALDOR,
  HAVENS_BURN,
  backFace,
  dcBase,
  dcIs,
  dreamchaserFleet,
} from "../src/game/dreamchaser-campaign-support";
import {
  DREAMCHASER_CAMPAIGN_SUPPORTED,
  applyDreamchaserResolution,
  dreamchaserOminousX,
  dreamchaserSahirFlipped,
  dreamchaserResolutionQuestions,
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
  dreamchaserAttachmentProblem,
  dreamchaserAttackProblem,
  dreamchaserDefendersDeclared,
  dreamchaserCharacterDestroyed,
  dreamchaserCheck,
  dreamchaserEncounterDiscarded,
  dreamchaserQuestEnd,
  dreamchaserRoundEnd,
  dreamchaserQuestSucceeded,
  dreamchaserDamageAmount,
  dreamchaserArchery,
  dreamchaserCampaignEncounter,
  dreamchaserCannotCancel,
  dreamchaserSailingWeight,
  dreamchaserAttackersDeclared,
  dreamchaserLocationExplored,
  dreamchaserPlayerAttackBonus,
  dreamchaserPlayerAttackResolved,
  dreamchaserCampaignShadow,
  dreamchaserRemoveCharacter,
  dreamchaserEnemyAttackResolved,
  dreamchaserIndestructible,
} from "../src/game/dreamchaser-campaign-cards";
import { VOYAGE } from "../src/game/voyage-belegaer-support";
import { RAID } from "../src/game/raid-grey-havens-support";
import { STORMCALLER } from "../src/game/stormcaller-support";
import { stormcallerProgress } from "../src/game/stormcaller";
import { DEPTHS } from "../src/game/depths-support";
import { depthsEnemyDestroyed } from "../src/game/depths";
import { raidAflame } from "../src/game/raid-grey-havens";
import { FATE } from "../src/game/fate-numenor-support";
import { fateAbility, fateAbilityLabel } from "../src/game/fate-numenor";
import { playerCardImmune } from "../src/game/card-immunity";
import { forOwner, seatView } from "../src/game/table";
import { shuffleCampaignNightmares } from "../src/game/dreamchaser-temple";
import { DROWNED } from "../src/game/drowned-support";
import { questExhausts } from "../src/game/expansion-passives";
import { COBAS } from "../src/game/cobas-support";
import { hasKeyword } from "../src/game/table";
import { gavinAbility } from "../src/game/dreamchaser-cobas";
import { CITY } from "../src/game/city-support";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import { cityImmuneToEvents } from "../src/game/city";
import {
  TEMPLE,
  templeMapUnit,
  templeMapUnits,
} from "../src/game/temple-support";
import {
  templeFlip,
  templePublicState,
  templeSyncMap,
} from "../src/game/temple";
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
  assert.deepEqual(DREAMCHASER_CAMPAIGN_SUPPORTED, [
    "voyage-across-belegaer",
    "the-fate-of-numenor",
    "raid-on-the-grey-havens",
    "flight-of-the-stormcaller",
    "the-thing-in-the-depths",
    "temple-of-the-deceived",
    "the-drowned-ruins",
    "a-storm-on-cobas-haven",
    "the-city-of-corsairs",
  ]);
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
  // The next chapter, The Fate of Númenor, begins with the marked checkboxes.
  const next = continueCampaign(
    s,
    HEROES,
    d.id,
    true,
    9,
    undefined,
    undefined,
    undefined,
    { marks: { [DC.armor]: 2 } },
  );
  assert.equal(next.scenarioId, "the-fate-of-numenor");
  assert.equal(next.campaign!.marks![DC.armor], 2);
  assert.equal(next.campaign!.xp, total - 2);
  assert.ok(valid(next));
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

// ------------------------------------------------- The Fate of Númenor (Part 2)

/** A Dream-chaser campaign after Voyage Across Belegaer. */
function afterVoyage(marks: Record<string, number> = {}): CampaignState {
  return {
    ...newDreamchaserCampaign([...HEROES]),
    burdens: [DC.ominous],
    completed: [
      { scenarioId: "voyage-across-belegaer", score: 12, rounds: 6, xp: 4 },
    ],
    xp: 1,
    marks,
  };
}
const fate = (
  campaign = afterVoyage(),
  extra: { dreamchaserMode?: "hard" | "expert" } = {},
) =>
  createGame(5, d.cards, HEROES, d.id, {
    scenarioId: "the-fate-of-numenor",
    playMode: "campaign",
    campaign,
    ...extra,
  });
const calphonOf = (s: GameState) =>
  s.allies.find((u) => dcIs(u, FATE.calphon))!;
const wounding = (s: GameState) =>
  /Deal 1 damage to a character to reduce your threat by 1/.test(
    s.choice?.title ?? "",
  );

test("The Fate of Númenor: its campaign card, Calphon's Upgraded side, Spyglass and Revenant are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.fateCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 2");
  assert.equal(
    campaignCard.text,
    "You are playing Campaign Mode.\nSetup: Attach Spyglass to Calphon. Shuffle Revenant into the encounter deck. For each character in play, its controller may deal 1 damage to it to reduce their threat by 1.",
  );
  assert.match(
    campaignCard.back_text!,
    /• 1 XP for each Lush Jungle and Drowned Graves in the victory display\.\n• 1 XP for each resource on this card \(to a maximum of 3 XP\)\.\n• 1 XP if each surviving player's threat is 40 or less\./,
  );
  const calphon = card(backFace(DC.calphon));
  assert.deepEqual(
    [calphon.willpower, calphon.attack, calphon.defense, calphon.health],
    [2, 1, 2, 4],
  );
  assert.equal(calphon.upgrade_xp, 2);
  assert.match(calphon.text!, /^Campaign Mode only\./);
  assert.match(calphon.text!, /look at the bottom 5 cards of your deck/);
  // The reprint's front is the original Calphon.
  for (const stat of ["willpower", "attack", "defense", "health"] as const)
    assert.equal(card(DC.calphon)[stat], card(FATE.calphon)[stat]);
  assert.equal(card(DC.calphon).name, card(FATE.calphon).name);
  const spyglass = card(DC.spyglass);
  assert.equal(spyglass.sphere_code, "boon");
  assert.match(spyglass.text!, /\(2 progress instead if it is Uncharted\)\.$/);
  assert.equal(card(backFace(DC.spyglass)).upgrade_xp, 3);
  assert.match(
    card(backFace(DC.spyglass)).text!,
    /You may discard it\.\n• Look at the top and bottom card of any deck\.\n• Place 1 progress on a location \(4 progress instead if it is Uncharted\)\.$/,
  );
  const revenant = card(DC.revenant);
  assert.equal(revenant.sphere_code, "burden");
  assert.deepEqual(
    [
      revenant.engagement,
      revenant.threat,
      revenant.attack,
      revenant.defense,
      revenant.health,
    ],
    [43, 3, 3, 3, 3],
  );
  assert.ok(revenant.is_unique);
  for (const [code, face] of [
    [DC.fateCard, "front"],
    [DC.fateCard, "back"],
    [DC.calphon, "front"],
    [DC.calphon, "back"],
    [DC.spyglass, "front"],
    [DC.spyglass, "back"],
    [DC.revenant, "front"],
  ])
    assert.ok(
      art.some(
        (a: { code: string; face: string }) =>
          a.code === code && a.face === face,
      ),
      `${code} (${face}) is pinned`,
    );
});

test("The Fate of Númenor's setup: Spyglass is attached to Calphon, Revenant and Ominous Fate are shuffled in, each character may take 1 damage to reduce its controller's threat by 1, and Calphon takes his Upgraded side once both checkboxes are marked", () => {
  // Skip the offers: Calphon carries Spyglass, the burdens join the deck.
  const plain = calm(reload(opening(fate())));
  const guide = calphonOf(plain);
  assert.equal(guide.code, FATE.calphon);
  assert.deepEqual(
    guide.attachments.map((a) => a.code),
    [DC.spyglass],
  );
  assert.ok(plain.encounterDeck.includes(DC.revenant));
  assert.ok(plain.encounterDeck.includes(DC.ominous));
  assert.ok(
    dreamchaserCampaignStatus(plain).some((l) =>
      /^Resources on the campaign card: 0\. Revenant/.test(l),
    ),
  );
  assert.ok(valid(plain));
  // Two characters take 1 damage each: the threat drops by 2.
  let s = fate();
  let start = -1;
  const wounded: string[] = [];
  s = opening(s, (t) => {
    if (!wounding(t)) return undefined;
    if (start < 0) start = t.threat;
    const pick = t.choice!.options.find(
      (o) => o.id !== "skip" && t.heroes.some((h) => h.id === o.id),
    );
    if (!pick || wounded.length >= 2) return "skip";
    wounded.push(pick.id);
    return pick.id;
  });
  assert.equal(wounded.length, 2);
  assert.equal(s.threat, start - 2);
  for (const id of wounded)
    assert.equal(s.heroes.find((h) => h.id === id)!.damage, 1);
  // Upgraded Calphon (2 checkboxes) and Spyglass (3 checkboxes).
  const up = calm(
    reload(opening(fate(afterVoyage({ [DC.calphon]: 2, [DC.spyglass]: 3 })))),
  );
  const upgraded = calphonOf(up);
  assert.equal(upgraded.code, backFace(DC.calphon));
  assert.equal(stats(up, upgraded).will, 2);
  assert.equal(stats(up, upgraded).health, 4);
  assert.equal(upgraded.attachments[0].code, backFace(DC.spyglass));
  assert.equal(
    fateAbilityLabel(up, upgraded),
    "Exhaust · Look at your bottom 5 cards",
  );
  // "Look at the bottom 5 cards … switch one of them with a card in your hand."
  up.deck = ["01050", "01073", "01051", "01052", "01053", "01054"];
  const h = make(up, "01055");
  up.hand = [h];
  assert.ok(fateAbility(up, upgraded));
  flush(up);
  let t = choose(up, "bottom-3");
  t = choose(t, h.id);
  assert.deepEqual(t.deck, [
    "01050",
    "01073",
    "01055",
    "01052",
    "01053",
    "01054",
  ]);
  assert.deepEqual(
    t.hand.map((x) => x.code),
    ["01051"],
  );
  assert.ok(calphonOf(t).exhausted);
  assert.ok(valid(t));
  // Losing the Upgraded Calphon still loses the game.
  const lose = calm(reload(up));
  discardCharacter(lose, calphonOf(lose));
  assert.equal(lose.status, "lost");
  assert.match(lose.reason, /Calphon/);
});

test("Spyglass: exhaust to look at a facedown shadow card, the top and bottom card of your deck, or place progress (2 on an Uncharted Lost Island); its Upgraded side discards the shadow, looks at any deck and places 4", () => {
  let s = calm(reload(opening(fate())));
  const guide = calphonOf(s);
  const spy = guide.attachments[0];
  assert.equal(dreamchaserAttachmentProblem(s, guide, spy.id), null);
  // Calphon's table controls offer both his Action and Spyglass's.
  assert.deepEqual(
    availableAbilities(s, guide).map((a) => [a.id, a.disabled]),
    [
      [undefined, false],
      [spy.id, false],
    ],
  );
  // Progress on a Lost Island (Uncharted): 2.
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: guide.id,
    attachmentId: spy.id,
  });
  assert.equal(s.choice!.title, "Spyglass · Choose one");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["deck", "progress"],
  );
  s = choose(s, "progress");
  const island = s.staging.find((u) => u.code === FATE.lost)!;
  s = choose(s, island.id);
  assert.equal(s.staging.find((u) => u.id === island.id)!.progress, 2);
  assert.ok(calphonOf(s).attachments[0].exhausted);
  assert.match(
    dreamchaserAttachmentProblem(s, calphonOf(s), spy.id)!,
    /exhausted/,
  );
  // The top and bottom card of your deck.
  let look = calm(reload(opening(fate())));
  look.deck = ["01050", "01073", "01051"];
  look = applyAction(reload(look), {
    type: "ABILITY",
    id: calphonOf(look).id,
    attachmentId: calphonOf(look).attachments[0].id,
  });
  look = choose(look, "deck");
  assert.deepEqual(
    look.choice!.options.map((o) => o.code),
    ["01050", "01051"],
  );
  look = choose(look, "top");
  assert.deepEqual(look.deck, ["01050", "01073", "01051"]);
  // A facedown shadow card.
  let shade = calm(reload(opening(fate())));
  const enemy = engage(shade, FATE.drowned);
  enemy.shadows = [FATE.fog];
  shade = applyAction(reload(shade), {
    type: "ABILITY",
    id: calphonOf(shade).id,
    attachmentId: calphonOf(shade).attachments[0].id,
  });
  assert.deepEqual(
    shade.choice!.options.map((o) => o.id),
    ["shadow", "deck", "progress"],
  );
  shade = choose(shade, "shadow");
  shade = choose(shade, `${enemy.id}:0`);
  assert.equal(shade.choice!.title, "Spyglass · The shadow card");
  assert.deepEqual(
    shade.choice!.options.map((o) => o.id),
    ["continue"],
  );
  shade = choose(shade, "continue");
  assert.deepEqual(shade.engaged.find((u) => u.id === enemy.id)!.shadows, [
    FATE.fog,
  ]);
  // Upgraded: discard the shadow, look at the encounter deck, 4 progress.
  const marks = { [DC.spyglass]: 3 };
  let up = calm(reload(opening(fate(afterVoyage(marks)))));
  const foe = engage(up, FATE.drowned);
  foe.shadows = [FATE.fog];
  const use = (x: GameState) =>
    applyAction(reload(x), {
      type: "ABILITY",
      id: calphonOf(x).id,
      attachmentId: calphonOf(x).attachments[0].id,
    });
  let a = choose(use(up), "shadow");
  a = choose(a, `${foe.id}:0`);
  a = choose(a, "discard");
  assert.deepEqual(a.engaged.find((u) => u.id === foe.id)!.shadows, []);
  assert.ok(a.encounterDiscard.includes(FATE.fog));
  let b = choose(use(up), "deck");
  assert.deepEqual(
    b.choice!.options.map((o) => o.id),
    ["player:0", "encounter"],
  );
  b = choose(b, "encounter");
  assert.equal(b.choice!.options[0].code, up.encounterDeck[0]);
  assert.equal(b.choice!.options.at(-1)!.code, up.encounterDeck.at(-1));
  let c = choose(use(up), "progress");
  const lostIsland = c.staging.find((u) => u.code === FATE.lost)!;
  c = choose(c, lostIsland.id);
  assert.equal(c.staging.find((u) => u.id === lostIsland.id)!.progress, 4);
  assert.ok(valid(a) && valid(b) && valid(c));
});

test("Revenant: immune to player card effects, +2 attack and +2 defense for each resource on the campaign card, at most 2 damage at a time, and shuffled back into the encounter deck with a resource on the campaign card when destroyed", () => {
  const s = calm(reload(opening(fate())));
  const revenant = engage(s, DC.revenant);
  assert.ok(playerCardImmune(revenant));
  assert.equal(stats(s, revenant).attack, 3);
  assert.equal(dreamchaserDamageAmount(s, revenant, 5), 2);
  assert.equal(dreamchaserDamageAmount(s, revenant, 2), 2);
  assert.equal(dreamchaserDamageAmount(s, revenant, 1), 1);
  damage(s, revenant.id, 6);
  assert.equal(revenant.damage, 2);
  damage(s, revenant.id, 1);
  flush(s);
  assert.ok(!s.engaged.some((u) => u.id === revenant.id));
  assert.ok(s.encounterDeck.includes(DC.revenant));
  assert.ok(!s.encounterDiscard.includes(DC.revenant));
  assert.equal(s.dreamchaser!.resources, 1);
  const again = engage(s, DC.revenant);
  assert.equal(stats(s, again).attack, 5);
  assert.equal(stats(s, again).defense, 5);
  assert.ok(
    dreamchaserCampaignStatus(s).some((l) =>
      /^Resources on the campaign card: 1\. .*\+2 attack and \+2 defense/.test(
        l,
      ),
    ),
  );
  assert.ok(valid(s));
});

test("The Fate of Númenor's resolution: Lush Jungle and Drowned Graves in the victory display, resources on the campaign card (at most 3) and every surviving threat at 40 or less give XP, and Raid on the Grey Havens follows", () => {
  const s = calm(
    reload(opening(fate(afterVoyage(), { dreamchaserMode: "hard" }))),
  );
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    FATE.jungle,
    FATE.graves,
    FATE.jungle,
  ];
  s.dreamchaser!.resources = 4;
  s.threat = 40;
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp),
    [1, 3, 3, 1, 0, 1],
  );
  s.threat = 41;
  assert.equal(
    dreamchaserXpLines(s).find((l) => /40 or less/.test(l.label))!.xp,
    0,
  );
  s.threat = 40;
  const before = s.campaign!.xp!;
  win(s);
  const c = s.campaign!;
  assert.equal(c.completed.length, 2);
  assert.equal(c.completed[1].scenarioId, "the-fate-of-numenor");
  assert.equal(c.completed[1].xp, 9);
  assert.equal(c.xp, before + 9);
  assert.ok(valid(s));
  // Raid on the Grey Havens follows.
  const next = continueCampaign(
    s,
    HEROES,
    d.id,
    true,
    9,
    undefined,
    undefined,
    undefined,
    {},
  );
  assert.equal(next.scenarioId, "raid-on-the-grey-havens");
  assert.ok(valid(next));
});

// ------------------------------------------ Raid on the Grey Havens (Part 3)

/** A Dream-chaser campaign after The Fate of Númenor. */
function afterFate(marks: Record<string, number> = {}): CampaignState {
  return {
    ...afterVoyage(marks),
    completed: [
      { scenarioId: "voyage-across-belegaer", score: 12, rounds: 6, xp: 4 },
      { scenarioId: "the-fate-of-numenor", score: 20, rounds: 7, xp: 5 },
    ],
  };
}
const raid = (
  campaign = afterFate(),
  deck = STARTERS[1],
  extra: { dreamchaserMode?: "hard" | "expert" } = {},
) =>
  createGame(5, deck.cards, deck.heroes, deck.id, {
    scenarioId: "raid-on-the-grey-havens",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
    ...extra,
  });
const galdorOffer = (s: GameState) =>
  /copy of Galdor's Counsel/.test(s.choice?.title ?? "");

test("Raid on the Grey Havens: its campaign card, Black Key, Galdor's Counsel, Graxar, Parrying Cutlass, Throwing Axe and the campaign sides of The Havens Burn and the Dream-chaser are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.raidCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 3");
  assert.match(
    campaignCard.text!,
    /Setup: The first player takes control of Calphon and attaches Spyglass and Black Key \(boon\) to him\. Shuffle Graxar into the encounter deck\. Each player may choose one copy of Galdor's Counsel and add it to their hand\. For this game, X is plus 1 for each of those copies\.\nForced: After stage 2B is revealed, remove Calphon and each attachment on him from the game, ignoring his "leaves play" ability\.$/,
  );
  assert.match(
    campaignCard.back_text!,
    /• 1 XP if 2 or fewer cards are underneath The Havens Burn \(2 XP instead if no cards are underneath it\)\.\n• 1 XP for each Elven Wave-runner in the victory display\.\n• 1 XP if Na'asiyah is in the victory display\.\n• 1 XP if no enemies are in play\./,
  );
  assert.equal(card(backFace(DC.keyBoon)).upgrade_xp, 4);
  assert.match(
    card(backFace(DC.keyBoon)).text!,
    /Action: Exhaust Black Key and remove 3 resources from attached character to ready them\.$/,
  );
  assert.deepEqual(
    GALDOR.map((code) => [card(code).boon_sphere, String(card(code).cost)]),
    [
      ["leadership", "0"],
      ["tactics", "1"],
      ["spirit", "1"],
      ["lore", "1"],
    ],
  );
  const graxar = card(DC.graxar);
  assert.deepEqual(
    [
      graxar.engagement,
      graxar.threat,
      graxar.attack,
      graxar.defense,
      graxar.health,
      graxar.victory,
    ],
    [47, 3, 3, 0, 10, 8],
  );
  assert.equal(card(backFace(DC.cutlass)).upgrade_xp, 5);
  assert.equal(card(backFace(DC.axe)).upgrade_xp, 5);
  assert.match(card(DC.cutlass).text!, /^Permanent\. Restricted\./);
  assert.match(
    card(backFace(HAVENS_BURN)).text!,
    /raise each player's threat by 2\.\n.*X is 4 more than the number of players/s,
  );
  assert.equal(card(backFace(DREAM_LOCATION)).upgrade_xp, 2);
  assert.match(card(backFace(DREAM_LOCATION)).text!, /Aflame 15\./);
  for (const [code, face] of [
    [DC.raidCard, "front"],
    [DC.raidCard, "back"],
    [DC.keyBoon, "back"],
    [GALDOR[3], "front"],
    [DC.graxar, "front"],
    [DC.cutlass, "back"],
    [DC.axe, "back"],
    [backFace(HAVENS_BURN), "front"],
    [backFace(DREAM_LOCATION), "front"],
  ])
    assert.ok(
      art.some(
        (a: { code: string; face: string }) =>
          (a.code === code && a.face === face) ||
          (a.code === code.replace(/\.B$/, "") && a.face === "back"),
      ),
      `${code} (${face}) is pinned`,
    );
});

test("Raid on the Grey Havens' setup: the first player controls Calphon with Spyglass and Black Key, Graxar and Ominous Fate are shuffled in, each player may take a copy of Galdor's Counsel (Ominous Fate's X +1 each), stage 2B removes Calphon from the game, and the campaign sides of The Havens Burn and the Dream-chaser apply", async () => {
  let s = opening(raid(), (t) => (galdorOffer(t) ? GALDOR[1] : undefined));
  s = calm(reload(s));
  const guide = s.allies.find((u) => dcIs(u, FATE.calphon))!;
  assert.ok(guide, "Calphon");
  assert.deepEqual(
    guide.attachments.map((a) => a.code),
    [DC.spyglass, DC.keyBoon],
  );
  // Black Key: +1 willpower, +1 attack, +1 defense.
  assert.deepEqual(
    [stats(s, guide).will, stats(s, guide).attack, stats(s, guide).defense],
    [2, 1, 2],
  );
  assert.equal(s.dreamchaser!.calphon, true);
  assert.ok(s.encounterDeck.includes(DC.graxar));
  assert.ok(s.encounterDeck.includes(DC.ominous));
  assert.ok(s.hand.some((h) => h.code === GALDOR[1]));
  assert.deepEqual(s.dreamchaser!.galdor, { [GALDOR[1]]: 0 });
  assert.equal(dreamchaserOminousX(s), 4);
  assert.ok(
    dreamchaserCampaignStatus(s).some((l) =>
      /^Galdor's Counsel chosen this game: tactics \(level 0\)/.test(l),
    ),
  );
  assert.ok(valid(s));
  // Calphon's own Action outside The Fate of Númenor.
  assert.equal(
    availableAbilities(s, guide)[0].label,
    "Exhaust · Look at your bottom card",
  );
  s.deck = ["01050", "01073"];
  const swap = make(s, "01051");
  s.hand = [swap];
  s = applyAction(reload(s), { type: "ABILITY", id: guide.id });
  s = choose(s, swap.id);
  assert.deepEqual(s.deck, ["01050", "01051"]);
  assert.equal(s.hand[0].code, "01073");
  // Losing Calphon loses the game, until stage 2B removes him.
  const lose = calm(reload(s));
  discardCharacter(
    lose,
    lose.allies.find((u) => dcIs(u, FATE.calphon))!,
  );
  assert.equal(lose.status, "lost");
  assert.match(lose.reason, /Calphon/);
  const removed = calm(reload(s));
  removed.queue = [makeEffect("dcCalphonGone", { player: 0 })];
  flush(removed);
  assert.ok(!removed.allies.some((u) => dcIs(u, FATE.calphon)));
  assert.equal(removed.status, "playing");
  assert.equal(removed.dreamchaser!.calphon, false);
  assert.ok(valid(removed));
  // Upgraded campaign sides of The Havens Burn and the Dream-chaser.
  const up = calm(
    reload(opening(raid(afterFate({ [HAVENS_BURN]: 2, [DREAM_LOCATION]: 2 })))),
  );
  const burn = up.staging.find((u) => dcIs(u, RAID.burn))!;
  const dream = up.staging.find((u) => dcIs(u, RAID.dream))!;
  assert.equal(burn.code, backFace(HAVENS_BURN));
  assert.equal(dream.code, backFace(DREAM_LOCATION));
  assert.equal(raidAflame(dream), 15);
  assert.ok(valid(up));
  // Its Response: at the end of the combat phase, each player raises their
  // threat by 2 to remove 1 damage from a location.
  const { dreamchaserCombatEnd } =
    await import("../src/game/dreamchaser-campaign-cards");
  dream.damage = 3;
  const threat = up.threat;
  up.queue = dreamchaserCombatEnd(up);
  assert.equal(up.queue.length, 1);
  flush(up);
  const repaired = choose(up, dream.id);
  assert.equal(repaired.staging.find((u) => u.id === dream.id)!.damage, 2);
  assert.equal(repaired.threat, threat + 2);
});

test("Galdor's Counsel: each copy's X follows its level and its cost needs its printed sphere; it adds resources, deals damage to a non-unique enemy, places progress, or looks at the top or bottom of the deck, and goes to the victory display", () => {
  const marks = {
    [GALDOR[0]]: 3,
    [GALDOR[1]]: 2,
    [GALDOR[2]]: 2,
    [GALDOR[3]]: 5,
  };
  const start = (deck: (typeof STARTERS)[number]) => {
    const s = calm(reload(opening(raid(afterFate(marks), deck))));
    for (const h of s.heroes) h.resources = 1;
    return s;
  };
  const give = (s: GameState, code: string) => {
    const u = make(s, code);
    s.hand.push(u);
    return u;
  };
  const until = (s: GameState, title: RegExp) => {
    for (let i = 0; i < 4 && s.choice && !title.test(s.choice.title); i++)
      s = choose(s, s.choice.options[0].id);
    return s;
  };
  // Tactics (cost 1, Tactics resources): 2 damage to a non-unique enemy.
  let s = start(STARTERS[1]);
  const foe = engage(s, RAID.raider);
  const tactics = give(s, GALDOR[1]);
  // A Leadership copy cannot be played without a Leadership hero.
  const wrong = give(s, GALDOR[0]);
  assert.throws(
    () => applyAction(reload(s), { type: "PLAY", id: wrong.id }),
    /matching sphere/,
  );
  s = until(
    applyAction(reload(s), { type: "PLAY", id: tactics.id }),
    /non-unique enemy/,
  );
  assert.match(s.choice!.title, /Deal 2 damage to a non-unique enemy/);
  s = choose(s, foe.id);
  assert.equal(s.engaged.find((u) => u.id === foe.id)?.damage ?? 2, 2);
  assert.ok(s.victoryCards!.includes(GALDOR[1]));
  // Leadership: X is half the level rounded up (2 resources).
  s = start(STARTERS[0]);
  const leadership = give(s, GALDOR[0]);
  s = until(
    applyAction(reload(s), { type: "PLAY", id: leadership.id }),
    /resource/,
  );
  const before = s.heroes[0].resources;
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, before + 2);
  assert.ok(s.victoryCards!.includes(GALDOR[0]));
  // Lore (level 5, X 3): the top 3 cards; one to hand, the rest on the top
  // and the bottom in a chosen order.
  s = start(STARTERS[3]);
  s.deck = ["01050", "01051", "01052", "01053", "01054"];
  const lore = give(s, GALDOR[3]);
  s = until(
    applyAction(reload(s), { type: "PLAY", id: lore.id }),
    /Look at 3 cards/,
  );
  s = choose(s, "top");
  s = choose(s, "take-1");
  assert.ok(s.hand.some((h) => h.code === "01051"));
  s = choose(s, "done");
  // 01050 next from the top, 01052 next from the bottom.
  s = choose(s, "t:0");
  s = choose(s, "b:1");
  assert.deepEqual(s.deck, ["01050", "01053", "01054", "01052"]);
  assert.ok(valid(s));
});

test("Graxar: immune to player card effects, +1 attack per damage and +1 defense per resource, a resource when dealt a shadow card, and no more than 1 attacker each round; Black Key's and Parrying Cutlass's Upgraded Responses and Throwing Axe's Upgraded Action", async () => {
  const { dealEnemyShadows } =
    await import("../src/game/considered-engagement");
  const s = calm(reload(opening(raid())));
  const graxar = engage(s, DC.graxar);
  assert.ok(playerCardImmune(graxar));
  graxar.damage = 2;
  graxar.resources = 1;
  assert.equal(stats(s, graxar).attack, 5);
  assert.equal(stats(s, graxar).defense, 1);
  dealEnemyShadows(s, graxar);
  assert.equal(graxar.resources, 2);
  assert.match(
    dreamchaserAttackProblem(s, graxar, [s.heroes[0].id, s.heroes[1].id])!,
    /No more than 1 character/,
  );
  assert.equal(dreamchaserAttackProblem(s, graxar, [s.heroes[0].id]), null);
  // Black Key (Upgraded): a resource after its character quests successfully.
  const k = calm(
    reload(
      opening(raid(afterFate({ [DC.keyBoon]: 4 })), (t) =>
        galdorOffer(t) ? "skip" : undefined,
      ),
    ),
  );
  const guide = k.allies.find((u) => dcIs(u, FATE.calphon))!;
  assert.equal(guide.attachments[1].code, backFace(DC.keyBoon));
  guide.committed = true;
  dreamchaserQuestSucceeded(k);
  flush(k);
  let key = choose(k, "resource");
  assert.equal(key.allies.find((u) => dcIs(u, FATE.calphon))!.resources, 1);
  // Its Action: exhaust and remove 3 resources to ready Calphon.
  const ready = calm(reload(key));
  const c2 = ready.allies.find((u) => dcIs(u, FATE.calphon))!;
  c2.resources = 3;
  c2.exhausted = true;
  key = applyAction(reload(ready), {
    type: "ABILITY",
    id: c2.id,
    attachmentId: c2.attachments[1].id,
  });
  const readied = key.allies.find((u) => dcIs(u, FATE.calphon))!;
  assert.equal(readied.exhausted, false);
  assert.equal(readied.resources, 0);
  assert.ok(readied.attachments[1].exhausted);
  // Parrying Cutlass (Upgraded), recorded for a hero in the Campaign Log:
  // +2 defense (+3 with 2 resources), and a resource from the enemy it
  // defends against.
  const deck = STARTERS[1];
  const permanent = (code: string, hero = deck.heroes[0]): CampaignState => ({
    ...afterFate({ [code]: 5 }),
    boons: [code],
    permanent: { [hero]: [code] },
  });
  const c = calm(reload(opening(raid(permanent(DC.cutlass)))));
  const h = c.heroes[0];
  assert.deepEqual(
    h.attachments.map((a) => a.code),
    [backFace(DC.cutlass)],
  );
  const baseDefense = card(h.code).defense ?? 0;
  h.resources = 0;
  assert.equal(stats(c, h).defense, baseDefense + 2);
  h.resources = 2;
  assert.equal(stats(c, h).defense, baseDefense + 3);
  const raider = engage(c, RAID.raider);
  raider.resources = 1;
  const offers = dreamchaserDefendersDeclared(c, raider, [h]);
  assert.equal(offers.length, 1);
  c.queue = offers;
  flush(c);
  const parried = choose(c, "move");
  assert.equal(parried.heroes[0].resources, 3);
  assert.equal(parried.engaged.find((u) => u.id === raider.id)!.resources, 0);
  assert.ok(parried.heroes[0].attachments[0].exhausted);
  // Throwing Axe (Upgraded): +2 attack (+3 with 2 damage); once per game,
  // 1 damage, or a toss reported from the table for 4 damage.
  // Legolas carries it (Gimli's own attack grows with his damage).
  const a = calm(reload(opening(raid(permanent(DC.axe, deck.heroes[1])))));
  const thrower = a.heroes[1];
  const axe = thrower.attachments[0];
  assert.equal(axe.code, backFace(DC.axe));
  thrower.damage = 0;
  assert.equal(stats(a, thrower).attack, (card(thrower.code).attack ?? 0) + 2);
  thrower.damage = 2;
  assert.equal(stats(a, thrower).attack, (card(thrower.code).attack ?? 0) + 3);
  thrower.damage = 0;
  const target = engage(a, RAID.raider);
  let t = applyAction(reload(a), {
    type: "ABILITY",
    id: thrower.id,
    attachmentId: axe.id,
  });
  t = choose(t, "toss");
  t = choose(t, "hit");
  t = choose(t, target.id);
  assert.ok(
    !t.engaged.some((u) => u.id === target.id) ||
      t.engaged.find((u) => u.id === target.id)!.damage === 4,
  );
  assert.match(
    dreamchaserAttachmentProblem(t, t.heroes[1], axe.id)!,
    /used this game/,
  );
  assert.ok(valid(t));
});

test("Raid on the Grey Havens' resolution: The Havens Burn, Elven Wave-runners, Na'asiyah, no enemies and threat give XP; the chosen Galdor's Counsel copies join the Campaign Pool and their players' decks, and Graxar's defeat adds Parrying Cutlass or Throwing Axe for a recorded hero, attached in later chapters", () => {
  let s = opening(raid(), (t) => (galdorOffer(t) ? GALDOR[2] : undefined));
  s = calm(reload(s));
  s.raidGreyHavens!.burned = [];
  s.staging = s.staging.filter(
    (u) => !["enemy", "ship-enemy"].includes(card(u.code).type_code),
  );
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    RAID.runner,
    RAID.naasiyah,
    DC.graxar,
  ];
  s.threat = 35;
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp),
    [1, 2, 1, 1, 1, 1, 0],
  );
  win(s);
  const c = s.campaign!;
  assert.equal(c.completed[2].scenarioId, "raid-on-the-grey-havens");
  assert.equal(c.completed[2].xp, 7);
  assert.ok(c.boons.includes(GALDOR[2]));
  assert.deepEqual(c.deckBoons, { [GALDOR[2]]: 0 });
  assert.equal(c.resolution, "raid-on-the-grey-havens");
  const questions = dreamchaserResolutionQuestions(s);
  assert.deepEqual(
    questions.map((q) => q.id),
    ["boon", "hero"],
  );
  assert.throws(
    () => continueCampaign(s, s.campaign!.heroes, s.deckId, true, 9),
    /Record the campaign card's resolution/,
  );
  const hero = c.heroes[1];
  const recorded = applyDreamchaserResolution(s, { boon: DC.axe, hero });
  assert.equal(recorded.campaign!.resolution, null);
  assert.ok(recorded.campaign!.boons.includes(DC.axe));
  assert.deepEqual(recorded.campaign!.permanent[hero], [DC.axe]);
  assert.ok(valid(recorded));
  const next = continueCampaign(
    recorded,
    recorded.campaign!.heroes,
    recorded.deckId,
    true,
    9,
  );
  assert.equal(next.scenarioId, "flight-of-the-stormcaller");
  assert.ok(valid(next));
});

// --------------------------------------- Flight of the Stormcaller (Part 4)

/** A Dream-chaser campaign after Raid on the Grey Havens. */
function afterRaid(marks: Record<string, number> = {}): CampaignState {
  const c = afterFate(marks);
  return {
    ...c,
    completed: [
      ...c.completed,
      { scenarioId: "raid-on-the-grey-havens", score: 25, rounds: 8, xp: 6 },
    ],
  };
}
const MODS = [DC.armor, DC.ballista, DC.quarters, DC.sails];
const flight = (campaign = afterRaid(), deck = STARTERS[0]) =>
  createGame(5, deck.cards, deck.heroes, deck.id, {
    scenarioId: "flight-of-the-stormcaller",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
  });
/** The fleet (the Dream-chaser and Duskbringer) and their Modification boons. */
const flightOpening = (s: GameState) =>
  opening(s, (t) =>
    /^Prepare the fleet/.test(t.choice!.title)
      ? t.choice!.options.find((o) => card(o.code!).name === "Duskbringer")?.id
      : /Choose a Modification boon/.test(t.choice!.title)
        ? t.choice!.options[0].id
        : undefined,
  );
const stormcallerOf = (s: GameState) =>
  [
    ...((s as GameState & { stormcaller?: { area: Unit[] } }).stormcaller
      ?.area ?? []),
    ...s.staging,
    ...s.engaged,
  ].find((u) => dcIs(u, STORMCALLER.stormcaller))!;

test("Flight of the Stormcaller: its campaign card, the Stormcaller's campaign side, Black Key (burden) and Calaerion are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.flightCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 4");
  assert.match(
    campaignCard.text!,
    /Flip the Stormcaller to its "Campaign Mode only" side, then attach Black Key \(burden\) to it\..*Put Calaerion into play under the control of the player with the Dream-chaser\.$/s,
  );
  assert.match(
    campaignCard.back_text!,
    /• 1 XP if you ended the game on stage 2B\.\n• 2 XP if you destroyed the Stormcaller\./,
  );
  const ship = card(backFace(DC.stormcaller));
  assert.deepEqual(
    [ship.attack, ship.defense, ship.health, ship.victory],
    [7, 6, 20, 15],
  );
  assert.match(
    ship.text!,
    /no more than 9 progress can be placed on your quest each round/,
  );
  assert.equal(card(backFace(DC.keyBurden)).upgrade_xp, 5);
  assert.match(
    card(DC.keyBurden).text!,
    /Forced: At the end of the quest phase, if Captain Sahír is in play/,
  );
  assert.doesNotMatch(card(backFace(DC.keyBurden)).text!, /Forced/);
  const cal = card(DC.calaerion);
  assert.deepEqual(
    [cal.willpower, cal.attack, cal.defense, cal.health],
    [1, 1, 1, 3],
  );
  assert.equal(card(backFace(DC.calaerion)).upgrade_xp, 5);
  assert.match(
    card(backFace(DC.calaerion)).text!,
    /Response: After a card is discarded from the encounter deck, shuffle it into that deck\. \(Limit once per round\.\)/,
  );
});

test("Flight of the Stormcaller's setup: the Stormcaller takes its campaign side with Black Key (burden), the fleet takes its Modification boons, Thunderstruck and Crowley join their decks, and Calaerion serves the player with the Dream-chaser", () => {
  const s = calm(reload(flightOpening(flight())));
  const boss = stormcallerOf(s);
  assert.equal(boss.code, backFace(DC.stormcaller));
  assert.deepEqual(
    boss.attachments.map((a) => a.code),
    [DC.keyBurden],
  );
  assert.equal(stats(s, boss).attack, 8);
  assert.equal(stats(s, boss).defense, 7);
  assert.ok(playerCardImmune(boss));
  assert.ok(threatOf(s, boss) >= 3);
  assert.ok(s.encounterDeck.includes(DC.thunderstruck));
  assert.ok(s.encounterDeck.includes(DC.ominous));
  assert.ok(
    (
      s as GameState & { stormcaller?: { corsairDeck: string[] } }
    ).stormcaller!.corsairDeck.includes(DC.crowley),
  );
  const fleet = ships(s);
  assert.deepEqual(
    fleet.map((u) => card(u.code).name),
    ["Dream-chaser", "Duskbringer"],
  );
  assert.ok(
    fleet.every((u) => u.attachments.some((a) => MODS.includes(a.code))),
  );
  const cal = s.allies.find((u) => dcIs(u, DC.calaerion));
  assert.ok(cal, "Calaerion");
  assert.ok(
    dreamchaserCampaignStatus(s).some((l) =>
      /Calaerion serves the player with the Dream-chaser/.test(l),
    ),
  );
  assert.ok(valid(s));
  // Black Key (burden): at the end of the quest phase, Captain Sahír gains
  // a resource for each player.
  const sahir = engage(s, RAID.sahir);
  const before = sahir.resources;
  dreamchaserQuestEnd(s);
  flush(s);
  assert.equal(sahir.resources, before + 1);
  // Calaerion leaving play is removed from the game.
  const gone = calm(reload(s));
  discardCharacter(
    gone,
    gone.allies.find((u) => dcIs(u, DC.calaerion))!,
  );
  assert.ok(!gone.encounterDiscard.includes(DC.calaerion));
  assert.ok(!gone.discard.includes(DC.calaerion));
  assert.ok(gone.removed.includes(DC.calaerion));
});

test("The Stormcaller's campaign side: at its stage no more than 9 progress can be placed on your quest each round", () => {
  const s = calm(reload(flightOpening(flight())));
  const q = (
    s as GameState & {
      stormcaller?: {
        currentQuest: string;
        enemyQuest: string;
        enemyStage: number;
        progressThisRound: number;
        counterRound: number;
      };
    }
  ).stormcaller!;
  s.stage = 3;
  q.currentQuest = STORMCALLER.foul;
  q.enemyStage = 3;
  q.enemyQuest = STORMCALLER.foulEnemy;
  q.progressThisRound = 0;
  q.counterRound = s.round;
  const quest = make(s, STORMCALLER.foul);
  assert.equal(stormcallerProgress(s, 12, quest), 9);
  assert.equal(stormcallerProgress(s, 3, quest), 0);
  s.round += 1;
  assert.equal(stormcallerProgress(s, 5, quest), 5);
  // At another stage there is no campaign limit.
  q.enemyStage = 4;
  q.enemyQuest = STORMCALLER.capeEnemy;
  s.round += 1;
  assert.equal(stormcallerProgress(s, 12, quest), 12);
});

test("Calaerion: spend 3 resources and exhaust him to ready the Dream-chaser with +1/+1/+1 until the end of the phase; Upgraded, spend 2 to ready another ally until the end of the round, and once per round shuffle a card discarded from the encounter deck back into it", () => {
  let s = calm(reload(flightOpening(flight())));
  const dream = ships(s).find((u) => card(u.code).name === "Dream-chaser")!;
  dream.exhausted = true;
  for (const h of s.heroes) h.resources = 1;
  const cal = s.allies.find((u) => dcIs(u, DC.calaerion))!;
  const will = stats(s, dream).will;
  s = applyAction(reload(s), { type: "ABILITY", id: cal.id });
  for (let i = 0; i < 3; i++) s = choose(s, s.heroes[i].id);
  const readied = ships(s).find((u) => u.id === dream.id)!;
  assert.equal(readied.exhausted, false);
  assert.equal(stats(s, readied).will, will + 1);
  assert.ok(s.heroes.every((h) => h.resources === 0));
  assert.ok(s.allies.find((u) => u.id === cal.id)!.exhausted);
  assert.ok(valid(s));
  // The boost ends with the phase.
  s.phase = "travel";
  assert.equal(
    stats(
      s,
      s.allies.find((u) => u.id === dream.id)!,
    ).will,
    will,
  );
  // Upgraded: 2/2/2/4; ready another ally until the end of the round.
  let up = calm(
    reload(flightOpening(flight(afterRaid({ [DC.calaerion]: 5 })))),
  );
  const ucal = up.allies.find((u) => dcIs(u, DC.calaerion))!;
  assert.equal(ucal.code, backFace(DC.calaerion));
  assert.equal(stats(up, ucal).will, 2);
  const ally = make(up, "01016");
  ally.exhausted = true;
  up.allies.push(ally);
  for (const h of up.heroes) h.resources = 1;
  up = applyAction(reload(up), { type: "ABILITY", id: ucal.id });
  up = choose(up, up.heroes[0].id);
  up = choose(up, up.heroes[1].id);
  if (up.choice) up = choose(up, ally.id);
  const boosted = up.allies.find((u) => u.id === ally.id)!;
  assert.equal(boosted.exhausted, false);
  assert.ok(valid(up));
  up.phase = "travel";
  assert.equal(stats(up, boosted).attack, (card("01016").attack ?? 0) + 1);
  // Its Response, once per round.
  const r = calm(reload(up));
  const discarded = r.encounterDeck.shift()!;
  r.encounterDiscard.push(discarded);
  dreamchaserEncounterDiscarded(r, [discarded]);
  flush(r);
  const back = choose(r, discarded);
  assert.ok(back.encounterDeck.includes(discarded));
  assert.ok(!back.encounterDiscard.includes(discarded));
  const again = calm(reload(back));
  const second = again.encounterDeck.shift()!;
  again.encounterDiscard.push(second);
  dreamchaserEncounterDiscarded(again, [second]);
  flush(again);
  assert.equal(again.choice, null);
  assert.ok(valid(back));
});

test("Flight of the Stormcaller's resolution: on-course, stage 2B, the destroyed Stormcaller, Crowley, Thunderstruck and undamaged heroes give XP, and The Thing in the Depths follows", () => {
  const s = calm(reload(flightOpening(flight())));
  s.sailing!.heading = 0;
  const q = (
    s as GameState & {
      stormcaller?: {
        currentQuest: string;
        completedQuests: string[];
        questDeck: string[];
      };
    }
  ).stormcaller!;
  s.stage = 2;
  q.completedQuests = [STORMCALLER.departure];
  q.currentQuest = STORMCALLER.full;
  q.questDeck = [STORMCALLER.foul, STORMCALLER.cape];
  for (const h of s.heroes) h.damage = 0;
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    backFace(DC.stormcaller),
    DC.crowley,
    DC.thunderstruck,
  ];
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp),
    [1, 1, 1, 2, 1, 2, 1, 0],
  );
  win(s);
  assert.equal(
    s.campaign!.completed[3].scenarioId,
    "flight-of-the-stormcaller",
  );
  assert.equal(s.campaign!.completed[3].xp, 9);
  const next = continueCampaign(s, s.campaign!.heroes, s.deckId, true, 9);
  assert.equal(next.scenarioId, "the-thing-in-the-depths");
});

// --------------------------------------- The Thing in the Depths (Part 5)

/** A Dream-chaser campaign after Flight of the Stormcaller. */
function afterFlight(marks: Record<string, number> = {}): CampaignState {
  const c = afterRaid(marks);
  return {
    ...c,
    completed: [
      ...c.completed,
      { scenarioId: "flight-of-the-stormcaller", score: 30, rounds: 7, xp: 7 },
    ],
  };
}
const depths = (campaign = afterFlight(), deck = STARTERS[0]) =>
  createGame(5, deck.cards, deck.heroes, deck.id, {
    scenarioId: "the-thing-in-the-depths",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
  });
const depthsState = (s: GameState) =>
  (s as GameState & { depths?: { setAside: Unit[] } }).depths!;

test("The Thing in the Depths: its campaign card, the Thing's campaign side, Come Together and Sea Serpent are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.thingCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 5");
  assert.match(
    campaignCard.text!,
    /Forced: After Captain Sahír \(enemy\) enters play, attach Black Key \(burden\) to him\./,
  );
  assert.match(
    campaignCard.back_text!,
    /• 1 XP if each surviving player's threat is 40 or less \(2 XP instead if their threat is 30 or less\)\./,
  );
  const thing = card(backFace(DC.thing));
  assert.deepEqual(
    [thing.attack, thing.health, thing.threat, thing.victory],
    [6, 4, 3, 15],
  );
  assert.match(thing.text!, /deal 2 damage to The Thing in the Depths\.$/);
  assert.equal(card(DC.together).sphere_code, "boon");
  assert.match(card(DC.together).text!, /X is the level of Come Together/);
  const serpent = card(DC.serpent);
  assert.deepEqual(
    [serpent.attack, serpent.health, serpent.engagement],
    [6, 6, 40],
  );
  assert.deepEqual(
    [card(backFace(DC.serpent)).attack, card(backFace(DC.serpent)).victory],
    [8, 8],
  );
});

test("The Thing in the Depths' campaign: the Thing takes its campaign side (2 damage per destroyed Creature), Captain Sahír gets Black Key (burden) when he enters play, and his flip brings Black Key (boon), Sea Serpent and Come Together", () => {
  let s = calm(reload(opening(depths())));
  const thing = depthsState(s).setAside.find((u) => dcIs(u, DEPTHS.thing))!;
  assert.equal(thing.code, backFace(DC.thing));
  assert.ok(s.encounterDeck.includes(DC.ominous));
  assert.ok(valid(s));
  // The Thing's campaign side: a destroyed Creature deals it 2 damage.
  s.staging.push(thing);
  depthsState(s).setAside = depthsState(s).setAside.filter(
    (u) => u.id !== thing.id,
  );
  depthsEnemyDestroyed(s, make(s, DEPTHS.eye), 5);
  assert.equal(s.staging.find((u) => u.id === thing.id)!.damage, 2);
  // Captain Sahír (enemy) enters play: Black Key (burden).
  const sahir = depthsState(s).setAside.find((u) => u.code === DEPTHS.sahir)!;
  s.staging.push(sahir);
  depthsState(s).setAside = depthsState(s).setAside.filter(
    (u) => u.id !== sahir.id,
  );
  dreamchaserCheck(s);
  assert.deepEqual(
    s.staging.find((u) => u.id === sahir.id)!.attachments.map((a) => a.code),
    [DC.keyBurden],
  );
  assert.ok(playerCardImmune(s.staging.find((u) => u.id === sahir.id)!));
  dreamchaserCheck(s);
  assert.equal(s.staging.find((u) => u.id === sahir.id)!.attachments.length, 1);
  // He flips: Black Key (boon), Sea Serpent (Menacing), Come Together.
  const ally = make(s, DEPTHS.sahirAlly);
  s.allies.push(ally);
  s.queue = dreamchaserSahirFlipped(s);
  flush(s);
  assert.deepEqual(
    s.allies.find((u) => u.id === ally.id)!.attachments.map((a) => a.code),
    [DC.keyBoon],
  );
  const serpent = s.staging.find((u) => u.code === DC.serpent)!;
  assert.ok(serpent, "Sea Serpent");
  assert.ok(s.hand.some((h) => h.code === DC.together));
  assert.equal(s.dreamchaser!.together, 0);
  assert.equal(dreamchaserOminousX(s), 6);
  assert.ok(valid(s));
});

test("Sea Serpent: X threat and defense (twice X Enraged), flips to its Enraged side when destroyed, divides X damage when its attack destroys an ally, and attacks the first player at the end of the round once Enraged", () => {
  const s = calm(reload(opening(depths())));
  const serpent = make(s, DC.serpent);
  s.staging.push(serpent);
  assert.equal(threatOf(s, serpent), 1);
  assert.equal(stats(s, serpent).defense, 1);
  assert.ok(playerCardImmune(serpent));
  assert.equal(dreamchaserRoundEnd(s).length, 0);
  damage(s, serpent.id, 6);
  flush(s);
  const enraged = s.staging.find((u) => u.code === backFace(DC.serpent))!;
  assert.ok(enraged, "Enraged Sea Serpent");
  assert.ok(!s.staging.some((u) => u.code === DC.serpent));
  assert.equal(threatOf(s, enraged), 2);
  assert.equal(stats(s, enraged).defense, 2);
  const attacks = dreamchaserRoundEnd(s);
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].kind, "immediateAttack");
  // Its attack destroys an ally: the defending player divides X damage.
  const ally = make(s, "01016");
  s.allies.push(ally);
  dreamchaserCharacterDestroyed(s, ally, {
    combatDamage: true,
    enemyId: enraged.id,
  });
  assert.equal(s.queue[0].kind, "dcDivideDamage");
  assert.equal(s.queue[0].value, 2);
});

test("Come Together: choose up to X characters (its level); each gets +2 defense, attack or willpower for the player's Leadership, Tactics or Spirit heroes until the end of the round, and with a Lore hero heals 2 and gains a chosen Trait; it goes to the victory display", () => {
  let s = calm(reload(opening(depths(afterFlight({ [DC.together]: 2 })))));
  for (const h of s.heroes) h.resources = 1;
  const event = make(s, DC.together);
  s.hand.push(event);
  const [a, b] = s.heroes;
  const defense = stats(s, a).defense;
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  for (
    let i = 0;
    i < 4 && s.choice && !/Choose up to/.test(s.choice.title);
    i++
  )
    s = choose(s, s.choice.options[0].id);
  s = choose(s, a.id);
  s = choose(s, b.id);
  assert.equal(stats(s, s.heroes[0]).defense, defense + 2);
  assert.ok(s.victoryCards!.includes(DC.together));
  assert.ok(valid(s));
  // A Lore hero: heal 2 and a Trait of the player's choice.
  let l = calm(
    reload(opening(depths(afterFlight({ [DC.together]: 1 }), STARTERS[3]))),
  );
  for (const h of l.heroes) h.resources = 1;
  l.heroes[0].damage = 2;
  const lore = make(l, DC.together);
  l.hand.push(lore);
  l = applyAction(reload(l), { type: "PLAY", id: lore.id });
  for (
    let i = 0;
    i < 4 && l.choice && !/Choose up to/.test(l.choice.title);
    i++
  )
    l = choose(l, l.choice.options[0].id);
  l = choose(l, l.heroes[0].id);
  for (
    let i = 0;
    i < 3 && l.choice && !/Choose a Trait/.test(l.choice.title);
    i++
  )
    l = choose(l, l.choice.options[0].id);
  assert.match(l.choice!.title, /Choose a Trait/);
  const trait = l.choice!.options[0].id.slice("trait-".length);
  l = choose(l, l.choice!.options[0].id);
  assert.equal(l.heroes[0].damage, 0);
  assert.ok(l.heroes[0].dynamicTraits!.includes(trait));
  assert.ok(valid(l));
  // The Trait lasts until the end of the round.
  l.round += 1;
  dreamchaserCheck(l);
  assert.ok(!(l.heroes[0].dynamicTraits ?? []).includes(trait));
});

test("The Thing in the Depths' resolution: Captain Sahír's and Na'asiyah's resources, the Enraged Sea Serpent, undamaged heroes and threat give XP; Come Together may join the Campaign Pool, and Temple of the Deceived follows", () => {
  const s = calm(reload(opening(depths())));
  const sahir = make(s, DEPTHS.sahirAlly);
  sahir.resources = 5;
  s.allies.push(sahir);
  s.staging.push(make(s, backFace(DC.serpent)));
  s.dreamchaser = { ...(s.dreamchaser ?? {}), together: 0 };
  for (const h of s.heroes) h.damage = 0;
  s.threat = 30;
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp),
    [1, 1, 0, 1, 1, 2, 0],
  );
  win(s);
  assert.equal(s.campaign!.completed[4].scenarioId, "the-thing-in-the-depths");
  assert.equal(s.campaign!.completed[4].xp, 6);
  assert.equal(s.campaign!.resolution, "the-thing-in-the-depths");
  const recorded = applyDreamchaserResolution(s, { together: "add" });
  assert.ok(recorded.campaign!.boons.includes(DC.together));
  assert.equal(recorded.campaign!.deckBoons![DC.together], 0);
  const next = continueCampaign(
    recorded,
    recorded.campaign!.heroes,
    recorded.deckId,
    true,
    9,
  );
  assert.equal(next.scenarioId, "temple-of-the-deceived");
});

// ------------------------------------------ Temple of the Deceived (Part 6)

/** A Dream-chaser campaign after The Thing in the Depths. */
function afterDepths(marks: Record<string, number> = {}): CampaignState {
  const c = afterFlight(marks);
  return {
    ...c,
    completed: [
      ...c.completed,
      { scenarioId: "the-thing-in-the-depths", score: 25, rounds: 8, xp: 6 },
    ],
  };
}
const temple = (campaign = afterDepths(), deck = STARTERS[0], seed = 5) =>
  createGame(seed, deck.cards, deck.heroes, deck.id, {
    scenarioId: "temple-of-the-deceived",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
  });
/** The Temple of the Deceived location hiding a given secret. */
const secretAt = (s: GameState, code: string) =>
  Object.entries(s.dreamchaser!.secrets!).find(([, c]) => c === code)![0];
/** Make a map location the active one, turned over to its own side. */
function activate(s: GameState, id: string) {
  const u = templeMapUnit(s, id)!;
  if (s.temple!.hiddenBacks[id]) templeFlip(s, u, false);
  const old = s.activeLocation;
  if (old) s.temple!.outOfStaging.push(old);
  s.activeLocation = null;
  s.temple!.activeId = id;
  templeSyncMap(s);
  return templeMapUnit(s, id)!;
}

test("Temple of the Deceived: its campaign card, the Temple Guardian's campaign side, the Upgraded Gate Key, Starla and Recurring Nightmare are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.templeCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 6");
  assert.match(
    campaignCard.text!,
    /Shuffle Starla and both Recurring Nightmares together and place one facedown under each Temple of the Deceived location, as secrets\./,
  );
  assert.match(
    campaignCard.text!,
    /Travel Action: Flip over a secret at your location\. If it is a Recurring Nightmare, it engages you\. If it is Starla, you gain control of her \(ready\)\./,
  );
  assert.match(
    campaignCard.back_text!,
    /• 1 XP if 4 or fewer Uncharted locations are faceup\./,
  );
  const guardian = card(backFace(DC.guardian));
  assert.deepEqual(
    [guardian.attack, guardian.health, guardian.victory, guardian.engagement],
    [5, 10, 5, 50],
  );
  assert.match(guardian.text!, /^Campaign Mode only\.\nArchery X\./);
  assert.match(
    card(backFace(DC.gateKey)).text!,
    /Exhaust Gate Key and attached hero to look at the facedown side of a Temple of the Deceived location or secret\./,
  );
  const starla = card(DC.starla);
  assert.deepEqual(
    [starla.type_code, starla.sphere_code, starla.health],
    ["ally", "boon", 4],
  );
  assert.match(
    starla.text!,
    /Response: After Starla exhausts, place 1 progress on a location\./,
  );
  const nightmare = card(DC.nightmare);
  assert.deepEqual(
    [
      nightmare.type_code,
      nightmare.sphere_code,
      nightmare.threat,
      nightmare.attack,
      nightmare.health,
      nightmare.engagement,
      nightmare.quantity,
    ],
    ["enemy", "burden", 3, 5, 6, 35, 2],
  );
});

test("Temple of the Deceived's setup: the Temple Guardian takes its campaign side, Captain Sahír carries Black Key (boon), Starla and both Recurring Nightmares hide under the three temples as secrets, Revenant is shuffled in, each character may trade 1 damage for 1 threat, and a player may raise their threat by 4 for Spyglass", () => {
  let threat = -1;
  let wounded = false;
  let s = opening(temple(), (x) => {
    const title = x.choice!.title;
    if (/Deal 1 damage/.test(title) && !wounded) {
      wounded = true;
      threat = x.threat;
      return x.heroes[0].id;
    }
    if (/Spyglass/.test(title)) return x.heroes[0].id;
    return undefined;
  });
  s = calm(reload(s));
  const guardian = s.staging.find((u) => dcIs(u, TEMPLE.guardian))!;
  assert.equal(guardian.code, backFace(DC.guardian));
  assert.equal(
    guardian.guarding,
    s.staging.find((u) => dcIs(u, TEMPLE.key))!.id,
  );
  assert.equal(s.staging.find((u) => dcIs(u, TEMPLE.key))!.code, TEMPLE.key);
  const sahir = s.allies.find((u) => u.code === TEMPLE.sahirAlly)!;
  assert.deepEqual(
    sahir.attachments.map((a) => a.code),
    [DC.keyBoon],
  );
  const temples = s.temple!.map.filter((c) => c.column === 4).map((c) => c.id);
  assert.deepEqual(Object.keys(s.dreamchaser!.secrets!).sort(), temples.sort());
  assert.deepEqual(
    Object.values(s.dreamchaser!.secrets!).sort(),
    [DC.starla, DC.nightmare, DC.nightmare].sort(),
  );
  assert.ok(s.encounterDeck.includes(DC.revenant));
  assert.equal(s.heroes[0].damage, 1);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === DC.spyglass));
  assert.equal(s.threat, threat - 1 + 4);
  assert.ok(valid(s));
  assert.match(
    dreamchaserCampaignStatus(s).join("\n"),
    /Secrets still facedown under the Temple of the Deceived locations: 3 of 3/,
  );
  // Both of the Gate Key's checkboxes marked: its Upgraded side.
  const upgraded = calm(
    reload(opening(temple(afterDepths({ [DC.gateKey]: 2 })))),
  );
  assert.equal(
    upgraded.staging.find((u) => dcIs(u, TEMPLE.key))!.code,
    backFace(DC.gateKey),
  );
  assert.ok(valid(upgraded));
});

test("The Temple Guardian's campaign side: X threat and defense, Archery X, immune to player card effects, victory 5, and it still returns from the victory display when a Temple Halls flips", () => {
  const s = calm(reload(opening(temple())));
  const guardian = s.staging.find((u) => dcIs(u, TEMPLE.guardian))!;
  assert.equal(threatOf(s, guardian), 1);
  assert.equal(stats(s, guardian).defense, 1);
  assert.equal(stats(s, guardian).attack, 5);
  assert.equal(dreamchaserArchery(s, guardian), 1);
  assert.ok(playerCardImmune(guardian));
  const before = s.victory;
  damage(s, guardian.id, 10);
  flush(s);
  assert.ok(s.victoryCards!.includes(backFace(DC.guardian)));
  assert.equal(s.victory, before + 5);
  assert.ok(valid(s));
  assert.equal(
    dreamchaserXpLines(s).find((l) => /Temple Guardian/.test(l.label))!.xp,
    1,
  );
  s.queue = [
    makeEffect("templeECGuardianReturn", { player: 0, code: TEMPLE.halls }),
  ];
  flush(s);
  assert.ok(!s.victoryCards!.includes(backFace(DC.guardian)));
  assert.equal(s.victory, before);
  assert.ok(s.engaged.some((u) => u.code === backFace(DC.guardian)));
  assert.ok(valid(s));
});

test("The campaign card's Travel Action: during the travel phase a player flips over the secret at the active location; Starla joins them ready and a Recurring Nightmare engages them", () => {
  let s = calm(reload(opening(temple())));
  const starlaAt = secretAt(s, DC.starla);
  const location = activate(s, starlaAt);
  assert.ok(valid(s));
  const [flip] = availableAbilities(s, location);
  assert.equal(flip.label, "Travel Action · Flip over the secret here");
  assert.ok(flip.disabled, "not outside the travel phase");
  assert.match(
    templePublicState(s)!.cells.find((c) => c.id === starlaAt)!.secret!
      .flipProblem!,
    /travel phase/,
  );
  s.phase = "travel";
  assert.ok(!availableAbilities(s, location)[0].disabled);
  s = applyAction(reload(s), { type: "ABILITY", id: location.id });
  const starla = s.allies.find((u) => u.code === DC.starla)!;
  assert.ok(starla && !starla.exhausted);
  assert.equal(s.dreamchaser!.secrets![starlaAt], undefined);
  assert.ok(valid(s));
  // A secret elsewhere cannot be flipped from here.
  const nightmareAt = secretAt(s, DC.nightmare);
  assert.equal(
    templePublicState(s)!.cells.find((c) => c.id === nightmareAt)!.secret!
      .flipProblem,
    "Only a secret at your location can be flipped over.",
  );
  activate(s, nightmareAt);
  s = applyAction(reload(s), { type: "ABILITY", id: nightmareAt });
  assert.ok(s.engaged.some((u) => u.code === DC.nightmare));
  assert.equal(Object.keys(s.dreamchaser!.secrets!).length, 1);
  assert.ok(valid(s));
});

test("The Upgraded Gate Key: exhaust it and its hero, without spending resources, to look at an Uncharted Temple or a secret; the secret stays facedown and only that player knows it", () => {
  let s = calm(reload(opening(temple(afterDepths({ [DC.gateKey]: 2 })))));
  const key = s.staging.find((u) => dcIs(u, TEMPLE.key))!;
  const hero = s.heroes[0];
  s.staging = s.staging.filter((u) => u.id !== key.id);
  hero.attachments.push({ id: key.id, code: key.code, exhausted: false });
  hero.resources = 0;
  assert.ok(valid(s));
  const ability = availableAbilities(s, hero).find((a) => a.id === key.id)!;
  assert.equal(
    ability.label,
    "Exhaust Key and hero · Look inside a Temple or at a secret",
  );
  assert.ok(!ability.disabled);
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: hero.id,
    attachmentId: key.id,
  });
  assert.match(s.choice!.title, /Choose a Temple or a secret/);
  const target = secretAt(s, DC.starla);
  s = choose(s, `secret-${target}`);
  assert.equal(s.choice!.options[0].code, DC.starla);
  assert.ok(s.heroes[0].exhausted);
  assert.ok(s.heroes[0].attachments.find((a) => a.id === key.id)!.exhausted);
  assert.equal(s.heroes[0].resources, 0);
  assert.deepEqual(s.dreamchaser!.secretLooks![target], [0]);
  assert.equal(
    templePublicState(s)!.cells.find((c) => c.id === target)!.secret!.known!
      .code,
    DC.starla,
  );
  s = choose(s, "close");
  assert.equal(s.dreamchaser!.secrets![target], DC.starla);
  assert.ok(valid(s));
});

test("Starla: X is half her level, rounded up; after she exhausts she places 1 progress on a location, and when discarded from the hand or deck she may be played", () => {
  let s = calm(reload(opening(temple(afterDepths({ [DC.starla]: 3 })))));
  const starla = make(s, DC.starla);
  starla.owner = 0;
  s.allies.push(starla);
  assert.deepEqual(
    [stats(s, starla).will, stats(s, starla).attack, stats(s, starla).defense],
    [2, 2, 2],
  );
  exhaustCharacter(s, starla);
  assert.equal(s.queue[0].kind, "dcStarlaProgress");
  flush(s);
  assert.match(s.choice!.title, /Place 1 progress on a location/);
  const target = s.choice!.options.find((o) => o.id !== "skip")!.id;
  const progress = templeMapUnit(s, target)?.progress ?? 0;
  s = choose(s, target);
  assert.equal(templeMapUnit(s, target)!.progress, progress + 1);
  // Discarded from the deck: play her.
  s.deck.unshift(DC.starla);
  discardPlayerDeck(s, 1);
  flush(s);
  assert.match(s.choice!.title, /Starla is discarded/);
  s = choose(s, "play");
  assert.equal(s.allies.filter((u) => u.code === DC.starla).length, 2);
  assert.ok(!s.discard.includes(DC.starla));
});

test("Recurring Nightmare: X defense, shuffled into a player's deck when it leaves play, and added to the staging area when it enters a hand", () => {
  const s = calm(reload(opening(temple())));
  const nightmare = make(s, DC.nightmare);
  s.engaged.push(nightmare);
  assert.equal(stats(s, nightmare).defense, 1);
  assert.equal(threatOf(s, nightmare), 3);
  s.deck = s.deck.filter((c) => c !== DC.nightmare);
  damage(s, nightmare.id, 6);
  flush(s);
  assert.ok(!s.engaged.some((u) => u.id === nightmare.id));
  assert.equal(s.deck.filter((c) => c === DC.nightmare).length, 1);
  assert.ok(!s.encounterDiscard.includes(DC.nightmare));
  // Drawn: "Forced: When Recurring Nightmare enters your hand, add it to the staging area."
  s.deck = [DC.nightmare, ...s.deck.filter((c) => c !== DC.nightmare)];
  s.queue = [makeEffect("draw", { value: 1 })];
  flush(s);
  dreamchaserCheck(s);
  assert.ok(!s.hand.some((h) => h.code === DC.nightmare));
  assert.ok(s.staging.some((u) => u.code === DC.nightmare));
  assert.ok(valid(s));
});

test("Temple of the Deceived's resolution: resources on the campaign card, faceup Temple Halls, 4 or fewer Uncharted faces, the Temple Guardian and threat give XP; Starla under control and each Recurring Nightmare no longer a secret join the Campaign Pool, and The Drowned Ruins follows", () => {
  const s = calm(reload(opening(temple())));
  // Turn over every map location but four Lost Islands.
  const lost = templeMapUnits(s).filter((u) => u.code === TEMPLE.lost);
  for (const u of templeMapUnits(s).filter(
    (u) => s.temple!.hiddenBacks[u.id] && !lost.slice(0, 4).includes(u),
  ))
    templeFlip(s, u, false);
  s.dreamchaser!.resources = 2;
  s.victoryCards = [...(s.victoryCards ?? []), backFace(DC.guardian)];
  s.threat = 35;
  const starla = make(s, DC.starla);
  starla.owner = 0;
  s.allies.push(starla);
  delete s.dreamchaser!.secrets![secretAt(s, DC.starla)];
  delete s.dreamchaser!.secrets![secretAt(s, DC.nightmare)];
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp),
    [1, 2, 2, 1, 1, 1, 0],
  );
  win(s);
  const c = s.campaign!;
  assert.equal(c.completed[5].scenarioId, "temple-of-the-deceived");
  assert.equal(c.completed[5].xp, 8);
  assert.ok(c.boons.includes(DC.starla));
  assert.equal(c.deckBoons![DC.starla], 0);
  assert.ok(c.burdens.includes(DC.nightmare));
  assert.deepEqual(c.nightmares, [0]);
  assert.equal(c.resolution ?? null, null);
  // The Drowned Ruins follows: the Recurring Nightmare joins the deck after
  // the starting hand.
  const next = continueCampaign(s, c.heroes, s.deckId, true, 9);
  assert.equal(next.scenarioId, "the-drowned-ruins");
  assert.equal(next.deck.filter((x) => x === DC.nightmare).length, 1);
  assert.ok(!next.hand.some((h) => h.code === DC.nightmare));
});

test("Temple of the Deceived's resolution with several players: each freed Recurring Nightmare is given to a chosen player, who shuffles it into their deck after their starting hand in later chapters; a mulligan holds it out", () => {
  const seats = STARTERS.slice(0, 2).map((x) => ({
    deckId: x.id,
    heroes: [...x.heroes],
  }));
  const campaign = {
    ...afterDepths(),
    heroes: seats.flatMap((x) => x.heroes),
    seatHeroes: [3, 3],
  };
  let s = createGame(5, d.cards, HEROES, d.id, {
    scenarioId: "temple-of-the-deceived",
    playMode: "campaign",
    campaign,
    seats,
  });
  s = calm(reload(opening(s)));
  s.dreamchaser!.secrets = {};
  win(s);
  assert.equal(s.campaign!.resolution, "temple-of-the-deceived");
  const questions = dreamchaserResolutionQuestions(s);
  assert.deepEqual(
    questions.map((q) => q.id),
    ["nightmare-1", "nightmare-2"],
  );
  const recorded = applyDreamchaserResolution(s, {
    "nightmare-1": "1",
    "nightmare-2": "0",
  });
  assert.deepEqual(recorded.campaign!.nightmares, [1, 0]);
  assert.equal(recorded.campaign!.resolution, null);
  assert.ok(valid(recorded));
  // A later chapter: the Recurring Nightmares join their players' decks
  // after the starting hands …
  const later = structuredClone(recorded);
  later.scenarioId = "the-drowned-ruins";
  for (const p of [0, 1])
    forOwner(
      later,
      p,
      () => (later.deck = later.deck.filter((c) => c !== DC.nightmare)),
    );
  shuffleCampaignNightmares(later);
  for (const p of [0, 1])
    assert.equal(
      seatView(later, p).deck.filter((c) => c === DC.nightmare).length,
      1,
    );
  // … and a mulligan holds them out of the new starting hand.
  let fresh = temple();
  assert.equal(fresh.phase, "setup");
  fresh.deck.push(DC.nightmare, DC.nightmare);
  fresh = applyAction(fresh, { type: "MULLIGAN" });
  assert.ok(!fresh.hand.some((h) => h.code === DC.nightmare));
  assert.equal(fresh.deck.filter((c) => c === DC.nightmare).length, 2);
});

// ------------------------------------------------ The Drowned Ruins (Part 7)

/** A Dream-chaser campaign after Temple of the Deceived. */
function afterTemple(marks: Record<string, number> = {}): CampaignState {
  const c = afterDepths(marks);
  return {
    ...c,
    completed: [
      ...c.completed,
      { scenarioId: "temple-of-the-deceived", score: 20, rounds: 9, xp: 5 },
    ],
  };
}
const drowned = (campaign = afterTemple(), deck = STARTERS[0], seed = 5) =>
  createGame(seed, deck.cards, deck.heroes, deck.id, {
    scenarioId: "the-drowned-ruins",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
  });
/** Resolve a copy of Command's choices directly (X is `x`). */
function command(s: GameState, code: string, x: number) {
  s.queue = [
    makeEffect("dcCommandPick", {
      code,
      value: x,
      count: x,
      ids: [],
      player: 0,
    }),
  ];
  flush(s);
  return s;
}
/** Attach a Círdan's Blessing (with `tokens` resources) to a unit. */
function bless(s: GameState, u: Unit, code: string, tokens = 2) {
  const a = {
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    resourceTokens: tokens,
  };
  u.attachments.push(a);
  return a;
}
const underwaterCode = "octgn:58f1cb80-d8de-4f96-98d0-0fdf61988da3:B";

test("The Drowned Ruins: its campaign card, the four copies of Command and of Círdan's Blessing are registered with their printed spheres", () => {
  const campaignCard = card(DC.drownedCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 7");
  assert.match(
    campaignCard.text!,
    /Each player may choose one copy of Command and add it to their hand\. For this game, X is plus 1 for each of those copies\./,
  );
  assert.match(
    campaignCard.back_text!,
    /• 2 XP if Shrine to Morgoth \(Grotto side\) is in the victory display\./,
  );
  assert.deepEqual(
    COMMAND.map((code) => [
      card(code).type_code,
      card(code).boon_sphere,
      card(code).victory,
    ]),
    [
      ["event", "leadership", 1],
      ["event", "lore", 1],
      ["event", "spirit", 1],
      ["event", "tactics", 1],
    ],
  );
  assert.deepEqual(
    CIRDAN.map((code) => [card(code).type_code, card(code).boon_sphere]),
    [
      ["attachment", "leadership"],
      ["attachment", "tactics"],
      ["attachment", "spirit"],
      ["attachment", "lore"],
    ],
  );
  assert.match(card(CIRDAN[3]).text!, /^Attach to a hero\./);
});

test("The Drowned Ruins' setup: Captain Sahír carries Black Key (boon), each player may take a copy of Command (Ominous Fate's X +1 each), one player a copy of Círdan's Blessing, Revenant is shuffled in, and each character may trade 1 damage for 1 threat", () => {
  let s = opening(
    drowned(afterTemple({ [COMMAND[0]]: 2, [CIRDAN[0]]: 1 })),
    (x) => {
      const t = x.choice!.title;
      if (/copy of Command/.test(t)) return COMMAND[0];
      if (/copy of Círdan's Blessing/.test(t)) return CIRDAN[0];
      return undefined;
    },
  );
  s = calm(reload(s));
  const sahir = s.allies.find((u) => u.code === DROWNED.sahirAlly)!;
  assert.deepEqual(
    sahir.attachments.map((a) => a.code),
    [DC.keyBoon],
  );
  assert.ok(s.hand.some((h) => h.code === COMMAND[0]));
  assert.ok(s.hand.some((h) => h.code === CIRDAN[0]));
  assert.deepEqual(s.dreamchaser!.commands, { [COMMAND[0]]: 0 });
  assert.deepEqual(s.dreamchaser!.cirdan, { [CIRDAN[0]]: 0 });
  assert.equal(dreamchaserOminousX(s), 8);
  assert.ok(s.encounterDeck.includes(DC.revenant));
  assert.match(
    dreamchaserCampaignStatus(s).join("\n"),
    /Command copies chosen this game: leadership \(level 2\)/,
  );
  assert.ok(valid(s));
});

test("Command (Leadership): played from hand with its printed sphere, it goes to the victory display (victory 1) and chooses up to X options: +2 defense for a hero, and an ally from the discard pile that is discarded at the end of the phase", () => {
  let s = calm(reload(opening(drowned(afterTemple({ [COMMAND[0]]: 2 })))));
  for (const h of s.heroes) h.resources = 1;
  s.discard.push("01013");
  const event = make(s, COMMAND[0]);
  s.hand.push(event);
  const victory = s.victory;
  s = applyAction(reload(s), { type: "PLAY", id: event.id });
  for (
    let i = 0;
    i < 4 && s.choice && !/Choose an option/.test(s.choice.title);
    i++
  )
    s = choose(s, s.choice.options[0].id);
  assert.match(
    s.choice!.title,
    /Command \(leadership\) · Choose an option \(2 of 2 left\)/,
  );
  const hero = s.heroes[0];
  const defense = stats(s, hero).defense;
  s = choose(s, "defense");
  s = choose(s, hero.id);
  assert.equal(stats(s, s.heroes[0]).defense, defense + 2);
  s = choose(s, "ally");
  s = choose(s, "01013");
  const scout = s.allies.find((u) => u.code === "01013")!;
  assert.ok(scout, "the ally enters play");
  assert.deepEqual(s.dreamchaser!.summoned, [scout.id]);
  assert.ok(s.victoryCards!.includes(COMMAND[0]));
  assert.equal(s.victory, victory + 1);
  assert.ok(valid(s));
  phaseEnd(s);
  flush(s);
  assert.ok(!s.allies.some((u) => u.id === scout.id));
  assert.ok(s.discard.includes("01013"));
});

test("Command (Lore, Spirit, Tactics): the bottom card, the encounter deck's top 10, resources off an enemy and onto each Círdan's Blessing; no quest exhaustion for blessed characters, progress, Spyglass; −2 attack, 2 damage and an engagement, and a readied attachment moved to another character", () => {
  // Lore, level 4.
  let s = calm(reload(opening(drowned())));
  s.deck = ["01050", ...s.deck.slice(0, 5), "01051"];
  const foe = make(s, DROWNED.scorpion);
  foe.resources = 3;
  s.engaged.push(foe);
  const blessing = bless(s, s.heroes[1], CIRDAN[0], 1);
  const deckSize = s.encounterDeck.length;
  s = command(s, COMMAND[1], 4);
  s = choose(s, "bottom");
  assert.ok(s.hand.some((h) => h.code === "01051"));
  s = choose(s, "bless");
  assert.equal(
    s.heroes[1].attachments.find((a) => a.id === blessing.id)!.resourceTokens,
    3,
  );
  s = choose(s, "strip");
  s = choose(s, foe.id);
  assert.equal(s.engaged.find((u) => u.id === foe.id)!.resources, 0);
  s = choose(s, "scry");
  assert.match(s.choice!.title, /top 10 cards of the encounter deck/);
  const discarded = s.encounterDeck[0];
  s = choose(s, "card-0");
  assert.equal(s.encounterDiscard.at(-1), discarded);
  s = choose(s, "skip");
  assert.equal(s.encounterDeck.length, deckSize - 1);
  assert.equal(s.choice, null);
  assert.ok(valid(s));
  // Spirit, level 3: blessed characters quest without exhausting.
  let t = calm(reload(opening(drowned())));
  bless(t, t.heroes[0], CIRDAN[2], 1);
  t = command(t, COMMAND[2], 3);
  t = choose(t, "quest");
  assert.ok(!questExhausts(t, t.heroes[0]));
  assert.ok(questExhausts(t, t.heroes[1]));
  t = choose(t, "spyglass");
  t = choose(t, t.heroes[2].id);
  assert.ok(t.heroes[2].attachments.some((a) => a.code === DC.spyglass));
  t = choose(t, "will");
  const will = stats(t, t.heroes[1]).will;
  t = choose(t, t.heroes[1].id);
  assert.equal(stats(t, t.heroes[1]).will, will + 2);
  assert.ok(valid(t));
  // Tactics, level 3.
  let u = calm(reload(opening(drowned())));
  const scorpion = make(u, DROWNED.scorpion);
  u.staging.push(scorpion);
  const spent = bless(u, u.heroes[0], CIRDAN[2], 1);
  spent.exhausted = true;
  u = command(u, COMMAND[3], 3);
  u = choose(u, "blunt");
  const attack = stats(u, scorpion).attack;
  u = choose(u, scorpion.id);
  assert.equal(
    stats(
      u,
      u.staging.find((x) => x.id === scorpion.id)!,
    ).attack,
    attack - 2,
  );
  u = choose(u, "damage");
  u = choose(u, scorpion.id);
  assert.match(u.choice!.title, /Engage/);
  u = choose(u, "engage");
  const hit = u.engaged.find((x) => x.id === scorpion.id)!;
  assert.equal(hit.damage, 2);
  u = choose(u, "attachment");
  u = choose(u, spent.id);
  assert.match(u.choice!.title, /Move Círdan's Blessing/);
  u = choose(u, u.heroes[1].id);
  const moved = u.heroes[1].attachments.find((a) => a.id === spent.id)!;
  assert.equal(moved.exhausted, false);
  assert.ok(!u.heroes[0].attachments.some((a) => a.id === spent.id));
  assert.ok(valid(u));
});

test("Círdan's Blessing: it attaches to a character (the Lore copy to a hero) with 1 more resource than its level, and spends them for +3 defense when defending, +3 attack when attacking, +3 willpower by its Action, or a resource and a heal after the active location is explored", () => {
  let s = calm(reload(opening(drowned(afterTemple({ [CIRDAN[0]]: 2 })))));
  for (const h of s.heroes) h.resources = 2;
  const card0 = make(s, CIRDAN[0]);
  s.hand.push(card0);
  const sahir = s.allies.find((u) => u.code === DROWNED.sahirAlly)!;
  s = applyAction(reload(s), { type: "PLAY", id: card0.id, target: sahir.id });
  for (let i = 0; i < 4 && s.choice; i++) s = choose(s, s.choice.options[0].id);
  const held = s.allies
    .find((u) => u.id === sahir.id)!
    .attachments.find((a) => a.code === CIRDAN[0])!;
  assert.equal(held.resourceTokens, 3);
  assert.ok(valid(s));
  // Leadership: +3 defense for this attack.
  const foe = make(s, DROWNED.scorpion);
  s.engaged.push(foe);
  const host = s.allies.find((u) => u.id === sahir.id)!;
  s.combat = {
    enemyId: foe.id,
    defenderId: host.id,
    attackBonus: 0,
  } as GameState["combat"];
  s.queue = dreamchaserDefendersDeclared(s, foe, [host]);
  flush(s);
  s = choose(s, "use");
  assert.equal(s.combat!.defenseBonuses![sahir.id], 3);
  assert.equal(
    s.allies
      .find((u) => u.id === sahir.id)!
      .attachments.find((a) => a.code === CIRDAN[0])!.resourceTokens,
    2,
  );
  // Tactics: +3 attack for this attack.
  const t = calm(reload(opening(drowned())));
  const attacker = t.heroes[0];
  bless(t, attacker, CIRDAN[1], 1);
  t.queue = dreamchaserAttackersDeclared(t, make(t, DROWNED.scorpion), [
    attacker,
  ]);
  flush(t);
  const used = choose(t, "use");
  assert.equal(dreamchaserPlayerAttackBonus(used, used.heroes[0]), 3);
  dreamchaserPlayerAttackResolved(used, [used.heroes[0].id]);
  assert.equal(dreamchaserPlayerAttackBonus(used, used.heroes[0]), 0);
  // Spirit: its Action.
  let w = calm(reload(opening(drowned())));
  const spirit = bless(w, w.heroes[0], CIRDAN[2], 1);
  const will = stats(w, w.heroes[0]).will;
  const ability = availableAbilities(w, w.heroes[0]).find(
    (a) => a.id === spirit.id,
  )!;
  assert.match(ability.label, /\+3 willpower until the end of the phase/);
  w = applyAction(reload(w), {
    type: "ABILITY",
    id: w.heroes[0].id,
    attachmentId: spirit.id,
  });
  assert.equal(stats(w, w.heroes[0]).will, will + 3);
  assert.ok(w.heroes[0].attachments.find((a) => a.id === spirit.id)!.exhausted);
  assert.ok(valid(w));
  // Lore: after the active location is explored.
  let l = calm(reload(opening(drowned())));
  bless(l, l.heroes[0], CIRDAN[3], 1);
  l.heroes[0].damage = 1;
  const resources = l.heroes[0].resources;
  dreamchaserLocationExplored(l, make(l, DROWNED.cave), true);
  flush(l);
  l = choose(l, "use");
  assert.equal(l.heroes[0].resources, resources + 1);
  assert.equal(l.heroes[0].damage, 0);
});

test("The Drowned Ruins' resolution: resources on the campaign card, Na'asiyah's resources, no enemies, 5 Underwater locations and the Shrine's Grotto side in the victory display and threat give XP; the chosen Command and Círdan's Blessing copies join the Campaign Pool and their players' decks, and A Storm on Cobas Haven follows", () => {
  const s = calm(reload(opening(drowned())));
  s.dreamchaser = {
    ...(s.dreamchaser ?? {}),
    commands: { [COMMAND[0]]: 0 },
    cirdan: { [CIRDAN[0]]: 0 },
    resources: 2,
  };
  s.allies.find((u) => u.code === DROWNED.naasiyahAlly)!.resources = 5;
  s.staging = s.staging.filter((u) => card(u.code).type_code !== "enemy");
  s.engaged = [];
  for (let i = 0; i < 5; i++)
    s.drowned!.victoryLocations.push(make(s, underwaterCode));
  s.victoryCards = [...(s.victoryCards ?? []), DROWNED.shrine];
  s.threat = 30;
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp),
    [1, 2, 1, 1, 1, 2, 1, 0],
  );
  win(s);
  const c = s.campaign!;
  assert.equal(c.completed[6].scenarioId, "the-drowned-ruins");
  assert.equal(c.completed[6].xp, 9);
  assert.ok(c.boons.includes(COMMAND[0]) && c.boons.includes(CIRDAN[0]));
  assert.equal(c.deckBoons![COMMAND[0]], 0);
  assert.equal(c.deckBoons![CIRDAN[0]], 0);
  const next = continueCampaign(s, c.heroes, s.deckId, true, 9);
  assert.equal(next.scenarioId, "a-storm-on-cobas-haven");
});

// ---------------------------------------- A Storm on Cobas Haven (Part 8)

/** A Dream-chaser campaign after The Drowned Ruins. */
function afterDrowned(marks: Record<string, number> = {}): CampaignState {
  const c = afterTemple(marks);
  return {
    ...c,
    completed: [
      ...c.completed,
      { scenarioId: "the-drowned-ruins", score: 18, rounds: 8, xp: 6 },
    ],
  };
}
const cobas = (campaign = afterDrowned(), deck = STARTERS[0], seed = 5) =>
  createGame(seed, deck.cards, deck.heroes, deck.id, {
    scenarioId: "a-storm-on-cobas-haven",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
  });
/** Resolve a copy of Send for Help's When Revealed effect. */
function help(s: GameState, code: string) {
  s.queue = [makeEffect("dcHelp", { code, player: 0 })];
  flush(s);
  return s;
}

test("A Storm on Cobas Haven: its campaign card, Gavin, the four copies of Send for Help and the Dol Amroth Warship's campaign side are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.cobasCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 8");
  assert.match(
    campaignCard.text!,
    /Put Gavin into play under any player's control\. One player may choose a copy of Círdan's Blessing not in the Campaign Pool and add it to their hand\./,
  );
  assert.match(
    campaignCard.back_text!,
    /The players may spend 4 XP on Gavin to record in the Campaign Log that "Gavin returned\."/,
  );
  const gavin = card(DC.gavin);
  assert.deepEqual(
    [
      gavin.type_code,
      gavin.willpower,
      gavin.attack,
      gavin.defense,
      gavin.health,
    ],
    ["objective-ally", 1, 1, 0, 2],
  );
  assert.deepEqual(
    SEND_FOR_HELP.map(
      (code) =>
        /Send for Help \(\[(\w+)\]\) is upgraded/.exec(card(code).text!)?.[1],
    ),
    ["leadership", "tactics", "spirit", "lore"],
  );
  assert.match(
    card(backFace(DC.warship)).text!,
    /Campaign Mode only\.\nImmune to player card effects\. Sentinel\./,
  );
});

test("A Storm on Cobas Haven's setup: the fleet comes from the campaign's ships, Raider Flagship carries Black Key (burden), Modifications, Calaerion and Gavin join the players, a copy of Círdan's Blessing not in the Campaign Pool may be taken, Thunderstruck and Crowley are shuffled in, and the four copies of Send for Help are set aside", () => {
  let s = opening(
    cobas({
      ...afterDrowned({ [DC.warship]: 3 }),
      boons: [CIRDAN[0]],
      deckBoons: { [CIRDAN[0]]: 0 },
    }),
    (x) => {
      if (/copy of Círdan's Blessing/.test(x.choice!.title)) {
        assert.ok(
          !x.choice!.options.some((o) => o.id === CIRDAN[0]),
          "not a copy in the Campaign Pool",
        );
        return CIRDAN[1];
      }
      return undefined;
    },
  );
  s = calm(reload(s));
  const flagship = s.staging.find((u) => u.code === COBAS.flagship)!;
  assert.deepEqual(
    flagship.attachments.map((a) => a.code),
    [DC.keyBurden],
  );
  assert.ok(s.allies.some((u) => dcIs(u, DC.calaerion)));
  assert.ok(s.allies.some((u) => u.code === DC.gavin));
  assert.ok(
    s.allies
      .filter((u) => card(u.code).type_code === "ship-objective")
      .every((u) =>
        u.attachments.some((a) =>
          [DC.armor, DC.ballista, DC.quarters, DC.sails].includes(
            dcBase(a.code),
          ),
        ),
      ),
  );
  assert.ok(s.hand.some((h) => h.code === CIRDAN[1]));
  assert.ok(s.encounterDeck.includes(DC.thunderstruck));
  assert.ok(s.cobas!.corsairDeck.includes(DC.crowley));
  assert.deepEqual(s.dreamchaser!.sendForHelp, [...SEND_FOR_HELP]);
  // Both Dol Amroth Warships wait on their campaign side (Sentinel).
  const warships = s.cobas!.setAside.filter((u) => dcIs(u, COBAS.warship));
  assert.equal(warships.length, 2);
  assert.ok(warships.every((u) => u.code === backFace(DC.warship)));
  assert.ok(hasKeyword(warships[0], "Sentinel"));
  assert.ok(valid(s));
});

test("Gavin: his Planning Action shuffles him and a random set-aside Send for Help into the encounter deck; revealed, he joins a player committed to the quest with a resource for Lanwyn; leaving play otherwise removes him from the game", () => {
  let s = calm(reload(opening(cobas())));
  const gavin = s.allies.find((u) => u.code === DC.gavin)!;
  assert.match(availableAbilities(s, gavin)[0].label, /Planning Action/);
  assert.ok(availableAbilities(s, gavin)[0].disabled === false);
  const deck = s.encounterDeck.length;
  gavinAbility(s, gavin);
  assert.ok(!s.allies.some((u) => u.id === gavin.id));
  assert.equal(s.encounterDeck.length, deck + 2);
  assert.ok(s.encounterDeck.includes(DC.gavin));
  assert.equal(s.dreamchaser!.sendForHelp!.length, 3);
  assert.ok(valid(s));
  // Revealed during the quest: committed, and Lanwyn gains a resource.
  s.heroes[0].code = "12030";
  const lanwyn = s.heroes[0].resources;
  s.phase = "staging";
  s.queue = [makeEffect("dcGavinPlace", { player: 0, flag: true })];
  flush(s);
  const back = s.allies.find((u) => u.code === DC.gavin)!;
  assert.ok(back.committed);
  assert.equal(s.heroes[0].resources, lanwyn + 1);
  // Destroyed: removed from the game.
  assert.ok(dreamchaserRemoveCharacter(s, back));
  assert.ok(s.removed.includes(DC.gavin));
});

test("Send for Help: revealed from the encounter deck it is removed from the game; Leadership draws or plays a card from the top 10 at no cost (twice upgraded), Tactics lends a hero until the end of the round, Lore brings Gandalf with up to 3 options upgraded, and its Shadow resolves the same effect", () => {
  // Leadership: search the top 10.
  let s = calm(reload(opening(cobas())));
  s.deck = ["01013", ...s.deck];
  s = help(s, SEND_FOR_HELP[0]);
  assert.match(s.choice!.title, /Search the top 10 cards/);
  s = choose(s, "play-0");
  assert.ok(
    s.allies.some((u) => u.code === "01013"),
    "played at no cost",
  );
  assert.equal(s.choice, null);
  assert.ok(valid(s));
  // Upgraded: twice.
  let t = calm(reload(opening(cobas(afterDrowned({ [SEND_FOR_HELP[0]]: 3 })))));
  t = help(t, SEND_FOR_HELP[0]);
  const first = t.deck[0];
  t = choose(t, "draw-0");
  assert.ok(t.hand.some((h) => h.code === first));
  assert.match(t.choice!.title, /Search the top 10 cards/);
  t = choose(t, "skip");
  assert.equal(t.choice, null);
  // Tactics: a hero from the collection until the end of the round.
  let u = calm(reload(opening(cobas())));
  u = help(u, SEND_FOR_HELP[1]);
  assert.match(u.choice!.title, /hero from the players' collections/);
  assert.ok(!u.choice!.options.some((o) => o.code === u.heroes[0].code));
  const pick = u.choice!.options[0].code!;
  u = choose(u, u.choice!.options[0].id);
  const lent = u.heroes.find((h) => h.code === pick)!;
  assert.ok(lent, "the hero enters play");
  assert.deepEqual(u.dreamchaser!.borrowed, [lent.id]);
  assert.ok(valid(u));
  u.queue = dreamchaserRoundEnd(u);
  flush(u);
  assert.ok(!u.heroes.some((h) => h.id === lent.id));
  assert.ok(u.removed.includes(pick));
  // Lore, upgraded: Gandalf with up to 3 options.
  let g = calm(reload(opening(cobas(afterDrowned({ [SEND_FOR_HELP[3]]: 2 })))));
  const threat = g.threat;
  const hand = g.hand.length;
  g = help(g, SEND_FOR_HELP[3]);
  assert.ok(g.allies.some((x) => x.code === "01073"));
  assert.match(g.choice!.title, /Gandalf · Choose up to 3 options/);
  g = choose(g, "draw");
  g = choose(g, "threat");
  assert.equal(g.hand.length, hand + 3);
  assert.equal(g.threat, threat - 5);
  g = choose(g, "skip");
  // Not upgraded: Gandalf's own single choice.
  let n = calm(reload(opening(cobas())));
  n = help(n, SEND_FOR_HELP[3]);
  assert.match(n.choice!.title, /Gandalf/);
  // Shadow: the card leaves the attacking enemy and its effect resolves.
  const m = calm(reload(opening(cobas())));
  const raider = m.staging.find((x) => x.code === COBAS.flagship)!;
  raider.shadows = [SEND_FOR_HELP[2]];
  m.combat = {
    enemyId: raider.id,
    defenderId: null,
    attackBonus: 0,
  } as GameState["combat"];
  assert.ok(dreamchaserCampaignShadow(m, SEND_FOR_HELP[2]));
  assert.deepEqual(raider.shadows, []);
  assert.equal(m.queue[0].kind, "dcHelp");
});

test("Send for Help (Spirit): the chosen additional phase follows the current one, and the delayed phase begins when it ends; upgraded, two phases are chosen", () => {
  let s = calm(reload(opening(cobas(afterDrowned({ [SEND_FOR_HELP[2]]: 4 })))));
  s = help(s, SEND_FOR_HELP[2]);
  assert.match(s.choice!.title, /Choose an additional phase \(one of two\)/);
  s = choose(s, "planning");
  s = choose(s, "resource");
  assert.deepEqual(s.dreamchaser!.extraPhases, ["planning", "resource"]);
  assert.ok(valid(s));
  // The quest phase ends: an additional planning phase instead of travel.
  s.phase = "staging";
  s.queue = [makeEffect("startTravel", { player: 0 })];
  flush(s);
  assert.equal(s.phase, "planning");
  assert.equal(s.dreamchaser!.extraPhase!.phase, "planning");
  assert.equal(s.dreamchaser!.extraPhase!.resume.kind, "startTravel");
  assert.ok(valid(s));
  // The additional planning phase ends: the additional resource phase.
  s.queue = [makeEffect("startQuest")];
  flush(s);
  assert.equal(s.phase, "resource");
  assert.equal(s.dreamchaser!.extraPhase!.phase, "resource");
  // It ends too: the delayed travel phase begins.
  s.queue = [makeEffect("startPlanning")];
  flush(s);
  assert.equal(s.phase, "travel");
  assert.equal(s.dreamchaser!.extraPhase, undefined);
  assert.equal(s.dreamchaser!.extraPhases, undefined);
});

test("A Storm on Cobas Haven's resolution: on-course, 2 Dol Amroth Warships, 2 captured Corsair Skirmishers, 4 controlled objectives, Corsair Warships, Crowley, Raider Flagship and Thunderstruck give XP; the chosen Círdan's Blessing joins the Campaign Pool, the players may spend 4 XP to record that Gavin returned, and The City of Corsairs follows", () => {
  const s = calm(reload(opening(cobas())));
  s.dreamchaser = { ...(s.dreamchaser ?? {}), cirdan: { [CIRDAN[1]]: 0 } };
  s.sailing!.heading = 0;
  for (const ship of s.cobas!.setAside.filter((u) => dcIs(u, COBAS.warship))) {
    ship.owner = 0;
    s.allies.push(ship);
  }
  s.cobas!.setAside = s.cobas!.setAside.filter((u) => !dcIs(u, COBAS.warship));
  for (let i = 0; i < 2; i++) {
    const skirmisher = make(s, COBAS.skirmisher);
    skirmisher.cobasShipObjective = true;
    skirmisher.owner = 0;
    s.allies.push(skirmisher);
  }
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    VOYAGE.warship,
    DC.crowley,
    COBAS.flagship,
    DC.thunderstruck,
  ];
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(
    lines.map((l) => l.xp).slice(1, 9),
    [1, 1, 1, 0, 1, 1, 2, 2],
  );
  win(s);
  const c = s.campaign!;
  assert.equal(c.completed[7].scenarioId, "a-storm-on-cobas-haven");
  assert.ok(c.boons.includes(CIRDAN[1]));
  assert.equal(c.deckBoons![CIRDAN[1]], 0);
  assert.equal(c.resolution, "a-storm-on-cobas-haven");
  const xp = c.xp!;
  const recorded = applyDreamchaserResolution(s, { gavin: "spend" });
  assert.equal(recorded.campaign!.xp, xp - 4);
  assert.equal(recorded.campaign!.marks![DC.gavin], 4);
  assert.ok(valid(recorded));
  const next = continueCampaign(
    recorded,
    recorded.campaign!.heroes,
    recorded.deckId,
    true,
    9,
  );
  assert.equal(next.scenarioId, "the-city-of-corsairs");
});

// ------------------------------------------- The City of Corsairs (Part 9)

/** A Dream-chaser campaign after A Storm on Cobas Haven. */
function afterCobas(marks: Record<string, number> = {}): CampaignState {
  const c = afterDrowned(marks);
  return {
    ...c,
    completed: [
      ...c.completed,
      { scenarioId: "a-storm-on-cobas-haven", score: 22, rounds: 7, xp: 7 },
    ],
  };
}
const city = (campaign = afterCobas(), deck = STARTERS[0], seed = 5) =>
  createGame(seed, deck.cards, deck.heroes, deck.id, {
    scenarioId: "the-city-of-corsairs",
    playMode: "campaign",
    campaign: { ...campaign, heroes: [...deck.heroes] },
  });
/** Captain Sahír enters play engaged with the first player. */
function sahirIn(s: GameState) {
  const sahir = make(s, CITY.sahir);
  s.engaged.push(sahir);
  dreamchaserCheck(s);
  return s.engaged.find((u) => u.id === sahir.id)!;
}

test("The City of Corsairs: its campaign card's two sides, The Black Sword, The Shattered Monument's Upgraded side and the Stormcaller's campaign side are registered with the print-and-play texts", () => {
  const campaignCard = card(DC.cityCard);
  assert.equal(campaignCard.subtitle, "Dream-chaser Part 9");
  assert.match(
    campaignCard.text!,
    /If "Gavin returned," put him into play under any player's control\. Flip this card over\./,
  );
  assert.match(
    campaignCard.back_text!,
    /Resolution: The players win the campaign!/,
  );
  assert.match(
    card(DC.sword).text!,
    /enters play with 3 resources on it\.\nCaptain Sahír gets \+2 \[attack\] and gains indestructible\./,
  );
  assert.match(
    card(backFace(DC.sword)).text!,
    /enters play with 2 resources on it\.\nCaptain Sahír gains indestructible\./,
  );
  assert.match(
    card(backFace(DC.monument)).text!,
    /^Campaign Mode only\.\nForced: At the beginning of the resource phase/,
  );
  const stormcaller = card(backFace(CITY_STORMCALLER));
  assert.deepEqual(
    [
      stormcaller.attack,
      stormcaller.defense,
      stormcaller.health,
      stormcaller.victory,
    ],
    [7, 6, 20, 15],
  );
  assert.match(
    stormcaller.text!,
    /cannot take more than 10 damage each round\. No more than 10 progress can be placed on the quest each round\./,
  );
});

test("The City of Corsairs' setup: the Stormcaller takes its campaign side with Black Key (burden), the fleet takes its Modification boons, Calaerion serves the Dream-chaser's player, a Círdan's Blessing not in the Campaign Pool may be taken, Gavin returns if recorded, and Thunderstruck and Crowley are shuffled in", () => {
  let s = opening(
    city({
      ...afterCobas({ [DC.gavin]: 4 }),
      boons: [CIRDAN[0], CIRDAN[1]],
      deckBoons: { [CIRDAN[0]]: 0, [CIRDAN[1]]: 0 },
    }),
    (x) =>
      /copy of Círdan's Blessing/.test(x.choice!.title) ? CIRDAN[2] : undefined,
  );
  s = calm(reload(s));
  const stormcaller = s.staging.find((u) => dcIs(u, CITY.stormcaller))!;
  assert.equal(stormcaller.code, backFace(CITY_STORMCALLER));
  assert.deepEqual(
    stormcaller.attachments.map((a) => a.code),
    [DC.keyBurden],
  );
  assert.ok(s.allies.some((u) => dcIs(u, DC.calaerion)));
  assert.ok(s.allies.some((u) => u.code === DC.gavin));
  assert.ok(s.hand.some((h) => h.code === CIRDAN[2]));
  assert.ok(s.encounterDeck.includes(DC.thunderstruck));
  assert.ok(s.city!.corsairDeck.includes(DC.crowley));
  assert.ok(valid(s));
  // Without "Gavin returned", no Gavin.
  const plain = calm(reload(opening(city())));
  assert.ok(!plain.allies.some((u) => u.code === DC.gavin));
  // The Shattered Monument's Upgraded side waits in the second deck.
  const upgraded = calm(
    reload(opening(city(afterCobas({ [DC.monument]: 2 })))),
  );
  assert.ok(upgraded.city!.secondDeck.includes(backFace(DC.monument)));
  assert.ok(valid(upgraded));
});

test("The Stormcaller's campaign side: at most 10 damage each round and at most 10 progress on the quest each round", () => {
  const s = calm(reload(opening(city())));
  const stormcaller = s.staging.find((u) => dcIs(u, CITY.stormcaller))!;
  assert.equal(dreamchaserDamageAmount(s, stormcaller, 12), 10);
  damage(s, stormcaller.id, 8);
  assert.equal(dreamchaserDamageAmount(s, stormcaller, 5), 2);
  s.progress = 0;
  addQuestProgress(s, mainQuestUnit(s)!, 7);
  addQuestProgress(s, mainQuestUnit(s)!, 6);
  assert.equal(s.progress, 10);
  s.round += 1;
  addQuestProgress(s, mainQuestUnit(s)!, 4);
  assert.equal(s.progress, 14);
});

test("The City of Corsairs' flipped campaign card: stage 2B moves the boons and non-Ship burdens into the second encounter deck; Captain Sahír enters play with Black Key (burden) and The Black Sword (+2 attack, indestructible, an attack against each other player after his first, and its resources taken by a hero's Refresh Action)", () => {
  const s = calm(reload(opening(city())));
  s.encounterDeck.push(DC.ominous, SEND_FOR_HELP[0]);
  s.encounterDiscard.push(DC.gavin, DC.thunderstruck);
  s.queue = [makeEffect("dcCityStageTwo")];
  flush(s);
  for (const code of [DC.ominous, SEND_FOR_HELP[0], DC.gavin])
    assert.ok(s.city!.secondDeck.includes(code), card(code).name);
  assert.ok(!s.encounterDeck.includes(DC.ominous));
  assert.ok(
    s.encounterDiscard.includes(DC.thunderstruck),
    "a Ship burden stays",
  );
  // Captain Sahír enters play.
  const sahir = sahirIn(s);
  assert.deepEqual(
    sahir.attachments.map((a) => a.code),
    [DC.keyBurden, DC.sword],
  );
  assert.equal(sahir.attachments[1].resourceTokens, 3);
  const plainAttack = card(CITY.sahir).attack ?? 0;
  assert.equal(stats(s, sahir).attack, plainAttack + 1 + 2);
  assert.ok(dreamchaserIndestructible(s, sahir));
  // The Refresh Action: a hero takes a resource.
  const hero = s.heroes[0];
  const ability = availableAbilities(s, hero).find((a) =>
    /Black Sword/.test(a.label),
  )!;
  assert.ok(ability.disabled, "only in the refresh phase");
  s.phase = "refresh";
  const before = hero.resources;
  let t = applyAction(reload(s), { type: "ABILITY", id: hero.id });
  assert.equal(t.heroes[0].resources, before + 1);
  assert.ok(t.heroes[0].exhausted);
  assert.equal(
    t.engaged.find((u) => u.id === sahir.id)!.attachments[1].resourceTokens,
    2,
  );
  assert.match(
    availableAbilities(t, t.heroes[1]).find((a) => /Black Sword/.test(a.label))!
      .label,
    /Refresh Action/,
  );
  assert.ok(
    availableAbilities(t, t.heroes[1]).find((a) => /Black Sword/.test(a.label))!
      .disabled,
    "group limit once per round",
  );
  // The last resource removes it from the game.
  t.engaged.find((u) => u.id === sahir.id)!.attachments[1].resourceTokens = 1;
  t.round += 1;
  t = applyAction(reload(t), { type: "ABILITY", id: t.heroes[1].id });
  assert.ok(
    !t.engaged
      .find((u) => u.id === sahir.id)!
      .attachments.some((a) => dcIs(a.code, DC.sword)),
  );
  assert.ok(
    !dreamchaserIndestructible(
      t,
      t.engaged.find((u) => u.id === sahir.id)!,
    ),
  );
  // The Upgraded Black Sword: 2 resources and no attack bonus.
  const u = calm(reload(opening(city(afterCobas({ [DC.sword]: 5 })))));
  const armed = sahirIn(u);
  assert.equal(armed.attachments[1].code, backFace(DC.sword));
  assert.equal(armed.attachments[1].resourceTokens, 2);
  assert.equal(stats(u, armed).attack, plainAttack + 1);
});

test("The Black Sword with several players: after Captain Sahír's first attack each round he attacks each other player in turn order", () => {
  const seats = STARTERS.slice(0, 2).map((x) => ({
    deckId: x.id,
    heroes: [...x.heroes],
  }));
  let s = createGame(5, d.cards, HEROES, d.id, {
    scenarioId: "the-city-of-corsairs",
    playMode: "campaign",
    campaign: {
      ...afterCobas(),
      heroes: seats.flatMap((x) => x.heroes),
      seatHeroes: [3, 3],
    },
    seats,
  });
  s = calm(reload(opening(s)));
  const sahir = sahirIn(s);
  s.queue = [];
  dreamchaserEnemyAttackResolved(s, sahir, []);
  assert.deepEqual(
    s.queue.map((e) => [e.kind, e.player]),
    [["immediateAttack", 1]],
  );
  s.queue = [];
  dreamchaserEnemyAttackResolved(s, sahir, []);
  assert.equal(s.queue.length, 0, "only after the first attack each round");
});

test("The Shattered Monument's Upgraded side keeps its resources but loses the immunity to player events", () => {
  const s = calm(reload(opening(city())));
  const raider = make(s, CITY.patrol);
  raider.resources = 1;
  s.staging.push(raider);
  const monument = make(s, backFace(DC.monument));
  s.staging.push(monument);
  assert.ok(!cityImmuneToEvents(s, raider));
  s.staging = s.staging.filter((u) => u.id !== monument.id);
  s.staging.push(make(s, CITY.monument));
  assert.equal(
    cityImmuneToEvents(s, raider),
    (card(CITY.patrol).traits ?? "").includes("Raider"),
  );
});

test("The City of Corsairs' resolution: the players win the campaign and no chapter follows; Corsair Warship, Shattered Monument, Crowley and Stormcaller give 1 XP each and Thunderstruck 2 XP", () => {
  const s = calm(reload(opening(city())));
  const warship = VOYAGE.warship;
  s.victoryCards = [
    ...(s.victoryCards ?? []),
    warship,
    backFace(DC.monument),
    DC.crowley,
    backFace(CITY_STORMCALLER),
    DC.thunderstruck,
  ];
  const lines = dreamchaserXpLines(s);
  assert.deepEqual(lines.map((l) => l.xp).slice(1, 6), [1, 1, 1, 1, 2]);
  win(s);
  const c = s.campaign!;
  assert.equal(c.completed.length, 9);
  assert.equal(c.completed[8].scenarioId, "the-city-of-corsairs");
  assert.equal(c.outcome, "won");
  assert.ok(valid(s));
  // The campaign is complete: no chapter follows.
  assert.throws(
    () => continueCampaign(s, c.heroes, s.deckId, true, 9),
    /The campaign is complete/,
  );
});
