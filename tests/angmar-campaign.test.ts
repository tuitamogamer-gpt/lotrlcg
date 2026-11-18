import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { card, STARTERS } from "../src/game/cards";
import { damage, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { stats } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  addQuestProgress,
  checkSideQuestDefeats,
} from "../src/game/side-quests";
import { CHETWOOD } from "../src/game/chetwood-support";
import {
  ANGMAR,
  ANGMAR_CAMPAIGN_CARDS,
  ANGMAR_CAMPAIGN_ORDER,
  ANGMAR_CAMPAIGN_SUPPORTED,
  angmarCampaignStatus,
  angmarInnocent,
  angmarPendantShadowOptions,
  innocentLimit,
  newAngmarCampaign,
} from "../src/game/angmar-campaign";
import { seatView } from "../src/game/table";
import type { GameState } from "../src/game/types";
import art from "./angmar-campaign-art.json";

const d = STARTERS[0];
const HEROES = ["01005", "01006", d.heroes[2]];
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState) {
  Object.assign(s, { phase: "planning", choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
/** Resolve the setup choices, keep the hands and reach the first round. */
function opening(s: GameState) {
  for (let i = 0; i < 30 && s.choice; i++)
    s = choose(s, s.choice.options[0].id);
  s = applyAction(reload(s), { type: "KEEP" });
  for (let i = 0; i < 40 && (s.choice || s.flow?.pending); i++)
    s = applyAction(
      reload(s),
      s.flow?.pending
        ? { type: "CONTINUE", stepId: s.flow.pending.id }
        : {
            type: "CHOOSE",
            id: (
              s.choice!.options.find((o) => o.id === "skip") ??
              s.choice!.options[0]
            ).id,
          },
    );
  return s;
}
const chetwood = (seed = 5, campaign = newAngmarCampaign(HEROES)) =>
  createGame(seed, d.cards, HEROES, d.id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
    campaign,
  });

test("The Angmar Awakened campaign: Intruders in Chetwood's campaign card, Iârion's Pendant and Protect the Innocent are registered with the scans' texts, every face is pinned, and the campaign follows its nine chapters", () => {
  assert.equal(ANGMAR_CAMPAIGN_ORDER.length, 9);
  assert.deepEqual(ANGMAR_CAMPAIGN_SUPPORTED, ["intruders-in-chetwood"]);
  const campaignCard = card(ANGMAR_CAMPAIGN_CARDS["intruders-in-chetwood"]!);
  assert.equal(campaignCard.subtitle, "Angmar Awakened Part 1");
  assert.match(
    campaignCard.text!,
    /^You are playing campaign mode\.\nSetup: Attach Iârion's Pendant to Iârion and add the Protect the Innocent side quest to the staging area\. Starting with the first player, each player may place 4 damage on Protect the Innocent to add 1 resource to each of their heroes' resource pools\.$/,
  );
  assert.match(
    campaignCard.back_text!,
    /^Resolution: Note the amount of damage on Protect the Innocent in the Campaign Log and add Protect the Innocent to the Campaign Pool\.$/,
  );
  const pendant = card(ANGMAR.pendant);
  assert.deepEqual(
    [pendant.is_unique, pendant.cost, pendant.victory, pendant.traits],
    [true, "1", 1, "Artifact. Item."],
  );
  const innocent = card(ANGMAR.innocent);
  assert.equal(innocent.type_code, "encounter-side-quest");
  assert.equal(innocent.quest, undefined, 'its quest points are "–"');
  assert.match(
    innocent.text!,
    /If Protect the Innocent has 10 or more damage on it \(20 or more damage if there are 3 or 4 players in the game\), the players lose the game\.$/,
  );
  assert.equal(innocent.back_name, "Arnor Ravaged");
  assert.match(
    innocent.back_text!,
    /^Setup: Add Arnor Ravaged to the staging area with damage on it equal to the amount of damage marked for it in the Campaign Log\./,
  );
  assert.equal(art.length, 5);
  for (const a of art) {
    const bytes = readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
  }
  // A new campaign begins with Intruders in Chetwood; the Amarthiúl hero
  // waits for The Battle of Carn Dûm's campaign card.
  const fresh = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
  });
  assert.equal(fresh.campaign!.kind, "angmar");
  assert.throws(
    () =>
      createGame(5, d.cards, ["10115", "01006", "01003"], d.id, {
        scenarioId: "intruders-in-chetwood",
        playMode: "campaign",
        campaign: newAngmarCampaign(["10115", "01006", "01003"]),
      }),
    /No card titled Amarthiúl/,
  );
  assert.throws(
    () =>
      createGame(5, d.cards, HEROES, d.id, {
        scenarioId: "the-weather-hills",
        playMode: "campaign",
        campaign: newAngmarCampaign(HEROES),
      }),
    /follows its chapters in order/,
  );
});

