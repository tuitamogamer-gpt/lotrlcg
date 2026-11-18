import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { win } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { draw, fx, make } from "../src/game/core.ts";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";
import { ringBearer } from "../src/game/lotr-saga.ts";
import {
  GIFT_BOONS,
  OLD_MAN_WILLOW_DAMAGE,
  RING_BEARER_KEY,
  SAGA,
  sagaResolutionQuestions,
  SOUTH_BOONS,
} from "../src/game/saga-campaign.ts";
import { card } from "../src/game/cards.ts";
import { OF } from "../src/game/old-forest-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, context, report, url } from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/saga-campaign-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/saga-campaign-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const CAMPAIGN = "there-and-back-again.campaign.v1";
/** Evil Crow, a plain enemy of A Shadow of the Past. */
const CROW = "octgn:ff597a85-6a02-4301-a9dc-4dcb4cf9b626";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
let page;
const campaign = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), CAMPAIGN);
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
/** Load a campaign state into the campaign slot and open the table. */
async function load(s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid campaign fixture");
  await page.evaluate(
    ([key, state]) => {
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem("there-and-back-again.mode.v1", "campaign");
      localStorage.setItem("there-and-back-again.campaign-kind.v1", "saga");
      localStorage.removeItem("there-and-back-again.choices.v1");
    },
    [CAMPAIGN, s],
  );
  await page.reload();
  await page.locator("#start-btn").click();
  await reviewedState(page);
  return campaign();
}
/** Choose an option of the current choice dialog by its id. */
async function choose(id) {
  await reviewedState(page);
  const s = await campaign(),
    index = s.choice?.options.findIndex((o) => o.id === id) ?? -1;
  assert.ok(index >= 0, JSON.stringify(s.choice));
  const o = s.choice.options[index];
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((v) => v.label === o.label).length;
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: new RegExp(
        `^${o.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
      ),
    })
    .nth(occurrence)
    .click();
  await reviewedState(page);
  return campaign();
}
/** Keep the opening hand and reach the first action window (`pick` may answer a choice). */
async function opening(pick = () => undefined) {
  for (let i = 0; i < 200; i++) {
    await reviewedState(page);
    const s = await campaign();
    if (s?.choice)
      await choose(
        pick(s) ??
          s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      );
    else if (s?.phase === "setup")
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    else if (s && !s.queue.length && !s.flow?.pending) return s;
    else await page.waitForTimeout(25);
  }
  throw Error("The campaign opening did not finish");
}
/** The chapter is won (after `before` prepares the table): the Campaign Log is updated. */
async function victory(s, before = () => {}) {
  const t = structuredClone(s);
  Object.assign(t, { phase: "planning", choice: null, queue: [] });
  if (t.flow) t.flow.pending = null;
  before(t);
  win(t);
  return load(t);
}
async function record(answers) {
  for (const [label, value] of answers)
    await page.getByLabel(label).selectOption(value);
  await page
    .getByRole("button", { name: "Record the resolution", exact: false })
    .click();
  await reviewedState(page);
  return campaign();
}
/** Continue the campaign, choosing an optional chapter in the interlude. */
async function continueCampaign(chapter, width, before, pick) {
  await page.getByRole("button", { name: /^Continue campaign/ }).click();
  if (chapter) {
    await page
      .getByLabel("Next chapter", { exact: true })
      .selectOption(chapter);
    await checkpoint(`interlude-${chapter}`, width);
  }
  if (before) await before();
  await page.getByRole("button", { name: /^Begin next chapter/ }).click();
  await reviewedState(page);
  return opening(pick);
}
/** A table state at a calm planning window. */
function calmState(s) {
  const t = structuredClone(s);
  Object.assign(t, { phase: "planning", choice: null, queue: [] });
  if (t.flow) t.flow.pending = null;
  return t;
}
/** Play a card from hand through its Play card button. */
async function playFromHand(id) {
  await page
    .locator(`[data-motion-card="${id}"]`)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  const confirm = page
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true });
  await confirm.waitFor({ timeout: 3000 }).catch(() => {});
  if (await confirm.count()) await confirm.click();
  await reviewedState(page);
  return campaign();
}
/** The hero carrying a campaign attachment. */
const carrier = (s, code) =>
  s.heroes.find((h) => h.attachments.some((a) => a.code === code));
try {
  for (const width of [1280, 390, 320]) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    // A new Lord of the Rings campaign, started through the lobby.
    await page.evaluate((key) => {
      for (const k of [
        key,
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
      localStorage.setItem("there-and-back-again.mode.v1", "campaign");
    }, CAMPAIGN);
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Campaign", exact: true })
      .getByRole("button", { name: /The Lord of the Rings/ })
      .click();
    await page.locator("#start-btn").click();
    let s = await opening();
    assert.equal(s.scenarioId, "a-shadow-of-the-past");
    assert.equal(s.campaign.kind, "saga");
    // Gandalf's Delay: 5 cards, then the first resource phase draws 1.
    assert.equal(s.hand.length, 6, "Gandalf's Delay: 1 less card");
    assert.ok(s.staging.some((u) => u.code === SAGA.delay));
    assert.ok(
      s.heroes.some((h) =>
        h.attachments.some((a) => a.code === SAGA.underhill),
      ),
    );
    await checkpoint("shadow-setup", width);
    // Victory: A Shadow of the Past's resolution.
    s = await victory(s);
    assert.equal(s.campaign.resolution, "a-shadow-of-the-past");
    await page
      .locator("[data-saga-resolution='a-shadow-of-the-past']")
      .waitFor();
    await checkpoint("shadow-resolution", width);
    s = await record([
      [/Choose Gandalf's Delay or The Ring Draws Them/, SAGA.ringDraws],
      [/choose Gildor Inglorion or Mr\. Underhill/, SAGA.underhill],
    ]);
    assert.deepEqual(s.campaign.burdens, [SAGA.ringDraws]);
    assert.deepEqual(s.campaign.permanent, {
      [RING_BEARER_KEY]: [SAGA.underhill],
    });
    await checkpoint("shadow-journal", width);
    // The Old Forest (Part 1.1), chosen in the interlude: the first player
    // attaches Old Bogey-stories to a hero in play.
    s = await continueCampaign("the-old-forest", width);
    assert.equal(s.scenarioId, "the-old-forest");
    assert.ok(carrier(s, SAGA.bogey), "Old Bogey-stories is attached");
    await checkpoint("forest-setup", width);
    // 12 damage on Old Man Willow earn Old Bogey-stories.
    s = await victory(s, (t) => {
      const willow = make(t, OF.willow);
      willow.damage = OLD_MAN_WILLOW_DAMAGE;
      t.staging.push(willow);
    });
    assert.ok(s.campaign.boons.includes(SAGA.bogey));
    await page
      .locator(".campaign-pool")
      .getByRole("button", { name: "Old Bogey-stories" })
      .waitFor();
    await checkpoint("forest-journal", width);
    // Fog on the Barrow-downs (Part 1.2): it earns Ho! Tom Bombadil!.
    s = await continueCampaign("fog-on-the-barrow-downs", width);
    assert.equal(s.scenarioId, "fog-on-the-barrow-downs");
    assert.ok(carrier(s, SAGA.bogey), "the earned Old Bogey-stories");
    await checkpoint("fog-setup", width);
    s = await victory(s);
    assert.ok(s.campaign.boons.includes(SAGA.tom));
    await page
      .locator(".campaign-pool")
      .getByRole("button", { name: "Ho! Tom Bombadil!" })
      .waitFor();
    await checkpoint("fog-journal", width);
    // A Knife in the Dark: the Campaign Pool carries forward.
    s = await continueCampaign();
    assert.equal(s.scenarioId, "a-knife-in-the-dark");
    assert.equal(
      s.hand.length,
      8,
      "6 cards, Ho! Tom Bombadil! and the resource phase's draw",
    );
    assert.ok(s.hand.some((u) => u.code === SAGA.tom));
    assert.ok(s.encounterDeck.includes(SAGA.ringDraws));
    assert.ok(carrier(s, SAGA.underhill));
    assert.ok(carrier(s, SAGA.bogey));
    await checkpoint("knife-setup", width);
    // Ho! Tom Bombadil! cancels the when revealed effects of The Ring Draws Them.
    const reveal = structuredClone(s);
    Object.assign(reveal, { phase: "quest", choice: null, queue: [] });
    if (reveal.flow) reveal.flow.pending = null;
    reveal.encounterDeck.unshift(SAGA.ringDraws, CROW);
    reveal.queue.push(fx("reveal", { player: 0 }));
    flush(reveal);
    // A guided game first presents the revealed card, then the Response.
    assert.ok(reveal.choice || reveal.flow?.pending, "the reveal waits");
    s = await load(reveal);
    assert.match(s.choice?.title ?? "", /^Revealed: The Ring Draws Them/);
    await checkpoint("tom-response", width);
    s = await choose(s.choice.options.find((o) => o.code === SAGA.tom).id);
    for (let i = 0; i < 10 && s.choice; i++)
      s = await choose(s.choice.options[0].id);
    assert.ok(s.victoryCards.includes(SAGA.tom));
    // Recorded in the Campaign Log when A Knife in the Dark is won.
    assert.deepEqual(s.sagaCards.spent, [SAGA.tom]);
    assert.ok(!s.sagaCards?.ringDraws, "the when revealed effect is canceled");
    s = await victory(s);
    await page
      .locator("[data-saga-resolution='a-knife-in-the-dark']")
      .waitFor();
    const hero = s.heroes.find(
      (h) =>
        !h.attachments.some((a) =>
          [SAGA.underhill, SAGA.bogey].includes(a.code),
        ),
    );
    s = await record([
      [/choose a boon to attach/, `${SAGA.ranger}@${hero.code}`],
    ]);
    assert.deepEqual(s.campaign.permanent[hero.code], [SAGA.ranger]);
    assert.ok(!s.campaign.boons.includes(SAGA.tom));
    await checkpoint("knife-resolution", width);
    // Flight to the Ford: Tireless Ranger stays with its hero.
    s = await continueCampaign();
    assert.equal(s.scenarioId, "flight-to-the-ford");
    assert.ok(
      s.heroes
        .find((h) => h.code === hero.code)
        .attachments.some((a) => a.code === SAGA.ranger),
    );
    await checkpoint("ford-setup", width);
    // The campaign card's Response cancels an attack with the top burden.
    const attack = structuredClone(s);
    Object.assign(attack, { phase: "defense", choice: null, queue: [] });
    if (attack.flow) attack.flow.pending = null;
    const crow = make(attack, CROW);
    attack.engaged.push(crow);
    attack.queue.push(fx("immediateAttack", { target: crow.id, player: 0 }));
    flush(attack);
    assert.match(attack.choice.title, /^Flight to the Ford · Campaign/);
    const burdens = attack.flightFord.burdens.length;
    s = await load(attack);
    await checkpoint("ford-response", width);
    s = await choose("cancel");
    assert.equal(s.flightFord.burdens.length, burdens - 1);
    // The resolution earns the burdens.
    s = await victory(s);
    assert.equal(s.campaign.resolution, null);
    assert.ok(s.campaign.burdens.length >= 2);
    await checkpoint("ford-complete", width);
    // The Road Darkens: The Ring Goes South's campaign card earns Sting,
    // Mithril Shirt, Glamdring and Andúril; one joins the hand.
    s = await continueCampaign();
    assert.equal(s.scenarioId, "the-ring-goes-south");
    for (const code of SOUTH_BOONS) assert.ok(s.campaign.boons.includes(code));
    assert.ok(s.hand.some((u) => u.code === SAGA.sting));
    assert.equal(s.campaign.threatPenalty, 0);
    await checkpoint("south-setup", width);
    s = await victory(s);
    assert.equal(s.campaign.resolution, null);
    // Journey in the Dark: the interlude assigns the earned boons to decks.
    s = await continueCampaign(undefined, width, async () => {
      await page
        .getByLabel("Mithril Shirt: deck", { exact: true })
        .selectOption("");
      await checkpoint("dark-interlude", width);
    });
    assert.equal(s.scenarioId, "journey-in-the-dark");
    assert.ok(s.staging.some((u) => u.code === SAGA.wound));
    assert.ok(s.staging.some((u) => u.code === SAGA.grief));
    assert.ok(!s.deck.includes(SAGA.mithril));
    assert.ok(
      [SAGA.glamdring, SAGA.anduril].every(
        (code) => s.deck.includes(code) || s.hand.some((u) => u.code === code),
      ),
    );
    await checkpoint("dark-setup", width);
    s = await victory(s);
    await page
      .locator("[data-saga-resolution='journey-in-the-dark']")
      .waitFor();
    await checkpoint("dark-resolution", width);
    s = await record([
      [/burden treachery cards/, SAGA.shadowFear],
      [/burden objective cards/, SAGA.grief],
    ]);
    assert.ok(s.campaign.burdens.includes(SAGA.shadowFear));
    assert.ok(s.campaign.burdens.includes(SAGA.grief));
    // Breaking of the Fellowship: a Gift of Lórien for a hero.
    s = await continueCampaign();
    assert.equal(s.scenarioId, "breaking-of-the-fellowship");
    assert.ok(GIFT_BOONS.some((code) => carrier(s, code)));
    assert.ok(GIFT_BOONS.some((code) => s.campaign.boons.includes(code)));
    await checkpoint("breaking-setup", width);
    s = await victory(s);
    await page
      .locator("[data-saga-resolution='breaking-of-the-fellowship']")
      .waitFor();
    await checkpoint("breaking-resolution", width);
    const captive = s.heroes.find(
      (h) => !["Aragorn", "Frodo Baggins"].includes(card(h.code).name),
    );
    s = await record([
      [/Followed by Night or Ill Fate/, SAGA.illFate],
      [/taken captive/, captive.code],
    ]);
    assert.ok(s.campaign.burdens.includes(SAGA.illFate));
    assert.deepEqual(s.campaign.captives, [captive.code]);
    await page
      .getByText(/Notes · captives/)
      .first()
      .waitFor();
    await checkpoint("breaking-complete", width);
    // The Treason of Saruman: The Uruk-hai takes its captive from the log.
    s = await continueCampaign();
    assert.equal(s.scenarioId, "the-uruk-hai");
    assert.ok(!s.campaign.boons.includes(SAGA.underhill));
    assert.deepEqual(
      s.urukHai.captives.map((c) => c.unit.code),
      [captive.code],
    );
    await checkpoint("uruk-setup", width);
    s = await victory(s);
    await page.locator("[data-saga-resolution='the-uruk-hai']").waitFor();
    await checkpoint("uruk-resolution", width);
    const skill = sagaResolutionQuestions(s)
      .find((q) => q.id === "skill:0")
      .options.find((o) => o.id !== "none");
    s = await record([[/Skill boons ·/, skill.id]]);
    const [skillCode, skillHero] = skill.id.split("@");
    assert.ok(s.campaign.permanent[skillHero].includes(skillCode));
    // Helm's Deep and The Road to Isengard.
    s = await continueCampaign();
    assert.equal(s.scenarioId, "helms-deep");
    await checkpoint("helm-setup", width);
    s = await victory(s);
    s = await continueCampaign();
    assert.equal(s.scenarioId, "the-road-to-isengard");
    assert.ok(s.encounterDeck.includes(SAGA.voice));
    await checkpoint("isengard-setup", width);
    s = await victory(s);
    assert.ok(s.campaign.boons.includes(SAGA.palantir));
    await checkpoint("isengard-complete", width);
    // The Land of Shadow. The Passage of the Marshes: no card titled Aragorn
    // (the interlude fills his slot) and hero changes without the penalty.
    const penalty = s.campaign.threatPenalty;
    s = await continueCampaign(undefined, width, async () => {
      await page
        .getByText(/lets each player change heroes without the \+1 threat/)
        .waitFor();
      await checkpoint("marshes-interlude", width);
    });
    assert.equal(s.scenarioId, "the-passage-of-the-marshes");
    assert.ok(!s.campaign.heroes.some((h) => card(h).name === "Aragorn"));
    assert.equal(s.campaign.threatPenalty, penalty);
    assert.ok(!s.encounterDeck.includes(SAGA.voice));
    assert.ok(
      [...s.deck, ...s.discard, ...s.hand.map((u) => u.code)].includes(
        SAGA.searchingEye,
      ),
    );
    await checkpoint("marshes-setup", width);
    // The Searching Eye, drawn: exhaust each hero or reveal a card.
    const eye = calmState(s);
    eye.deck = eye.deck.filter((c) => c !== SAGA.searchingEye);
    eye.discard = eye.discard.filter((c) => c !== SAGA.searchingEye);
    eye.hand = eye.hand.filter((u) => u.code !== SAGA.searchingEye);
    eye.deck.unshift(SAGA.searchingEye);
    for (const h of eye.heroes) h.exhausted = false;
    draw(eye, 1);
    flush(eye);
    assert.match(eye.choice.title, /^The Searching Eye/);
    s = await load(eye);
    await checkpoint("marshes-searching-eye", width);
    s = await choose("exhaust");
    assert.ok(s.heroes.every((h) => h.exhausted));
    assert.ok(s.discard.includes(SAGA.searchingEye));
    // The resolution: a permanent +2 starting threat penalty.
    s = await victory(s);
    await page
      .locator("[data-saga-resolution='the-passage-of-the-marshes']")
      .waitFor();
    await checkpoint("marshes-resolution", width);
    s = await record([
      [/either take a permanent \+2 starting threat penalty/, "penalty"],
    ]);
    assert.deepEqual(s.campaign.playerPenalty, [2]);
    await page
      .getByText(/Personal starting threat penalties/)
      .first()
      .waitFor();
    // Journey to the Cross-roads: a copy of Brace of Coneys for the deck.
    s = await continueCampaign(undefined, width, undefined, (t) =>
      /^Journey to the Cross-roads/.test(t.choice.title) ? "coneys" : undefined,
    );
    assert.equal(s.scenarioId, "journey-to-the-cross-roads");
    assert.deepEqual(s.sagaCards.coneys, [0]);
    await checkpoint("crossroads-setup", width);
    // Brace of Coneys: a Planning Action of the Ring-bearer's controller.
    const meal = calmState(s);
    meal.deck = meal.deck.filter((c) => c !== SAGA.coneys);
    meal.discard = meal.discard.filter((c) => c !== SAGA.coneys);
    meal.hand = meal.hand.filter((u) => u.code !== SAGA.coneys);
    const coneys = make(meal, SAGA.coneys);
    coneys.owner = 0;
    meal.hand.push(coneys);
    await load(meal);
    s = await playFromHand(coneys.id);
    assert.match(
      s.choice.title,
      /^Brace of Coneys · Choose an effect \(1 of 2\)/,
    );
    await checkpoint("crossroads-coneys", width);
    s = await choose("draw");
    s = await choose("threat");
    assert.ok(s.victoryCards.includes(SAGA.coneys));
    // The resolution earns the copy and notes the enemies under the Gate.
    s = await victory(s, (t) => {
      const harad = t.encounterDeck.find((c) => card(c).type_code === "enemy");
      t.crossRoads.underBlackGate = [harad, harad];
    });
    assert.deepEqual(s.campaign.boonCopies, { [SAGA.coneys]: [0] });
    assert.equal(s.campaign.blackGateEnemies.length, 2);
    await page
      .getByText(/Notes · under The Black Gate/)
      .first()
      .waitFor();
    await checkpoint("crossroads-complete", width);
    // Shelob's Lair: the earned copy's deck, and A Heavy Burden.
    s = await continueCampaign(undefined, width, async () => {
      await page
        .getByLabel("Brace of Coneys (copy 1): deck", { exact: true })
        .selectOption("0");
      await checkpoint("shelob-interlude", width);
    });
    assert.equal(s.scenarioId, "shelobs-lair");
    assert.ok(
      ringBearer(s).attachments.some((a) => a.code === SAGA.heavy),
      "A Heavy Burden on the Ring-bearer",
    );
    assert.ok(
      [
        ...s.deck,
        ...s.discard,
        ...s.hand.map((u) => u.code),
        ...(s.victoryCards ?? []),
      ].includes(SAGA.coneys),
    );
    await checkpoint("shelob-setup", width);
    const heavy = calmState(s);
    ringBearer(heavy).exhausted = false;
    heavy.queue.push(fx("sagaHeavyBurden", { player: 0 }));
    flush(heavy);
    assert.match(heavy.choice.title, /^A Heavy Burden/);
    s = await load(heavy);
    await checkpoint("shelob-heavy-burden", width);
    s = await choose("exhaust");
    assert.ok(ringBearer(s).exhausted);
    s = await victory(s);
    assert.ok(s.campaign.burdens.includes(SAGA.heavy));
    await page.getByText(/is not available in campaign mode yet/).waitFor();
    await checkpoint("shelob-complete", width);
    assert.ok(ringBearer);
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const a of art) {
    const r = await p.request.get(new URL(a.localPath, url).href);
    assert.equal(r.status(), 200);
    const bytes = await r.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const size = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const size = { width: b.width, height: b.height };
        b.close();
        return size;
      },
      [...bytes],
    );
    assert.ok(size.width > 0 && size.height > 0);
    artwork.push({ ...a, ...size });
  }
  await p.close();
  await report(dir, {
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
    artwork,
  });
  console.log(
    `The Lord of the Rings campaign browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
    await fs.writeFile(
      `${dir}/failure.json`,
      JSON.stringify(
        {
          error: String(error),
          stack: error.stack,
          state: await campaign().catch(() => null),
          errors,
          checks,
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