test("Intruders in Chetwood: Protect the Innocent enters the staging area, each player may trade 4 of its damage for a resource on each hero, and Iârion's Pendant is attached to Iârion (+1 willpower)", () => {
  let s = chetwood();
  const quest = angmarInnocent(s)!;
  assert.ok(quest, "Protect the Innocent is in the staging area");
  assert.match(s.choice!.title, /may place 4 damage on Protect the Innocent$/);
  s = choose(s, "damage");
  assert.equal(angmarInnocent(s)!.damage, 4);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [1, 1, 1],
  );
  assert.ok(valid(s));
  s = opening(s);
  const iarion = s.allies.find((u) => u.code === CHETWOOD.iarion)!;
  assert.ok(iarion, "Iârion enters play with the scenario's setup");
  assert.deepEqual(
    iarion.attachments.map((a) => a.code),
    [ANGMAR.pendant],
  );
  const bare = structuredClone(s);
  bare.allies.find((u) => u.id === iarion.id)!.attachments = [];
  assert.equal(
    stats(s, iarion).will,
    stats(
      bare,
      bare.allies.find((u) => u.id === iarion.id)!,
    ).will + 1,
  );
  assert.deepEqual(angmarCampaignStatus(s), [
    "Protect the Innocent has 4 damage: each attack that damages a character adds 1, progress placed on it removes damage instead, and the players lose at 10.",
  ]);
  assert.ok(valid(s));
  // Hot-seat: the choice passes from the first player to the second.
  const seats = [
    { heroes: ["01005", "01006"], deckId: STARTERS[1].id },
    { heroes: ["01007", "01008"], deckId: STARTERS[2].id },
  ];
  let two = createGame(8, STARTERS[1].cards, seats[0].heroes, seats[0].deckId, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
    seats,
  });
  assert.equal(two.campaign!.kind, "angmar");
  assert.deepEqual(two.campaign!.seatHeroes, [2, 2]);
  two = choose(two, "skip");
  assert.match(two.choice!.title, /may place 4 damage/);
  two = choose(two, "damage");
  assert.equal(angmarInnocent(two)!.damage, 4);
  assert.deepEqual(
    seatView(two, 1).heroes.map((h) => h.resources),
    [1, 1],
  );
  assert.deepEqual(
    seatView(two, 0).heroes.map((h) => h.resources),
    [0, 0],
  );
  assert.ok(valid(two));
});

test("Protect the Innocent: an attack that damages a character adds 1 damage, progress removes damage instead and never defeats it, and the players lose at 10 (20 with three or four players)", () => {
  const s = calm(reload(opening(chetwood())));
  const quest = angmarInnocent(s)!;
  quest.damage = 0;
  const hero = s.heroes[0];
  damage(s, hero.id, 2, { combatDamage: true, enemyId: "enemy" });
  assert.equal(quest.damage, 1);
  damage(s, hero.id, 1, {});
  assert.equal(quest.damage, 1, "not an attack");
  quest.damage = 5;
  addQuestProgress(s, quest, 3);
  assert.equal(quest.damage, 2);
  assert.equal(quest.progress, 0);
  checkSideQuestDefeats(s);
  assert.ok(
    s.staging.some((u) => u.id === quest.id),
    "never defeated",
  );
  quest.damage = innocentLimit(s) - 1;
  damage(s, hero.id, 1, { combatDamage: true, enemyId: "enemy" });
  assert.equal(s.status, "lost");
  assert.match(s.reason, /Protect the Innocent has 10 damage/);
  const three = createGame(3, STARTERS[0].cards, ["01005"], STARTERS[0].id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
    seats: [0, 1, 2].map((i) => ({
      heroes: [["01005"], ["01006"], ["01007"]][i],
      deckId: STARTERS[i].id,
    })),
  });
  assert.equal(innocentLimit(three), 20);
});

test("Iârion's Pendant: its Response cancels a revealed card's when revealed effects or a shadow effect, and it goes to the victory display", () => {
  const s = calm(reload(opening(chetwood())));
  // A shadow effect just triggered.
  const options = angmarPendantShadowOptions(s, true);
  assert.equal(options.length, 1);
  assert.match(options[0].label, /cancel the shadow effect$/);
  // A treachery revealed from the encounter deck.
  s.encounterDeck.unshift(CHETWOOD.needs);
  s.queue.push({ kind: "reveal", player: 0 });
  flush(s);
  const window = s.choice!;
  const pendant = window.options.find((o) => o.code === ANGMAR.pendant)!;
  assert.ok(pendant, JSON.stringify(window.options.map((o) => o.label)));
  const t = choose(s, pendant.id);
  assert.ok(
    !t.allies.some((u) => u.attachments.some((a) => a.code === ANGMAR.pendant)),
  );
  assert.ok(t.victoryCards!.includes(ANGMAR.pendant));
  assert.ok(valid(t));
});

test("Intruders in Chetwood's resolution notes Protect the Innocent's damage and adds it to the Campaign Pool; the campaign continues once The Weather Hills is supported", () => {
  const s = calm(reload(opening(chetwood())));
  angmarInnocent(s)!.damage = 6;
  // A hero in its controller's discard pile is fallen.
  const fallen = s.heroes[0];
  s.heroes = s.heroes.filter((u) => u.id !== fallen.id);
  s.discard.push(fallen.code);
  win(s);
  const c = s.campaign!;
  assert.equal(c.innocent, 6);
  assert.deepEqual(c.burdens, [ANGMAR.innocent]);
  assert.deepEqual(c.fallen, [fallen.code]);
  assert.deepEqual(
    c.completed.map((q) => q.scenarioId),
    ["intruders-in-chetwood"],
  );
  assert.ok(valid(s));
  assert.throws(
    () => continueCampaign(s, HEROES, d.id, true, 9),
    /have not fallen/,
  );
  const next = HEROES.map((h) => (h === fallen.code ? "01007" : h));
  assert.throws(
    () => continueCampaign(s, next, d.id, true, 9),
    /not available in campaign mode yet/,
  );
});
